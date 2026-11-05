#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "desktop-shell")]
use serde::Serialize;

#[cfg(feature = "desktop-shell")]
use dailyflow_desktop::{
    attachments::AttachmentStore,
    commands::{
        analytics_commands, attachment_commands, backup_commands, data_commands, export_commands,
        import_commands, journal_commands, knowledge_commands, report_commands, search_commands,
        settings_commands, storage_commands, task_commands, timeline_commands,
    },
    db::{settings_repository, Database},
    lifecycle,
};
#[cfg(feature = "desktop-shell")]
use tauri::Manager;
#[cfg(feature = "desktop-shell")]
use tauri_plugin_autostart::MacosLauncher;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent-start"]),
        ))
        .setup(|app| {
            let default_data_directory = app.path().app_data_dir()?;
            let config_path = app.path().app_config_dir()?.join("data-location.json");
            let data_directory =
                storage_commands::locate_data_directory(&default_data_directory, &config_path)?;
            let database_path = data_directory.join("dailyflow.db");
            let database = Database::open(database_path)?;
            let preferences = database.with_connection(|connection| {
                settings_repository::read(connection, "user-preferences")
            })?;
            let preferences = preferences
                .as_deref()
                .and_then(|value| serde_json::from_str::<serde_json::Value>(value).ok())
                .unwrap_or_default();
            let silent_start_preference = preferences
                .get("silentStart")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);
            let close_to_tray = preferences
                .get("closeToTray")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true);
            let silent_start_argument =
                std::env::args().any(|argument| argument == "--silent-start");
            let start_hidden =
                lifecycle::should_start_hidden(silent_start_argument, silent_start_preference);

            lifecycle::set_close_to_tray(close_to_tray);
            app.manage(database);
            app.manage(AttachmentStore::open(data_directory.clone())?);
            app.manage(storage_commands::StorageLocationState::new(
                config_path,
                default_data_directory,
                data_directory,
            ));
            app.manage(search_commands::SearchRebuildState::default());
            lifecycle::install(app, start_hidden)?;
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
            analytics_commands::analytics_get_source,
            report_commands::report_get_by_period,
            report_commands::report_save,
            search_commands::search_query,
            search_commands::search_rebuild,
            search_commands::search_cancel_rebuild,
            data_commands::data_health_inspect,
            attachment_commands::attachment_put,
            attachment_commands::attachment_read,
            attachment_commands::attachment_soft_delete_owner_links,
            attachment_commands::attachment_remove_orphan,
            export_commands::export_snapshot,
            export_commands::export_write_file,
            backup_commands::backup_snapshot,
            backup_commands::backup_read_file,
            backup_commands::backup_write_file,
            backup_commands::backup_restore,
            settings_commands::settings_read,
            settings_commands::settings_write,
            storage_commands::storage_location_get,
            storage_commands::storage_location_migrate,
            storage_commands::desktop_apply_startup_preferences,
            import_commands::import_create_session,
            import_commands::import_save_preview,
            import_commands::import_find_existing_matches,
            import_commands::import_begin_commit,
            import_commands::import_commit_batch,
            import_commands::import_record_failure,
            import_commands::import_scan_txt,
            import_commands::import_read_txt,
            lifecycle::lifecycle_set_close_to_tray,
            lifecycle::lifecycle_hide_to_tray,
            lifecycle::lifecycle_quit
        ])
        .run(tauri::generate_context!())
        .expect("failed to run DailyFlow desktop application");
}

#[cfg(not(feature = "desktop-shell"))]
fn main() {}
