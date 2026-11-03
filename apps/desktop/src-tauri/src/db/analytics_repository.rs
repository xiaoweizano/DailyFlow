use rusqlite::Connection;

use super::{
    models::{
        AnalyticsJournalSource, AnalyticsKnowledgeSource, AnalyticsPeriodQuery, AnalyticsSource,
        AnalyticsTaskSource, KnowledgeKind, TaskStatus,
    },
    StorageError,
};

fn is_valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
    {
        return false;
    }

    let Ok(year) = value[0..4].parse::<i32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u32>() else {
        return false;
    };
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap_year => 29,
        2 => 28,
        _ => return false,
    };

    (1..=days_in_month).contains(&day)
}

fn validate_query(query: &AnalyticsPeriodQuery) -> Result<(), StorageError> {
    if !is_valid_date(&query.start) || !is_valid_date(&query.end) {
        return Err(StorageError::validation(
            "analytics range must use valid YYYY-MM-DD dates",
        ));
    }
    if query.start > query.end {
        return Err(StorageError::validation(
            "analytics range start must be on or before its end",
        ));
    }
    if query.timezone.trim().is_empty() {
        return Err(StorageError::validation(
            "analytics timezone must not be blank",
        ));
    }
    Ok(())
}

fn read_journal_tags(
    connection: &Connection,
    journal_id: &str,
) -> Result<Vec<String>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT t.name
         FROM journal_tags jt
         JOIN tags t ON t.id = jt.tag_id
         WHERE jt.journal_id = ?1
         ORDER BY t.name_normalized",
    )?;
    let rows = statement.query_map([journal_id], |row| row.get(0))?;
    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

fn read_knowledge_tags(
    connection: &Connection,
    knowledge_item_id: &str,
) -> Result<Vec<String>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT t.name
         FROM knowledge_tags kt
         JOIN tags t ON t.id = kt.tag_id
         WHERE kt.knowledge_item_id = ?1
         ORDER BY t.name_normalized",
    )?;
    let rows = statement.query_map([knowledge_item_id], |row| row.get(0))?;
    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

pub fn get_source(
    connection: &Connection,
    query: &AnalyticsPeriodQuery,
) -> Result<AnalyticsSource, StorageError> {
    validate_query(query)?;

    let mut journal_statement = connection.prepare(
        "SELECT id, journal_date, title, content_plain_text, deleted_at
         FROM journals
         WHERE journal_date BETWEEN ?1 AND ?2
           AND status = 'active'
           AND deleted_at IS NULL
         ORDER BY journal_date, id",
    )?;
    let journal_rows = journal_statement.query_map([&query.start, &query.end], |row| {
        Ok(AnalyticsJournalSource {
            id: row.get(0)?,
            journal_date: row.get(1)?,
            title: row.get(2)?,
            content_plain_text: row.get(3)?,
            tags: Vec::new(),
            deleted_at: row.get(4)?,
        })
    })?;
    let mut journals = Vec::new();
    for row in journal_rows {
        let mut journal = row?;
        journal.tags = read_journal_tags(connection, &journal.id)?;
        journals.push(journal);
    }

    let mut task_statement = connection.prepare(
        "SELECT id, status, completed_at, deleted_at
         FROM tasks
         ORDER BY id",
    )?;
    let task_rows = task_statement.query_map([], |row| {
        let status = row.get::<_, String>(1)?;
        Ok((
            row.get::<_, String>(0)?,
            TaskStatus::from_database(&status).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    let mut tasks = Vec::new();
    for row in task_rows {
        let (id, status, completed_at, deleted_at) = row?;
        tasks.push(AnalyticsTaskSource {
            id,
            status,
            completed_at,
            deleted_at,
        });
    }

    let mut knowledge_statement = connection.prepare(
        "SELECT id, kind, title, created_at, deleted_at
         FROM knowledge_items
         WHERE status = 'active'
           AND deleted_at IS NULL
         ORDER BY created_at, id",
    )?;
    let knowledge_rows = knowledge_statement.query_map([], |row| {
        let kind = row.get::<_, String>(1)?;
        Ok((
            row.get::<_, String>(0)?,
            KnowledgeKind::from_database(&kind).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    })?;
    let mut knowledge = Vec::new();
    for row in knowledge_rows {
        let (id, kind, title, created_at, deleted_at) = row?;
        knowledge.push(AnalyticsKnowledgeSource {
            tags: read_knowledge_tags(connection, &id)?,
            id,
            kind,
            title,
            created_at,
            deleted_at,
        });
    }

    Ok(AnalyticsSource {
        journals,
        tasks,
        knowledge,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use crate::db::{
        migrations,
        models::{AnalyticsPeriodQuery, KnowledgeKind, TaskStatus},
        StorageErrorCode,
    };

    use super::get_source;

    const JOURNAL_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c26";
    const ARCHIVED_JOURNAL_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c27";
    const TASK_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c29";
    const KNOWLEDGE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c30";
    const CONTENT_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const NOW: &str = "2026-10-30T03:20:11.123Z";

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        migrations::run(&mut connection).expect("run migrations");

        for (id, status, journal_date) in [
            (JOURNAL_ID, "active", "2026-10-30"),
            (ARCHIVED_JOURNAL_ID, "archived", "2026-10-29"),
        ] {
            connection
                .execute(
                    "INSERT INTO journals (
                       id, journal_date, timezone, title, content_json, content_markdown,
                       content_plain_text, editor_schema_version, projection_version,
                       content_hash, excerpt, status, revision, created_at, updated_at
                     ) VALUES (?1, ?2, 'Asia/Shanghai', '发布复盘', '{\"type\":\"doc\"}',
                               '', '修复离线导入问题', 1, 1, ?3, '', ?4, 1, ?5, ?5)",
                    params![id, journal_date, CONTENT_HASH, status, NOW],
                )
                .expect("seed journal");
        }

        connection
            .execute(
                "INSERT INTO tasks (
                   id, title, description_text, status, priority, completed_at,
                   revision, created_at, updated_at
                 ) VALUES (?1, '完成发布', '', 'done', 'normal', ?2, 1, ?2, ?2)",
                params![TASK_ID, NOW],
            )
            .expect("seed task");
        connection
            .execute(
                "INSERT INTO knowledge_items (
                   id, kind, status, title, content_json, content_markdown, content_plain_text,
                   editor_schema_version, projection_version, content_hash, summary, revision,
                   created_at, updated_at
                 ) VALUES (?1, 'issue', 'active', '导入编码异常', '{\"type\":\"doc\"}', '', '',
                           1, 1, ?2, '', 1, ?3, ?3)",
                params![KNOWLEDGE_ID, CONTENT_HASH, NOW],
            )
            .expect("seed knowledge");

        for (name, normalized, journal_id, knowledge_id) in [
            ("Rust", "rust", Some(JOURNAL_ID), None),
            ("Import", "import", None, Some(KNOWLEDGE_ID)),
        ] {
            let tag_id = if normalized == "rust" {
                "0198e2f4-7e33-7c70-a8b2-18c1520f9c31"
            } else {
                "0198e2f4-7e33-7c70-a8b2-18c1520f9c32"
            };
            connection
                .execute(
                    "INSERT INTO tags (id, name, name_normalized, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?4)",
                    params![tag_id, name, normalized, NOW],
                )
                .expect("seed tag");
            if let Some(journal_id) = journal_id {
                connection
                    .execute(
                        "INSERT INTO journal_tags (journal_id, tag_id) VALUES (?1, ?2)",
                        params![journal_id, tag_id],
                    )
                    .expect("link journal tag");
            }
            if let Some(knowledge_id) = knowledge_id {
                connection
                    .execute(
                        "INSERT INTO knowledge_tags (knowledge_item_id, tag_id) VALUES (?1, ?2)",
                        params![knowledge_id, tag_id],
                    )
                    .expect("link knowledge tag");
            }
        }

        connection
    }

    #[test]
    fn loads_active_analytics_sources_and_tag_names() {
        let connection = connection();
        let source = get_source(
            &connection,
            &AnalyticsPeriodQuery {
                start: "2026-10-01".to_owned(),
                end: "2026-10-31".to_owned(),
                timezone: "Asia/Shanghai".to_owned(),
            },
        )
        .expect("load analytics source");

        assert_eq!(source.journals.len(), 1);
        assert_eq!(source.journals[0].id, JOURNAL_ID);
        assert_eq!(source.journals[0].tags, ["Rust"]);
        assert_eq!(source.tasks.len(), 1);
        assert_eq!(source.tasks[0].status, TaskStatus::Done);
        assert_eq!(source.knowledge.len(), 1);
        assert_eq!(source.knowledge[0].kind, KnowledgeKind::Issue);
        assert_eq!(source.knowledge[0].tags, ["Import"]);
    }

    #[test]
    fn rejects_invalid_analytics_ranges_and_blank_timezones() {
        let connection = connection();
        let invalid_range = get_source(
            &connection,
            &AnalyticsPeriodQuery {
                start: "2026-11-01".to_owned(),
                end: "2026-10-01".to_owned(),
                timezone: "Asia/Shanghai".to_owned(),
            },
        )
        .expect_err("reversed range must fail");
        assert_eq!(invalid_range.code, StorageErrorCode::ValidationError);

        let blank_timezone = get_source(
            &connection,
            &AnalyticsPeriodQuery {
                start: "2026-10-01".to_owned(),
                end: "2026-10-31".to_owned(),
                timezone: "  ".to_owned(),
            },
        )
        .expect_err("blank timezone must fail");
        assert_eq!(blank_timezone.code, StorageErrorCode::ValidationError);
    }
}
