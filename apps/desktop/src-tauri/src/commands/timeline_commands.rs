use tauri::State;

use crate::db::{
    models::{Page, TimelineCalendarQuery, TimelineDaySummary, TimelineListQuery},
    timeline_repository, Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn timeline_get_calendar(
    state: State<'_, Database>,
    query: TimelineCalendarQuery,
) -> Result<Vec<TimelineDaySummary>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        timeline_repository::get_calendar(connection, &query)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn timeline_list_entries(
    state: State<'_, Database>,
    query: TimelineListQuery,
) -> Result<Page<TimelineDaySummary>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        timeline_repository::list_entries(connection, &query)
    })
    .await
}
