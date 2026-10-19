import { describe, expect, it } from 'vitest';
import { normalizePingResult } from '../src/utils/normalizers';
import { DEFAULT_ACCENT_COLOR, getAccentCssVariables, normalizeHexColor } from '../src/utils/appearance';

describe('normalizePingResult', () => {
  it('normalizes Rust snake_case response fields to the frontend contract', () => {
    const result = normalizePingResult({
      target: '1.1.1.1', host: '1.1.1.1', latency_ms: 14.5,
      min_latency_ms: 12, max_latency_ms: 18, avg_latency_ms: 14.5,
      jitter_ms: 1.1, packet_loss_percent: 0, last_checked: 123,
      status: 'success', history: [12, 14.5],
    });
    expect(result.latencyMs).toBe(14.5);
    expect(result.minLatencyMs).toBe(12);
    expect(result.maxLatencyMs).toBe(18);
    expect(result.avgLatencyMs).toBe(14.5);
    expect(result.history).toEqual([12, 14.5]);
  });
  it('fills missing numeric fields and ignores invalid history without throwing', () => {
    const result = normalizePingResult({ latency_ms: 8, history: ['bad', null, 8] }, '9.9.9.9');
    expect(result.target).toBe('9.9.9.9');
    expect(result.latencyMs).toBe(8);
    expect(result.minLatencyMs).toBe(8);
    expect(result.maxLatencyMs).toBe(8);
    expect(result.avgLatencyMs).toBe(8);
    expect(result.history).toEqual([8]);
    expect(result.status).toBe('error');
  });
  it('does not invent a zero-millisecond sample when a probe fails', () => {
    const result = normalizePingResult({ status: 'timeout', latency_ms: 0, history: [] });
    expect(result.status).toBe('timeout');
    expect(result.history).toEqual([]);
  });
  it('handles null payloads safely', () => {
    const result = normalizePingResult(null);
    expect(result.latencyMs).toBe(0);
    expect(result.minLatencyMs).toBe(0);
    expect(result.maxLatencyMs).toBe(0);
    expect(result.history).toEqual([]);
    expect(result.status).toBe('error');
  });
});
describe('accent palette', () => {
  it('validates and normalizes six-digit hexadecimal colors', () => {
    expect(normalizeHexColor('#EC4899')).toBe('#ec4899');
    expect(normalizeHexColor('38bdf8')).toBe('#38bdf8');
    expect(normalizeHexColor('not-a-color')).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });
  it('maps the selected color into Tailwind accent tokens', () => {
    const variables = getAccentCssVariables('#ec4899');
    expect(variables['--color-sky-400']).toBe('#ec4899');
    expect(variables['--color-sky-500']).toBe('#ec4899');
    expect(variables['--color-sky-300']).not.toBe(DEFAULT_ACCENT_COLOR);
    expect(Object.keys(variables)).toContain('--color-sky-950');
  });
});
