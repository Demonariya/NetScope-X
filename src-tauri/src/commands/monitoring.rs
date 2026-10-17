use crate::monitoring::collector::{LiveNetworkStats, MonitoringCollector};
use tauri::command;

#[command]
pub fn get_live_network_stats(adapter_id: Option<String>) -> Result<LiveNetworkStats, String> {
    let collector = MonitoringCollector::new();
    collector.get_latest_stats(adapter_id.as_deref().unwrap_or("auto"))
}

#[command]
pub fn reset_network_session_stats() -> Result<bool, String> {
    MonitoringCollector::reset_session_counters()?;
    Ok(true)
}
