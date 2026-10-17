use crate::network::counters::InterfaceCounters;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

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

#[derive(Default)]
struct AdapterSample {
    last_received: Option<u64>,
    last_sent: Option<u64>,
    last_timestamp_ms: Option<u64>,
    download_bps: u64,
    upload_bps: u64,
    session_download_bytes: u64,
    session_upload_bytes: u64,
    daily_download_bytes: u64,
    daily_upload_bytes: u64,
}

#[derive(Default)]
struct TelemetryState {
    adapters: HashMap<String, AdapterSample>,
    day_key: String,
}

static TELEMETRY: OnceLock<Mutex<TelemetryState>> = OnceLock::new();

#[derive(Default)]
pub struct MonitoringCollector;

impl MonitoringCollector {
    pub fn new() -> Self {
        Self
    }

    /// Read actual cumulative interface counters and calculate rates from successive samples.
    /// Values are zero on the first sample; no sample traffic is synthesized.
    pub fn get_latest_stats(&self, adapter_id: &str) -> Result<LiveNetworkStats, String> {
        let counters = InterfaceCounters::read_counters(adapter_id)?;
        let mut state = TELEMETRY
            .get_or_init(|| Mutex::new(TelemetryState::default()))
            .lock()
            .map_err(|_| "Network telemetry state is unavailable.".to_string())?;

        let today = chrono::Local::now().date_naive().to_string();
        if state.day_key != today {
            state.day_key = today;
            for sample in state.adapters.values_mut() {
                sample.daily_download_bytes = 0;
                sample.daily_upload_bytes = 0;
            }
        }

        let sample = state.adapters.entry(counters.adapter_id.clone()).or_default();
        let mut delta_received = 0_u64;
        let mut delta_sent = 0_u64;

        if let (Some(previous_received), Some(previous_sent), Some(previous_time)) =
            (sample.last_received, sample.last_sent, sample.last_timestamp_ms)
        {
            let elapsed_ms = counters.timestamp_ms.saturating_sub(previous_time);
            if elapsed_ms > 0 {
                delta_received = counters.bytes_received.saturating_sub(previous_received);
                delta_sent = counters.bytes_sent.saturating_sub(previous_sent);
                sample.download_bps = delta_received.saturating_mul(1000) / elapsed_ms;
                sample.upload_bps = delta_sent.saturating_mul(1000) / elapsed_ms;
                sample.session_download_bytes = sample.session_download_bytes.saturating_add(delta_received);
                sample.session_upload_bytes = sample.session_upload_bytes.saturating_add(delta_sent);
                sample.daily_download_bytes = sample.daily_download_bytes.saturating_add(delta_received);
                sample.daily_upload_bytes = sample.daily_upload_bytes.saturating_add(delta_sent);
            }
        }

        sample.last_received = Some(counters.bytes_received);
        sample.last_sent = Some(counters.bytes_sent);
        sample.last_timestamp_ms = Some(counters.timestamp_ms);

        Ok(LiveNetworkStats {
            timestamp: counters.timestamp_ms,
            download_bps: sample.download_bps,
            upload_bps: sample.upload_bps,
            session_download_bytes: sample.session_download_bytes,
            session_upload_bytes: sample.session_upload_bytes,
            total_session_bytes: sample.session_download_bytes.saturating_add(sample.session_upload_bytes),
            daily_download_bytes: sample.daily_download_bytes,
            daily_upload_bytes: sample.daily_upload_bytes,
            active_adapter_id: counters.adapter_id,
        })
    }

    /// Reset measured application-session and current-day totals without changing OS counters.
    pub fn reset_session_counters() -> Result<(), String> {
        let mut state = TELEMETRY
            .get_or_init(|| Mutex::new(TelemetryState::default()))
            .lock()
            .map_err(|_| "Network telemetry state is unavailable.".to_string())?;
        for sample in state.adapters.values_mut() {
            sample.session_download_bytes = 0;
            sample.session_upload_bytes = 0;
            sample.daily_download_bytes = 0;
            sample.daily_upload_bytes = 0;
        }
        Ok(())
    }
}
