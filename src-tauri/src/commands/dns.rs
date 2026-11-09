use crate::network::dns::{DnsConfig, DnsManager, DnsQueryResult, DnsTestResult};
use crate::storage::database::Database;
use crate::storage::dns::{DnsProfileRecord, DnsStorage};
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
pub async fn get_dns_config(adapter_alias: Option<String>) -> Result<DnsConfig, String> {
    tauri::async_runtime::spawn_blocking(move || {
        DnsManager::get_adapter_dns_config(adapter_alias.as_deref())
    })
    .await
    .map_err(|error| format!("DNS query worker failed: {error}"))?
}

#[command]
pub async fn set_dns_servers(
    adapter_alias: String,
    ipv4_servers: Vec<String>,
    ipv6_servers: Option<Vec<String>>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        DnsManager::set_adapter_dns(&adapter_alias, &ipv4_servers, ipv6_servers.as_deref())?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("DNS configuration worker failed: {error}"))?
}

#[command]
pub async fn reset_dns_dhcp(adapter_alias: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        DnsManager::reset_adapter_dns_dhcp(&adapter_alias)?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("DNS DHCP reset worker failed: {error}"))?
}

#[command]
pub async fn flush_dns_cache() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(DnsManager::flush_dns_cache)
        .await
        .map_err(|error| format!("DNS cache flush worker failed: {error}"))?
}

#[command]
pub async fn resolve_dns_query(
    host: String,
    record_type: Option<String>,
) -> Result<DnsQueryResult, String> {
    let rtype = record_type.unwrap_or_else(|| "A".to_string());
    tauri::async_runtime::spawn_blocking(move || DnsManager::resolve_query(&host, &rtype))
        .await
        .map_err(|error| format!("DNS resolve worker failed: {error}"))?
}

#[command]
pub async fn test_dns_server(server_ip: String) -> Result<DnsTestResult, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(DnsManager::test_dns_server(&server_ip)))
        .await
        .map_err(|error| format!("DNS latency worker failed: {error}"))?
}

#[command]
pub async fn get_dns_profiles(app: AppHandle) -> Result<Vec<DnsProfileRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = storage_database_path(&app)?;
        Database::with_shared(&db_path, DnsStorage::get_profiles)
            .map_err(|error| format!("Cannot read DNS profiles: {error}"))
    })
    .await
    .map_err(|error| format!("DNS profile worker failed: {error}"))?
}

#[command]
pub async fn save_dns_profile(
    app: AppHandle,
    profile: DnsProfileRecord,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = storage_database_path(&app)?;
        Database::with_shared(&db_path, |conn| DnsStorage::save_profile(conn, &profile))
            .map_err(|error| format!("Cannot save DNS profile: {error}"))?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("DNS profile save worker failed: {error}"))?
}

#[command]
pub async fn delete_dns_profile(
    app: AppHandle,
    profile_id: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = storage_database_path(&app)?;
        Database::with_shared(&db_path, |conn| DnsStorage::delete_profile(conn, &profile_id))
            .map_err(|error| format!("Cannot delete DNS profile: {error}"))
    })
    .await
    .map_err(|error| format!("DNS profile delete worker failed: {error}"))?
}
