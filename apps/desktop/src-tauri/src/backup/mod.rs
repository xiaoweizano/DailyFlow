use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    io::{ErrorKind, Write},
    path::PathBuf,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{
    params_from_iter,
    types::{Value as SqlValue, ValueRef},
    Connection, Transaction, TransactionBehavior,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;
use uuid::Uuid;

use crate::{
    attachments::AttachmentStore,
    db::{Database, StorageError},
};

pub const BACKUP_DATA_SCHEMA_VERSION: i64 = 1;
const MAX_BACKUP_FILE_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupDatasetRows {
    pub journals: Vec<Map<String, Value>>,
    pub journal_versions: Vec<Map<String, Value>>,
    pub structured_blocks: Vec<Map<String, Value>>,
    pub knowledge_items: Vec<Map<String, Value>>,
    pub knowledge_links: Vec<Map<String, Value>>,
    pub tasks: Vec<Map<String, Value>>,
    pub tags: Vec<Map<String, Value>>,
    pub journal_tags: Vec<Map<String, Value>>,
    pub knowledge_tags: Vec<Map<String, Value>>,
    pub reports: Vec<Map<String, Value>>,
    pub import_sessions: Vec<Map<String, Value>>,
    pub import_entries: Vec<Map<String, Value>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupAttachmentRecord {
    pub link: Map<String, Value>,
    pub blob: Map<String, Value>,
    pub bytes_base64: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSnapshot {
    pub device_id: String,
    pub data_schema_version: i64,
    pub app_version: String,
    pub attachments: Vec<BackupAttachmentRecord>,
    #[serde(flatten)]
    pub dataset: BackupDatasetRows,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRestoreInput {
    pub expected_content_digest: String,
    pub data_schema_version: i64,
    pub restored_at: String,
    pub dataset: BackupDatasetRows,
    pub attachments: Vec<BackupAttachmentRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSafetySnapshot {
    pub file_name: String,
    pub content_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRestoreResult {
    pub restored_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_snapshot: Option<BackupSafetySnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupReadFileResult {
    pub bytes_base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupWriteFileInput {
    pub target_path: String,
    pub bytes_base64: String,
    pub expected_sha256: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupWriteFileResult {
    pub bytes_written: u64,
}

#[derive(Clone, Copy)]
enum ColumnKind {
    Id,
    Text,
    Integer,
    JsonObject,
    Hash,
    RawBytes,
}

#[derive(Clone, Copy)]
struct ColumnSpec {
    json_name: &'static str,
    sql_name: &'static str,
    kind: ColumnKind,
    nullable: bool,
}

const fn id(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::Id,
        nullable: false,
    }
}

const fn text(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::Text,
        nullable: false,
    }
}

const fn nullable_text(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::Text,
        nullable: true,
    }
}

const fn integer(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::Integer,
        nullable: false,
    }
}

const fn nullable_integer(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::Integer,
        nullable: true,
    }
}

const fn json_object(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::JsonObject,
        nullable: false,
    }
}

const fn nullable_json_object(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::JsonObject,
        nullable: true,
    }
}

const fn hash(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::Hash,
        nullable: false,
    }
}

const fn nullable_hash(json_name: &'static str, sql_name: &'static str) -> ColumnSpec {
    ColumnSpec {
        json_name,
        sql_name,
        kind: ColumnKind::Hash,
        nullable: true,
    }
}

const JOURNAL_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    text("journalDate", "journal_date"),
    text("timezone", "timezone"),
    text("title", "title"),
    json_object("contentJson", "content_json"),
    text("contentMarkdown", "content_markdown"),
    text("contentPlainText", "content_plain_text"),
    integer("editorSchemaVersion", "editor_schema_version"),
    integer("projectionVersion", "projection_version"),
    hash("contentHash", "content_hash"),
    text("excerpt", "excerpt"),
    text("status", "status"),
    integer("revision", "revision"),
    text("createdAt", "created_at"),
    text("updatedAt", "updated_at"),
    nullable_text("deletedAt", "deleted_at"),
];

const JOURNAL_VERSION_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    id("journalId", "journal_id"),
    integer("revision", "revision"),
    text("title", "title"),
    json_object("contentJson", "content_json"),
    text("contentMarkdown", "content_markdown"),
    text("contentPlainText", "content_plain_text"),
    integer("editorSchemaVersion", "editor_schema_version"),
    integer("projectionVersion", "projection_version"),
    hash("contentHash", "content_hash"),
    text("changeSource", "change_source"),
    text("createdAt", "created_at"),
];

const STRUCTURED_BLOCK_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    id("journalId", "journal_id"),
    text("blockType", "block_type"),
    integer("schemaVersion", "schema_version"),
    json_object("dataJson", "data_json"),
    text("orderKey", "order_key"),
    text("renderedText", "rendered_text"),
    text("createdAt", "created_at"),
    text("updatedAt", "updated_at"),
    nullable_text("deletedAt", "deleted_at"),
];

const KNOWLEDGE_ITEM_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    text("kind", "kind"),
    text("status", "status"),
    text("title", "title"),
    json_object("contentJson", "content_json"),
    text("contentMarkdown", "content_markdown"),
    text("contentPlainText", "content_plain_text"),
    integer("editorSchemaVersion", "editor_schema_version"),
    integer("projectionVersion", "projection_version"),
    hash("contentHash", "content_hash"),
    text("summary", "summary"),
    integer("revision", "revision"),
    nullable_text("sourceJournalId", "source_journal_id"),
    nullable_text("sourceBlockId", "source_block_id"),
    text("createdAt", "created_at"),
    text("updatedAt", "updated_at"),
    nullable_text("deletedAt", "deleted_at"),
];

const KNOWLEDGE_LINK_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    id("sourceItemId", "source_item_id"),
    id("targetItemId", "target_item_id"),
    text("relationType", "relation_type"),
    text("createdAt", "created_at"),
];

const TASK_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    text("title", "title"),
    nullable_json_object("descriptionJson", "description_json"),
    text("descriptionText", "description_text"),
    text("status", "status"),
    text("priority", "priority"),
    nullable_text("dueDate", "due_date"),
    nullable_text("completedAt", "completed_at"),
    nullable_text("journalId", "journal_id"),
    nullable_text("knowledgeItemId", "knowledge_item_id"),
    integer("revision", "revision"),
    text("createdAt", "created_at"),
    text("updatedAt", "updated_at"),
    nullable_text("deletedAt", "deleted_at"),
];

const TAG_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    text("name", "name"),
    text("nameNormalized", "name_normalized"),
    nullable_text("color", "color"),
    text("createdAt", "created_at"),
    text("updatedAt", "updated_at"),
];

const JOURNAL_TAG_COLUMNS: &[ColumnSpec] = &[id("journalId", "journal_id"), id("tagId", "tag_id")];

const KNOWLEDGE_TAG_COLUMNS: &[ColumnSpec] = &[
    id("knowledgeItemId", "knowledge_item_id"),
    id("tagId", "tag_id"),
];

const REPORT_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    text("periodType", "period_type"),
    text("periodStart", "period_start"),
    text("periodEnd", "period_end"),
    text("timezone", "timezone"),
    text("title", "title"),
    json_object("contentJson", "content_json"),
    text("contentMarkdown", "content_markdown"),
    text("contentPlainText", "content_plain_text"),
    integer("editorSchemaVersion", "editor_schema_version"),
    integer("projectionVersion", "projection_version"),
    json_object("statsJson", "stats_json"),
    text("generatedBy", "generated_by"),
    nullable_text("sourceWatermark", "source_watermark"),
    integer("revision", "revision"),
    text("createdAt", "created_at"),
    text("updatedAt", "updated_at"),
    nullable_text("deletedAt", "deleted_at"),
];

const IMPORT_SESSION_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    text("rootLabel", "root_label"),
    text("status", "status"),
    json_object("optionsJson", "options_json"),
    integer("revision", "revision"),
    integer("scannedCount", "scanned_count"),
    integer("readyCount", "ready_count"),
    integer("importedCount", "imported_count"),
    integer("skippedCount", "skipped_count"),
    integer("conflictCount", "conflict_count"),
    integer("invalidCount", "invalid_count"),
    text("createdAt", "created_at"),
    nullable_text("completedAt", "completed_at"),
    nullable_text("errorSummary", "error_summary"),
];

const IMPORT_ENTRY_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    id("sessionId", "session_id"),
    text("relativePath", "relative_path"),
    text("originalFileName", "original_file_name"),
    nullable_text("detectedDate", "detected_date"),
    text("encoding", "encoding"),
    text("newlineStyle", "newline_style"),
    nullable_hash("fileSha256", "file_sha256"),
    nullable_integer("rawSize", "raw_size"),
    text("rawCaptureStatus", "raw_capture_status"),
    ColumnSpec {
        json_name: "rawBytesBase64",
        sql_name: "raw_bytes",
        kind: ColumnKind::RawBytes,
        nullable: true,
    },
    nullable_text("rawCleanedAt", "raw_cleaned_at"),
    text("status", "status"),
    nullable_text("conflictKind", "conflict_kind"),
    nullable_text("errorCode", "error_code"),
    nullable_text("errorDetail", "error_detail"),
    nullable_text("journalId", "journal_id"),
    nullable_integer("previousJournalRevision", "previous_journal_revision"),
    text("createdAt", "created_at"),
    nullable_text("committedAt", "committed_at"),
];

const ATTACHMENT_BLOB_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    hash("sha256", "sha256"),
    integer("byteSize", "byte_size"),
    text("mimeType", "mime_type"),
    text("storageKind", "storage_kind"),
    text("storageKey", "storage_key"),
    text("createdAt", "created_at"),
    nullable_text("orphanedAt", "orphaned_at"),
];

const PORTABLE_ATTACHMENT_BLOB_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    hash("sha256", "sha256"),
    integer("byteSize", "byte_size"),
    text("mimeType", "mime_type"),
    text("createdAt", "created_at"),
    nullable_text("orphanedAt", "orphaned_at"),
];

const ATTACHMENT_LINK_COLUMNS: &[ColumnSpec] = &[
    id("id", "id"),
    id("blobId", "blob_id"),
    text("ownerType", "owner_type"),
    id("ownerId", "owner_id"),
    text("displayName", "display_name"),
    text("altText", "alt_text"),
    integer("isInline", "is_inline"),
    integer("sortOrder", "sort_order"),
    text("createdAt", "created_at"),
    nullable_text("deletedAt", "deleted_at"),
];

pub fn create_snapshot(
    database: &Database,
    attachment_store: &AttachmentStore,
) -> Result<BackupSnapshot, StorageError> {
    database.with_connection(|connection| {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let device_id = read_or_create_device_id(&transaction)?;
        let dataset = BackupDatasetRows {
            journals: read_table(&transaction, "journals", "ORDER BY id")?,
            journal_versions: read_table(&transaction, "journal_versions", "ORDER BY id")?,
            structured_blocks: read_table(&transaction, "structured_blocks", "ORDER BY id")?,
            knowledge_items: read_table(&transaction, "knowledge_items", "ORDER BY id")?,
            knowledge_links: read_table(&transaction, "knowledge_links", "ORDER BY id")?,
            tasks: read_table(&transaction, "tasks", "ORDER BY id")?,
            tags: read_table(&transaction, "tags", "ORDER BY id")?,
            journal_tags: read_table(&transaction, "journal_tags", "ORDER BY journal_id, tag_id")?,
            knowledge_tags: read_table(
                &transaction,
                "knowledge_tags",
                "ORDER BY knowledge_item_id, tag_id",
            )?,
            reports: read_table(&transaction, "reports", "ORDER BY id")?,
            import_sessions: read_table(&transaction, "import_sessions", "ORDER BY id")?,
            import_entries: read_table(&transaction, "import_entries", "ORDER BY id")?,
        };
        let attachments = read_attachments(&transaction, attachment_store)?;
        transaction.commit()?;

        Ok(BackupSnapshot {
            device_id,
            data_schema_version: BACKUP_DATA_SCHEMA_VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_owned(),
            dataset,
            attachments,
        })
    })
}

pub fn restore_backup(
    database: &Database,
    attachment_store: &AttachmentStore,
    input: BackupRestoreInput,
) -> Result<BackupRestoreResult, StorageError> {
    validate_restore_input(&input)?;
    let attachments = prepare_attachment_staging(attachment_store, &input.attachments)?;
    let safety_snapshot = create_safety_snapshot_if_needed(database, attachment_store)?;
    let mut staged = attachments;

    let result = database.with_connection(|connection| {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        clear_business_data(&transaction)?;

        insert_table(
            &transaction,
            "journals",
            JOURNAL_COLUMNS,
            &input.dataset.journals,
        )?;
        insert_table(
            &transaction,
            "journal_versions",
            JOURNAL_VERSION_COLUMNS,
            &input.dataset.journal_versions,
        )?;
        insert_table(
            &transaction,
            "structured_blocks",
            STRUCTURED_BLOCK_COLUMNS,
            &input.dataset.structured_blocks,
        )?;
        insert_table(
            &transaction,
            "knowledge_items",
            KNOWLEDGE_ITEM_COLUMNS,
            &input.dataset.knowledge_items,
        )?;
        insert_table(
            &transaction,
            "knowledge_links",
            KNOWLEDGE_LINK_COLUMNS,
            &input.dataset.knowledge_links,
        )?;
        insert_table(&transaction, "tasks", TASK_COLUMNS, &input.dataset.tasks)?;
        insert_table(&transaction, "tags", TAG_COLUMNS, &input.dataset.tags)?;
        insert_table(
            &transaction,
            "journal_tags",
            JOURNAL_TAG_COLUMNS,
            &input.dataset.journal_tags,
        )?;
        insert_table(
            &transaction,
            "knowledge_tags",
            KNOWLEDGE_TAG_COLUMNS,
            &input.dataset.knowledge_tags,
        )?;
        insert_table(
            &transaction,
            "import_sessions",
            IMPORT_SESSION_COLUMNS,
            &input.dataset.import_sessions,
        )?;
        insert_table(
            &transaction,
            "import_entries",
            IMPORT_ENTRY_COLUMNS,
            &input.dataset.import_entries,
        )?;
        insert_table(
            &transaction,
            "reports",
            REPORT_COLUMNS,
            &input.dataset.reports,
        )?;

        let attachment_rows = attachment_database_rows(&input.attachments)?;
        insert_table_unchecked(
            &transaction,
            "attachment_blobs",
            ATTACHMENT_BLOB_COLUMNS,
            &attachment_rows.blobs,
        )?;
        insert_table_unchecked(
            &transaction,
            "attachment_links",
            ATTACHMENT_LINK_COLUMNS,
            &attachment_rows.links,
        )?;

        transaction.execute(
            "INSERT INTO app_metadata (key, value_json, updated_at)
             VALUES ('search_index_state', '\"stale\"', ?1)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at",
            [&input.restored_at],
        )?;

        staged.finalize()?;
        transaction.commit()?;
        Ok(())
    });

    match result {
        Ok(()) => {
            staged.mark_committed();
            Ok(BackupRestoreResult {
                restored_at: input.restored_at,
                safety_snapshot,
            })
        }
        Err(error) => Err(error),
    }
}

pub fn read_backup_file(source_path: &str) -> Result<BackupReadFileResult, StorageError> {
    let path = validate_absolute_file_path(source_path, "sourcePath")?;
    let metadata = fs::metadata(&path).map_err(|error| {
        StorageError::storage(format!("failed to inspect backup source file: {error}"))
    })?;
    if !metadata.is_file() {
        return Err(StorageError::validation(
            "sourcePath must reference a regular file",
        ));
    }
    if metadata.len() > MAX_BACKUP_FILE_BYTES {
        return Err(StorageError::validation(
            "Backup source file exceeds the 4 GB limit",
        ));
    }
    let bytes = fs::read(path)
        .map_err(|error| StorageError::storage(format!("failed to read backup file: {error}")))?;
    Ok(BackupReadFileResult {
        bytes_base64: STANDARD.encode(bytes),
    })
}

pub fn write_backup_file(
    input: BackupWriteFileInput,
) -> Result<BackupWriteFileResult, StorageError> {
    validate_sha256(&input.expected_sha256, "expectedSha256")?;
    let bytes = decode_base64(&input.bytes_base64, "bytesBase64")?;
    if bytes.len() as u64 > MAX_BACKUP_FILE_BYTES {
        return Err(StorageError::validation(
            "Backup output exceeds the 4 GB limit",
        ));
    }
    if sha256_hex(&bytes) != input.expected_sha256 {
        return Err(StorageError::validation(
            "expectedSha256 does not match decoded backup bytes",
        ));
    }

    let target = validate_absolute_file_path(&input.target_path, "targetPath")?;
    match fs::symlink_metadata(&target) {
        Ok(_) => return Err(StorageError::conflict("targetPath already exists")),
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(StorageError::storage(format!(
                "failed to inspect targetPath: {error}"
            )))
        }
    }
    let parent = target
        .parent()
        .ok_or_else(|| StorageError::validation("targetPath must include a parent directory"))?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| {
        StorageError::storage(format!("failed to create temporary backup file: {error}"))
    })?;
    temporary.write_all(&bytes).map_err(|error| {
        StorageError::storage(format!("failed to write temporary backup file: {error}"))
    })?;
    temporary.flush().map_err(|error| {
        StorageError::storage(format!("failed to flush temporary backup file: {error}"))
    })?;
    temporary.as_file().sync_all().map_err(|error| {
        StorageError::storage(format!("failed to sync temporary backup file: {error}"))
    })?;
    let written = fs::read(temporary.path()).map_err(|error| {
        StorageError::storage(format!("failed to verify temporary backup file: {error}"))
    })?;
    if sha256_hex(&written) != input.expected_sha256 {
        return Err(StorageError::validation(
            "temporary backup file failed SHA-256 verification",
        ));
    }
    temporary.persist_noclobber(&target).map_err(|error| {
        if error.error.kind() == ErrorKind::AlreadyExists {
            StorageError::conflict("targetPath already exists")
        } else {
            StorageError::storage(format!("failed to commit backup file: {}", error.error))
        }
    })?;
    Ok(BackupWriteFileResult {
        bytes_written: bytes.len() as u64,
    })
}

fn read_or_create_device_id(connection: &Connection) -> Result<String, StorageError> {
    let existing = connection
        .query_row(
            "SELECT value_json FROM app_metadata WHERE key = 'deviceId'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if let Some(value_json) = existing {
        let value: String = serde_json::from_str(&value_json)?;
        if validate_uuid_v7(&value).is_ok() {
            return Ok(value);
        }
    }

    let device_id = Uuid::now_v7().to_string();
    connection.execute(
        "INSERT INTO app_metadata (key, value_json, updated_at)
         VALUES ('deviceId', ?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
        [serde_json::to_string(&device_id)?],
    )?;
    Ok(device_id)
}

fn read_table(
    connection: &Connection,
    table: &str,
    order_by: &str,
) -> Result<Vec<Map<String, Value>>, StorageError> {
    let mut statement = connection.prepare(&format!("SELECT * FROM {table} {order_by}"))?;
    let column_names = statement
        .column_names()
        .into_iter()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let mut result = Vec::new();
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let mut output = Map::new();
        for (index, column) in column_names.iter().enumerate() {
            let json_name = if table == "import_entries" && column == "raw_bytes" {
                "rawBytesBase64".to_owned()
            } else {
                snake_to_camel(column)
            };
            output.insert(json_name, sql_ref_to_json(row.get_ref(index)?)?);
        }
        result.push(output);
    }
    Ok(result)
}

fn read_attachments(
    connection: &Connection,
    attachment_store: &AttachmentStore,
) -> Result<Vec<BackupAttachmentRecord>, StorageError> {
    let links = read_table(connection, "attachment_links", "ORDER BY id")?;
    let blobs = read_table(connection, "attachment_blobs", "ORDER BY id")?
        .into_iter()
        .map(|blob| {
            let id = required_text(&blob, "id", "attachment blob id")?.to_owned();
            Ok((id, blob))
        })
        .collect::<Result<HashMap<_, _>, StorageError>>()?;

    links
        .into_iter()
        .map(|link| {
            let blob_id = required_text(&link, "blobId", "attachment blobId")?;
            let mut blob = blobs
                .get(blob_id)
                .cloned()
                .ok_or_else(|| StorageError::validation("Attachment blob is missing"))?;
            let storage_key = required_text(&blob, "storageKey", "attachment storageKey")?;
            let bytes = fs::read(attachment_store.resolve_path(storage_key)?).map_err(|error| {
                StorageError::storage(format!("failed to read attachment backup bytes: {error}"))
            })?;
            let expected_hash = required_text(&blob, "sha256", "attachment sha256")?;
            if sha256_hex(&bytes) != expected_hash {
                return Err(StorageError::storage(
                    "Stored attachment content hash does not match metadata",
                ));
            }
            blob.remove("storageKind");
            blob.remove("storageKey");
            Ok(BackupAttachmentRecord {
                link,
                blob,
                bytes_base64: STANDARD.encode(bytes),
            })
        })
        .collect()
}

fn sql_ref_to_json(value: ValueRef<'_>) -> Result<Value, StorageError> {
    Ok(match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::Number(Number::from(value)),
        ValueRef::Real(value) => Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(value) => Value::String(
            std::str::from_utf8(value)
                .map_err(|error| {
                    StorageError::storage(format!("SQLite text is not valid UTF-8: {error}"))
                })?
                .to_owned(),
        ),
        ValueRef::Blob(value) => Value::String(STANDARD.encode(value)),
    })
}

fn snake_to_camel(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut uppercase = false;
    for character in value.chars() {
        if character == '_' {
            uppercase = true;
        } else if uppercase {
            output.extend(character.to_uppercase());
            uppercase = false;
        } else {
            output.push(character);
        }
    }
    output
}

fn validate_restore_input(input: &BackupRestoreInput) -> Result<(), StorageError> {
    if input.data_schema_version <= 0 || input.data_schema_version > BACKUP_DATA_SCHEMA_VERSION {
        return Err(StorageError::validation(format!(
            "Unsupported backup data schema version {}",
            input.data_schema_version
        )));
    }
    validate_sha256(&input.expected_content_digest, "expectedContentDigest")?;
    validate_timestamp(&input.restored_at, "restoredAt")?;

    validate_rows("journals", JOURNAL_COLUMNS, &input.dataset.journals)?;
    validate_rows(
        "journal_versions",
        JOURNAL_VERSION_COLUMNS,
        &input.dataset.journal_versions,
    )?;
    validate_rows(
        "structured_blocks",
        STRUCTURED_BLOCK_COLUMNS,
        &input.dataset.structured_blocks,
    )?;
    validate_rows(
        "knowledge_items",
        KNOWLEDGE_ITEM_COLUMNS,
        &input.dataset.knowledge_items,
    )?;
    validate_rows(
        "knowledge_links",
        KNOWLEDGE_LINK_COLUMNS,
        &input.dataset.knowledge_links,
    )?;
    validate_rows("tasks", TASK_COLUMNS, &input.dataset.tasks)?;
    validate_rows("tags", TAG_COLUMNS, &input.dataset.tags)?;
    validate_rows(
        "journal_tags",
        JOURNAL_TAG_COLUMNS,
        &input.dataset.journal_tags,
    )?;
    validate_rows(
        "knowledge_tags",
        KNOWLEDGE_TAG_COLUMNS,
        &input.dataset.knowledge_tags,
    )?;
    validate_rows("reports", REPORT_COLUMNS, &input.dataset.reports)?;
    validate_rows(
        "import_sessions",
        IMPORT_SESSION_COLUMNS,
        &input.dataset.import_sessions,
    )?;
    validate_rows(
        "import_entries",
        IMPORT_ENTRY_COLUMNS,
        &input.dataset.import_entries,
    )?;

    assert_unique_ids(&input.dataset.journals, "journals")?;
    assert_unique_ids(&input.dataset.journal_versions, "journalVersions")?;
    assert_unique_ids(&input.dataset.structured_blocks, "structuredBlocks")?;
    assert_unique_ids(&input.dataset.knowledge_items, "knowledgeItems")?;
    assert_unique_ids(&input.dataset.knowledge_links, "knowledgeLinks")?;
    assert_unique_ids(&input.dataset.tasks, "tasks")?;
    assert_unique_ids(&input.dataset.tags, "tags")?;
    assert_unique_ids(&input.dataset.reports, "reports")?;
    assert_unique_ids(&input.dataset.import_sessions, "importSessions")?;
    assert_unique_ids(&input.dataset.import_entries, "importEntries")?;
    validate_relation_uniqueness(
        &input.dataset.journal_tags,
        &["journalId", "tagId"],
        "journalTags",
    )?;
    validate_relation_uniqueness(
        &input.dataset.knowledge_tags,
        &["knowledgeItemId", "tagId"],
        "knowledgeTags",
    )?;
    validate_import_rows(&input.dataset.import_entries)?;
    validate_attachment_records(&input.attachments)?;
    assert_no_storage_references(&input.dataset)?;
    assert_no_storage_references(&input.attachments)?;
    Ok(())
}

fn validate_rows(
    table: &str,
    columns: &[ColumnSpec],
    rows: &[Map<String, Value>],
) -> Result<(), StorageError> {
    let allowed = columns
        .iter()
        .map(|column| column.json_name)
        .collect::<BTreeSet<_>>();
    for (row_index, row) in rows.iter().enumerate() {
        for key in row.keys() {
            if !allowed.contains(key.as_str()) {
                return Err(StorageError::validation(format!(
                    "{table}[{row_index}] contains unsupported field {key}"
                )));
            }
        }
        for column in columns {
            let value = row.get(column.json_name).ok_or_else(|| {
                StorageError::validation(format!(
                    "{table}[{row_index}] is missing field {}",
                    column.json_name
                ))
            })?;
            if value.is_null() {
                if !column.nullable {
                    return Err(StorageError::validation(format!(
                        "{table}[{row_index}].{} must not be null",
                        column.json_name
                    )));
                }
                continue;
            }
            match column.kind {
                ColumnKind::Id => {
                    validate_uuid_v7(value.as_str().ok_or_else(|| {
                        StorageError::validation(format!(
                            "{table}[{row_index}].{} must be a UUID",
                            column.json_name
                        ))
                    })?)?;
                }
                ColumnKind::Text => {
                    if !value.is_string() {
                        return Err(StorageError::validation(format!(
                            "{table}[{row_index}].{} must be a string",
                            column.json_name
                        )));
                    }
                }
                ColumnKind::Integer => {
                    if value.as_i64().is_none() {
                        return Err(StorageError::validation(format!(
                            "{table}[{row_index}].{} must be an integer",
                            column.json_name
                        )));
                    }
                }
                ColumnKind::JsonObject => {
                    let text = value.as_str().ok_or_else(|| {
                        StorageError::validation(format!(
                            "{table}[{row_index}].{} must be a JSON string",
                            column.json_name
                        ))
                    })?;
                    let parsed: Value = serde_json::from_str(text).map_err(|_| {
                        StorageError::validation(format!(
                            "{table}[{row_index}].{} is not valid JSON",
                            column.json_name
                        ))
                    })?;
                    if !parsed.is_object() {
                        return Err(StorageError::validation(format!(
                            "{table}[{row_index}].{} must encode a JSON object",
                            column.json_name
                        )));
                    }
                }
                ColumnKind::Hash => {
                    validate_sha256(
                        value.as_str().ok_or_else(|| {
                            StorageError::validation(format!(
                                "{table}[{row_index}].{} must be a hash",
                                column.json_name
                            ))
                        })?,
                        &format!("{table}[{row_index}].{}", column.json_name),
                    )?;
                }
                ColumnKind::RawBytes => {
                    if !value.is_string() {
                        return Err(StorageError::validation(format!(
                            "{table}[{row_index}].{} must be Base64 text or null",
                            column.json_name
                        )));
                    }
                    decode_base64(
                        value.as_str().unwrap_or_default(),
                        &format!("{table}[{row_index}].{}", column.json_name),
                    )?;
                }
            }
        }
    }
    Ok(())
}

fn assert_unique_ids(rows: &[Map<String, Value>], table: &str) -> Result<(), StorageError> {
    let mut ids = BTreeSet::new();
    for row in rows {
        let id = required_text(row, "id", "id")?;
        if !ids.insert(id.to_owned()) {
            return Err(StorageError::validation(format!(
                "{table} contains duplicate id {id}"
            )));
        }
    }
    Ok(())
}

fn validate_relation_uniqueness(
    rows: &[Map<String, Value>],
    keys: &[&str],
    table: &str,
) -> Result<(), StorageError> {
    let mut seen = BTreeSet::new();
    for row in rows {
        let mut identity = Vec::with_capacity(keys.len());
        for key in keys {
            identity.push(required_text(row, key, key)?.to_owned());
        }
        if !seen.insert(identity) {
            return Err(StorageError::validation(format!(
                "{table} contains a duplicate relation"
            )));
        }
    }
    Ok(())
}

fn validate_import_rows(rows: &[Map<String, Value>]) -> Result<(), StorageError> {
    for (index, row) in rows.iter().enumerate() {
        let status = required_text(row, "rawCaptureStatus", "rawCaptureStatus")?;
        let file_hash = row.get("fileSha256").and_then(Value::as_str);
        let raw_size = row.get("rawSize").and_then(Value::as_i64);
        let cleaned_at = row.get("rawCleanedAt").and_then(Value::as_str);
        let raw_base64 = row.get("rawBytesBase64").and_then(Value::as_str);
        match status {
            "captured" => {
                let bytes = decode_base64(
                    raw_base64.ok_or_else(|| {
                        StorageError::validation(format!(
                            "importEntries[{index}] captured raw bytes are missing"
                        ))
                    })?,
                    "importEntries.rawBytesBase64",
                )?;
                let expected_hash = file_hash.ok_or_else(|| {
                    StorageError::validation(format!(
                        "importEntries[{index}] captured file hash is missing"
                    ))
                })?;
                let expected_size = raw_size.ok_or_else(|| {
                    StorageError::validation(format!(
                        "importEntries[{index}] captured raw size is missing"
                    ))
                })?;
                if expected_size < 0
                    || bytes.len() as i64 != expected_size
                    || sha256_hex(&bytes) != expected_hash
                    || cleaned_at.is_some()
                {
                    return Err(StorageError::validation(format!(
                        "importEntries[{index}] captured raw state is inconsistent"
                    )));
                }
            }
            "cleaned" => {
                if raw_base64.is_some()
                    || cleaned_at.is_none()
                    || file_hash.is_none()
                    || raw_size.map_or(true, |size| size < 0)
                {
                    return Err(StorageError::validation(format!(
                        "importEntries[{index}] cleaned raw state is inconsistent"
                    )));
                }
            }
            "unavailable" => {
                if raw_base64.is_some()
                    || cleaned_at.is_some()
                    || file_hash.is_some()
                    || raw_size.is_some()
                {
                    return Err(StorageError::validation(format!(
                        "importEntries[{index}] unavailable raw state is inconsistent"
                    )));
                }
            }
            _ => {
                return Err(StorageError::validation(format!(
                    "importEntries[{index}] has invalid rawCaptureStatus"
                )))
            }
        }
    }
    Ok(())
}

fn validate_attachment_records(records: &[BackupAttachmentRecord]) -> Result<(), StorageError> {
    let mut link_ids = BTreeSet::new();
    let mut blobs: BTreeMap<String, (String, i64)> = BTreeMap::new();
    for (index, record) in records.iter().enumerate() {
        validate_columns_values(
            &format!("attachments[{index}].link"),
            ATTACHMENT_LINK_COLUMNS,
            &record.link,
        )?;
        validate_columns_values(
            &format!("attachments[{index}].blob"),
            PORTABLE_ATTACHMENT_BLOB_COLUMNS,
            &record.blob,
        )?;
        let link_id = required_text(&record.link, "id", "attachment link id")?;
        if !link_ids.insert(link_id.to_owned()) {
            return Err(StorageError::validation(format!(
                "Duplicate attachment link id {link_id}"
            )));
        }
        let blob_id = required_text(&record.blob, "id", "attachment blob id")?;
        let sha256 = required_text(&record.blob, "sha256", "attachment sha256")?;
        let byte_size = required_integer(&record.blob, "byteSize", "attachment byteSize")?;
        if byte_size < 0 {
            return Err(StorageError::validation(
                "Attachment byteSize must not be negative",
            ));
        }
        let bytes = decode_base64(&record.bytes_base64, "attachments.bytesBase64")?;
        if bytes.len() as i64 != byte_size || sha256_hex(&bytes) != sha256 {
            return Err(StorageError::validation(format!(
                "Attachment {link_id} bytes do not match metadata"
            )));
        }
        if let Some((existing_hash, existing_size)) = blobs.get(blob_id) {
            if existing_hash != sha256 || *existing_size != byte_size {
                return Err(StorageError::validation(format!(
                    "Attachment blob {blob_id} has inconsistent metadata"
                )));
            }
        } else {
            blobs.insert(blob_id.to_owned(), (sha256.to_owned(), byte_size));
        }
    }
    Ok(())
}

fn validate_columns_values(
    path: &str,
    columns: &[ColumnSpec],
    row: &Map<String, Value>,
) -> Result<(), StorageError> {
    let allowed = columns
        .iter()
        .map(|column| column.json_name)
        .collect::<BTreeSet<_>>();
    for key in row.keys() {
        if !allowed.contains(key.as_str()) {
            return Err(StorageError::validation(format!(
                "{path} contains unsupported field {key}"
            )));
        }
    }
    for column in columns {
        let value = row.get(column.json_name).ok_or_else(|| {
            StorageError::validation(format!("{path} is missing field {}", column.json_name))
        })?;
        if value.is_null() {
            if !column.nullable {
                return Err(StorageError::validation(format!(
                    "{path}.{} must not be null",
                    column.json_name
                )));
            }
            continue;
        }
        match column.kind {
            ColumnKind::Id => validate_uuid_v7(value.as_str().ok_or_else(|| {
                StorageError::validation(format!("{path}.{} must be a UUID", column.json_name))
            })?)?,
            ColumnKind::Hash => validate_sha256(
                value.as_str().ok_or_else(|| {
                    StorageError::validation(format!("{path}.{} must be a hash", column.json_name))
                })?,
                &format!("{path}.{}", column.json_name),
            )?,
            ColumnKind::Integer => {
                if value.as_i64().is_none() {
                    return Err(StorageError::validation(format!(
                        "{path}.{} must be an integer",
                        column.json_name
                    )));
                }
            }
            ColumnKind::Text => {
                if !value.is_string() {
                    return Err(StorageError::validation(format!(
                        "{path}.{} must be a string",
                        column.json_name
                    )));
                }
            }
            ColumnKind::JsonObject | ColumnKind::RawBytes => {
                return Err(StorageError::validation(format!(
                    "{path} contains an unsupported column kind"
                )))
            }
        }
    }
    Ok(())
}

fn assert_no_storage_references(value: &impl Serialize) -> Result<(), StorageError> {
    let value = serde_json::to_value(value)?;
    inspect_storage_references(&value, "$")
}

fn inspect_storage_references(value: &Value, path: &str) -> Result<(), StorageError> {
    match value {
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                inspect_storage_references(item, &format!("{path}[{index}]"))?;
            }
        }
        Value::Object(map) => {
            for (key, child) in map {
                if matches!(
                    key.as_str(),
                    "storageKey" | "storagePath" | "absolutePath" | "localPath"
                ) {
                    return Err(StorageError::validation(format!(
                        "Backup contains local storage reference at {path}.{key}"
                    )));
                }
                inspect_storage_references(child, &format!("{path}.{key}"))?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn create_safety_snapshot_if_needed(
    database: &Database,
    attachment_store: &AttachmentStore,
) -> Result<Option<BackupSafetySnapshot>, StorageError> {
    let has_data = database.with_connection(|connection| {
        for table in BUSINESS_TABLES {
            let count: i64 =
                connection.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })?;
            if count > 0 {
                return Ok(true);
            }
        }
        Ok(false)
    })?;
    if !has_data {
        return Ok(None);
    }

    let backup_directory = attachment_store.root_path().join("backups");
    fs::create_dir_all(&backup_directory).map_err(|error| {
        StorageError::storage(format!(
            "failed to create safety snapshot directory: {error}"
        ))
    })?;
    let file_name = format!("dailyflow-safety-{}.sqlite", Uuid::now_v7());
    let path = backup_directory.join(&file_name);
    let path_text = path
        .to_str()
        .ok_or_else(|| StorageError::storage("Safety snapshot path is not valid UTF-8"))?;
    database.with_connection(|connection| {
        connection.execute("VACUUM INTO ?1", [path_text])?;
        Ok(())
    })?;
    let bytes = fs::read(&path).map_err(|error| {
        StorageError::storage(format!("failed to verify safety snapshot: {error}"))
    })?;
    Ok(Some(BackupSafetySnapshot {
        file_name,
        content_digest: sha256_hex(&bytes),
    }))
}

const BUSINESS_TABLES: &[&str] = &[
    "journals",
    "journal_versions",
    "structured_blocks",
    "knowledge_items",
    "knowledge_links",
    "tasks",
    "tags",
    "journal_tags",
    "knowledge_tags",
    "attachment_blobs",
    "attachment_links",
    "import_sessions",
    "import_entries",
    "reports",
];

fn clear_business_data(transaction: &Transaction<'_>) -> Result<(), StorageError> {
    transaction.execute_batch(
        "DELETE FROM search_fts;
         DELETE FROM search_documents;
         DELETE FROM import_entries;
         DELETE FROM import_sessions;
         DELETE FROM attachment_links;
         DELETE FROM attachment_blobs;
         DELETE FROM journal_tags;
         DELETE FROM knowledge_tags;
         DELETE FROM knowledge_links;
         DELETE FROM tasks;
         DELETE FROM knowledge_items;
         DELETE FROM structured_blocks;
         DELETE FROM journal_versions;
         DELETE FROM journals;
         DELETE FROM reports;
         DELETE FROM tags;",
    )?;
    Ok(())
}

fn insert_table(
    transaction: &Transaction<'_>,
    table: &str,
    columns: &[ColumnSpec],
    rows: &[Map<String, Value>],
) -> Result<(), StorageError> {
    insert_table_unchecked(transaction, table, columns, rows)
}

fn insert_table_unchecked(
    transaction: &Transaction<'_>,
    table: &str,
    columns: &[ColumnSpec],
    rows: &[Map<String, Value>],
) -> Result<(), StorageError> {
    if rows.is_empty() {
        return Ok(());
    }
    let sql_columns = columns
        .iter()
        .map(|column| column.sql_name)
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=columns.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("INSERT INTO {table} ({sql_columns}) VALUES ({placeholders})");
    let mut statement = transaction.prepare(&sql)?;
    for (row_index, row) in rows.iter().enumerate() {
        let values = columns
            .iter()
            .map(|column| row_to_sql_value(row, column, table, row_index))
            .collect::<Result<Vec<_>, StorageError>>()?;
        statement
            .execute(params_from_iter(values.iter()))
            .map_err(|error| {
                StorageError::storage(format!(
                    "failed to restore {table} row {row_index}: {error}"
                ))
            })?;
    }
    Ok(())
}

fn row_to_sql_value(
    row: &Map<String, Value>,
    column: &ColumnSpec,
    table: &str,
    row_index: usize,
) -> Result<SqlValue, StorageError> {
    let value = row.get(column.json_name).ok_or_else(|| {
        StorageError::validation(format!(
            "{table}[{row_index}] is missing field {}",
            column.json_name
        ))
    })?;
    if value.is_null() {
        return Ok(SqlValue::Null);
    }
    Ok(match column.kind {
        ColumnKind::Integer => SqlValue::Integer(value.as_i64().ok_or_else(|| {
            StorageError::validation(format!(
                "{table}[{row_index}].{} must be an integer",
                column.json_name
            ))
        })?),
        ColumnKind::RawBytes => SqlValue::Blob(decode_base64(
            value.as_str().ok_or_else(|| {
                StorageError::validation(format!(
                    "{table}[{row_index}].{} must be Base64 text",
                    column.json_name
                ))
            })?,
            &format!("{table}[{row_index}].{}", column.json_name),
        )?),
        ColumnKind::Id | ColumnKind::Text | ColumnKind::JsonObject | ColumnKind::Hash => {
            SqlValue::Text(
                value
                    .as_str()
                    .ok_or_else(|| {
                        StorageError::validation(format!(
                            "{table}[{row_index}].{} must be text",
                            column.json_name
                        ))
                    })?
                    .to_owned(),
            )
        }
    })
}

struct AttachmentDatabaseRows {
    blobs: Vec<Map<String, Value>>,
    links: Vec<Map<String, Value>>,
}

fn attachment_database_rows(
    records: &[BackupAttachmentRecord],
) -> Result<AttachmentDatabaseRows, StorageError> {
    let mut blobs = BTreeMap::<String, Map<String, Value>>::new();
    let mut links = Vec::with_capacity(records.len());
    for record in records {
        let blob_id = required_text(&record.blob, "id", "attachment blob id")?.to_owned();
        if !blobs.contains_key(&blob_id) {
            let sha256 = required_text(&record.blob, "sha256", "attachment sha256")?.to_owned();
            let mut blob = record.blob.clone();
            blob.insert(
                "storageKind".to_owned(),
                Value::String("desktop-file".to_owned()),
            );
            blob.insert(
                "storageKey".to_owned(),
                Value::String(storage_key_for_hash(&sha256)),
            );
            blobs.insert(blob_id, blob);
        }
        links.push(record.link.clone());
    }
    Ok(AttachmentDatabaseRows {
        blobs: blobs.into_values().collect(),
        links,
    })
}

struct StagedFile {
    temporary: PathBuf,
    destination: PathBuf,
}

struct StagedAttachments {
    files: Vec<StagedFile>,
    created_destinations: Vec<PathBuf>,
    committed: bool,
}

impl StagedAttachments {
    fn finalize(&mut self) -> Result<(), StorageError> {
        for file in &self.files {
            fs::rename(&file.temporary, &file.destination).map_err(|error| {
                StorageError::storage(format!(
                    "failed to commit restored attachment file: {error}"
                ))
            })?;
            self.created_destinations.push(file.destination.clone());
        }
        self.files.clear();
        Ok(())
    }

    fn mark_committed(&mut self) {
        self.committed = true;
    }
}

impl Drop for StagedAttachments {
    fn drop(&mut self) {
        for file in &self.files {
            let _ = fs::remove_file(&file.temporary);
        }
        if !self.committed {
            for path in &self.created_destinations {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn prepare_attachment_staging(
    attachment_store: &AttachmentStore,
    records: &[BackupAttachmentRecord],
) -> Result<StagedAttachments, StorageError> {
    let mut unique = BTreeMap::<String, (String, Vec<u8>)>::new();
    for record in records {
        let blob_id = required_text(&record.blob, "id", "attachment blob id")?;
        let sha256 = required_text(&record.blob, "sha256", "attachment sha256")?;
        let bytes = decode_base64(&record.bytes_base64, "attachments.bytesBase64")?;
        unique
            .entry(blob_id.to_owned())
            .or_insert_with(|| (sha256.to_owned(), bytes.clone()));
        let entry = unique.get(blob_id).expect("inserted attachment");
        if entry.0 != sha256 || entry.1 != bytes {
            return Err(StorageError::validation(format!(
                "Attachment blob {blob_id} has inconsistent bytes"
            )));
        }
    }

    let root = attachment_store.root_path();
    let temporary_directory = root.join("attachments/.tmp");
    fs::create_dir_all(&temporary_directory).map_err(|error| {
        StorageError::storage(format!(
            "failed to create attachment staging directory: {error}"
        ))
    })?;
    let mut files = Vec::new();
    let mut destinations = BTreeMap::new();
    for (_, (sha256, bytes)) in unique {
        let storage_key = storage_key_for_hash(&sha256);
        let destination = attachment_store.resolve_path(&storage_key)?;
        if let Some(existing) = destinations.get(&destination) {
            if existing != &bytes {
                return Err(StorageError::validation(
                    "Attachment hash maps to inconsistent bytes",
                ));
            }
            continue;
        }
        match fs::symlink_metadata(&destination) {
            Ok(metadata) if !metadata.is_file() => {
                return Err(StorageError::storage(format!(
                    "Attachment destination conflicts with a non-file entry: {}",
                    destination.display()
                )))
            }
            Ok(_) => {
                let existing = fs::read(&destination).map_err(|error| {
                    StorageError::storage(format!(
                        "failed to read existing attachment destination: {error}"
                    ))
                })?;
                if sha256_hex(&existing) != sha256 {
                    return Err(StorageError::storage(
                        "Existing attachment destination failed hash verification",
                    ));
                }
                destinations.insert(destination, bytes);
                continue;
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(StorageError::storage(format!(
                    "failed to inspect attachment destination: {error}"
                )))
            }
        }

        let temporary = temporary_directory.join(format!("{}.stage", Uuid::now_v7()));
        fs::write(&temporary, &bytes).map_err(|error| {
            StorageError::storage(format!("failed to stage attachment file: {error}"))
        })?;
        let staged_bytes = fs::read(&temporary).map_err(|error| {
            StorageError::storage(format!("failed to verify staged attachment file: {error}"))
        })?;
        if sha256_hex(&staged_bytes) != sha256 {
            let _ = fs::remove_file(&temporary);
            return Err(StorageError::storage(
                "Staged attachment failed hash verification",
            ));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                StorageError::storage(format!(
                    "failed to create attachment destination directory: {error}"
                ))
            })?;
        }
        destinations.insert(destination.clone(), bytes);
        files.push(StagedFile {
            temporary,
            destination,
        });
    }

    Ok(StagedAttachments {
        files,
        created_destinations: Vec::new(),
        committed: false,
    })
}

fn required_text<'a>(
    row: &'a Map<String, Value>,
    key: &str,
    field: &str,
) -> Result<&'a str, StorageError> {
    row.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| StorageError::validation(format!("{field} must be a string")))
}

fn required_integer(row: &Map<String, Value>, key: &str, field: &str) -> Result<i64, StorageError> {
    row.get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| StorageError::validation(format!("{field} must be an integer")))
}

fn validate_uuid_v7(value: &str) -> Result<(), StorageError> {
    let parsed =
        Uuid::parse_str(value).map_err(|_| StorageError::validation("Entity id must be a UUID"))?;
    if parsed.get_version_num() != 7 {
        return Err(StorageError::validation("Entity id must be a UUID v7"));
    }
    Ok(())
}

fn validate_timestamp(value: &str, field: &str) -> Result<(), StorageError> {
    let bytes = value.as_bytes();
    let separators = [
        (4, b'-'),
        (7, b'-'),
        (10, b'T'),
        (13, b':'),
        (16, b':'),
        (19, b'.'),
        (23, b'Z'),
    ];
    if bytes.len() != 24
        || separators
            .iter()
            .any(|(index, separator)| bytes[*index] != *separator)
        || bytes.iter().enumerate().any(|(index, byte)| {
            !matches!(index, 4 | 7 | 10 | 13 | 16 | 19 | 23) && !byte.is_ascii_digit()
        })
    {
        return Err(StorageError::validation(format!(
            "{field} must be an ISO-8601 UTC timestamp"
        )));
    }
    Ok(())
}

fn validate_sha256(value: &str, field: &str) -> Result<(), StorageError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    {
        return Err(StorageError::validation(format!(
            "{field} must be 64 lowercase hexadecimal characters"
        )));
    }
    Ok(())
}

fn decode_base64(value: &str, field: &str) -> Result<Vec<u8>, StorageError> {
    STANDARD
        .decode(value)
        .map_err(|_| StorageError::validation(format!("{field} must be valid Base64")))
}

fn validate_absolute_file_path(value: &str, field: &str) -> Result<PathBuf, StorageError> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(StorageError::validation(format!(
            "{field} must be an absolute path"
        )));
    }
    if path.file_name().is_none()
        || path
            .file_name()
            .is_some_and(|name| name.to_string_lossy().trim().is_empty())
    {
        return Err(StorageError::validation(format!(
            "{field} must include a valid file name"
        )));
    }
    Ok(path)
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn storage_key_for_hash(sha256: &str) -> String {
    format!(
        "attachments/{}/{}/{}.bin",
        &sha256[0..2],
        &sha256[2..4],
        sha256
    )
}

trait OptionalRow<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalRow<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error),
        }
    }
}
