use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use super::StorageError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsReadResult {
    pub value_json: Option<String>,
}

pub fn read(connection: &Connection, key: &str) -> Result<Option<String>, StorageError> {
    validate_key(key)?;
    connection
        .query_row(
            "SELECT value_json FROM settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(StorageError::from)
}

pub fn write(connection: &Connection, key: &str, value_json: &str) -> Result<(), StorageError> {
    validate_key(key)?;
    serde_json::from_str::<serde_json::Value>(value_json)
        .map_err(|_| StorageError::validation("setting value must be valid JSON text"))?;

    connection.execute(
        "INSERT INTO settings (key, value_json, updated_at)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
        params![key, value_json],
    )?;
    Ok(())
}

fn validate_key(key: &str) -> Result<(), StorageError> {
    if key.trim().is_empty() || key.len() > 200 {
        return Err(StorageError::validation(
            "setting key must contain between 1 and 200 bytes",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::db::migrations;

    use super::{read, write};

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        migrations::run(&mut connection).expect("run migrations");
        connection
    }

    #[test]
    fn round_trips_json_text_by_key() {
        let connection = connection();
        let value_json = r#"{"theme":"dark","density":"compact"}"#;

        write(&connection, "user-preferences", value_json).expect("write setting");

        assert_eq!(
            read(&connection, "user-preferences").expect("read setting"),
            Some(value_json.to_owned())
        );
    }

    #[test]
    fn updates_an_existing_setting_in_place() {
        let connection = connection();

        write(&connection, "user-preferences", r#"{"theme":"light"}"#)
            .expect("write initial setting");
        write(&connection, "user-preferences", r#"{"theme":"dark"}"#).expect("update setting");

        assert_eq!(
            read(&connection, "user-preferences").expect("read setting"),
            Some(r#"{"theme":"dark"}"#.to_owned())
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM settings", [], |row| row
                    .get::<_, i64>(0))
                .expect("count settings"),
            1
        );
    }

    #[test]
    fn rejects_empty_keys_and_invalid_json() {
        let connection = connection();

        assert!(write(&connection, "", r#"{"theme":"dark"}"#).is_err());
        assert!(write(&connection, "user-preferences", "not-json").is_err());
        assert_eq!(
            read(&connection, "missing").expect("read missing setting"),
            None
        );
    }
}
