use crate::monitoring::collector::{LiveNetworkStats, MonitoringCollector};
use tauri::command;

#[command]
pub fn get_live_network_stats() -> LiveNetworkStats {
    let collector = MonitoringCollector::new();
    collector.get_latest_stats()
}
