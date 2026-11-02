#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "desktop-shell")]
use serde::Serialize;

#[cfg(feature = "desktop-shell")]
use dailyflow_desktop::{
    attachments::AttachmentStore,
    commands::{
        attachment_commands, journal_commands, knowledge_commands, search_commands, task_commands,
        timeline_commands,
    },
    db::Database,
};
#[cfg(feature = "desktop-shell")]
use tauri::Manager;

#[cfg(feature = "desktop-shell")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
}

#[cfg(feature = "desktop-shell")]
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "DailyFlow",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

#[cfg(feature = "desktop-shell")]
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            let database_path = data_directory.join("dailyflow.db");
            app.manage(Database::open(database_path)?);
            app.manage(AttachmentStore::open(data_directory)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            journal_commands::journal_get_by_date,
            journal_commands::journal_get_by_id,
            journal_commands::journal_get_save_state,
            journal_commands::journal_list_summaries,
            journal_commands::journal_save_snapshot,
            journal_commands::journal_list_versions,
            journal_commands::journal_get_version,
            journal_commands::journal_restore_version,
            journal_commands::journal_soft_delete,
            knowledge_commands::knowledge_get_by_id,
            knowledge_commands::knowledge_list,
            knowledge_commands::knowledge_save,
            knowledge_commands::knowledge_soft_delete,
            task_commands::task_get_by_id,
            task_commands::task_list,
            task_commands::task_save,
            task_commands::task_complete,
            task_commands::task_soft_delete,
            timeline_commands::timeline_get_calendar,
            timeline_commands::timeline_list_entries,
            search_commands::search_query,
            search_commands::search_rebuild,
            attachment_commands::attachment_put,
            attachment_commands::attachment_read,
            attachment_commands::attachment_soft_delete_owner_links,
            attachment_commands::attachment_remove_orphan
        ])
        .run(tauri::generate_context!())
        .expect("failed to run DailyFlow desktop application");
}

#[cfg(not(feature = "desktop-shell"))]
fn main() {}
