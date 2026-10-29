use crate::storage::database::Database;
use crate::storage::exports::DataExporter;
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

#[command]
pub async fn get_traffic_history(
    app: AppHandle,
    range: Option<String>,
) -> Result<Vec<TrafficHistoryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = history_database_path(&app)?;
        Database::with_shared(&db_path, |conn| {
            HistoryStorage::get_history(conn, range.as_deref().unwrap_or("today"))
        })
        .map_err(|error| format!("Cannot read traffic history: {error}"))
    })
    .await
    .map_err(|error| format!("Traffic history worker failed: {error}"))?
}

#[command]
pub async fn clear_history(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = history_database_path(&app)?;
        Database::with_shared(&db_path, |conn| HistoryStorage::clear_history(conn))
            .map_err(|error| format!("Cannot clear traffic history: {error}"))?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("History clear worker failed: {error}"))?
}

#[command]
pub async fn export_traffic_history(
    app: AppHandle,
    format: String,
    range: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = history_database_path(&app)?;
        let entries = Database::with_shared(&db_path, |conn| {
            HistoryStorage::get_history(conn, range.as_deref().unwrap_or("today"))
        })
        .map_err(|error| format!("Cannot read traffic history for export: {error}"))?;
        match format.as_str() {
            "csv" => Ok(DataExporter::to_csv(&entries)),
            "json" => DataExporter::to_json(&entries)
                .map_err(|error| format!("Could not serialize traffic history as JSON: {error}")),
            _ => Err(format!("Unsupported export format: {format}")),
        }
    })
    .await
    .map_err(|error| format!("Traffic export worker failed: {error}"))?
}
