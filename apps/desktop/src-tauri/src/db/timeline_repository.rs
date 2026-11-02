use std::collections::BTreeMap;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::{
    decode_cursor, encode_cursor, resolve_page_size,
    models::{Page, TimelineCalendarQuery, TimelineDaySummary, TimelineListQuery},
    StorageError,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TimelineCursor {
    date: String,
}

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

fn validate_range(from: &str, to: &str) -> Result<(), StorageError> {
    if !is_valid_date(from) || !is_valid_date(to) {
        return Err(StorageError::validation(
            "timeline range must use valid YYYY-MM-DD dates",
        ));
    }
    if from > to {
        return Err(StorageError::validation(
            "timeline range start must be on or before its end",
        ));
    }
    Ok(())
}

fn load_range(
    connection: &Connection,
    from: &str,
    to: &str,
) -> Result<Vec<TimelineDaySummary>, StorageError> {
    validate_range(from, to)?;
    let mut by_date = BTreeMap::<String, TimelineDaySummary>::new();

    let mut journal_statement = connection.prepare(
        "SELECT id, journal_date, title, excerpt, updated_at
         FROM journals
         WHERE journal_date BETWEEN ?1 AND ?2
           AND status = 'active'
           AND deleted_at IS NULL
         ORDER BY journal_date",
    )?;
    let journal_rows = journal_statement.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    for row in journal_rows {
        let (id, date, title, excerpt, updated_at) = row?;
        let entry = by_date
            .entry(date.clone())
            .or_insert_with(|| TimelineDaySummary {
                date,
                journal_id: None,
                journal_count: 0,
                task_due_count: 0,
                title: String::new(),
                excerpt: String::new(),
                updated_at: None,
            });
        entry.journal_count += 1;
        if entry
            .updated_at
            .as_deref()
            .is_none_or(|current| current < updated_at.as_str())
        {
            entry.journal_id = Some(id);
            entry.title = title;
            entry.excerpt = excerpt;
            entry.updated_at = Some(updated_at);
        }
    }

    let mut task_statement = connection.prepare(
        "SELECT due_date, COUNT(*), MAX(updated_at)
         FROM tasks
         WHERE due_date BETWEEN ?1 AND ?2
           AND status IN ('open', 'in_progress')
           AND deleted_at IS NULL
         GROUP BY due_date
         ORDER BY due_date",
    )?;
    let task_rows = task_statement.query_map(params![from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in task_rows {
        let (date, count, updated_at) = row?;
        let entry = by_date
            .entry(date.clone())
            .or_insert_with(|| TimelineDaySummary {
                date,
                journal_id: None,
                journal_count: 0,
                task_due_count: 0,
                title: "任务到期".to_owned(),
                excerpt: String::new(),
                updated_at: None,
            });
        entry.task_due_count = count;
        if entry.journal_count == 0 {
            entry.title = "任务到期".to_owned();
            entry.excerpt = format!("{count} 个任务到期");
        }
        if entry
            .updated_at
            .as_deref()
            .is_none_or(|current| current < updated_at.as_str())
        {
            entry.updated_at = Some(updated_at);
        }
    }

    let mut entries = by_date.into_values().collect::<Vec<_>>();
    entries.sort_by(|left, right| right.date.cmp(&left.date));
    Ok(entries)
}

pub fn get_calendar(
    connection: &Connection,
    query: &TimelineCalendarQuery,
) -> Result<Vec<TimelineDaySummary>, StorageError> {
    load_range(connection, &query.from, &query.to)
}

pub fn list_entries(
    connection: &Connection,
    query: &TimelineListQuery,
) -> Result<Page<TimelineDaySummary>, StorageError> {
    let limit = resolve_page_size(query.limit)?;
    let cursor = query
        .cursor
        .as_deref()
        .map(decode_cursor::<TimelineCursor>)
        .transpose()?;
    let (Some(from), Some(to)) = (query.from_date.as_deref(), query.to_date.as_deref()) else {
        return Ok(Page {
            items: Vec::new(),
            next_cursor: None,
        });
    };
    let mut entries = load_range(connection, from, to)?;
    if let Some(cursor) = &cursor {
        entries.retain(|entry| entry.date < cursor.date);
    }
    let has_more = entries.len() > limit;
    entries.truncate(limit);
    let next_cursor = if has_more {
        entries
            .last()
            .map(|entry| {
                encode_cursor(&TimelineCursor {
                    date: entry.date.clone(),
                })
            })
            .transpose()?
    } else {
        None
    };

    Ok(Page {
        items: entries,
        next_cursor,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use crate::db::{
        migrations,
        models::{TimelineCalendarQuery, TimelineListQuery},
    };

    use super::{get_calendar, list_entries};

    const JOURNAL_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c26";
    const CONTENT_HASH: &str =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const TASK_ONE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c29";
    const TASK_TWO_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c2a";
    const TASK_DONE_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c2b";
    const NOW: &str = "2026-10-30T03:20:11.123Z";

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        migrations::run(&mut connection).expect("run migrations");
        connection
            .execute(
                "INSERT INTO journals (
                   id, journal_date, timezone, title, content_json, content_markdown,
                   content_plain_text, editor_schema_version, projection_version,
                   content_hash, excerpt, status, revision, created_at, updated_at
                 ) VALUES (?1, '2026-10-30', 'Asia/Shanghai', '发布复盘', '{\"type\":\"doc\"}',
                           '', '修复了离线导入问题', 1, 1, ?2, '修复了离线导入问题',
                           'active', 1, ?3, ?3)",
                params![JOURNAL_ID, CONTENT_HASH, NOW],
            )
            .expect("seed journal");
        for (id, status, title) in [
            (TASK_ONE_ID, "open", "补齐离线导入测试"),
            (TASK_TWO_ID, "in_progress", "整理发布记录"),
            (TASK_DONE_ID, "done", "已发布"),
        ] {
            connection
                .execute(
                    "INSERT INTO tasks (
                       id, title, description_text, status, priority, due_date,
                       completed_at, revision, created_at, updated_at
                     ) VALUES (?1, ?2, '', ?3, 'normal', '2026-10-30', ?4, 1, ?5, ?5)",
                    params![
                        id,
                        title,
                        status,
                        (status == "done").then_some(NOW),
                        NOW
                    ],
                )
                .expect("seed task");
        }
        connection
    }

    #[test]
    fn aggregates_journal_and_open_task_counts_without_journal_content() {
        let connection = connection();
        let calendar = get_calendar(
            &connection,
            &TimelineCalendarQuery {
                from: "2026-10-01".to_owned(),
                to: "2026-10-31".to_owned(),
            },
        )
        .expect("load calendar");

        assert_eq!(calendar.len(), 1);
        assert_eq!(calendar[0].date, "2026-10-30");
        assert_eq!(calendar[0].journal_id.as_deref(), Some(JOURNAL_ID));
        assert_eq!(calendar[0].journal_count, 1);
        assert_eq!(calendar[0].task_due_count, 2);
        assert_eq!(calendar[0].title, "发布复盘");
        assert_eq!(calendar[0].excerpt, "修复了离线导入问题");
    }

    #[test]
    fn paginates_timeline_entries_with_a_date_cursor() {
        let connection = connection();
        let first_page = list_entries(
            &connection,
            &TimelineListQuery {
                from_date: Some("2026-10-01".to_owned()),
                to_date: Some("2026-10-31".to_owned()),
                cursor: None,
                limit: Some(1),
            },
        )
        .expect("first timeline page");

        assert_eq!(first_page.items.len(), 1);
        assert!(first_page.next_cursor.is_none());
    }
}
