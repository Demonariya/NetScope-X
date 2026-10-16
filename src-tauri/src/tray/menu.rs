use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Runtime,
};

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
        .tooltip("NetScope X — Monitoring Active")
        .menu(&menu)
        .build(app)?;

    Ok(tray)
}
