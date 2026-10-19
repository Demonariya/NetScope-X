use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::AppRuntimeState;

fn restore_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("NetScope X could not restore the window: the main window was not found.");
        return;
    };

    if let Err(error) = window.show() {
        eprintln!("NetScope X: show main window from tray failed: {error}");
    }
    if let Err(error) = window.unminimize() {
        eprintln!("NetScope X: unminimize main window from tray failed: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("NetScope X: focus main window from tray failed: {error}");
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
        .icon(
            app.default_window_icon()
                .expect("NetScope X must have a default window icon")
                .clone(),
        )
        .tooltip("NetScope X — Live Network Monitor")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => restore_main_window(app),
            "toggle_monitor" => {
                let (enabled, per_app_enabled) = {
                    let runtime = app.state::<AppRuntimeState>();
                    (runtime.toggle_monitoring(), runtime.is_per_app_enabled())
                };
                let app_handle = app.clone();
                let _task = tauri::async_runtime::spawn_blocking(move || {
                    crate::commands::settings::apply_monitoring_state(
                        &app_handle,
                        enabled,
                        per_app_enabled,
                    );
                });
            }
            "quit" => {
                let app_handle = app.clone();
                let _task = tauri::async_runtime::spawn_blocking(move || {
                    crate::monitoring::lifecycle::LifecycleManager::cleanup();
                    app_handle.exit(0);
                });
            }
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
