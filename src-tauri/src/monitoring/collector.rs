use crate::monitoring::traffic_aggregation::TrafficAggregator;
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
    pub hourly_download_bytes: u64,
    pub hourly_upload_bytes: u64,
    pub date_str: String,
    pub hour_str: String,
    pub hour_key: String,
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
    hourly_download_bytes: u64,
    hourly_upload_bytes: u64,
    day_key: String,
    hour_key: String,
}

#[derive(Default)]
struct TelemetryState {
    adapters: HashMap<String, AdapterSample>,
}

static TELEMETRY: OnceLock<Mutex<TelemetryState>> = OnceLock::new();

#[derive(Default)]
pub struct MonitoringCollector;

impl MonitoringCollector {
    pub fn new() -> Self {
        Self
    }

    /// Read OS counters and calculate rates from deltas between real samples.
    /// All rates start at zero until a second sample establishes a delta.
    pub fn get_latest_stats(&self, adapter_id: &str) -> Result<LiveNetworkStats, String> {
        let counters = InterfaceCounters::read_counters(adapter_id)?;
        let now = chrono::Local::now();
        let date_str = now.format("%Y-%m-%d").to_string();
        let hour_str = now.format("%H:00").to_string();
        let hour_key = now.format("%Y-%m-%d-%H").to_string();
        let mut state = TELEMETRY
            .get_or_init(|| Mutex::new(TelemetryState::default()))
            .lock()
            .map_err(|_| "Network telemetry state is unavailable.".to_string())?;
        let sample = state
            .adapters
            .entry(counters.adapter_id.clone())
            .or_default();

        if sample.day_key != date_str {
            sample.day_key = date_str.clone();
            sample.daily_download_bytes = 0;
            sample.daily_upload_bytes = 0;
        }
        if sample.hour_key != hour_key {
            sample.hour_key = hour_key.clone();
            sample.hourly_download_bytes = 0;
            sample.hourly_upload_bytes = 0;
        }

        if let (Some(previous_received), Some(previous_sent), Some(previous_time)) = (
            sample.last_received,
            sample.last_sent,
            sample.last_timestamp_ms,
        ) {
            let elapsed_ms = counters.timestamp_ms.saturating_sub(previous_time);
            let delta_received = counters.bytes_received.saturating_sub(previous_received);
            let delta_sent = counters.bytes_sent.saturating_sub(previous_sent);

            if elapsed_ms > 0 {
                let elapsed_seconds = elapsed_ms as f64 / 1000.0;
                sample.download_bps =
                    TrafficAggregator::calculate_bps(delta_received, elapsed_seconds);
                sample.upload_bps = TrafficAggregator::calculate_bps(delta_sent, elapsed_seconds);
                sample.session_download_bytes =
                    sample.session_download_bytes.saturating_add(delta_received);
                sample.session_upload_bytes =
                    sample.session_upload_bytes.saturating_add(delta_sent);
                sample.daily_download_bytes =
                    sample.daily_download_bytes.saturating_add(delta_received);
                sample.daily_upload_bytes = sample.daily_upload_bytes.saturating_add(delta_sent);
                sample.hourly_download_bytes =
                    sample.hourly_download_bytes.saturating_add(delta_received);
                sample.hourly_upload_bytes = sample.hourly_upload_bytes.saturating_add(delta_sent);
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
            total_session_bytes: sample
                .session_download_bytes
                .saturating_add(sample.session_upload_bytes),
            daily_download_bytes: sample.daily_download_bytes,
            daily_upload_bytes: sample.daily_upload_bytes,
            hourly_download_bytes: sample.hourly_download_bytes,
            hourly_upload_bytes: sample.hourly_upload_bytes,
            date_str,
            hour_str,
            hour_key,
            active_adapter_id: counters.adapter_id,
        })
    }

    /// Reset app-measured totals while preserving OS counter baselines, preventing artificial spikes.
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
            sample.hourly_download_bytes = 0;
            sample.hourly_upload_bytes = 0;
        }
        Ok(())
    }
}
