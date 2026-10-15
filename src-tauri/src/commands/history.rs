use tauri::command;
use crate::storage::history::TrafficHistoryEntry;

#[command]
pub fn get_traffic_history(range: Option<String>) -> Vec<TrafficHistoryEntry> {
    let _r = range.unwrap_or_else(|| "today".to_string());
    vec![
        TrafficHistoryEntry {
            id: "h1".to_string(),
            timestamp: 1773000000,
            date_str: "2026-10-15".to_string(),
            hour_str: "14:00".to_string(),
            download_bytes: 520 * 1024 * 1024,
            upload_bytes: 85 * 1024 * 1024,
            top_app: "Google Chrome".to_string(),
        },
    ]
}

#[command]
pub fn clear_history() -> bool {
    true
}
