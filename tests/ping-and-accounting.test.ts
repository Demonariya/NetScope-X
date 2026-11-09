import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';
import { PingSessionRecord } from '../src/types/network';

describe('Ping Session Persistence & App Accounting', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('saves and retrieves past ping sessions', async () => {
    const session: PingSessionRecord = {
      id: 'session_test_1',
      target: '1.1.1.1',
      host: '1.1.1.1',
      startTime: 1700000000000,
      endTime: 1700000060000,
      totalRequests: 20,
      successfulRequests: 20,
      failedRequests: 0,
      packetLossPercent: 0,
      minLatencyMs: 11.2,
      maxLatencyMs: 16.5,
      avgLatencyMs: 13.4,
      jitterMs: 1.1,
    };

    const saved = await api.savePingSession(session);
    expect(saved).toBe(true);

    const sessions = await api.getPingSessions(10);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.some(s => s.id === 'session_test_1')).toBe(true);

    const cleared = await api.clearPingSessions();
    expect(cleared).toBe(true);

    const afterClear = await api.getPingSessions(10);
    expect(afterClear.length).toBe(0);
  });

  it('fetches persistent per-application accounting records', async () => {
    const records = await api.getAppAccountingRecords();
    expect(records.length).toBeGreaterThan(0);

    const chrome = records.find(r => r.exeName.toLowerCase().includes('chrome'));
    expect(chrome).toBeDefined();
    expect(chrome?.lifetimeDownloadBytes).toBeGreaterThan(0);
    expect(chrome?.lifetimeTotalBytes).toBe(
      (chrome?.lifetimeDownloadBytes || 0) + (chrome?.lifetimeUploadBytes || 0)
    );
  });

  it('fetches historical traffic samples for an application', async () => {
    const records = await api.getAppAccountingRecords();
    const appKey = records[0].appKey;

    const samples = await api.getAppTrafficSamples(appKey, 12);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0].appKey).toBe(appKey);
    expect(samples[0].downloadBytes).toBeGreaterThanOrEqual(0);
  });

  it('clears specific application accounting without affecting others', async () => {
    const records = await api.getAppAccountingRecords();
    const targetKey = records[0].appKey;
    const initialCount = records.length;

    await api.clearAppAccounting(targetKey);

    const updated = await api.getAppAccountingRecords();
    expect(updated.some(r => r.appKey === targetKey)).toBe(false);
    expect(updated.length).toBe(initialCount - 1);
  });
});
