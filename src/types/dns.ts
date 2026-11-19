export interface DnsConfig {
  adapterAlias: string;
  adapterDescription?: string | null;
  interfaceIndex?: number | null;
  isDhcp: boolean;
  ipv4IsDhcp?: boolean;
  ipv6IsDhcp?: boolean;
  ipv4Servers: string[];
  ipv6Servers: string[];
  dnsSuffix?: string | null;
  status: 'configured' | 'partial' | 'unconfigured' | 'unreachable' | 'unavailable' | 'error' | string;
  responseTimeMs: number | null;
  ipv4Reachable?: boolean | null;
  ipv4LatencyMs?: number | null;
  ipv6Reachable?: boolean | null;
  ipv6LatencyMs?: number | null;
  testedAt?: number | null;
  lastError?: string | null;
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
  description?: string;
  createdAt: number;
}

export interface DnsResourceRecord {
  value: string;
  ttl?: number | null;
  recordType: string;
}

export interface DnsQueryResult {
  query: string;
  recordType: string;
  records: string[];
  detailedRecords?: DnsResourceRecord[];
  responseTimeMs: number;
  resolverUsed?: string;
  queriedAt?: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface DnsTestResult {
  serverIp: string;
  reachable: boolean;
  latencyMs: number;
  testedAt?: number;
  queryHost?: string;
  recordType?: string;
  errorMessage?: string | null;
}

export interface DnsActivityEntry {
  id: string;
  timestamp: number;
  hostname: string;
  recordType: string;
  resolver: string;
  responseTimeMs: number;
  status: 'success' | 'error';
  recordCount: number;
  errorMessage?: string;
}
