import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatSpeed,
  formatLatency,
  formatJitter,
  formatPercent,
  formatTime,
} from '../src/utils/formatters';

describe('Formatters and Tabular Numerals Utility', () => {
  it('formats zero and edge cases correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatSpeed(0).full).toBe('0.0 KB/s');
    expect(formatLatency(-1)).toBe('-- ms');
  });

  it('formats raw byte values accurately using 1024 binary boundaries', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('formats speeds in bytes-per-second with appropriate units', () => {
    const kbSpeed = formatSpeed(250 * 1024);
    expect(kbSpeed.unit).toBe('KB/s');
    expect(kbSpeed.value).toBe('250');

    const mbSpeed = formatSpeed(12.5 * 1024 * 1024);
    expect(mbSpeed.unit).toBe('MB/s');
    expect(mbSpeed.value).toBe('12.5');
  });

  it('formats ping latency and jitter accurately', () => {
    expect(formatLatency(0.4)).toBe('< 1 ms');
    expect(formatLatency(14.24)).toBe('14.2 ms');
    expect(formatJitter(1.23)).toBe('±1.2 ms');
    expect(formatPercent(99.6)).toBe('100%');
  });
});
