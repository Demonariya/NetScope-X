import { DnsConfig, DnsProfile, DnsQueryResult } from '../types/dns';

export interface DnsDiagnosticCheck {
  id: string;
  label: string;
  severity: 'ok' | 'warning' | 'error' | 'info';
  message: string;
}

export interface BenchmarkResolverItem {
  id: string;
  name: string;
  ip: string;
  provider: string;
}

export const DEFAULT_BENCHMARK_RESOLVERS: BenchmarkResolverItem[] = [
  { id: 'cloudflare', name: 'Cloudflare DNS', ip: '1.1.1.1', provider: 'Cloudflare' },
  { id: 'google', name: 'Google Public DNS', ip: '8.8.8.8', provider: 'Google' },
  { id: 'quad9', name: 'Quad9 Secure DNS', ip: '9.9.9.9', provider: 'Quad9' },
  { id: 'opendns', name: 'Cisco OpenDNS', ip: '208.67.222.222', provider: 'Cisco' },
  { id: 'adguard', name: 'AdGuard DNS', ip: '94.140.14.14', provider: 'AdGuard' },
];

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'] as const;

const PRESET_DESCRIPTIONS: Record<string, string> = {
  preset_cloudflare: 'Fast, privacy-first public resolver (1.1.1.1) with DNSSEC support.',
  preset_google: 'Anycast global public DNS by Google with high edge availability.',
  preset_quad9: 'Security-focused resolver blocking known malicious domains.',
  preset_adguard: 'Blocks advertisements, trackers, and analytics domains at DNS level.',
  preset_opendns: 'Reliable enterprise-grade Cisco resolver with phishing protection.',
};

export function getProfileDescription(profile: DnsProfile): string {
  if (profile.description && profile.description.trim()) {
    return profile.description.trim();
  }
  if (profile.presetId && PRESET_DESCRIPTIONS[profile.presetId]) {
    return PRESET_DESCRIPTIONS[profile.presetId];
  }
  if (PRESET_DESCRIPTIONS[profile.id]) {
    return PRESET_DESCRIPTIONS[profile.id];
  }
  return profile.isPreset
    ? `${profile.provider || 'Public'} managed DNS resolver preset.`
    : `Custom DNS configuration${profile.provider ? ` (${profile.provider})` : ''}.`;
}

export function isValidIpv4(value: string): boolean {
  const trimmed = value.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

export function isValidIpv6(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes(':') || trimmed.length > 45) return false;
  if (/[^0-9a-fA-F:.]/.test(trimmed)) return false;
  const doubleColonCount = (trimmed.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;

  const halves = trimmed.split('::');
  const parseGroups = (segment: string): string[] | null => {
    if (!segment) return [];
    const groups = segment.split(':');
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!g) return null;
      if (i === groups.length - 1 && g.includes('.')) {
        if (!isValidIpv4(g)) return null;
      } else if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
        return null;
      }
    }
    return groups;
  };

  if (halves.length === 1) {
    const groups = parseGroups(halves[0]);
    if (!groups) return false;
    const hasEmbeddedV4 = groups[groups.length - 1]?.includes('.');
    return hasEmbeddedV4 ? groups.length === 7 : groups.length === 8;
  }

  const left = parseGroups(halves[0]);
  const right = parseGroups(halves[1]);
  if (!left || !right) return false;
  const hasEmbeddedV4 = right[right.length - 1]?.includes('.');
  const totalUnits = left.length + right.length + (hasEmbeddedV4 ? 1 : 0);
  return totalUnits < 8;
}

export function isValidIpAddress(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}

export function isValidHostnameInput(host: string): boolean {
  const trimmed = host.trim().replace(/\.+$/, '');
  if (!trimmed || trimmed.length > 253 || /\s/.test(trimmed)) return false;
  const labels = trimmed.split('.');
  return labels.every(
    label =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9_-]+$/.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-')
  );
}

export function getEffectiveDnsMode(config: DnsConfig | null): {
  kind: 'dhcp' | 'manual' | 'mixed' | 'unavailable';
  label: string;
  ipv4Mode: 'dhcp' | 'manual';
  ipv6Mode: 'dhcp' | 'manual';
} {
  if (!config || config.status === 'unavailable' || config.adapterAlias === 'Unknown') {
    return {
      kind: 'unavailable',
      label: 'Unavailable',
      ipv4Mode: 'dhcp',
      ipv6Mode: 'dhcp',
    };
  }
  const v4Dhcp = config.ipv4IsDhcp ?? config.isDhcp;
  const v6Dhcp = config.ipv6IsDhcp ?? config.isDhcp;

  if (v4Dhcp && v6Dhcp) {
    return {
      kind: 'dhcp',
      label: 'Automatic (DHCP)',
      ipv4Mode: 'dhcp',
      ipv6Mode: 'dhcp',
    };
  }
  if (!v4Dhcp && !v6Dhcp) {
    return {
      kind: 'manual',
      label: 'Manual (Static)',
      ipv4Mode: 'manual',
      ipv6Mode: 'manual',
    };
  }
  if (!v4Dhcp && v6Dhcp) {
    return {
      kind: 'mixed',
      label: 'IPv4 Manual · IPv6 DHCP',
      ipv4Mode: 'manual',
      ipv6Mode: 'dhcp',
    };
  }
  return {
    kind: 'mixed',
    label: 'IPv4 DHCP · IPv6 Manual',
    ipv4Mode: 'dhcp',
    ipv6Mode: 'manual',
  };
}

export function isProfileActiveOnConfig(profile: DnsProfile, config: DnsConfig | null): boolean {
  if (!config || config.status === 'unavailable') return false;
  const v4Dhcp = config.ipv4IsDhcp ?? config.isDhcp;
  const v6Dhcp = config.ipv6IsDhcp ?? config.isDhcp;

  const hasProfileV4 = Boolean(profile.ipv4Primary?.trim());
  const hasProfileV6 = Boolean(profile.ipv6Primary?.trim());

  let v4Matches = false;
  if (hasProfileV4) {
    if (v4Dhcp || config.ipv4Servers.length === 0) return false;
    const primaryMatches =
      config.ipv4Servers[0]?.toLowerCase() === profile.ipv4Primary.trim().toLowerCase();
    const secondaryMatches = profile.ipv4Secondary
      ? config.ipv4Servers[1]?.toLowerCase() === profile.ipv4Secondary.trim().toLowerCase()
      : true;
    v4Matches = primaryMatches && secondaryMatches;
  }

  let v6Matches = !hasProfileV6;
  if (hasProfileV6 && !hasProfileV4) {
    if (v6Dhcp || config.ipv6Servers.length === 0) return false;
    v6Matches =
      config.ipv6Servers[0]?.toLowerCase() === profile.ipv6Primary!.trim().toLowerCase();
  }

  return hasProfileV4 ? v4Matches : v6Matches;
}

export function verifyAppliedProfileConfig(
  config: DnsConfig,
  expectedV4: string[],
  expectedV6?: string[]
): { verified: boolean; reason?: string } {
  const v4Dhcp = config.ipv4IsDhcp ?? config.isDhcp;
  const v6Dhcp = config.ipv6IsDhcp ?? config.isDhcp;

  if (expectedV4.length > 0) {
    if (v4Dhcp) {
      return { verified: false, reason: 'Adapter IPv4 DNS remained in DHCP mode.' };
    }
    const missingV4 = expectedV4.filter(
      ip => !config.ipv4Servers.some(s => s.toLowerCase() === ip.toLowerCase())
    );
    if (missingV4.length > 0) {
      return {
        verified: false,
        reason: `Windows did not report IPv4 DNS server(s): ${missingV4.join(', ')}.`,
      };
    }
  }

  if (expectedV6 && expectedV6.length > 0) {
    if (v6Dhcp) {
      return { verified: false, reason: 'Adapter IPv6 DNS remained in DHCP mode.' };
    }
    const missingV6 = expectedV6.filter(
      ip => !config.ipv6Servers.some(s => s.toLowerCase() === ip.toLowerCase())
    );
    if (missingV6.length > 0) {
      return {
        verified: false,
        reason: `Windows did not report IPv6 DNS server(s): ${missingV6.join(', ')}.`,
      };
    }
  }

  return { verified: true };
}

export function computeDnsHealthDiagnostics(
  config: DnsConfig | null,
  lastQuery: DnsQueryResult | null
): DnsDiagnosticCheck[] {
  const checks: DnsDiagnosticCheck[] = [];

  if (!config || config.status === 'unavailable') {
    checks.push({
      id: 'adapter-unavailable',
      label: 'Adapter DNS Configuration',
      severity: 'error',
      message: 'No active network adapter DNS configuration could be read.',
    });
    return checks;
  }

  const mode = getEffectiveDnsMode(config);
  const v4Count = config.ipv4Servers.length;
  const v6Count = config.ipv6Servers.length;

  // 1. Configuration consistency
  if (mode.kind === 'manual' && v4Count === 0 && v6Count === 0) {
    checks.push({
      id: 'consistency',
      label: 'Configuration Consistency',
      severity: 'error',
      message:
        'DNS is set to Manual (Static) mode, but neither IPv4 nor IPv6 DNS servers are assigned.',
    });
  } else if (mode.ipv4Mode === 'manual' && v4Count === 0) {
    checks.push({
      id: 'consistency',
      label: 'Configuration Consistency',
      severity: 'warning',
      message:
        'IPv4 DNS is in Manual mode without any IPv4 DNS servers. Restore DHCP or assign a resolver.',
    });
  } else if (v4Count === 0 && v6Count === 0) {
    checks.push({
      id: 'consistency',
      label: 'Configuration Consistency',
      severity: 'warning',
      message:
        'No DNS servers are currently assigned to this adapter. Name resolution cannot proceed.',
    });
  } else {
    checks.push({
      id: 'consistency',
      label: 'Configuration Consistency',
      severity: 'ok',
      message: `${mode.label} active with ${v4Count} IPv4 and ${v6Count} IPv6 resolver(s).`,
    });
  }

  // 2. Resolver availability & reachability
  if (v4Count > 0) {
    if (config.ipv4Reachable === true) {
      checks.push({
        id: 'reachability',
        label: 'Resolver Reachability',
        severity: 'ok',
        message: `Primary IPv4 resolver (${config.ipv4Servers[0]}) responded in ${config.ipv4LatencyMs ?? config.responseTimeMs ?? '--'} ms.`,
      });
    } else if (config.ipv4Reachable === false) {
      checks.push({
        id: 'reachability',
        label: 'Resolver Reachability',
        severity: 'error',
        message: `Primary IPv4 resolver (${config.ipv4Servers[0]}) failed DNS probe${config.lastError ? `: ${config.lastError}` : '.'}`,
      });
    } else {
      checks.push({
        id: 'reachability',
        label: 'Resolver Reachability',
        severity: 'info',
        message: `IPv4 resolver (${config.ipv4Servers[0]}) reachability has not been verified yet.`,
      });
    }
  } else if (v6Count > 0 && config.ipv6Reachable === true) {
    checks.push({
      id: 'reachability',
      label: 'Resolver Reachability',
      severity: 'ok',
      message: `Primary IPv6 resolver (${config.ipv6Servers[0]}) responded in ${config.ipv6LatencyMs ?? '--'} ms.`,
    });
  } else {
    checks.push({
      id: 'reachability',
      label: 'Resolver Reachability',
      severity: 'warning',
      message: 'No active DNS server available to probe.',
    });
  }

  // 3. Primary vs Secondary failover
  if (v4Count === 1) {
    checks.push({
      id: 'redundancy',
      label: 'Resolver Redundancy',
      severity: 'warning',
      message:
        'Only one IPv4 DNS server is configured. Adding a secondary resolver prevents outages if the primary fails.',
    });
  } else if (v4Count >= 2) {
    checks.push({
      id: 'redundancy',
      label: 'Resolver Redundancy',
      severity: 'ok',
      message: `Failover configured: primary ${config.ipv4Servers[0]} backed by ${config.ipv4Servers[1]}.`,
    });
  }

  // 4. IPv4 & IPv6 parity
  if (v4Count > 0 && v6Count === 0) {
    checks.push({
      id: 'dual-stack',
      label: 'IPv4 / IPv6 Coverage',
      severity: 'info',
      message: 'IPv4 DNS is active; IPv6 DNS is unassigned or handled automatically.',
    });
  } else if (v4Count > 0 && v6Count > 0) {
    checks.push({
      id: 'dual-stack',
      label: 'IPv4 / IPv6 Coverage',
      severity: 'ok',
      message: 'Dual-stack IPv4 and IPv6 DNS resolvers are both configured.',
    });
  }

  // 5. Latest lookup verification
  if (lastQuery) {
    checks.push({
      id: 'resolution',
      label: 'DNS Resolution Check',
      severity: lastQuery.status === 'success' ? 'ok' : 'error',
      message:
        lastQuery.status === 'success'
          ? `Last lookup (${lastQuery.query} ${lastQuery.recordType}) returned ${lastQuery.records.length} record(s) via ${lastQuery.resolverUsed || 'System DNS'} in ${lastQuery.responseTimeMs} ms.`
          : `Last lookup (${lastQuery.query} ${lastQuery.recordType}) failed: ${lastQuery.errorMessage || 'Resolution error'}.`,
    });
  }

  return checks;
}
