use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub monitoring: MonitoringConfig,
    pub diagnostics: DiagnosticsConfig,
    pub startup: StartupConfig,
    pub storage: StorageConfig,
    pub appearance: AppearanceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitoringConfig {
    pub enabled: bool,
    pub per_app_enabled: bool,
    pub adapter_id: String,
    pub update_interval_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsConfig {
    pub active_ping_target: String,
    pub ping_interval_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    pub start_with_windows: bool,
    pub minimize_to_tray_on_close: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    pub data_retention_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub theme: String,
    pub accent_color: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            monitoring: MonitoringConfig {
                enabled: true,
                per_app_enabled: true,
                adapter_id: "auto".to_string(),
                update_interval_ms: 1000,
            },
            diagnostics: DiagnosticsConfig {
                active_ping_target: "1.1.1.1".to_string(),
                ping_interval_ms: 2000,
            },
            startup: StartupConfig {
                start_with_windows: false,
                minimize_to_tray_on_close: true,
            },
            storage: StorageConfig {
                data_retention_days: 30,
            },
            appearance: AppearanceConfig {
                theme: "dark".to_string(),
                accent_color: "#38bdf8".to_string(),
            },
        }
    }
}
