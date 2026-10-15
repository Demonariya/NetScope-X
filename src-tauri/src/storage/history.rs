use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficHistoryEntry {
    pub id: String,
    pub timestamp: u64,
    pub date_str: String,
    pub hour_str: String,
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub top_app: String,
}

pub struct HistoryStorage;

impl HistoryStorage {
    pub fn get_history(conn: &Connection, _range: &str) -> Result<Vec<TrafficHistoryEntry>> {
        let mut stmt = conn.prepare("SELECT id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app FROM hourly_traffic ORDER BY timestamp ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(TrafficHistoryEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                date_str: row.get(2)?,
                hour_str: row.get(3)?,
                download_bytes: row.get(4)?,
                upload_bytes: row.get(5)?,
                top_app: row.get(6)?,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }

        if results.is_empty() {
            // Seed sample historical day
            results.push(TrafficHistoryEntry {
                id: "h1".to_string(),
                timestamp: 1773000000,
                date_str: "2026-10-15".to_string(),
                hour_str: "14:00".to_string(),
                download_bytes: 520 * 1024 * 1024,
                upload_bytes: 85 * 1024 * 1024,
                top_app: "Google Chrome".to_string(),
            });
        }

        Ok(results)
    }

    pub fn insert_entry(conn: &Connection, entry: &TrafficHistoryEntry) -> Result<()> {
        conn.execute(
            "INSERT OR REPLACE INTO hourly_traffic (id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                entry.id,
                entry.timestamp,
                entry.date_str,
                entry.hour_str,
                entry.download_bytes,
                entry.upload_bytes,
                entry.top_app
            ],
        )?;
        Ok(())
    }
}
