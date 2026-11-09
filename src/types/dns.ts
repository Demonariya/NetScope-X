export interface DnsConfig {
  adapterAlias: string;
  isDhcp: boolean;
  ipv4Servers: string[];
  ipv6Servers: string[];
  status: string;
  responseTimeMs: number | null;
}

export interface DnsProfile {
  id: string;
  name: string;
  isPreset: boolean;
  presetId?: string;
  ipv4Primary: string;
  ipv4Secondary?: string;
  ipv6Primary?: string;
  ipv6Secondary?: string;
  provider?: string;
  createdAt: number;
}

export interface DnsQueryResult {
  query: string;
  recordType: string;
  records: string[];
  responseTimeMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface DnsTestResult {
  serverIp: string;
  reachable: boolean;
  latencyMs: number;
}
