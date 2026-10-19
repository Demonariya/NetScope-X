use serde::{Deserialize, Serialize};
use std::net::ToSocketAddrs;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingProbeResult {
    pub target: String,
    pub host: String,
    pub latency_ms: f64,
    pub min_latency_ms: f64,
    pub max_latency_ms: f64,
    pub avg_latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss_percent: f64,
    pub status: String,
    pub last_checked: u64,
    pub history: Vec<f64>,
}

pub struct PingService;

impl PingService {
    /// Measures a TCP connection handshake to port 443 (or an explicitly supplied host:port).
    /// This is not ICMP echo ping; the UI aggregates actual attempts into rolling statistics.
    pub fn probe(target: &str, timeout_ms: u64) -> PingProbeResult {
        let target_str = if target.starts_with('[') {
            target.to_string()
        } else if target.parse::<std::net::Ipv6Addr>().is_ok() {
            format!("[{target}]:443")
        } else if let Some((host, port)) = target.rsplit_once(':') {
            if !host.contains(':') && port.parse::<u16>().is_ok() {
                target.to_string()
            } else {
                format!("{target}:443")
            }
        } else {
            format!("{target}:443")
        };

        let mut success = false;
        let mut timed_out = false;
        let mut latency = 0.0;

        if let Ok(addrs) = target_str.to_socket_addrs() {
            for addr in addrs {
                let connect_started = Instant::now();
                match std::net::TcpStream::connect_timeout(
                    &addr,
                    std::time::Duration::from_millis(timeout_ms.max(1)),
                ) {
                    Ok(_stream) => {
                        latency = connect_started.elapsed().as_secs_f64() * 1000.0;
                        success = true;
                        break;
                    }
                    Err(error) => {
                        timed_out |= error.kind() == std::io::ErrorKind::TimedOut;
                    }
                }
            }
        }

        let status = if success {
            "success"
        } else if timed_out {
            "timeout"
        } else {
            "error"
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        PingProbeResult {
            target: target.to_string(),
            host: target.to_string(),
            latency_ms: latency,
            min_latency_ms: latency,
            max_latency_ms: latency,
            avg_latency_ms: latency,
            jitter_ms: 0.0,
            packet_loss_percent: if success { 0.0 } else { 100.0 },
            status: status.to_string(),
            last_checked: now,
            history: if success { vec![latency] } else { Vec::new() },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::PingProbeResult;

    #[test]
    fn ping_result_serializes_using_frontend_camel_case_names() {
        let result = PingProbeResult {
            target: "1.1.1.1".to_string(),
            host: "1.1.1.1".to_string(),
            latency_ms: 14.5,
            min_latency_ms: 12.0,
            max_latency_ms: 18.0,
            avg_latency_ms: 14.5,
            jitter_ms: 1.1,
            packet_loss_percent: 0.0,
            status: "success".to_string(),
            last_checked: 123,
            history: vec![14.5],
        };
        let json = serde_json::to_value(result).expect("PingProbeResult should serialize");
        assert_eq!(json["latencyMs"], 14.5);
        assert_eq!(json["minLatencyMs"], 12.0);
        assert_eq!(json["maxLatencyMs"], 18.0);
        assert!(json.get("min_latency_ms").is_none());
    }
}
