import type { PingResult } from '../types/network';

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
function nonEmptyString(record: UnknownRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
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
  const packetLossPercent = Math.min(100, Math.max(0, finiteNumber(record, ['packetLossPercent', 'packet_loss_percent'], 0)));
  const lastChecked = Math.max(0, finiteNumber(record, ['lastChecked', 'last_checked'], Date.now()));
  const rawStatus = nonEmptyString(record, ['status'], 'error').toLowerCase();
  const status: PingResult['status'] =
    rawStatus === 'success' || rawStatus === 'timeout' || rawStatus === 'error' ? rawStatus : 'error';
  const history = Array.isArray(record.history)
    ? record.history.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    : [];
  return {
    target, host, latencyMs, minLatencyMs, maxLatencyMs, avgLatencyMs,
    jitterMs, packetLossPercent, status, lastChecked,
    history: history.length > 0 ? history : (status === 'success' ? [latencyMs] : []),
  };
}
