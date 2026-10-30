use tauri::State;

use crate::db::{
    journal_repository,
    models::{
        Journal, JournalListQuery, JournalSaveState, JournalSummary, JournalVersion,
        JournalVersionSummary, Page, RestoreJournalVersionInput, SaveJournalSnapshot,
        SavedJournalSnapshot,
    },
    Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_get_by_date(
    state: State<'_, Database>,
    journal_date: String,
) -> Result<Option<Journal>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::get_by_date(connection, &journal_date)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_get_by_id(
    state: State<'_, Database>,
    journal_id: String,
) -> Result<Option<Journal>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::get_by_id(connection, &journal_id)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_get_save_state(
    state: State<'_, Database>,
    journal_id: String,
) -> Result<Option<JournalSaveState>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::get_save_state(connection, &journal_id)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_list_summaries(
    state: State<'_, Database>,
    query: JournalListQuery,
) -> Result<Page<JournalSummary>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::list_summaries(connection, &query)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_save_snapshot(
    state: State<'_, Database>,
    input: SaveJournalSnapshot,
) -> Result<SavedJournalSnapshot, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::save_snapshot(connection, &input)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_list_versions(
    state: State<'_, Database>,
    journal_id: String,
    limit: Option<i64>,
    cursor: Option<String>,
) -> Result<Page<JournalVersionSummary>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::list_versions(connection, &journal_id, limit, cursor.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_get_version(
    state: State<'_, Database>,
    journal_id: String,
    revision: i64,
) -> Result<Option<JournalVersion>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::get_version(connection, &journal_id, revision)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_restore_version(
    state: State<'_, Database>,
    input: RestoreJournalVersionInput,
) -> Result<SavedJournalSnapshot, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::restore_version(connection, &input)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn journal_soft_delete(
    state: State<'_, Database>,
    journal_id: String,
    expected_revision: i64,
    deleted_at: String,
) -> Result<(), StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        journal_repository::soft_delete(connection, &journal_id, expected_revision, &deleted_at)
    })
    .await
}
