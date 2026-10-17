use crate::monitoring::collector::MonitoringCollector;
use crate::processes::enumeration::ProcessNetworkUsage;
use crate::windows_utils::run_powershell_elevated;
use tauri::command;

#[command]
pub fn get_process_network_usage() -> Result<Vec<ProcessNetworkUsage>, String> {
    ProcessNetworkUsage::enumerate_monitored_processes()
}

#[command]
pub fn reset_process_stats(pid: Option<u32>) -> Result<bool, String> {
    match pid {
        Some(0) => {
            return Err("PID 0 cannot be reset as an application process.".to_string());
        }
        Some(pid) => ProcessNetworkUsage::reset_traffic_counters(Some(pid))?,
        None => {
            MonitoringCollector::reset_session_counters()?;
            ProcessNetworkUsage::reset_traffic_counters(None)?;
        }
    }
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
$legacyRuleOut = "NetScopeX-Blocked-$targetPid-out"
$legacyRuleIn = "NetScopeX-Blocked-$targetPid-in"
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction Stop
if ($null -eq $process) {{ throw "Process PID $targetPid is no longer running." }}
$program = [string]$process.ExecutablePath
if ([string]::IsNullOrWhiteSpace($program) -or -not (Test-Path -LiteralPath $program -PathType Leaf)) {{
  throw "Windows did not provide a valid executable path for PID $targetPid."
}}
$program = [System.IO.Path]::GetFullPath($program)
$hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
$programHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($program.ToLowerInvariant()))).Replace('-', '').ToLowerInvariant()
$hashAlgorithm.Dispose()
$ruleOut = "NetScopeX-Blocked-$programHash-out"
$ruleIn = "NetScopeX-Blocked-$programHash-in"
if (-not {block_value}) {{
  Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $legacyRuleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $legacyRuleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  [pscustomobject]@{{ success = $true }} | ConvertTo-Json -Compress
}} else {{
  try {{
    Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Get-NetFirewallRule -DisplayName $legacyRuleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Get-NetFirewallRule -DisplayName $legacyRuleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleOut -Direction Outbound -Program $program -Action Block -Profile Any -Enabled True -ErrorAction Stop | Out-Null
    New-NetFirewallRule -DisplayName $ruleIn -Direction Inbound -Program $program -Action Block -Profile Any -Enabled True -ErrorAction Stop | Out-Null
    [pscustomobject]@{{ success = $true }} | ConvertTo-Json -Compress
  }} catch {{
    Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    throw
  }}
}}
"#,
        block_value = if block { "$true" } else { "$false" }
    );
    let output = run_powershell_elevated(&script)
        .map_err(|error| format!("Windows Firewall operation failed: {error}"))?;
    if output.trim() == "success" {
        Ok(true)
    } else {
        Err(format!(
            "Windows Firewall operation did not complete successfully: {output}"
        ))
    }
}
