use tauri::State;

use crate::db::{
    models::{SearchQuery, SearchResultPage},
    search_repository, Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn search_query(
    state: State<'_, Database>,
    query: SearchQuery,
) -> Result<SearchResultPage, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        search_repository::query(connection, &query)
    })
    .await
}
