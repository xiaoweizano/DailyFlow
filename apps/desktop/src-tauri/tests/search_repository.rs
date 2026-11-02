use dailyflow_desktop::db::{
    migrations,
    models::{SearchEntityType, SearchQuery, SearchResultPage},
    search_repository,
};
use rusqlite::Connection;

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
            "INSERT INTO search_documents (
               id, entity_type, entity_id, title, body_text, structured_text, tags_text,
               normalized_text, tokenized_text, local_date, updated_at, content_hash, index_version
             ) VALUES
               ('0198e2f4-7e33-7c70-a8b2-18c1520f9c31', 'journal',
                '0198e2f4-7e33-7c70-a8b2-18c1520f9c32', 'Release journal',
                'Deploy notes', '', 'release', 'release journal deploy notes',
                'release journal deploy notes', '2026-10-30',
                '2026-10-30T06:00:00.000Z',
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1),
               ('0198e2f4-7e33-7c70-a8b2-18c1520f9c33', 'knowledge_item',
                '0198e2f4-7e33-7c70-a8b2-18c1520f9c34', 'Release knowledge',
                'Rollback reference', '', 'release', 'release knowledge rollback reference',
                'release knowledge rollback reference', NULL,
                '2026-10-30T05:00:00.000Z',
                'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1);
             INSERT INTO app_metadata (key, value_json, updated_at)
             VALUES ('search_index_state', '\"stale\"', '2026-10-30T06:00:00.000Z');",
        )
        .expect("seed authoritative search documents");

    let rebuilt = search_repository::rebuild(&mut connection, Some(&[SearchEntityType::Journal]))
        .expect("rebuild journal search documents");

    assert_eq!(rebuilt.indexed_count, 1);
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
