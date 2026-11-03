use tauri::State;

use crate::db::{
    data_health::{self, DataHealthSnapshot},
    Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn data_health_inspect(
    state: State<'_, Database>,
) -> Result<DataHealthSnapshot, StorageError> {
    run_storage_task(state.inner().clone(), |connection| {
        data_health::inspect(connection)
    })
    .await
}
