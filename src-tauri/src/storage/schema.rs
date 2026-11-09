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

CREATE TABLE IF NOT EXISTS dns_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_preset BOOLEAN NOT NULL DEFAULT 0,
    preset_id TEXT,
    ipv4_primary TEXT NOT NULL,
    ipv4_secondary TEXT,
    ipv6_primary TEXT,
    ipv6_secondary TEXT,
    provider TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ping_sessions (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    host TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    total_requests INTEGER NOT NULL,
    successful_requests INTEGER NOT NULL,
    failed_requests INTEGER NOT NULL,
    packet_loss_percent REAL NOT NULL,
    min_latency_ms REAL NOT NULL,
    max_latency_ms REAL NOT NULL,
    avg_latency_ms REAL NOT NULL,
    jitter_ms REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS app_identity_accounting (
    app_key TEXT PRIMARY KEY,
    exe_name TEXT NOT NULL,
    friendly_name TEXT NOT NULL,
    full_path TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    lifetime_download_bytes INTEGER NOT NULL DEFAULT 0,
    lifetime_upload_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_traffic_samples (
    id TEXT PRIMARY KEY,
    app_key TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    date_str TEXT NOT NULL,
    hour_str TEXT NOT NULL,
    download_bytes INTEGER NOT NULL DEFAULT 0,
    upload_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hourly_timestamp ON hourly_traffic (timestamp);
CREATE INDEX IF NOT EXISTS idx_ping_sessions_start ON ping_sessions (start_time);
CREATE INDEX IF NOT EXISTS idx_app_identity_last_seen ON app_identity_accounting (last_seen);
CREATE INDEX IF NOT EXISTS idx_app_samples_key_time ON app_traffic_samples (app_key, timestamp);
"#;
