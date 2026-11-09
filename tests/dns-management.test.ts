import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';
import { DnsProfile } from '../src/types/dns';

describe('DNS Management Module', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('fetches default DNS configuration with adapter alias and IPv4 servers', async () => {
    const config = await api.getDnsConfig('Wi-Fi 6');
    expect(config).toBeDefined();
    expect(config.adapterAlias).toBe('Wi-Fi 6');
    expect(config.ipv4Servers.length).toBeGreaterThan(0);
    expect(config.isDhcp).toBeDefined();
  });

  it('fetches preset DNS profiles including Cloudflare, Google, and Quad9', async () => {
    const profiles = await api.getDnsProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(5);

    const cloudflare = profiles.find(p => p.id === 'preset_cloudflare');
    expect(cloudflare).toBeDefined();
    expect(cloudflare?.ipv4Primary).toBe('1.1.1.1');
    expect(cloudflare?.isPreset).toBe(true);

    const google = profiles.find(p => p.id === 'preset_google');
    expect(google).toBeDefined();
    expect(google?.ipv4Primary).toBe('8.8.8.8');

    const quad9 = profiles.find(p => p.id === 'preset_quad9');
    expect(quad9).toBeDefined();
    expect(quad9?.ipv4Primary).toBe('9.9.9.9');
  });

  it('allows saving and deleting custom DNS profiles', async () => {
    const customProfile: DnsProfile = {
      id: 'custom_test_dns',
      name: 'Custom Home Lab DNS',
      isPreset: false,
      ipv4Primary: '192.168.1.53',
      ipv4Secondary: '192.168.1.54',
      ipv6Primary: 'fd00::53',
      provider: 'Internal',
      createdAt: Date.now(),
    };

    const saveSuccess = await api.saveDnsProfile(customProfile);
    expect(saveSuccess).toBe(true);

    let profiles = await api.getDnsProfiles();
    expect(profiles.some(p => p.id === 'custom_test_dns')).toBe(true);

    const deleteSuccess = await api.deleteDnsProfile('custom_test_dns');
    expect(deleteSuccess).toBe(true);

    profiles = await api.getDnsProfiles();
    expect(profiles.some(p => p.id === 'custom_test_dns')).toBe(false);
  });

  it('applies DNS profile servers and updates adapter config', async () => {
    const applied = await api.setDnsServers('Wi-Fi 6', ['1.1.1.1', '1.0.0.1'], ['2606:4700:4700::1111']);
    expect(applied).toBe(true);

    const config = await api.getDnsConfig('Wi-Fi 6');
    expect(config.isDhcp).toBe(false);
    expect(config.ipv4Servers).toContain('1.1.1.1');
  });

  it('restores adapter DNS to automatic DHCP', async () => {
    await api.setDnsServers('Wi-Fi 6', ['8.8.8.8']);
    const resetSuccess = await api.resetDnsDhcp('Wi-Fi 6');
    expect(resetSuccess).toBe(true);

    const config = await api.getDnsConfig('Wi-Fi 6');
    expect(config.isDhcp).toBe(true);
  });

  it('resolves hostname queries and returns response time', async () => {
    const res = await api.resolveDnsQuery('cloudflare.com', 'A');
    expect(res).toBeDefined();
    expect(res.status).toBe('success');
    expect(res.records.length).toBeGreaterThan(0);
    expect(res.responseTimeMs).toBeGreaterThan(0);
  });

  it('measures DNS server reachability and latency', async () => {
    const result = await api.testDnsServer('1.1.1.1');
    expect(result.reachable).toBe(true);
    expect(result.serverIp).toBe('1.1.1.1');
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('flushes Windows DNS client cache successfully', async () => {
    const flushed = await api.flushDnsCache();
    expect(flushed).toBe(true);
  });
});
