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
        let script_id = adapter_id.to_string();
        let script = r#"
$ErrorActionPreference = 'Stop'
$requestedId = '__NETSCOPE_REQUESTED_ID__'
$adapters = @(Get-NetAdapter -IncludeHidden -ErrorAction Stop | Where-Object { $_.Status -ne 'Not Present' })
if ($adapters.Count -eq 0) { throw 'Windows did not return any network adapters.' }

$defaultGatewayByInterface = @{}
try {
  foreach ($route in @(Get-NetRoute -DestinationPrefix @('0.0.0.0/0', '::/0') -ErrorAction SilentlyContinue)) {
    if ($null -ne $route -and $null -ne $route.InterfaceIndex -and -not [string]::IsNullOrWhiteSpace([string]$route.NextHop)) {
      $defaultGatewayByInterface[[string]$route.InterfaceIndex] = $true
    }
  }
} catch {}

if ($requestedId -ne 'auto') {
  $adapter = $adapters | Where-Object { [string]$_.ifIndex -eq $requestedId } | Select-Object -First 1
  if ($null -eq $adapter) {
    throw "Selected interface $requestedId no longer exists. Refresh adapters or choose Auto Select."
  }
  $candidates = @($adapter)
} else {
  $candidates = @(
    $adapters |
      Sort-Object @{
        Expression = {
          if ($defaultGatewayByInterface.ContainsKey([string]$_.ifIndex)) { 0 } else { 1 }
        }
      }, @{
        Expression = { if ($_.Status -eq 'Up') { 0 } else { 1 } }
      }
  )
}

$selectedAdapter = $null
$stats = $null
$lastFailure = ''
foreach ($candidate in $candidates) {
  try {
    $candidateStats = Get-NetAdapterStatistics -Name $candidate.Name -ErrorAction Stop
    $selectedAdapter = $candidate
    $stats = $candidateStats
    break
  } catch {
    $lastFailure = [string]$_.Exception.Message
    if ($requestedId -ne 'auto') { break }
  }
}
if ($null -eq $selectedAdapter -or $null -eq $stats) {
  if ([string]::IsNullOrWhiteSpace($lastFailure)) { $lastFailure = 'Windows could not read adapter statistics.' }
  throw "No usable network adapter was found. $lastFailure"
}
[pscustomobject]@{
  adapterId = [string]$selectedAdapter.ifIndex
  bytesReceived = [uint64]$stats.ReceivedBytes
  bytesSent = [uint64]$stats.SentBytes
  packetsReceived = [uint64]$stats.ReceivedUnicastPackets
  packetsSent = [uint64]$stats.SentUnicastPackets
  errorsIn = [uint32]$stats.ReceivedPacketErrors
  errorsOut = [uint32]$stats.OutboundPacketErrors
  timestampMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Compress
"#.replace("__NETSCOPE_REQUESTED_ID__", &script_id);
        let json = crate::windows_utils::run_powershell(&script)?;
        serde_json::from_str::<Self>(&json)
            .map_err(|error| format!("Invalid interface counters JSON: {error}"))
    }
}
