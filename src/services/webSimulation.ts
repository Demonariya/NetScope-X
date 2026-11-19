import {
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
  AppSettings,
  HistoryRange,
  PingSessionRecord,
  AppAccountingRecord,
  AppSampleRecord,
} from '../types/network';
import {
  DnsConfig,
  DnsProfile,
  DnsQueryResult,
  DnsTestResult,
} from '../types/dns';
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
  DNS_CONFIG: 'netscope_sim_dns_config',
  DNS_PROFILES: 'netscope_sim_dns_profiles',
  PING_SESSIONS: 'netscope_sim_ping_sessions',
  APP_ACCOUNTING: 'netscope_sim_app_accounting',
  APP_SAMPLES: 'netscope_sim_app_samples',
};

const memoryStorage = new Map<string, string>();

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
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
    radioType: '802.11ax',
    rxLinkSpeedMbps: 866,
    txLinkSpeedMbps: 866,
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
    radioType: undefined,
    rxLinkSpeedMbps: undefined,
    txLinkSpeedMbps: undefined,
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
        // Generate past 35 days of hourly records
        for (let day = 34; day >= 0; day--) {
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

        const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
        const daysFromMonday = (dayOfWeek + 6) % 7;
        const mondayTime = new Date(now.getTime() - daysFromMonday * 86400_000);
        const mondayStr = mondayTime.toISOString().split('T')[0];

        const firstOfThisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();
        const firstOfPrevMonthStr = `${prevMonthYear}-${String(prevMonthNum).padStart(2, '0')}-01`;
        const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        const lastOfPrevMonthStr = lastDayOfPrevMonth.toISOString().split('T')[0];

        if (range === '15m') {
          const cutoff = now.getTime() - 15 * 60 * 1000;
          all = all.filter(r => r.timestamp >= cutoff);
        } else if (range === '1h') {
          const cutoff = now.getTime() - 3600 * 1000;
          all = all.filter(r => r.timestamp >= cutoff);
        } else if (range === '6h') {
          const cutoff = now.getTime() - 6 * 3600 * 1000;
          all = all.filter(r => r.timestamp >= cutoff);
        } else if (range === '24h') {
          const cutoff = now.getTime() - 24 * 3600 * 1000;
          all = all.filter(r => r.timestamp >= cutoff);
        } else if (range === 'today') {
          all = all.filter(r => r.dateStr === todayStr);
        } else if (range === 'yesterday') {
          const yesterdayStr = new Date(now.getTime() - 86400_000).toISOString().split('T')[0];
          all = all.filter(r => r.dateStr === yesterdayStr);
        } else if (range === 'this_week') {
          all = all.filter(r => r.dateStr >= mondayStr);
        } else if (range === '7d') {
          const cutoff = new Date(now.getTime() - 6 * 86400_000).toISOString().split('T')[0];
          all = all.filter(r => r.dateStr >= cutoff);
        } else if (range === '30d') {
          const cutoff = new Date(now.getTime() - 29 * 86400_000).toISOString().split('T')[0];
          all = all.filter(r => r.dateStr >= cutoff);
        } else if (range === 'this_month') {
          all = all.filter(r => r.dateStr >= firstOfThisMonthStr);
        } else if (range === 'prev_month') {
          all = all.filter(r => r.dateStr >= firstOfPrevMonthStr && r.dateStr <= lastOfPrevMonthStr);
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

  deleteHistoryEntry(id: string): boolean {
    try {
      const raw = safeGetStorage(STORAGE_KEYS.HISTORY);
      if (raw) {
        const all: TrafficHistoryRecord[] = JSON.parse(raw);
        const filtered = all.filter(r => r.id !== id);
        safeSetStorage(STORAGE_KEYS.HISTORY, JSON.stringify(filtered));
        return true;
      }
    } catch {}
    return false;
  }

  deleteHistoryRange(startDate: string, endDate: string): number {
    try {
      const raw = safeGetStorage(STORAGE_KEYS.HISTORY);
      if (raw) {
        const all: TrafficHistoryRecord[] = JSON.parse(raw);
        const kept = all.filter(r => r.dateStr < startDate || r.dateStr > endDate);
        const deletedCount = all.length - kept.length;
        safeSetStorage(STORAGE_KEYS.HISTORY, JSON.stringify(kept));
        return deletedCount;
      }
    } catch {}
    return 0;
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

  // --- DNS Management Simulation ---
  getDnsProfiles(): DnsProfile[] {
    const defaultProfiles: DnsProfile[] = [
      {
        id: 'preset_cloudflare',
        name: 'Cloudflare DNS',
        isPreset: true,
        presetId: 'preset_cloudflare',
        ipv4Primary: '1.1.1.1',
        ipv4Secondary: '1.0.0.1',
        ipv6Primary: '2606:4700:4700::1111',
        ipv6Secondary: '2606:4700:4700::1001',
        provider: 'Cloudflare',
        createdAt: 1700000000000,
      },
      {
        id: 'preset_google',
        name: 'Google Public DNS',
        isPreset: true,
        presetId: 'preset_google',
        ipv4Primary: '8.8.8.8',
        ipv4Secondary: '8.8.4.4',
        ipv6Primary: '2001:4860:4860::8888',
        ipv6Secondary: '2001:4860:4860::8844',
        provider: 'Google',
        createdAt: 1700000000000,
      },
      {
        id: 'preset_quad9',
        name: 'Quad9 Secure DNS',
        isPreset: true,
        presetId: 'preset_quad9',
        ipv4Primary: '9.9.9.9',
        ipv4Secondary: '149.112.112.112',
        ipv6Primary: '2620:fe::fe',
        ipv6Secondary: '2620:fe::9',
        provider: 'Quad9',
        createdAt: 1700000000000,
      },
      {
        id: 'preset_adguard',
        name: 'AdGuard DNS (Default)',
        isPreset: true,
        presetId: 'preset_adguard',
        ipv4Primary: '94.140.14.14',
        ipv4Secondary: '94.140.15.15',
        ipv6Primary: '2a10:50c0::ad1:ff',
        ipv6Secondary: '2a10:50c0::ad2:ff',
        provider: 'AdGuard',
        createdAt: 1700000000000,
      },
      {
        id: 'preset_opendns',
        name: 'Cisco OpenDNS',
        isPreset: true,
        presetId: 'preset_opendns',
        ipv4Primary: '208.67.222.222',
        ipv4Secondary: '208.67.220.220',
        ipv6Primary: '2620:119:35::35',
        ipv6Secondary: '2620:119:53::53',
        provider: 'Cisco',
        createdAt: 1700000000000,
      },
    ];

    try {
      const saved = safeGetStorage(STORAGE_KEYS.DNS_PROFILES);
      if (saved) {
        const parsed = JSON.parse(saved) as DnsProfile[];
        const custom = parsed.filter(p => !p.isPreset);
        return [...defaultProfiles, ...custom];
      }
    } catch {}

    return defaultProfiles;
  }

  saveDnsProfile(profile: DnsProfile): boolean {
    const profiles = this.getDnsProfiles();
    const existingIndex = profiles.findIndex(p => p.id === profile.id);
    if (existingIndex >= 0) {
      profiles[existingIndex] = profile;
    } else {
      profiles.push(profile);
    }
    safeSetStorage(STORAGE_KEYS.DNS_PROFILES, JSON.stringify(profiles));
    return true;
  }

  deleteDnsProfile(profileId: string): boolean {
    const profiles = this.getDnsProfiles();
    const filtered = profiles.filter(p => p.id !== profileId || p.isPreset);
    safeSetStorage(STORAGE_KEYS.DNS_PROFILES, JSON.stringify(filtered));
    return true;
  }

  getDnsConfig(adapterAlias = 'Wi-Fi 6'): DnsConfig {
    const alias = adapterAlias || 'Wi-Fi 6';
    try {
      const saved = safeGetStorage(`${STORAGE_KEYS.DNS_CONFIG}_${alias}`);
      if (saved) {
        return JSON.parse(saved);
      }
      const legacy = safeGetStorage(STORAGE_KEYS.DNS_CONFIG);
      if (legacy) {
        const parsed = JSON.parse(legacy) as DnsConfig;
        if (!parsed.adapterAlias || parsed.adapterAlias === alias) {
          return parsed;
        }
      }
    } catch {}

    const matched = SIMULATED_ADAPTERS.find(a => a.name === alias);
    if (matched && matched.status === 'disconnected' && matched.dnsServers.length === 0) {
      return {
        adapterAlias: matched.name,
        adapterDescription: matched.description,
        interfaceIndex: Number(matched.id) || 12,
        isDhcp: true,
        ipv4IsDhcp: true,
        ipv6IsDhcp: true,
        ipv4Servers: [],
        ipv6Servers: [],
        dnsSuffix: null,
        status: 'unconfigured',
        responseTimeMs: null,
        ipv4Reachable: null,
        ipv4LatencyMs: null,
        ipv6Reachable: null,
        ipv6LatencyMs: null,
        testedAt: Date.now(),
        lastError: 'Adapter is disconnected and has no DNS servers assigned.',
      };
    }

    const now = Date.now();
    return {
      adapterAlias: alias,
      adapterDescription: matched?.description || 'Intel(R) Wi-Fi 6 AX201 160MHz',
      interfaceIndex: Number(matched?.id) || 14,
      isDhcp: true,
      ipv4IsDhcp: true,
      ipv6IsDhcp: true,
      ipv4Servers: ['1.1.1.1', '1.0.0.1'],
      ipv6Servers: ['2606:4700:4700::1111', '2606:4700:4700::1001'],
      dnsSuffix: 'lan',
      status: 'configured',
      responseTimeMs: 12.8,
      ipv4Reachable: true,
      ipv4LatencyMs: 12.8,
      ipv6Reachable: true,
      ipv6LatencyMs: 15.1,
      testedAt: now,
      lastError: null,
    };
  }

  setDnsServers(adapterAlias: string, ipv4Servers: string[], ipv6Servers?: string[]): boolean {
    const alias = adapterAlias || 'Wi-Fi 6';
    const current = this.getDnsConfig(alias);
    const nextV4 = ipv4Servers.length > 0 ? ipv4Servers : current.ipv4Servers;
    const nextV4Dhcp = ipv4Servers.length > 0 ? false : (current.ipv4IsDhcp ?? current.isDhcp);
    const nextV6 = ipv6Servers !== undefined ? ipv6Servers : current.ipv6Servers;
    const nextV6Dhcp = ipv6Servers !== undefined && ipv6Servers.length > 0 ? false : (current.ipv6IsDhcp ?? current.isDhcp);

    const probe = nextV4[0] ? this.testDnsServer(nextV4[0]) : nextV6[0] ? this.testDnsServer(nextV6[0]) : null;
    const config: DnsConfig = {
      ...current,
      adapterAlias: alias,
      isDhcp: nextV4Dhcp && nextV6Dhcp,
      ipv4IsDhcp: nextV4Dhcp,
      ipv6IsDhcp: nextV6Dhcp,
      ipv4Servers: nextV4,
      ipv6Servers: nextV6,
      status: nextV4.length === 0 && nextV6.length === 0
        ? 'unconfigured'
        : probe?.reachable
        ? 'configured'
        : 'unreachable',
      responseTimeMs: probe?.reachable ? probe.latencyMs : null,
      ipv4Reachable: nextV4.length > 0 ? (probe?.reachable ?? false) : null,
      ipv4LatencyMs: nextV4.length > 0 && probe?.reachable ? probe.latencyMs : null,
      ipv6Reachable: nextV6.length > 0 ? true : null,
      ipv6LatencyMs: nextV6.length > 0 ? 15.4 : null,
      testedAt: Date.now(),
      lastError: probe && !probe.reachable ? probe.errorMessage || 'Primary resolver unreachable.' : null,
    };
    safeSetStorage(`${STORAGE_KEYS.DNS_CONFIG}_${alias}`, JSON.stringify(config));
    safeSetStorage(STORAGE_KEYS.DNS_CONFIG, JSON.stringify(config));
    return true;
  }

  resetDnsDhcp(adapterAlias: string, family: 'all' | 'ipv4' | 'ipv6' = 'all'): boolean {
    const alias = adapterAlias || 'Wi-Fi 6';
    const current = this.getDnsConfig(alias);
    const resetV4 = family === 'all' || family === 'ipv4';
    const resetV6 = family === 'all' || family === 'ipv6';
    const nextV4 = resetV4 ? ['192.168.1.1'] : current.ipv4Servers;
    const nextV6 = resetV6 ? [] : current.ipv6Servers;
    const nextV4Dhcp = resetV4 ? true : (current.ipv4IsDhcp ?? current.isDhcp);
    const nextV6Dhcp = resetV6 ? true : (current.ipv6IsDhcp ?? current.isDhcp);

    const config: DnsConfig = {
      ...current,
      adapterAlias: alias,
      isDhcp: nextV4Dhcp && nextV6Dhcp,
      ipv4IsDhcp: nextV4Dhcp,
      ipv6IsDhcp: nextV6Dhcp,
      ipv4Servers: nextV4,
      ipv6Servers: nextV6,
      status: nextV4.length > 0 || nextV6.length > 0 ? 'configured' : 'unconfigured',
      responseTimeMs: nextV4.length > 0 ? Math.round((3 + Math.random() * 4) * 10) / 10 : null,
      ipv4Reachable: nextV4.length > 0 ? true : null,
      ipv4LatencyMs: nextV4.length > 0 ? 4.2 : null,
      ipv6Reachable: nextV6.length > 0 ? true : null,
      ipv6LatencyMs: nextV6.length > 0 ? 14.5 : null,
      testedAt: Date.now(),
      lastError: null,
    };
    safeSetStorage(`${STORAGE_KEYS.DNS_CONFIG}_${alias}`, JSON.stringify(config));
    safeSetStorage(STORAGE_KEYS.DNS_CONFIG, JSON.stringify(config));
    return true;
  }

  flushDnsCache(): boolean {
    return true;
  }

  resolveDnsQuery(host: string, recordType = 'A', resolver?: string): DnsQueryResult {
    const cleanHost = host.trim().toLowerCase();
    const type = recordType.toUpperCase();
    const latency = Math.round((8 + Math.random() * 14) * 10) / 10;
    const resolverUsed = resolver && resolver.trim() && resolver.trim().toLowerCase() !== 'system'
      ? resolver.trim()
      : 'System DNS';
    const queriedAt = Date.now();

    if (!cleanHost || /\s/.test(cleanHost) || cleanHost.endsWith('.invalid') || cleanHost.includes('nonexistent')) {
      return {
        query: host.trim(),
        recordType: type,
        records: [],
        detailedRecords: [],
        responseTimeMs: latency,
        resolverUsed,
        queriedAt,
        status: 'error',
        errorMessage: `DNS name does not exist (NXDOMAIN) for "${host.trim()}".`,
      };
    }

    const buildRecords = (vals: string[], ttl = 300) => ({
      records: vals,
      detailedRecords: vals.map(value => ({ value, ttl, recordType: type })),
    });

    let resolved: { records: string[]; detailedRecords: { value: string; ttl: number; recordType: string }[] };
    if (type === 'MX') {
      resolved = buildRecords([`10 mail.${cleanHost}`, `20 alt1.mail.${cleanHost}`], 600);
    } else if (type === 'TXT') {
      resolved = buildRecords([`"v=spf1 include:_spf.${cleanHost} ~all"`], 3600);
    } else if (type === 'CNAME') {
      resolved = buildRecords([`edge.${cleanHost}.cdn.net`], 300);
    } else if (type === 'NS') {
      resolved = buildRecords([`ns1.${cleanHost}`, `ns2.${cleanHost}`], 86400);
    } else if (cleanHost === 'google.com') {
      resolved = buildRecords(
        type === 'AAAA' ? ['2607:f8b0:4004:c07::64'] : ['142.250.190.46', '142.250.190.78'],
        300
      );
    } else if (cleanHost === 'cloudflare.com') {
      resolved = buildRecords(
        type === 'AAAA' ? ['2606:4700::6810:85e5'] : ['104.16.132.229', '104.16.133.229'],
        300
      );
    } else if (cleanHost === 'quad9.net') {
      resolved = buildRecords(
        type === 'AAAA' ? ['2620:fe::9'] : ['9.9.9.9', '149.112.112.112'],
        300
      );
    } else {
      resolved = buildRecords(
        type === 'AAAA' ? ['2606:4700:4700::1111'] : ['104.21.54.12', '172.67.180.44'],
        180
      );
    }

    return {
      query: host.trim(),
      recordType: type,
      records: resolved.records,
      detailedRecords: resolved.detailedRecords,
      responseTimeMs: latency,
      resolverUsed,
      queriedAt,
      status: 'success',
    };
  }

  testDnsServer(serverIp: string, testHost = 'cloudflare.com', recordType = 'A'): DnsTestResult {
    const ip = serverIp.trim();
    const testedAt = Date.now();
    if (!ip || ip.startsWith('192.0.2.') || ip.startsWith('198.51.100.') || ip.startsWith('203.0.113.') || ip === '0.0.0.0') {
      return {
        serverIp: ip,
        reachable: false,
        latencyMs: 0,
        testedAt,
        queryHost: testHost,
        recordType,
        errorMessage: 'Resolver timed out after 1500 ms.',
      };
    }

    const latencies: Record<string, number> = {
      '1.1.1.1': 11.4,
      '1.0.0.1': 12.1,
      '8.8.8.8': 14.8,
      '8.8.4.4': 15.2,
      '9.9.9.9': 18.5,
      '149.112.112.112': 19.1,
      '94.140.14.14': 22.3,
      '94.140.15.15': 23.0,
      '208.67.222.222': 16.7,
      '208.67.220.220': 17.2,
      '192.168.1.1': 3.4,
    };

    const base = latencies[ip] ?? Math.round(15 + Math.random() * 20);
    return {
      serverIp: ip,
      reachable: true,
      latencyMs: Math.round((base + (Math.random() * 2 - 1)) * 10) / 10,
      testedAt,
      queryHost: testHost,
      recordType,
      errorMessage: null,
    };
  }

  // --- Ping Session Persistence Simulation ---
  getPingSessions(limit = 50): PingSessionRecord[] {
    try {
      const saved = safeGetStorage(STORAGE_KEYS.PING_SESSIONS);
      if (saved) {
        const parsed: PingSessionRecord[] = JSON.parse(saved);
        return parsed.slice(0, limit);
      }
    } catch {}

    // Initial realistic ping session records
    const initial: PingSessionRecord[] = [
      {
        id: 'ping_session_1',
        target: '1.1.1.1',
        host: '1.1.1.1',
        startTime: Date.now() - 3600000,
        endTime: Date.now() - 3540000,
        totalRequests: 30,
        successfulRequests: 30,
        failedRequests: 0,
        packetLossPercent: 0,
        minLatencyMs: 10.2,
        maxLatencyMs: 15.6,
        avgLatencyMs: 12.4,
        jitterMs: 1.2,
      },
      {
        id: 'ping_session_2',
        target: '8.8.8.8',
        host: '8.8.8.8',
        startTime: Date.now() - 7200000,
        endTime: Date.now() - 7140000,
        totalRequests: 30,
        successfulRequests: 29,
        failedRequests: 1,
        packetLossPercent: 3.3,
        minLatencyMs: 13.5,
        maxLatencyMs: 24.1,
        avgLatencyMs: 16.2,
        jitterMs: 2.5,
      },
    ];
    return initial;
  }

  savePingSession(session: PingSessionRecord): boolean {
    const sessions = this.getPingSessions(100);
    sessions.unshift(session);
    safeSetStorage(STORAGE_KEYS.PING_SESSIONS, JSON.stringify(sessions.slice(0, 100)));
    return true;
  }

  clearPingSessions(): boolean {
    safeSetStorage(STORAGE_KEYS.PING_SESSIONS, JSON.stringify([]));
    return true;
  }

  deletePingSession(id: string): boolean {
    const sessions = this.getPingSessions(100).filter(s => s.id !== id);
    safeSetStorage(STORAGE_KEYS.PING_SESSIONS, JSON.stringify(sessions));
    return true;
  }

  // --- Persistent Per-Application Accounting Simulation ---
  getAppAccountingRecords(): AppAccountingRecord[] {
    try {
      const saved = safeGetStorage(STORAGE_KEYS.APP_ACCOUNTING);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}

    const initial: AppAccountingRecord[] = [
      {
        appKey: 'c:\\program files\\google\\chrome\\application\\chrome.exe',
        exeName: 'chrome.exe',
        friendlyName: 'Google Chrome',
        fullPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        firstSeen: Date.now() - 86400000 * 7,
        lastSeen: Date.now(),
        lifetimeDownloadBytes: 4_280_000_000,
        lifetimeUploadBytes: 420_000_000,
        lifetimeTotalBytes: 4_700_000_000,
        isRunning: true,
        currentPid: 12408,
        currentDownloadBps: 245_000,
        currentUploadBps: 18_000,
      },
      {
        appKey: 'c:\\program files\\microsoft visual studio\\2022\\community\\devenv.exe',
        exeName: 'devenv.exe',
        friendlyName: 'Microsoft Visual Studio',
        fullPath: 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\devenv.exe',
        firstSeen: Date.now() - 86400000 * 5,
        lastSeen: Date.now() - 1800000,
        lifetimeDownloadBytes: 1_850_000_000,
        lifetimeUploadBytes: 195_000_000,
        lifetimeTotalBytes: 2_045_000_000,
        isRunning: true,
        currentPid: 9840,
        currentDownloadBps: 0,
        currentUploadBps: 0,
      },
      {
        appKey: 'c:\\users\\demon\\appdata\\local\\programs\\discord\\discord.exe',
        exeName: 'Discord.exe',
        friendlyName: 'Discord',
        fullPath: 'C:\\Users\\demon\\AppData\\Local\\Programs\\Discord\\Discord.exe',
        firstSeen: Date.now() - 86400000 * 14,
        lastSeen: Date.now(),
        lifetimeDownloadBytes: 980_000_000,
        lifetimeUploadBytes: 140_000_000,
        lifetimeTotalBytes: 1_120_000_000,
        isRunning: true,
        currentPid: 6732,
        currentDownloadBps: 34_000,
        currentUploadBps: 12_000,
      },
      {
        appKey: 'c:\\program files\\steam\\steam.exe',
        exeName: 'steam.exe',
        friendlyName: 'Steam Client Bootstrapper',
        fullPath: 'C:\\Program Files\\Steam\\steam.exe',
        firstSeen: Date.now() - 86400000 * 10,
        lastSeen: Date.now() - 3600000 * 4,
        lifetimeDownloadBytes: 14_800_000_000,
        lifetimeUploadBytes: 310_000_000,
        lifetimeTotalBytes: 15_110_000_000,
        isRunning: false,
        currentPid: undefined,
        currentDownloadBps: 0,
        currentUploadBps: 0,
      },
      {
        appKey: 'c:\\program files\\spotify\\spotify.exe',
        exeName: 'Spotify.exe',
        friendlyName: 'Spotify Music',
        fullPath: 'C:\\Program Files\\Spotify\\Spotify.exe',
        firstSeen: Date.now() - 86400000 * 6,
        lastSeen: Date.now(),
        lifetimeDownloadBytes: 850_000_000,
        lifetimeUploadBytes: 25_000_000,
        lifetimeTotalBytes: 875_000_000,
        isRunning: true,
        currentPid: 14920,
        currentDownloadBps: 110_000,
        currentUploadBps: 3_500,
      },
    ];

    safeSetStorage(STORAGE_KEYS.APP_ACCOUNTING, JSON.stringify(initial));
    return initial;
  }

  getAppTrafficSamples(appKey: string, limit = 48): AppSampleRecord[] {
    const samples: AppSampleRecord[] = [];
    const now = Date.now();
    for (let i = 0; i < Math.min(limit, 24); i++) {
      const time = now - i * 3600000;
      const d = new Date(time);
      const dateStr = d.toISOString().split('T')[0];
      const hourStr = `${String(d.getHours()).padStart(2, '0')}:00`;
      samples.push({
        id: `${appKey}_${time}`,
        appKey,
        timestamp: time,
        dateStr,
        hourStr,
        downloadBytes: Math.floor(10_000_000 + Math.random() * 40_000_000),
        uploadBytes: Math.floor(1_000_000 + Math.random() * 5_000_000),
      });
    }
    return samples;
  }

  clearAppAccounting(appKey?: string): boolean {
    if (appKey) {
      const records = this.getAppAccountingRecords().filter(r => r.appKey !== appKey);
      safeSetStorage(STORAGE_KEYS.APP_ACCOUNTING, JSON.stringify(records));
    } else {
      safeSetStorage(STORAGE_KEYS.APP_ACCOUNTING, JSON.stringify([]));
    }
    return true;
  }
}

export const webSimulation = new SimulationState();
export { SIMULATED_ADAPTERS };
