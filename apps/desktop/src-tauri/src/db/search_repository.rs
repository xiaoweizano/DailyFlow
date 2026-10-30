use std::collections::HashSet;

use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
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
    if state == "ready" {
        Ok(state)
    } else {
        Ok("stale".to_owned())
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
