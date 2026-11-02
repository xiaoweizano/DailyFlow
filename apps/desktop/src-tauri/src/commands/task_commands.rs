use tauri::State;

use crate::db::{
    models::{Task, TaskCompleteCommand, TaskListQuery, TaskSaveCommand},
    task_repository, Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn task_get_by_id(
    state: State<'_, Database>,
    task_id: String,
) -> Result<Option<Task>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        task_repository::get_by_id(connection, &task_id)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn task_list(
    state: State<'_, Database>,
    query: TaskListQuery,
) -> Result<crate::db::models::Page<Task>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        task_repository::list(connection, &query)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn task_save(
    state: State<'_, Database>,
    command: TaskSaveCommand,
) -> Result<Task, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        task_repository::save(connection, &command)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn task_complete(
    state: State<'_, Database>,
    command: TaskCompleteCommand,
) -> Result<Task, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        task_repository::complete(connection, &command)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn task_soft_delete(
    state: State<'_, Database>,
    task_id: String,
    expected_revision: i64,
    deleted_at: String,
) -> Result<(), StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        task_repository::soft_delete(connection, &task_id, expected_revision, &deleted_at)
    })
    .await
}
