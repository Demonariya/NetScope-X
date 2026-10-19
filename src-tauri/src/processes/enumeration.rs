use crate::monitoring::etw::EtwSessionManager;
use crate::network::connections::SocketConnectionRecord;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
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
    baseline_download_total: u64,
    baseline_upload_total: u64,
    last_download_total: u64,
    last_upload_total: u64,
    last_sample_ms: u64,
    download_bps: u64,
    upload_bps: u64,
    history: Vec<SpeedSample>,
}

static PROCESS_SAMPLES: OnceLock<Mutex<HashMap<u32, ProcessTrafficSample>>> = OnceLock::new();

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecutableIconRecord {
    path: String,
    icon_base64: String,
}

static PROCESS_ICON_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static ICON_EXTRACTION_DISABLED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
fn extract_executable_icons(paths: &[String]) -> Result<Vec<ExecutableIconRecord>, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    let json = serde_json::to_vec(paths).map_err(|error| {
        format!("Could not encode executable paths for icon extraction: {error}")
    })?;
    let encoded_paths = STANDARD.encode(json);
    // Replace a marker rather than interpolating a PowerShell script with Rust
    // format!; PowerShell's braces must remain untouched.
    let script = r#"
$ErrorActionPreference = 'Stop'
$pathJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('__ENCODED_PATHS__'))
$paths = @($pathJson | ConvertFrom-Json)
try { Add-Type -AssemblyName System.Drawing -ErrorAction Stop } catch {}
$rows = @(
  foreach ($rawPath in $paths) {
    $path = [string]$rawPath
    $iconBase64 = ''
    try {
      if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
        if ($null -ne $icon) {
          $bitmap = $icon.ToBitmap()
          try {
            $stream = New-Object System.IO.MemoryStream
            try {
              $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
              $iconBase64 = [System.Convert]::ToBase64String($stream.ToArray())
            } finally {
              $stream.Dispose()
            }
          } finally {
            $bitmap.Dispose()
            $icon.Dispose()
          }
        }
      }
    } catch {
      $iconBase64 = ''
    }
    [pscustomobject]@{ path = $path; iconBase64 = $iconBase64 }
  }
)
ConvertTo-Json -InputObject @($rows) -Depth 3 -Compress
"#
    .replace("__ENCODED_PATHS__", &encoded_paths);

    let output = crate::windows_utils::run_powershell(&script)?;
    serde_json::from_str::<Vec<ExecutableIconRecord>>(&output)
        .map_err(|error| format!("Invalid executable icon JSON: {error}"))
}

fn populate_process_icons(processes: &mut [ProcessNetworkUsage]) {
    let mut missing_paths = Vec::new();
    let mut seen = HashSet::new();

    {
        let cache = match PROCESS_ICON_CACHE
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
        {
            Ok(cache) => cache,
            Err(_) => return,
        };

        for process in processes.iter() {
            let path = process.full_path.trim();
            if path.is_empty() {
                continue;
            }
            let key = path.to_lowercase();
            if !cache.contains_key(&key) && seen.insert(key) {
                missing_paths.push(path.to_string());
            }
        }
    }

    #[cfg(windows)]
    if !missing_paths.is_empty() && !ICON_EXTRACTION_DISABLED.load(Ordering::Relaxed) {
        match extract_executable_icons(&missing_paths) {
            Ok(records) => {
                if let Ok(mut cache) = PROCESS_ICON_CACHE
                    .get_or_init(|| Mutex::new(HashMap::new()))
                    .lock()
                {
                    for path in &missing_paths {
                        cache.entry(path.to_lowercase()).or_insert_with(String::new);
                    }
                    for record in records {
                        cache.insert(record.path.to_lowercase(), record.icon_base64);
                    }
                }
            }
            Err(error) => {
                ICON_EXTRACTION_DISABLED.store(true, Ordering::Relaxed);
                eprintln!("NetScope X executable icons are unavailable: {error}");
            }
        }
    }

    #[cfg(not(windows))]
    let _ = missing_paths;

    if let Ok(cache) = PROCESS_ICON_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        for process in processes {
            if let Some(icon_base64) = cache.get(&process.full_path.to_lowercase()) {
                process.icon = if icon_base64.is_empty() {
                    String::new()
                } else {
                    format!("data:image/png;base64,{icon_base64}")
                };
            }
        }
    }
}

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
        let (download_total, upload_total) = totals.get(&process.pid).copied().unwrap_or_default();
        let sample = previous.entry(process.pid).or_default();
        if sample.last_sample_ms == 0 {
            sample.baseline_download_total = download_total;
            sample.baseline_upload_total = upload_total;
        }
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
        process.session_download_bytes =
            download_total.saturating_sub(sample.baseline_download_total);
        process.session_upload_bytes = upload_total.saturating_sub(sample.baseline_upload_total);
        process.total_bytes = process
            .session_download_bytes
            .saturating_add(process.session_upload_bytes);
        process.traffic_available = traffic_available;
        process.recent_speed_history.clone_from(&sample.history);
    }

    Ok(())
}

impl ProcessNetworkUsage {
    /// Reset measured per-process byte baselines. A PID reset affects only that PID;
    /// resetting all processes clears the counters for all currently tracked PIDs.
    pub fn reset_traffic_counters(pid: Option<u32>) -> Result<(), String> {
        let totals = EtwSessionManager::process_byte_totals();
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let mut samples = PROCESS_SAMPLES
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .map_err(|_| "Per-process network sample state is unavailable.".to_string())?;

        match pid {
            Some(pid) => {
                let (download_total, upload_total) = totals.get(&pid).copied().unwrap_or_default();
                let sample = samples.entry(pid).or_default();
                sample.baseline_download_total = download_total;
                sample.baseline_upload_total = upload_total;
                sample.last_download_total = download_total;
                sample.last_upload_total = upload_total;
                sample.last_sample_ms = now_ms;
                sample.download_bps = 0;
                sample.upload_bps = 0;
                sample.history.clear();
            }
            None => {
                for (pid, sample) in samples.iter_mut() {
                    let (download_total, upload_total) = totals
                        .get(pid)
                        .copied()
                        .unwrap_or((sample.last_download_total, sample.last_upload_total));
                    sample.baseline_download_total = download_total;
                    sample.baseline_upload_total = upload_total;
                    sample.last_download_total = download_total;
                    sample.last_upload_total = upload_total;
                    sample.last_sample_ms = now_ms;
                    sample.download_bps = 0;
                    sample.upload_bps = 0;
                    sample.history.clear();
                }
            }
        }
        Ok(())
    }

    /// Enumerate live Windows processes, their current TCP/UDP endpoints, firewall state,
    /// and ETW-attributed byte totals. Per-process values are marked unavailable if ETW fails.
    pub fn enumerate_monitored_processes() -> Result<Vec<Self>, String> {
        let script = r#"
$ErrorActionPreference = 'Stop'
$blockedPids = @{}
$blockedPrograms = @{}
$rules = @(
  Get-NetFirewallRule -ErrorAction Stop |
    Where-Object {
      $_.Enabled -eq 'True' -and
      $_.Direction -eq 'Outbound' -and
      $_.Action -eq 'Block' -and
      $_.DisplayName -like 'NetScopeX-Blocked-*-out'
    }
)
foreach ($rule in $rules) {
  $displayName = [string]$rule.DisplayName
  if ($displayName -match '^NetScopeX-Blocked-(\d+)-out$') {
    $blockedPids[$Matches[1]] = $true
  }
  $filter = $rule | Get-NetFirewallApplicationFilter -ErrorAction Stop
  foreach ($entry in @($filter)) {
    $program = [string]$entry.Program
    if (-not [string]::IsNullOrWhiteSpace($program) -and $program -ne 'Any') {
      $blockedPrograms[$program.ToLowerInvariant()] = $true
    }
  }
}

$rows = @(
  Get-Process -ErrorAction Stop | ForEach-Object {
    $process = $_
    $key = [string]$process.Id
    $path = ''
    try {
      $path = [string]$process.Path
    } catch {}

    $start = [long]0
    try {
      $startTime = $process.StartTime.ToUniversalTime()
      $start = ([DateTimeOffset]$startTime).ToUnixTimeMilliseconds()
    } catch {}

    $isBlocked = $blockedPids.ContainsKey($key)
    if (-not $isBlocked -and -not [string]::IsNullOrWhiteSpace($path)) {
      $isBlocked = $blockedPrograms.ContainsKey($path.ToLowerInvariant())
    }

    $friendlyName = [string]$process.ProcessName
    if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
      try {
        $fileInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($path)
        if (-not [string]::IsNullOrWhiteSpace($fileInfo.FileDescription)) {
          $friendlyName = [string]$fileInfo.FileDescription
        } elseif (-not [string]::IsNullOrWhiteSpace($fileInfo.ProductName)) {
          $friendlyName = [string]$fileInfo.ProductName
        }
      } catch {}
    }

    [pscustomobject]@{
      pid = [uint32]$process.Id
      name = "$($process.ProcessName).exe"
      friendlyName = $friendlyName
      exeName = "$($process.ProcessName).exe"
      fullPath = $path
      icon = ''
      downloadBps = [uint64]0
      uploadBps = [uint64]0
      sessionDownloadBytes = [uint64]0
      sessionUploadBytes = [uint64]0
      totalBytes = [uint64]0
      connectionCount = [uint32]0
      status = 'idle'
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

        populate_process_icons(&mut processes);

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
