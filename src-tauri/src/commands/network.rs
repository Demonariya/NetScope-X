use crate::network::adapters::NetworkAdapter;
use crate::network::connections::SocketConnectionRecord;
use crate::network::ping::{PingProbeResult, PingService};
use crate::storage::database::Database;
use crate::storage::ping_sessions::{PingSessionRecord, PingStorage};
use tauri::{command, AppHandle, Manager};

fn storage_database_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve application data directory: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create application data directory: {error}"))?;
    Ok(directory.join("history.sqlite3"))
}

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
pub async fn save_ping_session(
    app: AppHandle,
    session: PingSessionRecord,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = storage_database_path(&app)?;
        Database::with_shared(&db_path, |conn| PingStorage::save_session(conn, &session))
            .map_err(|error| format!("Cannot save ping session: {error}"))?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("Save ping session worker failed: {error}"))?
}

#[command]
pub async fn get_ping_sessions(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<PingSessionRecord>, String> {
    let lim = limit.unwrap_or(50);
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = storage_database_path(&app)?;
        Database::with_shared(&db_path, |conn| PingStorage::get_sessions(conn, lim))
            .map_err(|error| format!("Cannot retrieve ping sessions: {error}"))
    })
    .await
    .map_err(|error| format!("Get ping sessions worker failed: {error}"))?
}

#[command]
pub async fn delete_ping_session(app: AppHandle, id: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = storage_database_path(&app)?;
        Database::with_shared(&db_path, |conn| PingStorage::delete_session(conn, &id))
            .map_err(|error| format!("Cannot delete ping session: {error}"))?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("Delete ping session worker failed: {error}"))?
}

#[command]
pub async fn clear_ping_sessions(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = storage_database_path(&app)?;
        Database::with_shared(&db_path, PingStorage::clear_sessions)
            .map_err(|error| format!("Cannot clear ping sessions: {error}"))?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("Clear ping sessions worker failed: {error}"))?
}

#[command]
pub async fn get_active_connections() -> Result<Vec<SocketConnectionRecord>, String> {
    tauri::async_runtime::spawn_blocking(SocketConnectionRecord::get_active_connections)
        .await
        .map_err(|error| format!("Connection query worker failed: {error}"))?
}
