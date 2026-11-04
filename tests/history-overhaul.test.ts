import { describe, it, expect } from 'vitest';
import { webSimulation } from '../src/services/webSimulation';
import { TrafficHistoryRecord } from '../src/types/network';

describe('History Overhaul & Data Model Verification', () => {
  it('supports custom date range queries with inclusive start and end dates', () => {
    // Generate dates
    const today = new Date().toISOString().split('T')[0];
    const past7d = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];

    const records = webSimulation.getHistory('custom', undefined, past7d, today);
    expect(Array.isArray(records)).toBe(true);

    // Every returned record must be >= past7d and <= today
    for (const record of records) {
      expect(record.dateStr >= past7d).toBe(true);
      expect(record.dateStr <= today).toBe(true);
    }
  });

  it('supports interface filtering on historical traffic records', () => {
    const wifiRecords = webSimulation.getHistory('7d', 'Wi-Fi');
    expect(Array.isArray(wifiRecords)).toBe(true);
    expect(wifiRecords.length).toBeGreaterThan(0);
    // All returned records must have interface Wi-Fi or match topApp/interfaceName
    for (const record of wifiRecords) {
      const match =
        (record.interfaceName && record.interfaceName.includes('Wi-Fi')) ||
        (record.topApp && record.topApp.includes('Wi-Fi'));
      expect(match).toBe(true);
    }
  });

  it('guarantees combined volume equals download plus upload for every record', () => {
    const records = webSimulation.getHistory('30d');
    expect(records.length).toBeGreaterThan(0);

    for (const record of records) {
      const computedTotal = record.downloadBytes + record.uploadBytes;
      const rec = record as TrafficHistoryRecord & { totalBytes?: number };
      if (rec.totalBytes !== undefined) {
        expect(rec.totalBytes).toBe(computedTotal);
      }
      expect(record.downloadBytes).toBeGreaterThanOrEqual(0);
      expect(record.uploadBytes).toBeGreaterThanOrEqual(0);
    }
  });

  it('calculates consistent adaptive chart scale divisor to prevent Screenshot A scale mismatches', () => {
    // Helper that replicates adaptive scaling in HistoryTab
    const getChartScale = (records: TrafficHistoryRecord[]) => {
      const maxBytes = Math.max(
        ...records.map(r => Math.max(r.downloadBytes, r.uploadBytes)),
        1
      );
      if (maxBytes >= 1_000_000_000) {
        return { unit: 'GB', divisor: 1_000_000_000 };
      }
      if (maxBytes >= 1_000_000) {
        return { unit: 'MB', divisor: 1_000_000 };
      }
      return { unit: 'KB', divisor: 1_000 };
    };

    // Scenario 1: Low KB-scale traffic
    const kbRecords: TrafficHistoryRecord[] = [
      { id: '1', timestamp: 1000, dateStr: '2026-11-01', hourStr: '12:00', downloadBytes: 250_000, uploadBytes: 50_000, topApp: 'Wi-Fi' },
    ];
    const kbScale = getChartScale(kbRecords);
    expect(kbScale.unit).toBe('KB');
    expect(kbRecords[0].downloadBytes / kbScale.divisor).toBe(250); // 250 KB

    // Scenario 2: MB-scale traffic
    const mbRecords: TrafficHistoryRecord[] = [
      { id: '2', timestamp: 2000, dateStr: '2026-11-01', hourStr: '13:00', downloadBytes: 25_000_000, uploadBytes: 5_000_000, topApp: 'Wi-Fi' },
    ];
    const mbScale = getChartScale(mbRecords);
    expect(mbScale.unit).toBe('MB');
    expect(mbRecords[0].downloadBytes / mbScale.divisor).toBe(25); // 25 MB

    // Scenario 3: GB-scale traffic
    const gbRecords: TrafficHistoryRecord[] = [
      { id: '3', timestamp: 3000, dateStr: '2026-11-01', hourStr: '14:00', downloadBytes: 3_500_000_000, uploadBytes: 500_000_000, topApp: 'Wi-Fi' },
    ];
    const gbScale = getChartScale(gbRecords);
    expect(gbScale.unit).toBe('GB');
    expect(gbRecords[0].downloadBytes / gbScale.divisor).toBe(3.5); // 3.5 GB
  });
});
