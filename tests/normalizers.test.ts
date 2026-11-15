import { describe, expect, it } from 'vitest';
import {
  normalizeNetworkAdapter,
  normalizeNetworkAdapters,
  normalizePingResult,
} from '../src/utils/normalizers';
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

describe('normalizeNetworkAdapter', () => {
  it('normalizes snake_case and string telemetry fields for Wi-Fi adapters', () => {
    const adapter = normalizeNetworkAdapter({
      id: '14',
      name: 'Wi-Fi',
      description: 'Intel(R) Wi-Fi 6 AX201',
      type: 'wifi',
      status: 'connected',
      local_ipv4: '192.168.1.42',
      mac_address: '70-66-55-44-33-22',
      gateway: '192.168.1.1',
      dns_servers: ['1.1.1.1', ''],
      signal_percent: '89',
      signal_dbm: '-55',
      ssid: 'Studio-5G',
      radio_type: '802.11ax',
      rx_link_speed_mbps: '866',
      tx_link_speed_mbps: 780,
      speed_mbps: 0,
      is_default: true,
    });

    expect(adapter.localIPv4).toBe('192.168.1.42');
    expect(adapter.macAddress).toBe('70-66-55-44-33-22');
    expect(adapter.dnsServers).toEqual(['1.1.1.1']);
    expect(adapter.signalPercent).toBe(89);
    expect(adapter.signalDbm).toBe(-55);
    expect(adapter.ssid).toBe('Studio-5G');
    expect(adapter.radioType).toBe('802.11ax');
    expect(adapter.rxLinkSpeedMbps).toBe(866);
    expect(adapter.txLinkSpeedMbps).toBe(780);
    expect(adapter.speedMbps).toBe(866);
    expect(adapter.isDefault).toBe(true);
  });

  it('clamps signalPercent and ignores null optional Wi-Fi metadata', () => {
    const adapter = normalizeNetworkAdapter({
      id: '12',
      name: 'Ethernet',
      type: 'ethernet',
      status: 'connected',
      signalPercent: 140,
      signalDbm: null,
      ssid: null,
      speedMbps: 2500,
    });

    expect(adapter.signalPercent).toBe(100);
    expect(adapter.signalDbm).toBeUndefined();
    expect(adapter.ssid).toBeUndefined();
    expect(adapter.speedMbps).toBe(2500);
  });

  it('normalizes both array and wrapped adapters payloads safely', () => {
    expect(normalizeNetworkAdapters(null)).toEqual([]);
    const list = normalizeNetworkAdapters({
      adapters: [{ id: '1', name: 'Wi-Fi', type: 'wifi', status: 'connected', signalPercent: 72 }],
    });
    expect(list).toHaveLength(1);
    expect(list[0].signalPercent).toBe(72);
  });
});
