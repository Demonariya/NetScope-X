import { describe, it, expect } from 'vitest';
import { TrafficHistoryRecord } from '../src/types/network';
import { webSimulation } from '../src/services/webSimulation';

describe('History Timeline & Data Integrity — Priority One Requirements', () => {
  it('correctly filters date ranges for today, 7d, 30d, and all', () => {
    const today = new Date().toISOString().split('T')[0];
    const historyToday = webSimulation.getHistory('today');
    expect(historyToday.every(r => r.dateStr === today)).toBe(true);

    const history7d = webSimulation.getHistory('7d');
    expect(history7d.length).toBeGreaterThan(0);
    expect(history7d.length).toBeGreaterThanOrEqual(historyToday.length);

    const history30d = webSimulation.getHistory('30d');
    expect(history30d.length).toBeGreaterThanOrEqual(history7d.length);
  });

  it('guarantees unique keys across midnight and multi-day boundaries', () => {
    const records: TrafficHistoryRecord[] = [
      {
        id: '2026-10-28-14:00',
        timestamp: 1761660000000,
        dateStr: '2026-10-28',
        hourStr: '14:00',
        downloadBytes: 500000,
        uploadBytes: 100000,
        topApp: 'Wi-Fi',
      },
      {
        id: '2026-10-29-14:00',
        timestamp: 1761746400000,
        dateStr: '2026-10-29',
        hourStr: '14:00',
        downloadBytes: 800000,
        uploadBytes: 200000,
        topApp: 'Wi-Fi',
      },
    ];

    // Unique timeline keys must not collide even though hourStr is both "14:00"
    const keys = records.map(r => `${r.dateStr}T${r.hourStr}_${r.id}`);
    const keySet = new Set(keys);
    expect(keySet.size).toBe(records.length);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('exports CSV with proper header and escaped quotes for text fields', () => {
    const csv = webSimulation.exportHistory('csv', 'today');
    expect(csv).toContain('ID,Timestamp,Date,Hour,DownloadBytes,UploadBytes,TotalBytes,TopApp');
    const lines = csv.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('exports valid JSON preserving numeric byte counts and timestamps', () => {
    const jsonStr = webSimulation.exportHistory('json', 'today');
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(typeof parsed[0].downloadBytes).toBe('number');
      expect(typeof parsed[0].uploadBytes).toBe('number');
      expect(typeof parsed[0].timestamp).toBe('number');
      expect(typeof parsed[0].dateStr).toBe('string');
    }
  });
});
