use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, WindowEvent,
};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
static EXPLICIT_QUIT: AtomicBool = AtomicBool::new(false);

pub fn install(app: &mut App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开 DailyFlow", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &settings, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("dailyflow")
        .tooltip("DailyFlow")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "settings" => {
                show_main_window(app);
                let _ = app.emit("dailyflow:open-settings", ());
            }
            "quit" => request_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    if let Some(window) = app.get_webview_window("main") {
        let window_to_hide = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if should_hide_on_close(
                    CLOSE_TO_TRAY.load(Ordering::SeqCst),
                    EXPLICIT_QUIT.load(Ordering::SeqCst),
                ) {
                    api.prevent_close();
                    let _ = window_to_hide.hide();
                }
            }
        });
    }

    Ok(())
}

fn should_hide_on_close(close_to_tray: bool, explicit_quit: bool) -> bool {
    close_to_tray && !explicit_quit
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit(app: &AppHandle) {
    EXPLICIT_QUIT.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn request_quit(app: &AppHandle) {
    let _ = app.emit("dailyflow:request-quit", ());
}

#[tauri::command]
pub fn lifecycle_set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

#[tauri::command]
pub fn lifecycle_hide_to_tray(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn lifecycle_quit(app: AppHandle) {
    quit(&app);
}

#[cfg(test)]
mod tests {
    use super::should_hide_on_close;

    #[test]
    fn hides_on_close_only_while_close_to_tray_is_enabled() {
        assert!(should_hide_on_close(true, false));
        assert!(!should_hide_on_close(false, false));
        assert!(!should_hide_on_close(true, true));
    }
}
