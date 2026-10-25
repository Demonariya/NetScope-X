# ==============================================================================
# NetScope X — Automated Windows Installer Build Script
# ==============================================================================
# This script compiles the frontend, runs cargo release optimizations,
# and generates production-ready installer packages (.exe via NSIS and .msi).
# ==============================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NetScope X — Windows Installer Build  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Verify Node.js and Rust environments
Write-Host "`n[1/5] Checking Node.js and Rust environments..." -ForegroundColor Yellow
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm was not found in PATH. Please install Node.js (https://nodejs.org)."
    exit 1
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "cargo was not found in PATH. Please install Rust and Cargo (https://rustup.rs)."
    exit 1
}
Write-Host "  Node.js & Cargo detected." -ForegroundColor Green

# 2. Check and Install Node Dependencies
Write-Host "`n[2/5] Checking node_modules and dependencies..." -ForegroundColor Yellow
$viteCmd = "node_modules/.bin/vite.cmd"
$viteExe = "node_modules/.bin/vite"

if (-not (Test-Path "node_modules") -or (-not (Test-Path $viteCmd) -and -not (Test-Path $viteExe))) {
    Write-Host "  Dependencies not found or incomplete. Installing npm packages..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Retrying npm install with --legacy-peer-deps..." -ForegroundColor Yellow
        npm install --legacy-peer-deps
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm install failed. Please check your internet connection or run 'npm install' manually."
        exit $LASTEXITCODE
    }
    Write-Host "  Dependencies installed successfully." -ForegroundColor Green
} else {
    Write-Host "  Dependencies are already installed." -ForegroundColor Green
}

# 3. Build Frontend Assets
Write-Host "`n[3/5] Compiling frontend (Vite + React + Tailwind)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Retrying with npx vite build..." -ForegroundColor Yellow
    npx vite build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend compilation failed. Please run 'npm install' to ensure Vite is installed."
        exit $LASTEXITCODE
    }
}
Write-Host "  Frontend compiled successfully to dist/." -ForegroundColor Green

# 4. Build Tauri Installer Packages
Write-Host "`n[4/5] Compiling Rust binaries and bundling installer..." -ForegroundColor Yellow
npx tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri installer build failed."
    exit $LASTEXITCODE
}

# 5. Locate Output Files
Write-Host "`n[5/5] Locating generated installer packages..." -ForegroundColor Yellow
$nsisDir = "src-tauri/target/release/bundle/nsis"
$msiDir = "src-tauri/target/release/bundle/msi"

$found = $false

if (Test-Path $nsisDir) {
    $exeInstallers = Get-ChildItem -Path $nsisDir -Filter "*.exe"
    foreach ($exe in $exeInstallers) {
        $found = $true
        Write-Host "  [EXE Setup] $($exe.FullName)" -ForegroundColor Green
        Write-Host "  Size: $([math]::Round($exe.Length / 1MB, 2)) MB" -ForegroundColor DarkGray
    }
}

if (Test-Path $msiDir) {
    $msiInstallers = Get-ChildItem -Path $msiDir -Filter "*.msi"
    foreach ($msi in $msiInstallers) {
        $found = $true
        Write-Host "  [MSI Package] $($msi.FullName)" -ForegroundColor Green
        Write-Host "  Size: $([math]::Round($msi.Length / 1MB, 2)) MB" -ForegroundColor DarkGray
    }
}

if ($found) {
    Write-Host "`nInstaller compilation complete! You can distribute the .exe or .msi file." -ForegroundColor Cyan
} else {
    Write-Host "`nBuild succeeded. Check 'src-tauri/target/release/bundle' for output files." -ForegroundColor Yellow
}
