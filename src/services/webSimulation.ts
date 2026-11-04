import {
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
  AppSettings,
  HistoryRange,
} from '../types/network';
import {
  BandwidthConfig,
  BandwidthLimitRule,
  BandwidthProfile,
  BandwidthCapabilities,
  ApplicationPriority,
} from '../types/bandwidth';
import {
  getPresetProfiles,
  DEFAULT_BANDWIDTH_CAPABILITIES,
  toBitsPerSecond,
} from '../utils/bandwidth';
import { getProcessRealIcon } from '../utils/processIcons';

// Web Simulation Engine for Browser & Cloud Run Preview environments
// Provides realistic, fully interactive live Windows network telemetry

const STORAGE_KEYS = {
  SETTINGS: 'netscope_settings',
  BLOCKED_EXES: 'netscope_sim_blocked_exes',
  HISTORY: 'netscope_sim_history',
  SESSION_ACCUMULATOR: 'netscope_sim_session',
  BANDWIDTH_CONFIG: 'netscope_sim_bandwidth_config',
};

const memoryStorage = new Map<string, string>();

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {}
  return memoryStorage.get(key) ?? null;
}

function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStorage.set(key, value);
}

// Initial realistic adapters
const SIMULATED_ADAPTERS: NetworkAdapter[] = [
  {
    id: '14',
    name: 'Wi-Fi 6',
    description: 'Intel(R) Wi-Fi 6 AX201 160MHz',
    type: 'wifi',
    status: 'connected',
    localIPv4: '192.168.1.142',
    localIPv6: '2600:1700:4a12:880::15',
    macAddress: '70-66-55-44-33-22',
    gateway: '192.168.1.1',
    dnsServers: ['1.1.1.1', '1.0.0.1'],
    signalPercent: 92,
    signalDbm: -54,
    ssid: 'NetScope-HQ-5G',
    speedMbps: 866,
    isDefault: true,
  },
  {
    id: '12',
    name: 'Ethernet',
    description: 'Realtek PCIe GbE Family Controller',
    type: 'ethernet',
    status: 'disconnected',
    localIPv4: '',
    localIPv6: '',
    macAddress: '00-E0-4C-68-00-11',
    gateway: '',
    dnsServers: [],
    signalPercent: undefined,
    signalDbm: undefined,
    ssid: undefined,
    speedMbps: 1000,
    isDefault: false,
  },
];

// Persistent state management
class SimulationState {
  private monitoringEnabled = true;
  private sessionDownload = 142_500_000; // ~142 MB baseline
  private sessionUpload = 38_200_000;   // ~38 MB baseline
  private dailyDownload = 1_850_000_000; // ~1.85 GB
  private dailyUpload = 420_000_000;    // ~420 MB
  private pingHistory: number[] = [12.4, 13.1, 12.0, 14.8, 11.9, 13.5, 12.8, 15.2, 12.1, 13.0];
  private speedTrend = 0.5;
  private resetProcessPids = new Set<number>();
  private resetAllProcesses = false;

  constructor() {
    this.initHistory();
  }

  isMonitoring(): boolean {
    return this.monitoringEnabled;
  }

  setMonitoring(enabled: boolean): void {
    this.monitoringEnabled = enabled;
  }

  getBlockedExes(): Set<string> {
    try {
      const raw = safeGetStorage(STORAGE_KEYS.BLOCKED_EXES);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  }

  getAdapters(): NetworkAdapter[] {
    const jitter = Math.round(Math.sin(Date.now() / 4000) * 3);
    return SIMULATED_ADAPTERS.map(adapter => {
      if (adapter.type === 'wifi' && adapter.status === 'connected') {
        const signalPercent = Math.max(75, Math.min(98, 92 + jitter));
        const signalDbm = Math.round(-100 + signalPercent / 2);
        return {
          ...adapter,
          signalPercent,
          signalDbm,
        };
      }
      return adapter;
    });
  }

  setBlockedExes(blocked: Set<string>): void {
    try {
      safeSetStorage(STORAGE_KEYS.BLOCKED_EXES, JSON.stringify(Array.from(blocked)));
    } catch {}
  }

  resetSession(): void {
    this.sessionDownload = 0;
    this.sessionUpload = 0;
    this.resetAllProcesses = true;
  }

  resetProcessStats(pid?: number): void {
    if (pid !== undefined) {
      this.resetProcessPids.add(pid);
    } else {
      this.resetAllProcesses = true;
    }
  }

  getLiveStats(adapterId: string = 'auto'): NetworkStats {
    if (!this.monitoringEnabled) {
      return {
        timestamp: Date.now(),
        downloadBps: 0,
        uploadBps: 0,
        sessionDownloadBytes: this.sessionDownload,
        sessionUploadBytes: this.sessionUpload,
        totalSessionBytes: this.sessionDownload + this.sessionUpload,
        dailyDownloadBytes: this.dailyDownload,
        dailyUploadBytes: this.dailyUpload,
        activeAdapterId: adapterId === 'auto' ? '14' : adapterId,
      };
    }

    // Realistic fluctuation algorithm: gentle drift with micro-bursts
    this.speedTrend += (Math.random() - 0.5) * 0.2;
    this.speedTrend = Math.max(0.1, Math.min(0.9, this.speedTrend));

    const baseDown = 3_500_000 + Math.sin(Date.now() / 4000) * 1_500_000;
    const noiseDown = (Math.random() * 0.4 - 0.2) * baseDown;
    let downBps = Math.max(150_000, Math.round(baseDown + noiseDown));

    const baseUp = 850_000 + Math.cos(Date.now() / 5000) * 400_000;
    const noiseUp = (Math.random() * 0.4 - 0.2) * baseUp;
    let upBps = Math.max(45_000, Math.round(baseUp + noiseUp));

    // Enforce global bandwidth limits if active
    const bwConfig = this.getBandwidthConfig();
    if (!bwConfig.isPaused) {
      if (bwConfig.globalRule.downloadEnabled && bwConfig.globalRule.downloadLimitBps) {
        const maxDownBytesPerSec = Math.round(bwConfig.globalRule.downloadLimitBps / 8);
        downBps = Math.min(downBps, maxDownBytesPerSec);
      }
      if (bwConfig.globalRule.uploadEnabled && bwConfig.globalRule.uploadLimitBps) {
        const maxUpBytesPerSec = Math.round(bwConfig.globalRule.uploadLimitBps / 8);
        upBps = Math.min(upBps, maxUpBytesPerSec);
      }
    }

    this.sessionDownload += downBps;
    this.sessionUpload += upBps;
    this.dailyDownload += downBps;
    this.dailyUpload += upBps;

    return {
      timestamp: Date.now(),
      downloadBps: downBps,
      uploadBps: upBps,
      sessionDownloadBytes: this.sessionDownload,
      sessionUploadBytes: this.sessionUpload,
      totalSessionBytes: this.sessionDownload + this.sessionUpload,
      dailyDownloadBytes: this.dailyDownload,
      dailyUploadBytes: this.dailyUpload,
      activeAdapterId: adapterId === 'auto' ? '14' : adapterId,
    };
  }

  getPing(target: string, timeoutMs = 2000): PingResult {
    const cleanTarget = target.trim();
    if (!cleanTarget || cleanTarget.includes(' ') || cleanTarget.includes('/') || cleanTarget.includes('\\')) {
      return {
        target: cleanTarget,
        host: cleanTarget,
        latencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        avgLatencyMs: 0,
        jitterMs: 0,
        packetLossPercent: 100,
        status: 'invalid_target',
        lastChecked: Date.now(),
        history: [],
      };
    }

    if (cleanTarget.includes('nonexistent') || cleanTarget.includes('fake-domain')) {
      return {
        target: cleanTarget,
        host: cleanTarget,
        latencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        avgLatencyMs: 0,
        jitterMs: 0,
        packetLossPercent: 100,
        status: 'dns_error',
        lastChecked: Date.now(),
        history: [],
      };
    }

    if (cleanTarget === '192.0.2.1' || cleanTarget.includes('timeout')) {
      return {
        target: cleanTarget,
        host: cleanTarget,
        latencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        avgLatencyMs: 0,
        jitterMs: 0,
        packetLossPercent: 100,
        status: 'timeout',
        lastChecked: Date.now(),
        history: [],
      };
    }

    let baseLatency = 13.5;
    if (cleanTarget.includes('8.8.8.8')) baseLatency = 18.2;
    else if (cleanTarget.includes('9.9.9.9')) baseLatency = 24.6;
    else if (cleanTarget.includes('google.com')) baseLatency = 15.0;

    const jitter = (Math.random() * 3.5) - 1.75;
    const latency = Math.max(4.0, Math.round((baseLatency + jitter) * 10) / 10);

    this.pingHistory.push(latency);
    if (this.pingHistory.length > 20) this.pingHistory.shift();

    const min = Math.min(...this.pingHistory);
    const max = Math.max(...this.pingHistory);
    const avg = Math.round((this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length) * 10) / 10;
    const calcJitter = Math.round((max - min) * 0.5 * 10) / 10;

    return {
      target: cleanTarget,
      host: cleanTarget,
      latencyMs: latency,
      minLatencyMs: min,
      maxLatencyMs: max,
      avgLatencyMs: avg,
      jitterMs: calcJitter,
      packetLossPercent: 0,
      status: 'success',
      lastChecked: Date.now(),
      history: [...this.pingHistory],
    };
  }

  getProcesses(): ProcessNetworkUsage[] {
    const blocked = this.getBlockedExes();
    const now = Date.now();

    const processDefs = [
      {
        pid: 8420,
        name: 'chrome.exe',
        friendlyName: 'Google Chrome',
        exeName: 'chrome.exe',
        fullPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        baseDown: 2_450_000,
        baseUp: 280_000,
        sessionDown: 48_500_000,
        sessionUp: 12_400_000,
        remoteIps: [
          { ip: '142.250.190.46', port: 443, proto: 'TCP' as const },
          { ip: '142.251.40.206', port: 443, proto: 'TCP' as const },
          { ip: '172.217.16.206', port: 443, proto: 'TCP' as const },
        ],
      },
      {
        pid: 8424,
        name: 'chrome.exe',
        friendlyName: 'Google Chrome',
        exeName: 'chrome.exe',
        fullPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        baseDown: 420_000,
        baseUp: 45_000,
        sessionDown: 14_200_000,
        sessionUp: 3_100_000,
        remoteIps: [
          { ip: '142.250.190.78', port: 443, proto: 'TCP' as const },
        ],
      },
      {
        pid: 8432,
        name: 'chrome.exe',
        friendlyName: 'Google Chrome',
        exeName: 'chrome.exe',
        fullPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        baseDown: 120_000,
        baseUp: 18_000,
        sessionDown: 6_800_000,
        sessionUp: 1_200_000,
        remoteIps: [
          { ip: '142.250.190.100', port: 443, proto: 'TCP' as const },
        ],
      },
      {
        pid: 11480,
        name: 'discord.exe',
        friendlyName: 'Discord Canary',
        exeName: 'discord.exe',
        fullPath: 'C:\\Users\\User\\AppData\\Local\\DiscordCanary\\app-1.0.9015\\DiscordCanary.exe',
        baseDown: 820_000,
        baseUp: 450_000,
        sessionDown: 34_100_000,
        sessionUp: 18_200_000,
        remoteIps: [
          { ip: '162.159.130.233', port: 443, proto: 'TCP' as const },
          { ip: '162.159.135.232', port: 50001, proto: 'UDP' as const },
        ],
      },
      {
        pid: 11488,
        name: 'discord.exe',
        friendlyName: 'Discord Canary',
        exeName: 'discord.exe',
        fullPath: 'C:\\Users\\User\\AppData\\Local\\DiscordCanary\\app-1.0.9015\\DiscordCanary.exe',
        baseDown: 110_000,
        baseUp: 40_000,
        sessionDown: 5_300_000,
        sessionUp: 2_100_000,
        remoteIps: [
          { ip: '162.159.130.240', port: 443, proto: 'TCP' as const },
        ],
      },
      {
        pid: 6124,
        name: 'code.exe',
        friendlyName: 'Visual Studio Code',
        exeName: 'code.exe',
        fullPath: 'C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
        baseDown: 140_000,
        baseUp: 35_000,
        sessionDown: 8_200_000,
        sessionUp: 2_100_000,
        remoteIps: [
          { ip: '13.107.42.16', port: 443, proto: 'TCP' as const },
          { ip: '20.190.160.132', port: 443, proto: 'TCP' as const },
        ],
      },
      {
        pid: 14212,
        name: 'spotify.exe',
        friendlyName: 'Spotify Music',
        exeName: 'spotify.exe',
        fullPath: 'C:\\Users\\User\\AppData\\Roaming\\Spotify\\Spotify.exe',
        baseDown: 680_000,
        baseUp: 45_000,
        sessionDown: 22_400_000,
        sessionUp: 1_200_000,
        remoteIps: [
          { ip: '35.186.224.25', port: 4070, proto: 'TCP' as const },
          { ip: '104.199.65.124', port: 443, proto: 'TCP' as const },
        ],
      },
      {
        pid: 9940,
        name: 'steam.exe',
        friendlyName: 'Steam Client Bootstrapper',
        exeName: 'steam.exe',
        fullPath: 'C:\\Program Files (x86)\\Steam\\steam.exe',
        baseDown: 95_000,
        baseUp: 20_000,
        sessionDown: 5_100_000,
        sessionUp: 940_000,
        remoteIps: [
          { ip: '162.254.192.88', port: 27017, proto: 'UDP' as const },
          { ip: '162.254.192.89', port: 27018, proto: 'UDP' as const },
        ],
      },
      {
        pid: 4,
        name: 'System',
        friendlyName: 'NT Kernel & System',
        exeName: 'System',
        fullPath: 'ntoskrnl.exe',
        baseDown: 45_000,
        baseUp: 18_000,
        sessionDown: 3_800_000,
        sessionUp: 1_400_000,
        remoteIps: [
          { ip: '192.168.1.1', port: 53, proto: 'UDP' as const },
          { ip: '192.168.1.1', port: 445, proto: 'TCP' as const },
        ],
      },
      {
        pid: 1024,
        name: 'svchost.exe',
        friendlyName: 'Host Process for Windows Services',
        exeName: 'svchost.exe',
        fullPath: 'C:\\Windows\\System32\\svchost.exe',
        baseDown: 25_000,
        baseUp: 12_000,
        sessionDown: 2_100_000,
        sessionUp: 890_000,
        remoteIps: [
          { ip: '20.189.173.1', port: 443, proto: 'TCP' as const },
        ],
      },
      {
        pid: 7788,
        name: 'netscope-x.exe',
        friendlyName: 'NetScope X',
        exeName: 'netscope-x.exe',
        fullPath: 'C:\\Program Files\\NetScope X\\netscope-x.exe',
        baseDown: 12_000,
        baseUp: 4_000,
        sessionDown: 420_000,
        sessionUp: 180_000,
        remoteIps: [
          { ip: '1.1.1.1', port: 53, proto: 'UDP' as const },
        ],
      },
    ];

    return processDefs.map(def => {
      const isBlocked = blocked.has(def.exeName.toLowerCase());
      const isMonitoring = this.monitoringEnabled;

      let down = 0;
      let up = 0;
      if (isMonitoring && !isBlocked) {
        down = Math.round(def.baseDown * (0.7 + Math.random() * 0.6));
        up = Math.round(def.baseUp * (0.7 + Math.random() * 0.6));

        // Enforce per-application / per-process bandwidth throttling
        const bwConfig = this.getBandwidthConfig();
        if (!bwConfig.isPaused) {
          const rule = bwConfig.appRules.find(
            r =>
              (r.targetType === 'application' && r.targetIdentifier.toLowerCase() === def.exeName.toLowerCase()) ||
              (r.targetType === 'process' && r.pid === def.pid)
          );
          if (rule) {
            if (rule.downloadEnabled && rule.downloadLimitBps && rule.downloadLimitBps > 0) {
              const maxDownBytes = Math.round(rule.downloadLimitBps / 8);
              down = Math.min(down, maxDownBytes);
            }
            if (rule.uploadEnabled && rule.uploadLimitBps && rule.uploadLimitBps > 0) {
              const maxUpBytes = Math.round(rule.uploadLimitBps / 8);
              up = Math.min(up, maxUpBytes);
            }
          }
        }
      }

      const connections: SocketConnection[] = def.remoteIps.map((remote, idx) => ({
        id: `sim-${def.pid}-${idx}`,
        protocol: remote.proto,
        localAddress: '192.168.1.142',
        localPort: 49152 + (def.pid % 1000) + idx,
        remoteAddress: remote.ip,
        remotePort: remote.port,
        state: remote.proto === 'TCP' ? 'ESTABLISHED' : 'BOUND',
        pid: def.pid,
        processName: def.exeName,
        bytesSent: isBlocked ? 0 : up,
        bytesReceived: isBlocked ? 0 : down,
      }));

      const isReset = this.resetAllProcesses || this.resetProcessPids.has(def.pid);
      const sessionDown = isReset ? Math.round(down * 2) : def.sessionDown;
      const sessionUp = isReset ? Math.round(up * 2) : def.sessionUp;

      return {
        pid: def.pid,
        name: def.name,
        friendlyName: def.friendlyName,
        exeName: def.exeName,
        fullPath: def.fullPath,
        icon: getProcessRealIcon(def.exeName),
        downloadBps: down,
        uploadBps: up,
        sessionDownloadBytes: sessionDown,
        sessionUploadBytes: sessionUp,
        totalBytes: sessionDown + sessionUp,
        connectionCount: connections.length,
        status: isBlocked ? 'idle' : 'active',
        isBlocked,
        trafficAvailable: true,
        startTime: now - 3600_000 * 4,
        recentSpeedHistory: [
          { time: now - 3000, down: Math.round(down * 0.9), up: Math.round(up * 0.9) },
          { time: now - 2000, down: Math.round(down * 1.1), up: Math.round(up * 1.1) },
          { time: now - 1000, down: down, up: up },
        ],
        connections,
      };
    });
  }

  toggleBlock(exeName: string, block: boolean): { success: boolean; isBlocked: boolean; exeName: string } {
    const blocked = this.getBlockedExes();
    const clean = exeName.toLowerCase().trim();
    if (block) {
      blocked.add(clean);
    } else {
      blocked.delete(clean);
    }
    this.setBlockedExes(blocked);
    return { success: true, isBlocked: block, exeName };
  }

  getConnections(): SocketConnection[] {
    return this.getProcesses().flatMap(p => p.connections);
  }

  private initHistory(): void {
    try {
      if (!safeGetStorage(STORAGE_KEYS.HISTORY)) {
        const initial: TrafficHistoryRecord[] = [];
        const now = new Date();
        const topApps = ['Google Chrome', 'Discord', 'Spotify', 'Steam', 'System Process'];
        // Generate past 7 days of hourly records
        for (let day = 6; day >= 0; day--) {
          const dayDate = new Date(now.getTime() - day * 86400_000);
          const dateStr = dayDate.toISOString().split('T')[0];
          const maxHour = day === 0 ? now.getHours() : 23;

          for (let h = 0; h <= maxHour; h++) {
            const hourStr = `${String(h).padStart(2, '0')}:00`;
            const entryTime = new Date(dayDate);
            entryTime.setHours(h, 0, 0, 0);

            const isBusinessHours = h >= 9 && h <= 18;
            const multiplier = isBusinessHours ? 1.8 : 0.6;
            const baseMB = (40 + Math.sin(h / 3) * 30 + Math.random() * 20) * multiplier;
            const downBytes = Math.round(baseMB * 1024 * 1024);
            const upBytes = Math.round((baseMB * 0.25) * 1024 * 1024);
            const iface = h % 3 === 0 ? 'Ethernet' : 'Wi-Fi 6';

            initial.push({
              id: `${dateStr}-${hourStr}`,
              timestamp: entryTime.getTime(),
              dateStr,
              hourStr,
              downloadBytes: downBytes,
              uploadBytes: upBytes,
              topApp: topApps[h % topApps.length],
              interfaceName: iface,
            });
          }
        }
        safeSetStorage(STORAGE_KEYS.HISTORY, JSON.stringify(initial));
      }
    } catch {}
  }

  getHistory(
    range: HistoryRange = 'today',
    filterOrStart?: string,
    customEnd?: string,
    interfaceFilter?: string
  ): TrafficHistoryRecord[] {
    try {
      const raw = safeGetStorage(STORAGE_KEYS.HISTORY);
      if (raw) {
        let all: TrafficHistoryRecord[] = JSON.parse(raw);
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // Determine if 2nd param is date or interfaceFilter
        const isSecondArgDate = filterOrStart && /^\d{4}-\d{2}-\d{2}/.test(filterOrStart);
        const effectiveCustomStart = isSecondArgDate ? filterOrStart : undefined;
        const effectiveCustomEnd = customEnd && /^\d{4}-\d{2}-\d{2}/.test(customEnd) ? customEnd : undefined;
        const effectiveInterface = interfaceFilter || (!isSecondArgDate ? filterOrStart : undefined);

        if (range === 'today') {
          all = all.filter(r => r.dateStr === todayStr);
        } else if (range === 'yesterday') {
          const yesterdayStr = new Date(now.getTime() - 86400_000).toISOString().split('T')[0];
          all = all.filter(r => r.dateStr === yesterdayStr);
        } else if (range === '7d') {
          const cutoff = new Date(now.getTime() - 6 * 86400_000).toISOString().split('T')[0];
          all = all.filter(r => r.dateStr >= cutoff);
        } else if (range === '30d') {
          const cutoff = new Date(now.getTime() - 29 * 86400_000).toISOString().split('T')[0];
          all = all.filter(r => r.dateStr >= cutoff);
        } else if (range === 'custom') {
          if (effectiveCustomStart) {
            all = all.filter(r => r.dateStr >= effectiveCustomStart);
          }
          if (effectiveCustomEnd) {
            all = all.filter(r => r.dateStr <= effectiveCustomEnd);
          }
        }

        // Apply interface filter
        if (effectiveInterface && effectiveInterface !== 'all' && effectiveInterface !== 'All Interfaces') {
          const norm = effectiveInterface.toLowerCase().trim();
          all = all.filter(
            r =>
              (r.interfaceName && r.interfaceName.toLowerCase().includes(norm)) ||
              (r.topApp && r.topApp.toLowerCase().includes(norm))
          );
        }

        return all;
      }
    } catch {}
    return [];
  }

  clearHistory(): boolean {
    try {
      safeSetStorage(STORAGE_KEYS.HISTORY, JSON.stringify([]));
      return true;
    } catch {
      return false;
    }
  }

  exportHistory(
    format: 'csv' | 'json',
    range: HistoryRange = 'today',
    customStart?: string,
    customEnd?: string,
    interfaceFilter?: string
  ): string {
    const records = this.getHistory(range, customStart, customEnd, interfaceFilter);
    if (format === 'json') {
      return JSON.stringify(records, null, 2);
    }

    const headers = ['ID', 'Timestamp', 'Date', 'Hour', 'DownloadBytes', 'UploadBytes', 'TotalBytes', 'TopApp', 'Interface'];
    const rows = records.map(r => [
      `"${r.id}"`,
      r.timestamp,
      `"${r.dateStr}"`,
      `"${r.hourStr}"`,
      r.downloadBytes,
      r.uploadBytes,
      r.downloadBytes + r.uploadBytes,
      `"${(r.topApp || '').replace(/"/g, '""')}"`,
      `"${(r.interfaceName || 'All Interfaces').replace(/"/g, '""')}"`,
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  // --- Bandwidth Control Simulation Engine ---

  getBandwidthCapabilities(): BandwidthCapabilities {
    return { ...DEFAULT_BANDWIDTH_CAPABILITIES };
  }

  getBandwidthConfig(): BandwidthConfig {
    try {
      const raw = safeGetStorage(STORAGE_KEYS.BANDWIDTH_CONFIG);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}

    const presets = getPresetProfiles();
    const balanced = presets.find(p => p.id === 'preset_balanced') || presets[0];

    const defaultConfig: BandwidthConfig = {
      activeProfileId: balanced.id,
      profiles: presets,
      globalRule: {
        id: 'global_rule',
        name: 'Global Limit',
        targetType: 'global',
        targetIdentifier: 'global',
        downloadLimitBps: undefined,
        uploadLimitBps: undefined,
        downloadEnabled: false,
        uploadEnabled: false,
        priority: 'Normal',
        adapterAlias: 'auto',
        uploadEnforcement: 'disabled',
        downloadEnforcement: 'advisory',
        isGroupRule: false,
      },
      appRules: [
        {
          id: 'rule_chrome',
          name: 'Google Chrome',
          targetType: 'application',
          targetIdentifier: 'chrome.exe',
          appPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          downloadLimitBps: toBitsPerSecond(4, 'MB/s'),
          uploadLimitBps: toBitsPerSecond(1, 'MB/s'),
          downloadEnabled: true,
          uploadEnabled: true,
          priority: 'High',
          uploadEnforcement: 'enforced',
          downloadEnforcement: 'advisory',
          isGroupRule: true,
        },
        {
          id: 'rule_discord',
          name: 'Discord Voice & Video',
          targetType: 'application',
          targetIdentifier: 'Discord.exe',
          appPath: 'Discord.exe',
          downloadLimitBps: undefined,
          uploadLimitBps: toBitsPerSecond(512, 'KB/s'),
          downloadEnabled: false,
          uploadEnabled: true,
          priority: 'Critical',
          uploadEnforcement: 'enforced',
          downloadEnforcement: 'advisory',
          isGroupRule: true,
        },
      ],
      capabilities: DEFAULT_BANDWIDTH_CAPABILITIES,
      isPaused: false,
    };

    safeSetStorage(STORAGE_KEYS.BANDWIDTH_CONFIG, JSON.stringify(defaultConfig));
    return defaultConfig;
  }

  saveBandwidthConfig(config: BandwidthConfig): void {
    try {
      safeSetStorage(STORAGE_KEYS.BANDWIDTH_CONFIG, JSON.stringify(config));
    } catch {}
  }

  applyGlobalBandwidthLimit(
    downloadLimitBps?: number,
    uploadLimitBps?: number,
    downloadEnabled = false,
    uploadEnabled = false,
    adapterAlias = 'auto'
  ): BandwidthLimitRule {
    const config = this.getBandwidthConfig();
    config.globalRule = {
      ...config.globalRule,
      downloadLimitBps,
      uploadLimitBps,
      downloadEnabled,
      uploadEnabled,
      adapterAlias,
      uploadEnforcement: uploadEnabled && uploadLimitBps ? 'enforced' : 'disabled',
      downloadEnforcement: downloadEnabled && downloadLimitBps ? 'advisory' : 'disabled',
      enforcementMessage: uploadEnabled && uploadLimitBps ? 'Applied via Windows QoS Policy-based Scheduler' : undefined,
    };
    this.saveBandwidthConfig(config);
    return config.globalRule;
  }

  applyAppBandwidthLimit(rule: BandwidthLimitRule): BandwidthLimitRule {
    const config = this.getBandwidthConfig();
    const idx = config.appRules.findIndex(r => r.id === rule.id || (r.targetType === rule.targetType && r.targetIdentifier === rule.targetIdentifier));
    const updatedRule: BandwidthLimitRule = {
      ...rule,
      uploadEnforcement: rule.uploadEnabled && rule.uploadLimitBps ? 'enforced' : 'disabled',
      downloadEnforcement: rule.downloadEnabled && rule.downloadLimitBps ? 'advisory' : 'disabled',
      enforcementMessage: rule.uploadEnabled && rule.uploadLimitBps ? 'Enforced by Windows QoS pacer.sys' : undefined,
    };

    if (idx >= 0) {
      config.appRules[idx] = updatedRule;
    } else {
      config.appRules.push(updatedRule);
    }
    this.saveBandwidthConfig(config);
    return updatedRule;
  }

  removeBandwidthLimit(targetType: string, targetIdentifier: string): boolean {
    const config = this.getBandwidthConfig();
    if (targetType === 'global') {
      config.globalRule.downloadEnabled = false;
      config.globalRule.uploadEnabled = false;
      config.globalRule.downloadLimitBps = undefined;
      config.globalRule.uploadLimitBps = undefined;
      config.globalRule.uploadEnforcement = 'disabled';
      config.globalRule.downloadEnforcement = 'disabled';
    } else {
      config.appRules = config.appRules.filter(
        r => !(r.targetType === targetType && r.targetIdentifier.toLowerCase() === targetIdentifier.toLowerCase())
      );
    }
    this.saveBandwidthConfig(config);
    return true;
  }

  resetAllBandwidthLimits(): boolean {
    const config = this.getBandwidthConfig();
    config.globalRule.downloadEnabled = false;
    config.globalRule.uploadEnabled = false;
    config.globalRule.downloadLimitBps = undefined;
    config.globalRule.uploadLimitBps = undefined;
    config.globalRule.uploadEnforcement = 'disabled';
    config.globalRule.downloadEnforcement = 'disabled';
    config.appRules = [];
    config.isPaused = false;
    this.saveBandwidthConfig(config);
    return true;
  }

  saveBandwidthProfile(profile: BandwidthProfile): BandwidthProfile {
    const config = this.getBandwidthConfig();
    const idx = config.profiles.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      config.profiles[idx] = profile;
    } else {
      config.profiles.push(profile);
    }
    config.activeProfileId = profile.id;
    this.saveBandwidthConfig(config);
    return profile;
  }

  applyBandwidthProfile(profileId: string): BandwidthConfig {
    const config = this.getBandwidthConfig();
    const profile = config.profiles.find(p => p.id === profileId);
    if (!profile) return config;

    config.activeProfileId = profile.id;
    config.globalRule.downloadLimitBps = profile.globalDownloadLimitBps;
    config.globalRule.uploadLimitBps = profile.globalUploadLimitBps;
    config.globalRule.downloadEnabled = profile.globalDownloadEnabled;
    config.globalRule.uploadEnabled = profile.globalUploadEnabled;
    config.globalRule.adapterAlias = profile.adapterAlias;
    config.globalRule.uploadEnforcement = profile.globalUploadEnabled && profile.globalUploadLimitBps ? 'enforced' : 'disabled';
    config.globalRule.downloadEnforcement = profile.globalDownloadEnabled && profile.globalDownloadLimitBps ? 'advisory' : 'disabled';
    config.appRules = [...profile.appRules];
    config.isPaused = false;

    this.saveBandwidthConfig(config);
    return config;
  }

  toggleBandwidthPause(paused?: boolean): boolean {
    const config = this.getBandwidthConfig();
    config.isPaused = paused !== undefined ? paused : !config.isPaused;
    this.saveBandwidthConfig(config);
    return config.isPaused;
  }

  getSettings(): AppSettings {
    const defaults: AppSettings = {
      monitoring: {
        enabled: true,
        perAppEnabled: true,
        adapterId: 'auto',
        updateIntervalMs: 1000,
      },
      diagnostics: {
        activePingTarget: '1.1.1.1',
        pingIntervalMs: 2000,
      },
      startup: {
        startWithWindows: false,
        minimizeToTrayOnClose: true,
      },
      storage: {
        dataRetentionDays: 30,
      },
      appearance: {
        theme: 'dark',
        accentColor: '#38bdf8',
      },
    };

    try {
      const saved = safeGetStorage(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaults,
          ...parsed,
          monitoring: { ...defaults.monitoring, ...(parsed.monitoring || {}) },
          diagnostics: { ...defaults.diagnostics, ...(parsed.diagnostics || {}) },
          startup: { ...defaults.startup, ...(parsed.startup || {}) },
          storage: { ...defaults.storage, ...(parsed.storage || {}) },
          appearance: { ...defaults.appearance, ...(parsed.appearance || {}) },
        };
      }
    } catch {}

    return defaults;
  }

  saveSettings(settings: AppSettings): boolean {
    try {
      safeSetStorage(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }
}

export const webSimulation = new SimulationState();
export { SIMULATED_ADAPTERS };
