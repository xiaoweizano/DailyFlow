use dailyflow_desktop::db::{migrations, Database, StorageErrorCode};
use tempfile::tempdir;

#[test]
fn applies_all_migrations_to_a_new_database() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");

    database
        .with_connection(|connection| {
            let applied = migrations::current_version(connection)?;
            let user_version: i64 =
                connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
            let journal_mode: String =
                connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
            let foreign_keys: i64 =
                connection.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
            let busy_timeout: i64 =
                connection.pragma_query_value(None, "busy_timeout", |row| row.get(0))?;
            let migration_count: i64 =
                connection.query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                    row.get(0)
                })?;
            let fts_table_count: i64 = connection.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'search_fts'",
                [],
                |row| row.get(0),
            )?;

            assert_eq!(applied, 2);
            assert_eq!(user_version, 2);
            assert_eq!(journal_mode.to_lowercase(), "wal");
            assert_eq!(foreign_keys, 1);
            assert_eq!(busy_timeout, 5000);
            assert_eq!(migration_count, 2);
            assert_eq!(fts_table_count, 1);
            Ok(())
        })
        .expect("inspect migrated database");
}

#[test]
fn rerunning_migrations_is_idempotent() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");

    database
        .with_connection(|connection| {
            migrations::run(connection)?;
            migrations::run(connection)?;
            Ok(())
        })
        .expect("repeat migrations");

    database
        .with_connection(|connection| {
            let count: i64 =
                connection.query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                    row.get(0)
                })?;
            assert_eq!(count, 2);
            Ok(())
        })
        .expect("count migrations");
}

#[test]
fn rejects_an_applied_migration_whose_checksum_changed() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");

    database
        .with_connection(|connection| {
            connection.execute(
                "UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1",
                [],
            )?;
            Ok(())
        })
        .expect("tamper checksum");

    let error = database
        .with_connection(migrations::run)
        .expect_err("checksum mismatch must stop migration");

    assert_eq!(error.code, StorageErrorCode::MigrationFailed);
    assert!(error.message.contains("checksum"));
}
