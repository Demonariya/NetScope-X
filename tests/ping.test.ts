import { describe, it, expect } from 'vitest';
import { normalizePingResult } from '../src/utils/normalizers';
import { webSimulation } from '../src/services/webSimulation';

describe('Ping Timeouts & Typed Statuses — Priority Two Requirements', () => {
  it('normalizes typed statuses: success, timeout, dns_error, unreachable, invalid_target', () => {
    const statuses = ['success', 'timeout', 'dns_error', 'unreachable', 'invalid_target'] as const;

    for (const status of statuses) {
      const res = normalizePingResult({ status, latency_ms: status === 'success' ? 15.2 : 0 });
      expect(res.status).toBe(status);
    }
  });

  it('reports 100% packet loss and empty latency history for failed/timed-out probes', () => {
    const timeoutRes = normalizePingResult({ status: 'timeout', latency_ms: 0, history: [] });
    expect(timeoutRes.status).toBe('timeout');
    expect(timeoutRes.packetLossPercent).toBe(100);
    expect(timeoutRes.history).toEqual([]);

    const dnsRes = normalizePingResult({ status: 'dns_error', latency_ms: 0, history: [] });
    expect(dnsRes.status).toBe('dns_error');
    expect(dnsRes.packetLossPercent).toBe(100);
  });

  it('webSimulation returns typed invalid_target for malformed targets', () => {
    const res = webSimulation.getPing('');
    expect(res.status).toBe('invalid_target');
    expect(res.packetLossPercent).toBe(100);
    expect(res.history).toHaveLength(0);

    const spaceRes = webSimulation.getPing('invalid target with space');
    expect(spaceRes.status).toBe('invalid_target');
  });

  it('webSimulation returns typed dns_error for non-existent domains', () => {
    const res = webSimulation.getPing('nonexistent.fake-domain.test');
    expect(res.status).toBe('dns_error');
    expect(res.packetLossPercent).toBe(100);
  });

  it('webSimulation returns timeout for simulated unresponsive hosts', () => {
    const res = webSimulation.getPing('192.0.2.1');
    expect(res.status).toBe('timeout');
    expect(res.packetLossPercent).toBe(100);
  });

  it('webSimulation returns success with real positive latency for valid hosts', () => {
    const res = webSimulation.getPing('1.1.1.1');
    expect(res.status).toBe('success');
    expect(res.latencyMs).toBeGreaterThan(0);
    expect(res.packetLossPercent).toBe(0);
    expect(res.history.length).toBeGreaterThan(0);
  });
});
