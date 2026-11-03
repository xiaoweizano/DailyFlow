use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::db::{
    models::{SearchEntityType, SearchQuery, SearchRebuildResult, SearchResultPage},
    search_repository, Database, StorageError,
};

use super::run_storage_task;

#[derive(Clone, Default)]
pub struct SearchRebuildState {
    cancelled_requests: Arc<Mutex<HashSet<String>>>,
}

impl SearchRebuildState {
    fn prepare(&self, request_id: &str) {
        self.cancelled_requests
            .lock()
            .expect("search cancellation state poisoned")
            .remove(request_id);
    }

    fn cancel(&self, request_id: String) {
        self.cancelled_requests
            .lock()
            .expect("search cancellation state poisoned")
            .insert(request_id);
    }

    fn finish(&self, request_id: &str) {
        self.cancelled_requests
            .lock()
            .expect("search cancellation state poisoned")
            .remove(request_id);
    }

    fn is_cancelled(&self, request_id: &str) -> bool {
        self.cancelled_requests
            .lock()
            .expect("search cancellation state poisoned")
            .contains(request_id)
    }
}

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

#[tauri::command(rename_all = "camelCase")]
pub async fn search_rebuild(
    app: AppHandle,
    state: State<'_, Database>,
    rebuild_state: State<'_, SearchRebuildState>,
    request_id: String,
    scope: Option<Vec<SearchEntityType>>,
) -> Result<SearchRebuildResult, StorageError> {
    rebuild_state.prepare(&request_id);
    let cancellation = rebuild_state.inner().clone();
    let task_request_id = request_id.clone();
    let result = run_storage_task(state.inner().clone(), move |connection| {
        search_repository::rebuild_with_progress(
            connection,
            scope.as_deref(),
            || cancellation.is_cancelled(&task_request_id),
            |progress| {
                let _ = app.emit(
                    "search-rebuild-progress",
                    SearchRebuildProgressEvent {
                        request_id: task_request_id.clone(),
                        phase: progress.phase,
                        processed_count: progress.processed_count,
                        total_count: progress.total_count,
                    },
                );
            },
        )
    })
    .await;
    rebuild_state.finish(&request_id);
    result
}

#[tauri::command(rename_all = "camelCase")]
pub async fn search_cancel_rebuild(
    rebuild_state: State<'_, SearchRebuildState>,
    request_id: String,
) -> Result<(), StorageError> {
    rebuild_state.cancel(request_id);
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchRebuildProgressEvent {
    request_id: String,
    phase: String,
    processed_count: usize,
    total_count: usize,
}
