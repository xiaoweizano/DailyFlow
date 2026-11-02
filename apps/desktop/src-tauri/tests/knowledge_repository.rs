use dailyflow_desktop::db::{
    knowledge_repository, migrations,
    models::{
        KnowledgeItem, KnowledgeKind, KnowledgeListQuery, KnowledgeSaveCommand, KnowledgeStatus,
    },
    StorageErrorCode,
};
use rusqlite::Connection;
use serde_json::json;

const FIRST_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c2b";
const SECOND_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c2c";
const CREATED_AT: &str = "2026-10-30T03:20:11.123Z";
const UPDATED_AT: &str = "2026-10-30T04:20:11.123Z";

fn connection() -> Connection {
    let mut connection = Connection::open_in_memory().expect("open in-memory database");
    migrations::run(&mut connection).expect("run migrations");
    connection
}

fn knowledge(id: &str, title: &str, updated_at: &str) -> KnowledgeItem {
    KnowledgeItem {
        id: id.to_owned(),
        kind: KnowledgeKind::Issue,
        status: KnowledgeStatus::Active,
        title: title.to_owned(),
        content_json: json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{ "type": "text", "text": "连接池耗尽" }]
            }]
        }),
        editor_schema_version: 1,
        content_hash: None,
        projection_version: 1,
        summary: "连接池耗尽后扩容恢复".to_owned(),
        revision: 1,
        source_journal_id: None,
        source_block_id: None,
        created_at: CREATED_AT.to_owned(),
        updated_at: updated_at.to_owned(),
        deleted_at: None,
    }
}

#[test]
fn saves_lists_updates_and_soft_deletes_knowledge_with_revision_checks() {
    let mut connection = connection();
    let first = knowledge_repository::save(
        &mut connection,
        &KnowledgeSaveCommand {
            item: knowledge(FIRST_ID, "数据库连接超时", CREATED_AT),
            expected_revision: None,
        },
    )
    .expect("create knowledge");
    assert_eq!(first.revision, 1);

    knowledge_repository::save(
        &mut connection,
        &KnowledgeSaveCommand {
            item: knowledge(SECOND_ID, "连接池扩容方案", UPDATED_AT),
            expected_revision: None,
        },
    )
    .expect("create second knowledge");

    let page = knowledge_repository::list(
        &connection,
        &KnowledgeListQuery {
            kind: Some(KnowledgeKind::Issue),
            status: Some(KnowledgeStatus::Active),
            from_date: Some("2026-10-01".to_owned()),
            to_date: Some("2026-10-31".to_owned()),
            cursor: None,
            limit: Some(1),
        },
    )
    .expect("list knowledge");
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].id, SECOND_ID);
    assert!(page.next_cursor.is_some());

    let mut edited = knowledge_repository::get_by_id(&connection, FIRST_ID)
        .expect("read knowledge")
        .expect("knowledge exists");
    edited.title = "数据库连接超时已解决".to_owned();
    edited.updated_at = UPDATED_AT.to_owned();
    let edited = knowledge_repository::save(
        &mut connection,
        &KnowledgeSaveCommand {
            item: edited,
            expected_revision: Some(1),
        },
    )
    .expect("update knowledge");
    assert_eq!(edited.revision, 2);

    let conflict = knowledge_repository::save(
        &mut connection,
        &KnowledgeSaveCommand {
            item: {
                let mut stale = edited.clone();
                stale.title = "过期更新".to_owned();
                stale
            },
            expected_revision: Some(1),
        },
    )
    .expect_err("stale update must fail");
    assert_eq!(conflict.code, StorageErrorCode::Conflict);

    knowledge_repository::soft_delete(&mut connection, FIRST_ID, 2, UPDATED_AT)
        .expect("soft delete knowledge");
    assert!(knowledge_repository::get_by_id(&connection, FIRST_ID)
        .expect("read deleted knowledge")
        .is_none());
}

#[test]
fn cursor_paginates_knowledge_in_updated_order_without_duplicates() {
    let mut connection = connection();
    for (id, title, updated_at) in [
        (FIRST_ID, "较早记录", CREATED_AT),
        (SECOND_ID, "较晚记录", UPDATED_AT),
    ] {
        knowledge_repository::save(
            &mut connection,
            &KnowledgeSaveCommand {
                item: knowledge(id, title, updated_at),
                expected_revision: None,
            },
        )
        .expect("seed knowledge");
    }

    let first_page = knowledge_repository::list(
        &connection,
        &KnowledgeListQuery {
            kind: None,
            status: None,
            from_date: None,
            to_date: None,
            cursor: None,
            limit: Some(1),
        },
    )
    .expect("first page");
    assert_eq!(first_page.items[0].id, SECOND_ID);

    let second_page = knowledge_repository::list(
        &connection,
        &KnowledgeListQuery {
            kind: None,
            status: None,
            from_date: None,
            to_date: None,
            cursor: first_page.next_cursor,
            limit: Some(1),
        },
    )
    .expect("second page");
    assert_eq!(second_page.items[0].id, FIRST_ID);
    assert!(second_page.next_cursor.is_none());
}
