pub mod commands;
pub mod monitoring;
pub mod network;
pub mod processes;
pub mod settings;
pub mod storage;
pub mod tray;
pub mod windows_utils;

use commands::*;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let _tray = tray::create_tray(app.handle())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_live_network_stats,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running NetScope X desktop suite");
}
