use crate::storage::schema::INITIAL_SCHEMA;
use rusqlite::{Connection, Result};

pub fn apply_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(INITIAL_SCHEMA)?;
    Ok(())
}
