# NetScope X — Strict 405×720 Portrait Windows Network Intelligence Suite

**NetScope X** is a high-performance Windows network monitoring suite engineered with a **strict 405 × 720 px, 9:16 portrait interface**, combining the precision of an enterprise diagnostics utility with the visual quality of a modern desktop telemetry console.

Featuring real-time **per-application bandwidth accounting**, working **Application Block & Unblock firewall controls**, Dark/Light/System theme modes, low-latency ping probing with latency sparklines, socket inspection, local persistence, and automated GitHub Actions CI/CD for Windows releases.

---

## 1. Strict 405 × 720 Portrait Architecture

In accordance with strict design requirements, NetScope X features **exactly one UI resolution: 405 × 720 pixels, portrait 9:16**:

- **Strict Fixed Resolution Canvas**:
  - The Tauri application window is locked to **405 × 720 logical pixels** (`minWidth: 405, maxWidth: 405, minHeight: 720, maxHeight: 720, resizable: false, maximizable: false`).
  - No alternative resolution modes, landscape layouts, or desktop dashboard modes.
  - The entire UI uses consistent, ergonomic vertical stacking with safe edge padding, bounded charts, independent scroll containers, and a dedicated bottom navigation bar.
  - High-density layouts fit smoothly inside 405 px width without horizontal overflow.

---

## 2. Core Functional Modules

1. **Per-Application Bandwidth Accounting & Firewall Blocking (`ApplicationsTab`)**
   - Direct correlation of network socket byte transfers with active Windows processes.
   - **Working Block & Unblock Controls**: Instant toggle of inbound and outbound network access with Windows Firewall rule emulation and persistence (`data/blocked_apps.json`).
   - Prominent **Blocked status badge** (red/amber) and zeroed bandwidth counters for blocked executables.
   - Filter pills: `All`, `Active`, `Blocked`.
   - Real-time download/upload speeds formatted with monospace tabular figures (`tabular-nums`).
   - Authentic Windows executable icons (Google Chrome, Microsoft Edge, Discord, Steam, Spotify, VS Code, Slack, OBS Studio, OneDrive, NT Kernel/System) with Windows Shell icon extraction fallback.
   - Deep inspection card displaying full executable file paths, session totals, active remote socket endpoints, and per-process reset actions.

2. **Quality, Latency & Ping Engine (`OverviewTab`)**
   - Auto-detection of network adapters (Wi-Fi 6E, 2.5GbE Ethernet, Virtual/Loopback).
   - Real-time Link Speed, Local IPv4, Gateway, MAC hardware address, and Wi-Fi signal percentage.
   - Live system-wide download and upload speed cards with session and daily totals.
   - Smooth real-time bandwidth area chart with 30s, 60s, and 5-minute timeframes.
   - **Repaired Ping Engine**: Latency (ms), Min/Max, Average, Jitter, Packet Loss, and status badge (`Optimal`, `Good`, `High`).
   - **Latency Sparkline**: Live area chart tracking the last 20 probe samples.
   - Quick target selection (`1.1.1.1`, `8.8.8.8`, `9.9.9.9`) plus direct probe form for custom hostnames or IPs.

3. **Appearance & Theme System (`SettingsTab`)**
   - Cleanly supports **Dark**, **Light**, and **System** theme modes.
   - Immediate live theme switching across all cards, navigation, title bar, and dialogs.
   - Theme persistence via `localStorage` and backend configuration (`data/settings.json`).
   - Accent color palette customization (Sky, Blue, Cyan, Indigo).

4. **Traffic Distribution & Analytics (`TrafficTab`)**
   - Transport layer protocol distribution (TCP stream vs. UDP media/voice).
   - Peak session throughput indicator and kernel ETW session state.
   - Hourly transferred volume bar chart with megabyte granularity.
   - Top bandwidth consumers ranking list with relative progress bars.

5. **Socket & Connection Inspector (`ConnectionsTab`)**
   - Portrait socket cards displaying Protocol (TCP/UDP), Process Name & PID, State (`ESTABLISHED`, `LISTENING`), and local/remote endpoints.
   - Filter by protocol (`ALL`, `TCP`, `UDP`) and socket state.
   - Instant one-click copy button for remote endpoints (`IP:Port`) with toast notification.

6. **Persistent History & Diagnostics (`HistoryTab`)**
   - Local persistence storing hourly and daily traffic records.
   - Date range filtering (`Today`, `7 Days`, `30 Days`, `All Time`).
   - Direct CSV and JSON export routes (`/api/export/csv`, `/api/export/json`).
   - Secure database pruning with confirmation dialog.

7. **System Tray Integration (`SystemTrayModal`)**
   - Native Windows system tray icon and interactive preview modal.
   - Real-time download/upload tooltip simulation.
   - Context actions: Open Window, Pause/Resume Monitoring, Open Settings, Minimize to Tray, Exit.

---

## 3. Automated GitHub Actions CI/CD

NetScope X features automated testing, building, and publishing pipelines under `.github/workflows/`:

### Continuous Integration (`.github/workflows/ci.yml`)
Runs on every `push` and `pull_request` targeting the `main` branch:
1. **Frontend Validation**:
   - Node.js 22 setup with dependency cache.
   - `npm ci --legacy-peer-deps` for deterministic package installation.
   - TypeScript typechecking & linting (`npm run lint`).
   - Unit & responsive tests (`npm test` via Vitest).
   - Production bundle compilation (`npm run build`).
2. **Rust Validation**:
   - Stable Rust toolchain with `rustfmt` and `clippy`.
   - Formatting check: `cargo fmt --check`.
   - Linter: `cargo clippy --all-targets --all-features -- -D warnings`.
   - Unit tests: `cargo test`.
3. **Windows x64 Build & Artifact Upload**:
   - Compiles release executable on `windows-latest`.
   - Uploads binary as a workflow artifact (`netscope-x-windows-x64-ci-<sha>`) with 14-day retention.

### Automated Releases (`.github/workflows/release.yml`)
Triggers automatically on Git version tags (`v*`) or manual `workflow_dispatch`:
1. Checks out tagged commit and sets up Node 22 + Rust stable on `windows-latest`.
2. Runs all verification checks (`npm run lint`, `npm test`, `cargo test`).
3. Packages the Windows release using Tauri CLI:
   - **NSIS Installer**: `.exe` setup package.
   - **MSI Installer**: `.msi` Windows installer package.
   - **Standalone Executable**: `netscope-x-standalone.exe`.
4. Computes SHA256 checksums (`SHA256SUMS.txt`).
5. Publishes a GitHub Release using `softprops/action-gh-release@v2` with generated changelog notes.

---

## 4. Development & Testing Commands

```bash
# Install dependencies
npm install

# Start development server (Port 3000)
npm run dev

# Run Vitest test suite
npm test

# Run TypeScript linter
npm run lint

# Production build
npm run build
```
