use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppAccountingRecord {
    pub app_key: String,
    pub exe_name: String,
    pub friendly_name: String,
    pub full_path: String,
    pub first_seen: i64,
    pub last_seen: i64,
    pub lifetime_download_bytes: u64,
    pub lifetime_upload_bytes: u64,
    pub lifetime_total_bytes: u64,
    pub is_running: bool,
    pub current_pid: Option<u32>,
    pub current_download_bps: u64,
    pub current_upload_bps: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSampleRecord {
    pub id: String,
    pub app_key: String,
    pub timestamp: i64,
    pub date_str: String,
    pub hour_str: String,
    pub download_bytes: u64,
    pub upload_bytes: u64,
}

pub struct AppAccountingStorage;

impl AppAccountingStorage {
    /// Update or insert cumulative lifetime bytes for an application identity.
    #[allow(clippy::too_many_arguments)]
    pub fn record_traffic_delta(
        conn: &Connection,
        app_key: &str,
        exe_name: &str,
        friendly_name: &str,
        full_path: &str,
        delta_down: u64,
        delta_up: u64,
        timestamp: i64,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO app_identity_accounting (app_key, exe_name, friendly_name, full_path, first_seen, last_seen, lifetime_download_bytes, lifetime_upload_bytes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7)
             ON CONFLICT(app_key) DO UPDATE SET
                exe_name = excluded.exe_name,
                friendly_name = excluded.friendly_name,
                full_path = excluded.full_path,
                last_seen = excluded.last_seen,
                lifetime_download_bytes = lifetime_download_bytes + excluded.lifetime_download_bytes,
                lifetime_upload_bytes = lifetime_upload_bytes + excluded.lifetime_upload_bytes",
            rusqlite::params![
                app_key,
                exe_name,
                friendly_name,
                full_path,
                timestamp,
                delta_down,
                delta_up,
            ],
        )?;

        if delta_down > 0 || delta_up > 0 {
            let sample_id = format!("{app_key}_{timestamp}");
            let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
            let hour_str = chrono::Local::now().format("%H:00").to_string();

            conn.execute(
                "INSERT INTO app_traffic_samples (id, app_key, timestamp, date_str, hour_str, download_bytes, upload_bytes)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    sample_id,
                    app_key,
                    timestamp,
                    date_str,
                    hour_str,
                    delta_down,
                    delta_up,
                ],
            )?;
        }

        Ok(())
    }

    pub fn get_all_records(conn: &Connection) -> Result<Vec<AppAccountingRecord>> {
        let mut stmt = conn.prepare(
            "SELECT app_key, exe_name, friendly_name, full_path, first_seen, last_seen, lifetime_download_bytes, lifetime_upload_bytes
             FROM app_identity_accounting ORDER BY (lifetime_download_bytes + lifetime_upload_bytes) DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let down: u64 = row.get(6)?;
            let up: u64 = row.get(7)?;
            Ok(AppAccountingRecord {
                app_key: row.get(0)?,
                exe_name: row.get(1)?,
                friendly_name: row.get(2)?,
                full_path: row.get(3)?,
                first_seen: row.get(4)?,
                last_seen: row.get(5)?,
                lifetime_download_bytes: down,
                lifetime_upload_bytes: up,
                lifetime_total_bytes: down.saturating_add(up),
                is_running: false,
                current_pid: None,
                current_download_bps: 0,
                current_upload_bps: 0,
            })
        })?;

        rows.collect()
    }

    pub fn get_app_samples(
        conn: &Connection,
        app_key: &str,
        limit: usize,
    ) -> Result<Vec<AppSampleRecord>> {
        let mut stmt = conn.prepare(
            "SELECT id, app_key, timestamp, date_str, hour_str, download_bytes, upload_bytes
             FROM app_traffic_samples WHERE app_key = ?1 ORDER BY timestamp DESC LIMIT ?2",
        )?;

        let rows = stmt.query_map(rusqlite::params![app_key, limit as i64], |row| {
            Ok(AppSampleRecord {
                id: row.get(0)?,
                app_key: row.get(1)?,
                timestamp: row.get(2)?,
                date_str: row.get(3)?,
                hour_str: row.get(4)?,
                download_bytes: row.get(5)?,
                upload_bytes: row.get(6)?,
            })
        })?;

        rows.collect()
    }

    pub fn clear_app_accounting(conn: &Connection, app_key: Option<&str>) -> Result<usize> {
        match app_key {
            Some(key) => {
                conn.execute("DELETE FROM app_traffic_samples WHERE app_key = ?1", [key])?;
                conn.execute(
                    "DELETE FROM app_identity_accounting WHERE app_key = ?1",
                    [key],
                )
            }
            None => {
                conn.execute("DELETE FROM app_traffic_samples", [])?;
                conn.execute("DELETE FROM app_identity_accounting", [])
            }
        }
    }
}
