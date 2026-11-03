#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "desktop-shell")]
use serde::Serialize;

#[cfg(feature = "desktop-shell")]
use dailyflow_desktop::{
    attachments::AttachmentStore,
    commands::{
        analytics_commands, attachment_commands, backup_commands, data_commands, export_commands,
        import_commands, journal_commands, knowledge_commands, report_commands, search_commands,
        settings_commands, task_commands, timeline_commands,
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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            let database_path = data_directory.join("dailyflow.db");
            app.manage(Database::open(database_path)?);
            app.manage(AttachmentStore::open(data_directory)?);
            app.manage(search_commands::SearchRebuildState::default());
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
            import_commands::import_create_session,
            import_commands::import_save_preview,
            import_commands::import_find_existing_matches,
            import_commands::import_begin_commit,
            import_commands::import_commit_batch,
            import_commands::import_record_failure,
            import_commands::import_scan_txt,
            import_commands::import_read_txt
        ])
        .run(tauri::generate_context!())
        .expect("failed to run DailyFlow desktop application");
}

#[cfg(not(feature = "desktop-shell"))]
fn main() {}
