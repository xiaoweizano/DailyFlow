pub mod analytics_repository;
pub mod data_health;
pub mod import_repository;
pub mod journal_repository;
pub mod knowledge_repository;
pub mod migrations;
pub mod models;
pub mod report_repository;
pub mod search_repository;
pub mod settings_repository;
pub mod task_repository;
pub mod timeline_repository;

use std::{
    fmt, fs,
    path::{Path, PathBuf},
    time::Duration,
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rusqlite::Connection;
use serde::{de::DeserializeOwned, Serialize};

pub use models::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StorageErrorCode {
    MigrationFailed,
    Conflict,
    NotFound,
    ValidationError,
    StorageUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageError {
    pub code: StorageErrorCode,
    pub message: String,
}

impl StorageError {
    pub(crate) fn new(code: StorageErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn validation(message: impl Into<String>) -> Self {
        Self::new(StorageErrorCode::ValidationError, message)
    }

    pub(crate) fn conflict(message: impl Into<String>) -> Self {
        Self::new(StorageErrorCode::Conflict, message)
    }

    pub(crate) fn not_found(message: impl Into<String>) -> Self {
        Self::new(StorageErrorCode::NotFound, message)
    }

    pub(crate) fn storage(message: impl Into<String>) -> Self {
        Self::new(StorageErrorCode::StorageUnavailable, message)
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for StorageError {}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        Self::storage(format!("SQLite operation failed: {error}"))
    }
}

impl From<serde_json::Error> for StorageError {
    fn from(error: serde_json::Error) -> Self {
        Self::storage(format!("JSON operation failed: {error}"))
    }
}

#[derive(Debug, Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                StorageError::storage(format!("failed to create database directory: {error}"))
            })?;
        }

        let database = Self { path };
        let mut connection = database.connect()?;
        migrations::run(&mut connection)?;
        Ok(database)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, StorageError>,
    ) -> Result<T, StorageError> {
        let mut connection = self.connect()?;
        migrations::run(&mut connection)?;
        operation(&mut connection)
    }

    fn connect(&self) -> Result<Connection, StorageError> {
        let connection = Connection::open(&self.path)?;
        configure_connection(&connection)?;
        Ok(connection)
    }
}

fn configure_connection(connection: &Connection) -> Result<(), StorageError> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.pragma_update(None, "temp_store", "MEMORY")?;
    connection.busy_timeout(Duration::from_millis(5_000))?;
    Ok(())
}

pub(crate) fn encode_cursor<T: Serialize>(value: &T) -> Result<String, StorageError> {
    let serialized = serde_json::to_vec(value)
        .map_err(|error| StorageError::storage(format!("failed to encode cursor: {error}")))?;
    Ok(URL_SAFE_NO_PAD.encode(serialized))
}

pub(crate) fn decode_cursor<T: DeserializeOwned>(value: &str) -> Result<T, StorageError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| StorageError::validation("Invalid pagination cursor"))?;
    serde_json::from_slice(&bytes)
        .map_err(|_| StorageError::validation("Invalid pagination cursor"))
}

pub(crate) fn resolve_page_size(limit: Option<i64>) -> Result<usize, StorageError> {
    let limit = limit.unwrap_or(20);
    if !(1..=100).contains(&limit) {
        return Err(StorageError::validation(
            "limit must be an integer between 1 and 100",
        ));
    }
    Ok(limit as usize)
}
