use crate::processes::enumeration::ProcessNetworkUsage;
use tauri::command;

#[command]
pub fn get_process_network_usage() -> Vec<ProcessNetworkUsage> {
    ProcessNetworkUsage::enumerate_monitored_processes()
}

#[command]
pub fn reset_process_stats(_pid: Option<u32>) -> bool {
    true
}

#[command]
pub fn toggle_process_block(_exe_name: String, _block: bool, _pid: Option<u32>) -> bool {
    true
}
