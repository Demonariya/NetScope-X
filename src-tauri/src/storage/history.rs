use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub fn get_history(conn: &Connection, range: &str) -> Result<Vec<TrafficHistoryEntry>> {
        let today = chrono::Local::now().date_naive();
        let earliest = match range {
            "today" => today,
            "7d" => today - chrono::Duration::days(7),
            "30d" => today - chrono::Duration::days(30),
            _ => chrono::NaiveDate::from_ymd_opt(1970, 1, 1).expect("valid epoch date"),
        }.format("%Y-%m-%d").to_string();

        let mut stmt = conn.prepare(
            "SELECT id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app
             FROM hourly_traffic WHERE date_str >= ?1 ORDER BY timestamp ASC"
        )?;
        let rows = stmt.query_map([earliest], |row| {
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
        rows.collect()
    }

    pub fn insert_entry(conn: &Connection, entry: &TrafficHistoryEntry) -> Result<()> {
        conn.execute(
            "INSERT OR REPLACE INTO hourly_traffic (id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                entry.id, entry.timestamp, entry.date_str, entry.hour_str,
                entry.download_bytes, entry.upload_bytes, entry.top_app
            ],
        )?;
        Ok(())
    }

    pub fn clear_history(conn: &Connection) -> Result<()> {
        conn.execute("DELETE FROM hourly_traffic", [])?;
        Ok(())
    }
}
