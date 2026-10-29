use crate::storage::migrations::apply_migrations;
use rusqlite::{Connection, Result};
use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub struct Database {
    conn: Connection,
}

static SHARED_CONNECTIONS: OnceLock<Mutex<HashMap<PathBuf, Connection>>> = OnceLock::new();

impl Database {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
        apply_migrations(&conn)?;
        Ok(Self { conn })
    }

    /// Open or reuse an existing persistent SQLite connection for the given path.
    /// This prevents re-opening files and re-running migration queries on every 1-second sample.
    pub fn with_shared<P: AsRef<Path>, R, F: FnOnce(&Connection) -> Result<R>>(
        path: P,
        action: F,
    ) -> Result<R> {
        let path_buf = path.as_ref().to_path_buf();
        let pool = SHARED_CONNECTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut map = pool
            .lock()
            .map_err(|_| rusqlite::Error::ExecuteReturnedResults)?;

        if let Entry::Vacant(e) = map.entry(path_buf.clone()) {
            let conn = Connection::open(&path_buf)?;
            let _ = conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
            apply_migrations(&conn)?;
            e.insert(conn);
        }

        let conn = map.get(&path_buf).expect("connection must exist in pool");
        action(conn)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        apply_migrations(&conn)?;
        Ok(Self { conn })
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn in_memory_database_initializes_with_schema() {
        let db = Database::open_in_memory().expect("in-memory db should open");
        let count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='hourly_traffic'",
                [],
                |row| row.get(0),
            )
            .expect("query should succeed");
        assert_eq!(count, 1);
    }

    #[test]
    fn with_shared_reuses_connection_without_reapplying_migrations() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("test_shared_db_{}.sqlite3", std::process::id()));

        let first_res = Database::with_shared(&db_path, |conn| {
            conn.execute(
                "INSERT INTO hourly_traffic (id, timestamp, date_str, hour_str, download_bytes, upload_bytes, top_app)
                 VALUES ('test-1', 12345, '2026-10-29', '12:00', 500, 200, 'TestApp')",
                [],
            )
        });
        assert!(first_res.is_ok());

        let second_res = Database::with_shared(&db_path, |conn| {
            conn.query_row(
                "SELECT download_bytes FROM hourly_traffic WHERE id = 'test-1'",
                [],
                |row| row.get::<_, u64>(0),
            )
        });
        assert_eq!(second_res.unwrap(), 500);

        let _ = std::fs::remove_file(db_path);
    }
}
