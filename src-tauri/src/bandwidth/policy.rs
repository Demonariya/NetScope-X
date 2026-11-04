use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum BandwidthUnit {
    #[serde(rename = "Bps")]
    Bps,
    #[serde(rename = "KB/s")]
    KiloBytesPerSec,
    #[serde(rename = "MB/s")]
    MegaBytesPerSec,
    #[serde(rename = "Mbps")]
    MegaBitsPerSec,
}

impl BandwidthUnit {
    /// Convert value with given unit to raw bits per second.
    /// Never confuses bytes per second with bits per second:
    /// 1 Bps = 8 bps
    /// 1 KB/s = 8,000 bps
    /// 1 MB/s = 8,000,000 bps
    /// 1 Mbps = 1,000,000 bps
    pub fn to_bits_per_sec(val: f64, unit_str: &str) -> u64 {
        if val <= 0.0 || !val.is_finite() {
            return 0;
        }
        match unit_str {
            "Bps" => (val * 8.0).round() as u64,
            "KB/s" => (val * 8.0 * 1_000.0).round() as u64,
            "MB/s" => (val * 8.0 * 1_000_000.0).round() as u64,
            "Mbps" => (val * 1_000_000.0).round() as u64,
            _ => (val * 1_000_000.0).round() as u64,
        }
    }

    /// Convert bits per second back into the target unit.
    pub fn from_bits_per_sec(bits: u64, unit_str: &str) -> f64 {
        if bits == 0 {
            return 0.0;
        }
        match unit_str {
            "Bps" => (bits as f64 / 8.0).round(),
            "KB/s" => ((bits as f64 / (8.0 * 1_000.0)) * 100.0).round() / 100.0,
            "MB/s" => ((bits as f64 / (8.0 * 1_000_000.0)) * 100.0).round() / 100.0,
            "Mbps" => ((bits as f64 / 1_000_000.0) * 100.0).round() / 100.0,
            _ => ((bits as f64 / 1_000_000.0) * 100.0).round() / 100.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ApplicationPriority {
    Critical,
    High,
    Normal,
    Low,
    Background,
}

impl ApplicationPriority {
    /// Maps application priority to Windows QoS DSCP value.
    pub fn to_dscp_action(&self) -> u32 {
        match self {
            Self::Critical => 46, // Expedited Forwarding (EF)
            Self::High => 34,     // AF41
            Self::Normal => 0,    // Best Effort
            Self::Low => 10,      // AF11
            Self::Background => 8, // CS1
        }
    }

    /// Maps application priority to 802.1p priority tag (0-7).
    pub fn to_8021p_priority(&self) -> u32 {
        match self {
            Self::Critical => 6,
            Self::High => 5,
            Self::Normal => 0,
            Self::Low => 1,
            Self::Background => 1,
        }
    }
}

impl Default for ApplicationPriority {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandwidthLimitRule {
    pub id: String,
    pub name: String,
    pub target_type: String, // "global", "application", "process", "adapter"
    pub target_identifier: String,
    pub app_path: Option<String>,
    pub pid: Option<u32>,
    pub download_limit_bps: Option<u64>,
    pub upload_limit_bps: Option<u64>,
    pub download_enabled: bool,
    pub upload_enabled: bool,
    pub priority: ApplicationPriority,
    pub adapter_alias: Option<String>,
    pub upload_enforcement: String,   // "enforced", "failed", "disabled"
    pub download_enforcement: String, // "advisory", "unsupported"
    pub enforcement_message: Option<String>,
    #[serde(default)]
    pub is_group_rule: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandwidthProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_preset: bool,
    pub preset_type: Option<String>,
    pub global_download_limit_bps: Option<u64>,
    pub global_upload_limit_bps: Option<u64>,
    pub global_download_enabled: bool,
    pub global_upload_enabled: bool,
    pub adapter_alias: String,
    pub app_rules: Vec<BandwidthLimitRule>,
    pub default_priority: ApplicationPriority,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandwidthCapabilities {
    pub outbound_throttling_supported: bool,
    pub inbound_throttling_supported: bool,
    pub dscp_marking_supported: bool,
    pub priority_scheduling_supported: bool,
    pub is_elevated: bool,
    pub inbound_limitation_reason: String,
    pub mechanism: String,
}

impl Default for BandwidthCapabilities {
    fn default() -> Self {
        Self {
            outbound_throttling_supported: true,
            inbound_throttling_supported: false,
            dscp_marking_supported: true,
            priority_scheduling_supported: true,
            is_elevated: true,
            inbound_limitation_reason: "Native Windows Policy-based QoS (pacer.sys) enforces outbound upload limits. Inbound shaping requires a kernel NDIS driver; download caps are tracked as OS Advisory.".to_string(),
            mechanism: "Windows Policy-based QoS (pacer.sys) & DSCP Traffic Scheduling".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandwidthConfig {
    pub active_profile_id: String,
    pub profiles: Vec<BandwidthProfile>,
    pub global_rule: BandwidthLimitRule,
    pub app_rules: Vec<BandwidthLimitRule>,
    pub capabilities: BandwidthCapabilities,
    pub is_paused: bool,
}
