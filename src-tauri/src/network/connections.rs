use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketConnectionRecord {
    pub id: String,
    pub protocol: String,
    pub local_address: String,
    pub local_port: u16,
    pub remote_address: String,
    pub remote_port: u16,
    pub state: String,
    pub pid: u32,
    pub process_name: String,
    /// Windows TCP/UDP endpoint tables do not expose per-socket byte counters.
    /// None means unavailable; it must not be interpreted as measured zero traffic.
    pub bytes_sent: Option<u64>,
    pub bytes_received: Option<u64>,
}

impl SocketConnectionRecord {
    /// Reads currently active TCP connections and bound UDP endpoints from Windows.
    pub fn get_active_connections() -> Result<Vec<Self>, String> {
        let script = r#"
$processNames = @{}
Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
  $processNames[[string]$_.Id] = "$($_.ProcessName).exe"
}
$tcpRows = @(
  Get-NetTCPConnection -ErrorAction SilentlyContinue | ForEach-Object {
    $pidValue = [int]$_.OwningProcess
    $key = [string]$pidValue
    $processName = if ($processNames.ContainsKey($key)) { $processNames[$key] } else { "PID $pidValue" }
    $state = switch ([string]$_.State) {
      'Established' { 'ESTABLISHED' }
      'Listen' { 'LISTENING' }
      'CloseWait' { 'CLOSE_WAIT' }
      'TimeWait' { 'TIME_WAIT' }
      'SynSent' { 'SYN_SENT' }
      'SynReceived' { 'SYN_RCVD' }
      'FinWait1' { 'FIN_WAIT_1' }
      'FinWait2' { 'FIN_WAIT_2' }
      'LastAck' { 'LAST_ACK' }
      default { ([string]$_.State).ToUpperInvariant() }
    }
    [pscustomobject]@{
      id = "tcp-$pidValue-$($_.LocalAddress)-$($_.LocalPort)-$($_.RemoteAddress)-$($_.RemotePort)"
      protocol = 'TCP'
      localAddress = [string]$_.LocalAddress
      localPort = [uint16]$_.LocalPort
      remoteAddress = [string]$_.RemoteAddress
      remotePort = [uint16]$_.RemotePort
      state = $state
      pid = $pidValue
      processName = $processName
      bytesSent = $null
      bytesReceived = $null
    }
  }
)
$udpRows = @(
  Get-NetUDPEndpoint -ErrorAction SilentlyContinue | ForEach-Object {
    $pidValue = [int]$_.OwningProcess
    $key = [string]$pidValue
    $processName = if ($processNames.ContainsKey($key)) { $processNames[$key] } else { "PID $pidValue" }
    [pscustomobject]@{
      id = "udp-$pidValue-$($_.LocalAddress)-$($_.LocalPort)"
      protocol = 'UDP'
      localAddress = [string]$_.LocalAddress
      localPort = [uint16]$_.LocalPort
      remoteAddress = ''
      remotePort = [uint16]0
      state = 'LISTENING'
      pid = $pidValue
      processName = $processName
      bytesSent = $null
      bytesReceived = $null
    }
  }
)
$rows = @($tcpRows) + @($udpRows)
ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress
"#;
        let json = crate::windows_utils::run_powershell(script)?;
        serde_json::from_str::<Vec<Self>>(&json)
            .map_err(|error| format!("Invalid Windows connection JSON: {error}"))
    }
}
