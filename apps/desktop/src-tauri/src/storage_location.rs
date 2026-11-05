use std::{
    collections::BTreeMap,
    fmt, fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

use rusqlite::{backup::Progress, Connection, DatabaseName};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const DATABASE_FILE_NAME: &str = "dailyflow.db";
const ATTACHMENTS_DIRECTORY: &str = "attachments";
const MIGRATION_BACKUP_DIRECTORY: &str = ".dailyflow-migration-backups";

#[derive(Debug)]
pub enum StorageLocationError {
    InvalidPath(String),
    DatabaseValidation(String),
    Io(io::Error),
    Serialization(serde_json::Error),
    Sqlite(rusqlite::Error),
}

impl fmt::Display for StorageLocationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPath(message) => write!(formatter, "{message}"),
            Self::DatabaseValidation(message) => write!(formatter, "{message}"),
            Self::Io(error) => write!(formatter, "file operation failed: {error}"),
            Self::Serialization(error) => {
                write!(formatter, "data-location serialization failed: {error}")
            }
            Self::Sqlite(error) => write!(formatter, "SQLite operation failed: {error}"),
        }
    }
}

impl std::error::Error for StorageLocationError {}

impl From<io::Error> for StorageLocationError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for StorageLocationError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialization(error)
    }
}

impl From<rusqlite::Error> for StorageLocationError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocationFile {
    data_directory: String,
}

pub struct StorageLocationConfig;

impl StorageLocationConfig {
    pub fn read(path: &Path) -> Result<Option<PathBuf>, StorageLocationError> {
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let stored: LocationFile = serde_json::from_slice(&bytes)?;
        let directory = PathBuf::from(stored.data_directory);
        if !directory.is_absolute() {
            return Err(StorageLocationError::InvalidPath(
                "configured data directory must be an absolute path".to_owned(),
            ));
        }
        Ok(Some(directory))
    }

    pub fn write(path: &Path, directory: &Path) -> Result<(), StorageLocationError> {
        if !directory.is_absolute() {
            return Err(StorageLocationError::InvalidPath(
                "data directory must be an absolute path".to_owned(),
            ));
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let temporary_path = path.with_extension("json.tmp");
        let serialized = serde_json::to_vec_pretty(&LocationFile {
            data_directory: directory.to_string_lossy().into_owned(),
        })?;
        let mut temporary = fs::File::create(&temporary_path)?;
        temporary.write_all(&serialized)?;
        temporary.sync_all()?;
        drop(temporary);

        let previous_path = path.with_extension("json.previous");
        if previous_path.exists() {
            fs::remove_file(&previous_path)?;
        }
        if path.exists() {
            fs::rename(path, &previous_path)?;
        }
        if let Err(error) = fs::rename(&temporary_path, path) {
            let _ = fs::remove_file(&temporary_path);
            if previous_path.exists() {
                let _ = fs::rename(&previous_path, path);
            }
            return Err(error.into());
        }
        let _ = fs::remove_file(previous_path);
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReceipt {
    pub backup_directory: PathBuf,
    pub destination: PathBuf,
}

pub fn migrate_data_dir(
    source: &Path,
    destination: &Path,
) -> Result<MigrationReceipt, StorageLocationError> {
    validate_migration_paths(source, destination)?;
    let source_database = source.join(DATABASE_FILE_NAME);
    verify_database(&source_database)?;

    let backup_directory = create_migration_backup(source, &source_database)?;
    let staging = unique_staging_directory(destination)?;
    let migration_result = (|| {
        copy_database(&source_database, &staging.join(DATABASE_FILE_NAME))?;
        copy_attachments(source, &staging)?;
        verify_database(&staging.join(DATABASE_FILE_NAME))?;
        verify_attachments(source, &staging)?;
        promote_staging(&staging, destination)?;
        Ok(MigrationReceipt {
            backup_directory: backup_directory.clone(),
            destination: destination.to_path_buf(),
        })
    })();

    if migration_result.is_err() {
        let _ = remove_directory_if_exists(&staging);
    }
    migration_result
}

pub fn resolve_data_directory(
    default_directory: &Path,
    config_path: &Path,
) -> Result<PathBuf, StorageLocationError> {
    let configured = StorageLocationConfig::read(config_path)?;
    let Some(configured) = configured else {
        return Ok(default_directory.to_path_buf());
    };
    if configured.join(DATABASE_FILE_NAME).is_file() {
        return Ok(configured);
    }
    Ok(default_directory.to_path_buf())
}

fn validate_migration_paths(source: &Path, destination: &Path) -> Result<(), StorageLocationError> {
    if !source.is_absolute() || !destination.is_absolute() {
        return Err(StorageLocationError::InvalidPath(
            "source and destination data directories must be absolute paths".to_owned(),
        ));
    }
    if !source.is_dir() {
        return Err(StorageLocationError::InvalidPath(
            "source data directory does not exist".to_owned(),
        ));
    }
    if source == destination {
        return Err(StorageLocationError::InvalidPath(
            "destination must differ from the current data directory".to_owned(),
        ));
    }
    if destination.exists() {
        let mut entries = fs::read_dir(destination)?;
        if entries.next().transpose()?.is_some() {
            return Err(StorageLocationError::InvalidPath(
                "destination data directory must be empty".to_owned(),
            ));
        }
    }
    Ok(())
}

fn create_migration_backup(
    source: &Path,
    source_database: &Path,
) -> Result<PathBuf, StorageLocationError> {
    let backup = source
        .join(MIGRATION_BACKUP_DIRECTORY)
        .join(Uuid::now_v7().to_string());
    fs::create_dir_all(&backup)?;
    copy_database(source_database, &backup.join(DATABASE_FILE_NAME))?;
    copy_attachments(source, &backup)?;
    verify_database(&backup.join(DATABASE_FILE_NAME))?;
    verify_attachments(source, &backup)?;
    Ok(backup)
}

fn copy_database(source: &Path, destination: &Path) -> Result<(), StorageLocationError> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    if destination.exists() {
        return Err(StorageLocationError::InvalidPath(format!(
            "database copy destination already exists: {}",
            destination.display()
        )));
    }

    let connection = Connection::open(source)?;
    connection.backup(DatabaseName::Main, destination, None::<fn(Progress)>)?;
    Ok(())
}

fn copy_attachments(source: &Path, destination_root: &Path) -> Result<(), StorageLocationError> {
    let source_attachments = source.join(ATTACHMENTS_DIRECTORY);
    if !source_attachments.exists() {
        return Ok(());
    }
    if !source_attachments.is_dir() {
        return Err(StorageLocationError::InvalidPath(
            "attachments path must be a directory".to_owned(),
        ));
    }

    for relative_path in relative_files(&source_attachments)? {
        let source_file = source_attachments.join(&relative_path);
        let destination_file = destination_root
            .join(ATTACHMENTS_DIRECTORY)
            .join(relative_path);
        if let Some(parent) = destination_file.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source_file, destination_file)?;
    }
    Ok(())
}

fn verify_database(path: &Path) -> Result<(), StorageLocationError> {
    if !path.is_file() {
        return Err(StorageLocationError::DatabaseValidation(format!(
            "database file is missing: {}",
            path.display()
        )));
    }
    let connection = Connection::open(path)?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(StorageLocationError::DatabaseValidation(format!(
            "database integrity check failed: {integrity}"
        )));
    }
    let foreign_key_violation: i64 = connection
        .query_row("PRAGMA foreign_key_check", [], |row| row.get(0))
        .unwrap_or(0);
    if foreign_key_violation != 0 {
        return Err(StorageLocationError::DatabaseValidation(
            "database contains foreign-key violations".to_owned(),
        ));
    }
    Ok(())
}

fn verify_attachments(source: &Path, destination_root: &Path) -> Result<(), StorageLocationError> {
    let source_attachments = source.join(ATTACHMENTS_DIRECTORY);
    if !source_attachments.exists() {
        return Ok(());
    }
    let source_files = file_hashes(&source_attachments)?;
    let destination_files = file_hashes(&destination_root.join(ATTACHMENTS_DIRECTORY))?;
    if source_files != destination_files {
        return Err(StorageLocationError::DatabaseValidation(
            "attachment verification failed after copy".to_owned(),
        ));
    }
    Ok(())
}

fn file_hashes(root: &Path) -> Result<BTreeMap<PathBuf, [u8; 32]>, StorageLocationError> {
    let mut hashes = BTreeMap::new();
    for relative_path in relative_files(root)? {
        hashes.insert(relative_path.clone(), sha256(&root.join(relative_path))?);
    }
    Ok(hashes)
}

fn relative_files(root: &Path) -> Result<Vec<PathBuf>, StorageLocationError> {
    fn visit(
        root: &Path,
        directory: &Path,
        files: &mut Vec<PathBuf>,
    ) -> Result<(), StorageLocationError> {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            if entry.file_type()?.is_dir() {
                visit(root, &path, files)?;
            } else if entry.file_type()?.is_file() {
                files.push(
                    path.strip_prefix(root)
                        .expect("walk remains under root")
                        .to_path_buf(),
                );
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    if root.exists() {
        visit(root, root, &mut files)?;
    }
    files.sort();
    Ok(files)
}

fn sha256(path: &Path) -> Result<[u8; 32], StorageLocationError> {
    let bytes = fs::read(path)?;
    Ok(Sha256::digest(bytes).into())
}

fn unique_staging_directory(destination: &Path) -> Result<PathBuf, StorageLocationError> {
    let parent = destination.parent().ok_or_else(|| {
        StorageLocationError::InvalidPath("destination must have a parent directory".to_owned())
    })?;
    fs::create_dir_all(parent)?;
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("dailyflow-data");
    Ok(parent.join(format!(".{name}.dailyflow-migration-{}", Uuid::now_v7())))
}

fn promote_staging(staging: &Path, destination: &Path) -> Result<(), StorageLocationError> {
    if destination.exists() {
        if fs::read_dir(destination)?.next().transpose()?.is_some() {
            return Err(StorageLocationError::InvalidPath(
                "destination data directory became non-empty during migration".to_owned(),
            ));
        }
        fs::remove_dir(destination)?;
    }
    fs::rename(staging, destination)?;
    Ok(())
}

fn remove_directory_if_exists(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
