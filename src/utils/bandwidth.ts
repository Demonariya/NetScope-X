import {
  BandwidthUnit,
  ApplicationPriority,
  BandwidthLimitRule,
  BandwidthProfile,
  BandwidthPresetType,
  BandwidthCapabilities,
} from '../types/bandwidth';

/**
 * Accurately convert human-entered bandwidth rate to bits per second.
 * Never confuse bytes per second with bits per second:
 * - 1 Bps = 8 bps
 * - 1 KB/s = 8,000 bps (standard networking decimal kilobyte) or 8,192 bps (binary)
 * - 1 MB/s = 8,000,000 bps
 * - 1 Mbps = 1,000,000 bps
 */
export function toBitsPerSecond(value: number, unit: BandwidthUnit): number {
  if (value <= 0 || !Number.isFinite(value)) return 0;
  switch (unit) {
    case 'Bps':
      return Math.round(value * 8);
    case 'KB/s':
      return Math.round(value * 8 * 1000);
    case 'MB/s':
      return Math.round(value * 8 * 1_000_000);
    case 'Mbps':
      return Math.round(value * 1_000_000);
    default:
      return Math.round(value * 1_000_000);
  }
}

/**
 * Convert bits per second back into the target unit for UI presentation.
 */
export function fromBitsPerSecond(bits: number, unit: BandwidthUnit): number {
  if (bits <= 0 || !Number.isFinite(bits)) return 0;
  switch (unit) {
    case 'Bps':
      return Math.round(bits / 8);
    case 'KB/s':
      return Math.round((bits / (8 * 1000)) * 100) / 100;
    case 'MB/s':
      return Math.round((bits / (8 * 1_000_000)) * 100) / 100;
    case 'Mbps':
      return Math.round((bits / 1_000_000) * 100) / 100;
    default:
      return Math.round((bits / 1_000_000) * 100) / 100;
  }
}

/**
 * Format bits per second to human-readable string (e.g. "5 MB/s" or "10 Mbps" or "Unlimited").
 */
export function formatBandwidthLimit(bits?: number, preferredUnit: 'bytes' | 'bits' = 'bytes'): string {
  if (!bits || bits <= 0) return 'Unlimited';
  if (preferredUnit === 'bytes') {
    const bytesPerSec = bits / 8;
    if (bytesPerSec >= 1_000_000) {
      return `${(bytesPerSec / 1_000_000).toFixed(bytesPerSec % 1_000_000 === 0 ? 0 : 1)} MB/s`;
    }
    if (bytesPerSec >= 1_000) {
      return `${(bytesPerSec / 1_000).toFixed(bytesPerSec % 1_000 === 0 ? 0 : 1)} KB/s`;
    }
    return `${Math.round(bytesPerSec)} B/s`;
  }
  if (bits >= 1_000_000_000) {
    return `${(bits / 1_000_000_000).toFixed(1)} Gbps`;
  }
  if (bits >= 1_000_000) {
    return `${(bits / 1_000_000).toFixed(bits % 1_000_000 === 0 ? 0 : 1)} Mbps`;
  }
  return `${Math.round(bits / 1_000)} Kbps`;
}

/**
 * Maps application priority levels to Windows QoS DSCP action codes and 802.1p priority tags.
 */
export function getPriorityQosMapping(priority: ApplicationPriority): {
  dscpAction: number;
  priorityValue8021: number;
  description: string;
} {
  switch (priority) {
    case 'Critical':
      return {
        dscpAction: 46, // Expedited Forwarding (EF)
        priorityValue8021: 6, // High priority voice/real-time
        description: 'Maximum QoS precedence; prioritized ahead of all background & web traffic.',
      };
    case 'High':
      return {
        dscpAction: 34, // AF41 (Assured Forwarding Class 4)
        priorityValue8021: 5, // Video / Interactive streaming
        description: 'Prioritized scheduling with low queuing latency.',
      };
    case 'Normal':
      return {
        dscpAction: 0, // Best Effort
        priorityValue8021: 0, // Default Best Effort
        description: 'Standard OS scheduling with fair share allocation.',
      };
    case 'Low':
      return {
        dscpAction: 10, // AF11 (Low priority assurance)
        priorityValue8021: 1, // Background priority
        description: 'Lower queue precedence; yields bandwidth to interactive applications.',
      };
    case 'Background':
      return {
        dscpAction: 8, // CS1 (Scavenger / Background)
        priorityValue8021: 1, // Background priority
        description: 'Constrained queue allocation; operates exclusively on idle bandwidth.',
      };
  }
}

export const DEFAULT_BANDWIDTH_CAPABILITIES: BandwidthCapabilities = {
  outboundThrottlingSupported: true,
  inboundThrottlingSupported: false,
  dscpMarkingSupported: true,
  prioritySchedulingSupported: true,
  isElevated: true,
  inboundLimitationReason:
    'Native Windows Policy-based QoS (pacer.sys) enforces outbound upload limits. Inbound shaping requires a kernel NDIS driver; download caps are tracked as OS Advisory.',
  mechanism: 'Windows Policy-based QoS (pacer.sys) & DSCP Traffic Scheduling',
};

/**
 * Generate standard preset profiles.
 */
export function getPresetProfiles(): BandwidthProfile[] {
  const now = Date.now();
  return [
    {
      id: 'preset_gaming',
      name: 'Gaming Mode',
      description: 'Prioritizes latency-sensitive games and voice chat (Discord, Steam); throttles background downloads.',
      isPreset: true,
      presetType: 'gaming',
      globalDownloadLimitBps: undefined, // Unlimited
      globalUploadLimitBps: toBitsPerSecond(2, 'MB/s'), // Guard upload bufferbloat
      globalDownloadEnabled: false,
      globalUploadEnabled: true,
      adapterAlias: 'auto',
      defaultPriority: 'Critical',
      createdAt: now,
      appRules: [
        {
          id: 'rule_gaming_discord',
          name: 'Discord Voice & Video',
          targetType: 'application',
          targetIdentifier: 'Discord.exe',
          appPath: 'Discord.exe',
          downloadLimitBps: undefined,
          uploadLimitBps: toBitsPerSecond(1, 'MB/s'),
          downloadEnabled: false,
          uploadEnabled: true,
          priority: 'Critical',
          uploadEnforcement: 'enforced',
          downloadEnforcement: 'advisory',
          isGroupRule: true,
        },
        {
          id: 'rule_gaming_steam',
          name: 'Steam Client & Games',
          targetType: 'application',
          targetIdentifier: 'steam.exe',
          appPath: 'steam.exe',
          downloadLimitBps: undefined,
          uploadLimitBps: undefined,
          downloadEnabled: false,
          uploadEnabled: false,
          priority: 'High',
          uploadEnforcement: 'enforced',
          downloadEnforcement: 'advisory',
          isGroupRule: true,
        },
      ],
    },
    {
      id: 'preset_streaming',
      name: 'Streaming Mode',
      description: 'Guarantees dedicated upload throughput for OBS, video calls, and media streaming.',
      isPreset: true,
      presetType: 'streaming',
      globalDownloadLimitBps: undefined,
      globalUploadLimitBps: toBitsPerSecond(8, 'MB/s'),
      globalDownloadEnabled: false,
      globalUploadEnabled: true,
      adapterAlias: 'auto',
      defaultPriority: 'Normal',
      createdAt: now,
      appRules: [
        {
          id: 'rule_stream_obs',
          name: 'OBS Studio',
          targetType: 'application',
          targetIdentifier: 'obs64.exe',
          appPath: 'obs64.exe',
          downloadLimitBps: undefined,
          uploadLimitBps: toBitsPerSecond(6, 'MB/s'),
          downloadEnabled: false,
          uploadEnabled: true,
          priority: 'Critical',
          uploadEnforcement: 'enforced',
          downloadEnforcement: 'advisory',
          isGroupRule: true,
        },
      ],
    },
    {
      id: 'preset_browsing',
      name: 'Browsing Mode',
      description: 'Smooth web browsing with equal fair share across browser tabs and light background apps.',
      isPreset: true,
      presetType: 'browsing',
      globalDownloadLimitBps: undefined,
      globalUploadLimitBps: undefined,
      globalDownloadEnabled: false,
      globalUploadEnabled: false,
      adapterAlias: 'auto',
      defaultPriority: 'Normal',
      createdAt: now,
      appRules: [
        {
          id: 'rule_browse_chrome',
          name: 'Google Chrome',
          targetType: 'application',
          targetIdentifier: 'chrome.exe',
          appPath: 'chrome.exe',
          downloadLimitBps: toBitsPerSecond(5, 'MB/s'),
          uploadLimitBps: toBitsPerSecond(1, 'MB/s'),
          downloadEnabled: true,
          uploadEnabled: true,
          priority: 'High',
          uploadEnforcement: 'enforced',
          downloadEnforcement: 'advisory',
          isGroupRule: true,
        },
      ],
    },
    {
      id: 'preset_download',
      name: 'Download Mode',
      description: 'Allocates maximum download capacity while capping background application uploads.',
      isPreset: true,
      presetType: 'download',
      globalDownloadLimitBps: undefined,
      globalUploadLimitBps: toBitsPerSecond(1, 'MB/s'),
      globalDownloadEnabled: false,
      globalUploadEnabled: true,
      adapterAlias: 'auto',
      defaultPriority: 'Normal',
      createdAt: now,
      appRules: [],
    },
    {
      id: 'preset_work',
      name: 'Work Mode',
      description: 'Prioritizes collaboration and conferencing (Teams, Slack, Zoom) over entertainment.',
      isPreset: true,
      presetType: 'work',
      globalDownloadLimitBps: undefined,
      globalUploadLimitBps: toBitsPerSecond(4, 'MB/s'),
      globalDownloadEnabled: false,
      globalUploadEnabled: true,
      adapterAlias: 'auto',
      defaultPriority: 'Normal',
      createdAt: now,
      appRules: [
        {
          id: 'rule_work_teams',
          name: 'Microsoft Teams',
          targetType: 'application',
          targetIdentifier: 'ms-teams.exe',
          appPath: 'ms-teams.exe',
          downloadLimitBps: undefined,
          uploadLimitBps: toBitsPerSecond(2, 'MB/s'),
          downloadEnabled: false,
          uploadEnabled: true,
          priority: 'Critical',
          uploadEnforcement: 'enforced',
          downloadEnforcement: 'advisory',
          isGroupRule: true,
        },
      ],
    },
    {
      id: 'preset_balanced',
      name: 'Balanced Mode',
      description: 'Standard Windows default networking with no artificial rate throttling.',
      isPreset: true,
      presetType: 'balanced',
      globalDownloadLimitBps: undefined,
      globalUploadLimitBps: undefined,
      globalDownloadEnabled: false,
      globalUploadEnabled: false,
      adapterAlias: 'auto',
      defaultPriority: 'Normal',
      createdAt: now,
      appRules: [],
    },
    {
      id: 'preset_custom',
      name: 'Custom Mode',
      description: 'Fully customizable bandwidth caps and priority rules defined by user configuration.',
      isPreset: true,
      presetType: 'custom',
      globalDownloadLimitBps: undefined,
      globalUploadLimitBps: undefined,
      globalDownloadEnabled: false,
      globalUploadEnabled: false,
      adapterAlias: 'auto',
      defaultPriority: 'Normal',
      createdAt: now,
      appRules: [],
    },
  ];
}

/**
 * Detects whether an application rule has any conflicts (e.g. child instance limit exceeding group limit).
 */
export function detectPolicyConflicts(
  rule: BandwidthLimitRule,
  allRules: BandwidthLimitRule[]
): string | null {
  if (rule.targetType === 'process' && rule.pid) {
    // Find parent group rule if one exists
    const groupRule = allRules.find(
      r => r.targetType === 'application' && r.targetIdentifier.toLowerCase() === (rule.name || '').toLowerCase()
    );
    if (groupRule && groupRule.uploadEnabled && rule.uploadEnabled) {
      if (
        groupRule.uploadLimitBps &&
        rule.uploadLimitBps &&
        rule.uploadLimitBps > groupRule.uploadLimitBps
      ) {
        return `PID ${rule.pid} upload cap (${formatBandwidthLimit(rule.uploadLimitBps)}) exceeds group cap (${formatBandwidthLimit(groupRule.uploadLimitBps)}).`;
      }
    }
  }
  return null;
}

export const generatePresetProfiles = getPresetProfiles;
