use tauri::command;
use crate::processes::enumeration::ProcessNetworkUsage;

#[command]
pub fn get_process_network_usage() -> Vec<ProcessNetworkUsage> {
    ProcessNetworkUsage::enumerate_monitored_processes()
}

#[command]
pub fn reset_process_stats(_pid: Option<u32>) -> bool {
    true
}
