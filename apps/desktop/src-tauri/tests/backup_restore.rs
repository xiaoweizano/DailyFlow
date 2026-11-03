use std::collections::BTreeMap;

use dailyflow_desktop::{
    attachments::{AttachmentOwnerType, AttachmentPutInput, AttachmentStore},
    backup::{create_snapshot, restore_backup, BackupDatasetRows, BackupRestoreInput},
    db::{Database, StorageErrorCode},
};
use rusqlite::params;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tempfile::tempdir;

const JOURNAL_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fe000";
const SESSION_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fe001";
const ENTRY_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fe002";
const TAG_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fe003";
const CREATED_AT: &str = "2026-11-03T08:00:00.000Z";
const RESTORED_AT: &str = "2026-11-03T09:00:00.000Z";
const CONTENT_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RAW_BYTES: &[u8] = b"legacy raw import";
const ATTACHMENT_BYTES: &[u8] = b"desktop attachment";

struct Harness {
    directory: tempfile::TempDir,
    database: Database,
    store: AttachmentStore,
}

fn harness() -> Harness {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");
    let store = AttachmentStore::open(directory.path()).expect("open attachment store");
    Harness {
        directory,
        database,
        store,
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn insert_journal(database: &Database, title: &str) {
    database
        .with_connection(|connection| {
            connection.execute(
                "INSERT INTO journals (
                   id, journal_date, timezone, title, content_json, content_markdown,
                   content_plain_text, editor_schema_version, projection_version,
                   content_hash, excerpt, status, revision, created_at, updated_at, deleted_at
                 ) VALUES (
                   ?1, '2026-11-03', 'Asia/Shanghai', ?2, ?3, ?2, ?2, 1, 1,
                   ?4, ?2, 'active', 1, ?5, ?5, NULL
                 )",
                params![
                    JOURNAL_ID,
                    title,
                    json!({
                        "type": "doc",
                        "content": [{
                            "type": "paragraph",
                            "content": [{"type": "text", "text": title}]
                        }]
                    })
                    .to_string(),
                    CONTENT_HASH,
                    CREATED_AT,
                ],
            )?;
            connection.execute(
                "INSERT INTO tags (
                   id, name, name_normalized, color, created_at, updated_at
                 ) VALUES (?1, 'backup', 'backup', NULL, ?2, ?2)",
                params![TAG_ID, CREATED_AT],
            )?;
            connection.execute(
                "INSERT INTO journal_tags (journal_id, tag_id) VALUES (?1, ?2)",
                params![JOURNAL_ID, TAG_ID],
            )?;
            connection.execute(
                "INSERT INTO import_sessions (
                   id, root_label, status, options_json, revision, scanned_count,
                   ready_count, imported_count, skipped_count, conflict_count,
                   invalid_count, created_at, completed_at, error_summary
                 ) VALUES (
                   ?1, 'legacy', 'completed', '{}', 1, 1, 1, 1, 0, 0, 0,
                   ?2, ?2, NULL
                 )",
                params![SESSION_ID, CREATED_AT],
            )?;
            connection.execute(
                "INSERT INTO import_entries (
                   id, session_id, relative_path, original_file_name, detected_date,
                   encoding, newline_style, file_sha256, raw_size, raw_capture_status,
                   raw_bytes, raw_cleaned_at, status, conflict_kind, error_code,
                   error_detail, journal_id, previous_journal_revision, created_at,
                   committed_at
                 ) VALUES (
                   ?1, ?2, '202611/20261103.txt', '20261103.txt', '2026-11-03',
                   'utf8', 'lf', ?3, ?4, 'captured', ?5, NULL, 'imported', NULL,
                   NULL, NULL, ?6, NULL, ?7, ?7
                 )",
                params![
                    ENTRY_ID,
                    SESSION_ID,
                    sha256_hex(RAW_BYTES),
                    RAW_BYTES.len() as i64,
                    RAW_BYTES,
                    JOURNAL_ID,
                    CREATED_AT
                ],
            )?;
            Ok(())
        })
        .expect("insert journal fixture");
}

fn store_attachment(database: &Database, store: &AttachmentStore) {
    store
        .put(
            database,
            AttachmentPutInput {
                owner_type: AttachmentOwnerType::Journal,
                owner_id: JOURNAL_ID.to_owned(),
                display_name: "note.txt".to_owned(),
                mime_type: "text/plain".to_owned(),
                bytes: ATTACHMENT_BYTES.to_vec(),
                alt_text: Some("note".to_owned()),
                is_inline: false,
                sort_order: 0,
                created_at: CREATED_AT.to_owned(),
            },
        )
        .expect("store attachment");
}

fn restore_input(harness: &Harness) -> BackupRestoreInput {
    let snapshot =
        create_snapshot(&harness.database, &harness.store).expect("create backup snapshot");
    BackupRestoreInput {
        expected_content_digest: "b".repeat(64),
        data_schema_version: snapshot.data_schema_version,
        restored_at: RESTORED_AT.to_owned(),
        dataset: snapshot.dataset,
        attachments: snapshot.attachments,
    }
}

fn entity_counts(database: &Database) -> BTreeMap<&'static str, i64> {
    database
        .with_connection(|connection| {
            let mut counts = BTreeMap::new();
            for table in [
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
            ] {
                let count =
                    connection.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                        row.get::<_, i64>(0)
                    })?;
                counts.insert(table, count);
            }
            Ok(counts)
        })
        .expect("count entities")
}

fn first_row_mut<'a>(rows: &'a mut [Map<String, Value>], key: &str) -> &'a mut Value {
    rows.first_mut()
        .and_then(|row| row.get_mut(key))
        .expect("fixture field")
}

#[test]
fn creates_a_portable_snapshot_without_storage_coordinates() {
    let source = harness();
    insert_journal(&source.database, "Snapshot source");
    store_attachment(&source.database, &source.store);

    let snapshot = create_snapshot(&source.database, &source.store).expect("snapshot");
    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");

    assert_eq!(snapshot.dataset.journals.len(), 1);
    assert_eq!(snapshot.attachments.len(), 1);
    assert!(snapshot.attachments[0].bytes_base64.len() > 0);
    assert!(snapshot.dataset.import_entries[0]
        .get("rawBytesBase64")
        .and_then(Value::as_str)
        .is_some());
    assert!(!serialized.contains("storageKey"));
    assert!(!serialized.contains("storage_key"));
}

#[test]
fn restores_entities_attachment_bytes_raw_import_bytes_and_stale_search_state() {
    let source = harness();
    insert_journal(&source.database, "Restored journal");
    store_attachment(&source.database, &source.store);
    let target = harness();
    let input = restore_input(&source);

    let result = restore_backup(&target.database, &target.store, input).expect("restore backup");

    assert!(result.safety_snapshot.is_none());
    target
        .database
        .with_connection(|connection| {
            let title: String = connection.query_row(
                "SELECT title FROM journals WHERE id = ?1",
                [JOURNAL_ID],
                |row| row.get(0),
            )?;
            let raw_bytes: Vec<u8> = connection.query_row(
                "SELECT raw_bytes FROM import_entries WHERE id = ?1",
                [ENTRY_ID],
                |row| row.get(0),
            )?;
            let (storage_kind, storage_key): (String, String) = connection.query_row(
                "SELECT storage_kind, storage_key FROM attachment_blobs LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            let search_state: String = connection.query_row(
                "SELECT value_json FROM app_metadata WHERE key = 'search_index_state'",
                [],
                |row| row.get(0),
            )?;
            let search_documents: i64 =
                connection.query_row("SELECT COUNT(*) FROM search_documents", [], |row| {
                    row.get(0)
                })?;
            assert_eq!(title, "Restored journal");
            assert_eq!(raw_bytes, RAW_BYTES);
            assert_eq!(storage_kind, "desktop-file");
            assert_eq!(
                storage_key,
                format!(
                    "attachments/{}/{}/{}.bin",
                    &sha256_hex(ATTACHMENT_BYTES)[0..2],
                    &sha256_hex(ATTACHMENT_BYTES)[2..4],
                    sha256_hex(ATTACHMENT_BYTES)
                )
            );
            assert_eq!(search_state, "\"stale\"");
            assert_eq!(search_documents, 0);
            Ok(())
        })
        .expect("verify restored state");
}

#[test]
fn creates_a_safety_snapshot_only_when_existing_data_is_present() {
    let source = harness();
    insert_journal(&source.database, "New");
    let target = harness();
    insert_journal(&target.database, "Existing");

    let result = restore_backup(&target.database, &target.store, restore_input(&source))
        .expect("restore nonempty database");

    let safety = result.safety_snapshot.expect("safety snapshot");
    assert!(safety.file_name.ends_with(".sqlite"));
    assert_eq!(safety.content_digest.len(), 64);
    assert!(target
        .directory
        .path()
        .join("backups")
        .join(&safety.file_name)
        .is_file());
}

#[test]
fn invalid_raw_import_base64_rolls_back_without_changing_entities() {
    let source = harness();
    insert_journal(&source.database, "New");
    let target = harness();
    insert_journal(&target.database, "Existing");
    let before = entity_counts(&target.database);
    let mut input = restore_input(&source);
    *first_row_mut(&mut input.dataset.import_entries, "rawBytesBase64") =
        Value::String("not base64".to_owned());

    let error =
        restore_backup(&target.database, &target.store, input).expect_err("invalid payload");

    assert_eq!(error.code, StorageErrorCode::ValidationError);
    assert_eq!(entity_counts(&target.database), before);
}

#[test]
fn invalid_foreign_key_rolls_back_all_tables() {
    let source = harness();
    insert_journal(&source.database, "New");
    let target = harness();
    insert_journal(&target.database, "Existing");
    let before = entity_counts(&target.database);
    let mut input = restore_input(&source);
    *first_row_mut(&mut input.dataset.journal_tags, "journalId") =
        Value::String("0198e2f4-7e33-7c70-a8b2-18c1520fdead".to_owned());

    let error = restore_backup(&target.database, &target.store, input).expect_err("foreign key");

    assert_eq!(error.code, StorageErrorCode::StorageUnavailable);
    assert_eq!(entity_counts(&target.database), before);
}

#[test]
fn attachment_file_conflict_rolls_back_database_changes() {
    let source = harness();
    insert_journal(&source.database, "New");
    store_attachment(&source.database, &source.store);
    let target = harness();
    insert_journal(&target.database, "Existing");
    let before = entity_counts(&target.database);
    let attachment_hash = sha256_hex(ATTACHMENT_BYTES);
    let target_path = target.directory.path().join(format!(
        "attachments/{}/{}",
        &attachment_hash[0..2],
        &attachment_hash[2..4]
    ));
    std::fs::create_dir_all(target_path.join(format!("{attachment_hash}.bin")))
        .expect("create conflicting directory");

    let error = restore_backup(&target.database, &target.store, restore_input(&source))
        .expect_err("attachment conflict");

    assert_eq!(error.code, StorageErrorCode::StorageUnavailable);
    assert_eq!(entity_counts(&target.database), before);
}

#[test]
fn rejects_a_payload_with_too_new_a_data_schema() {
    let source = harness();
    insert_journal(&source.database, "New");
    let target = harness();
    let before = entity_counts(&target.database);
    let mut input = restore_input(&source);
    input.data_schema_version = 2;

    let error = restore_backup(&target.database, &target.store, input).expect_err("too-new schema");

    assert_eq!(error.code, StorageErrorCode::ValidationError);
    assert_eq!(entity_counts(&target.database), before);
}

#[test]
fn rejects_a_non_ascii_restore_timestamp_without_panicking() {
    let target = harness();
    let input = BackupRestoreInput {
        expected_content_digest: "d".repeat(64),
        data_schema_version: 1,
        restored_at: "2026-11-03T09:00:00.0中".to_owned(),
        dataset: BackupDatasetRows::default(),
        attachments: Vec::new(),
    };

    let error =
        restore_backup(&target.database, &target.store, input).expect_err("non-ASCII timestamp");

    assert_eq!(error.code, StorageErrorCode::ValidationError);
}

#[test]
fn empty_dataset_is_a_valid_restore_payload() {
    let target = harness();
    insert_journal(&target.database, "Existing");
    let input = BackupRestoreInput {
        expected_content_digest: "c".repeat(64),
        data_schema_version: 1,
        restored_at: RESTORED_AT.to_owned(),
        dataset: BackupDatasetRows::default(),
        attachments: Vec::new(),
    };

    restore_backup(&target.database, &target.store, input).expect("restore empty backup");

    assert_eq!(
        entity_counts(&target.database)
            .values()
            .copied()
            .sum::<i64>(),
        0
    );
}
