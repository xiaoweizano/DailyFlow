use std::path::PathBuf;

use tauri::State;

use crate::db::{
    import_repository,
    models::{
        BeginImportCommitInput, ImportCommitBatchInput, ImportCommitSummary, ImportEntryInput,
        ImportExistingMatch, ImportSessionInput, RecordImportFailureInput,
    },
    Database, StorageError,
};
use crate::import::{
    read_txt_file, scan_txt_files, ImportScanResult, ImportSourceError, ImportTxtFile,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn import_create_session(
    state: State<'_, Database>,
    input: ImportSessionInput,
) -> Result<(), StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        import_repository::create_session(connection, &input)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_save_preview(
    state: State<'_, Database>,
    input: ImportSessionInput,
) -> Result<(), StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        import_repository::save_preview(connection, &input)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_find_existing_matches(
    state: State<'_, Database>,
    entries: Vec<ImportEntryInput>,
) -> Result<Vec<ImportExistingMatch>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        import_repository::find_existing_matches(connection, &entries)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_begin_commit(
    state: State<'_, Database>,
    input: BeginImportCommitInput,
) -> Result<ImportSessionInput, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        import_repository::begin_commit(connection, &input)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_commit_batch(
    state: State<'_, Database>,
    input: ImportCommitBatchInput,
) -> Result<ImportCommitSummary, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        import_repository::commit_batch(connection, &input)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_record_failure(
    state: State<'_, Database>,
    input: RecordImportFailureInput,
) -> Result<(), StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        import_repository::record_failure(connection, &input)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_scan_txt(root_path: String) -> Result<ImportScanResult, ImportSourceError> {
    tauri::async_runtime::spawn_blocking(move || scan_txt_files(&PathBuf::from(root_path)))
        .await
        .map_err(|error| ImportSourceError {
            code: "IMPORT_SCAN_FAILED".to_owned(),
            message: format!("Desktop file scan task failed: {error}"),
        })?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_read_txt(
    root_path: String,
    relative_path: String,
) -> Result<ImportTxtFile, ImportSourceError> {
    tauri::async_runtime::spawn_blocking(move || {
        read_txt_file(&PathBuf::from(root_path), &relative_path)
    })
    .await
    .map_err(|error| ImportSourceError {
        code: "FILE_READ_FAILED".to_owned(),
        message: format!("Desktop TXT read task failed: {error}"),
    })?
}
