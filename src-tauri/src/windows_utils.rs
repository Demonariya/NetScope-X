/// Helpers for querying live Windows networking APIs without opening a console window.

#[cfg(windows)]
pub fn run_powershell_elevated(script: &str) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use std::time::{SystemTime, UNIX_EPOCH};

    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let result_path = std::env::temp_dir().join(format!("netscope-firewall-{}-{nonce}.json", std::process::id()));
    let result_path = result_path.to_string_lossy().to_string();
    let ps_path = result_path.replace("'", "''");
    let inner_script = format!(
        "$ErrorActionPreference = 'Stop'; try {{\n{script}\n[System.IO.File]::WriteAllText('{ps_path}', (ConvertTo-Json -Compress -InputObject @{{ success = $true; error = '' }}), [System.Text.UTF8Encoding]::new($false)); exit 0\n}} catch {{ [System.IO.File]::WriteAllText('{ps_path}', (ConvertTo-Json -Compress -InputObject @{{ success = $false; error = [string]$_.Exception.Message }}), [System.Text.UTF8Encoding]::new($false)); exit 1 }}"
    );
    let mut utf16_bytes = Vec::with_capacity(inner_script.len() * 2);
    for unit in inner_script.encode_utf16() { utf16_bytes.extend_from_slice(&unit.to_le_bytes()); }
    let encoded_child = STANDARD.encode(utf16_bytes);
    let outer_script = format!(
        "$ErrorActionPreference = 'Stop'; $encodedChild = '{encoded_child}'; $resultPath = '{ps_path}'; $childArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedChild); try {{ $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $childArgs -Verb RunAs -Wait -PassThru -WindowStyle Hidden }} catch {{ throw ('Administrator approval was cancelled or elevation failed: ' + $_.Exception.Message) }}; if (-not (Test-Path -LiteralPath $resultPath)) {{ throw 'Elevated firewall operation did not return a result.' }}; $payload = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json; Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue; if ($child.ExitCode -ne 0 -or -not $payload.success) {{ throw ('Elevated firewall operation failed: ' + [string]$payload.error) }}; Write-Output 'success'"
    );
    run_powershell(&outer_script)
}

#[cfg(not(windows))]
pub fn run_powershell_elevated(_script: &str) -> Result<String, String> {
    Err("Windows Firewall operations are only available in the Windows desktop build.".to_string())
}
#[cfg(windows)]
pub fn run_powershell(script: &str) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let wrapped = format!(
        "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; {}",
        script
    );

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ])
        .arg(wrapped)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Unable to start Windows PowerShell: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("PowerShell exited with status {}", output.status)
        })
    }
}

#[cfg(not(windows))]
pub fn run_powershell(_script: &str) -> Result<String, String> {
    Err("Live Windows system telemetry is only available in the Windows desktop build.".to_string())
}
