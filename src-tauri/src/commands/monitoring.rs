use tauri::command;
use crate::monitoring::collector::{LiveNetworkStats, MonitoringCollector};

#[command]
pub fn get_live_network_stats() -> LiveNetworkStats {
    let collector = MonitoringCollector::new();
    collector.get_latest_stats()
}
