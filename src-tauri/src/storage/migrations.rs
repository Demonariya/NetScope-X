use rusqlite::{Connection, Result};
use crate::storage::schema::INITIAL_SCHEMA;

pub fn apply_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(INITIAL_SCHEMA)?;
    Ok(())
}
