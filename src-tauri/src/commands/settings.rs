use crate::settings::config::AppConfig;
use tauri::command;

#[command]
pub fn get_settings() -> AppConfig {
    AppConfig::default()
}

#[command]
pub fn save_settings(settings: AppConfig) -> bool {
    let _s = settings;
    true
}

#[command]
pub fn system_tray_action(action: String) -> bool {
    let _a = action;
    true
}
