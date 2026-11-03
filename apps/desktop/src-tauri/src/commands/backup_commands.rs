use tauri::State;

use crate::{
    attachments::AttachmentStore,
    backup::{
        create_snapshot, read_backup_file, restore_backup, write_backup_file, BackupReadFileResult,
        BackupRestoreInput, BackupRestoreResult, BackupSnapshot, BackupWriteFileInput,
        BackupWriteFileResult,
    },
    db::{Database, StorageError},
};

#[tauri::command(rename_all = "camelCase")]
pub async fn backup_snapshot(
    database: State<'_, Database>,
    attachments: State<'_, AttachmentStore>,
) -> Result<BackupSnapshot, StorageError> {
    let database = database.inner().clone();
    let attachments = attachments.inner().clone();
    tauri::async_runtime::spawn_blocking(move || create_snapshot(&database, &attachments))
        .await
        .map_err(|error| StorageError::storage(format!("backup snapshot task failed: {error}")))?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn backup_read_file(source_path: String) -> Result<BackupReadFileResult, StorageError> {
    tauri::async_runtime::spawn_blocking(move || read_backup_file(&source_path))
        .await
        .map_err(|error| StorageError::storage(format!("backup read task failed: {error}")))?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn backup_write_file(
    input: BackupWriteFileInput,
) -> Result<BackupWriteFileResult, StorageError> {
    tauri::async_runtime::spawn_blocking(move || write_backup_file(input))
        .await
        .map_err(|error| StorageError::storage(format!("backup write task failed: {error}")))?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn backup_restore(
    database: State<'_, Database>,
    attachments: State<'_, AttachmentStore>,
    input: BackupRestoreInput,
) -> Result<BackupRestoreResult, StorageError> {
    let database = database.inner().clone();
    let attachments = attachments.inner().clone();
    tauri::async_runtime::spawn_blocking(move || restore_backup(&database, &attachments, input))
        .await
        .map_err(|error| StorageError::storage(format!("backup restore task failed: {error}")))?
}
