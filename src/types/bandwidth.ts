export type BandwidthUnit = 'KB/s' | 'MB/s' | 'Mbps' | 'Bps';

export type ApplicationPriority = 'Critical' | 'High' | 'Normal' | 'Low' | 'Background';

export type EnforcementState = 'enforced' | 'advisory' | 'unsupported' | 'failed' | 'disabled';

export interface BandwidthLimitRule {
  id: string;
  name: string;
  targetType: 'global' | 'application' | 'process' | 'adapter';
  targetIdentifier: string; // 'global', exeName, PID string, or adapter alias
  appPath?: string;
  pid?: number;
  downloadLimitBps?: number; // bits per second (null/undefined = unlimited)
  uploadLimitBps?: number;   // bits per second (null/undefined = unlimited)
  downloadEnabled: boolean;
  uploadEnabled: boolean;
  priority: ApplicationPriority;
  adapterAlias?: string;     // 'auto', 'Wi-Fi', 'Ethernet', etc.
  uploadEnforcement: EnforcementState;
  downloadEnforcement: EnforcementState;
  enforcementMessage?: string;
  isGroupRule?: boolean;
}

export type BandwidthPresetType =
  | 'gaming'
  | 'streaming'
  | 'browsing'
  | 'download'
  | 'work'
  | 'balanced'
  | 'custom';

export interface BandwidthProfile {
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  presetType?: BandwidthPresetType;
  globalDownloadLimitBps?: number;
  globalUploadLimitBps?: number;
  globalDownloadEnabled: boolean;
  globalUploadEnabled: boolean;
  adapterAlias: string;
  appRules: BandwidthLimitRule[];
  defaultPriority: ApplicationPriority;
  createdAt: number;
}

export interface BandwidthCapabilities {
  outboundThrottlingSupported: boolean;
  inboundThrottlingSupported: boolean;
  dscpMarkingSupported: boolean;
  prioritySchedulingSupported: boolean;
  isElevated: boolean;
  inboundLimitationReason: string;
  mechanism: string;
}

export interface BandwidthConfig {
  activeProfileId: string;
  profiles: BandwidthProfile[];
  globalRule: BandwidthLimitRule;
  appRules: BandwidthLimitRule[];
  capabilities: BandwidthCapabilities;
  isPaused: boolean;
}
