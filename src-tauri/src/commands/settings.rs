use crate::settings::config::AppConfig;
use crate::settings::persistence::SettingsPersistence;
use crate::AppRuntimeState;
use tauri::{command, AppHandle, Manager};

fn settings_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Cannot resolve application settings directory: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create application settings directory: {error}"))?;
    Ok(directory.join("settings.json"))
}

#[command]
pub fn get_settings(app: AppHandle) -> Result<AppConfig, String> {
    let path = settings_file(&app)?;
    let settings = SettingsPersistence::load_or_default(path);
    app.state::<crate::AppRuntimeState>()
        .set_minimize_to_tray_on_close(settings.startup.minimize_to_tray_on_close);
    Ok(settings)
}

#[command]
pub fn save_settings(app: AppHandle, settings: AppConfig) -> Result<bool, String> {
    let path = settings_file(&app)?;
    SettingsPersistence::save(path, &settings)
        .map_err(|error| format!("Could not save application settings: {error}"))?;
    app.state::<crate::AppRuntimeState>()
        .set_minimize_to_tray_on_close(settings.startup.minimize_to_tray_on_close);
    Ok(true)
}

#[command]
pub fn set_monitoring_enabled(app: AppHandle, enabled: bool) -> bool {
    app.state::<AppRuntimeState>()
        .set_monitoring_enabled(enabled);
    let _ = tauri::Emitter::emit(&app, "monitoring-toggled", enabled);
    enabled
}

#[command]
pub fn system_tray_action(app: AppHandle, action: String) -> Result<bool, String> {
    match action.as_str() {
        "minimize" => {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "Main application window was not found.".to_string())?;
            window
                .minimize()
                .map_err(|error| format!("Could not minimize NetScope X: {error}"))?;
        }
        "hide" => {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "Main application window was not found.".to_string())?;
            window
                .hide()
                .map_err(|error| format!("Could not hide NetScope X to the tray: {error}"))?;
        }
        "restore" | "show" => {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "Main application window was not found.".to_string())?;
            window
                .show()
                .map_err(|error| format!("Could not show NetScope X: {error}"))?;
            window
                .unminimize()
                .map_err(|error| format!("Could not restore NetScope X: {error}"))?;
            window
                .set_focus()
                .map_err(|error| format!("Could not focus NetScope X: {error}"))?;
        }
        "toggle_monitor" => {
            let enabled = app.state::<AppRuntimeState>().toggle_monitoring();
            let _ = tauri::Emitter::emit(&app, "monitoring-toggled", enabled);
        }
        "quit" => {
            app.exit(0);
        }
        _ => return Err(format!("Unknown system tray action: {action}")),
    }
    Ok(true)
}

#[command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}
