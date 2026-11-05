use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::{
    db::{settings_repository, Database, StorageError},
    storage_location::{
        migrate_data_dir, resolve_data_directory, StorageLocationConfig, StorageLocationError,
    },
};

#[derive(Debug, Clone)]
pub struct StorageLocationState {
    pub config_path: PathBuf,
    pub default_directory: PathBuf,
    pub current_directory: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocationInfo {
    pub current_directory: PathBuf,
    pub default_directory: PathBuf,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageMigrationResult {
    pub destination: PathBuf,
    pub backup_directory: PathBuf,
    pub restart_required: bool,
}

impl StorageLocationState {
    pub fn new(
        config_path: PathBuf,
        default_directory: PathBuf,
        current_directory: PathBuf,
    ) -> Self {
        Self {
            config_path,
            default_directory,
            current_directory,
        }
    }
}

#[tauri::command]
pub fn storage_location_get(state: tauri::State<'_, StorageLocationState>) -> StorageLocationInfo {
    StorageLocationInfo {
        is_custom: state.current_directory != state.default_directory,
        current_directory: state.current_directory.clone(),
        default_directory: state.default_directory.clone(),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn storage_location_migrate(
    state: tauri::State<'_, StorageLocationState>,
    destination: String,
    preferences_json: String,
) -> Result<StorageMigrationResult, StorageError> {
    let source = state.current_directory.clone();
    let destination = PathBuf::from(destination);
    if !destination.is_absolute() {
        return Err(StorageError::validation(
            "destination data directory must be an absolute path",
        ));
    }
    serde_json::from_str::<serde_json::Value>(&preferences_json)
        .map_err(|_| StorageError::validation("preferencesJson must contain valid JSON"))?;

    let migration_source = source.clone();
    let migration_destination = destination.clone();
    let receipt = tauri::async_runtime::spawn_blocking(move || {
        migrate_data_dir(&migration_source, &migration_destination)
    })
    .await
    .map_err(|error| StorageError::storage(format!("storage migration task failed: {error}")))?
    .map_err(|error| StorageError::storage(error.to_string()))?;

    let update_destination = destination.clone();
    let update_preferences = preferences_json.clone();
    let database_result = tauri::async_runtime::spawn_blocking(move || {
        let database = Database::open(update_destination.join("dailyflow.db"))?;
        database.with_connection(|connection| {
            settings_repository::write(connection, "user-preferences", &update_preferences)
        })
    })
    .await
    .map_err(|error| StorageError::storage(format!("settings migration task failed: {error}")))?;

    if let Err(error) = database_result {
        let _ = std::fs::remove_dir_all(&destination);
        return Err(error);
    }

    let config_path = state.config_path.clone();
    let config_destination = destination.clone();
    let config_result = tauri::async_runtime::spawn_blocking(move || {
        StorageLocationConfig::write(&config_path, &config_destination)
    })
    .await
    .map_err(|error| {
        StorageError::storage(format!(
            "storage location configuration task failed: {error}"
        ))
    })?;
    if let Err(error) = config_result {
        let _ = std::fs::remove_dir_all(&destination);
        return Err(storage_location_error(error));
    }

    Ok(StorageMigrationResult {
        destination,
        backup_directory: receipt.backup_directory,
        restart_required: true,
    })
}

pub fn locate_data_directory(
    default_directory: &Path,
    config_path: &Path,
) -> Result<PathBuf, StorageError> {
    resolve_data_directory(default_directory, config_path).map_err(storage_location_error)
}

#[tauri::command]
pub fn desktop_apply_startup_preferences(app: AppHandle, autostart: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if autostart {
        manager
            .enable()
            .map_err(|error| format!("failed to enable autostart: {error}"))
    } else {
        manager
            .disable()
            .map_err(|error| format!("failed to disable autostart: {error}"))
    }
}

fn storage_location_error(error: StorageLocationError) -> StorageError {
    StorageError::storage(error.to_string())
}
