# NetScope X — Premium Windows Network Intelligence Suite

**NetScope X** is a high-performance Windows network monitoring suite combining the precision of an enterprise diagnostics utility with the visual quality of an executive desktop telemetry console.

Featuring real-time **per-application bandwidth accounting**, genuine Windows executable attribution, low-latency ICMP/TCP ping probing, socket inspection, and SQLite-backed local persistence.

---

## Key Features

1. **9:16 Portrait-First Canvas & Resizable Desktop Modes**
   - Designed around a native 9:16 portrait vertical dashboard (460 × 820 px baseline) for compact auxiliary displays and second screens.
   - Smoothly adapts to standard desktop mode, expanded desktop mode, and full-screen maximization.

2. **Accurate Per-Application Bandwidth Accounting**
   - Correlates socket byte transfers with active Windows processes.
   - Live download & upload speeds calculated strictly from byte-delta counters (`bps = delta / elapsed_sec`).
   - Authentic Windows application icons (Google Chrome, Microsoft Edge, Discord, Steam, Spotify, VS Code, Slack, etc.) with Windows Shell extraction.
   - Deep inspection panel displaying full executable path, PID, uptime, and active remote TCP/UDP endpoints.

3. **Adapter Telemetry & Connection Status**
   - Auto-discovers physical and wireless adapters (Wi-Fi 6E, 2.5GbE Ethernet).
   - Displays real-time Link Speed, Local IPv4, Local IPv6, MAC, Gateway, and Wi-Fi signal percentage/dBm.

4. **Network Quality Diagnostics**
   - Real-time latency, minimum, maximum, average ping, and jitter calculation.
   - Built-in targets (Cloudflare 1.1.1.1, Google 8.8.8.8, Quad9 9.9.9.9) and custom host probing.

5. **Socket & Connection Inspector**
   - Live table of active TCP and UDP sockets with states (`ESTABLISHED`, `LISTENING`, etc.).
   - Quick one-click copy for remote endpoints.

6. **Persistent Analytics & Data Exports**
   - Local SQLite database tracking hourly and daily volume.
   - Direct CSV and JSON data export.
   - Configurable retention periods (7, 30, 90, 365 days).

7. **Native Windows System Tray Integration**
   - Minimizes to system tray with background monitoring.
   - Tray tooltip displaying current download/upload rates.
   - Native context menu for pause, resume, settings, and clean exit.

---

## Project Architecture

```
netscope-x/
├── server.ts                    # Full-stack Node/Express dev & runtime server with Vite integration
├── src/                         # React 19 + TypeScript frontend
│   ├── App.tsx                  # Main application orchestrator
│   ├── components/
│   │   ├── layout/              # TitleBar, Navigation bar
│   │   ├── overview/            # Connection card, speed metrics, live chart, ping probe
│   │   ├── applications/        # Per-application bandwidth monitor & deep inspector
│   │   ├── traffic/             # Protocol distribution & hourly usage bars
│   │   ├── connections/         # Socket table with endpoint copy
│   │   ├── history/             # Persistent SQLite analytics & export actions
│   │   ├── settings/            # Monitoring, diagnostics, startup & appearance
│   │   ├── tray/                # System tray preview & context menu modal
│   │   └── common/              # Toast notifications
│   ├── services/api.ts          # Universal IPC / REST bridge
│   ├── types/network.ts         # TypeScript domain contracts
│   └── utils/
│       ├── formatters.ts        # Tabular numerals, speed & byte units
│       └── processIcons.ts      # High-definition Windows executable icons
├── src-tauri/                   # Rust Tauri 2 Desktop Suite
│   ├── Cargo.toml               # Rust dependencies (windows, rusqlite, tokio, etc.)
│   ├── tauri.conf.json          # Window geometry, tray, security configuration
│   └── src/
│       ├── main.rs              # Windows desktop entry point
│       ├── lib.rs               # Command registry and runtime setup
│       ├── network/             # GetAdaptersAddresses, MIB_IFROW2, ping
│       ├── monitoring/          # ETW collector, process attribution, delta aggregation
│       ├── processes/           # EnumProcesses, Shell icon extraction, metadata
│       ├── storage/             # SQLite schema, migrations, history, exports
│       ├── settings/            # Configuration structs, validation, persistence
│       ├── tray/                # Windows notification area tray icon and menus
│       └── commands/            # Typed Tauri IPC command handlers
```

---

## Build and Run Instructions

### 1. Web Preview & Development Server
```bash
npm install
npm run dev
```
Launches the full-stack server on `http://localhost:3000`.

### 2. Windows Desktop Build (Tauri 2)
On a Windows 10/11 x64 host:
```bash
# Ensure Rust and Windows C++ build tools are installed
cargo install tauri-cli --version "^2.0.0"

# Build production Windows executable and installer
npm run build
cargo tauri build
```
Output artifact: `src-tauri/target/release/netscope-x.exe` (or `.msi` bundle in `src-tauri/target/release/bundle/msi/`).

---

## ETW Permission Requirements
Per-process bandwidth tracking uses the `Microsoft-Windows-Kernel-Network` provider (`{7dd42a49-5329-4832-8dfd-43d979153a88}`). Windows requires one of the following:
- Running the application as **Administrator**, OR
- Adding your user account to the Windows **Performance Log Users** group.
