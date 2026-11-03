use std::collections::HashSet;

use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

use super::{decode_cursor, encode_cursor, models::*, resolve_page_size, StorageError};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SearchCursor {
    rank: f64,
    updated_at: String,
    entity_id: String,
}

#[derive(Debug)]
struct RankedSearchRow {
    entity_type: SearchEntityType,
    entity_id: String,
    title: String,
    body_text: String,
    local_date: Option<String>,
    updated_at: String,
    rank: f64,
}

const EMPTY_CONTENT_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";
const SEARCH_INDEX_VERSION: i64 = 1;
const REBUILD_BATCH_SIZE: usize = 250;

fn is_cjk(character: char) -> bool {
    matches!(
        character as u32,
        0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0x20000..=0x2FA1F
    )
}

fn is_code_separator(character: char) -> bool {
    matches!(character, '_' | '-' | '.' | ':' | '/' | '+')
}

pub(crate) fn normalize_search_text(value: &str) -> String {
    value
        .nfkc()
        .collect::<String>()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || is_code_separator(character) {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn push_cjk_tokens(buffer: &str, target: &mut Vec<String>, include_single: bool) {
    let characters = buffer.chars().collect::<Vec<_>>();
    if include_single {
        for character in &characters {
            target.push(character.to_string());
        }
    }
    if characters.len() >= 2 {
        for pair in characters.windows(2) {
            target.push(pair.iter().collect());
        }
    } else if let Some(character) = characters.first() {
        target.push(character.to_string());
    }
}

fn tokenize(value: &str, for_query: bool) -> Vec<String> {
    let normalized = normalize_search_text(value);
    let mut tokens = Vec::new();
    let mut latin = String::new();
    let mut cjk = String::new();

    let flush_latin = |latin: &mut String, target: &mut Vec<String>| {
        if latin.is_empty() {
            return;
        }
        let whole = latin.to_lowercase();
        target.push(whole.clone());
        let parts = whole
            .split(|character: char| is_code_separator(character) || character == ' ')
            .filter(|part| part.chars().count() >= 2)
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        target.extend(parts);
        latin.clear();
    };
    let flush_cjk = |cjk: &mut String, target: &mut Vec<String>| {
        if !cjk.is_empty() {
            push_cjk_tokens(cjk, target, !for_query);
            cjk.clear();
        }
    };

    for character in normalized.chars() {
        if is_cjk(character) {
            flush_latin(&mut latin, &mut tokens);
            cjk.push(character);
        } else if character.is_alphanumeric() || is_code_separator(character) {
            flush_cjk(&mut cjk, &mut tokens);
            latin.push(character);
        } else {
            flush_latin(&mut latin, &mut tokens);
            flush_cjk(&mut cjk, &mut tokens);
        }
    }
    flush_latin(&mut latin, &mut tokens);
    flush_cjk(&mut cjk, &mut tokens);

    let mut seen = HashSet::new();
    tokens
        .into_iter()
        .filter(|token| !token.is_empty())
        .filter(|token| seen.insert(token.clone()))
        .take(32)
        .collect()
}

pub(crate) fn tokenized_text_for_index(
    title: &str,
    body_text: &str,
    structured_text: &str,
    tags_text: &str,
    existing: &str,
) -> String {
    let mut seen = HashSet::new();
    let source = format!(
        "{} {} {} {} {}",
        title, body_text, structured_text, tags_text, existing
    );
    let mut tokens = tokenize(&source, false);
    tokens.insert(0, existing.trim().to_owned());
    tokens
        .into_iter()
        .filter(|token| !token.is_empty())
        .filter(|token| seen.insert(token.clone()))
        .collect::<Vec<_>>()
        .join(" ")
}

fn fts_expression(text: &str) -> Option<String> {
    let tokens = tokenize(text, true);
    if tokens.is_empty() {
        return None;
    }

    Some(
        tokens
            .into_iter()
            .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND "),
    )
}

fn read_index_state(connection: &Connection) -> Result<String, StorageError> {
    let value = connection
        .query_row(
            "SELECT value_json FROM app_metadata WHERE key = 'search_index_state'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(value) = value else {
        return Ok("stale".to_owned());
    };
    let state = serde_json::from_str::<String>(&value).unwrap_or_else(|_| "stale".to_owned());
    match state.as_str() {
        "ready" | "stale" | "failed" => Ok(state),
        _ => Ok("stale".to_owned()),
    }
}

fn compare_ranked(left: &RankedSearchRow, right: &RankedSearchRow) -> std::cmp::Ordering {
    left.rank
        .total_cmp(&right.rank)
        .then_with(|| right.updated_at.cmp(&left.updated_at))
        .then_with(|| right.entity_id.cmp(&left.entity_id))
}

fn is_after_cursor(row: &RankedSearchRow, cursor: &SearchCursor) -> bool {
    match row.rank.total_cmp(&cursor.rank) {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        std::cmp::Ordering::Equal => match cursor.updated_at.cmp(&row.updated_at) {
            std::cmp::Ordering::Less => true,
            std::cmp::Ordering::Greater => false,
            std::cmp::Ordering::Equal => cursor.entity_id > row.entity_id,
        },
    }
}

fn compact_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn make_snippet(row: &RankedSearchRow) -> String {
    let text = if row.body_text.trim().is_empty() {
        compact_whitespace(&row.title)
    } else {
        compact_whitespace(&row.body_text)
    };
    let characters = text.chars().collect::<Vec<_>>();
    if characters.len() > 160 {
        format!("{}...", characters[..157].iter().collect::<String>())
    } else {
        characters.into_iter().collect()
    }
}

pub fn query(
    connection: &Connection,
    input: &SearchQuery,
) -> Result<SearchResultPage, StorageError> {
    let index_state = read_index_state(connection)?;
    let Some(expression) = fts_expression(&input.text) else {
        return Ok(SearchResultPage {
            items: Vec::new(),
            next_cursor: None,
            index_state,
        });
    };
    let limit = resolve_page_size(input.limit)?;
    let cursor = input
        .cursor
        .as_deref()
        .map(decode_cursor::<SearchCursor>)
        .transpose()?;

    let mut sql = String::from(
        "SELECT d.entity_type, d.entity_id, d.title, d.body_text, d.local_date,
                d.updated_at,
                bm25(search_fts, 0.0, 0.0, 5.0, 1.0, 2.5, 1.5, 1.0) AS rank
         FROM search_fts
         JOIN search_documents d
           ON d.entity_type = search_fts.entity_type
          AND d.entity_id = search_fts.entity_id
         WHERE search_fts MATCH ?",
    );
    let mut values = vec![SqlValue::Text(expression)];

    if let Some(entity_types) = &input.entity_types {
        if !entity_types.is_empty() {
            sql.push_str(" AND d.entity_type IN (");
            for (index, entity_type) in entity_types.iter().enumerate() {
                if index > 0 {
                    sql.push_str(", ");
                }
                sql.push('?');
                values.push(SqlValue::Text(entity_type.as_str().to_owned()));
            }
            sql.push(')');
        }
    }
    if let Some(from_date) = &input.from_date {
        sql.push_str(" AND d.local_date >= ?");
        values.push(SqlValue::Text(from_date.clone()));
    }
    if let Some(to_date) = &input.to_date {
        sql.push_str(" AND d.local_date <= ?");
        values.push(SqlValue::Text(to_date.clone()));
    }
    sql.push_str(" ORDER BY rank ASC, d.updated_at DESC, d.entity_id DESC");

    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values.iter()), |row| {
        let entity_type: String = row.get(0)?;
        Ok((
            entity_type,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, f64>(6)?,
        ))
    })?;

    let mut ranked = Vec::new();
    for row in rows {
        let (entity_type, entity_id, title, body_text, local_date, updated_at, rank) = row?;
        ranked.push(RankedSearchRow {
            entity_type: SearchEntityType::from_database(&entity_type)?,
            entity_id,
            title,
            body_text,
            local_date,
            updated_at,
            rank,
        });
    }
    ranked.sort_by(compare_ranked);
    if let Some(cursor) = &cursor {
        ranked.retain(|row| is_after_cursor(row, cursor));
    }

    let has_more = ranked.len() > limit;
    ranked.truncate(limit);
    let next_cursor = if has_more {
        ranked
            .last()
            .map(|row| {
                encode_cursor(&SearchCursor {
                    rank: row.rank,
                    updated_at: row.updated_at.clone(),
                    entity_id: row.entity_id.clone(),
                })
            })
            .transpose()?
    } else {
        None
    };

    Ok(SearchResultPage {
        items: ranked
            .into_iter()
            .map(|row| {
                let snippet = make_snippet(&row);
                SearchHit {
                    entity_type: row.entity_type,
                    entity_id: row.entity_id,
                    snippet,
                    title: row.title,
                    local_date: row.local_date,
                    score: -row.rank,
                }
            })
            .collect(),
        next_cursor,
        index_state,
    })
}

pub fn rebuild(
    connection: &mut Connection,
    scope: Option<&[SearchEntityType]>,
    is_cancelled: impl Fn() -> bool,
) -> Result<SearchRebuildResult, StorageError> {
    rebuild_with_progress(connection, scope, is_cancelled, |_| {})
}

pub fn rebuild_with_progress(
    connection: &mut Connection,
    scope: Option<&[SearchEntityType]>,
    is_cancelled: impl Fn() -> bool,
    mut on_progress: impl FnMut(SearchRebuildProgress),
) -> Result<SearchRebuildResult, StorageError> {
    let scope = scope.filter(|values| !values.is_empty());
    if is_cancelled() {
        return Ok(cancelled_rebuild_result(connection)?);
    }

    let documents = load_authoritative_documents(connection, scope, &is_cancelled)?;
    let total_count = documents.len();
    on_progress(SearchRebuildProgress {
        phase: "reading".to_owned(),
        processed_count: 0,
        total_count,
    });
    for batch in documents.chunks(REBUILD_BATCH_SIZE) {
        if is_cancelled() {
            return Ok(cancelled_rebuild_result(connection)?);
        }
        std::hint::black_box(batch);
    }

    let transaction = connection.transaction()?;
    let entity_types = scope.map(|values| {
        values
            .iter()
            .map(|entity_type| entity_type.as_str().to_owned())
            .collect::<Vec<_>>()
    });
    let scope_clause = entity_types
        .as_ref()
        .filter(|values| !values.is_empty())
        .map_or_else(String::new, |values| {
            format!(
                " WHERE entity_type IN ({})",
                std::iter::repeat("?")
                    .take(values.len())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        });

    let delete_sql = format!("DELETE FROM search_fts{}", scope_clause);
    match &entity_types {
        Some(values) if !values.is_empty() => {
            transaction.execute(&delete_sql, params_from_iter(values.iter()))?;
        }
        _ => {
            transaction.execute(&delete_sql, [])?;
        }
    }

    let delete_documents_sql = format!("DELETE FROM search_documents{}", scope_clause);
    match &entity_types {
        Some(values) if !values.is_empty() => {
            transaction.execute(&delete_documents_sql, params_from_iter(values.iter()))?;
        }
        _ => {
            transaction.execute(&delete_documents_sql, [])?;
        }
    }

    let mut processed_count = 0;
    for batch in documents.chunks(REBUILD_BATCH_SIZE) {
        if is_cancelled() {
            drop(transaction);
            return Ok(cancelled_rebuild_result(connection)?);
        }
        for document in batch {
            transaction.execute(
                "INSERT INTO search_documents (
                   id, entity_type, entity_id, title, body_text, structured_text,
                   tags_text, normalized_text, tokenized_text, local_date, updated_at,
                   content_hash, index_version
                 ) VALUES (
                   ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
                 )",
                params![
                    document.id,
                    document.entity_type.as_str(),
                    document.entity_id,
                    document.title,
                    document.body_text,
                    document.structured_text,
                    document.tags_text,
                    document.normalized_text,
                    document.tokenized_text,
                    document.local_date,
                    document.updated_at,
                    document.content_hash,
                    document.index_version,
                ],
            )?;
            transaction.execute(
                "INSERT INTO search_fts (
                   entity_type, entity_id, title, body_text, structured_text,
                   tokenized_text, tags_text
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    document.entity_type.as_str(),
                    document.entity_id,
                    document.title,
                    document.body_text,
                    document.structured_text,
                    document.tokenized_text,
                    document.tags_text,
                ],
            )?;
        }
        processed_count += batch.len();
        on_progress(SearchRebuildProgress {
            phase: "indexing".to_owned(),
            processed_count,
            total_count,
        });
    }

    on_progress(SearchRebuildProgress {
        phase: "committing".to_owned(),
        processed_count: total_count,
        total_count,
    });
    let indexed_count = count_rows_for_scope(
        &transaction,
        "search_documents",
        &entity_types,
        &scope_clause,
    )?;
    let indexed_fts_count =
        count_rows_for_scope(&transaction, "search_fts", &entity_types, &scope_clause)?;
    let expected_count = documents.len() as i64;
    if indexed_count != expected_count || indexed_fts_count != expected_count {
        return Err(StorageError::storage(format!(
            "search index verification failed: expected {expected_count}, found {indexed_count} documents and {indexed_fts_count} FTS rows"
        )));
    }

    let completed_at =
        transaction.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get::<_, String>(0)
        })?;
    transaction.execute(
        "INSERT INTO app_metadata (key, value_json, updated_at)
         VALUES ('search_index_state', '\"ready\"', ?1)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
        [&completed_at],
    )?;
    transaction.commit()?;

    Ok(SearchRebuildResult {
        indexed_count: expected_count,
        completed_at,
        status: "completed".to_owned(),
    })
}

fn cancelled_rebuild_result(connection: &Connection) -> Result<SearchRebuildResult, StorageError> {
    let completed_at =
        connection.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get::<_, String>(0)
        })?;
    Ok(SearchRebuildResult {
        indexed_count: 0,
        completed_at,
        status: "cancelled".to_owned(),
    })
}

fn count_rows_for_scope(
    connection: &Connection,
    table: &str,
    entity_types: &Option<Vec<String>>,
    scope_clause: &str,
) -> Result<i64, StorageError> {
    let sql = format!("SELECT COUNT(*) FROM {table}{scope_clause}");
    match entity_types {
        Some(values) if !values.is_empty() => {
            Ok(connection.query_row(&sql, params_from_iter(values.iter()), |row| row.get(0))?)
        }
        _ => Ok(connection.query_row(&sql, [], |row| row.get(0))?),
    }
}

fn load_authoritative_documents(
    connection: &Connection,
    scope: Option<&[SearchEntityType]>,
    is_cancelled: &impl Fn() -> bool,
) -> Result<Vec<SearchDocumentInput>, StorageError> {
    let selected = |entity_type| {
        scope
            .map(|values| values.contains(&entity_type))
            .unwrap_or(true)
    };
    let include_journals = selected(SearchEntityType::Journal);
    let include_blocks = selected(SearchEntityType::StructuredBlock);
    let include_knowledge = selected(SearchEntityType::KnowledgeItem);
    let include_tasks = selected(SearchEntityType::Task);

    let journal_tags = read_tag_names(connection, "journal_tags", "journal_id")?;
    let knowledge_tags = read_tag_names(connection, "knowledge_tags", "knowledge_item_id")?;
    let mut documents = Vec::new();

    if include_journals || include_blocks {
        let mut statement = connection.prepare(
            "SELECT id, journal_date, title, content_plain_text, content_hash, updated_at
             FROM journals
             WHERE deleted_at IS NULL AND status = 'active'
             ORDER BY id",
        )?;
        let journals = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut blocks_by_journal = std::collections::HashMap::<String, Vec<String>>::new();
        let mut blocks = Vec::new();
        if include_blocks {
            let mut statement = connection.prepare(
                "SELECT b.id, b.journal_id, b.block_type, b.rendered_text, b.updated_at
                 FROM structured_blocks b
                 JOIN journals j ON j.id = b.journal_id
                 WHERE b.deleted_at IS NULL
                   AND j.deleted_at IS NULL
                   AND j.status = 'active'
                 ORDER BY b.id",
            )?;
            blocks = statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
        }
        if include_journals {
            let mut statement = connection.prepare(
                "SELECT b.journal_id, b.rendered_text
                 FROM structured_blocks b
                 JOIN journals j ON j.id = b.journal_id
                 WHERE b.deleted_at IS NULL
                   AND j.deleted_at IS NULL
                   AND j.status = 'active'
                 ORDER BY b.journal_id, b.order_key, b.id",
            )?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            for (journal_id, rendered_text) in rows {
                if !rendered_text.trim().is_empty() {
                    blocks_by_journal
                        .entry(journal_id)
                        .or_default()
                        .push(rendered_text.trim().to_owned());
                }
            }
        }

        for (id, journal_date, title, body_text, content_hash, updated_at) in journals {
            if is_cancelled() {
                return Ok(Vec::new());
            }
            let tags_text = journal_tags.get(&id).cloned().unwrap_or_default();
            if include_journals {
                let structured_text = blocks_by_journal
                    .get(&id)
                    .map(|values| values.join("\n"))
                    .unwrap_or_default();
                documents.push(build_search_document(
                    id.clone(),
                    SearchEntityType::Journal,
                    id,
                    fallback_title(&title, &body_text),
                    body_text,
                    structured_text,
                    tags_text.clone(),
                    Some(journal_date),
                    updated_at,
                    content_hash,
                ));
            }
        }

        if include_blocks {
            let journal_titles = connection
                .prepare(
                    "SELECT id, journal_date, title
                     FROM journals
                     WHERE deleted_at IS NULL AND status = 'active'",
                )?
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .map(|(id, date, title)| (id, (date, title)))
                .collect::<std::collections::HashMap<_, _>>();
            for (id, journal_id, block_type, rendered_text, updated_at) in blocks {
                if is_cancelled() {
                    return Ok(Vec::new());
                }
                let Some((local_date, journal_title)) = journal_titles.get(&journal_id) else {
                    continue;
                };
                documents.push(build_search_document(
                    id.clone(),
                    SearchEntityType::StructuredBlock,
                    id,
                    format!(
                        "{} · {block_type}",
                        fallback_title(journal_title, &rendered_text)
                    ),
                    rendered_text.clone(),
                    rendered_text,
                    journal_tags.get(&journal_id).cloned().unwrap_or_default(),
                    Some(local_date.clone()),
                    updated_at,
                    EMPTY_CONTENT_HASH.to_owned(),
                ));
            }
        }
    }

    if include_knowledge {
        let mut statement = connection.prepare(
            "SELECT id, title, content_plain_text, content_hash, updated_at
             FROM knowledge_items
             WHERE deleted_at IS NULL AND status = 'active'
             ORDER BY id",
        )?;
        for row in statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })? {
            if is_cancelled() {
                return Ok(Vec::new());
            }
            let (id, title, body_text, content_hash, updated_at) = row?;
            documents.push(build_search_document(
                id.clone(),
                SearchEntityType::KnowledgeItem,
                id.clone(),
                fallback_title(&title, &body_text),
                body_text,
                String::new(),
                knowledge_tags.get(&id).cloned().unwrap_or_default(),
                updated_at.get(..10).map(ToOwned::to_owned),
                updated_at,
                content_hash,
            ));
        }
    }

    if include_tasks {
        let mut statement = connection.prepare(
            "SELECT id, title, description_text, due_date, updated_at
             FROM tasks
             WHERE deleted_at IS NULL
             ORDER BY id",
        )?;
        for row in statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
            ))
        })? {
            if is_cancelled() {
                return Ok(Vec::new());
            }
            let (id, title, body_text, local_date, updated_at) = row?;
            documents.push(build_search_document(
                id.clone(),
                SearchEntityType::Task,
                id,
                fallback_title(&title, &body_text),
                body_text,
                String::new(),
                String::new(),
                local_date,
                updated_at,
                EMPTY_CONTENT_HASH.to_owned(),
            ));
        }
    }

    documents.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(documents)
}

fn read_tag_names(
    connection: &Connection,
    link_table: &str,
    owner_column: &str,
) -> Result<std::collections::HashMap<String, String>, StorageError> {
    let sql = format!(
        "SELECT l.{owner_column}, t.name
         FROM {link_table} l
         JOIN tags t ON t.id = l.tag_id
         ORDER BY l.{owner_column}, t.name COLLATE NOCASE, t.name"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut names = std::collections::HashMap::<String, Vec<String>>::new();
    for (owner_id, name) in rows {
        if !name.trim().is_empty() {
            names
                .entry(owner_id)
                .or_default()
                .push(name.trim().to_owned());
        }
    }
    Ok(names
        .into_iter()
        .map(|(owner_id, values)| (owner_id, values.join(" ")))
        .collect())
}

fn fallback_title(title: &str, body_text: &str) -> String {
    let title = title.trim();
    if !title.is_empty() {
        return title.to_owned();
    }
    body_text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(120).collect())
        .unwrap_or_else(|| "无标题日志".to_owned())
}

#[allow(clippy::too_many_arguments)]
fn build_search_document(
    id: String,
    entity_type: SearchEntityType,
    entity_id: String,
    title: String,
    body_text: String,
    structured_text: String,
    tags_text: String,
    local_date: Option<String>,
    updated_at: String,
    content_hash: String,
) -> SearchDocumentInput {
    let normalized_text = normalize_search_text(&format!(
        "{title}\n{body_text}\n{structured_text}\n{tags_text}"
    ));
    SearchDocumentInput {
        id,
        entity_type,
        entity_id,
        title,
        body_text: body_text.trim().to_owned(),
        structured_text: structured_text.trim().to_owned(),
        tags_text,
        tokenized_text: tokenized_text_for_index("", "", "", "", &normalized_text),
        normalized_text,
        local_date,
        updated_at,
        content_hash,
        index_version: SEARCH_INDEX_VERSION,
    }
}
