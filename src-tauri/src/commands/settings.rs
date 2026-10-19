use crate::settings::config::AppConfig;
use crate::settings::{persistence::SettingsPersistence, validation::SettingsValidator};
use crate::AppRuntimeState;
use tauri::{command, AppHandle, Emitter, Manager, Runtime};

pub fn apply_monitoring_state<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
    per_app_enabled: bool,
) {
    let runtime = app.state::<AppRuntimeState>();
    runtime.set_monitoring_enabled(enabled);
    runtime.set_per_app_enabled(per_app_enabled);

    if enabled && per_app_enabled {
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

#[cfg(windows)]
fn sync_windows_startup(enabled: bool) -> Result<(), String> {
    let key = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Run";
    if enabled {
        let executable = std::env::current_exe()
            .map_err(|error| format!("Cannot resolve the current executable path: {error}"))?;
        let executable = executable.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$ErrorActionPreference = 'Stop'\n$key = '{key}'\nNew-Item -Path $key -Force | Out-Null\n$exe = '{executable}'\nNew-ItemProperty -Path $key -Name 'NetScopeX' -Value ('\"' + $exe + '\"') -PropertyType String -Force | Out-Null"
        );
        crate::windows_utils::run_powershell(&script).map(|_| ())
    } else {
        let script = "$ErrorActionPreference = 'Stop'\n$key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'\nif (Test-Path -LiteralPath $key) { Remove-ItemProperty -LiteralPath $key -Name 'NetScopeX' -ErrorAction SilentlyContinue }";
        crate::windows_utils::run_powershell(script).map(|_| ())
    }
}

#[cfg(not(windows))]
fn sync_windows_startup(_enabled: bool) -> Result<(), String> {
    Ok(())
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
        apply_monitoring_state(
            &app,
            settings.monitoring.enabled,
            settings.monitoring.per_app_enabled,
        );
        if let Err(error) = sync_windows_startup(settings.startup.start_with_windows) {
            eprintln!("NetScope X could not synchronize Windows startup registration: {error}");
        }
        Ok(settings)
    })
    .await
    .map_err(|error| format!("Settings load worker failed: {error}"))?
}

#[command]
pub async fn save_settings(app: AppHandle, mut settings: AppConfig) -> Result<bool, String> {
    SettingsValidator::validate(&mut settings);
    tauri::async_runtime::spawn_blocking(move || {
        let path = settings_file(&app)?;
        SettingsPersistence::save(path, &settings)
            .map_err(|error| format!("Could not save application settings: {error}"))?;
        app.state::<AppRuntimeState>()
            .set_minimize_to_tray_on_close(settings.startup.minimize_to_tray_on_close);
        apply_monitoring_state(
            &app,
            settings.monitoring.enabled,
            settings.monitoring.per_app_enabled,
        );
        sync_windows_startup(settings.startup.start_with_windows).map_err(|error| {
            format!("Settings were saved, but Windows startup registration failed: {error}")
        })?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("Settings save worker failed: {error}"))?
}

#[command]
pub async fn set_monitoring_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let per_app_enabled = app.state::<AppRuntimeState>().is_per_app_enabled();
    tauri::async_runtime::spawn_blocking(move || {
        apply_monitoring_state(&app, enabled, per_app_enabled);
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
            let (enabled, per_app_enabled) = {
                let runtime = app.state::<AppRuntimeState>();
                (runtime.toggle_monitoring(), runtime.is_per_app_enabled())
            };
            let worker_app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                apply_monitoring_state(&worker_app, enabled, per_app_enabled);
            })
            .await
            .map_err(|error| format!("Tray monitoring worker failed: {error}"))?;
        }
        "quit" => {
            tauri::async_runtime::spawn_blocking(
                crate::monitoring::lifecycle::LifecycleManager::cleanup,
            )
            .await
            .map_err(|error| format!("Shutdown cleanup worker failed: {error}"))?;
            app.exit(0);
        }
        _ => return Err(format!("Unknown system tray action: {action}")),
    }
    Ok(true)
}

#[command]
pub async fn exit_app(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(
        crate::monitoring::lifecycle::LifecycleManager::cleanup,
    )
    .await
    .map_err(|error| format!("Shutdown cleanup worker failed: {error}"))?;
    app.exit(0);
    Ok(())
}
