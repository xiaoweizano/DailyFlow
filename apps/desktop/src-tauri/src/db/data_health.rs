use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{migrations, StorageError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataHealthFacts {
    pub integrity: String,
    pub foreign_key_violation_count: i64,
    pub duplicate_journal_date_count: i64,
    pub orphaned_attachment_count: i64,
    pub invalid_attachment_link_count: i64,
    pub invalid_task_relation_count: i64,
    pub indexed_document_count: i64,
    pub authoritative_document_count: i64,
    pub stale_projection_count: i64,
    pub stale_index_version_count: i64,
    pub search_index_state: String,
    pub last_backup_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataStorageSummary {
    pub storage_kind: String,
    pub location_label: String,
    pub schema_version: i64,
    pub usage_bytes: i64,
    pub quota_bytes: Option<i64>,
    pub persisted: bool,
    pub journal_count: i64,
    pub knowledge_item_count: i64,
    pub task_count: i64,
    pub attachment_count: i64,
    pub raw_import_byte_count: i64,
    pub search_document_count: i64,
    pub last_backup_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataHealthSnapshot {
    pub facts: DataHealthFacts,
    pub storage: DataStorageSummary,
}

pub fn inspect(connection: &Connection) -> Result<DataHealthSnapshot, StorageError> {
    let last_backup_at = read_last_backup_at(connection)?;
    let indexed_document_count = count(connection, "SELECT COUNT(*) FROM search_documents")?;
    let authoritative_document_count = count(
        connection,
        "SELECT
           (SELECT COUNT(*) FROM journals
            WHERE deleted_at IS NULL AND status = 'active')
         + (SELECT COUNT(*) FROM knowledge_items
            WHERE deleted_at IS NULL AND status = 'active')
         + (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL)
         + (SELECT COUNT(*)
            FROM structured_blocks b
            JOIN journals j ON j.id = b.journal_id
            WHERE b.deleted_at IS NULL
              AND j.deleted_at IS NULL
              AND j.status = 'active')",
    )?;
    let journal_count = count(
        connection,
        "SELECT COUNT(*) FROM journals WHERE deleted_at IS NULL AND status = 'active'",
    )?;
    let knowledge_item_count = count(
        connection,
        "SELECT COUNT(*) FROM knowledge_items
         WHERE deleted_at IS NULL AND status = 'active'",
    )?;
    let task_count = count(
        connection,
        "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL",
    )?;
    let attachment_count = count(
        connection,
        "SELECT COUNT(*) FROM attachment_links WHERE deleted_at IS NULL",
    )?;

    let page_count = count(connection, "SELECT page_count FROM pragma_page_count")?;
    let page_size = count(connection, "SELECT page_size FROM pragma_page_size")?;
    let usage_bytes = page_count.saturating_mul(page_size);
    let search_index_state = read_search_index_state(connection)?;

    Ok(DataHealthSnapshot {
        facts: DataHealthFacts {
            integrity: read_integrity(connection)?,
            foreign_key_violation_count: count_foreign_key_violations(connection)?,
            duplicate_journal_date_count: count(
                connection,
                "SELECT COUNT(*) FROM (
                   SELECT journal_date
                   FROM journals
                   WHERE deleted_at IS NULL
                   GROUP BY journal_date
                   HAVING COUNT(*) > 1
                 )",
            )?,
            orphaned_attachment_count: count(
                connection,
                "SELECT COUNT(*)
                 FROM attachment_blobs b
                 WHERE b.orphaned_at IS NOT NULL
                    OR NOT EXISTS (
                      SELECT 1
                      FROM attachment_links l
                      WHERE l.blob_id = b.id AND l.deleted_at IS NULL
                    )",
            )?,
            invalid_attachment_link_count: count(
                connection,
                "SELECT COUNT(*)
                 FROM attachment_links l
                 WHERE l.deleted_at IS NULL
                   AND (
                     NOT EXISTS (
                       SELECT 1 FROM attachment_blobs b WHERE b.id = l.blob_id
                     )
                     OR (
                       l.owner_type = 'journal'
                       AND NOT EXISTS (
                         SELECT 1 FROM journals j
                         WHERE j.id = l.owner_id
                           AND j.deleted_at IS NULL
                           AND j.status = 'active'
                       )
                     )
                     OR (
                       l.owner_type = 'knowledge_item'
                       AND NOT EXISTS (
                         SELECT 1 FROM knowledge_items k
                         WHERE k.id = l.owner_id
                           AND k.deleted_at IS NULL
                           AND k.status = 'active'
                       )
                     )
                     OR (
                       l.owner_type = 'structured_block'
                       AND NOT EXISTS (
                         SELECT 1
                         FROM structured_blocks b
                         JOIN journals j ON j.id = b.journal_id
                         WHERE b.id = l.owner_id
                           AND b.deleted_at IS NULL
                           AND j.deleted_at IS NULL
                           AND j.status = 'active'
                       )
                     )
                   )",
            )?,
            invalid_task_relation_count: count(
                connection,
                "SELECT COUNT(*)
                 FROM tasks t
                 WHERE t.deleted_at IS NULL
                   AND (
                     (
                       t.journal_id IS NOT NULL
                       AND NOT EXISTS (
                         SELECT 1 FROM journals j
                         WHERE j.id = t.journal_id
                           AND j.deleted_at IS NULL
                           AND j.status = 'active'
                       )
                     )
                     OR (
                       t.knowledge_item_id IS NOT NULL
                       AND NOT EXISTS (
                         SELECT 1 FROM knowledge_items k
                         WHERE k.id = t.knowledge_item_id
                           AND k.deleted_at IS NULL
                           AND k.status = 'active'
                       )
                     )
                   )",
            )?,
            indexed_document_count,
            authoritative_document_count,
            stale_projection_count: count(
                connection,
                "WITH authoritative(entity_type, entity_id, updated_at) AS (
                   SELECT 'journal', id, updated_at
                   FROM journals
                   WHERE deleted_at IS NULL AND status = 'active'
                   UNION ALL
                   SELECT 'knowledge_item', id, updated_at
                   FROM knowledge_items
                   WHERE deleted_at IS NULL AND status = 'active'
                   UNION ALL
                   SELECT 'task', id, updated_at
                   FROM tasks
                   WHERE deleted_at IS NULL
                   UNION ALL
                   SELECT 'structured_block', b.id, b.updated_at
                   FROM structured_blocks b
                   JOIN journals j ON j.id = b.journal_id
                   WHERE b.deleted_at IS NULL
                     AND j.deleted_at IS NULL
                     AND j.status = 'active'
                 )
                 SELECT COUNT(*)
                 FROM authoritative a
                 LEFT JOIN search_documents s
                   ON s.entity_type = a.entity_type
                  AND s.entity_id = a.entity_id
                 WHERE s.id IS NULL OR s.updated_at <> a.updated_at",
            )?,
            stale_index_version_count: count(
                connection,
                "SELECT COUNT(*) FROM search_documents WHERE index_version <> 1",
            )?,
            search_index_state: search_index_state.clone(),
            last_backup_at: last_backup_at.clone(),
        },
        storage: DataStorageSummary {
            storage_kind: "sqlite".to_owned(),
            location_label: "桌面应用数据目录 · SQLite".to_owned(),
            schema_version: migrations::current_version(connection)?,
            usage_bytes,
            quota_bytes: None,
            persisted: true,
            journal_count,
            knowledge_item_count,
            task_count,
            attachment_count,
            raw_import_byte_count: count(
                connection,
                "SELECT COALESCE(SUM(COALESCE(raw_size, length(raw_bytes), 0)), 0)
                 FROM import_entries",
            )?,
            search_document_count: indexed_document_count,
            last_backup_at,
        },
    })
}

fn count(connection: &Connection, sql: &str) -> Result<i64, StorageError> {
    Ok(connection.query_row(sql, [], |row| row.get(0))?)
}

fn read_integrity(connection: &Connection) -> Result<String, StorageError> {
    let mut statement = connection.prepare("PRAGMA integrity_check")?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if rows.len() == 1 && rows[0].eq_ignore_ascii_case("ok") {
        Ok("ok".to_owned())
    } else if rows.is_empty() {
        Ok("unknown".to_owned())
    } else {
        Ok(rows.join("; "))
    }
}

fn count_foreign_key_violations(connection: &Connection) -> Result<i64, StorageError> {
    let mut statement = connection.prepare("PRAGMA foreign_key_check")?;
    let count = statement.query_map([], |_| Ok(()))?.count();
    Ok(count as i64)
}

fn read_search_index_state(connection: &Connection) -> Result<String, StorageError> {
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
    Ok(match state.as_str() {
        "ready" | "stale" | "failed" => state,
        _ => "stale".to_owned(),
    })
}

fn read_last_backup_at(connection: &Connection) -> Result<Option<String>, StorageError> {
    let direct = read_metadata_value(connection, "lastBackupAt")?;
    if let Some(Value::String(value)) = direct {
        return Ok(Some(value));
    }
    let safety = read_metadata_value(connection, "lastRestoreSafetySnapshot")?;
    let Some(Value::Object(safety)) = safety else {
        return Ok(None);
    };
    Ok(safety
        .get("createdAt")
        .or_else(|| safety.get("created_at"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned))
}

fn read_metadata_value(connection: &Connection, key: &str) -> Result<Option<Value>, StorageError> {
    let value = connection
        .query_row(
            "SELECT value_json FROM app_metadata WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    value
        .map(|value| {
            serde_json::from_str(&value)
                .map_err(|error| StorageError::storage(format!("invalid app metadata: {error}")))
        })
        .transpose()
}
