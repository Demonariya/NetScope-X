use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceCounters {
    pub adapter_id: String,
    pub bytes_received: u64,
    pub bytes_sent: u64,
    pub packets_received: u64,
    pub packets_sent: u64,
    pub errors_in: u32,
    pub errors_out: u32,
    pub timestamp_ms: u64,
}

impl InterfaceCounters {
    /// Read cumulative counters from Get-NetAdapterStatistics on Windows.
    /// The interface ID must be "auto" or a numeric Windows interface index.
    pub fn read_counters(adapter_id: &str) -> Result<Self, String> {
        if adapter_id != "auto" && !adapter_id.chars().all(|value| value.is_ascii_digit()) {
            return Err("Invalid network interface ID.".to_string());
        }
        let script_id = adapter_id.replace('\\'', "''");
        let script = format!(r#"
$requestedId = '{script_id}'
if ($requestedId -eq 'auto') {{
  $config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object {{ $_.IPv4DefaultGateway -or $_.IPv6DefaultGateway }} |
    Select-Object -First 1
  if ($null -eq $config) {{ throw 'No active default-route network adapter was found.' }}
  $adapter = Get-NetAdapter -InterfaceIndex $config.InterfaceIndex -ErrorAction Stop
}} else {{
  $adapter = Get-NetAdapter -InterfaceIndex ([int]$requestedId) -ErrorAction Stop
}}
$stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction Stop
[pscustomobject]@{{
  adapterId = [string]$adapter.ifIndex
  bytesReceived = [uint64]$stats.ReceivedBytes
  bytesSent = [uint64]$stats.SentBytes
  packetsReceived = [uint64]$stats.ReceivedUnicastPackets
  packetsSent = [uint64]$stats.SentUnicastPackets
  errorsIn = [uint32]$stats.ReceivedPacketErrors
  errorsOut = [uint32]$stats.OutboundPacketErrors
  timestampMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}} | ConvertTo-Json -Compress
"#);
        let json = crate::windows_utils::run_powershell(&script)?;
        serde_json::from_str::<Self>(&json).map_err(|error| format!("Invalid interface counters JSON: {error}"))
    }
}
