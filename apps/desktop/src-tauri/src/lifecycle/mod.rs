use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, WindowEvent,
};

static CLOSE_BEHAVIOR: AtomicU8 = AtomicU8::new(CloseBehavior::Ask as u8);
static EXPLICIT_QUIT: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CloseBehavior {
    Ask,
    Minimize,
    Quit,
}

impl CloseBehavior {
    fn from_stored(value: u8) -> Self {
        match value {
            1 => Self::Minimize,
            2 => Self::Quit,
            _ => Self::Ask,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CloseAction {
    Ask,
    Minimize,
    Exit,
}

pub fn parse_close_behavior(value: &str) -> Result<CloseBehavior, String> {
    match value {
        "ask" => Ok(CloseBehavior::Ask),
        "minimize" => Ok(CloseBehavior::Minimize),
        "quit" => Ok(CloseBehavior::Quit),
        _ => Err("unsupported close behavior".to_owned()),
    }
}

fn close_action(close_behavior: CloseBehavior, explicit_quit: bool) -> CloseAction {
    if explicit_quit {
        return CloseAction::Exit;
    }

    match close_behavior {
        CloseBehavior::Ask => CloseAction::Ask,
        CloseBehavior::Minimize => CloseAction::Minimize,
        CloseBehavior::Quit => CloseAction::Exit,
    }
}

pub fn install(app: &mut App, start_hidden: bool) -> tauri::Result<()> {
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
        if start_hidden {
            window.hide()?;
        }
        let window_to_hide = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match close_action(
                    CloseBehavior::from_stored(CLOSE_BEHAVIOR.load(Ordering::SeqCst)),
                    EXPLICIT_QUIT.load(Ordering::SeqCst),
                ) {
                    CloseAction::Ask => {
                        api.prevent_close();
                        let _ = window_to_hide.emit("dailyflow:close-requested", ());
                    }
                    CloseAction::Minimize => {
                        api.prevent_close();
                        let _ = window_to_hide.hide();
                    }
                    CloseAction::Exit => {}
                }
            }
        });
    }

    Ok(())
}

pub fn should_start_hidden(silent_start_argument: bool, silent_start_preference: bool) -> bool {
    silent_start_argument && silent_start_preference
}

pub fn set_close_behavior(behavior: CloseBehavior) {
    CLOSE_BEHAVIOR.store(behavior as u8, Ordering::SeqCst);
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
pub fn lifecycle_set_close_behavior(behavior: String) -> Result<(), String> {
    set_close_behavior(parse_close_behavior(&behavior)?);
    Ok(())
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
    use super::{
        close_action, parse_close_behavior, should_start_hidden, CloseAction, CloseBehavior,
    };

    #[test]
    fn chooses_the_action_for_each_close_behavior() {
        assert_eq!(close_action(CloseBehavior::Ask, false), CloseAction::Ask);
        assert_eq!(
            close_action(CloseBehavior::Minimize, false),
            CloseAction::Minimize
        );
        assert_eq!(close_action(CloseBehavior::Quit, false), CloseAction::Exit);
    }

    #[test]
    fn explicit_quit_overrides_interactive_close_behavior() {
        assert_eq!(close_action(CloseBehavior::Ask, true), CloseAction::Exit);
        assert_eq!(
            close_action(CloseBehavior::Minimize, true),
            CloseAction::Exit
        );
    }

    #[test]
    fn parses_the_three_supported_close_behaviors() {
        assert_eq!(parse_close_behavior("ask"), Ok(CloseBehavior::Ask));
        assert_eq!(
            parse_close_behavior("minimize"),
            Ok(CloseBehavior::Minimize)
        );
        assert_eq!(parse_close_behavior("quit"), Ok(CloseBehavior::Quit));
    }

    #[test]
    fn rejects_unknown_close_behaviors() {
        assert_eq!(
            parse_close_behavior("close-to-tray"),
            Err("unsupported close behavior".to_owned())
        );
    }

    #[test]
    fn starts_hidden_only_when_the_launch_argument_and_preference_are_present() {
        assert!(should_start_hidden(true, true));
        assert!(!should_start_hidden(true, false));
        assert!(!should_start_hidden(false, true));
    }
}
