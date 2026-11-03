use dailyflow_desktop::db::{data_health, migrations};
use rusqlite::Connection;

fn connection() -> Connection {
    let mut connection = Connection::open_in_memory().expect("open in-memory database");
    migrations::run(&mut connection).expect("run migrations");
    connection
}

#[test]
fn reports_actionable_corruption_without_deleting_authoritative_content() {
    let connection = connection();
    connection
        .pragma_update(None, "foreign_keys", "OFF")
        .expect("allow corrupt relationship fixture");
    connection
        .execute_batch(
            "INSERT INTO journals (
               id, journal_date, timezone, title, content_json, content_markdown,
               content_plain_text, editor_schema_version, projection_version,
               content_hash, excerpt, status, revision, created_at, updated_at
             ) VALUES (
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c41', '2026-11-03',
               'Asia/Shanghai', '健康检查', '{\"type\":\"doc\",\"content\":[]}',
               '健康检查', '正文仍可读', 1, 1,
               'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
               '正文仍可读', 'active', 1,
               '2026-11-03T04:00:00.000Z', '2026-11-03T04:00:00.000Z'
             );
             INSERT INTO attachment_links (
               id, blob_id, owner_type, owner_id, display_name, alt_text, is_inline,
               sort_order, created_at
             ) VALUES (
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c42',
               '0198e2f4-7e33-7c70-a8b2-18c1520f9c43',
               'journal', '0198e2f4-7e33-7c70-a8b2-18c1520f9c41',
               'missing.bin', '', 0, 0, '2026-11-03T04:00:00.000Z'
             );
             INSERT INTO app_metadata (key, value_json, updated_at)
             VALUES ('search_index_state', '\"failed\"', '2026-11-03T04:00:00.000Z');",
        )
        .expect("seed unhealthy database");

    let snapshot = data_health::inspect(&connection).expect("inspect data health");

    assert_eq!(snapshot.facts.integrity, "ok");
    assert!(snapshot.facts.foreign_key_violation_count > 0);
    assert_eq!(snapshot.facts.invalid_attachment_link_count, 1);
    assert_eq!(snapshot.facts.stale_projection_count, 1);
    assert_eq!(snapshot.facts.search_index_state, "failed");
    assert_eq!(snapshot.storage.storage_kind, "sqlite");
    assert!(snapshot.storage.location_label.contains("SQLite"));
    assert!(!snapshot.storage.location_label.contains(":\\"));

    let body: String = connection
        .query_row(
            "SELECT content_plain_text FROM journals WHERE id = ?1",
            ["0198e2f4-7e33-7c70-a8b2-18c1520f9c41"],
            |row| row.get(0),
        )
        .expect("read authoritative body");
    assert_eq!(body, "正文仍可读");
}
