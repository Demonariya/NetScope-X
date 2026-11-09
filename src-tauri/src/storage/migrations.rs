use crate::storage::schema::INITIAL_SCHEMA;
use rusqlite::{Connection, Result};

pub fn apply_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(INITIAL_SCHEMA)?;

    // Populate initial DNS presets if table is empty
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM dns_profiles",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    if count == 0 {
        let presets = [
            ("preset_cloudflare", "Cloudflare DNS", "1.1.1.1", "1.0.0.1", "2606:4700:4700::1111", "2606:4700:4700::1001", "Cloudflare"),
            ("preset_google", "Google Public DNS", "8.8.8.8", "8.8.4.4", "2001:4860:4860::8888", "2001:4860:4860::8844", "Google"),
            ("preset_quad9", "Quad9 Secure DNS", "9.9.9.9", "149.112.112.112", "2620:fe::fe", "2620:fe::9", "Quad9"),
            ("preset_adguard", "AdGuard DNS (Default)", "94.140.14.14", "94.140.15.15", "2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff", "AdGuard"),
            ("preset_opendns", "Cisco OpenDNS", "208.67.222.222", "208.67.220.220", "2620:119:35::35", "2620:119:53::53", "Cisco"),
        ];

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        for (id, name, ipv4_1, ipv4_2, ipv6_1, ipv6_2, provider) in presets {
            conn.execute(
                "INSERT OR IGNORE INTO dns_profiles (id, name, is_preset, preset_id, ipv4_primary, ipv4_secondary, ipv6_primary, ipv6_secondary, provider, created_at)
                 VALUES (?1, ?2, 1, ?1, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![id, name, ipv4_1, ipv4_2, ipv6_1, ipv6_2, provider, now],
            )?;
        }
    }

    Ok(())
}
