/// Helpers for querying live Windows networking APIs without opening a console window.
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
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"])
        .arg(wrapped)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Unable to start Windows PowerShell: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() { stderr } else if !stdout.is_empty() { stdout } else {
            format!("PowerShell exited with status {}", output.status)
        })
    }
}

#[cfg(not(windows))]
pub fn run_powershell(_script: &str) -> Result<String, String> {
    Err("Live Windows system telemetry is only available in the Windows desktop build.".to_string())
}
