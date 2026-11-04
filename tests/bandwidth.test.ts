import { describe, it, expect } from 'vitest';
import {
  toBitsPerSecond,
  fromBitsPerSecond,
  formatBandwidthLimit,
  getPriorityQosMapping,
  generatePresetProfiles,
  detectPolicyConflicts,
} from '../src/utils/bandwidth';
import { BandwidthLimitRule } from '../src/types/bandwidth';
import { webSimulation } from '../src/services/webSimulation';

describe('Bandwidth Control & Windows QoS Unit Tests', () => {
  describe('Unit Conversions & Bit/Byte Accuracy', () => {
    it('accurately distinguishes bytes from bits (5 Mbps != 5 MB/s)', () => {
      const fiveMbps = toBitsPerSecond(5, 'Mbps');
      const fiveMBps = toBitsPerSecond(5, 'MB/s');

      // 5 Mbps = 5,000,000 bps
      expect(fiveMbps).toBe(5_000_000);
      // 5 MB/s = 5 * 8 * 1,000,000 = 40,000,000 bps
      expect(fiveMBps).toBe(40_000_000);

      // Verify they are definitely not equal (8x factor difference)
      expect(fiveMBps).toBe(fiveMbps * 8);
    });

    it('accurately converts KB/s to bits per second', () => {
      // 512 KB/s = 512 * 8 * 1000 = 4,096,000 bps
      expect(toBitsPerSecond(512, 'KB/s')).toBe(4_096_000);
      // 1 KB/s = 8000 bps
      expect(toBitsPerSecond(1, 'KB/s')).toBe(8_000);
    });

    it('accurately round-trips fromBitsPerSecond', () => {
      const origMbps = 25;
      const bits = toBitsPerSecond(origMbps, 'Mbps');
      expect(fromBitsPerSecond(bits, 'Mbps')).toBe(origMbps);

      const origMBps = 12.5;
      const bitsMB = toBitsPerSecond(origMBps, 'MB/s');
      expect(fromBitsPerSecond(bitsMB, 'MB/s')).toBe(origMBps);

      const origKBps = 768;
      const bitsKB = toBitsPerSecond(origKBps, 'KB/s');
      expect(fromBitsPerSecond(bitsKB, 'KB/s')).toBe(origKBps);
    });

    it('formats limits into readable strings without confusing units', () => {
      expect(formatBandwidthLimit(0)).toBe('Unlimited');
      expect(formatBandwidthLimit(undefined)).toBe('Unlimited');

      // 40,000,000 bits = 5 MB/s
      expect(formatBandwidthLimit(40_000_000, 'bytes')).toBe('5 MB/s');

      // 4,096,000 bits = 512 KB/s
      expect(formatBandwidthLimit(4_096_000, 'bytes')).toBe('512 KB/s');

      // In bits mode:
      expect(formatBandwidthLimit(10_000_000, 'bits')).toBe('10 Mbps');
    });
  });

  describe('Windows Policy-Based QoS Mapping', () => {
    it('maps Critical priority to DSCP 46 (Expedited Forwarding) and 802.1p 6', () => {
      const qos = getPriorityQosMapping('Critical');
      expect(qos.dscpAction).toBe(46);
      expect(qos.priorityValue8021).toBe(6);
    });

    it('maps High priority to DSCP 34 (AF41) and 802.1p 5', () => {
      const qos = getPriorityQosMapping('High');
      expect(qos.dscpAction).toBe(34);
      expect(qos.priorityValue8021).toBe(5);
    });

    it('maps Normal priority to Best Effort (0)', () => {
      const qos = getPriorityQosMapping('Normal');
      expect(qos.dscpAction).toBe(0);
      expect(qos.priorityValue8021).toBe(0);
    });

    it('maps Low and Background to low precedence values', () => {
      const low = getPriorityQosMapping('Low');
      expect(low.dscpAction).toBe(10); // AF11

      const bg = getPriorityQosMapping('Background');
      expect(bg.dscpAction).toBe(8); // CS1
    });
  });

  describe('Preset Profiles Generation', () => {
    it('generates the 7 required preset profiles with realistic QoS rules', () => {
      const presets = generatePresetProfiles();
      expect(presets.length).toBe(7);

      const presetTypes = presets.map(p => p.presetType);
      expect(presetTypes).toContain('gaming');
      expect(presetTypes).toContain('streaming');
      expect(presetTypes).toContain('browsing');
      expect(presetTypes).toContain('download');
      expect(presetTypes).toContain('work');
      expect(presetTypes).toContain('balanced');
      expect(presetTypes).toContain('custom');

      // Gaming mode should prioritize games with Critical priority and throttled background down
      const gaming = presets.find(p => p.presetType === 'gaming');
      expect(gaming).toBeDefined();
      expect(gaming?.defaultPriority).toBe('Critical');

      // Balanced mode should have no artificial rate throttling
      const balanced = presets.find(p => p.presetType === 'balanced');
      expect(balanced).toBeDefined();
      expect(balanced?.globalDownloadEnabled).toBe(false);
      expect(balanced?.globalUploadEnabled).toBe(false);
    });
  });

  describe('Policy Conflict Detection', () => {
    it('detects when a child process upload cap exceeds the parent group cap', () => {
      const groupRule: BandwidthLimitRule = {
        id: 'group_chrome',
        name: 'Google Chrome',
        targetType: 'application',
        targetIdentifier: 'chrome.exe',
        uploadLimitBps: toBitsPerSecond(1, 'MB/s'), // 1 MB/s
        uploadEnabled: true,
        downloadEnabled: false,
        priority: 'Normal',
        uploadEnforcement: 'enforced',
        downloadEnforcement: 'disabled',
        isGroupRule: true,
      };

      const conflictingChildRule: BandwidthLimitRule = {
        id: 'child_1234',
        name: 'chrome.exe',
        targetType: 'process',
        targetIdentifier: '1234',
        pid: 1234,
        uploadLimitBps: toBitsPerSecond(2, 'MB/s'), // 2 MB/s > 1 MB/s group cap!
        uploadEnabled: true,
        downloadEnabled: false,
        priority: 'Normal',
        uploadEnforcement: 'enforced',
        downloadEnforcement: 'disabled',
      };

      const conflict = detectPolicyConflicts(conflictingChildRule, [groupRule]);
      expect(conflict).not.toBeNull();
      expect(conflict).toContain('exceeds group cap');
    });

    it('returns null when child cap is within parent group cap', () => {
      const groupRule: BandwidthLimitRule = {
        id: 'group_chrome',
        name: 'Google Chrome',
        targetType: 'application',
        targetIdentifier: 'chrome.exe',
        uploadLimitBps: toBitsPerSecond(2, 'MB/s'),
        uploadEnabled: true,
        downloadEnabled: false,
        priority: 'Normal',
        uploadEnforcement: 'enforced',
        downloadEnforcement: 'disabled',
        isGroupRule: true,
      };

      const validChildRule: BandwidthLimitRule = {
        id: 'child_1234',
        name: 'chrome.exe',
        targetType: 'process',
        targetIdentifier: '1234',
        pid: 1234,
        uploadLimitBps: toBitsPerSecond(1, 'MB/s'), // 1 MB/s <= 2 MB/s
        uploadEnabled: true,
        downloadEnabled: false,
        priority: 'Normal',
        uploadEnforcement: 'enforced',
        downloadEnforcement: 'disabled',
      };

      const conflict = detectPolicyConflicts(validChildRule, [groupRule]);
      expect(conflict).toBeNull();
    });
  });

  describe('Simulation Rate Enforcement', () => {
    it('applies global bandwidth limit to live telemetry in simulation', () => {
      // Apply 2 MB/s download and 512 KB/s upload limits
      const downBps = toBitsPerSecond(2, 'MB/s');
      const upBps = toBitsPerSecond(512, 'KB/s');

      webSimulation.applyGlobalBandwidthLimit(downBps, upBps, true, true, 'auto');

      const stats = webSimulation.getLiveStats();
      // Measured download must not exceed configured cap
      expect(stats.downloadBps).toBeLessThanOrEqual(downBps / 8);
      // Measured upload must not exceed configured cap
      expect(stats.uploadBps).toBeLessThanOrEqual(upBps / 8);

      // Clean up limits
      webSimulation.resetAllBandwidthLimits();
    });
  });
});
