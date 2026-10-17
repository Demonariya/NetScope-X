use crate::monitoring::collector::MonitoringCollector;
use crate::processes::enumeration::ProcessNetworkUsage;
use crate::windows_utils::run_powershell;
use tauri::command;

#[command]
pub fn get_process_network_usage() -> Result<Vec<ProcessNetworkUsage>, String> {
    ProcessNetworkUsage::enumerate_monitored_processes()
}

#[command]
pub fn reset_process_stats(pid: Option<u32>) -> Result<bool, String> {
    if let Some(pid) = pid {
        return Err(format!(
            "Per-process byte counters are not being collected yet; cannot reset PID {pid} statistics."
        ));
    }
    MonitoringCollector::reset_session_counters()?;
    Ok(true)
}

/// Add or remove Windows Firewall rules for the real executable associated with a live PID.
/// Windows requires an elevated process for firewall rule changes; failures are returned to the UI.
#[command]
pub fn toggle_process_block(
    exe_name: String,
    block: bool,
    pid: Option<u32>,
) -> Result<bool, String> {
    let process_id = pid.ok_or_else(|| {
        "A live process ID is required to add or remove a firewall rule.".to_string()
    })?;
    if process_id == 0 {
        return Err("PID 0 cannot be blocked by application path.".to_string());
    }
    if exe_name.trim().is_empty() {
        return Err("The process executable name is missing.".to_string());
    }

    let script = format!(
        r#"
$targetPid = {process_id}
$ruleOut = "NetScopeX-Blocked-$targetPid-out"
$ruleIn = "NetScopeX-Blocked-$targetPid-in"
if (-not {block_value}) {{
  Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
  Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
  [pscustomobject]@{{ success = $true }} | ConvertTo-Json -Compress
  exit 0
}}
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction Stop
if ($null -eq $process) {{ throw "Process PID $targetPid is no longer running." }}
$program = [string]$process.ExecutablePath
if ([string]::IsNullOrWhiteSpace($program) -or -not (Test-Path -LiteralPath $program -PathType Leaf)) {{
  throw "Windows did not provide a valid executable path for PID $targetPid."
}}
try {{
  Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
  Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
  New-NetFirewallRule -DisplayName $ruleOut -Direction Outbound -Program $program -Action Block -Profile Any -Enabled True -ErrorAction Stop | Out-Null
  New-NetFirewallRule -DisplayName $ruleIn -Direction Inbound -Program $program -Action Block -Profile Any -Enabled True -ErrorAction Stop | Out-Null
  [pscustomobject]@{{ success = $true }} | ConvertTo-Json -Compress
}} catch {{
  Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  throw
}}
"#,
        block_value = if block { "$true" } else { "$false" }
    );
    let output = run_powershell(&script).map_err(|error| {
        if error.to_lowercase().contains("access is denied")
            || error.to_lowercase().contains("access denied")
        {
            "Windows Firewall access was denied. Close NetScope X and relaunch it with Run as administrator, then retry."
                .to_string()
        } else {
            format!("Windows Firewall operation failed: {error}")
        }
    })?;
    let response: serde_json::Value = serde_json::from_str(&output)
        .map_err(|error| format!("Invalid Windows Firewall response: {error}"))?;
    if response.get("success").and_then(serde_json::Value::as_bool) == Some(true) {
        Ok(true)
    } else {
        Err("Windows Firewall did not confirm the requested rule change.".to_string())
    }
}
