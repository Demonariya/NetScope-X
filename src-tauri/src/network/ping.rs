use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr, ToSocketAddrs};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PingStatus {
    Success,
    Timeout,
    DnsError,
    Unreachable,
    InvalidTarget,
    Error,
}

impl PingStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Timeout => "timeout",
            Self::DnsError => "dns_error",
            Self::Unreachable => "unreachable",
            Self::InvalidTarget => "invalid_target",
            Self::Error => "error",
        }
    }
}

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

fn parse_or_resolve_ipv4(target: &str) -> Result<Ipv4Addr, PingStatus> {
    let trimmed = target.trim();
    let host = trimmed
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(trimmed);

    if host.is_empty() {
        return Err(PingStatus::InvalidTarget);
    }

    // Direct IPv4 address parsing
    if let Ok(address) = host.parse::<Ipv4Addr>() {
        return Ok(address);
    }

    // Direct IPv6 address check
    if host.parse::<std::net::Ipv6Addr>().is_ok() {
        // ICMP IPv4 echo cannot probe IPv6
        return Err(PingStatus::Unreachable);
    }

    // Check for invalid host characters
    if host
        .chars()
        .any(|c| c.is_whitespace() || c == '/' || c == '\\' || c == ':' || c == '?' || c == '*')
    {
        return Err(PingStatus::InvalidTarget);
    }

    // DNS lookup with port 0
    let socket_addrs = match (host, 0u16).to_socket_addrs() {
        Ok(iter) => iter,
        Err(_) => return Err(PingStatus::DnsError),
    };

    let mut found_ipv6 = false;
    for addr in socket_addrs {
        match addr.ip() {
            IpAddr::V4(v4) => return Ok(v4),
            IpAddr::V6(_) => found_ipv6 = true,
        }
    }

    if found_ipv6 {
        Err(PingStatus::Unreachable)
    } else {
        Err(PingStatus::DnsError)
    }
}

#[cfg(windows)]
#[repr(C)]
struct IcmpEchoReplyHeader {
    _address: u32,
    status: u32,
    round_trip_time: u32,
}

#[cfg(windows)]
#[link(name = "iphlpapi")]
extern "system" {
    #[link_name = "IcmpCreateFile"]
    fn icmp_create_file() -> *mut std::ffi::c_void;
    #[link_name = "IcmpCloseHandle"]
    fn icmp_close_handle(handle: *mut std::ffi::c_void) -> i32;
    #[link_name = "IcmpSendEcho"]
    fn icmp_send_echo(
        handle: *mut std::ffi::c_void,
        destination_address: u32,
        request_data: *mut std::ffi::c_void,
        request_size: u16,
        request_options: *mut std::ffi::c_void,
        reply_buffer: *mut std::ffi::c_void,
        reply_size: u32,
        timeout: u32,
    ) -> u32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    #[link_name = "GetLastError"]
    fn get_last_error() -> u32;
}

#[cfg(windows)]
fn probe_icmp_windows(address: Ipv4Addr, timeout_ms: u64) -> (PingStatus, f64) {
    const REQUEST: &[u8] = b"NetScopeX";
    const REPLY_EXTRA_BYTES: usize = 512;

    let handle = unsafe { icmp_create_file() };
    if handle.is_null() || handle as isize == -1 {
        return (PingStatus::Error, 0.0);
    }

    let mut request = REQUEST.to_vec();
    let required_size =
        std::mem::size_of::<IcmpEchoReplyHeader>() + REQUEST.len() + REPLY_EXTRA_BYTES;
    let word_size = std::mem::size_of::<usize>();
    let mut reply_words = vec![0usize; required_size.div_ceil(word_size)];
    let reply_size = (reply_words.len() * word_size) as u32;
    let timeout = timeout_ms.clamp(100, 15000) as u32;

    let replies = unsafe {
        icmp_send_echo(
            handle,
            u32::from_ne_bytes(address.octets()),
            request.as_mut_ptr().cast(),
            request.len() as u16,
            std::ptr::null_mut(),
            reply_words.as_mut_ptr().cast(),
            reply_size,
            timeout,
        )
    };

    let outcome = if replies > 0 {
        let reply =
            unsafe { std::ptr::read_unaligned(reply_words.as_ptr().cast::<IcmpEchoReplyHeader>()) };
        match reply.status {
            0 => (PingStatus::Success, reply.round_trip_time as f64),
            11010 => (PingStatus::Timeout, 0.0), // IP_REQ_TIMED_OUT
            11002..=11005 => (PingStatus::Unreachable, 0.0), // Destination unreachable
            11018 => (PingStatus::InvalidTarget, 0.0), // IP_BAD_DESTINATION
            _ => (PingStatus::Error, 0.0),
        }
    } else {
        match unsafe { get_last_error() } {
            11010 | 1460 => (PingStatus::Timeout, 0.0), // IP_REQ_TIMED_OUT / ERROR_TIMEOUT
            11002..=11005 => (PingStatus::Unreachable, 0.0),
            11018 => (PingStatus::InvalidTarget, 0.0),
            _ => (PingStatus::Error, 0.0),
        }
    };

    let _ = unsafe { icmp_close_handle(handle) };
    outcome
}

#[cfg(not(windows))]
fn probe_cross_platform(address: Ipv4Addr, timeout_ms: u64) -> (PingStatus, f64) {
    let timeout = Duration::from_millis(timeout_ms.clamp(100, 15000));
    let socket_addr = std::net::SocketAddr::new(IpAddr::V4(address), 80);
    let start = std::time::Instant::now();

    match std::net::TcpStream::connect_timeout(&socket_addr, timeout) {
        Ok(_) => {
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            (PingStatus::Success, (elapsed * 10.0).round() / 10.0)
        }
        Err(err) => {
            let elapsed = start.elapsed();
            if elapsed >= timeout || err.kind() == std::io::ErrorKind::TimedOut {
                (PingStatus::Timeout, 0.0)
            } else if err.kind() == std::io::ErrorKind::ConnectionRefused {
                // Host responded with RST, meaning host is reachable and alive
                let elapsed_ms = elapsed.as_secs_f64() * 1000.0;
                (PingStatus::Success, (elapsed_ms * 10.0).round() / 10.0)
            } else if err.kind() == std::io::ErrorKind::NetworkUnreachable
                || err.kind() == std::io::ErrorKind::HostUnreachable
            {
                (PingStatus::Unreachable, 0.0)
            } else {
                (PingStatus::Error, 0.0)
            }
        }
    }
}

impl PingService {
    /// Sends an ICMP Echo Request (on Windows) or network probe with explicit timeout.
    /// Returns typed status: success, timeout, dns_error, unreachable, invalid_target, or error.
    pub fn probe(target: &str, timeout_ms: u64) -> PingProbeResult {
        let effective_timeout = if timeout_ms == 0 {
            2000
        } else {
            timeout_ms.clamp(100, 15000)
        };

        let (status, latency) = match parse_or_resolve_ipv4(target) {
            Ok(address) => {
                #[cfg(windows)]
                {
                    probe_icmp_windows(address, effective_timeout)
                }
                #[cfg(not(windows))]
                {
                    probe_cross_platform(address, effective_timeout)
                }
            }
            Err(err_status) => (err_status, 0.0),
        };

        let is_success = status == PingStatus::Success;
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
            packet_loss_percent: if is_success { 0.0 } else { 100.0 },
            status: status.as_str().to_string(),
            last_checked: now,
            history: if is_success {
                vec![latency]
            } else {
                Vec::new()
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(json["status"], "success");
        assert!(json.get("min_latency_ms").is_none());
    }

    #[test]
    fn invalid_target_returns_invalid_target_status() {
        let empty_result = PingService::probe("", 1000);
        assert_eq!(empty_result.status, "invalid_target");
        assert_eq!(empty_result.latency_ms, 0.0);

        let space_result = PingService::probe("   ", 1000);
        assert_eq!(space_result.status, "invalid_target");

        let bad_chars = PingService::probe("invalid target with spaces", 1000);
        assert_eq!(bad_chars.status, "invalid_target");
    }

    #[test]
    fn non_existent_domain_returns_dns_error() {
        let domain = "this-domain-definitely-does-not-exist-123456789.netscope";
        let result = PingService::probe(domain, 1000);
        assert_eq!(result.status, "dns_error");
        assert_eq!(result.packet_loss_percent, 100.0);
        assert!(result.history.is_empty());
    }

    #[test]
    fn direct_ipv4_address_parses_without_dns() {
        let parsed = parse_or_resolve_ipv4("127.0.0.1");
        assert_eq!(parsed, Ok(Ipv4Addr::new(127, 0, 0, 1)));
    }
}
