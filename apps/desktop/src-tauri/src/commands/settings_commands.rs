use tauri::State;

use crate::db::{
    settings_repository::{self, SettingsReadResult},
    Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn settings_read(
    state: State<'_, Database>,
    key: String,
) -> Result<SettingsReadResult, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        settings_repository::read(connection, &key)
            .map(|value_json| SettingsReadResult { value_json })
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn settings_write(
    state: State<'_, Database>,
    key: String,
    value_json: String,
) -> Result<(), StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        settings_repository::write(connection, &key, &value_json)
    })
    .await
}
