pub mod analytics_commands;
pub mod attachment_commands;
pub mod backup_commands;
pub mod export_commands;
pub mod import_commands;
pub mod journal_commands;
pub mod knowledge_commands;
pub mod report_commands;
pub mod search_commands;
pub mod task_commands;
pub mod timeline_commands;

use rusqlite::Connection;

use crate::db::{Database, StorageError};

pub(crate) async fn run_storage_task<T>(
    database: Database,
    operation: impl FnOnce(&mut Connection) -> Result<T, StorageError> + Send + 'static,
) -> Result<T, StorageError>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || database.with_connection(operation))
        .await
        .map_err(|error| StorageError::storage(format!("SQLite operation task failed: {error}")))?
}

#[cfg(test)]
mod tests {
    use std::thread;

    use tempfile::tempdir;

    use crate::db::Database;

    use super::run_storage_task;

    #[test]
    fn storage_task_offloads_work_from_calling_thread() {
        let directory = tempdir().expect("temporary directory");
        let database =
            Database::open(directory.path().join("dailyflow.db")).expect("open database");
        let calling_thread = thread::current().id();

        let worker_thread = tauri::async_runtime::block_on(run_storage_task(database, |_| {
            Ok(thread::current().id())
        }))
        .expect("run storage task");

        assert_ne!(worker_thread, calling_thread);
    }
}
