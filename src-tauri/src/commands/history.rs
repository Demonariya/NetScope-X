use crate::storage::database::Database;
use crate::storage::history::{HistoryStorage, TrafficHistoryEntry};
use tauri::{command, AppHandle, Manager};

fn history_database_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app.path().app_data_dir()
        .map_err(|error| format!("Cannot resolve application data directory: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create application data directory: {error}"))?;
    Ok(directory.join("history.sqlite3"))
}

#[command]
pub fn get_traffic_history(app: AppHandle, range: Option<String>) -> Result<Vec<TrafficHistoryEntry>, String> {
    let database = Database::open(history_database_path(&app)?)
        .map_err(|error| format!("Cannot open traffic history database: {error}"))?;
    HistoryStorage::get_history(database.connection(), range.as_deref().unwrap_or("today"))
        .map_err(|error| format!("Cannot read traffic history: {error}"))
}

#[command]
pub fn clear_history(app: AppHandle) -> Result<bool, String> {
    let database = Database::open(history_database_path(&app)?)
        .map_err(|error| format!("Cannot open traffic history database: {error}"))?;
    HistoryStorage::clear_history(database.connection())
        .map_err(|error| format!("Cannot clear traffic history: {error}"))?;
    Ok(true)
}
