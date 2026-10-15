/**
 * Formats a raw byte count into human-readable data size (B, KB, MB, GB, TB).
 * Follows 1024 binary scale.
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIndex = Math.min(i, sizes.length - 1);
  const value = bytes / Math.pow(k, clampedIndex);

  return `${value.toFixed(clampedIndex === 0 ? 0 : decimals)} ${sizes[clampedIndex]}`;
}

/**
 * Formats bytes-per-second into human-readable transfer rate (B/s, KB/s, MB/s, GB/s).
 */
export function formatSpeed(bps: number, decimals: number = 1): { value: string; unit: string; full: string } {
  if (bps <= 0 || !Number.isFinite(bps)) {
    return { value: '0.0', unit: 'KB/s', full: '0.0 KB/s' };
  }

  const k = 1024;
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  const clampedIndex = Math.min(Math.max(i, 0), units.length - 1);
  const value = bps / Math.pow(k, clampedIndex);

  const formattedVal = value >= 100 ? value.toFixed(0) : value.toFixed(decimals);
  const unit = units[clampedIndex];

  return {
    value: formattedVal,
    unit,
    full: `${formattedVal} ${unit}`,
  };
}

/**
 * Formats millisecond latency with 1 decimal place.
 */
export function formatLatency(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '-- ms';
  if (ms < 1) return '< 1 ms';
  return `${ms.toFixed(1)} ms`;
}

/**
 * Formats millisecond jitter.
 */
export function formatJitter(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '0.0 ms';
  return `±${ms.toFixed(1)} ms`;
}

/**
 * Formats percentage.
 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Formats unix timestamp to HH:mm:ss.
 */
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
