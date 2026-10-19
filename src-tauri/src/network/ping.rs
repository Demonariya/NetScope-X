use serde::{Deserialize, Serialize};

#[cfg(windows)]
use std::net::{Ipv4Addr, ToSocketAddrs};

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

#[cfg(windows)]
fn resolve_ipv4(target: &str) -> Result<Ipv4Addr, &'static str> {
    let trimmed = target.trim();
    let host = trimmed
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(trimmed);
    if host.is_empty() {
        return Err("Target is empty");
    }
    if let Ok(address) = host.parse::<Ipv4Addr>() {
        return Ok(address);
    }

    (host, 0u16)
        .to_socket_addrs()
        .map_err(|_| "DNS lookup failed")?
        .find_map(|address| match address.ip() {
            std::net::IpAddr::V4(ipv4) => Some(ipv4),
            std::net::IpAddr::V6(_) => None,
        })
        .ok_or("No IPv4 address is available for this target")
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
fn probe_icmp_ipv4(address: Ipv4Addr, timeout_ms: u64) -> (&'static str, f64) {
    const REQUEST: &[u8] = b"NetScopeX";
    const REPLY_EXTRA_BYTES: usize = 512;

    let handle = unsafe { icmp_create_file() };
    if handle.is_null() || handle as isize == -1 {
        return ("error", 0.0);
    }

    let mut request = REQUEST.to_vec();
    let required_size =
        std::mem::size_of::<IcmpEchoReplyHeader>() + REQUEST.len() + REPLY_EXTRA_BYTES;
    let word_size = std::mem::size_of::<usize>();
    let mut reply_words = vec![0usize; required_size.div_ceil(word_size)];
    let reply_size = (reply_words.len() * word_size) as u32;
    let timeout = timeout_ms.clamp(1, u32::MAX as u64) as u32;

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
            0 => ("success", reply.round_trip_time as f64),
            11010 => ("timeout", 0.0), // IP_REQ_TIMED_OUT
            _ => ("error", 0.0),
        }
    } else {
        match unsafe { get_last_error() } {
            11010 | 1460 => ("timeout", 0.0), // IP_REQ_TIMED_OUT / ERROR_TIMEOUT
            _ => ("error", 0.0),
        }
    };

    let _ = unsafe { icmp_close_handle(handle) };
    outcome
}

impl PingService {
    /// Sends a real Windows ICMP Echo Request to an IPv4 address or hostname.
    /// IPv6-only targets are reported as unavailable instead of measured with a TCP handshake.
    pub fn probe(target: &str, timeout_ms: u64) -> PingProbeResult {
        #[cfg(windows)]
        let (status, latency) = match resolve_ipv4(target) {
            Ok(address) => probe_icmp_ipv4(address, timeout_ms),
            Err(_) => ("error", 0.0),
        };

        #[cfg(not(windows))]
        let (status, latency) = {
            let _ = timeout_ms;
            ("error", 0.0)
        };

        let success = status == "success";
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
