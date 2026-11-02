use tauri::State;

use crate::db::{
    knowledge_repository,
    models::{KnowledgeItem, KnowledgeListQuery, KnowledgeSaveCommand, Page},
    Database, StorageError,
};

use super::run_storage_task;

#[tauri::command(rename_all = "camelCase")]
pub async fn knowledge_get_by_id(
    state: State<'_, Database>,
    knowledge_item_id: String,
) -> Result<Option<KnowledgeItem>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        knowledge_repository::get_by_id(connection, &knowledge_item_id)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn knowledge_list(
    state: State<'_, Database>,
    query: KnowledgeListQuery,
) -> Result<Page<KnowledgeItem>, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        knowledge_repository::list(connection, &query)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn knowledge_save(
    state: State<'_, Database>,
    command: KnowledgeSaveCommand,
) -> Result<KnowledgeItem, StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        knowledge_repository::save(connection, &command)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn knowledge_soft_delete(
    state: State<'_, Database>,
    knowledge_item_id: String,
    expected_revision: i64,
    deleted_at: String,
) -> Result<(), StorageError> {
    run_storage_task(state.inner().clone(), move |connection| {
        knowledge_repository::soft_delete(
            connection,
            &knowledge_item_id,
            expected_revision,
            &deleted_at,
        )
    })
    .await
}
