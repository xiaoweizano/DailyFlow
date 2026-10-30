use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use super::{StorageError, StorageErrorCode};

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "search_fts",
        sql: include_str!("../../migrations/0002_search_fts.sql"),
    },
];

pub fn run(connection: &mut Connection) -> Result<(), StorageError> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version    INTEGER PRIMARY KEY,
           name       TEXT NOT NULL,
           checksum   TEXT NOT NULL,
           applied_at TEXT NOT NULL
         ) STRICT;",
    )?;

    for migration in MIGRATIONS {
        let checksum = sha256_hex(migration.sql.as_bytes());
        let applied_checksum: Option<String> = connection
            .query_row(
                "SELECT checksum FROM schema_migrations WHERE version = ?1",
                [migration.version],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(applied_checksum) = applied_checksum {
            if applied_checksum != checksum {
                return Err(StorageError::new(
                    StorageErrorCode::MigrationFailed,
                    format!(
                        "migration {} checksum mismatch: expected {}, found {}",
                        migration.version, checksum, applied_checksum
                    ),
                ));
            }
            continue;
        }

        let transaction = connection.transaction()?;
        transaction.execute_batch(migration.sql).map_err(|error| {
            StorageError::new(
                StorageErrorCode::MigrationFailed,
                format!("migration {} failed: {error}", migration.version),
            )
        })?;
        transaction
            .execute(
                "INSERT INTO schema_migrations (version, name, checksum, applied_at)
                 VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                (migration.version, migration.name, checksum),
            )
            .map_err(|error| {
                StorageError::new(
                    StorageErrorCode::MigrationFailed,
                    format!("failed to record migration {}: {error}", migration.version),
                )
            })?;
        transaction.commit()?;
    }

    let current = current_version(connection)?;
    connection.pragma_update(None, "user_version", current)?;
    Ok(())
}

pub fn current_version(connection: &Connection) -> Result<i64, StorageError> {
    Ok(connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?)
}

fn sha256_hex(value: &[u8]) -> String {
    let digest = Sha256::digest(value);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}
