use crate::network::adapters::NetworkAdapter;
use crate::network::connections::SocketConnectionRecord;
use crate::network::ping::{PingProbeResult, PingService};
use tauri::command;

#[command]
pub async fn get_network_adapters() -> Result<Vec<NetworkAdapter>, String> {
    tauri::async_runtime::spawn_blocking(NetworkAdapter::discover_all)
        .await
        .map_err(|error| format!("Network adapter worker failed: {error}"))?
}

#[command]
pub async fn ping_target(
    target: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<PingProbeResult, String> {
    let host = target.unwrap_or_else(|| "1.1.1.1".to_string());
    let timeout = timeout_ms.unwrap_or(2000);
    tauri::async_runtime::spawn_blocking(move || PingService::probe(&host, timeout))
        .await
        .map_err(|error| format!("Ping worker failed: {error}"))
}

#[command]
pub async fn get_active_connections() -> Result<Vec<SocketConnectionRecord>, String> {
    tauri::async_runtime::spawn_blocking(SocketConnectionRecord::get_active_connections)
        .await
        .map_err(|error| format!("Connection query worker failed: {error}"))?
}
