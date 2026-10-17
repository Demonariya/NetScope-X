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
    pub show_inactive_apps: bool,
    pub group_by_exe: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsConfig {
    pub ping_targets: Vec<PingTargetConfig>,
    pub active_ping_target: String,
    pub ping_interval_ms: u64,
    pub ping_timeout_ms: u64,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingTargetConfig {
    pub id: String,
    pub name: String,
    pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    pub start_with_windows: bool,
    pub launch_minimized: bool,
    pub minimize_to_tray_on_close: bool,
    pub keep_monitoring_in_tray: bool,
    pub show_tray_speed_tooltip: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    pub data_retention_days: u32,
    pub auto_prune: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub theme: String,
    pub accent_color: String,
    pub default_canvas_mode: String,
    pub chart_style: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            monitoring: MonitoringConfig {
                enabled: true,
                per_app_enabled: true,
                adapter_id: "auto".to_string(),
                update_interval_ms: 1000,
                show_inactive_apps: true,
                group_by_exe: true,
            },
            diagnostics: DiagnosticsConfig {
                ping_targets: vec![
                    PingTargetConfig {
                        id: "cloudflare".to_string(),
                        name: "Cloudflare DNS".to_string(),
                        host: "1.1.1.1".to_string(),
                    },
                    PingTargetConfig {
                        id: "google".to_string(),
                        name: "Google Public DNS".to_string(),
                        host: "8.8.8.8".to_string(),
                    },
                ],
                active_ping_target: "1.1.1.1".to_string(),
                ping_interval_ms: 2000,
                ping_timeout_ms: 1500,
                mode: "tcp".to_string(),
            },
            startup: StartupConfig {
                start_with_windows: true,
                launch_minimized: false,
                minimize_to_tray_on_close: true,
                keep_monitoring_in_tray: true,
                show_tray_speed_tooltip: true,
            },
            storage: StorageConfig {
                data_retention_days: 30,
                auto_prune: true,
            },
            appearance: AppearanceConfig {
                theme: "dark".to_string(),
                accent_color: "#38bdf8".to_string(),
                default_canvas_mode: "portrait_9_16".to_string(),
                chart_style: "area".to_string(),
            },
        }
    }
}
