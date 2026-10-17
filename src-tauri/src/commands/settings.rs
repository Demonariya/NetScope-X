use crate::settings::config::AppConfig;
use crate::settings::persistence::SettingsPersistence;
use crate::AppRuntimeState;
use tauri::{command, AppHandle, Emitter, Manager, Runtime};

pub fn apply_monitoring_state<R: Runtime>(app: &AppHandle<R>, enabled: bool) {
    app.state::<AppRuntimeState>()
        .set_monitoring_enabled(enabled);

    if enabled {
        let session_name = format!("NetScopeX-{}", std::process::id());
        if let Err(error) = crate::monitoring::etw::EtwSessionManager::start_session(&session_name)
        {
            eprintln!("NetScope X per-process ETW telemetry is unavailable: {error}");
        }
    } else if let Err(error) = crate::monitoring::etw::EtwSessionManager::stop_session() {
        eprintln!("NetScope X could not stop per-process ETW telemetry: {error}");
    }

    let _ = app.emit("monitoring-toggled", enabled);
}

fn settings_file<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Cannot resolve application settings directory: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create application settings directory: {error}"))?;
    Ok(directory.join("settings.json"))
}

#[command]
pub async fn get_settings(app: AppHandle) -> Result<AppConfig, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = settings_file(&app)?;
        let settings = SettingsPersistence::load_or_default(path);
        app.state::<AppRuntimeState>()
            .set_minimize_to_tray_on_close(settings.startup.minimize_to_tray_on_close);
        apply_monitoring_state(&app, settings.monitoring.enabled);
        Ok(settings)
    })
    .await
    .map_err(|error| format!("Settings load worker failed: {error}"))?
}

#[command]
pub async fn save_settings(app: AppHandle, settings: AppConfig) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = settings_file(&app)?;
        SettingsPersistence::save(path, &settings)
            .map_err(|error| format!("Could not save application settings: {error}"))?;
        app.state::<AppRuntimeState>()
            .set_minimize_to_tray_on_close(settings.startup.minimize_to_tray_on_close);
        apply_monitoring_state(&app, settings.monitoring.enabled);
        Ok(true)
    })
    .await
    .map_err(|error| format!("Settings save worker failed: {error}"))?
}

#[command]
pub async fn set_monitoring_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        apply_monitoring_state(&app, enabled);
        enabled
    })
    .await
    .map_err(|error| format!("Monitoring toggle worker failed: {error}"))
}

#[command]
pub async fn system_tray_action(app: AppHandle, action: String) -> Result<bool, String> {
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
            let worker_app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                apply_monitoring_state(&worker_app, enabled);
            })
            .await
            .map_err(|error| format!("Tray monitoring worker failed: {error}"))?;
        }
        "quit" => {
            let stop_result = tauri::async_runtime::spawn_blocking(
                crate::monitoring::etw::EtwSessionManager::stop_session,
            )
            .await
            .map_err(|error| format!("ETW stop worker failed: {error}"))?;
            if let Err(error) = stop_result {
                eprintln!("NetScope X could not stop ETW before exit: {error}");
            }
            app.exit(0);
        }
        _ => return Err(format!("Unknown system tray action: {action}")),
    }
    Ok(true)
}

#[command]
pub async fn exit_app(app: AppHandle) -> Result<(), String> {
    let stop_result = tauri::async_runtime::spawn_blocking(
        crate::monitoring::etw::EtwSessionManager::stop_session,
    )
    .await
    .map_err(|error| format!("ETW stop worker failed: {error}"))?;
    if let Err(error) = stop_result {
        eprintln!("NetScope X could not stop ETW before exit: {error}");
    }
    app.exit(0);
    Ok(())
}
