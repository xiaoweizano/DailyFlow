use dailyflow_desktop::db::{
    migrations,
    models::{SearchEntityType, SearchQuery, SearchResultPage},
    search_repository,
};
use rusqlite::Connection;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

fn connection() -> Connection {
    let mut connection = Connection::open_in_memory().expect("open in-memory database");
    migrations::run(&mut connection).expect("run migrations");
    connection
}

#[test]
fn preserves_a_failed_search_index_state() {
    let connection = connection();
    connection
        .execute(
            "INSERT INTO app_metadata (key, value_json, updated_at)
             VALUES ('search_index_state', '\"failed\"', '2026-10-30T06:00:00.000Z')
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            [],
        )
        .expect("seed failed index state");

    let page: SearchResultPage = search_repository::query(
        &connection,
        &SearchQuery {
            text: "release".to_owned(),
            entity_types: None,
            from_date: None,
            to_date: None,
            cursor: None,
            limit: Some(20),
        },
    )
    .expect("query search");

    assert_eq!(page.index_state, "failed");
}

#[test]
fn rebuilds_fts_from_authoritative_documents_and_marks_the_index_ready() {
    let mut connection = connection();
    connection
        .execute_batch(
            "INSERT INTO journals (
               id, journal_date, timezone, title, content_json, content_markdown,
               content_plain_text, editor_schema_version, projection_version,
               content_hash, excerpt, status, revision, created_at, updated_at
             ) VALUES (
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c31', '2026-10-30',
               'Asia/Shanghai', 'Release journal', '{\"type\":\"doc\",\"content\":[]}',
               'Release journal', 'Deploy notes', 1, 1,
               'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
               'Deploy notes', 'active', 1,
               '2026-10-30T06:00:00.000Z', '2026-10-30T06:00:00.000Z'
             );
             INSERT INTO knowledge_items (
               id, kind, status, title, content_json, content_markdown,
               content_plain_text, editor_schema_version, projection_version,
               content_hash, summary, revision, created_at, updated_at
             ) VALUES (
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c33', 'solution', 'active',
               'Release knowledge', '{\"type\":\"doc\",\"content\":[]}',
               'Release knowledge', 'Rollback reference', 1, 1,
               'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
               'Rollback reference', 1,
               '2026-10-30T05:00:00.000Z', '2026-10-30T05:00:00.000Z'
             );
             INSERT INTO app_metadata (key, value_json, updated_at)
             VALUES ('search_index_state', '\"stale\"', '2026-10-30T06:00:00.000Z');",
        )
        .expect("seed authoritative search documents");

    let rebuilt =
        search_repository::rebuild(&mut connection, Some(&[SearchEntityType::Journal]), || {
            false
        })
        .expect("rebuild journal search documents");

    assert_eq!(rebuilt.indexed_count, 1);
    assert_eq!(rebuilt.status, "completed");
    assert!(rebuilt.completed_at.ends_with('Z'));
    let page = search_repository::query(
        &connection,
        &SearchQuery {
            text: "release".to_owned(),
            entity_types: None,
            from_date: None,
            to_date: None,
            cursor: None,
            limit: Some(20),
        },
    )
    .expect("query rebuilt search");
    assert_eq!(page.index_state, "ready");
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].title, "Release journal");
}

#[test]
fn cancellation_rolls_back_the_replacement_index() {
    let mut connection = connection();
    connection
        .execute_batch(
            "INSERT INTO journals (
               id, journal_date, timezone, title, content_json, content_markdown,
               content_plain_text, editor_schema_version, projection_version,
               content_hash, excerpt, status, revision, created_at, updated_at
             ) VALUES (
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c51', '2026-11-03',
               'Asia/Shanghai', 'Cancelled rebuild', '{\"type\":\"doc\",\"content\":[]}',
               'Cancelled rebuild', 'Keep old index', 1, 1,
               'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
               'Keep old index', 'active', 1,
               '2026-11-03T04:00:00.000Z', '2026-11-03T04:00:00.000Z'
             );
             INSERT INTO search_documents (
               id, entity_type, entity_id, title, body_text, structured_text, tags_text,
               normalized_text, tokenized_text, local_date, updated_at, content_hash, index_version
             ) VALUES (
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c52', 'task',
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c52', 'Old task', 'old',
               '', '', 'old task', 'old task', NULL, '2026-11-03T03:00:00.000Z',
               'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1
             );
             INSERT INTO app_metadata (key, value_json, updated_at)
             VALUES ('search_index_state', '\"stale\"', '2026-11-03T03:00:00.000Z');",
        )
        .expect("seed cancellation database");
    let cancel = Arc::new(AtomicBool::new(false));
    let cancellation = Arc::clone(&cancel);

    let rebuilt = search_repository::rebuild(&mut connection, None, move || {
        cancellation.store(true, Ordering::SeqCst);
        cancellation.load(Ordering::SeqCst)
    })
    .expect("cancel rebuild");

    assert_eq!(rebuilt.status, "cancelled");
    let document_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM search_documents", [], |row| {
            row.get(0)
        })
        .expect("count search documents");
    assert_eq!(document_count, 1);
}

#[test]
fn reports_rebuild_progress_for_reading_indexing_and_committing() {
    let mut connection = connection();
    connection
        .execute_batch(
            "INSERT INTO journals (
               id, journal_date, timezone, title, content_json, content_markdown,
               content_plain_text, editor_schema_version, projection_version,
               content_hash, excerpt, status, revision, created_at, updated_at
             ) VALUES (
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c61', '2026-11-03',
               'Asia/Shanghai', 'Progress journal', '{\"type\":\"doc\",\"content\":[]}',
               'Progress journal', 'Observable rebuild', 1, 1,
               'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
               'Observable rebuild', 'active', 1,
               '2026-11-03T04:00:00.000Z', '2026-11-03T04:00:00.000Z'
             );",
        )
        .expect("seed progress database");
    let mut progress = Vec::new();

    search_repository::rebuild_with_progress(
        &mut connection,
        Some(&[SearchEntityType::Journal]),
        || false,
        |event| progress.push((event.phase, event.processed_count, event.total_count)),
    )
    .expect("rebuild with progress");

    assert_eq!(
        progress,
        vec![
            ("reading".to_owned(), 0, 1),
            ("indexing".to_owned(), 1, 1),
            ("committing".to_owned(), 1, 1),
        ]
    );
}
