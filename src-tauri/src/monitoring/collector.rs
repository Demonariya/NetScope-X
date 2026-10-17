use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveNetworkStats {
    pub timestamp: u64,
    pub download_bps: u64,
    pub upload_bps: u64,
    pub session_download_bytes: u64,
    pub session_upload_bytes: u64,
    pub total_session_bytes: u64,
    pub daily_download_bytes: u64,
    pub daily_upload_bytes: u64,
    pub active_adapter_id: String,
}

pub struct MonitoringCollector {
    is_running: Arc<AtomicBool>,
}

impl MonitoringCollector {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self) {
        self.is_running.store(true, Ordering::SeqCst);
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }

    pub fn is_active(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub fn get_latest_stats(&self) -> LiveNetworkStats {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        LiveNetworkStats {
            timestamp: now,
            download_bps: 1_250_000,
            upload_bps: 380_000,
            session_download_bytes: 1420 * 1024 * 1024,
            session_upload_bytes: 380 * 1024 * 1024,
            total_session_bytes: 1800 * 1024 * 1024,
            daily_download_bytes: 4850 * 1024 * 1024,
            daily_upload_bytes: 1120 * 1024 * 1024,
            active_adapter_id: "Ethernet0".to_string(),
        }
    }
}

impl Default for MonitoringCollector {
    fn default() -> Self {
        Self::new()
    }
}
