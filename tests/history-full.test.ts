import { describe, it, expect, beforeEach } from 'vitest';
import { webSimulation } from '../src/services/webSimulation';
import { api } from '../src/services/api';
import { HistoryRange } from '../src/types/network';

describe('History Module Comprehensive Functionality', () => {
  beforeEach(() => {
    // Ensure history is initialized
    webSimulation.getHistory('today');
  });

  it('supports all required granular and calendar time ranges without throwing errors', () => {
    const ranges: HistoryRange[] = [
      '15m',
      '1h',
      '6h',
      '24h',
      'today',
      'yesterday',
      'this_week',
      '7d',
      '30d',
      'this_month',
      'prev_month',
      'all',
      'custom',
    ];

    for (const range of ranges) {
      const records = webSimulation.getHistory(range);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it('filters 24h range to records within the last 24 hours', () => {
    const records = webSimulation.getHistory('24h');
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const record of records) {
      expect(record.timestamp).toBeGreaterThanOrEqual(cutoff);
    }
  });

  it('filters today and yesterday correctly to distinct calendar days', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400_000).toISOString().split('T')[0];

    const todayRecords = webSimulation.getHistory('today');
    for (const record of todayRecords) {
      expect(record.dateStr).toBe(todayStr);
    }

    const yesterdayRecords = webSimulation.getHistory('yesterday');
    for (const record of yesterdayRecords) {
      expect(record.dateStr).toBe(yesterdayStr);
    }
  });

  it('deletes an individual traffic record by ID via api.deleteHistoryRecord', async () => {
    const allRecords = webSimulation.getHistory('all');
    expect(allRecords.length).toBeGreaterThan(0);

    const target = allRecords[0];
    const success = await api.deleteHistoryRecord(target.id);
    expect(success).toBe(true);

    const afterDelete = webSimulation.getHistory('all');
    expect(afterDelete.some(r => r.id === target.id)).toBe(false);
  });

  it('deletes a date range of records via api.deleteHistoryRange', async () => {
    const startDate = new Date(Date.now() - 20 * 86400_000).toISOString().split('T')[0];
    const endDate = new Date(Date.now() - 15 * 86400_000).toISOString().split('T')[0];

    const deletedCount = await api.deleteHistoryRange(startDate, endDate);
    expect(typeof deletedCount).toBe('number');

    const remaining = webSimulation.getHistory('all');
    for (const r of remaining) {
      expect(r.dateStr >= startDate && r.dateStr <= endDate).toBe(false);
    }
  });

  it('saves, queries, and deletes ping probe sessions via api', async () => {
    const testSession = {
      id: `ping_test_${Date.now()}`,
      target: '1.1.1.1',
      host: '1.1.1.1',
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      totalRequests: 10,
      successfulRequests: 10,
      failedRequests: 0,
      packetLossPercent: 0,
      minLatencyMs: 11.2,
      maxLatencyMs: 18.5,
      avgLatencyMs: 14.1,
      jitterMs: 1.5,
    };

    await api.savePingSession(testSession);
    const sessions = await api.getPingSessions(50);
    expect(sessions.some(s => s.id === testSession.id)).toBe(true);

    const deleted = await api.deletePingSession(testSession.id);
    expect(deleted).toBe(true);

    const sessionsAfter = await api.getPingSessions(50);
    expect(sessionsAfter.some(s => s.id === testSession.id)).toBe(false);
  });

  it('clears and retrieves persistent app accounting records', async () => {
    const apps = await api.getAppAccountingRecords();
    expect(Array.isArray(apps)).toBe(true);

    if (apps.length > 0) {
      const targetApp = apps[0];
      const cleared = await api.clearAppAccounting(targetApp.appKey);
      expect(cleared).toBe(true);

      const remainingApps = await api.getAppAccountingRecords();
      expect(remainingApps.some(a => a.appKey === targetApp.appKey)).toBe(false);
    }
  });

  it('generates valid CSV and JSON export payloads', async () => {
    const csv = await api.exportHistory('csv', '7d');
    expect(typeof csv).toBe('string');
    expect(csv).toContain('ID,Timestamp,Date,Hour,DownloadBytes,UploadBytes');

    const json = await api.exportHistory('json', '7d');
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
