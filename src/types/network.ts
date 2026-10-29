export type AdapterDiscoveryStatus = 'loading' | 'available' | 'empty' | 'error' | 'desktop-required';

export type ConnectionType = 'wifi' | 'ethernet' | 'usb_tether' | 'cellular' | 'virtual' | 'loopback';

export type AdapterStatus = 'connected' | 'disconnected' | 'connecting';

export interface NetworkAdapter {
  id: string;
  name: string;
  description: string;
  type: ConnectionType;
  status: AdapterStatus;
  localIPv4: string;
  localIPv6: string;
  macAddress: string;
  gateway: string;
  dnsServers: string[];
  signalPercent?: number; // for wifi (0-100)
  signalDbm?: number; // for wifi
  ssid?: string; // for wifi
  speedMbps: number;
  isDefault: boolean;
}

export interface NetworkStats {
  timestamp: number;
  downloadBps: number;
  uploadBps: number;
  sessionDownloadBytes: number;
  sessionUploadBytes: number;
  totalSessionBytes: number;
  dailyDownloadBytes: number;
  dailyUploadBytes: number;
  activeAdapterId: string;
}

export type PingStatus =
  | 'success'
  | 'timeout'
  | 'dns_error'
  | 'unreachable'
  | 'invalid_target'
  | 'error';

export interface PingResult {
  target: string;
  host: string;
  latencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  status: PingStatus;
  lastChecked: number;
  history: number[];
}

export type SocketProtocol = 'TCP' | 'UDP';
export type TcpState =
  | 'ESTABLISHED'
  | 'CLOSE_WAIT'
  | 'TIME_WAIT'
  | 'LISTENING'
  | 'SYN_SENT'
  | 'SYN_RCVD'
  | 'FIN_WAIT_1'
  | 'FIN_WAIT_2'
  | 'CLOSED'
  | 'LAST_ACK';

export type SocketState = TcpState | 'BOUND';

export interface SocketConnection {
  id: string;
  protocol: SocketProtocol;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: SocketState;
  pid: number;
  processName: string;
  bytesSent: number | null;
  bytesReceived: number | null;
}

export interface ProcessNetworkUsage {
  pid: number;
  name: string;
  friendlyName: string;
  exeName: string;
  fullPath: string;
  icon: string; // Base64 data URL or SVG markup
  downloadBps: number;
  uploadBps: number;
  sessionDownloadBytes: number;
  sessionUploadBytes: number;
  totalBytes: number;
  connectionCount: number;
  status: 'active' | 'idle' | 'terminated';
  isBlocked?: boolean;
  trafficAvailable?: boolean;
  startTime: number;
  recentSpeedHistory: { time: number; down: number; up: number }[];
  connections: SocketConnection[];
}

export interface TrafficHistoryRecord {
  id: string;
  timestamp: number;
  dateStr: string;
  hourStr: string;
  downloadBytes: number;
  uploadBytes: number;
  topApp: string;
}

export interface AppSettings {
  monitoring: {
    enabled: boolean;
    perAppEnabled: boolean;
    adapterId: string; // 'auto' or specific adapter id
    updateIntervalMs: number;
  };
  diagnostics: {
    activePingTarget: string;
    pingIntervalMs: number;
    pingTimeoutMs?: number;
  };
  startup: {
    startWithWindows: boolean;
    minimizeToTrayOnClose: boolean;
  };
  storage: {
    dataRetentionDays: number;
  };
  appearance: {
    theme: 'dark' | 'light' | 'system';
    accentColor: string;
  };
}

export type CanvasMode = 'portrait_9_16';
