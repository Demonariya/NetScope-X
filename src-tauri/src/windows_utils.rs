//! Helpers for querying live Windows networking APIs without opening a console window.

#[cfg(windows)]
pub fn run_powershell_elevated(script: &str) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let result_path = std::env::temp_dir().join(format!(
        "netscope-firewall-{}-{nonce}.json",
        std::process::id()
    ));
    let result_path = result_path.to_string_lossy().to_string();
    let ps_path = result_path.replace("'", "''");
    let inner_script = format!(
        "$ErrorActionPreference = 'Stop'; try {{\n{script}\n[System.IO.File]::WriteAllText('{ps_path}', (ConvertTo-Json -Compress -InputObject @{{ success = $true; error = '' }}), [System.Text.UTF8Encoding]::new($false)); exit 0\n}} catch {{ [System.IO.File]::WriteAllText('{ps_path}', (ConvertTo-Json -Compress -InputObject @{{ success = $false; error = [string]$_.Exception.Message }}), [System.Text.UTF8Encoding]::new($false)); exit 1 }}",
    );
    let mut utf16_bytes = Vec::with_capacity(inner_script.len() * 2);
    for unit in inner_script.encode_utf16() {
        utf16_bytes.extend_from_slice(&unit.to_le_bytes());
    }
    let encoded_child = STANDARD.encode(utf16_bytes);
    let outer_script = format!(
        "$ErrorActionPreference = 'Stop'; $encodedChild = '{encoded_child}'; $resultPath = '{ps_path}'; $childArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedChild); try {{ $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $childArgs -Verb RunAs -Wait -PassThru -WindowStyle Hidden }} catch {{ throw ('Administrator approval was cancelled or elevation failed: ' + $_.Exception.Message) }}; if (-not (Test-Path -LiteralPath $resultPath)) {{ throw 'Elevated firewall operation did not return a result.' }}; $payload = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json; Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue; if ($child.ExitCode -ne 0 -or -not $payload.success) {{ throw ('Elevated firewall operation failed: ' + [string]$payload.error) }}; Write-Output 'success'",
    );
    run_powershell_with_timeout(&outer_script, Duration::from_secs(180))
}

#[cfg(not(windows))]
pub fn run_powershell_elevated(_script: &str) -> Result<String, String> {
    Err("Windows Firewall operations are only available in the Windows desktop build.".to_string())
}

#[cfg(windows)]
fn run_powershell_with_timeout(
    script: &str,
    timeout: std::time::Duration,
) -> Result<String, String> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let wrapped = format!(
        "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; {}",
        script
    );

    let mut child = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ])
        .arg(wrapped)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to start Windows PowerShell: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture Windows PowerShell stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not capture Windows PowerShell stderr.".to_string())?;

    let stdout_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        let mut reader = stdout;
        reader.read_to_end(&mut buffer).map(|_| buffer)
    });
    let stderr_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        let mut reader = stderr;
        reader.read_to_end(&mut buffer).map(|_| buffer)
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!(
                    "Windows PowerShell query timed out after {} seconds.",
                    timeout.as_secs()
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!("Could not monitor Windows PowerShell: {error}"));
            }
        }
    };

    let stdout = stdout_reader
        .join()
        .map_err(|_| "PowerShell stdout reader stopped unexpectedly.".to_string())?
        .map_err(|error| format!("Could not read PowerShell stdout: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "PowerShell stderr reader stopped unexpectedly.".to_string())?
        .map_err(|error| format!("Could not read PowerShell stderr: {error}"))?;

    if status.success() {
        Ok(String::from_utf8_lossy(&stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&stdout).trim().to_string();
        Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("PowerShell exited with status {status}")
        })
    }
}

#[cfg(windows)]
pub fn run_powershell(script: &str) -> Result<String, String> {
    run_powershell_with_timeout(script, std::time::Duration::from_secs(15))
}

#[cfg(not(windows))]
pub fn run_powershell(_script: &str) -> Result<String, String> {
    Err("Live Windows system telemetry is only available in the Windows desktop build.".to_string())
}
