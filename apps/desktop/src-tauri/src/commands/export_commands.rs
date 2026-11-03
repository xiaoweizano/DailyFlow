use tauri::State;

use crate::{
    attachments::AttachmentStore,
    db::{Database, StorageError},
    export::{
        create_snapshot, write_export_file, ExportSnapshot, ExportWriteFileInput,
        ExportWriteFileResult,
    },
};

#[tauri::command(rename_all = "camelCase")]
pub async fn export_snapshot(
    database: State<'_, Database>,
    attachments: State<'_, AttachmentStore>,
) -> Result<ExportSnapshot, StorageError> {
    let database = database.inner().clone();
    let attachments = attachments.inner().clone();
    tauri::async_runtime::spawn_blocking(move || create_snapshot(&database, &attachments))
        .await
        .map_err(|error| StorageError::storage(format!("export snapshot task failed: {error}")))?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn export_write_file(
    input: ExportWriteFileInput,
) -> Result<ExportWriteFileResult, StorageError> {
    tauri::async_runtime::spawn_blocking(move || write_export_file(input))
        .await
        .map_err(|error| StorageError::storage(format!("export write task failed: {error}")))?
}
