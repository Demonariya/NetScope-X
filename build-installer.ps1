# ==============================================================================
# NetScope X — Automated Windows Installer Build Script
# ==============================================================================
# This script compiles the frontend, runs cargo release optimizations,
# and generates production-ready installer packages (.exe via NSIS and .msi).
# ==============================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NetScope X — Windows Installer Build  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Verify Node.js and NPM
Write-Host "`n[1/4] Checking Node.js and Rust environments..." -ForegroundColor Yellow
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm was not found in PATH. Please install Node.js."
    exit 1
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "cargo was not found in PATH. Please install Rust and Cargo."
    exit 1
}

# 2. Build Frontend Assets
Write-Host "`n[2/4] Compiling frontend (Vite + React + Tailwind)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend compilation failed."
    exit $LASTEXITCODE
}
Write-Host "Frontend compiled successfully." -ForegroundColor Green

# 3. Build Tauri Installer Packages
Write-Host "`n[3/4] Compiling Rust binaries and bundling installer..." -ForegroundColor Yellow
npx tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri installer build failed."
    exit $LASTEXITCODE
}

# 4. Locate Output Files
Write-Host "`n[4/4] Locating generated installer packages..." -ForegroundColor Yellow
$nsisDir = "src-tauri/target/release/bundle/nsis"
$msiDir = "src-tauri/target/release/bundle/msi"

if (Test-Path $nsisDir) {
    $exeInstallers = Get-ChildItem -Path $nsisDir -Filter "*.exe"
    foreach ($exe in $exeInstallers) {
        Write-Host "  [EXE Setup] $($exe.FullName)" -ForegroundColor Green
        Write-Host "  Size: $([math]::Round($exe.Length / 1MB, 2)) MB" -ForegroundColor DarkGray
    }
}

if (Test-Path $msiDir) {
    $msiInstallers = Get-ChildItem -Path $msiDir -Filter "*.msi"
    foreach ($msi in $msiInstallers) {
        Write-Host "  [MSI Package] $($msi.FullName)" -ForegroundColor Green
        Write-Host "  Size: $([math]::Round($msi.Length / 1MB, 2)) MB" -ForegroundColor DarkGray
    }
}

Write-Host "`nInstaller compilation complete! You can distribute the .exe or .msi file." -ForegroundColor Cyan
