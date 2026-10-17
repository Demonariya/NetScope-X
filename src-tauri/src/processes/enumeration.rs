use crate::monitoring::etw::EtwSessionManager;
use crate::network::connections::SocketConnectionRecord;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessNetworkUsage {
    pub pid: u32,
    pub name: String,
    pub friendly_name: String,
    pub exe_name: String,
    pub full_path: String,
    pub icon: String,
    /// Per-process values are only considered available while the ETW session is active.
    pub download_bps: u64,
    pub upload_bps: u64,
    pub session_download_bytes: u64,
    pub session_upload_bytes: u64,
    pub total_bytes: u64,
    pub connection_count: u32,
    pub status: String,
    pub is_blocked: bool,
    #[serde(default)]
    pub traffic_available: bool,
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

#[derive(Default)]
struct ProcessTrafficSample {
    last_download_total: u64,
    last_upload_total: u64,
    last_sample_ms: u64,
    download_bps: u64,
    upload_bps: u64,
    history: Vec<SpeedSample>,
}

static PROCESS_SAMPLES: OnceLock<Mutex<HashMap<u32, ProcessTrafficSample>>> = OnceLock::new();

fn apply_etw_traffic_samples(processes: &mut [ProcessNetworkUsage]) -> Result<(), String> {
    let active_pids: HashSet<u32> = processes.iter().map(|process| process.pid).collect();
    EtwSessionManager::retain_active_processes(&active_pids);
    let totals = EtwSessionManager::process_byte_totals();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let mut previous = PROCESS_SAMPLES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Per-process network sample state is unavailable.".to_string())?;
    previous.retain(|pid, _| active_pids.contains(pid));
    let traffic_available = EtwSessionManager::is_active();

    for process in processes {
        let (download_total, upload_total) =
            totals.get(&process.pid).copied().unwrap_or_default();
        let sample = previous.entry(process.pid).or_default();
        let elapsed_ms = now_ms.saturating_sub(sample.last_sample_ms);

        if sample.last_sample_ms > 0 && elapsed_ms > 0 {
            sample.download_bps = download_total
                .saturating_sub(sample.last_download_total)
                .saturating_mul(1000)
                .checked_div(elapsed_ms)
                .unwrap_or(0);
            sample.upload_bps = upload_total
                .saturating_sub(sample.last_upload_total)
                .saturating_mul(1000)
                .checked_div(elapsed_ms)
                .unwrap_or(0);
        } else {
            sample.download_bps = 0;
            sample.upload_bps = 0;
        }

        sample.last_download_total = download_total;
        sample.last_upload_total = upload_total;
        sample.last_sample_ms = now_ms;
        sample.history.push(SpeedSample {
            time: now_ms,
            down: sample.download_bps,
            up: sample.upload_bps,
        });
        if sample.history.len() > 120 {
            let excess = sample.history.len() - 120;
            sample.history.drain(0..excess);
        }

        process.download_bps = sample.download_bps;
        process.upload_bps = sample.upload_bps;
        process.session_download_bytes = download_total;
        process.session_upload_bytes = upload_total;
        process.total_bytes = download_total.saturating_add(upload_total);
        process.traffic_available = traffic_available;
        process.recent_speed_history.clone_from(&sample.history);
    }

    Ok(())
}

impl ProcessNetworkUsage {
    /// Enumerate live Windows processes, their current TCP/UDP endpoints, firewall state,
    /// and ETW-attributed byte totals. Per-process values are marked unavailable if ETW fails.
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
$blockedPrograms = @{}
try {
  Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Enabled -eq 'True' -and
      $_.Direction -eq 'Outbound' -and
      $_.Action -eq 'Block' -and
      $_.DisplayName -like 'NetScopeX-Blocked-*-out'
    } |
    ForEach-Object {
      if ($_.DisplayName -match '^NetScopeX-Blocked-(\d+)-out$') {
        $blockedPids[$Matches[1]] = $true
      }
      try {
        $filter = $_ | Get-NetFirewallApplicationFilter -ErrorAction Stop
        $program = [string]$filter.Program
        if (-not [string]::IsNullOrWhiteSpace($program) -and $program -ne 'Any') {
          $blockedPrograms[$program.ToLowerInvariant()] = $true
        }
      } catch {}
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

    $isBlocked = $blockedPids.ContainsKey($key)
    if (-not $isBlocked -and -not [string]::IsNullOrWhiteSpace($path)) {
      $isBlocked = $blockedPrograms.ContainsKey($path.ToLowerInvariant())
    }

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
      isBlocked = [bool]$isBlocked
      trafficAvailable = $false
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

        apply_etw_traffic_samples(&mut processes)?;

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
