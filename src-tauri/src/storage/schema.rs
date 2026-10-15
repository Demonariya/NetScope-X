pub const INITIAL_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS hourly_traffic (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    date_str TEXT NOT NULL,
    hour_str TEXT NOT NULL,
    download_bytes INTEGER NOT NULL,
    upload_bytes INTEGER NOT NULL,
    top_app TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS process_traffic (
    pid INTEGER NOT NULL,
    exe_name TEXT NOT NULL,
    friendly_name TEXT NOT NULL,
    download_bytes INTEGER NOT NULL,
    upload_bytes INTEGER NOT NULL,
    last_updated INTEGER NOT NULL,
    PRIMARY KEY (pid, exe_name)
);

CREATE INDEX IF NOT EXISTS idx_hourly_timestamp ON hourly_traffic (timestamp);
"#;
