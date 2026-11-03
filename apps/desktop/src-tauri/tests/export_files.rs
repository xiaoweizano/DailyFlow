use std::fs;

use dailyflow_desktop::{
    attachments::{AttachmentOwnerType, AttachmentPutInput, AttachmentStore},
    db::Database,
    export::{create_snapshot, write_export_file, ExportWriteFileInput},
};
use rusqlite::params;
use serde_json::json;
use sha2::{Digest, Sha256};
use tempfile::tempdir;

const JOURNAL_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fd000";
const BLOCK_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fd001";
const KNOWLEDGE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fd002";
const TASK_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fd003";
const SESSION_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fd004";
const ENTRY_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520fd005";
const CREATED_AT: &str = "2026-10-30T03:20:11.123Z";
const UPDATED_AT: &str = "2026-10-30T04:20:11.123Z";
const JOURNAL_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const KNOWLEDGE_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const IMPORT_HASH: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn create_harness() -> (tempfile::TempDir, Database, AttachmentStore) {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");
    let store = AttachmentStore::open(directory.path()).expect("open attachment store");
    (directory, database, store)
}

fn insert_snapshot_fixture(database: &Database, store: &AttachmentStore) {
    database
        .with_connection(|connection| {
            connection.execute(
                "INSERT INTO journals (
                   id, journal_date, timezone, title, content_json, content_markdown,
                   content_plain_text, editor_schema_version, projection_version,
                   content_hash, excerpt, status, revision, created_at, updated_at, deleted_at
                 ) VALUES (
                   ?1, '2026-10-30', 'Asia/Shanghai', '数据库排查', ?2, 'stale markdown',
                   '数据库排查正文', 1, 1, ?3, '数据库排查正文', 'active', 3, ?4, ?5, NULL
                 )",
                params![
                    JOURNAL_ID,
                    json!({
                        "type": "doc",
                        "content": [{
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "数据库排查正文"}]
                        }]
                    })
                    .to_string(),
                    JOURNAL_HASH,
                    CREATED_AT,
                    UPDATED_AT
                ],
            )?;
            connection.execute(
                "INSERT INTO structured_blocks (
                   id, journal_id, block_type, schema_version, data_json, order_key,
                   rendered_text, created_at, updated_at, deleted_at
                 ) VALUES (?1, ?2, 'issue', 1, ?3, '00000001', '连接超时', ?4, ?5, NULL)",
                params![
                    BLOCK_ID,
                    JOURNAL_ID,
                    json!({"symptom": "连接超时"}).to_string(),
                    CREATED_AT,
                    UPDATED_AT
                ],
            )?;

            for (id, name, normalized) in [
                ("0198e2f4-7e33-7c70-a8b2-18c1520fd010", "数据库", "数据库"),
                ("0198e2f4-7e33-7c70-a8b2-18c1520fd011", "Work", "work"),
            ] {
                connection.execute(
                    "INSERT INTO tags (id, name, name_normalized, color, created_at, updated_at)
                     VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
                    params![id, name, normalized, CREATED_AT, UPDATED_AT],
                )?;
            }
            connection.execute(
                "INSERT INTO journal_tags (journal_id, tag_id) VALUES
                   (?1, '0198e2f4-7e33-7c70-a8b2-18c1520fd010'),
                   (?1, '0198e2f4-7e33-7c70-a8b2-18c1520fd011')",
                [JOURNAL_ID],
            )?;

            connection.execute(
                "INSERT INTO knowledge_items (
                   id, kind, status, title, content_json, content_markdown,
                   content_plain_text, editor_schema_version, projection_version,
                   content_hash, summary, revision, source_journal_id, source_block_id,
                   created_at, updated_at, deleted_at
                 ) VALUES (
                   ?1, 'solution', 'active', '连接池修复', ?2, '', '', 1, 1,
                   ?3, '扩大连接池', 2, ?4, ?5, ?6, ?7, NULL
                 )",
                params![
                    KNOWLEDGE_ID,
                    json!({
                        "type": "doc",
                        "content": [{
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "扩大连接池"}]
                        }]
                    })
                    .to_string(),
                    KNOWLEDGE_HASH,
                    JOURNAL_ID,
                    BLOCK_ID,
                    CREATED_AT,
                    UPDATED_AT
                ],
            )?;
            connection.execute(
                "INSERT INTO knowledge_tags (knowledge_item_id, tag_id)
                 VALUES (?1, '0198e2f4-7e33-7c70-a8b2-18c1520fd011')",
                [KNOWLEDGE_ID],
            )?;

            connection.execute(
                "INSERT INTO tasks (
                   id, title, description_json, description_text, status, priority,
                   due_date, completed_at, journal_id, knowledge_item_id, revision,
                   created_at, updated_at, deleted_at
                 ) VALUES (
                   ?1, '验证修复', ?2, '验证修复说明', 'open', 'high',
                   '2026-10-31', NULL, ?3, ?4, 1, ?5, ?6, NULL
                 )",
                params![
                    TASK_ID,
                    json!({
                        "type": "doc",
                        "content": [{
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "验证修复说明"}]
                        }]
                    })
                    .to_string(),
                    JOURNAL_ID,
                    KNOWLEDGE_ID,
                    CREATED_AT,
                    UPDATED_AT
                ],
            )?;

            connection.execute(
                "INSERT INTO import_sessions (
                   id, root_label, status, options_json, revision, scanned_count,
                   ready_count, imported_count, skipped_count, conflict_count,
                   invalid_count, created_at, completed_at, error_summary
                 ) VALUES (
                   ?1, 'work-logs', 'preview_ready', ?2, 2, 1,
                   1, 0, 0, 0, 0, ?3, NULL, NULL
                 )",
                params![SESSION_ID, json!({"source": "txt"}).to_string(), CREATED_AT],
            )?;
            connection.execute(
                "INSERT INTO import_entries (
                   id, session_id, relative_path, original_file_name, detected_date,
                   encoding, newline_style, file_sha256, raw_size, raw_capture_status,
                   raw_bytes, raw_cleaned_at, status, conflict_kind, error_code,
                   error_detail, journal_id, previous_journal_revision, created_at,
                   committed_at
                 ) VALUES (
                   ?1, ?2, '202610/20261030.txt', '20261030.txt', '2026-10-30',
                   'utf8', 'lf', ?3, 6, 'captured', ?4, NULL, 'ready', NULL, NULL,
                   NULL, NULL, NULL, ?5, NULL
                 )",
                params![ENTRY_ID, SESSION_ID, IMPORT_HASH, b"origin", CREATED_AT],
            )?;
            Ok(())
        })
        .expect("insert snapshot fixture");

    store
        .put(
            database,
            AttachmentPutInput {
                owner_type: AttachmentOwnerType::Journal,
                owner_id: JOURNAL_ID.to_owned(),
                display_name: "trace.txt".to_owned(),
                mime_type: "text/plain".to_owned(),
                bytes: b"attachment bytes".to_vec(),
                alt_text: Some("trace".to_owned()),
                is_inline: false,
                sort_order: 1,
                created_at: CREATED_AT.to_owned(),
            },
        )
        .expect("store attachment");
}

#[test]
fn writes_verified_file_without_leaving_temporary_files() {
    let (directory, _database, _store) = create_harness();
    let output_directory = directory.path().join("out");
    fs::create_dir(&output_directory).expect("create output directory");
    let target = output_directory.join("dailyflow-export.zip");
    let bytes = b"deterministic archive bytes";

    let result = write_export_file(ExportWriteFileInput {
        target_path: target.to_string_lossy().into_owned(),
        bytes_base64: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes),
        expected_sha256: sha256_hex(bytes),
    })
    .expect("write export file");

    assert_eq!(result.bytes_written, bytes.len() as u64);
    assert_eq!(fs::read(&target).expect("read exported file"), bytes);
    assert_eq!(
        fs::read_dir(&output_directory)
            .expect("read target directory")
            .count(),
        1
    );
}

#[test]
fn refuses_to_overwrite_an_existing_target() {
    let (directory, _database, _store) = create_harness();
    let output_directory = directory.path().join("out");
    fs::create_dir(&output_directory).expect("create output directory");
    let target = output_directory.join("dailyflow-export.zip");
    fs::write(&target, b"existing").expect("write existing target");

    let error = write_export_file(ExportWriteFileInput {
        target_path: target.to_string_lossy().into_owned(),
        bytes_base64: base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b"replacement",
        ),
        expected_sha256: sha256_hex(b"replacement"),
    })
    .expect_err("existing target must not be overwritten");

    assert_eq!(
        error.code,
        dailyflow_desktop::db::StorageErrorCode::Conflict
    );
    assert_eq!(
        fs::read(&target).expect("read existing target"),
        b"existing"
    );
    assert_eq!(
        fs::read_dir(&output_directory)
            .expect("read target directory")
            .count(),
        1
    );
}

#[test]
fn hash_mismatch_fails_and_cleans_temporary_output() {
    let (directory, _database, _store) = create_harness();
    let output_directory = directory.path().join("out");
    fs::create_dir(&output_directory).expect("create output directory");
    let target = output_directory.join("dailyflow-export.zip");

    let error = write_export_file(ExportWriteFileInput {
        target_path: target.to_string_lossy().into_owned(),
        bytes_base64: base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b"corrupted",
        ),
        expected_sha256: "0".repeat(64),
    })
    .expect_err("hash mismatch must fail");

    assert_eq!(
        error.code,
        dailyflow_desktop::db::StorageErrorCode::ValidationError
    );
    assert!(!target.exists());
    assert_eq!(
        fs::read_dir(&output_directory)
            .expect("read target directory")
            .count(),
        0
    );
}

#[test]
fn rejects_invalid_export_targets_and_payloads() {
    let (directory, _database, _store) = create_harness();
    let valid_hash = sha256_hex(b"payload");
    let valid_base64 =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b"payload");

    for input in [
        ExportWriteFileInput {
            target_path: "relative.zip".to_owned(),
            bytes_base64: valid_base64.clone(),
            expected_sha256: valid_hash.clone(),
        },
        ExportWriteFileInput {
            target_path: directory
                .path()
                .join("export.zip")
                .to_string_lossy()
                .into_owned(),
            bytes_base64: "not base64!".to_owned(),
            expected_sha256: valid_hash.clone(),
        },
        ExportWriteFileInput {
            target_path: directory
                .path()
                .join("export.zip")
                .to_string_lossy()
                .into_owned(),
            bytes_base64: valid_base64.clone(),
            expected_sha256: "A".repeat(64),
        },
    ] {
        let error = write_export_file(input).expect_err("invalid input must fail");
        assert_eq!(
            error.code,
            dailyflow_desktop::db::StorageErrorCode::ValidationError
        );
    }
}

#[test]
fn snapshot_includes_portable_entities_and_raw_bytes_without_storage_coordinates() {
    let (_directory, database, store) = create_harness();
    insert_snapshot_fixture(&database, &store);

    let snapshot = create_snapshot(&database, &store).expect("create export snapshot");

    assert_eq!(snapshot.journals.len(), 1);
    assert_eq!(snapshot.journals[0].tags, vec!["Work", "数据库"]);
    assert_eq!(snapshot.journals[0].structured_blocks.len(), 1);
    assert_eq!(snapshot.knowledge.len(), 1);
    assert_eq!(snapshot.knowledge[0].tags, vec!["Work"]);
    assert_eq!(snapshot.tasks.len(), 1);
    assert_eq!(snapshot.attachments.len(), 1);
    assert_eq!(
        base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &snapshot.attachments[0].bytes_base64,
        )
        .expect("decode attachment bytes"),
        b"attachment bytes"
    );
    assert_eq!(snapshot.imports.sessions.len(), 1);
    assert!(snapshot.imports.sessions[0].entries.is_empty());
    assert_eq!(snapshot.imports.entries.len(), 1);
    assert_eq!(
        base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            snapshot.imports.entries[0]
                .entry
                .raw_bytes_base64
                .as_deref()
                .expect("captured raw bytes"),
        )
        .expect("decode raw import bytes"),
        b"origin"
    );

    let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");
    assert!(!serialized.contains("storageKey"));
    assert!(!serialized.contains("storage_key"));
    assert!(!serialized.contains("attachments/cc"));
}
