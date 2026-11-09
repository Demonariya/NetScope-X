use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingSessionRecord {
    pub id: String,
    pub target: String,
    pub host: String,
    pub start_time: i64,
    pub end_time: i64,
    pub total_requests: u32,
    pub successful_requests: u32,
    pub failed_requests: u32,
    pub packet_loss_percent: f64,
    pub min_latency_ms: f64,
    pub max_latency_ms: f64,
    pub avg_latency_ms: f64,
    pub jitter_ms: f64,
}

pub struct PingStorage;

impl PingStorage {
    pub fn save_session(conn: &Connection, session: &PingSessionRecord) -> Result<()> {
        conn.execute(
            "INSERT INTO ping_sessions (id, target, host, start_time, end_time, total_requests, successful_requests, failed_requests, packet_loss_percent, min_latency_ms, max_latency_ms, avg_latency_ms, jitter_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                session.id,
                session.target,
                session.host,
                session.start_time,
                session.end_time,
                session.total_requests,
                session.successful_requests,
                session.failed_requests,
                session.packet_loss_percent,
                session.min_latency_ms,
                session.max_latency_ms,
                session.avg_latency_ms,
                session.jitter_ms,
            ],
        )?;
        Ok(())
    }

    pub fn get_sessions(conn: &Connection, limit: usize) -> Result<Vec<PingSessionRecord>> {
        let mut stmt = conn.prepare(
            "SELECT id, target, host, start_time, end_time, total_requests, successful_requests, failed_requests, packet_loss_percent, min_latency_ms, max_latency_ms, avg_latency_ms, jitter_ms
             FROM ping_sessions ORDER BY start_time DESC LIMIT ?1",
        )?;

        let rows = stmt.query_map([limit as i64], |row| {
            Ok(PingSessionRecord {
                id: row.get(0)?,
                target: row.get(1)?,
                host: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                total_requests: row.get(5)?,
                successful_requests: row.get(6)?,
                failed_requests: row.get(7)?,
                packet_loss_percent: row.get(8)?,
                min_latency_ms: row.get(9)?,
                max_latency_ms: row.get(10)?,
                avg_latency_ms: row.get(11)?,
                jitter_ms: row.get(12)?,
            })
        })?;

        rows.collect()
    }

    pub fn delete_session(conn: &Connection, id: &str) -> Result<usize> {
        conn.execute("DELETE FROM ping_sessions WHERE id = ?1", [id])
    }

    pub fn clear_sessions(conn: &Connection) -> Result<usize> {
        conn.execute("DELETE FROM ping_sessions", [])
    }
}
