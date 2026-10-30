use dailyflow_desktop::db::{
    journal_repository,
    models::{
        JournalChangeSource, JournalSaveCheckpoint, RestoreJournalVersionInput,
        SaveJournalSnapshot, SearchDocumentInput, SearchEntityType, SearchQuery,
        StructuredBlockInput,
    },
    search_repository, Database, StorageErrorCode,
};
use serde_json::json;
use tempfile::tempdir;

const JOURNAL_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c26";
const BLOCK_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c27";
const SEARCH_DOCUMENT_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c28";
const SECOND_SEARCH_DOCUMENT_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c29";
const FIRST_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECOND_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn snapshot(
    expected_revision: Option<i64>,
    title: &str,
    body: &str,
    hash: &str,
    saved_at: &str,
    checkpoint: JournalSaveCheckpoint,
) -> SaveJournalSnapshot {
    SaveJournalSnapshot {
        journal_id: JOURNAL_ID.to_owned(),
        journal_date: "2026-10-30".to_owned(),
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
        content_markdown: body.to_owned(),
        content_plain_text: body.to_owned(),
        content_hash: hash.to_owned(),
        projection_version: 1,
        excerpt: body.to_owned(),
        expected_revision,
        checkpoint,
        tags: vec![" Work ".to_owned(), "数据库".to_owned()],
        structured_blocks: vec![StructuredBlockInput {
            id: BLOCK_ID.to_owned(),
            block_type: "issue".to_owned(),
            schema_version: 1,
            data: json!({ "symptom": body }),
            order_key: "00000001".to_owned(),
            rendered_text: format!("{title}: {body}"),
        }],
        search_documents: vec![
            SearchDocumentInput {
                id: SEARCH_DOCUMENT_ID.to_owned(),
                entity_type: SearchEntityType::Journal,
                entity_id: JOURNAL_ID.to_owned(),
                title: title.to_owned(),
                body_text: body.to_owned(),
                structured_text: String::new(),
                tags_text: "work 数据库".to_owned(),
                normalized_text: format!("{title} {body} work 数据库"),
                tokenized_text: format!("{title} {body} work 数据库"),
                local_date: Some("2026-10-30".to_owned()),
                updated_at: saved_at.to_owned(),
                content_hash: hash.to_owned(),
                index_version: 1,
            },
            SearchDocumentInput {
                id: SECOND_SEARCH_DOCUMENT_ID.to_owned(),
                entity_type: SearchEntityType::StructuredBlock,
                entity_id: BLOCK_ID.to_owned(),
                title: format!("{title} block"),
                body_text: body.to_owned(),
                structured_text: body.to_owned(),
                tags_text: "work 数据库".to_owned(),
                normalized_text: format!("{title} block {body} work 数据库"),
                tokenized_text: format!("{title} block {body} work 数据库"),
                local_date: Some("2026-10-30".to_owned()),
                updated_at: saved_at.to_owned(),
                content_hash: hash.to_owned(),
                index_version: 1,
            },
        ],
        saved_at: saved_at.to_owned(),
    }
}

#[test]
fn rolls_back_journal_versions_blocks_tags_and_search_when_fts_write_fails() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");

    database
        .with_connection(|connection| {
            journal_repository::save_snapshot(
                connection,
                &snapshot(
                    None,
                    "Deploy notes",
                    "Deploy release completed",
                    FIRST_HASH,
                    "2026-10-30T03:20:11.123Z",
                    JournalSaveCheckpoint::Explicit,
                ),
            )?;

            connection.execute_batch(
                "CREATE TRIGGER fail_search_document
                 BEFORE INSERT ON search_documents
                 BEGIN
                   SELECT RAISE(ABORT, 'forced search failure');
                 END;",
            )?;

            let error = journal_repository::save_snapshot(
                connection,
                &snapshot(
                    Some(1),
                    "Broken update",
                    "This transaction must roll back",
                    SECOND_HASH,
                    "2026-10-30T03:25:00.000Z",
                    JournalSaveCheckpoint::Explicit,
                ),
            )
            .expect_err("forced search failure must abort the snapshot");
            assert_eq!(error.code, StorageErrorCode::StorageUnavailable);

            let current =
                journal_repository::get_by_id(connection, JOURNAL_ID)?.expect("original journal");
            assert_eq!(current.title, "Deploy notes");
            assert_eq!(current.revision, 1);

            let versions =
                journal_repository::list_versions(connection, JOURNAL_ID, Some(20), None)?;
            assert_eq!(versions.items.len(), 1);
            assert_eq!(versions.items[0].revision, 1);

            let state =
                journal_repository::get_save_state(connection, JOURNAL_ID)?.expect("save state");
            assert_eq!(state.tags, vec!["Work", "数据库"]);

            let (rendered_text, deleted_at): (String, Option<String>) = connection.query_row(
                "SELECT rendered_text, deleted_at FROM structured_blocks WHERE id = ?1",
                [BLOCK_ID],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            assert_eq!(rendered_text, "Deploy notes: Deploy release completed");
            assert!(deleted_at.is_none());

            let old_search = search_repository::query(
                connection,
                &SearchQuery {
                    text: "deploy".to_owned(),
                    entity_types: None,
                    from_date: None,
                    to_date: None,
                    cursor: None,
                    limit: Some(20),
                },
            )?;
            assert_eq!(old_search.items.len(), 2);

            let failed_search = search_repository::query(
                connection,
                &SearchQuery {
                    text: "broken".to_owned(),
                    entity_types: None,
                    from_date: None,
                    to_date: None,
                    cursor: None,
                    limit: Some(20),
                },
            )?;
            assert!(failed_search.items.is_empty());

            let fts_rows: i64 =
                connection.query_row("SELECT COUNT(*) FROM search_fts", [], |row| row.get(0))?;
            assert_eq!(fts_rows, 2);
            Ok(())
        })
        .expect("transaction test");
}

#[test]
fn restores_a_historical_version_as_a_new_revision_without_deleting_history() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");

    database
        .with_connection(|connection| {
            journal_repository::save_snapshot(
                connection,
                &snapshot(
                    None,
                    "Version one",
                    "First body",
                    FIRST_HASH,
                    "2026-10-30T03:20:11.123Z",
                    JournalSaveCheckpoint::Explicit,
                ),
            )?;
            journal_repository::save_snapshot(
                connection,
                &snapshot(
                    Some(1),
                    "Version two",
                    "Second body",
                    SECOND_HASH,
                    "2026-10-30T03:30:11.123Z",
                    JournalSaveCheckpoint::Explicit,
                ),
            )?;

            let restored = journal_repository::restore_version(
                connection,
                &RestoreJournalVersionInput {
                    journal_id: JOURNAL_ID.to_owned(),
                    version_revision: 1,
                    expected_current_revision: 2,
                    restored_at: "2026-10-30T04:00:00.000Z".to_owned(),
                },
            )?;
            assert_eq!(restored.revision, 3);
            assert!(restored.version_created);

            let current =
                journal_repository::get_by_id(connection, JOURNAL_ID)?.expect("restored journal");
            assert_eq!(current.title, "Version one");
            assert_eq!(current.revision, 3);

            let restored_version = journal_repository::get_version(connection, JOURNAL_ID, 3)?
                .expect("restored version");
            assert_eq!(restored_version.change_source, JournalChangeSource::Restore);
            assert!(journal_repository::get_version(connection, JOURNAL_ID, 1)?.is_some());

            let versions =
                journal_repository::list_versions(connection, JOURNAL_ID, Some(20), None)?;
            assert_eq!(
                versions
                    .items
                    .iter()
                    .map(|version| version.revision)
                    .collect::<Vec<_>>(),
                vec![3, 2, 1]
            );
            Ok(())
        })
        .expect("restore test");
}

#[test]
fn serializes_command_dtos_with_camel_case_fields() {
    let saved = dailyflow_desktop::db::models::SavedJournalSnapshot {
        journal_id: JOURNAL_ID.to_owned(),
        revision: 1,
        saved_at: "2026-10-30T03:20:11.123Z".to_owned(),
        content_hash: FIRST_HASH.to_owned(),
        version_created: true,
        search_index_state: "ready".to_owned(),
    };

    let value = serde_json::to_value(saved).expect("serialize saved snapshot");
    assert!(value.get("journalId").is_some());
    assert!(value.get("contentHash").is_some());
    assert!(value.get("versionCreated").is_some());
    assert!(value.get("searchIndexState").is_some());
    assert!(value.get("journal_id").is_none());
}
