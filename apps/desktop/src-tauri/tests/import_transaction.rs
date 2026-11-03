use dailyflow_desktop::db::{
    import_repository,
    models::{
        ImportCommitBatchInput, ImportCommitEntryInput, ImportEntryInput, ImportSessionInput,
        JournalSaveCheckpoint, RecordImportFailureInput, SaveJournalSnapshot, SearchDocumentInput,
        SearchEntityType, StructuredBlockInput,
    },
    Database, StorageErrorCode,
};
use serde_json::json;
use tempfile::tempdir;

const SESSION_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1000";
const ENTRY_ONE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1001";
const ENTRY_TWO_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1002";
const JOURNAL_ONE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1003";
const JOURNAL_TWO_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1004";
const BLOCK_ONE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1005";
const BLOCK_TWO_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1006";
const SEARCH_ONE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1007";
const SEARCH_TWO_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f1008";
const FIRST_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECOND_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CREATED_AT: &str = "2026-10-30T03:20:11.123Z";
const COMMITTED_AT: &str = "2026-10-30T04:20:11.123Z";

fn scanning_session() -> ImportSessionInput {
    ImportSessionInput {
        id: SESSION_ID.to_owned(),
        root_label: "work-logs".to_owned(),
        status: "scanning".to_owned(),
        options: json!({ "source": "txt" }),
        revision: 1,
        scanned_count: 0,
        ready_count: 0,
        imported_count: 0,
        skipped_count: 0,
        conflict_count: 0,
        invalid_count: 0,
        entries: vec![],
        created_at: CREATED_AT.to_owned(),
        completed_at: None,
        error_summary: None,
    }
}

fn preview_entry(id: &str, path: &str, date: &str, text: &str) -> ImportEntryInput {
    ImportEntryInput {
        id: id.to_owned(),
        relative_path: path.to_owned(),
        original_file_name: path.rsplit('/').next().unwrap_or(path).to_owned(),
        detected_date: Some(date.to_owned()),
        encoding: "utf8".to_owned(),
        newline_style: "lf".to_owned(),
        file_sha256: Some(
            if id == ENTRY_ONE_ID {
                FIRST_HASH
            } else {
                SECOND_HASH
            }
            .to_owned(),
        ),
        raw_size: Some(text.len() as i64),
        raw_capture_status: "captured".to_owned(),
        raw_bytes_base64: Some(base64_encode(text.as_bytes())),
        raw_cleaned_at: None,
        status: "ready".to_owned(),
        conflict_kind: None,
        error_code: None,
        error_detail: None,
        journal_id: None,
        previous_journal_revision: None,
        created_at: CREATED_AT.to_owned(),
        committed_at: None,
    }
}

fn preview_session() -> ImportSessionInput {
    ImportSessionInput {
        id: SESSION_ID.to_owned(),
        root_label: "work-logs".to_owned(),
        status: "preview_ready".to_owned(),
        options: json!({ "source": "txt" }),
        revision: 2,
        scanned_count: 2,
        ready_count: 2,
        imported_count: 0,
        skipped_count: 0,
        conflict_count: 0,
        invalid_count: 0,
        entries: vec![
            preview_entry(
                ENTRY_ONE_ID,
                "202610/20261030.txt",
                "2026-10-30",
                "first import",
            ),
            preview_entry(
                ENTRY_TWO_ID,
                "202610/20261031.txt",
                "2026-10-31",
                "second import",
            ),
        ],
        created_at: CREATED_AT.to_owned(),
        completed_at: None,
        error_summary: None,
    }
}

fn snapshot(
    journal_id: &str,
    block_id: &str,
    search_id: &str,
    date: &str,
    title: &str,
    hash: &str,
) -> SaveJournalSnapshot {
    let body = format!("{title} body");
    SaveJournalSnapshot {
        journal_id: journal_id.to_owned(),
        journal_date: date.to_owned(),
        timezone: "Asia/Shanghai".to_owned(),
        title: title.to_owned(),
        content_json: json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{ "type": "text", "text": body }]
            }]
        }),
        editor_schema_version: 1,
        content_markdown: body.clone(),
        content_plain_text: body.clone(),
        content_hash: hash.to_owned(),
        projection_version: 1,
        excerpt: body.clone(),
        expected_revision: None,
        checkpoint: JournalSaveCheckpoint::Import,
        tags: vec!["Imported".to_owned()],
        structured_blocks: vec![StructuredBlockInput {
            id: block_id.to_owned(),
            block_type: "note".to_owned(),
            schema_version: 1,
            data: json!({ "text": body }),
            order_key: "00000001".to_owned(),
            rendered_text: body.clone(),
        }],
        search_documents: vec![SearchDocumentInput {
            id: search_id.to_owned(),
            entity_type: SearchEntityType::Journal,
            entity_id: journal_id.to_owned(),
            title: title.to_owned(),
            body_text: body.clone(),
            structured_text: String::new(),
            tags_text: "Imported".to_owned(),
            normalized_text: format!("{title} {body} Imported"),
            tokenized_text: format!("{title} {body} Imported"),
            local_date: Some(date.to_owned()),
            updated_at: COMMITTED_AT.to_owned(),
            content_hash: hash.to_owned(),
            index_version: 1,
        }],
        saved_at: COMMITTED_AT.to_owned(),
    }
}

fn commit_batch() -> ImportCommitBatchInput {
    ImportCommitBatchInput {
        session_id: SESSION_ID.to_owned(),
        expected_revision: 3,
        committed_at: COMMITTED_AT.to_owned(),
        entries: vec![
            ImportCommitEntryInput {
                entry_id: ENTRY_ONE_ID.to_owned(),
                journal_id: JOURNAL_ONE_ID.to_owned(),
                previous_journal_revision: None,
                snapshot: snapshot(
                    JOURNAL_ONE_ID,
                    BLOCK_ONE_ID,
                    SEARCH_ONE_ID,
                    "2026-10-30",
                    "First import",
                    FIRST_HASH,
                ),
            },
            ImportCommitEntryInput {
                entry_id: ENTRY_TWO_ID.to_owned(),
                journal_id: JOURNAL_TWO_ID.to_owned(),
                previous_journal_revision: None,
                snapshot: snapshot(
                    JOURNAL_TWO_ID,
                    BLOCK_TWO_ID,
                    SEARCH_TWO_ID,
                    "2026-10-31",
                    "Second import",
                    SECOND_HASH,
                ),
            },
        ],
        skipped_entry_ids: vec![],
        failed_entry_ids: vec![],
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::new();
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);
        output.push(ALPHABET[(first >> 2) as usize] as char);
        output.push(ALPHABET[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(ALPHABET[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(ALPHABET[(third & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

fn scalar_count(connection: &rusqlite::Connection, table: &str) -> i64 {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .expect("count rows")
}

#[test]
fn rolls_back_all_formal_data_when_the_second_import_entry_fails() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");

    database
        .with_connection(|connection| {
            import_repository::create_session(connection, &scanning_session())?;
            import_repository::save_preview(connection, &preview_session())?;
            import_repository::begin_commit(
                connection,
                &dailyflow_desktop::db::models::BeginImportCommitInput {
                    session_id: SESSION_ID.to_owned(),
                    expected_revision: 2,
                    started_at: COMMITTED_AT.to_owned(),
                },
            )?;

            connection.execute_batch(&format!(
                "CREATE TRIGGER fail_second_import_search
                 BEFORE INSERT ON search_documents
                 WHEN NEW.entity_id = '{JOURNAL_TWO_ID}'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced second import failure');
                 END;"
            ))?;

            let error = import_repository::commit_batch(connection, &commit_batch())
                .expect_err("second entry failure must roll back the whole batch");
            assert_eq!(error.code, StorageErrorCode::StorageUnavailable);

            for table in [
                "journals",
                "journal_versions",
                "structured_blocks",
                "journal_tags",
                "search_documents",
                "search_fts",
            ] {
                assert_eq!(scalar_count(connection, table), 0, "{table} must be empty");
            }

            let (session_status, session_revision): (String, i64) = connection.query_row(
                "SELECT status, revision FROM import_sessions WHERE id = ?1",
                [SESSION_ID],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            assert_eq!(session_status, "committing");
            assert_eq!(session_revision, 3);

            let ready_entries: i64 = connection.query_row(
                "SELECT COUNT(*) FROM import_entries
                 WHERE session_id = ?1 AND status = 'ready' AND journal_id IS NULL",
                [SESSION_ID],
                |row| row.get(0),
            )?;
            assert_eq!(ready_entries, 2);

            import_repository::record_failure(
                connection,
                &RecordImportFailureInput {
                    session_id: SESSION_ID.to_owned(),
                    expected_revision: 3,
                    failed_at: COMMITTED_AT.to_owned(),
                    error_summary: "forced second import failure".to_owned(),
                    failed_entry_ids: vec![ENTRY_ONE_ID.to_owned(), ENTRY_TWO_ID.to_owned()],
                },
            )?;

            let (failed_status, failed_revision, error_summary): (String, i64, String) = connection
                .query_row(
                    "SELECT status, revision, error_summary
                     FROM import_sessions WHERE id = ?1",
                    [SESSION_ID],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )?;
            assert_eq!(failed_status, "failed");
            assert_eq!(failed_revision, 4);
            assert_eq!(error_summary, "forced second import failure");

            let failed_entries: i64 = connection.query_row(
                "SELECT COUNT(*) FROM import_entries
                 WHERE session_id = ?1 AND status = 'failed'
                   AND error_code = 'IMPORT_COMMIT_FAILED'",
                [SESSION_ID],
                |row| row.get(0),
            )?;
            assert_eq!(failed_entries, 2);
            Ok(())
        })
        .expect("import transaction test");
}
