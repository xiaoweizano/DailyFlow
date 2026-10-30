#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "desktop-shell")]
use serde::Serialize;

#[cfg(feature = "desktop-shell")]
use dailyflow_desktop::{
    commands::{journal_commands, search_commands},
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
            let database_path = app.path().app_data_dir()?.join("dailyflow.db");
            app.manage(Database::open(database_path)?);
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
            search_commands::search_query
        ])
        .run(tauri::generate_context!())
        .expect("failed to run DailyFlow desktop application");
}

#[cfg(not(feature = "desktop-shell"))]
fn main() {}
