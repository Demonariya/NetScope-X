use crate::monitoring::collector::{LiveNetworkStats, MonitoringCollector};
use crate::storage::database::Database;
use crate::storage::history::{HistoryStorage, TrafficHistoryEntry};
use tauri::{command, AppHandle, Manager};

fn history_database_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve application data directory: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create application data directory: {error}"))?;
    Ok(directory.join("history.sqlite3"))
}

fn persist_hour_sample(app: &AppHandle, stats: &LiveNetworkStats) -> Result<(), String> {
    let database = Database::open(history_database_path(app)?)
        .map_err(|error| format!("Cannot open traffic history database: {error}"))?;
    let entry = TrafficHistoryEntry {
        id: format!("{}-{}", stats.hour_key, stats.active_adapter_id),
        timestamp: stats.timestamp,
        date_str: stats.date_str.clone(),
        hour_str: stats.hour_str.clone(),
        download_bytes: stats.hourly_download_bytes,
        upload_bytes: stats.hourly_upload_bytes,
        top_app: format!("Interface {}", stats.active_adapter_id),
    };
    HistoryStorage::insert_entry(database.connection(), &entry)
        .map_err(|error| format!("Cannot write traffic history sample: {error}"))
}

#[command]
pub fn get_live_network_stats(
    app: AppHandle,
    adapter_id: Option<String>,
) -> Result<LiveNetworkStats, String> {
    let collector = MonitoringCollector::new();
    let stats = collector.get_latest_stats(adapter_id.as_deref().unwrap_or("auto"))?;
    if let Err(error) = persist_hour_sample(&app, &stats) {
        eprintln!("NetScope X could not persist history: {error}");
    }
    Ok(stats)
}

#[command]
pub fn reset_network_session_stats() -> Result<bool, String> {
    MonitoringCollector::reset_session_counters()?;
    Ok(true)
}
