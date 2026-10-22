import {
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
  AppSettings,
} from '../types/network';

// Web Simulation Engine for Browser & Cloud Run Preview environments
// Provides realistic, fully interactive live Windows network telemetry

const STORAGE_KEYS = {
  SETTINGS: 'netscope_settings',
  BLOCKED_EXES: 'netscope_sim_blocked_exes',
  HISTORY: 'netscope_sim_history',
  SESSION_ACCUMULATOR: 'netscope_sim_session',
};

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
  {
    id: '28',
    name: 'WireGuard Tunnel',
    description: 'WireGuard Tunnel Adapter (wg0-secure)',
    type: 'virtual',
    status: 'connected',
    localIPv4: '10.66.66.2',
    localIPv6: 'fd42:42:42::2',
    macAddress: '00-00-00-00-00-00',
    gateway: '10.66.66.1',
    dnsServers: ['10.66.66.1'],
    signalPercent: undefined,
    signalDbm: undefined,
    ssid: undefined,
    speedMbps: 1000,
    isDefault: false,
  },
  {
    id: '31',
    name: 'vEthernet (Default Switch)',
    description: 'Hyper-V Virtual Ethernet Adapter',
    type: 'virtual',
    status: 'connected',
    localIPv4: '172.28.16.1',
    localIPv6: '',
    macAddress: '00-15-5D-78-90-AB',
    gateway: '',
    dnsServers: [],
    signalPercent: undefined,
    signalDbm: undefined,
    ssid: undefined,
    speedMbps: 10000,
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
      const raw = localStorage.getItem(STORAGE_KEYS.BLOCKED_EXES);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  }

  setBlockedExes(blocked: Set<string>): void {
    try {
      localStorage.setItem(STORAGE_KEYS.BLOCKED_EXES, JSON.stringify(Array.from(blocked)));
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

  getLiveStats(adapterId: string): NetworkStats {
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
    const downBps = Math.max(150_000, Math.round(baseDown + noiseDown));

    const baseUp = 850_000 + Math.cos(Date.now() / 5000) * 400_000;
    const noiseUp = (Math.random() * 0.4 - 0.2) * baseUp;
    const upBps = Math.max(45_000, Math.round(baseUp + noiseUp));

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

  getPing(target: string): PingResult {
    const cleanTarget = target.trim() || '1.1.1.1';
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
        icon: '',
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
      if (!localStorage.getItem(STORAGE_KEYS.HISTORY)) {
        const initial: TrafficHistoryRecord[] = [];
        const now = new Date();
        for (let i = 23; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 3600_000);
          const dateStr = d.toISOString().split('T')[0];
          const hourStr = `${String(d.getHours()).padStart(2, '0')}:00`;
          const baseMB = 120 + Math.sin(i / 3) * 80 + Math.random() * 40;
          const downBytes = Math.round(baseMB * 1024 * 1024);
          const upBytes = Math.round((baseMB * 0.28) * 1024 * 1024);

          initial.push({
            id: `${dateStr}-${hourStr}`,
            timestamp: d.getTime(),
            dateStr,
            hourStr,
            downloadBytes: downBytes,
            uploadBytes: upBytes,
            topApp: i % 2 === 0 ? 'Google Chrome' : 'Discord Canary',
          });
        }
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(initial));
      }
    } catch {}
  }

  getHistory(range = 'today'): TrafficHistoryRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (raw) {
        const all: TrafficHistoryRecord[] = JSON.parse(raw);
        if (range === 'today') {
          const today = new Date().toISOString().split('T')[0];
          return all.filter(r => r.dateStr === today);
        }
        return all;
      }
    } catch {}
    return [];
  }

  clearHistory(): boolean {
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
      return true;
    } catch {
      return false;
    }
  }

  exportHistory(format: 'csv' | 'json', range = 'today'): string {
    const records = this.getHistory(range);
    if (format === 'json') {
      return JSON.stringify(records, null, 2);
    }

    const headers = ['ID', 'Timestamp', 'Date', 'Hour', 'DownloadBytes', 'UploadBytes', 'TotalBytes', 'TopApp'];
    const rows = records.map(r => [
      `"${r.id}"`,
      r.timestamp,
      `"${r.dateStr}"`,
      `"${r.hourStr}"`,
      r.downloadBytes,
      r.uploadBytes,
      r.downloadBytes + r.uploadBytes,
      `"${(r.topApp || '').replace(/"/g, '""')}"`,
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  getSettings(): AppSettings {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch {}

    return {
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
  }

  saveSettings(settings: AppSettings): boolean {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }
}

export const webSimulation = new SimulationState();
export { SIMULATED_ADAPTERS };
