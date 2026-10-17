use crate::network::adapters::NetworkAdapter;
use crate::network::connections::SocketConnectionRecord;
use crate::network::ping::{PingProbeResult, PingService};
use tauri::command;

#[command]
pub fn get_network_adapters() -> Vec<NetworkAdapter> {
    NetworkAdapter::discover_all()
}

#[command]
pub async fn ping_target(target: Option<String>) -> PingProbeResult {
    let host = target.unwrap_or_else(|| "1.1.1.1".to_string());
    PingService::probe(&host, 1500).await
}

#[command]
pub fn get_active_connections() -> Result<Vec<SocketConnectionRecord>, String> {
    SocketConnectionRecord::get_active_connections()
}
