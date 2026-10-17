pub mod commands;
pub mod monitoring;
pub mod network;
pub mod processes;
pub mod settings;
pub mod storage;
pub mod tray;
pub mod windows_utils;

use commands::*;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

pub struct AppRuntimeState {
    monitoring_enabled: AtomicBool,
}

impl Default for AppRuntimeState {
    fn default() -> Self {
        Self { monitoring_enabled: AtomicBool::new(true) }
    }
}

impl AppRuntimeState {
    pub fn is_monitoring_enabled(&self) -> bool {
        self.monitoring_enabled.load(Ordering::SeqCst)
    }

    pub fn set_monitoring_enabled(&self, enabled: bool) {
        self.monitoring_enabled.store(enabled, Ordering::SeqCst);
    }

    pub fn toggle_monitoring(&self) -> bool {
        !self.monitoring_enabled.fetch_xor(true, Ordering::SeqCst)
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppRuntimeState::default())
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let tray = tray::create_tray(app.handle())?;
                app.manage(tray);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_live_network_stats,
            reset_network_session_stats,
            get_network_adapters,
            ping_target,
            get_active_connections,
            get_process_network_usage,
            reset_process_stats,
            toggle_process_block,
            get_traffic_history,
            clear_history,
            get_settings,
            save_settings,
            system_tray_action,
            set_monitoring_enabled,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NetScope X desktop suite");
}
