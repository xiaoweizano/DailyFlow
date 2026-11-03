use std::{
    error::Error,
    fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;

use crate::{
    attachments::{AttachmentOwnerType, AttachmentStore},
    db::{
        models::{
            ImportEntryInput, ImportSessionInput, Journal, KnowledgeItem, KnowledgeKind,
            KnowledgeStatus, StructuredBlockInput, Task, TaskPriority, TaskStatus,
        },
        Database, StorageError,
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportKnowledgeRecord {
    pub item: KnowledgeItem,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAttachment {
    pub id: String,
    pub blob_id: String,
    pub owner_type: AttachmentOwnerType,
    pub owner_id: String,
    pub display_name: String,
    pub alt_text: String,
    pub is_inline: bool,
    pub sort_order: i64,
    pub mime_type: String,
    pub byte_size: u64,
    pub sha256: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAttachmentRecord {
    pub attachment: ExportAttachment,
    pub bytes_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportImportEntryRecord {
    pub session_id: String,
    pub entry: ImportEntryInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportImportSnapshot {
    pub sessions: Vec<ImportSessionInput>,
    pub entries: Vec<ExportImportEntryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSnapshot {
    pub journals: Vec<Journal>,
    pub knowledge: Vec<ExportKnowledgeRecord>,
    pub tasks: Vec<Task>,
    pub attachments: Vec<ExportAttachmentRecord>,
    pub imports: ExportImportSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWriteFileInput {
    pub target_path: String,
    pub bytes_base64: String,
    pub expected_sha256: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWriteFileResult {
    pub bytes_written: u64,
}

pub fn create_snapshot(
    database: &Database,
    attachment_store: &AttachmentStore,
) -> Result<ExportSnapshot, StorageError> {
    database.with_connection(|connection| {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let journals = read_journals(&transaction)?;
        let knowledge = read_knowledge(&transaction)?;
        let tasks = read_tasks(&transaction)?;
        let attachments = read_attachments(&transaction, database, attachment_store)?;
        let imports = read_imports(&transaction)?;
        transaction.commit()?;

        Ok(ExportSnapshot {
            journals,
            knowledge,
            tasks,
            attachments,
            imports,
        })
    })
}

pub fn write_export_file(
    input: ExportWriteFileInput,
) -> Result<ExportWriteFileResult, StorageError> {
    validate_sha256(&input.expected_sha256)?;
    let bytes = STANDARD
        .decode(&input.bytes_base64)
        .map_err(|_| StorageError::validation("bytesBase64 must be valid standard Base64"))?;
    let actual_sha256 = sha256_hex(&bytes);
    if actual_sha256 != input.expected_sha256 {
        return Err(StorageError::validation(
            "expectedSha256 does not match decoded export bytes",
        ));
    }

    let target = validate_target_path(&input.target_path)?;
    ensure_target_absent(&target)?;
    let parent = target
        .parent()
        .ok_or_else(|| StorageError::validation("targetPath must include a parent directory"))?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| {
        StorageError::storage(format!("failed to create temporary export file: {error}"))
    })?;
    temporary.write_all(&bytes).map_err(|error| {
        StorageError::storage(format!("failed to write temporary export file: {error}"))
    })?;
    temporary.flush().map_err(|error| {
        StorageError::storage(format!("failed to flush temporary export file: {error}"))
    })?;
    temporary.as_file().sync_all().map_err(|error| {
        StorageError::storage(format!("failed to sync temporary export file: {error}"))
    })?;

    let written_bytes = fs::read(temporary.path()).map_err(|error| {
        StorageError::storage(format!("failed to verify temporary export file: {error}"))
    })?;
    if sha256_hex(&written_bytes) != input.expected_sha256 {
        return Err(StorageError::validation(
            "temporary export file failed SHA-256 verification",
        ));
    }

    temporary.persist_noclobber(&target).map_err(|error| {
        if error.error.kind() == ErrorKind::AlreadyExists {
            StorageError::conflict("targetPath already exists")
        } else {
            StorageError::storage(format!("failed to commit export file: {}", error.error))
        }
    })?;

    Ok(ExportWriteFileResult {
        bytes_written: bytes.len() as u64,
    })
}

fn read_journals(connection: &Connection) -> Result<Vec<Journal>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, journal_date, timezone, title, content_json, content_markdown,
                content_plain_text, editor_schema_version, projection_version,
                content_hash, excerpt, status, revision, created_at, updated_at, deleted_at
         FROM journals
         ORDER BY id",
    )?;
    let rows = statement.query_map([], |row| {
        let content_json: String = row.get(4)?;
        Ok(Journal {
            id: row.get(0)?,
            journal_date: row.get(1)?,
            timezone: row.get(2)?,
            title: row.get(3)?,
            content_json: serde_json::from_str(&content_json)
                .map_err(|error| sql_conversion_error(4, "content_json", error))?,
            content_markdown: row.get(5)?,
            content_plain_text: row.get(6)?,
            editor_schema_version: row.get(7)?,
            projection_version: row.get(8)?,
            content_hash: row.get(9)?,
            excerpt: row.get(10)?,
            status: row.get(11)?,
            revision: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
            deleted_at: row.get(15)?,
            tags: Vec::new(),
            structured_blocks: Vec::new(),
        })
    })?;
    let mut journals = rows.collect::<Result<Vec<_>, _>>()?;
    drop(statement);

    for journal in &mut journals {
        journal.tags = read_journal_tags(connection, &journal.id)?;
        journal.structured_blocks = read_structured_blocks(connection, &journal.id)?;
    }
    Ok(journals)
}

fn read_journal_tags(
    connection: &Connection,
    journal_id: &str,
) -> Result<Vec<String>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT tags.name
         FROM tags
         JOIN journal_tags ON journal_tags.tag_id = tags.id
         WHERE journal_tags.journal_id = ?1
         ORDER BY tags.name_normalized, tags.id",
    )?;
    let rows = statement.query_map([journal_id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn read_structured_blocks(
    connection: &Connection,
    journal_id: &str,
) -> Result<Vec<StructuredBlockInput>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, block_type, schema_version, data_json, order_key, rendered_text
         FROM structured_blocks
         WHERE journal_id = ?1 AND deleted_at IS NULL
         ORDER BY order_key, id",
    )?;
    let rows = statement.query_map([journal_id], |row| {
        let data_json: String = row.get(3)?;
        Ok(StructuredBlockInput {
            id: row.get(0)?,
            block_type: row.get(1)?,
            schema_version: row.get(2)?,
            data: serde_json::from_str(&data_json)
                .map_err(|error| sql_conversion_error(3, "data_json", error))?,
            order_key: row.get(4)?,
            rendered_text: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn read_knowledge(connection: &Connection) -> Result<Vec<ExportKnowledgeRecord>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, kind, status, title, content_json, editor_schema_version,
                content_hash, projection_version, summary, revision, source_journal_id,
                source_block_id, created_at, updated_at, deleted_at
         FROM knowledge_items
         ORDER BY id",
    )?;
    let rows = statement.query_map([], |row| {
        let content_json: String = row.get(4)?;
        Ok(ExportKnowledgeRecord {
            item: KnowledgeItem {
                id: row.get(0)?,
                kind: KnowledgeKind::from_database(&row.get::<_, String>(1)?)
                    .map_err(|error| sql_conversion_error(1, "kind", error))?,
                status: KnowledgeStatus::from_database(&row.get::<_, String>(2)?)
                    .map_err(|error| sql_conversion_error(2, "status", error))?,
                title: row.get(3)?,
                content_json: serde_json::from_str(&content_json)
                    .map_err(|error| sql_conversion_error(4, "content_json", error))?,
                editor_schema_version: row.get(5)?,
                content_hash: row.get(6)?,
                projection_version: row.get(7)?,
                summary: row.get(8)?,
                revision: row.get(9)?,
                source_journal_id: row.get(10)?,
                source_block_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                deleted_at: row.get(14)?,
            },
            tags: Vec::new(),
        })
    })?;
    let mut knowledge = rows.collect::<Result<Vec<_>, _>>()?;
    drop(statement);

    for record in &mut knowledge {
        let mut tags = connection.prepare(
            "SELECT tags.name
             FROM tags
             JOIN knowledge_tags ON knowledge_tags.tag_id = tags.id
             WHERE knowledge_tags.knowledge_item_id = ?1
             ORDER BY tags.name_normalized, tags.id",
        )?;
        let rows = tags.query_map([&record.item.id], |row| row.get::<_, String>(0))?;
        record.tags = rows.collect::<Result<Vec<_>, _>>()?;
    }
    Ok(knowledge)
}

fn read_tasks(connection: &Connection) -> Result<Vec<Task>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, title, description_json, description_text, status, priority,
                due_date, completed_at, journal_id, knowledge_item_id, revision,
                created_at, updated_at, deleted_at
         FROM tasks
         ORDER BY id",
    )?;
    let rows = statement.query_map([], |row| {
        let description_json = row.get::<_, Option<String>>(2)?;
        Ok(Task {
            id: row.get(0)?,
            title: row.get(1)?,
            description_json: description_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()
                .map_err(|error| sql_conversion_error(2, "description_json", error))?,
            description_text: row.get(3)?,
            status: TaskStatus::from_database(&row.get::<_, String>(4)?)
                .map_err(|error| sql_conversion_error(4, "status", error))?,
            priority: TaskPriority::from_database(&row.get::<_, String>(5)?)
                .map_err(|error| sql_conversion_error(5, "priority", error))?,
            due_date: row.get(6)?,
            completed_at: row.get(7)?,
            journal_id: row.get(8)?,
            knowledge_item_id: row.get(9)?,
            revision: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            deleted_at: row.get(13)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn read_attachments(
    connection: &Connection,
    database: &Database,
    attachment_store: &AttachmentStore,
) -> Result<Vec<ExportAttachmentRecord>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT links.id, links.blob_id, links.owner_type, links.owner_id,
                links.display_name, links.alt_text, links.is_inline, links.sort_order,
                blobs.mime_type, blobs.byte_size, blobs.sha256, links.created_at,
                links.deleted_at
         FROM attachment_links AS links
         JOIN attachment_blobs AS blobs ON blobs.id = links.blob_id
         ORDER BY links.id",
    )?;
    let rows = statement.query_map([], |row| {
        let owner_type: String = row.get(2)?;
        let byte_size: i64 = row.get(9)?;
        Ok(ExportAttachment {
            id: row.get(0)?,
            blob_id: row.get(1)?,
            owner_type: serde_json::from_value(Value::String(owner_type))
                .map_err(|error| sql_conversion_error(2, "owner_type", error))?,
            owner_id: row.get(3)?,
            display_name: row.get(4)?,
            alt_text: row.get(5)?,
            is_inline: row.get::<_, i64>(6)? != 0,
            sort_order: row.get(7)?,
            mime_type: row.get(8)?,
            byte_size: u64::try_from(byte_size)
                .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(9, byte_size))?,
            sha256: row.get(10)?,
            created_at: row.get(11)?,
            deleted_at: row.get(12)?,
        })
    })?;
    let attachments = rows.collect::<Result<Vec<_>, _>>()?;
    drop(statement);

    attachments
        .into_iter()
        .map(|attachment| {
            let bytes = attachment_store.read_blob(database, &attachment.blob_id)?;
            Ok(ExportAttachmentRecord {
                attachment,
                bytes_base64: STANDARD.encode(bytes),
            })
        })
        .collect()
}

fn read_imports(connection: &Connection) -> Result<ExportImportSnapshot, StorageError> {
    let mut session_statement = connection.prepare(
        "SELECT id, root_label, status, options_json, revision, scanned_count,
                ready_count, imported_count, skipped_count, conflict_count,
                invalid_count, created_at, completed_at, error_summary
         FROM import_sessions
         ORDER BY id",
    )?;
    let session_rows = session_statement.query_map([], |row| {
        let options_json: String = row.get(3)?;
        Ok(ImportSessionInput {
            id: row.get(0)?,
            root_label: row.get(1)?,
            status: row.get(2)?,
            options: serde_json::from_str(&options_json)
                .map_err(|error| sql_conversion_error(3, "options_json", error))?,
            revision: row.get(4)?,
            scanned_count: row.get(5)?,
            ready_count: row.get(6)?,
            imported_count: row.get(7)?,
            skipped_count: row.get(8)?,
            conflict_count: row.get(9)?,
            invalid_count: row.get(10)?,
            entries: Vec::new(),
            created_at: row.get(11)?,
            completed_at: row.get(12)?,
            error_summary: row.get(13)?,
        })
    })?;
    let sessions = session_rows.collect::<Result<Vec<_>, _>>()?;
    drop(session_statement);

    let mut entry_statement = connection.prepare(
        "SELECT id, session_id, relative_path, original_file_name, detected_date,
                encoding, newline_style, file_sha256, raw_size, raw_capture_status,
                raw_bytes, raw_cleaned_at, status, conflict_kind, error_code,
                error_detail, journal_id, previous_journal_revision, created_at,
                committed_at
         FROM import_entries
         ORDER BY id",
    )?;
    let entry_rows = entry_statement.query_map([], |row| {
        let raw_bytes = row.get::<_, Option<Vec<u8>>>(10)?;
        Ok(ExportImportEntryRecord {
            session_id: row.get(1)?,
            entry: ImportEntryInput {
                id: row.get(0)?,
                relative_path: row.get(2)?,
                original_file_name: row.get(3)?,
                detected_date: row.get(4)?,
                encoding: row.get(5)?,
                newline_style: row.get(6)?,
                file_sha256: row.get(7)?,
                raw_size: row.get(8)?,
                raw_capture_status: row.get(9)?,
                raw_bytes_base64: raw_bytes.map(|bytes| STANDARD.encode(bytes)),
                raw_cleaned_at: row.get(11)?,
                status: row.get(12)?,
                conflict_kind: row.get(13)?,
                error_code: row.get(14)?,
                error_detail: row.get(15)?,
                journal_id: row.get(16)?,
                previous_journal_revision: row.get(17)?,
                created_at: row.get(18)?,
                committed_at: row.get(19)?,
            },
        })
    })?;
    let entries = entry_rows.collect::<Result<Vec<_>, _>>()?;

    Ok(ExportImportSnapshot { sessions, entries })
}

fn validate_target_path(value: &str) -> Result<PathBuf, StorageError> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(StorageError::validation("targetPath must be absolute"));
    }
    if path.file_name().and_then(|name| name.to_str()).is_none()
        || path
            .file_name()
            .is_some_and(|name| name.to_string_lossy().trim().is_empty())
    {
        return Err(StorageError::validation(
            "targetPath must include a valid file name",
        ));
    }
    Ok(path)
}

fn ensure_target_absent(path: &Path) -> Result<(), StorageError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Err(StorageError::conflict("targetPath already exists")),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(StorageError::storage(format!(
            "failed to inspect targetPath: {error}"
        ))),
    }
}

fn validate_sha256(value: &str) -> Result<(), StorageError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    {
        return Err(StorageError::validation(
            "expectedSha256 must be 64 lowercase hexadecimal characters",
        ));
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn sql_conversion_error(
    index: usize,
    _column: &'static str,
    error: impl Error + Send + Sync + 'static,
) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(index, rusqlite::types::Type::Text, Box::new(error))
}
