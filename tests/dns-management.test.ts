// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';
import { DnsConfig, DnsProfile } from '../src/types/dns';
import {
  computeDnsHealthDiagnostics,
  getEffectiveDnsMode,
  isProfileActiveOnConfig,
  isValidHostnameInput,
  isValidIpAddress,
  isValidIpv4,
  isValidIpv6,
  verifyAppliedProfileConfig,
} from '../src/utils/dns';
import { DnsTab } from '../src/components/dns/DnsTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('DNS Validation, Status Consistency & Utility Logic', () => {
  it('validates IPv4 and IPv6 addresses strictly', () => {
    expect(isValidIpv4('1.1.1.1')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
    expect(isValidIpv4('999.1.1.1')).toBe(false);
    expect(isValidIpv4('01.1.1.1')).toBe(false);
    expect(isValidIpv4('not-an-ip')).toBe(false);

    expect(isValidIpv6('2606:4700:4700::1111')).toBe(true);
    expect(isValidIpv6('::1')).toBe(true);
    expect(isValidIpv6('2001:4860:4860:0000:0000:0000:0000:8888')).toBe(true);
    expect(isValidIpv6('2001:::1')).toBe(false);
    expect(isValidIpv6('1.1.1.1')).toBe(false);

    expect(isValidIpAddress('8.8.4.4')).toBe(true);
    expect(isValidIpAddress('2620:fe::fe')).toBe(true);
    expect(isValidIpAddress('invalid')).toBe(false);
  });

  it('validates target hostnames and rejects malformed queries', () => {
    expect(isValidHostnameInput('cloudflare.com')).toBe(true);
    expect(isValidHostnameInput('sub.example-1.org.')).toBe(true);
    expect(isValidHostnameInput('')).toBe(false);
    expect(isValidHostnameInput('bad host.com')).toBe(false);
    expect(isValidHostnameInput('-bad.com')).toBe(false);
  });

  it('distinguishes DHCP, Manual, Mixed, and Unavailable DNS modes accurately', () => {
    const base: DnsConfig = {
      adapterAlias: 'Wi-Fi',
      isDhcp: true,
      ipv4IsDhcp: true,
      ipv6IsDhcp: true,
      ipv4Servers: ['192.168.1.1'],
      ipv6Servers: [],
      status: 'configured',
      responseTimeMs: 12,
    };
    expect(getEffectiveDnsMode(base).kind).toBe('dhcp');

    expect(
      getEffectiveDnsMode({ ...base, isDhcp: false, ipv4IsDhcp: false, ipv6IsDhcp: true }).kind
    ).toBe('mixed');

    expect(
      getEffectiveDnsMode({ ...base, isDhcp: false, ipv4IsDhcp: false, ipv6IsDhcp: false }).kind
    ).toBe('manual');

    expect(getEffectiveDnsMode({ ...base, status: 'unavailable' }).kind).toBe('unavailable');
  });

  it('flags contradictory Manual mode with zero DNS servers in health diagnostics', () => {
    const brokenManual: DnsConfig = {
      adapterAlias: 'Ethernet',
      isDhcp: false,
      ipv4IsDhcp: false,
      ipv6IsDhcp: false,
      ipv4Servers: [],
      ipv6Servers: [],
      status: 'unconfigured',
      responseTimeMs: null,
    };

    const checks = computeDnsHealthDiagnostics(brokenManual, null);
    const consistency = checks.find(c => c.id === 'consistency');
    expect(consistency?.severity).toBe('error');
    expect(consistency?.message).toContain('neither IPv4 nor IPv6 DNS servers are assigned');

    const reachability = checks.find(c => c.id === 'reachability');
    expect(reachability?.severity).toBe('warning');
  });

  it('verifies applied DNS servers and matches active profiles cleanly', () => {
    const cloudflare: DnsProfile = {
      id: 'preset_cloudflare',
      name: 'Cloudflare DNS',
      isPreset: true,
      ipv4Primary: '1.1.1.1',
      ipv4Secondary: '1.0.0.1',
      ipv6Primary: '2606:4700:4700::1111',
      provider: 'Cloudflare',
      createdAt: 0,
    };

    const activeConfig: DnsConfig = {
      adapterAlias: 'Ethernet',
      isDhcp: false,
      ipv4IsDhcp: false,
      ipv6IsDhcp: false,
      ipv4Servers: ['1.1.1.1', '1.0.0.1'],
      ipv6Servers: ['2606:4700:4700::1111'],
      status: 'configured',
      responseTimeMs: 11.2,
    };

    expect(isProfileActiveOnConfig(cloudflare, activeConfig)).toBe(true);
    expect(
      verifyAppliedProfileConfig(activeConfig, ['1.1.1.1', '1.0.0.1'], ['2606:4700:4700::1111'])
        .verified
    ).toBe(true);
    expect(verifyAppliedProfileConfig(activeConfig, ['8.8.8.8']).verified).toBe(false);
  });
});

describe('DNS Management Backend & API Contracts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fetches default DNS configuration with per-family DHCP flags and adapter metadata', async () => {
    const config = await api.getDnsConfig('Wi-Fi 6');
    expect(config.adapterAlias).toBe('Wi-Fi 6');
    expect(config.ipv4Servers.length).toBeGreaterThan(0);
    expect(typeof config.ipv4IsDhcp).toBe('boolean');
    expect(typeof config.ipv6IsDhcp).toBe('boolean');
  });

  it('reports empty servers and unconfigured status for disconnected adapters', async () => {
    const disconnected = await api.getDnsConfig('Ethernet');
    expect(disconnected.ipv4Servers).toEqual([]);
    expect(disconnected.ipv6Servers).toEqual([]);
    expect(disconnected.status).toBe('unconfigured');
    expect(disconnected.responseTimeMs).toBeNull();
  });

  it('fetches preset DNS profiles including Cloudflare, Google, Quad9, OpenDNS, and AdGuard', async () => {
    const profiles = await api.getDnsProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(5);
    expect(profiles.find(p => p.id === 'preset_cloudflare')?.ipv4Primary).toBe('1.1.1.1');
    expect(profiles.find(p => p.id === 'preset_google')?.ipv4Primary).toBe('8.8.8.8');
    expect(profiles.find(p => p.id === 'preset_quad9')?.ipv4Primary).toBe('9.9.9.9');
  });

  it('saves, updates, and deletes custom DNS profiles permanently', async () => {
    const customProfile: DnsProfile = {
      id: 'custom_test_dns',
      name: 'Custom Home Lab DNS',
      description: 'Internal split-horizon resolver',
      isPreset: false,
      ipv4Primary: '192.168.1.53',
      ipv4Secondary: '192.168.1.54',
      ipv6Primary: 'fd00::53',
      provider: 'Internal',
      createdAt: Date.now(),
    };

    expect(await api.saveDnsProfile(customProfile)).toBe(true);
    let profiles = await api.getDnsProfiles();
    expect(profiles.some(p => p.id === 'custom_test_dns')).toBe(true);

    expect(await api.deleteDnsProfile('custom_test_dns')).toBe(true);
    profiles = await api.getDnsProfiles();
    expect(profiles.some(p => p.id === 'custom_test_dns')).toBe(false);
  });

  it('applies manual IPv4 + IPv6 DNS servers and supports independent DHCP resets', async () => {
    const applied = await api.setDnsServers(
      'Wi-Fi 6',
      ['1.1.1.1', '1.0.0.1'],
      ['2606:4700:4700::1111']
    );
    expect(applied).toBe(true);

    let config = await api.getDnsConfig('Wi-Fi 6');
    expect(config.isDhcp).toBe(false);
    expect(config.ipv4IsDhcp).toBe(false);
    expect(config.ipv6IsDhcp).toBe(false);
    expect(config.ipv4Servers).toEqual(['1.1.1.1', '1.0.0.1']);
    expect(config.ipv6Servers).toEqual(['2606:4700:4700::1111']);

    await api.resetDnsDhcp('Wi-Fi 6', 'ipv4');
    config = await api.getDnsConfig('Wi-Fi 6');
    expect(config.ipv4IsDhcp).toBe(true);
    expect(config.ipv6IsDhcp).toBe(false);

    await api.resetDnsDhcp('Wi-Fi 6', 'all');
    config = await api.getDnsConfig('Wi-Fi 6');
    expect(config.isDhcp).toBe(true);
  });

  it('resolves A/AAAA/MX/TXT/CNAME/NS records with resolver choice, TTL, and handles errors', async () => {
    const res = await api.resolveDnsQuery('cloudflare.com', 'MX', '1.1.1.1');
    expect(res.status).toBe('success');
    expect(res.resolverUsed).toBe('1.1.1.1');
    expect(res.records.length).toBeGreaterThan(0);
    expect(res.detailedRecords?.[0]?.ttl).toBeGreaterThan(0);
    expect(res.responseTimeMs).toBeGreaterThan(0);

    const failed = await api.resolveDnsQuery('does-not-exist.invalid', 'A', 'System DNS');
    expect(failed.status).toBe('error');
    expect(failed.records).toEqual([]);
    expect(failed.errorMessage).toBeTruthy();
  });

  it('measures real resolver RTT and surfaces unreachable resolver errors without fake fallback', async () => {
    const ok = await api.testDnsServer('1.1.1.1', 'cloudflare.com', 'A');
    expect(ok.reachable).toBe(true);
    expect(ok.latencyMs).toBeGreaterThan(0);
    expect(ok.queryHost).toBe('cloudflare.com');

    const fail = await api.testDnsServer('203.0.113.1', 'cloudflare.com', 'A');
    expect(fail.reachable).toBe(false);
    expect(fail.latencyMs).toBe(0);
    expect(fail.errorMessage).toBeTruthy();
  });

  it('flushes Windows DNS client cache cleanly', async () => {
    expect(await api.flushDnsCache()).toBe(true);
  });
});

describe('DnsTab UI Component Rendering & Anti-Fake Telemetry Verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders DNS Manager sections and never shows fake 12.4 ms fallback latency', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const adapters = [
      {
        id: '14',
        name: 'Wi-Fi 6',
        description: 'Intel Wi-Fi 6 AX201',
        type: 'wifi' as const,
        status: 'connected' as const,
        localIPv4: '192.168.1.42',
        localIPv6: '2600:1700::15',
        macAddress: '00:11:22:33:44:55',
        gateway: '192.168.1.1',
        dnsServers: ['1.1.1.1', '1.0.0.1'],
        speedMbps: 866,
        isDefault: true,
      },
      {
        id: '12',
        name: 'Ethernet',
        description: 'Realtek PCIe GbE Family Controller',
        type: 'ethernet' as const,
        status: 'disconnected' as const,
        localIPv4: '',
        localIPv6: '',
        macAddress: '00:11:22:33:44:66',
        gateway: '',
        dnsServers: [],
        speedMbps: 1000,
        isDefault: false,
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(DnsTab, {
          adapters,
          selectedAdapterId: '14',
          accentColor: '#38bdf8',
          currentTheme: 'dark',
          onShowToast: () => {},
        })
      );
      await new Promise(resolve => setTimeout(resolve, 60));
    });

    const text = container.textContent || '';
    expect(text).toContain('DNS Manager');
    expect(text).toContain('DNS Health Diagnostics');
    expect(text).toContain('DNS Profiles & Custom Resolvers');
    expect(text).toContain('Hostname Query Diagnostics');
    expect(text).toContain('DNS Latency Comparison');
    expect(text).toContain('DNS Activity History');
    expect(text).toContain('Advanced Adapter & Resolver Details');
    expect(text).not.toContain('12.4 ms');
    expect(text).not.toContain('Configured and resolving');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
