use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsProfileRecord {
    pub id: String,
    pub name: String,
    pub is_preset: bool,
    pub preset_id: Option<String>,
    pub ipv4_primary: String,
    pub ipv4_secondary: Option<String>,
    pub ipv6_primary: Option<String>,
    pub ipv6_secondary: Option<String>,
    pub provider: Option<String>,
    pub created_at: i64,
}

pub struct DnsStorage;

impl DnsStorage {
    pub fn get_profiles(conn: &Connection) -> Result<Vec<DnsProfileRecord>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, is_preset, preset_id, ipv4_primary, ipv4_secondary, ipv6_primary, ipv6_secondary, provider, created_at
             FROM dns_profiles ORDER BY is_preset DESC, created_at ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(DnsProfileRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                is_preset: row.get(2)?,
                preset_id: row.get(3)?,
                ipv4_primary: row.get(4)?,
                ipv4_secondary: row.get(5)?,
                ipv6_primary: row.get(6)?,
                ipv6_secondary: row.get(7)?,
                provider: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;

        rows.collect()
    }

    pub fn save_profile(conn: &Connection, profile: &DnsProfileRecord) -> Result<()> {
        conn.execute(
            "INSERT INTO dns_profiles (id, name, is_preset, preset_id, ipv4_primary, ipv4_secondary, ipv6_primary, ipv6_secondary, provider, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                ipv4_primary = excluded.ipv4_primary,
                ipv4_secondary = excluded.ipv4_secondary,
                ipv6_primary = excluded.ipv6_primary,
                ipv6_secondary = excluded.ipv6_secondary,
                provider = excluded.provider",
            rusqlite::params![
                profile.id,
                profile.name,
                profile.is_preset,
                profile.preset_id,
                profile.ipv4_primary,
                profile.ipv4_secondary,
                profile.ipv6_primary,
                profile.ipv6_secondary,
                profile.provider,
                profile.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_profile(conn: &Connection, id: &str) -> Result<bool> {
        let affected = conn.execute(
            "DELETE FROM dns_profiles WHERE id = ?1 AND is_preset = 0",
            [id],
        )?;
        Ok(affected > 0)
    }
}
