use tauri::State;

use crate::db::{
    models::{Report, ReportPeriodQuery, ReportSaveCommand},
    report_repository, Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn report_get_by_period(
    state: State<'_, Database>,
    query: ReportPeriodQuery,
) -> Result<Option<Report>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        report_repository::get_by_period(connection, &query)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn report_save(
    state: State<'_, Database>,
    command: ReportSaveCommand,
) -> Result<Report, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        report_repository::save(connection, &command)
    })
    .await
}
