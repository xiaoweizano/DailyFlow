use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    attachments::{AttachmentOwnerType, AttachmentPutInput, AttachmentStore},
    db::{Database, StorageError},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentPutCommandInput {
    owner_type: AttachmentOwnerType,
    owner_id: String,
    display_name: String,
    mime_type: String,
    bytes_base64: String,
    alt_text: Option<String>,
    is_inline: Option<bool>,
    sort_order: Option<i64>,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDataOutput {
    mime_type: String,
    bytes_base64: String,
}

async fn run_attachment_task<T>(
    database: Database,
    store: AttachmentStore,
    operation: impl FnOnce(&Database, &AttachmentStore) -> Result<T, StorageError> + Send + 'static,
) -> Result<T, StorageError>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || operation(&database, &store))
        .await
        .map_err(|error| {
            StorageError::storage(format!("Attachment storage task failed: {error}"))
        })?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn attachment_put(
    database: State<'_, Database>,
    attachments: State<'_, AttachmentStore>,
    input: AttachmentPutCommandInput,
) -> Result<crate::attachments::StoredAttachment, StorageError> {
    let bytes = STANDARD
        .decode(input.bytes_base64)
        .map_err(|_| StorageError::validation("bytesBase64 must be valid Base64"))?;
    let input = AttachmentPutInput {
        owner_type: input.owner_type,
        owner_id: input.owner_id,
        display_name: input.display_name,
        mime_type: input.mime_type,
        bytes,
        alt_text: input.alt_text,
        is_inline: input.is_inline.unwrap_or(false),
        sort_order: input.sort_order.unwrap_or(0),
        created_at: input.created_at,
    };
    run_attachment_task(
        database.inner().clone(),
        attachments.inner().clone(),
        move |db, store| store.put(db, input),
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn attachment_read(
    database: State<'_, Database>,
    attachments: State<'_, AttachmentStore>,
    attachment_id: String,
) -> Result<AttachmentDataOutput, StorageError> {
    run_attachment_task(
        database.inner().clone(),
        attachments.inner().clone(),
        move |db, store| {
            store
                .read_data(db, &attachment_id)
                .map(|data| AttachmentDataOutput {
                    mime_type: data.mime_type,
                    bytes_base64: STANDARD.encode(data.bytes),
                })
        },
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn attachment_soft_delete_owner_links(
    database: State<'_, Database>,
    attachments: State<'_, AttachmentStore>,
    owner_type: AttachmentOwnerType,
    owner_id: String,
    deleted_at: String,
) -> Result<(), StorageError> {
    run_attachment_task(
        database.inner().clone(),
        attachments.inner().clone(),
        move |db, store| store.soft_delete_owner_links(db, owner_type, &owner_id, &deleted_at),
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn attachment_remove_orphan(
    database: State<'_, Database>,
    attachments: State<'_, AttachmentStore>,
    attachment_id: String,
) -> Result<(), StorageError> {
    run_attachment_task(
        database.inner().clone(),
        attachments.inner().clone(),
        move |db, store| store.remove_orphan(db, &attachment_id),
    )
    .await
}
