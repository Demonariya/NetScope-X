import express, { type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import type {
  AppSettings,
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
} from './src/types/network';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.use(express.json({ limit: '1mb' }));

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

const DEFAULT_SETTINGS: AppSettings = {
  monitoring: {
    enabled: true,
    perAppEnabled: true,
    adapterId: 'auto',
    updateIntervalMs: 1000,
    showInactiveApps: true,
    groupByExe: true,
  },
  diagnostics: {
    pingTargets: [
      { id: 'cloudflare', name: 'Cloudflare DNS', host: '1.1.1.1' },
      { id: 'google', name: 'Google DNS', host: '8.8.8.8' },
      { id: 'quad9', name: 'Quad9 DNS', host: '9.9.9.9' },
    ],
    activePingTarget: '1.1.1.1',
    pingIntervalMs: 2000,
    pingTimeoutMs: 1500,
    mode: 'tcp',
  },
  startup: {
    startWithWindows: false,
    launchMinimized: false,
    minimizeToTrayOnClose: true,
    keepMonitoringInTray: true,
    showTraySpeedTooltip: true,
  },
  storage: { dataRetentionDays: 30, autoPrune: true },
  appearance: {
    theme: 'dark',
    accentColor: '#38bdf8',
    defaultCanvasMode: 'portrait_9_16',
    chartStyle: 'area',
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeSettings(incoming: unknown): AppSettings {
  const value = isObject(incoming) ? incoming : {};
  const section = (key: string) => isObject(value[key]) ? value[key] as Record<string, unknown> : {};
  return {
    monitoring: { ...DEFAULT_SETTINGS.monitoring, ...section('monitoring') },
    diagnostics: { ...DEFAULT_SETTINGS.diagnostics, ...section('diagnostics') },
    startup: { ...DEFAULT_SETTINGS.startup, ...section('startup') },
    storage: { ...DEFAULT_SETTINGS.storage, ...section('storage') },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...section('appearance') },
  } as AppSettings;
}

function readSettings(): AppSettings {
  try {
    return fs.existsSync(SETTINGS_FILE)
      ? mergeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')))
      : DEFAULT_SETTINGS;
  } catch (error) {
    console.warn('Settings file could not be read; using preference defaults:', error);
    return DEFAULT_SETTINGS;
  }
}

let currentSettings = readSettings();

function saveSettingsFile(settings: AppSettings): void {
  const temporary = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(temporary, SETTINGS_FILE);
}

interface StoredHistory extends TrafficHistoryRecord {
  actualMeasurement: true;
}

function readHistoryFile(): StoredHistory[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    // Ignore legacy rows without the marker proving they came from real OS counters.
    return parsed.filter((row): row is StoredHistory =>
      isObject(row) &&
      row.actualMeasurement === true &&
      typeof row.id === 'string' &&
      typeof row.timestamp === 'number' &&
      typeof row.dateStr === 'string' &&
      typeof row.hourStr === 'string' &&
      typeof row.downloadBytes === 'number' &&
      typeof row.uploadBytes === 'number' &&
      typeof row.topApp === 'string'
    );
  } catch (error) {
    console.warn('Traffic history could not be read; ignoring unverifiable records:', error);
    return [];
  }
}

let historyRecords = readHistoryFile();
let lastHistoryWrite = 0;

function persistHistoryIfDue(force = false): void {
  if (!force && Date.now() - lastHistoryWrite < 15000) return;
  const temporary = HISTORY_FILE + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(historyRecords, null, 2), 'utf8');
  fs.renameSync(temporary, HISTORY_FILE);
  lastHistoryWrite = Date.now();
}

interface WindowsCounters {
  adapterId: string;
  bytesReceived: number;
  bytesSent: number;
  timestampMs: number;
}

interface AdapterSample {
  lastReceived: number;
  lastSent: number;
  lastTimestamp: number;
  downloadBps: number;
  uploadBps: number;
  sessionDownloadBytes: number;
  sessionUploadBytes: number;
  dailyDownloadBytes: number;
  dailyUploadBytes: number;
  dayKey: string;
}

const adapterSamples = new Map<string, AdapterSample>();
let monitoringEnabled = currentSettings.monitoring.enabled;
let currentPingHistory: number[] = [];
let currentPingTarget = currentSettings.diagnostics.activePingTarget;

function runPowerShell(script: string, timeout = 15000): Promise<string> {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('Native Windows telemetry is only available on Windows. The development server does not generate simulated system data.'));
  }

  const fullScript = "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding;\n" + script;
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', fullScript],
      { windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 24 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || '').trim();
          reject(new Error(detail || error.message || 'Windows PowerShell command failed.'));
          return;
        }
        resolve(String(stdout || '').trim());
      },
    );
  });
}

function parseJsonArray<T>(json: string): T[] {
  if (!json.trim()) return [];
  const value: unknown = JSON.parse(json);
  if (Array.isArray(value)) return value as T[];
  return value === null || value === undefined ? [] : [value as T];
}

function sendFailure(res: Response, error: unknown, label: string): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${label}]`, detail);
  const status = /access is denied|access denied|administrator|elevation/i.test(detail) ? 403 : 503;
  if (!res.headersSent) res.status(status).json({ error: detail, source: 'live-system' });
}

async function queryAdapters(): Promise<NetworkAdapter[]> {
  const script = String.raw`
$rows = @(
  Get-NetAdapter -IncludeHidden -ErrorAction Stop |
    Where-Object { $_.Status -ne 'Not Present' } |
    ForEach-Object {
      $adapter = $_
      $ip = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
      $kind = 'ethernet'
      if ($adapter.InterfaceDescription -match 'Wi-?Fi|Wireless|802\.11') { $kind = 'wifi' }
      elseif ($adapter.Name -match 'loopback') { $kind = 'loopback' }
      elseif (-not $adapter.HardwareInterface -or $adapter.Name -match 'VPN|TAP|Tunnel|Virtual|WireGuard|Wintun') { $kind = 'virtual' }
      $status = if ($adapter.Status -eq 'Up') { 'connected' } else { 'disconnected' }
      $ipv4Item = $ip.IPv4Address | Select-Object -First 1
      $ipv6Item = $ip.IPv6Address | Select-Object -First 1
      $gatewayItem = $ip.IPv4DefaultGateway | Select-Object -First 1
      $ipv4 = if ($ipv4Item) { [string]$ipv4Item.IPAddress } else { '' }
      $ipv6 = if ($ipv6Item) { [string]$ipv6Item.IPAddress } else { '' }
      $gateway = if ($gatewayItem) { [string]$gatewayItem.NextHop } else { '' }
      $dns = @($ip.DnsServer.ServerAddresses | Where-Object { $_ })
      $speed = 0
      $linkText = [string]$adapter.LinkSpeed
      if ($linkText -match '([0-9]+(?:\.[0-9]+)?)\s*(Kbps|Mbps|Gbps)') {
        $number = [double]$Matches[1]
        switch ($Matches[2]) {
          'Gbps' { $speed = [int][math]::Round($number * 1000) }
          'Mbps' { $speed = [int][math]::Round($number) }
          'Kbps' { $speed = [int][math]::Round($number / 1000) }
        }
      }
      [pscustomobject]@{
        id = [string]$adapter.ifIndex
        name = [string]$adapter.Name
        description = [string]$adapter.InterfaceDescription
        type = $kind
        status = $status
        localIPv4 = $ipv4
        localIPv6 = $ipv6
        macAddress = [string]$adapter.MacAddress
        gateway = $gateway
        dnsServers = @($dns)
        signalPercent = $null
        signalDbm = $null
        ssid = $null
        speedMbps = $speed
        isDefault = [bool]$gateway
      }
    }
)
ConvertTo-Json -InputObject @($rows) -Depth 5 -Compress
`;
  return parseJsonArray<NetworkAdapter>(await runPowerShell(script));
}

async function readWindowsCounters(adapterId: string): Promise<WindowsCounters> {
  if (adapterId !== 'auto' && !/^\d+$/.test(adapterId)) {
    throw new Error('Adapter ID must be auto or a numeric Windows interface index.');
  }
  const script = String.raw`
$requestedId = '__ADAPTER_ID__'
if ($requestedId -eq 'auto') {
  $config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4DefaultGateway -or $_.IPv6DefaultGateway } |
    Select-Object -First 1
  if ($null -eq $config) { throw 'No active default-route network adapter was found.' }
  $adapter = Get-NetAdapter -InterfaceIndex $config.InterfaceIndex -ErrorAction Stop
} else {
  $adapter = Get-NetAdapter -InterfaceIndex ([int]$requestedId) -ErrorAction Stop
}
$stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction Stop
[pscustomobject]@{
  adapterId = [string]$adapter.ifIndex
  bytesReceived = [uint64]$stats.ReceivedBytes
  bytesSent = [uint64]$stats.SentBytes
  timestampMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Compress
`.replace('__ADAPTER_ID__', adapterId);
  const result = JSON.parse(await runPowerShell(script)) as WindowsCounters;
  if (!result || !Number.isFinite(result.bytesReceived) || !Number.isFinite(result.bytesSent)) {
    throw new Error('Windows returned invalid interface counters.');
  }
  return result;
}

async function sampleLiveStats(adapterId: string): Promise<NetworkStats> {
  const counters = await readWindowsCounters(adapterId);
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  let sample = adapterSamples.get(counters.adapterId);

  if (!sample) {
    sample = {
      lastReceived: counters.bytesReceived,
      lastSent: counters.bytesSent,
      lastTimestamp: counters.timestampMs,
      downloadBps: 0,
      uploadBps: 0,
      sessionDownloadBytes: 0,
      sessionUploadBytes: 0,
      dailyDownloadBytes: 0,
      dailyUploadBytes: 0,
      dayKey,
    };
    adapterSamples.set(counters.adapterId, sample);
  } else {
    if (sample.dayKey !== dayKey) {
      sample.dayKey = dayKey;
      sample.dailyDownloadBytes = 0;
      sample.dailyUploadBytes = 0;
    }
    const elapsed = counters.timestampMs - sample.lastTimestamp;
    const rxDelta = Math.max(0, counters.bytesReceived - sample.lastReceived);
    const txDelta = Math.max(0, counters.bytesSent - sample.lastSent);
    if (elapsed > 0) {
      sample.downloadBps = Math.round(rxDelta * 1000 / elapsed);
      sample.uploadBps = Math.round(txDelta * 1000 / elapsed);
      sample.sessionDownloadBytes += rxDelta;
      sample.sessionUploadBytes += txDelta;
      sample.dailyDownloadBytes += rxDelta;
      sample.dailyUploadBytes += txDelta;
      updateHistory(counters.adapterId, now, rxDelta, txDelta);
    }
    sample.lastReceived = counters.bytesReceived;
    sample.lastSent = counters.bytesSent;
    sample.lastTimestamp = counters.timestampMs;
  }

  return {
    timestamp: counters.timestampMs,
    downloadBps: monitoringEnabled ? sample.downloadBps : 0,
    uploadBps: monitoringEnabled ? sample.uploadBps : 0,
    sessionDownloadBytes: sample.sessionDownloadBytes,
    sessionUploadBytes: sample.sessionUploadBytes,
    totalSessionBytes: sample.sessionDownloadBytes + sample.sessionUploadBytes,
    dailyDownloadBytes: sample.dailyDownloadBytes,
    dailyUploadBytes: sample.dailyUploadBytes,
    activeAdapterId: counters.adapterId,
  };
}

function updateHistory(adapterId: string, now: Date, downloadDelta: number, uploadDelta: number): void {
  const dateStr = now.toISOString().slice(0, 10);
  const hourStr = `${String(now.getHours()).padStart(2, '0')}:00`;
  const id = `interface:${adapterId}:${dateStr}:${hourStr}`;
  let row = historyRecords.find(entry => entry.id === id);
  if (!row) {
    row = {
      id,
      timestamp: now.getTime(),
      dateStr,
      hourStr,
      downloadBytes: 0,
      uploadBytes: 0,
      topApp: `Interface ${adapterId}`,
      actualMeasurement: true,
    };
    historyRecords.push(row);
  }
  row.timestamp = now.getTime();
  row.downloadBytes += downloadDelta;
  row.uploadBytes += uploadDelta;
  const retentionDays = Math.max(1, Math.min(365, Number(currentSettings.storage.dataRetentionDays) || 30));
  const oldestAllowed = now.getTime() - retentionDays * 86400000;
  historyRecords = historyRecords.filter(entry => entry.timestamp >= oldestAllowed);
  persistHistoryIfDue();
}

interface ConnectionQueryResult {
  connections: SocketConnection[];
  processes: ProcessNetworkUsage[];
}

async function queryConnectionsAndProcesses(): Promise<ConnectionQueryResult> {
  const script = String.raw`
$processNames = @{}
$processRows = @(Get-Process -ErrorAction SilentlyContinue)
foreach ($process in $processRows) { $processNames[[string]$process.Id] = "$($process.ProcessName).exe" }

$blockedPids = @{}
Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'NetScopeX-Blocked-*-out' -and $_.Enabled -eq 'True' } |
  ForEach-Object {
    if ($_.DisplayName -match '^NetScopeX-Blocked-(\d+)-out$') { $blockedPids[$Matches[1]] = $true }
  }

$tcp = @(
  Get-NetTCPConnection -ErrorAction SilentlyContinue | ForEach-Object {
    $pidValue = [int]$_.OwningProcess
    $key = [string]$pidValue
    $procName = if ($processNames.ContainsKey($key)) { $processNames[$key] } else { "PID $pidValue" }
    $state = switch ([string]$_.State) {
      'Established' { 'ESTABLISHED' }
      'Listen' { 'LISTENING' }
      'CloseWait' { 'CLOSE_WAIT' }
      'TimeWait' { 'TIME_WAIT' }
      'SynSent' { 'SYN_SENT' }
      'SynReceived' { 'SYN_RCVD' }
      'FinWait1' { 'FIN_WAIT_1' }
      'FinWait2' { 'FIN_WAIT_2' }
      'LastAck' { 'LAST_ACK' }
      default { ([string]$_.State).ToUpperInvariant() }
    }
    [pscustomobject]@{
      id = "tcp-$pidValue-$($_.LocalAddress)-$($_.LocalPort)-$($_.RemoteAddress)-$($_.RemotePort)"
      protocol = 'TCP'
      localAddress = [string]$_.LocalAddress
      localPort = [uint16]$_.LocalPort
      remoteAddress = [string]$_.RemoteAddress
      remotePort = [uint16]$_.RemotePort
      state = $state
      pid = $pidValue
      processName = $procName
      bytesSent = [uint64]0
      bytesReceived = [uint64]0
    }
  }
)
$udp = @(
  Get-NetUDPEndpoint -ErrorAction SilentlyContinue | ForEach-Object {
    $pidValue = [int]$_.OwningProcess
    $key = [string]$pidValue
    $procName = if ($processNames.ContainsKey($key)) { $processNames[$key] } else { "PID $pidValue" }
    [pscustomobject]@{
      id = "udp-$pidValue-$($_.LocalAddress)-$($_.LocalPort)"
      protocol = 'UDP'
      localAddress = [string]$_.LocalAddress
      localPort = [uint16]$_.LocalPort
      remoteAddress = ''
      remotePort = [uint16]0
      state = 'LISTENING'
      pid = $pidValue
      processName = $procName
      bytesSent = [uint64]0
      bytesReceived = [uint64]0
    }
  }
)
$connections = @($tcp) + @($udp)
$processes = @(
  $processRows | ForEach-Object {
    $process = $_
    $pidValue = [int]$process.Id
    $processKey = [string]$pidValue
    $path = ''
    try { $path = [string]$process.Path } catch {}
    $start = [long]0
    try {
      $startTime = $process.StartTime.ToUniversalTime()
      $start = ([DateTimeOffset]$startTime).ToUnixTimeMilliseconds()
    } catch {}
    $processConnections = @($connections | Where-Object { [int]$_.pid -eq $pidValue })
    [pscustomobject]@{
      pid = [uint32]$pidValue
      name = "$($process.ProcessName).exe"
      friendlyName = [string]$process.ProcessName
      exeName = "$($process.ProcessName).exe"
      fullPath = $path
      icon = ''
      downloadBps = [uint64]0
      uploadBps = [uint64]0
      sessionDownloadBytes = [uint64]0
      sessionUploadBytes = [uint64]0
      totalBytes = [uint64]0
      connectionCount = [uint32]$processConnections.Count
      status = if ($processConnections.Count -gt 0) { 'active' } else { 'idle' }
      isBlocked = $blockedPids.ContainsKey($processKey)
      startTime = $start
      recentSpeedHistory = @()
      connections = @($processConnections)
    }
  }
)
[pscustomobject]@{
  connections = @($connections)
  processes = @($processes)
} | ConvertTo-Json -Depth 8 -Compress
`;
  const result = JSON.parse(await runPowerShell(script)) as ConnectionQueryResult;
  return {
    connections: Array.isArray(result.connections) ? result.connections : [],
    processes: Array.isArray(result.processes) ? result.processes : [],
  };
}

async function probeTcp(host: string, timeoutMs: number): Promise<{ latency: number; status: 'success' | 'timeout' | 'error' }> {
  if (!host.trim() || /[\s/\\]/.test(host)) throw new Error('Enter a valid hostname or IP address.');
  return new Promise(resolve => {
    const socket = new net.Socket();
    const start = process.hrtime.bigint();
    let done = false;

    const finish = (status: 'success' | 'timeout' | 'error', latency: number) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ latency, status });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('success', Number(process.hrtime.bigint() - start) / 1_000_000));
    socket.once('timeout', () => finish('timeout', 0));
    socket.once('error', error => {
      finish(error.message.toLowerCase().includes('timed out') ? 'timeout' : 'error', 0);
    });
    socket.connect(443, host);
  });
}

async function runPingProbe(target: string): Promise<PingResult> {
  const cleanTarget = target.trim();
  const probe = await probeTcp(cleanTarget, Math.max(250, Math.min(10000, Number(currentSettings.diagnostics.pingTimeoutMs) || 1500)));
  const now = Date.now();
  if (currentPingTarget !== cleanTarget) {
    currentPingTarget = cleanTarget;
    currentPingHistory = [];
  }
  if (probe.status === 'success') {
    currentPingHistory.push(probe.latency);
    currentPingHistory = currentPingHistory.slice(-20);
  }
  const average = currentPingHistory.length
    ? currentPingHistory.reduce((total, item) => total + item, 0) / currentPingHistory.length
    : 0;
  const jitter = currentPingHistory.length > 1
    ? currentPingHistory.slice(1).reduce((total, value, index) => total + Math.abs(value - currentPingHistory[index]), 0) / (currentPingHistory.length - 1)
    : 0;
  const result: PingResult = {
    target: cleanTarget,
    host: cleanTarget,
    latencyMs: probe.latency,
    minLatencyMs: currentPingHistory.length ? Math.min(...currentPingHistory) : 0,
    maxLatencyMs: currentPingHistory.length ? Math.max(...currentPingHistory) : 0,
    avgLatencyMs: average,
    jitterMs: jitter,
    packetLossPercent: probe.status === 'success' ? 0 : 100,
    status: probe.status,
    lastChecked: now,
    history: [...currentPingHistory],
  };
  return result;
}

app.get('/api/network/adapters', async (_req, res) => {
  try {
    res.json(await queryAdapters());
  } catch (error) {
    sendFailure(res, error, 'Network adapters');
  }
});

app.get('/api/network/live-stats', async (req, res) => {
  try {
    const adapterId = typeof req.query.adapterId === 'string' ? req.query.adapterId : currentSettings.monitoring.adapterId || 'auto';
    res.json(await sampleLiveStats(adapterId));
  } catch (error) {
    sendFailure(res, error, 'Network counters');
  }
});

app.get('/api/network/ping', async (req, res) => {
  try {
    const target = typeof req.query.target === 'string'
      ? req.query.target
      : currentSettings.diagnostics.activePingTarget;
    if (typeof req.query.target === 'string') {
      currentSettings.diagnostics.activePingTarget = target;
      currentSettings = mergeSettings(currentSettings);
      saveSettingsFile(currentSettings);
    }
    res.json(await runPingProbe(target));
  } catch (error) {
    sendFailure(res, error, 'Ping probe');
  }
});

app.get('/api/processes', async (_req, res) => {
  try {
    res.json((await queryConnectionsAndProcesses()).processes);
  } catch (error) {
    sendFailure(res, error, 'Process enumeration');
  }
});

app.get('/api/network/connections', async (_req, res) => {
  try {
    res.json((await queryConnectionsAndProcesses()).connections);
  } catch (error) {
    sendFailure(res, error, 'Network connection enumeration');
  }
});

app.post('/api/processes/block', async (req, res) => {
  const pidValue = Number(req.body?.pid);
  const shouldBlock = req.body?.block === true;
  if (!Number.isSafeInteger(pidValue) || pidValue <= 0) {
    res.status(400).json({ error: 'A valid positive process PID is required.' });
    return;
  }

  const ruleOut = `NetScopeX-Blocked-${pidValue}-out`;
  const ruleIn = `NetScopeX-Blocked-${pidValue}-in`;
  const script = shouldBlock ? String.raw`
$targetPid = __PID__
$ruleOut = '__OUT__'
$ruleIn = '__IN__'
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction Stop
if ($null -eq $process) { throw "Process PID $targetPid is no longer running." }
$program = [string]$process.ExecutablePath
if ([string]::IsNullOrWhiteSpace($program) -or -not (Test-Path -LiteralPath $program -PathType Leaf)) { throw "Windows did not provide a valid executable path for PID $targetPid." }
try {
  Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $ruleOut -Direction Outbound -Program $program -Action Block -Profile Any -Enabled True -ErrorAction Stop | Out-Null
  New-NetFirewallRule -DisplayName $ruleIn -Direction Inbound -Program $program -Action Block -Profile Any -Enabled True -ErrorAction Stop | Out-Null
  [pscustomobject]@{ success = $true } | ConvertTo-Json -Compress
} catch {
  Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  throw
}
`.replace('__PID__', String(pidValue)).replace('__OUT__', ruleOut).replace('__IN__', ruleIn) : String.raw`
$ruleOut = '__OUT__'
$ruleIn = '__IN__'
Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName $ruleIn -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
[pscustomobject]@{ success = $true } | ConvertTo-Json -Compress
`.replace('__OUT__', ruleOut).replace('__IN__', ruleIn);

  try {
    const output = await runPowerShell(script);
    const result = JSON.parse(output) as { success?: boolean };
    if (result.success !== true) throw new Error('Windows Firewall did not confirm the requested operation.');
    res.json({ success: true, isBlocked: shouldBlock, exeName: String(req.body?.exeName || ''), pid: pidValue });
  } catch (error) {
    sendFailure(res, error, 'Windows Firewall');
  }
});

app.post('/api/processes/reset', async (req, res) => {
  if (req.body?.pid != null) {
    res.status(501).json({ error: 'Per-process byte counters are unavailable until native ETW/WFP attribution is implemented.' });
    return;
  }
  for (const sample of adapterSamples.values()) {
    sample.sessionDownloadBytes = 0;
    sample.sessionUploadBytes = 0;
    sample.dailyDownloadBytes = 0;
    sample.dailyUploadBytes = 0;
    sample.lastTimestamp = 0;
  }
  res.json({ success: true });
});

app.get('/api/history', (req, res) => {
  const range = typeof req.query.range === 'string' ? req.query.range : 'today';
  const today = new Date().toISOString().slice(0, 10);
  const dayCount = range === '7d' ? 7 : range === '30d' ? 30 : range === 'all' ? Number.MAX_SAFE_INTEGER : 1;
  const earliestDate = new Date(Date.now() - Math.max(0, dayCount - 1) * 86400000).toISOString().slice(0, 10);
  const selected = historyRecords.filter(row => range === 'all' || (range === 'today' ? row.dateStr === today : row.dateStr >= earliestDate));
  res.json(selected.map(({ actualMeasurement: _actualMeasurement, ...row }) => row));
});

app.get('/api/export/csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="netscope_traffic_export.csv"');
  const rows = ['Timestamp,Date,Hour,Adapter,DownloadBytes,UploadBytes'];
  historyRecords.forEach(row => {
    const adapter = row.topApp.replace(/"/g, '""');
    rows.push(`${row.timestamp},${row.dateStr},${row.hourStr}," ${adapter}",${row.downloadBytes},${row.uploadBytes}`.replace('" ', '"'));
  });
  res.send(rows.join('\n') + '\n');
});

app.get('/api/export/json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="netscope_traffic_export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    source: 'Windows interface counters',
    hourlyHistory: historyRecords.map(({ actualMeasurement: _actualMeasurement, ...row }) => row),
  });
});

app.get('/api/settings', (_req, res) => res.json(currentSettings));

app.post('/api/settings', (req, res) => {
  try {
    currentSettings = mergeSettings(req.body);
    monitoringEnabled = currentSettings.monitoring.enabled;
    saveSettingsFile(currentSettings);
    res.json({ success: true, settings: currentSettings });
  } catch (error) {
    sendFailure(res, error, 'Save settings');
  }
});

app.post('/api/settings/reset-history', (_req, res) => {
  try {
    historyRecords = [];
    persistHistoryIfDue(true);
    res.json({ success: true });
  } catch (error) {
    sendFailure(res, error, 'Clear traffic history');
  }
});

// Browser mode cannot manipulate the native window or OS tray. Refuse instead of simulating it.
app.post('/api/tray/action', (req, res) => {
  res.status(501).json({
    error: `Window/tray action "${String(req.body?.action || 'unknown')}" requires the packaged Tauri desktop application.`,
  });
});

app.get('/api/tray/state', (_req, res) => {
  res.json({ isNativeDesktop: false, monitoringActive: monitoringEnabled });
});

async function startServer(): Promise<void> {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.use((error: unknown, _req: Request, res: Response, _next: (err?: unknown) => void) => {
    sendFailure(res, error, 'HTTP server');
  });

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[NetScope X] Development UI at http://127.0.0.1:${PORT}`);
    if (process.platform !== 'win32') {
      console.warn('[NetScope X] Live system telemetry is disabled on this platform; no simulated stats will be shown.');
    }
  });
}

void startServer().catch(error => {
  console.error('[NetScope X] Could not start development server:', error);
  process.exitCode = 1;
});
