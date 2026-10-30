use std::collections::HashSet;

use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Transaction,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use unicode_normalization::UnicodeNormalization;
use uuid::Uuid;

use super::{
    decode_cursor, encode_cursor, models::*, resolve_page_size, search_repository, StorageError,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JournalCursor {
    journal_date: String,
    id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VersionCursor {
    revision: i64,
}

#[derive(Debug)]
struct JournalRow {
    id: String,
    journal_date: String,
    timezone: String,
    title: String,
    content_json: String,
    content_markdown: String,
    content_plain_text: String,
    editor_schema_version: i64,
    projection_version: i64,
    content_hash: String,
    excerpt: String,
    status: String,
    revision: i64,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug)]
struct CurrentJournalRow {
    id: String,
    journal_date: String,
    timezone: String,
    revision: i64,
    created_at: String,
}

fn is_valid_id(value: &str) -> bool {
    value.len() == 36 && Uuid::parse_str(value).is_ok()
}

fn is_valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn validate_snapshot(input: &SaveJournalSnapshot) -> Result<(), StorageError> {
    if !is_valid_id(&input.journal_id) {
        return Err(StorageError::validation("journalId must be a UUID"));
    }
    if !is_valid_date(&input.journal_date) {
        return Err(StorageError::validation(
            "journalDate must use the YYYY-MM-DD format",
        ));
    }
    if input.content_hash.len() != 64
        || !input
            .content_hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(StorageError::validation(
            "contentHash must be a 64-character hexadecimal SHA-256 value",
        ));
    }
    if input.editor_schema_version < 1 || input.projection_version < 1 {
        return Err(StorageError::validation(
            "editorSchemaVersion and projectionVersion must be positive",
        ));
    }

    let mut block_ids = HashSet::new();
    for block in &input.structured_blocks {
        if !is_valid_id(&block.id) {
            return Err(StorageError::validation(
                "structured block id must be a UUID",
            ));
        }
        if !block_ids.insert(block.id.as_str()) {
            return Err(StorageError::validation(
                "structured block ids must be unique",
            ));
        }
        if block.schema_version < 1 {
            return Err(StorageError::validation(
                "structured block schemaVersion must be positive",
            ));
        }
        if !matches!(
            block.block_type.as_str(),
            "issue" | "solution" | "decision" | "note" | "todo"
        ) {
            return Err(StorageError::validation(
                "structured block type is not supported",
            ));
        }
    }

    let mut document_ids = HashSet::new();
    for document in &input.search_documents {
        if !document_ids.insert(document.id.as_str()) {
            return Err(StorageError::validation(
                "search document ids must be unique",
            ));
        }
        if !is_valid_id(&document.id) || !is_valid_id(&document.entity_id) {
            return Err(StorageError::validation(
                "search document and entity ids must be UUIDs",
            ));
        }
        if document.index_version < 1 {
            return Err(StorageError::validation(
                "search document indexVersion must be positive",
            ));
        }
    }

    Ok(())
}

fn normalize_tag(value: &str) -> Option<(String, String)> {
    let display = value
        .nfkc()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if display.is_empty() {
        return None;
    }

    Some((display.clone(), display.to_lowercase()))
}

fn normalized_tags(tags: &[String]) -> Vec<(String, String)> {
    let mut seen = HashSet::new();
    tags.iter()
        .filter_map(|tag| normalize_tag(tag))
        .filter(|(_, normalized)| seen.insert(normalized.clone()))
        .collect()
}

fn read_tags(connection: &Connection, journal_id: &str) -> Result<Vec<String>, StorageError> {
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

fn read_blocks(
    connection: &Connection,
    journal_id: &str,
) -> Result<Vec<StructuredBlockInput>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, block_type, schema_version, data_json, order_key, rendered_text
         FROM structured_blocks
         WHERE journal_id = ?1 AND deleted_at IS NULL
         ORDER BY order_key, id",
    )?;
    let rows = statement.query_map([journal_id], |row| {
        let data_json: String = row.get(3)?;
        Ok(StructuredBlockInput {
            id: row.get(0)?,
            block_type: row.get(1)?,
            schema_version: row.get(2)?,
            data: serde_json::from_str(&data_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
            order_key: row.get(4)?,
            rendered_text: row.get(5)?,
        })
    })?;

    let mut blocks = Vec::new();
    for row in rows {
        blocks.push(row?);
    }
    Ok(blocks)
}

fn journal_from_row(connection: &Connection, row: JournalRow) -> Result<Journal, StorageError> {
    Ok(Journal {
        tags: read_tags(connection, &row.id)?,
        structured_blocks: read_blocks(connection, &row.id)?,
        id: row.id,
        journal_date: row.journal_date,
        timezone: row.timezone,
        title: row.title,
        content_json: serde_json::from_str(&row.content_json)?,
        content_markdown: row.content_markdown,
        content_plain_text: row.content_plain_text,
        editor_schema_version: row.editor_schema_version,
        projection_version: row.projection_version,
        content_hash: row.content_hash,
        excerpt: row.excerpt,
        status: row.status,
        revision: row.revision,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
    })
}

fn journal_select() -> &'static str {
    "SELECT id, journal_date, timezone, title, content_json, content_markdown,
            content_plain_text, editor_schema_version, projection_version,
            content_hash, excerpt, status, revision, created_at, updated_at, deleted_at
     FROM journals"
}

pub fn get_by_id(
    connection: &Connection,
    journal_id: &str,
) -> Result<Option<Journal>, StorageError> {
    let row = connection
        .query_row(
            &format!("{} WHERE id = ?1 AND deleted_at IS NULL", journal_select()),
            [journal_id],
            map_journal_row,
        )
        .optional()?;
    row.map(|row| journal_from_row(connection, row)).transpose()
}

pub fn get_by_date(
    connection: &Connection,
    journal_date: &str,
) -> Result<Option<Journal>, StorageError> {
    let row = connection
        .query_row(
            &format!(
                "{} WHERE journal_date = ?1 AND status = 'active' AND deleted_at IS NULL",
                journal_select()
            ),
            [journal_date],
            map_journal_row,
        )
        .optional()?;
    row.map(|row| journal_from_row(connection, row)).transpose()
}

fn map_journal_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalRow> {
    Ok(JournalRow {
        id: row.get(0)?,
        journal_date: row.get(1)?,
        timezone: row.get(2)?,
        title: row.get(3)?,
        content_json: row.get(4)?,
        content_markdown: row.get(5)?,
        content_plain_text: row.get(6)?,
        editor_schema_version: row.get(7)?,
        projection_version: row.get(8)?,
        content_hash: row.get(9)?,
        excerpt: row.get(10)?,
        status: row.get(11)?,
        revision: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        deleted_at: row.get(15)?,
    })
}

pub fn get_save_state(
    connection: &Connection,
    journal_id: &str,
) -> Result<Option<JournalSaveState>, StorageError> {
    let row = connection
        .query_row(
            "SELECT id, journal_date, timezone, revision, title, content_hash,
                    projection_version, updated_at
             FROM journals
             WHERE id = ?1 AND deleted_at IS NULL",
            [journal_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()?;

    let Some((
        id,
        journal_date,
        timezone,
        revision,
        title,
        content_hash,
        projection_version,
        updated_at,
    )) = row
    else {
        return Ok(None);
    };

    Ok(Some(JournalSaveState {
        journal_id: id.clone(),
        journal_date,
        timezone,
        revision,
        title,
        content_hash,
        projection_version,
        tags: read_tags(connection, &id)?,
        updated_at,
    }))
}

pub fn list_summaries(
    connection: &Connection,
    query: &JournalListQuery,
) -> Result<Page<JournalSummary>, StorageError> {
    let limit = resolve_page_size(query.limit)?;
    let cursor = query
        .cursor
        .as_deref()
        .map(decode_cursor::<JournalCursor>)
        .transpose()?;

    let mut sql = String::from(
        "SELECT id, journal_date, title, excerpt, revision, updated_at
         FROM journals
         WHERE deleted_at IS NULL",
    );
    let mut values: Vec<SqlValue> = Vec::new();

    let status = query.status.as_deref().unwrap_or("active");
    sql.push_str(" AND status = ?");
    values.push(SqlValue::Text(status.to_owned()));

    if let Some(from_date) = &query.from_date {
        sql.push_str(" AND journal_date >= ?");
        values.push(SqlValue::Text(from_date.clone()));
    }
    if let Some(to_date) = &query.to_date {
        sql.push_str(" AND journal_date <= ?");
        values.push(SqlValue::Text(to_date.clone()));
    }
    if let Some(cursor) = cursor {
        sql.push_str(" AND (journal_date < ? OR (journal_date = ? AND id < ?))");
        values.push(SqlValue::Text(cursor.journal_date.clone()));
        values.push(SqlValue::Text(cursor.journal_date));
        values.push(SqlValue::Text(cursor.id));
    }

    sql.push_str(" ORDER BY journal_date DESC, id DESC LIMIT ?");
    values.push(SqlValue::Integer((limit + 1) as i64));

    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values.iter()), |row| {
        Ok(JournalSummary {
            id: row.get(0)?,
            journal_date: row.get(1)?,
            title: row.get(2)?,
            excerpt: row.get(3)?,
            revision: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    let has_more = items.len() > limit;
    items.truncate(limit);
    let next_cursor = if has_more {
        items
            .last()
            .map(|item| {
                encode_cursor(&JournalCursor {
                    journal_date: item.journal_date.clone(),
                    id: item.id.clone(),
                })
            })
            .transpose()?
    } else {
        None
    };

    Ok(Page { items, next_cursor })
}

fn current_journal(
    connection: &Connection,
    journal_id: &str,
) -> Result<Option<CurrentJournalRow>, StorageError> {
    Ok(connection
        .query_row(
            "SELECT id, journal_date, timezone, revision, created_at
             FROM journals
             WHERE id = ?1 AND deleted_at IS NULL",
            [journal_id],
            |row| {
                Ok(CurrentJournalRow {
                    id: row.get(0)?,
                    journal_date: row.get(1)?,
                    timezone: row.get(2)?,
                    revision: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .optional()?)
}

fn ensure_expected_revision(
    current: Option<&CurrentJournalRow>,
    expected_revision: Option<i64>,
    journal_id: &str,
) -> Result<i64, StorageError> {
    match (current, expected_revision) {
        (None, None) => Ok(1),
        (None, Some(_)) => Err(StorageError::not_found(format!(
            "journal {journal_id} does not exist"
        ))),
        (Some(current), None) => Err(StorageError::conflict(format!(
            "journal {journal_id} already exists at revision {}",
            current.revision
        ))),
        (Some(current), Some(expected)) if current.revision != expected => {
            Err(StorageError::conflict(format!(
                "journal revision conflict: expected {expected}, found {}",
                current.revision
            )))
        }
        (Some(current), Some(_)) => Ok(current.revision + 1),
    }
}

fn ensure_date_is_available(
    transaction: &Transaction<'_>,
    journal_id: &str,
    journal_date: &str,
) -> Result<(), StorageError> {
    let conflict = transaction
        .query_row(
            "SELECT id FROM journals
             WHERE journal_date = ?1 AND deleted_at IS NULL AND id <> ?2",
            params![journal_date, journal_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if conflict.is_some() {
        return Err(StorageError::conflict(format!(
            "an active journal already exists for {journal_date}"
        )));
    }
    Ok(())
}

fn delete_search_document(
    transaction: &Transaction<'_>,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), StorageError> {
    transaction.execute(
        "DELETE FROM search_fts WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type, entity_id],
    )?;
    transaction.execute(
        "DELETE FROM search_documents WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type, entity_id],
    )?;
    Ok(())
}

fn write_tags(
    transaction: &Transaction<'_>,
    journal_id: &str,
    tags: &[String],
    saved_at: &str,
) -> Result<(), StorageError> {
    transaction.execute(
        "DELETE FROM journal_tags WHERE journal_id = ?1",
        [journal_id],
    )?;

    for (display, normalized) in normalized_tags(tags) {
        let existing = transaction
            .query_row(
                "SELECT id FROM tags WHERE name_normalized = ?1",
                [&normalized],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let tag_id = if let Some(existing) = existing {
            transaction.execute(
                "UPDATE tags SET updated_at = ?1 WHERE id = ?2",
                params![saved_at, existing],
            )?;
            existing
        } else {
            let id = Uuid::now_v7().to_string();
            transaction.execute(
                "INSERT INTO tags (id, name, name_normalized, color, created_at, updated_at)
                 VALUES (?1, ?2, ?3, NULL, ?4, ?4)",
                params![id, display, normalized, saved_at],
            )?;
            id
        };

        transaction.execute(
            "INSERT OR IGNORE INTO journal_tags (journal_id, tag_id) VALUES (?1, ?2)",
            params![journal_id, tag_id],
        )?;
    }

    Ok(())
}

fn write_structured_blocks(
    transaction: &Transaction<'_>,
    journal_id: &str,
    blocks: &[StructuredBlockInput],
    saved_at: &str,
) -> Result<(), StorageError> {
    transaction.execute(
        "UPDATE structured_blocks
         SET deleted_at = ?1, updated_at = ?1
         WHERE journal_id = ?2 AND deleted_at IS NULL",
        params![saved_at, journal_id],
    )?;

    for block in blocks {
        let owner = transaction
            .query_row(
                "SELECT journal_id FROM structured_blocks WHERE id = ?1",
                [&block.id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(owner) = owner {
            if owner != journal_id {
                return Err(StorageError::conflict(format!(
                    "structured block {} belongs to another journal",
                    block.id
                )));
            }
        }

        let data_json = serde_json::to_string(&block.data)?;
        transaction.execute(
            "INSERT INTO structured_blocks
               (id, journal_id, block_type, schema_version, data_json, order_key,
                rendered_text, created_at, updated_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, NULL)
             ON CONFLICT(id) DO UPDATE SET
               journal_id = excluded.journal_id,
               block_type = excluded.block_type,
               schema_version = excluded.schema_version,
               data_json = excluded.data_json,
               order_key = excluded.order_key,
               rendered_text = excluded.rendered_text,
               updated_at = excluded.updated_at,
               deleted_at = NULL",
            params![
                block.id,
                journal_id,
                block.block_type,
                block.schema_version,
                data_json,
                block.order_key,
                block.rendered_text,
                saved_at
            ],
        )?;
    }

    Ok(())
}

fn write_search_documents(
    transaction: &Transaction<'_>,
    journal_id: &str,
    old_block_ids: &[String],
    documents: &[SearchDocumentInput],
    saved_at: &str,
) -> Result<(), StorageError> {
    let mut entity_keys = HashSet::new();
    entity_keys.insert(("journal".to_owned(), journal_id.to_owned()));
    for block_id in old_block_ids {
        entity_keys.insert(("structured_block".to_owned(), block_id.clone()));
    }
    for document in documents {
        entity_keys.insert((
            document.entity_type.as_str().to_owned(),
            document.entity_id.clone(),
        ));
    }

    for (entity_type, entity_id) in entity_keys {
        delete_search_document(transaction, &entity_type, &entity_id)?;
    }

    for document in documents {
        let entity_type = document.entity_type.as_str();
        let tokenized_text = search_repository::tokenized_text_for_index(
            &document.title,
            &document.body_text,
            &document.structured_text,
            &document.tags_text,
            &document.tokenized_text,
        );
        transaction.execute(
            "INSERT INTO search_documents
               (id, entity_type, entity_id, title, body_text, structured_text,
                tags_text, normalized_text, tokenized_text, local_date, updated_at,
                content_hash, index_version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                document.id,
                entity_type,
                document.entity_id,
                document.title,
                document.body_text,
                document.structured_text,
                document.tags_text,
                document.normalized_text,
                tokenized_text,
                document.local_date,
                document.updated_at,
                document.content_hash,
                document.index_version
            ],
        )?;
        transaction.execute(
            "INSERT INTO search_fts
               (entity_type, entity_id, title, body_text, structured_text,
                tokenized_text, tags_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                entity_type,
                document.entity_id,
                document.title,
                document.body_text,
                document.structured_text,
                tokenized_text,
                document.tags_text
            ],
        )?;
    }

    transaction.execute(
        "INSERT INTO app_metadata (key, value_json, updated_at)
         VALUES ('search_index_state', '\"ready\"', ?1)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                        updated_at = excluded.updated_at",
        [saved_at],
    )?;

    Ok(())
}

pub fn save_snapshot(
    connection: &mut Connection,
    input: &SaveJournalSnapshot,
) -> Result<SavedJournalSnapshot, StorageError> {
    validate_snapshot(input)?;

    let transaction = connection.transaction()?;
    let current = current_journal(&transaction, &input.journal_id)?;
    let revision =
        ensure_expected_revision(current.as_ref(), input.expected_revision, &input.journal_id)?;
    ensure_date_is_available(&transaction, &input.journal_id, &input.journal_date)?;

    let old_block_ids = {
        let mut statement = transaction.prepare(
            "SELECT id FROM structured_blocks
             WHERE journal_id = ?1 AND deleted_at IS NULL",
        )?;
        let rows = statement.query_map([&input.journal_id], |row| row.get::<_, String>(0))?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row?);
        }
        ids
    };

    let content_json = serde_json::to_string(&input.content_json)?;
    let created_at = current
        .as_ref()
        .map(|row| row.created_at.clone())
        .unwrap_or_else(|| input.saved_at.clone());

    if current.is_some() {
        let changed = transaction.execute(
            "UPDATE journals
             SET journal_date = ?1, timezone = ?2, title = ?3, content_json = ?4,
                 content_markdown = ?5, content_plain_text = ?6,
                 editor_schema_version = ?7, projection_version = ?8,
                 content_hash = ?9, excerpt = ?10, status = 'active',
                 revision = ?11, updated_at = ?12
             WHERE id = ?13",
            params![
                input.journal_date,
                input.timezone,
                input.title,
                content_json,
                input.content_markdown,
                input.content_plain_text,
                input.editor_schema_version,
                input.projection_version,
                input.content_hash,
                input.excerpt,
                revision,
                input.saved_at,
                input.journal_id
            ],
        )?;
        if changed != 1 {
            return Err(StorageError::conflict("journal changed during save"));
        }
    } else {
        transaction.execute(
            "INSERT INTO journals
               (id, journal_date, timezone, title, content_json, content_markdown,
                content_plain_text, editor_schema_version, projection_version,
                content_hash, excerpt, status, revision, created_at, updated_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'active',
                     ?12, ?13, ?13, NULL)",
            params![
                input.journal_id,
                input.journal_date,
                input.timezone,
                input.title,
                content_json,
                input.content_markdown,
                input.content_plain_text,
                input.editor_schema_version,
                input.projection_version,
                input.content_hash,
                input.excerpt,
                revision,
                created_at
            ],
        )?;
    }

    write_structured_blocks(
        &transaction,
        &input.journal_id,
        &input.structured_blocks,
        &input.saved_at,
    )?;
    write_tags(
        &transaction,
        &input.journal_id,
        &input.tags,
        &input.saved_at,
    )?;
    write_search_documents(
        &transaction,
        &input.journal_id,
        &old_block_ids,
        &input.search_documents,
        &input.saved_at,
    )?;

    let version_created = !matches!(input.checkpoint, JournalSaveCheckpoint::Autosave);
    if version_created {
        transaction.execute(
            "INSERT INTO journal_versions
               (id, journal_id, revision, title, content_json, content_markdown,
                content_plain_text, editor_schema_version, projection_version,
                content_hash, change_source, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                Uuid::now_v7().to_string(),
                input.journal_id,
                revision,
                input.title,
                content_json,
                input.content_markdown,
                input.content_plain_text,
                input.editor_schema_version,
                input.projection_version,
                input.content_hash,
                input.checkpoint.change_source().as_str(),
                input.saved_at
            ],
        )?;
    }

    transaction.commit()?;

    Ok(SavedJournalSnapshot {
        journal_id: input.journal_id.clone(),
        revision,
        saved_at: input.saved_at.clone(),
        content_hash: input.content_hash.clone(),
        version_created,
        search_index_state: "ready".to_owned(),
    })
}

pub fn list_versions(
    connection: &Connection,
    journal_id: &str,
    limit: Option<i64>,
    cursor: Option<&str>,
) -> Result<Page<JournalVersionSummary>, StorageError> {
    let limit = resolve_page_size(limit)?;
    let cursor = cursor.map(decode_cursor::<VersionCursor>).transpose()?;
    let mut sql = String::from(
        "SELECT journal_id, revision, title, change_source, created_at
         FROM journal_versions
         WHERE journal_id = ?1",
    );
    let mut values = vec![SqlValue::Text(journal_id.to_owned())];
    if let Some(cursor) = cursor {
        sql.push_str(" AND revision < ?2");
        values.push(SqlValue::Integer(cursor.revision));
    }
    sql.push_str(" ORDER BY revision DESC LIMIT ?");
    values.push(SqlValue::Integer((limit + 1) as i64));

    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values.iter()), |row| {
        Ok(JournalVersionSummary {
            journal_id: row.get(0)?,
            revision: row.get(1)?,
            title: row.get(2)?,
            change_source: JournalChangeSource::from_database(&row.get::<_, String>(3)?).map_err(
                |error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                },
            )?,
            created_at: row.get(4)?,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    let has_more = items.len() > limit;
    items.truncate(limit);
    let next_cursor = if has_more {
        items
            .last()
            .map(|item| {
                encode_cursor(&VersionCursor {
                    revision: item.revision,
                })
            })
            .transpose()?
    } else {
        None
    };

    Ok(Page { items, next_cursor })
}

pub fn get_version(
    connection: &Connection,
    journal_id: &str,
    revision: i64,
) -> Result<Option<JournalVersion>, StorageError> {
    let row = connection
        .query_row(
            "SELECT id, journal_id, revision, title, content_json, content_markdown,
                    content_plain_text, editor_schema_version, projection_version,
                    content_hash, change_source, created_at
             FROM journal_versions
             WHERE journal_id = ?1 AND revision = ?2",
            params![journal_id, revision],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                ))
            },
        )
        .optional()?;

    let Some((
        id,
        journal_id,
        revision,
        title,
        content_json,
        content_markdown,
        content_plain_text,
        editor_schema_version,
        projection_version,
        content_hash,
        change_source,
        created_at,
    )) = row
    else {
        return Ok(None);
    };

    Ok(Some(JournalVersion {
        id,
        journal_id,
        revision,
        title,
        content_json: serde_json::from_str(&content_json)?,
        content_markdown,
        content_plain_text,
        editor_schema_version,
        projection_version,
        content_hash,
        change_source: JournalChangeSource::from_database(&change_source)?,
        created_at,
    }))
}

fn collect_structured_blocks(
    value: &Value,
    blocks: &mut Vec<StructuredBlockInput>,
    order: &mut usize,
) {
    match value {
        Value::Object(object) => {
            let node_type = object
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if matches!(
                node_type,
                "structuredBlock" | "structured_block" | "structured-block"
            ) {
                let attrs = object.get("attrs").unwrap_or(value);
                let id = attrs.get("id").and_then(Value::as_str).unwrap_or_default();
                if is_valid_id(id) {
                    let block_type = attrs
                        .get("blockType")
                        .or_else(|| attrs.get("block_type"))
                        .and_then(Value::as_str)
                        .unwrap_or("note");
                    let block_type = if matches!(
                        block_type,
                        "issue" | "solution" | "decision" | "note" | "todo"
                    ) {
                        block_type
                    } else {
                        "note"
                    };
                    let schema_version = attrs
                        .get("schemaVersion")
                        .or_else(|| attrs.get("schema_version"))
                        .and_then(Value::as_i64)
                        .unwrap_or(1);
                    let order_key = attrs
                        .get("orderKey")
                        .or_else(|| attrs.get("order_key"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("{:08}", *order));
                    let data = attrs.get("data").cloned().unwrap_or_else(|| json!({}));
                    let rendered_text = attrs
                        .get("renderedText")
                        .or_else(|| attrs.get("rendered_text"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| value_text(&data));
                    blocks.push(StructuredBlockInput {
                        id: id.to_owned(),
                        block_type: block_type.to_owned(),
                        schema_version,
                        data,
                        order_key,
                        rendered_text,
                    });
                    *order += 1;
                }
            }

            if let Some(content) = object.get("content").and_then(Value::as_array) {
                for child in content {
                    collect_structured_blocks(child, blocks, order);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_structured_blocks(item, blocks, order);
            }
        }
        _ => {}
    }
}

fn value_text(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Array(values) => values
            .iter()
            .map(value_text)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" "),
        Value::Object(object) => object
            .values()
            .map(value_text)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" "),
        Value::Null | Value::Bool(_) | Value::Number(_) => value.to_string(),
    }
}

fn make_restore_search_documents(
    connection: &Connection,
    current: &CurrentJournalRow,
    version: &JournalVersion,
    blocks: &[StructuredBlockInput],
    tags: &[String],
    restored_at: &str,
) -> Result<Vec<SearchDocumentInput>, StorageError> {
    let existing_journal_doc = connection
        .query_row(
            "SELECT id FROM search_documents
             WHERE entity_type = 'journal' AND entity_id = ?1",
            [&current.id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let journal_document_id = existing_journal_doc.unwrap_or_else(|| Uuid::now_v7().to_string());
    let tags_text = tags.join(" ");
    let structured_text = blocks
        .iter()
        .map(|block| block.rendered_text.clone())
        .collect::<Vec<_>>()
        .join(" ");
    let journal_normalized = search_repository::normalize_search_text(&format!(
        "{} {} {}",
        version.title, version.content_plain_text, tags_text
    ));
    let mut documents = vec![SearchDocumentInput {
        id: journal_document_id,
        entity_type: SearchEntityType::Journal,
        entity_id: current.id.clone(),
        title: version.title.clone(),
        body_text: version.content_plain_text.clone(),
        structured_text: structured_text.clone(),
        tags_text: tags_text.clone(),
        normalized_text: journal_normalized,
        tokenized_text: String::new(),
        local_date: Some(current.journal_date.clone()),
        updated_at: restored_at.to_owned(),
        content_hash: version.content_hash.clone(),
        index_version: 1,
    }];

    for block in blocks {
        let existing_block_doc = connection
            .query_row(
                "SELECT id FROM search_documents
                 WHERE entity_type = 'structured_block' AND entity_id = ?1",
                [&block.id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let block_document_id = existing_block_doc.unwrap_or_else(|| Uuid::now_v7().to_string());
        documents.push(SearchDocumentInput {
            id: block_document_id,
            entity_type: SearchEntityType::StructuredBlock,
            entity_id: block.id.clone(),
            title: format!("{} {}", version.title, block.block_type),
            body_text: block.rendered_text.clone(),
            structured_text: block.rendered_text.clone(),
            tags_text: tags_text.clone(),
            normalized_text: search_repository::normalize_search_text(&format!(
                "{} {} {}",
                version.title, block.rendered_text, tags_text
            )),
            tokenized_text: String::new(),
            local_date: Some(current.journal_date.clone()),
            updated_at: restored_at.to_owned(),
            content_hash: version.content_hash.clone(),
            index_version: 1,
        });
    }

    Ok(documents)
}

pub fn restore_version(
    connection: &mut Connection,
    input: &RestoreJournalVersionInput,
) -> Result<SavedJournalSnapshot, StorageError> {
    let current = current_journal(connection, &input.journal_id)?.ok_or_else(|| {
        StorageError::not_found(format!("journal {} does not exist", input.journal_id))
    })?;
    if current.revision != input.expected_current_revision {
        return Err(StorageError::conflict(format!(
            "journal revision conflict: expected {}, found {}",
            input.expected_current_revision, current.revision
        )));
    }

    let version =
        get_version(connection, &input.journal_id, input.version_revision)?.ok_or_else(|| {
            StorageError::not_found(format!(
                "journal version {} does not exist",
                input.version_revision
            ))
        })?;

    let mut blocks = Vec::new();
    let mut order = 0;
    collect_structured_blocks(&version.content_json, &mut blocks, &mut order);
    let tags = read_tags(connection, &input.journal_id)?;
    let search_documents = make_restore_search_documents(
        connection,
        &current,
        &version,
        &blocks,
        &tags,
        &input.restored_at,
    )?;
    let excerpt = version.content_plain_text.chars().take(160).collect();

    let snapshot = SaveJournalSnapshot {
        journal_id: input.journal_id.clone(),
        journal_date: current.journal_date,
        timezone: current.timezone,
        title: version.title,
        content_json: version.content_json,
        editor_schema_version: version.editor_schema_version,
        content_markdown: version.content_markdown,
        content_plain_text: version.content_plain_text,
        content_hash: version.content_hash,
        projection_version: version.projection_version,
        excerpt,
        expected_revision: Some(input.expected_current_revision),
        checkpoint: JournalSaveCheckpoint::Restore,
        tags,
        structured_blocks: blocks,
        search_documents,
        saved_at: input.restored_at.clone(),
    };

    save_snapshot(connection, &snapshot)
}

pub fn soft_delete(
    connection: &mut Connection,
    journal_id: &str,
    expected_revision: i64,
    deleted_at: &str,
) -> Result<(), StorageError> {
    let transaction = connection.transaction()?;
    let current = current_journal(&transaction, journal_id)?
        .ok_or_else(|| StorageError::not_found(format!("journal {journal_id} does not exist")))?;
    if current.revision != expected_revision {
        return Err(StorageError::conflict(format!(
            "journal revision conflict: expected {expected_revision}, found {}",
            current.revision
        )));
    }

    let block_ids = {
        let mut statement = transaction.prepare(
            "SELECT id FROM structured_blocks
             WHERE journal_id = ?1 AND deleted_at IS NULL",
        )?;
        let rows = statement.query_map([journal_id], |row| row.get::<_, String>(0))?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row?);
        }
        ids
    };

    delete_search_document(&transaction, "journal", journal_id)?;
    for block_id in block_ids {
        delete_search_document(&transaction, "structured_block", &block_id)?;
    }
    transaction.execute(
        "UPDATE journals
         SET status = 'archived', revision = revision + 1,
             updated_at = ?1, deleted_at = ?1
         WHERE id = ?2",
        params![deleted_at, journal_id],
    )?;
    transaction.execute(
        "UPDATE structured_blocks
         SET deleted_at = ?1, updated_at = ?1
         WHERE journal_id = ?2 AND deleted_at IS NULL",
        params![deleted_at, journal_id],
    )?;
    transaction.execute(
        "INSERT INTO app_metadata (key, value_json, updated_at)
         VALUES ('search_index_state', '\"ready\"', ?1)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                        updated_at = excluded.updated_at",
        [deleted_at],
    )?;
    transaction.commit()?;
    Ok(())
}

pub fn project_structured_blocks(content_json: &Value) -> Vec<StructuredBlockInput> {
    let mut blocks = Vec::new();
    let mut order = 0;
    collect_structured_blocks(content_json, &mut blocks, &mut order);
    blocks
}
