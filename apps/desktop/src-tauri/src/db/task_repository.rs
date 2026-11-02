use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Row,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    decode_cursor, encode_cursor,
    models::{
        Page, Task, TaskCompleteCommand, TaskListQuery, TaskPriority, TaskSaveCommand, TaskStatus,
    },
    resolve_page_size, StorageError,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskCursor {
    updated_at: String,
    id: String,
}

fn task_select() -> &'static str {
    "SELECT id, title, description_json, description_text, status, priority, due_date,
            completed_at, journal_id, knowledge_item_id, revision, created_at, updated_at,
            deleted_at
     FROM tasks"
}

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    let description_json = row.get::<_, Option<String>>(2)?;
    let status = row.get::<_, String>(4)?;
    let priority = row.get::<_, String>(5)?;

    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description_json: description_json
            .map(|value| serde_json::from_str(&value))
            .transpose()
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
        description_text: row.get(3)?,
        status: TaskStatus::from_database(&status).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        priority: TaskPriority::from_database(&priority).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                5,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        due_date: row.get(6)?,
        completed_at: row.get(7)?,
        journal_id: row.get(8)?,
        knowledge_item_id: row.get(9)?,
        revision: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        deleted_at: row.get(13)?,
    })
}

fn is_valid_id(value: &str) -> bool {
    value.len() == 36 && Uuid::parse_str(value).is_ok()
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

fn validate_task(task: &Task) -> Result<(), StorageError> {
    if !is_valid_id(&task.id) {
        return Err(StorageError::validation("task id must be a UUID"));
    }
    if task.title.trim().is_empty() || task.title.chars().count() > 500 {
        return Err(StorageError::validation(
            "task title must contain between 1 and 500 characters",
        ));
    }
    if task.description_text.chars().count() > 20_000 {
        return Err(StorageError::validation(
            "task descriptionText must not exceed 20000 characters",
        ));
    }
    if let Some(due_date) = &task.due_date {
        if !is_valid_date(due_date) {
            return Err(StorageError::validation(
                "task dueDate must be a valid YYYY-MM-DD date",
            ));
        }
    }
    if task.status == TaskStatus::Done && task.completed_at.is_none() {
        return Err(StorageError::validation(
            "task completedAt is required when status is done",
        ));
    }
    if task.status != TaskStatus::Done && task.completed_at.is_some() {
        return Err(StorageError::validation(
            "task completedAt must be null when status is not done",
        ));
    }
    if task
        .journal_id
        .as_deref()
        .is_some_and(|value| !is_valid_id(value))
        || task
            .knowledge_item_id
            .as_deref()
            .is_some_and(|value| !is_valid_id(value))
    {
        return Err(StorageError::validation(
            "task association ids must be UUIDs",
        ));
    }
    Ok(())
}

fn validate_date_range(from: Option<&str>, to: Option<&str>) -> Result<(), StorageError> {
    if from.is_some_and(|value| !is_valid_date(value))
        || to.is_some_and(|value| !is_valid_date(value))
    {
        return Err(StorageError::validation(
            "task date filters must use valid YYYY-MM-DD values",
        ));
    }
    if let (Some(from), Some(to)) = (from, to) {
        if from > to {
            return Err(StorageError::validation(
                "dueFrom must be on or before dueTo",
            ));
        }
    }
    Ok(())
}

pub fn get_by_id(connection: &Connection, task_id: &str) -> Result<Option<Task>, StorageError> {
    if !is_valid_id(task_id) {
        return Err(StorageError::validation("task id must be a UUID"));
    }
    connection
        .query_row(
            &format!("{} WHERE id = ?1 AND deleted_at IS NULL", task_select()),
            [task_id],
            task_from_row,
        )
        .optional()
        .map_err(StorageError::from)
}

pub fn list(connection: &Connection, query: &TaskListQuery) -> Result<Page<Task>, StorageError> {
    validate_date_range(query.due_from.as_deref(), query.due_to.as_deref())?;
    let limit = resolve_page_size(query.limit)?;
    let cursor = query
        .cursor
        .as_deref()
        .map(decode_cursor::<TaskCursor>)
        .transpose()?;
    let mut clauses = vec!["deleted_at IS NULL".to_owned()];
    let mut values: Vec<SqlValue> = Vec::new();

    if let Some(statuses) = &query.status {
        if statuses.is_empty() {
            clauses.push("1 = 0".to_owned());
        } else {
            let placeholders = vec!["?"; statuses.len()].join(", ");
            clauses.push(format!("status IN ({placeholders})"));
            values.extend(
                statuses
                    .iter()
                    .map(|status| SqlValue::Text(status.as_str().to_owned())),
            );
        }
    }
    if let Some(due_from) = &query.due_from {
        clauses.push("due_date IS NOT NULL AND due_date >= ?".to_owned());
        values.push(SqlValue::Text(due_from.clone()));
    }
    if let Some(due_to) = &query.due_to {
        clauses.push("due_date IS NOT NULL AND due_date <= ?".to_owned());
        values.push(SqlValue::Text(due_to.clone()));
    }
    if let Some(cursor) = &cursor {
        clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))".to_owned());
        values.extend([
            SqlValue::Text(cursor.updated_at.clone()),
            SqlValue::Text(cursor.updated_at.clone()),
            SqlValue::Text(cursor.id.clone()),
        ]);
    }
    values.push(SqlValue::Integer((limit + 1) as i64));

    let sql = format!(
        "{} WHERE {} ORDER BY updated_at DESC, id DESC LIMIT ?",
        task_select(),
        clauses.join(" AND ")
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), task_from_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    let has_more = records.len() > limit;
    records.truncate(limit);
    let next_cursor = if has_more {
        records
            .last()
            .map(|task| {
                encode_cursor(&TaskCursor {
                    updated_at: task.updated_at.clone(),
                    id: task.id.clone(),
                })
            })
            .transpose()?
    } else {
        None
    };

    Ok(Page {
        items: records,
        next_cursor,
    })
}

pub fn save(connection: &mut Connection, command: &TaskSaveCommand) -> Result<Task, StorageError> {
    validate_task(&command.task)?;
    if command
        .expected_revision
        .is_some_and(|revision| revision < 1)
    {
        return Err(StorageError::validation(
            "expectedRevision must be positive",
        ));
    }

    let transaction = connection.transaction()?;
    let existing = transaction
        .query_row(
            "SELECT revision, created_at, deleted_at FROM tasks WHERE id = ?1",
            [&command.task.id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?;

    match command.expected_revision {
        None => {
            if existing
                .as_ref()
                .is_some_and(|(_, _, deleted_at)| deleted_at.is_none())
            {
                return Err(StorageError::conflict("task already exists"));
            }
        }
        Some(expected_revision) => match &existing {
            None => return Err(StorageError::not_found("task does not exist")),
            Some((_, _, deleted_at)) if deleted_at.is_some() => {
                return Err(StorageError::not_found("task does not exist"));
            }
            Some((revision, _, _)) if *revision != expected_revision => {
                return Err(StorageError::conflict(format!(
                    "task revision conflict: expected {expected_revision}, found {revision}"
                )));
            }
            Some(_) => {}
        },
    }

    let revision = existing
        .as_ref()
        .map_or(1, |(revision, _, _)| revision.saturating_add(1));
    let created_at = existing.as_ref().map_or_else(
        || command.task.created_at.clone(),
        |(_, created_at, _)| created_at.clone(),
    );
    let description_json = command
        .task
        .description_json
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    transaction.execute(
        "INSERT INTO tasks (
           id, title, description_json, description_text, status, priority, due_date,
           completed_at, journal_id, knowledge_item_id, revision, created_at, updated_at,
           deleted_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description_json = excluded.description_json,
           description_text = excluded.description_text,
           status = excluded.status,
           priority = excluded.priority,
           due_date = excluded.due_date,
           completed_at = excluded.completed_at,
           journal_id = excluded.journal_id,
           knowledge_item_id = excluded.knowledge_item_id,
           revision = excluded.revision,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = NULL",
        params![
            command.task.id,
            command.task.title,
            description_json,
            command.task.description_text,
            command.task.status.as_str(),
            command.task.priority.as_str(),
            command.task.due_date,
            command.task.completed_at,
            command.task.journal_id,
            command.task.knowledge_item_id,
            revision,
            created_at,
            command.task.updated_at,
        ],
    )?;
    transaction.commit()?;

    Ok(Task {
        revision,
        created_at,
        deleted_at: None,
        ..command.task.clone()
    })
}

pub fn complete(
    connection: &mut Connection,
    command: &TaskCompleteCommand,
) -> Result<Task, StorageError> {
    if !is_valid_id(&command.task_id) {
        return Err(StorageError::validation("taskId must be a UUID"));
    }
    if command.expected_revision < 1 {
        return Err(StorageError::validation(
            "expectedRevision must be positive",
        ));
    }

    let transaction = connection.transaction()?;
    let current = transaction
        .query_row(
            &format!("{} WHERE id = ?1 AND deleted_at IS NULL", task_select()),
            [&command.task_id],
            task_from_row,
        )
        .optional()?
        .ok_or_else(|| StorageError::not_found("task does not exist"))?;
    if current.revision != command.expected_revision {
        return Err(StorageError::conflict(format!(
            "task revision conflict: expected {}, found {}",
            command.expected_revision, current.revision
        )));
    }

    transaction.execute(
        "UPDATE tasks
         SET status = 'done', completed_at = ?1, updated_at = ?1, revision = revision + 1
         WHERE id = ?2",
        params![command.completed_at, command.task_id],
    )?;
    transaction.commit()?;

    Ok(Task {
        status: TaskStatus::Done,
        completed_at: Some(command.completed_at.clone()),
        updated_at: command.completed_at.clone(),
        revision: current.revision + 1,
        ..current
    })
}

pub fn soft_delete(
    connection: &mut Connection,
    task_id: &str,
    expected_revision: i64,
    deleted_at: &str,
) -> Result<(), StorageError> {
    if !is_valid_id(task_id) {
        return Err(StorageError::validation("taskId must be a UUID"));
    }
    if expected_revision < 1 {
        return Err(StorageError::validation(
            "expectedRevision must be positive",
        ));
    }

    let transaction = connection.transaction()?;
    let revision = transaction
        .query_row(
            "SELECT revision FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            [task_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
        .ok_or_else(|| StorageError::not_found("task does not exist"))?;
    if revision != expected_revision {
        return Err(StorageError::conflict(format!(
            "task revision conflict: expected {expected_revision}, found {revision}"
        )));
    }

    transaction.execute(
        "UPDATE tasks
         SET deleted_at = ?1, updated_at = ?1, revision = revision + 1
         WHERE id = ?2",
        params![deleted_at, task_id],
    )?;
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;

    use crate::db::{
        migrations,
        models::{
            Task, TaskCompleteCommand, TaskListQuery, TaskPriority, TaskSaveCommand, TaskStatus,
        },
        StorageErrorCode,
    };

    use super::{complete, get_by_id, list, save, soft_delete};

    const TASK_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c29";
    const OTHER_TASK_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c2a";
    const CREATED_AT: &str = "2026-10-30T03:20:11.123Z";
    const UPDATED_AT: &str = "2026-10-30T04:20:11.123Z";
    const COMPLETED_AT: &str = "2026-10-30T05:20:11.123Z";

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        migrations::run(&mut connection).expect("run migrations");
        connection
    }

    fn task(id: &str, title: &str, status: TaskStatus, due_date: Option<&str>) -> Task {
        Task {
            id: id.to_owned(),
            title: title.to_owned(),
            description_json: Some(json!({"type": "doc", "content": []})),
            description_text: "确认导入编码".to_owned(),
            status,
            priority: TaskPriority::High,
            due_date: due_date.map(ToOwned::to_owned),
            completed_at: None,
            journal_id: None,
            knowledge_item_id: None,
            revision: 1,
            created_at: CREATED_AT.to_owned(),
            updated_at: CREATED_AT.to_owned(),
            deleted_at: None,
        }
    }

    #[test]
    fn saves_lists_completes_and_soft_deletes_tasks_with_revision_checks() {
        let mut connection = connection();
        let first = save(
            &mut connection,
            &TaskSaveCommand {
                task: task(
                    TASK_ID,
                    "补齐离线导入测试",
                    TaskStatus::InProgress,
                    Some("2026-10-30"),
                ),
                expected_revision: None,
            },
        )
        .expect("create task");
        assert_eq!(first.revision, 1);

        save(
            &mut connection,
            &TaskSaveCommand {
                task: task(
                    OTHER_TASK_ID,
                    "整理发布记录",
                    TaskStatus::Open,
                    Some("2026-11-02"),
                ),
                expected_revision: None,
            },
        )
        .expect("create second task");

        let page = list(
            &connection,
            &TaskListQuery {
                status: Some(vec![TaskStatus::Open, TaskStatus::InProgress]),
                due_from: Some("2026-10-01".to_owned()),
                due_to: Some("2026-10-31".to_owned()),
                cursor: None,
                limit: Some(1),
            },
        )
        .expect("list tasks");
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].id, TASK_ID);
        assert!(page.next_cursor.is_none());

        let mut edited = page.items[0].clone();
        edited.title = "补齐离线导入回归测试".to_owned();
        edited.updated_at = UPDATED_AT.to_owned();
        let edited = save(
            &mut connection,
            &TaskSaveCommand {
                task: edited,
                expected_revision: Some(1),
            },
        )
        .expect("update task");
        assert_eq!(edited.revision, 2);

        let completed = complete(
            &mut connection,
            &TaskCompleteCommand {
                task_id: TASK_ID.to_owned(),
                completed_at: COMPLETED_AT.to_owned(),
                expected_revision: 2,
            },
        )
        .expect("complete task");
        assert_eq!(completed.status, TaskStatus::Done);
        assert_eq!(completed.revision, 3);
        assert_eq!(completed.completed_at.as_deref(), Some(COMPLETED_AT));

        let conflict = complete(
            &mut connection,
            &TaskCompleteCommand {
                task_id: TASK_ID.to_owned(),
                completed_at: COMPLETED_AT.to_owned(),
                expected_revision: 2,
            },
        )
        .expect_err("stale completion must fail");
        assert_eq!(conflict.code, StorageErrorCode::Conflict);

        soft_delete(&mut connection, TASK_ID, 3, UPDATED_AT).expect("soft delete task");
        assert!(get_by_id(&connection, TASK_ID)
            .expect("read deleted task")
            .is_none());
    }

    #[test]
    fn date_cursor_paginates_tasks_in_updated_order() {
        let mut connection = connection();
        for (id, title, updated_at) in [
            (TASK_ID, "较早任务", CREATED_AT),
            (OTHER_TASK_ID, "较晚任务", UPDATED_AT),
        ] {
            let mut value = task(id, title, TaskStatus::Open, Some("2026-10-30"));
            value.updated_at = updated_at.to_owned();
            save(
                &mut connection,
                &TaskSaveCommand {
                    task: value,
                    expected_revision: None,
                },
            )
            .expect("seed task");
        }

        let first_page = list(
            &connection,
            &TaskListQuery {
                status: None,
                due_from: None,
                due_to: None,
                cursor: None,
                limit: Some(1),
            },
        )
        .expect("first page");
        assert_eq!(first_page.items[0].id, OTHER_TASK_ID);
        let cursor = first_page.next_cursor.expect("next cursor");

        let second_page = list(
            &connection,
            &TaskListQuery {
                status: None,
                due_from: None,
                due_to: None,
                cursor: Some(cursor),
                limit: Some(1),
            },
        )
        .expect("second page");
        assert_eq!(second_page.items[0].id, TASK_ID);
        assert!(second_page.next_cursor.is_none());
    }
}
