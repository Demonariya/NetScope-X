use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::AppRuntimeState;

fn restore_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, tauri::Error> {
    let show_item = MenuItem::with_id(app, "show", "Open NetScope X", true, None::<&str>)?;
    let toggle_monitor = MenuItem::with_id(
        app,
        "toggle_monitor",
        "Pause Monitoring",
        true,
        None::<&str>,
    )?;
    let separator = MenuItem::with_id(app, "sep", "---", false, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Exit NetScope X", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &toggle_monitor, &separator, &quit_item])?;

    let tray = TrayIconBuilder::new()
        .tooltip("NetScope X — Live Network Monitor")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => restore_main_window(app),
            "toggle_monitor" => {
                let enabled = app.state::<AppRuntimeState>().toggle_monitoring();
                let _ = app.emit("monitoring-toggled", enabled);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                restore_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(tray)
}
