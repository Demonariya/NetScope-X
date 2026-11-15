import type {
  AdapterStatus,
  ConnectionType,
  NetworkAdapter,
  PingResult,
} from '../types/network';

type UnknownRecord = Record<string, unknown>;
function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}
function finiteNumber(record: UnknownRecord, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}
function optionalFiniteNumber(record: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}
function nonEmptyString(record: UnknownRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}
function optionalNonEmptyString(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

const VALID_CONNECTION_TYPES: ConnectionType[] = [
  'wifi',
  'ethernet',
  'usb_tether',
  'cellular',
  'virtual',
  'loopback',
];

const VALID_ADAPTER_STATUSES: AdapterStatus[] = ['connected', 'disconnected', 'connecting'];

/** Normalize native adapter telemetry into the frontend's camelCase contract. */
export function normalizeNetworkAdapter(input: unknown): NetworkAdapter {
  const record = asRecord(input);
  const rawType = nonEmptyString(record, ['type'], 'ethernet').toLowerCase();
  const type: ConnectionType = VALID_CONNECTION_TYPES.includes(rawType as ConnectionType)
    ? (rawType as ConnectionType)
    : 'ethernet';

  const rawStatus = nonEmptyString(record, ['status'], 'disconnected').toLowerCase();
  const status: AdapterStatus = VALID_ADAPTER_STATUSES.includes(rawStatus as AdapterStatus)
    ? (rawStatus as AdapterStatus)
    : 'disconnected';

  const rawSignal = optionalFiniteNumber(record, ['signalPercent', 'signal_percent']);
  const signalPercent =
    rawSignal !== undefined ? Math.min(100, Math.max(0, Math.round(rawSignal))) : undefined;

  const rawDbm = optionalFiniteNumber(record, ['signalDbm', 'signal_dbm']);
  const signalDbm = rawDbm !== undefined ? Math.round(rawDbm) : undefined;

  const rawRx = optionalFiniteNumber(record, ['rxLinkSpeedMbps', 'rx_link_speed_mbps']);
  const rxLinkSpeedMbps = rawRx !== undefined && rawRx > 0 ? Math.round(rawRx) : undefined;

  const rawTx = optionalFiniteNumber(record, ['txLinkSpeedMbps', 'tx_link_speed_mbps']);
  const txLinkSpeedMbps = rawTx !== undefined && rawTx > 0 ? Math.round(rawTx) : undefined;

  const parsedSpeed = Math.max(
    0,
    Math.round(finiteNumber(record, ['speedMbps', 'speed_mbps'], 0))
  );
  const speedMbps =
    parsedSpeed > 0
      ? parsedSpeed
      : Math.max(rxLinkSpeedMbps ?? 0, txLinkSpeedMbps ?? 0);

  const dnsRaw = record.dnsServers ?? record.dns_servers;
  const dnsServers = Array.isArray(dnsRaw)
    ? dnsRaw.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map(s => s.trim())
    : [];

  return {
    id: nonEmptyString(record, ['id'], ''),
    name: nonEmptyString(record, ['name'], 'Network Adapter'),
    description: nonEmptyString(record, ['description'], ''),
    type,
    status,
    localIPv4: nonEmptyString(record, ['localIPv4', 'local_ipv4'], ''),
    localIPv6: nonEmptyString(record, ['localIPv6', 'local_ipv6'], ''),
    macAddress: nonEmptyString(record, ['macAddress', 'mac_address'], ''),
    gateway: nonEmptyString(record, ['gateway'], ''),
    dnsServers,
    signalPercent,
    signalDbm,
    ssid: optionalNonEmptyString(record, ['ssid']),
    radioType: optionalNonEmptyString(record, ['radioType', 'radio_type']),
    rxLinkSpeedMbps,
    txLinkSpeedMbps,
    speedMbps,
    isDefault: Boolean(record.isDefault ?? record.is_default ?? false),
  };
}

export function normalizeNetworkAdapters(input: unknown): NetworkAdapter[] {
  if (Array.isArray(input)) {
    return input.map(item => normalizeNetworkAdapter(item));
  }
  const record = asRecord(input);
  if (Array.isArray(record.adapters)) {
    return record.adapters.map(item => normalizeNetworkAdapter(item));
  }
  return [];
}

/** Normalize native telemetry into the frontend's camelCase contract. */
export function normalizePingResult(input: unknown, fallbackHost = '1.1.1.1'): PingResult {
  const record = asRecord(input);
  const target = nonEmptyString(record, ['target', 'host'], fallbackHost);
  const host = nonEmptyString(record, ['host', 'target'], target);
  const latencyMs = Math.max(0, finiteNumber(record, ['latencyMs', 'latency_ms'], 0));
  const minLatencyMs = Math.max(0, finiteNumber(record, ['minLatencyMs', 'min_latency_ms'], latencyMs));
  const maxLatencyMs = Math.max(minLatencyMs, finiteNumber(record, ['maxLatencyMs', 'max_latency_ms'], latencyMs));
  const avgLatencyMs = Math.max(0, finiteNumber(record, ['avgLatencyMs', 'avg_latency_ms'], latencyMs));
  const jitterMs = Math.max(0, finiteNumber(record, ['jitterMs', 'jitter_ms'], 0));
  const rawStatus = nonEmptyString(record, ['status'], 'error').toLowerCase();
  const validStatuses: PingResult['status'][] = [
    'success',
    'timeout',
    'dns_error',
    'unreachable',
    'invalid_target',
    'error',
  ];
  const status: PingResult['status'] = validStatuses.includes(rawStatus as PingResult['status'])
    ? (rawStatus as PingResult['status'])
    : 'error';
  const defaultLoss = status === 'success' ? 0 : 100;
  const packetLossPercent = Math.min(
    100,
    Math.max(0, finiteNumber(record, ['packetLossPercent', 'packet_loss_percent'], defaultLoss))
  );
  const lastChecked = Math.max(0, finiteNumber(record, ['lastChecked', 'last_checked'], Date.now()));
  const history = Array.isArray(record.history)
    ? record.history.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    : [];
  return {
    target, host, latencyMs, minLatencyMs, maxLatencyMs, avgLatencyMs,
    jitterMs, packetLossPercent, status, lastChecked,
    history: history.length > 0 ? history : (status === 'success' ? [latencyMs] : []),
  };
}
