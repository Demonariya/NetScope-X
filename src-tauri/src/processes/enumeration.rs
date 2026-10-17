use crate::network::connections::SocketConnectionRecord;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessNetworkUsage {
    pub pid: u32,
    pub name: String,
    pub friendly_name: String,
    pub exe_name: String,
    pub full_path: String,
    pub icon: String,
    /// Per-process byte rates remain zero until a real ETW/WFP attribution collector is available.
    pub download_bps: u64,
    pub upload_bps: u64,
    pub session_download_bytes: u64,
    pub session_upload_bytes: u64,
    pub total_bytes: u64,
    pub connection_count: u32,
    pub status: String,
    pub is_blocked: bool,
    pub start_time: u64,
    pub recent_speed_history: Vec<SpeedSample>,
    #[serde(default)]
    pub connections: Vec<SocketConnectionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSample {
    pub time: u64,
    pub down: u64,
    pub up: u64,
}

impl ProcessNetworkUsage {
    /// Enumerates live Windows processes and joins each PID to current TCP/UDP endpoints.
    /// Per-process traffic byte rates are not fabricated; they remain zero until ETW/WFP is implemented.
    pub fn enumerate_monitored_processes() -> Result<Vec<Self>, String> {
        let script = r#"
$connectionCounts = @{}
try {
  Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Group-Object -Property OwningProcess |
    ForEach-Object {
      $connectionCounts[[string]$_.Name] = [int]$_.Count
    }
} catch {}
try {
  Get-NetUDPEndpoint -ErrorAction SilentlyContinue |
    Group-Object -Property OwningProcess |
    ForEach-Object {
      $key = [string]$_.Name
      $current = 0
      if ($connectionCounts.ContainsKey($key)) {
        $current = [int]$connectionCounts[$key]
      }
      $connectionCounts[$key] = $current + [int]$_.Count
    }
} catch {}

$blockedPids = @{}
try {
  Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like 'NetScopeX-Blocked-*-out' -and $_.Enabled -eq 'True' } |
    ForEach-Object {
      if ($_.DisplayName -match '^NetScopeX-Blocked-(\d+)-out$') {
        $blockedPids[$Matches[1]] = $true
      }
    }
} catch {}

$rows = @(
  Get-Process -ErrorAction Stop | ForEach-Object {
    $process = $_
    $path = ''
    try {
      $path = [string]$process.Path
    } catch {}

    $key = [string]$process.Id
    $connectionCount = 0
    if ($connectionCounts.ContainsKey($key)) {
      $connectionCount = [int]$connectionCounts[$key]
    }

    $start = [long]0
    try {
      $startTime = $process.StartTime.ToUniversalTime()
      $start = ([DateTimeOffset]$startTime).ToUnixTimeMilliseconds()
    } catch {}

    [pscustomobject]@{
      pid = [uint32]$process.Id
      name = "$($process.ProcessName).exe"
      friendlyName = [string]$process.ProcessName
      exeName = "$($process.ProcessName).exe"
      fullPath = $path
      icon = ''
      downloadBps = [uint64]0
      uploadBps = [uint64]0
      sessionDownloadBytes = [uint64]0
      sessionUploadBytes = [uint64]0
      totalBytes = [uint64]0
      connectionCount = [uint32]$connectionCount
      status = if ($connectionCount -gt 0) { 'active' } else { 'idle' }
      isBlocked = [bool]$blockedPids.ContainsKey($key)
      startTime = $start
      recentSpeedHistory = @()
      connections = @()
    }
  }
)
ConvertTo-Json -InputObject @($rows) -Depth 5 -Compress
"#;

        let json = crate::windows_utils::run_powershell(script)?;
        let mut processes = serde_json::from_str::<Vec<Self>>(&json)
            .map_err(|error| format!("Invalid Windows process JSON: {error}"))?;

        let connections = SocketConnectionRecord::get_active_connections()?;
        for process in &mut processes {
            process.connections = connections
                .iter()
                .filter(|connection| connection.pid == process.pid)
                .cloned()
                .collect();
            process.connection_count = process.connections.len().min(u32::MAX as usize) as u32;
            if process.connection_count > 0 {
                process.status = "active".to_string();
            }
        }

        processes.sort_by(|left, right| {
            right
                .connection_count
                .cmp(&left.connection_count)
                .then_with(|| {
                    left.friendly_name
                        .to_lowercase()
                        .cmp(&right.friendly_name.to_lowercase())
                })
        });
        Ok(processes)
    }
}
