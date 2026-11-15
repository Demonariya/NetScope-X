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
    pub fn get_history(
        conn: &Connection,
        range: &str,
        custom_start: Option<&str>,
        custom_end: Option<&str>,
        interface_filter: Option<&str>,
    ) -> Result<Vec<TrafficHistoryEntry>> {
        use chrono::Datelike;
        let now = chrono::Local::now();
        let today = now.date_naive();

        let mut query = String::from(
            "SELECT id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app
             FROM hourly_traffic WHERE 1=1",
        );
        let mut params: Vec<rusqlite::types::Value> = Vec::new();

        match range {
            "15m" => {
                let cutoff = now.timestamp().saturating_sub(15 * 60) as u64;
                query.push_str(" AND timestamp >= ?");
                params.push(rusqlite::types::Value::Integer(cutoff as i64));
            }
            "1h" => {
                let cutoff = now.timestamp().saturating_sub(3600) as u64;
                query.push_str(" AND timestamp >= ?");
                params.push(rusqlite::types::Value::Integer(cutoff as i64));
            }
            "6h" => {
                let cutoff = now.timestamp().saturating_sub(6 * 3600) as u64;
                query.push_str(" AND timestamp >= ?");
                params.push(rusqlite::types::Value::Integer(cutoff as i64));
            }
            "24h" => {
                let cutoff = now.timestamp().saturating_sub(24 * 3600) as u64;
                query.push_str(" AND timestamp >= ?");
                params.push(rusqlite::types::Value::Integer(cutoff as i64));
            }
            "today" => {
                query.push_str(" AND date_str = ?");
                params.push(rusqlite::types::Value::Text(
                    today.format("%Y-%m-%d").to_string(),
                ));
            }
            "yesterday" => {
                let yesterday = (today - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string();
                query.push_str(" AND date_str = ?");
                params.push(rusqlite::types::Value::Text(yesterday));
            }
            "this_week" => {
                let days_from_monday = today.weekday().num_days_from_monday();
                let monday = (today - chrono::Duration::days(days_from_monday as i64))
                    .format("%Y-%m-%d")
                    .to_string();
                query.push_str(" AND date_str >= ?");
                params.push(rusqlite::types::Value::Text(monday));
            }
            "7d" => {
                let earliest = (today - chrono::Duration::days(6))
                    .format("%Y-%m-%d")
                    .to_string();
                query.push_str(" AND date_str >= ?");
                params.push(rusqlite::types::Value::Text(earliest));
            }
            "30d" => {
                let earliest = (today - chrono::Duration::days(29))
                    .format("%Y-%m-%d")
                    .to_string();
                query.push_str(" AND date_str >= ?");
                params.push(rusqlite::types::Value::Text(earliest));
            }
            "this_month" => {
                let first_of_month = format!("{}-{:02}-01", today.year(), today.month());
                query.push_str(" AND date_str >= ?");
                params.push(rusqlite::types::Value::Text(first_of_month));
            }
            "prev_month" => {
                let (prev_year, prev_month) = if today.month() == 1 {
                    (today.year() - 1, 12)
                } else {
                    (today.year(), today.month() - 1)
                };
                let first_of_prev = format!("{}-{:02}-01", prev_year, prev_month);
                let first_of_curr = chrono::NaiveDate::from_ymd_opt(today.year(), today.month(), 1)
                    .unwrap_or(today);
                let last_of_prev = (first_of_curr - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string();
                query.push_str(" AND date_str >= ? AND date_str <= ?");
                params.push(rusqlite::types::Value::Text(first_of_prev));
                params.push(rusqlite::types::Value::Text(last_of_prev));
            }
            "custom" => {
                if let Some(start) = custom_start {
                    if !start.is_empty() {
                        query.push_str(" AND date_str >= ?");
                        params.push(rusqlite::types::Value::Text(start.to_string()));
                    }
                }
                if let Some(end) = custom_end {
                    if !end.is_empty() {
                        query.push_str(" AND date_str <= ?");
                        params.push(rusqlite::types::Value::Text(end.to_string()));
                    }
                }
            }
            _ => {
                // "all" or any other value: no date restriction
            }
        }

        if let Some(iface) = interface_filter {
            if iface != "all" && iface != "All Interfaces" && !iface.trim().is_empty() {
                query.push_str(" AND top_app LIKE ?");
                params.push(rusqlite::types::Value::Text(format!("%{}%", iface.trim())));
            }
        }

        query.push_str(" ORDER BY timestamp ASC");

        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
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

    /// Delete a single hourly traffic entry by ID.
    pub fn delete_entry(conn: &Connection, id: &str) -> Result<usize> {
        conn.execute("DELETE FROM hourly_traffic WHERE id = ?1", [id])
    }

    /// Delete hourly records between start and end date inclusive.
    pub fn delete_range(conn: &Connection, start_date: &str, end_date: &str) -> Result<usize> {
        conn.execute(
            "DELETE FROM hourly_traffic WHERE date_str >= ?1 AND date_str <= ?2",
            [start_date, end_date],
        )
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
    use super::{HistoryStorage, TrafficHistoryEntry};
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

        let yesterday = HistoryStorage::get_history(&connection, "yesterday", None, None, None)
            .expect("yesterday query should succeed");
        let seven_days = HistoryStorage::get_history(&connection, "7d", None, None, None)
            .expect("seven-day query should succeed");
        let thirty_days = HistoryStorage::get_history(&connection, "30d", None, None, None)
            .expect("thirty-day query should succeed");

        assert_eq!(yesterday.len(), 1);
        assert_eq!(seven_days.len(), 3);
        assert_eq!(thirty_days.len(), 5);
    }
}
