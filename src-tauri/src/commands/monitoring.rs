use crate::monitoring::collector::{LiveNetworkStats, MonitoringCollector};
use crate::settings::persistence::SettingsPersistence;
use crate::storage::database::Database;
use crate::storage::history::{HistoryStorage, TrafficHistoryEntry};
use rusqlite::Connection;
use std::sync::{Mutex, OnceLock};
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

fn history_retention_cutoff(today: chrono::NaiveDate, retention_days: i64) -> chrono::NaiveDate {
    today - chrono::Duration::days(retention_days.max(1) - 1)
}

fn prune_history_if_needed(app: &AppHandle, connection: &Connection) -> Result<(), String> {
    static LAST_PRUNE_KEY: OnceLock<Mutex<Option<String>>> = OnceLock::new();

    let config_dir = app.path().app_config_dir().map_err(|error| {
        format!("Cannot resolve settings directory for history retention: {error}")
    })?;
    let settings = SettingsPersistence::load_or_default(config_dir.join("settings.json"));
    let retention_days = settings.storage.data_retention_days.clamp(1, 365) as i64;
    let today = chrono::Local::now().date_naive();
    let cutoff = history_retention_cutoff(today, retention_days)
        .format("%Y-%m-%d")
        .to_string();
    let prune_key = format!("{retention_days}:{cutoff}");

    let mut last_pruned = LAST_PRUNE_KEY
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "History-retention state is unavailable.".to_string())?;
    if last_pruned.as_deref() == Some(prune_key.as_str()) {
        return Ok(());
    }

    HistoryStorage::prune_before_date(connection, &cutoff)
        .map_err(|error| format!("Could not prune expired traffic history: {error}"))?;
    *last_pruned = Some(prune_key);
    Ok(())
}

fn persist_hour_sample(app: &AppHandle, stats: &LiveNetworkStats) -> Result<(), String> {
    let db_path = history_database_path(app)?;
    let entry = TrafficHistoryEntry {
        id: format!("{}-{}", stats.hour_key, stats.active_adapter_id),
        timestamp: stats.timestamp,
        date_str: stats.date_str.clone(),
        hour_str: stats.hour_str.clone(),
        download_bytes: stats.hourly_download_bytes,
        upload_bytes: stats.hourly_upload_bytes,
        top_app: format!("Interface {}", stats.active_adapter_id),
    };
    Database::with_shared(&db_path, |connection| {
        if let Err(error) = prune_history_if_needed(app, connection) {
            eprintln!("NetScope X could not prune expired history: {error}");
        }
        HistoryStorage::insert_entry(connection, &entry)
    })
    .map_err(|error| format!("Cannot write traffic history sample: {error}"))
}

#[command]
pub async fn get_live_network_stats(
    app: AppHandle,
    adapter_id: Option<String>,
) -> Result<LiveNetworkStats, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let collector = MonitoringCollector::new();
        let stats = collector.get_latest_stats(adapter_id.as_deref().unwrap_or("auto"))?;
        if let Err(error) = persist_hour_sample(&app, &stats) {
            eprintln!("NetScope X could not persist history: {error}");
        }
        Ok(stats)
    })
    .await
    .map_err(|error| format!("Network monitor worker failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::history_retention_cutoff;

    #[test]
    fn retention_window_includes_today_and_exactly_the_configured_days() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 19).expect("valid test date");
        assert_eq!(history_retention_cutoff(today, 1), today);
        assert_eq!(
            history_retention_cutoff(today, 30),
            chrono::NaiveDate::from_ymd_opt(2026, 9, 20).expect("valid cutoff date")
        );
    }
}

#[command]
pub async fn reset_network_session_stats() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        MonitoringCollector::reset_session_counters()?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("Network counter reset worker failed: {error}"))?
}
