use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Row,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::{
    decode_cursor, encode_cursor,
    models::{
        KnowledgeItem, KnowledgeKind, KnowledgeListQuery, KnowledgeSaveCommand, KnowledgeStatus,
        Page,
    },
    resolve_page_size, StorageError,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KnowledgeCursor {
    updated_at: String,
    id: String,
}

fn knowledge_select() -> &'static str {
    "SELECT id, kind, status, title, content_json, editor_schema_version, content_hash,
            projection_version, summary, revision, source_journal_id, source_block_id,
            created_at, updated_at, deleted_at
     FROM knowledge_items"
}

fn knowledge_from_row(row: &Row<'_>) -> rusqlite::Result<KnowledgeItem> {
    let content_json = row.get::<_, String>(4)?;
    let kind = row.get::<_, String>(1)?;
    let status = row.get::<_, String>(2)?;

    Ok(KnowledgeItem {
        id: row.get(0)?,
        kind: KnowledgeKind::from_database(&kind).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                1,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        status: KnowledgeStatus::from_database(&status).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        title: row.get(3)?,
        content_json: serde_json::from_str(&content_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        editor_schema_version: row.get(5)?,
        content_hash: Some(row.get(6)?),
        projection_version: row.get(7)?,
        summary: row.get(8)?,
        revision: row.get(9)?,
        source_journal_id: row.get(10)?,
        source_block_id: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        deleted_at: row.get(14)?,
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

fn validate_date_range(from: Option<&str>, to: Option<&str>) -> Result<(), StorageError> {
    if from.is_some_and(|value| !is_valid_date(value))
        || to.is_some_and(|value| !is_valid_date(value))
    {
        return Err(StorageError::validation(
            "knowledge date filters must use valid YYYY-MM-DD values",
        ));
    }
    if let (Some(from), Some(to)) = (from, to) {
        if from > to {
            return Err(StorageError::validation(
                "fromDate must be on or before toDate",
            ));
        }
    }
    Ok(())
}

fn content_hash(item: &KnowledgeItem) -> Result<String, StorageError> {
    if let Some(hash) = &item.content_hash {
        if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(StorageError::validation(
                "knowledge contentHash must be a 64-character hexadecimal value",
            ));
        }
        return Ok(hash.to_ascii_lowercase());
    }

    let serialized = serde_json::to_vec(&item.content_json)?;
    let digest = Sha256::digest(serialized);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn validate_item(item: &KnowledgeItem) -> Result<String, StorageError> {
    if !is_valid_id(&item.id) {
        return Err(StorageError::validation("knowledge item id must be a UUID"));
    }
    if item.title.trim().is_empty() || item.title.chars().count() > 500 {
        return Err(StorageError::validation(
            "knowledge title must contain between 1 and 500 characters",
        ));
    }
    if item.summary.chars().count() > 20_000 {
        return Err(StorageError::validation(
            "knowledge summary must not exceed 20000 characters",
        ));
    }
    if item.editor_schema_version < 1 || item.projection_version < 1 {
        return Err(StorageError::validation(
            "knowledge schema and projection versions must be positive",
        ));
    }
    if item
        .source_journal_id
        .as_deref()
        .is_some_and(|value| !is_valid_id(value))
        || item
            .source_block_id
            .as_deref()
            .is_some_and(|value| !is_valid_id(value))
    {
        return Err(StorageError::validation(
            "knowledge source ids must be UUIDs",
        ));
    }
    content_hash(item)
}

pub fn get_by_id(
    connection: &Connection,
    knowledge_item_id: &str,
) -> Result<Option<KnowledgeItem>, StorageError> {
    if !is_valid_id(knowledge_item_id) {
        return Err(StorageError::validation("knowledge item id must be a UUID"));
    }
    connection
        .query_row(
            &format!(
                "{} WHERE id = ?1 AND deleted_at IS NULL",
                knowledge_select()
            ),
            [knowledge_item_id],
            knowledge_from_row,
        )
        .optional()
        .map_err(StorageError::from)
}

pub fn list(
    connection: &Connection,
    query: &KnowledgeListQuery,
) -> Result<Page<KnowledgeItem>, StorageError> {
    validate_date_range(query.from_date.as_deref(), query.to_date.as_deref())?;
    let limit = resolve_page_size(query.limit)?;
    let cursor = query
        .cursor
        .as_deref()
        .map(decode_cursor::<KnowledgeCursor>)
        .transpose()?;
    let status = query.status.unwrap_or(KnowledgeStatus::Active);
    let mut clauses = vec!["deleted_at IS NULL".to_owned(), "status = ?".to_owned()];
    let mut values = vec![SqlValue::Text(status.as_str().to_owned())];

    if let Some(kind) = query.kind {
        clauses.push("kind = ?".to_owned());
        values.push(SqlValue::Text(kind.as_str().to_owned()));
    }
    if let Some(from_date) = &query.from_date {
        clauses.push("substr(updated_at, 1, 10) >= ?".to_owned());
        values.push(SqlValue::Text(from_date.clone()));
    }
    if let Some(to_date) = &query.to_date {
        clauses.push("substr(updated_at, 1, 10) <= ?".to_owned());
        values.push(SqlValue::Text(to_date.clone()));
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
        knowledge_select(),
        clauses.join(" AND ")
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), knowledge_from_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    let has_more = records.len() > limit;
    records.truncate(limit);
    let next_cursor = if has_more {
        records
            .last()
            .map(|item| {
                encode_cursor(&KnowledgeCursor {
                    updated_at: item.updated_at.clone(),
                    id: item.id.clone(),
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

pub fn save(
    connection: &mut Connection,
    command: &KnowledgeSaveCommand,
) -> Result<KnowledgeItem, StorageError> {
    let content_hash = validate_item(&command.item)?;
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
            "SELECT revision, created_at, deleted_at FROM knowledge_items WHERE id = ?1",
            [&command.item.id],
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
            if existing.is_some() {
                return Err(StorageError::conflict("knowledge item already exists"));
            }
        }
        Some(expected_revision) => match &existing {
            None => return Err(StorageError::not_found("knowledge item does not exist")),
            Some((_, _, deleted_at)) if deleted_at.is_some() => {
                return Err(StorageError::not_found("knowledge item does not exist"));
            }
            Some((revision, _, _)) if *revision != expected_revision => {
                return Err(StorageError::conflict(format!(
                    "knowledge revision conflict: expected {expected_revision}, found {revision}"
                )));
            }
            Some(_) => {}
        },
    }

    let revision = existing
        .as_ref()
        .map_or(1, |(revision, _, _)| revision.saturating_add(1));
    let created_at = existing.as_ref().map_or_else(
        || command.item.created_at.clone(),
        |(_, created_at, _)| created_at.clone(),
    );
    let content_json = serde_json::to_string(&command.item.content_json)?;
    transaction.execute(
        "INSERT INTO knowledge_items (
           id, kind, status, title, content_json, content_markdown, content_plain_text,
           editor_schema_version, projection_version, content_hash, summary, revision,
           source_journal_id, source_block_id, created_at, updated_at, deleted_at
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, '', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL
         )
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           status = excluded.status,
           title = excluded.title,
           content_json = excluded.content_json,
           content_markdown = excluded.content_markdown,
           content_plain_text = excluded.content_plain_text,
           editor_schema_version = excluded.editor_schema_version,
           projection_version = excluded.projection_version,
           content_hash = excluded.content_hash,
           summary = excluded.summary,
           revision = excluded.revision,
           source_journal_id = excluded.source_journal_id,
           source_block_id = excluded.source_block_id,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = NULL",
        params![
            command.item.id,
            command.item.kind.as_str(),
            command.item.status.as_str(),
            command.item.title,
            content_json,
            command.item.summary,
            command.item.editor_schema_version,
            command.item.projection_version,
            content_hash,
            command.item.summary,
            revision,
            command.item.source_journal_id,
            command.item.source_block_id,
            created_at,
            command.item.updated_at,
        ],
    )?;
    transaction.commit()?;

    get_by_id(connection, &command.item.id)?
        .ok_or_else(|| StorageError::storage("saved knowledge item cannot be read back"))
}

pub fn soft_delete(
    connection: &mut Connection,
    knowledge_item_id: &str,
    expected_revision: i64,
    deleted_at: &str,
) -> Result<(), StorageError> {
    if !is_valid_id(knowledge_item_id) {
        return Err(StorageError::validation("knowledge item id must be a UUID"));
    }
    if expected_revision < 1 {
        return Err(StorageError::validation(
            "expectedRevision must be positive",
        ));
    }

    let transaction = connection.transaction()?;
    let revision = transaction
        .query_row(
            "SELECT revision FROM knowledge_items WHERE id = ?1 AND deleted_at IS NULL",
            [knowledge_item_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
        .ok_or_else(|| StorageError::not_found("knowledge item does not exist"))?;
    if revision != expected_revision {
        return Err(StorageError::conflict(format!(
            "knowledge revision conflict: expected {expected_revision}, found {revision}"
        )));
    }

    transaction.execute(
        "UPDATE knowledge_items
         SET status = 'archived', deleted_at = ?1, updated_at = ?1, revision = revision + 1
         WHERE id = ?2",
        params![deleted_at, knowledge_item_id],
    )?;
    transaction.commit()?;
    Ok(())
}
