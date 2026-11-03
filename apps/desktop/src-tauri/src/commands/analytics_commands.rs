use tauri::State;

use crate::db::{
    analytics_repository,
    models::{AnalyticsPeriodQuery, AnalyticsSource},
    Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn analytics_get_source(
    state: State<'_, Database>,
    query: AnalyticsPeriodQuery,
) -> Result<AnalyticsSource, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        analytics_repository::get_source(connection, &query)
    })
    .await
}
