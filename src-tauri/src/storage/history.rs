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

fn earliest_date(range: &str, today: chrono::NaiveDate) -> chrono::NaiveDate {
    match range {
        "today" => today,
        "7d" => today - chrono::Duration::days(6),
        "30d" => today - chrono::Duration::days(29),
        _ => chrono::NaiveDate::from_ymd_opt(1970, 1, 1).expect("valid epoch date"),
    }
}

impl HistoryStorage {
    pub fn get_history(conn: &Connection, range: &str) -> Result<Vec<TrafficHistoryEntry>> {
        let today = chrono::Local::now().date_naive();

        if range == "yesterday" {
            let yesterday = (today - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string();
            let mut stmt = conn.prepare(
                "SELECT id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app
                 FROM hourly_traffic WHERE date_str = ?1 ORDER BY timestamp ASC",
            )?;
            let rows = stmt.query_map([yesterday], |row| {
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
            return rows.collect();
        }

        let earliest = earliest_date(range, today).format("%Y-%m-%d").to_string();

        let mut stmt = conn.prepare(
            "SELECT id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app
             FROM hourly_traffic WHERE date_str >= ?1 ORDER BY timestamp ASC",
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

    /// Delete hourly records older than the configured retention cutoff date.
    pub fn prune_before_date(conn: &Connection, cutoff_date: &str) -> Result<usize> {
        conn.execute(
            "DELETE FROM hourly_traffic WHERE date_str < ?1",
            [cutoff_date],
        )
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

#[cfg(test)]
mod tests {
    use super::{earliest_date, HistoryStorage, TrafficHistoryEntry};
    use crate::storage::migrations::apply_migrations;
    use rusqlite::Connection;

    #[test]
    fn history_ranges_include_exactly_the_requested_calendar_days() {
        let today = chrono::Local::now().date_naive();
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        apply_migrations(&connection).expect("history schema should be initialized");

        for days_ago in [0_i64, 1, 6, 7, 29, 30] {
            let date = today - chrono::Duration::days(days_ago);
            let date_str = date.format("%Y-%m-%d").to_string();
            HistoryStorage::insert_entry(
                &connection,
                &TrafficHistoryEntry {
                    id: date_str.clone(),
                    timestamp: 1_800_000_000 + (30 - days_ago) as u64,
                    date_str,
                    hour_str: "00:00".to_string(),
                    download_bytes: 100,
                    upload_bytes: 50,
                    top_app: "Interface 17".to_string(),
                },
            )
            .expect("history row should be inserted");
        }

        let yesterday = HistoryStorage::get_history(&connection, "yesterday")
            .expect("yesterday query should succeed");
        let seven_days =
            HistoryStorage::get_history(&connection, "7d").expect("seven-day query should succeed");
        let thirty_days = HistoryStorage::get_history(&connection, "30d")
            .expect("thirty-day query should succeed");

        assert_eq!(yesterday.len(), 1);
        assert_eq!(seven_days.len(), 3);
        assert_eq!(thirty_days.len(), 5);
        assert_eq!(
            earliest_date("7d", today),
            today - chrono::Duration::days(6)
        );
        assert_eq!(
            earliest_date("30d", today),
            today - chrono::Duration::days(29)
        );
    }
}
