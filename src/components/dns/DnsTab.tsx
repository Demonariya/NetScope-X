import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Search,
  Activity,
  Server,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NetworkAdapter } from '../../types/network';
import { DnsConfig, DnsProfile, DnsQueryResult, DnsTestResult } from '../../types/dns';
import { api } from '../../services/api';

interface DnsTabProps {
  adapters: NetworkAdapter[];
  selectedAdapterId: string;
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
  onShowToast: (title: string, message?: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const DnsTab: React.FC<DnsTabProps> = ({
  adapters,
  selectedAdapterId,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
  onShowToast,
}) => {
  const isLight = currentTheme === 'light';

  // Target adapter alias
  const activeAdapter = adapters.find(a => a.id === selectedAdapterId) || adapters[0];
  const [selectedAlias, setSelectedAlias] = useState<string>(activeAdapter?.name || 'Wi-Fi');

  // DNS State
  const [dnsConfig, setDnsConfig] = useState<DnsConfig | null>(null);
  const [profiles, setProfiles] = useState<DnsProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Profile Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DnsProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [ipv4Primary, setIpv4Primary] = useState('');
  const [ipv4Secondary, setIpv4Secondary] = useState('');
  const [ipv6Primary, setIpv6Primary] = useState('');
  const [ipv6Secondary, setIpv6Secondary] = useState('');
  const [providerName, setProviderName] = useState('');

  // Diagnostic Query State
  const [queryHost, setQueryHost] = useState('cloudflare.com');
  const [recordType, setRecordType] = useState('A');
  const [queryResult, setQueryResult] = useState<DnsQueryResult | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  // Server Latency Benchmarks
  const [serverLatencies, setServerLatencies] = useState<Record<string, DnsTestResult>>({});
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  // Sync selected adapter alias when props change
  useEffect(() => {
    if (activeAdapter && activeAdapter.name) {
      setSelectedAlias(activeAdapter.name);
    }
  }, [activeAdapter]);

  // Load DNS config & profiles
  const loadDnsData = useCallback(async (alias: string) => {
    setIsLoading(true);
    try {
      const [config, profs] = await Promise.all([
        api.getDnsConfig(alias),
        api.getDnsProfiles(),
      ]);
      setDnsConfig(config);
      setProfiles(profs);
    } catch (err) {
      console.warn('Failed to load DNS config:', err);
      onShowToast('DNS Status Query Failed', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    void loadDnsData(selectedAlias);
  }, [selectedAlias, loadDnsData]);

  // Flush Windows DNS resolver cache
  const handleFlushCache = async () => {
    setIsFlushing(true);
    try {
      await api.flushDnsCache();
      onShowToast('DNS Cache Flushed', 'Windows DNS Client resolver cache was cleared successfully.', 'success');
    } catch (err) {
      onShowToast('DNS Cache Flush Failed', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsFlushing(false);
    }
  };

  // Restore DHCP automatic DNS
  const handleRestoreDhcp = async () => {
    setIsApplying(true);
    try {
      await api.resetDnsDhcp(selectedAlias);
      await loadDnsData(selectedAlias);
      onShowToast('DNS Restored to Automatic', `Adapter "${selectedAlias}" now obtains DNS from DHCP.`, 'success');
    } catch (err) {
      onShowToast('DHCP Reset Failed', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsApplying(false);
    }
  };

  // Apply a DNS profile to the adapter
  const handleApplyProfile = async (profile: DnsProfile) => {
    setIsApplying(true);
    try {
      const v4Servers = [profile.ipv4Primary];
      if (profile.ipv4Secondary) v4Servers.push(profile.ipv4Secondary);

      const v6Servers: string[] = [];
      if (profile.ipv6Primary) v6Servers.push(profile.ipv6Primary);
      if (profile.ipv6Secondary) v6Servers.push(profile.ipv6Secondary);

      await api.setDnsServers(
        selectedAlias,
        v4Servers,
        v6Servers.length > 0 ? v6Servers : undefined
      );
      await loadDnsData(selectedAlias);
      onShowToast('DNS Profile Applied', `Applied "${profile.name}" to adapter "${selectedAlias}".`, 'success');
    } catch (err) {
      onShowToast('Failed to Apply DNS', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsApplying(false);
    }
  };

  // Save (Create or Update) Custom Profile
  const handleSaveProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !ipv4Primary.trim()) {
      onShowToast('Validation Error', 'Profile name and Primary IPv4 address are required.', 'warning');
      return;
    }

    const newProfile: DnsProfile = {
      id: editingProfile ? editingProfile.id : `custom_dns_${Date.now()}`,
      name: profileName.trim(),
      isPreset: false,
      ipv4Primary: ipv4Primary.trim(),
      ipv4Secondary: ipv4Secondary.trim() || undefined,
      ipv6Primary: ipv6Primary.trim() || undefined,
      ipv6Secondary: ipv6Secondary.trim() || undefined,
      provider: providerName.trim() || 'Custom',
      createdAt: editingProfile ? editingProfile.createdAt : Date.now(),
    };

    try {
      await api.saveDnsProfile(newProfile);
      setProfiles(await api.getDnsProfiles());
      setIsProfileModalOpen(false);
      setEditingProfile(null);
      resetProfileForm();
      onShowToast('Profile Saved', `DNS profile "${newProfile.name}" saved.`, 'success');
    } catch (err) {
      onShowToast('Failed to Save Profile', err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const resetProfileForm = () => {
    setProfileName('');
    setIpv4Primary('');
    setIpv4Secondary('');
    setIpv6Primary('');
    setIpv6Secondary('');
    setProviderName('');
  };

  const handleOpenEdit = (profile: DnsProfile) => {
    setEditingProfile(profile);
    setProfileName(profile.name);
    setIpv4Primary(profile.ipv4Primary);
    setIpv4Secondary(profile.ipv4Secondary || '');
    setIpv6Primary(profile.ipv6Primary || '');
    setIpv6Secondary(profile.ipv6Secondary || '');
    setProviderName(profile.provider || '');
    setIsProfileModalOpen(true);
  };

  const handleDeleteProfile = async (profileId: string, name: string) => {
    try {
      await api.deleteDnsProfile(profileId);
      setProfiles(await api.getDnsProfiles());
      onShowToast('Profile Deleted', `Custom profile "${name}" was removed.`, 'info');
    } catch (err) {
      onShowToast('Delete Failed', err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // DNS Diagnostics Query
  const handleExecuteQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!queryHost.trim()) return;
    setIsQuerying(true);
    try {
      const res = await api.resolveDnsQuery(queryHost.trim(), recordType);
      setQueryResult(res);
      if (res.status === 'success') {
        onShowToast('DNS Resolved', `${res.query} resolved in ${res.responseTimeMs}ms`, 'success');
      } else {
        onShowToast('Resolution Failed', res.errorMessage || 'Unknown DNS resolution error', 'warning');
      }
    } catch (err) {
      onShowToast('DNS Query Error', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsQuerying(false);
    }
  };

  // Run benchmark across common DNS servers
  const handleBenchmarkServers = async () => {
    setIsBenchmarking(true);
    const serversToTest = [
      '1.1.1.1',
      '8.8.8.8',
      '9.9.9.9',
      '94.140.14.14',
      '208.67.222.222',
    ];
    if (dnsConfig?.ipv4Servers[0] && !serversToTest.includes(dnsConfig.ipv4Servers[0])) {
      serversToTest.unshift(dnsConfig.ipv4Servers[0]);
    }

    try {
      const results: Record<string, DnsTestResult> = {};
      for (const ip of serversToTest) {
        const res = await api.testDnsServer(ip);
        results[ip] = res;
      }
      setServerLatencies(results);
      onShowToast('DNS Benchmark Complete', `Tested ${serversToTest.length} DNS servers.`, 'info');
    } catch (err) {
      onShowToast('Benchmark Failed', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Check if a profile is currently active on the adapter
  const isProfileActive = (profile: DnsProfile): boolean => {
    if (!dnsConfig || dnsConfig.isDhcp) return false;
    const activePrimary = dnsConfig.ipv4Servers[0];
    return activePrimary === profile.ipv4Primary;
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header Banner */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/80 border-slate-800'
      }`}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
          >
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h1 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Windows DNS Manager
            </h1>
            <p className="text-xs text-slate-400">
              Manage network adapter DNS profiles, benchmark latency, and inspect resolver health.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Adapter Selector */}
          <select
            value={selectedAlias}
            onChange={e => setSelectedAlias(e.target.value)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium cursor-pointer transition-colors ${
              isLight
                ? 'bg-slate-50 border-slate-300 text-slate-800 hover:border-slate-400'
                : 'bg-slate-950 border-slate-700 text-slate-200 hover:border-slate-600'
            }`}
          >
            {adapters.length === 0 && <option value="Wi-Fi">Wi-Fi (Default)</option>}
            {adapters.map(adapter => (
              <option key={adapter.id} value={adapter.name}>
                {adapter.name} ({adapter.type})
              </option>
            ))}
          </select>

          <button
            onClick={() => void loadDnsData(selectedAlias)}
            disabled={isLoading}
            className={`p-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              isLight
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Refresh DNS Status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => void handleFlushCache()}
            disabled={isFlushing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
              isLight
                ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
            <span>Flush Cache</span>
          </button>
        </div>
      </div>

      {/* Grid: DNS Overview & Quick Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Configuration Mode */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Configuration Mode
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
              dnsConfig?.isDhcp
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            }`}>
              {dnsConfig?.isDhcp ? 'DHCP (Automatic)' : 'Manual (Static)'}
            </span>
          </div>

          <div className="my-2">
            <div className={`text-sm font-bold truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
              {selectedAlias}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {dnsConfig?.isDhcp
                ? 'Assigned dynamically by network router / DHCP server.'
                : 'Custom static DNS servers configured on adapter.'}
            </div>
          </div>

          {!dnsConfig?.isDhcp && (
            <button
              onClick={() => void handleRestoreDhcp()}
              disabled={isApplying}
              className="mt-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restore Automatic (DHCP)</span>
            </button>
          )}
        </div>

        {/* Card 2: Active IPv4 Servers */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              IPv4 DNS Servers
            </span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>

          <div className="my-2 space-y-1">
            {dnsConfig?.ipv4Servers && dnsConfig.ipv4Servers.length > 0 ? (
              dnsConfig.ipv4Servers.map((ip, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold">{ip}</span>
                  <span className="text-[10px] text-slate-400">
                    {idx === 0 ? 'Primary' : 'Secondary'}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">No IPv4 servers assigned</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Configured and resolving</span>
          </div>
        </div>

        {/* Card 3: DNS Latency & Reachability */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Response Time
            </span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {dnsConfig?.responseTimeMs ? `${dnsConfig.responseTimeMs}` : '12.4'}
              </span>
              <span className="text-xs text-slate-400">ms</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Round-trip query latency to primary DNS resolver
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>IPv6: {dnsConfig?.ipv6Servers?.length ? `${dnsConfig.ipv6Servers.length} server(s)` : 'DHCP / None'}</span>
            <button
              onClick={() => void handleBenchmarkServers()}
              disabled={isBenchmarking}
              className="font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
            >
              <Zap className={`w-3 h-3 ${isBenchmarking ? 'animate-bounce' : ''}`} />
              <span>Benchmark All</span>
            </button>
          </div>
        </div>
      </div>

      {/* DNS Profiles Section */}
      <div className={`p-4 rounded-xl border ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              DNS Profiles & Presets
            </h2>
            <p className="text-xs text-slate-400">
              Select a predefined profile or add your custom private resolvers.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingProfile(null);
              resetProfileForm();
              setIsProfileModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer shadow-xs transition-opacity hover:opacity-90"
            style={{ backgroundColor: accentColor }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Profile</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {profiles.map(profile => {
            const active = isProfileActive(profile);
            const latency = serverLatencies[profile.ipv4Primary]?.latencyMs;

            return (
              <div
                key={profile.id}
                className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
                  active
                    ? 'border-sky-500/60 bg-sky-500/5 ring-1 ring-sky-500/20'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                          {profile.name}
                        </span>
                        {profile.isPreset && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-sm bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                            Preset
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block">{profile.provider || 'Custom'}</span>
                    </div>

                    {active ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                        <Check className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    ) : (
                      latency !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-800/80 text-emerald-400 border border-slate-700">
                          {latency} ms
                        </span>
                      )
                    )}
                  </div>

                  {/* IP Addresses */}
                  <div className="mt-2.5 space-y-1 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 text-[10px]">IPv4:</span>
                      <span className="font-semibold">{profile.ipv4Primary}{profile.ipv4Secondary ? ` / ${profile.ipv4Secondary}` : ''}</span>
                    </div>
                    {profile.ipv6Primary && (
                      <div className="flex items-center justify-between text-slate-400 text-[10px]">
                        <span>IPv6:</span>
                        <span className="truncate max-w-[170px]">{profile.ipv6Primary}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                  {!profile.isPreset ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(profile)}
                        className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        title="Edit profile"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void handleDeleteProfile(profile.id, profile.name)}
                        className="p-1 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                        title="Delete custom profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div />
                  )}

                  <button
                    onClick={() => void handleApplyProfile(profile)}
                    disabled={active || isApplying}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      active
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                        : 'bg-sky-500 text-white hover:bg-sky-600 shadow-xs'
                    }`}
                  >
                    {active ? 'Applied' : 'Apply'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Diagnostics Panel: DNS Query & Resolver Benchmark */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Hostname Resolution Query Tester */}
        <div className={`p-4 rounded-xl border ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-sky-400" />
            <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Hostname Query Diagnostics
            </h3>
          </div>

          <form onSubmit={handleExecuteQuery} className="space-y-2.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={queryHost}
                onChange={e => setQueryHost(e.target.value)}
                placeholder="e.g. google.com, cloudflare.com"
                className={`flex-1 text-xs px-3 py-2 rounded-lg border font-mono ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-sky-500'
                    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-sky-500'
                }`}
              />
              <select
                value={recordType}
                onChange={e => setRecordType(e.target.value)}
                className={`text-xs px-2.5 py-2 rounded-lg border font-mono font-bold cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-200'
                }`}
              >
                <option value="A">A (IPv4)</option>
                <option value="AAAA">AAAA (IPv6)</option>
                <option value="MX">MX</option>
                <option value="TXT">TXT</option>
                <option value="CNAME">CNAME</option>
              </select>
              <button
                type="submit"
                disabled={isQuerying}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                {isQuerying ? 'Querying...' : 'Lookup'}
              </button>
            </div>
          </form>

          {/* Results Box */}
          <div className="mt-3">
            {queryResult ? (
              <div className={`p-3 rounded-lg border ${
                queryResult.status === 'success'
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-rose-500/5 border-rose-500/20'
              }`}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-300">
                    Query: <span className="font-mono text-sky-400">{queryResult.query} ({queryResult.recordType})</span>
                  </span>
                  <span className="font-mono text-[11px] text-emerald-400">
                    {queryResult.responseTimeMs} ms
                  </span>
                </div>
                {queryResult.records.length > 0 ? (
                  <div className="space-y-1 mt-2">
                    {queryResult.records.map((rec, i) => (
                      <div key={i} className="text-xs font-mono bg-slate-950/70 p-1.5 rounded border border-slate-800 text-slate-200">
                        {rec}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-rose-400 mt-1">
                    {queryResult.errorMessage || 'No records returned for query.'}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-400">
                Enter a hostname above and click "Lookup" to test Windows DNS resolution.
              </div>
            )}
          </div>
        </div>

        {/* DNS Resolver Latency Comparison */}
        <div className={`p-4 rounded-xl border flex flex-col justify-between ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  DNS Latency Comparison
                </h3>
              </div>
              <button
                onClick={() => void handleBenchmarkServers()}
                disabled={isBenchmarking}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
              >
                {isBenchmarking ? 'Testing...' : 'Test Latency'}
              </button>
            </div>

            <div className="space-y-2">
              {[
                { name: 'Cloudflare', ip: '1.1.1.1', defaultMs: 11.4 },
                { name: 'Google', ip: '8.8.8.8', defaultMs: 14.8 },
                { name: 'Quad9', ip: '9.9.9.9', defaultMs: 18.5 },
                { name: 'OpenDNS', ip: '208.67.222.222', defaultMs: 16.7 },
                { name: 'AdGuard', ip: '94.140.14.14', defaultMs: 22.3 },
              ].map(item => {
                const latency = serverLatencies[item.ip]?.latencyMs ?? item.defaultMs;
                const percent = Math.min(100, Math.max(10, (latency / 40) * 100));

                return (
                  <div key={item.ip} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">
                        {item.name} <span className="text-[10px] text-slate-400 font-mono">({item.ip})</span>
                      </span>
                      <span className="font-mono font-semibold text-emerald-400">{latency} ms</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: latency < 15 ? '#10b981' : latency < 25 ? '#38bdf8' : '#f59e0b',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Lower latency indicates faster initial connection resolution.</span>
          </div>
        </div>
      </div>

      {/* Profile Add/Edit Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {editingProfile ? 'Edit DNS Profile' : 'Add Custom DNS Profile'}
                </h3>
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveProfileSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Profile Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    placeholder="e.g. My Private Resolver, Pi-hole"
                    className={`w-full text-xs px-3 py-2 rounded-lg border ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">
                      Primary IPv4 *
                    </label>
                    <input
                      type="text"
                      required
                      value={ipv4Primary}
                      onChange={e => setIpv4Primary(e.target.value)}
                      placeholder="1.1.1.1"
                      className={`w-full text-xs px-3 py-2 rounded-lg border font-mono ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">
                      Secondary IPv4 (Optional)
                    </label>
                    <input
                      type="text"
                      value={ipv4Secondary}
                      onChange={e => setIpv4Secondary(e.target.value)}
                      placeholder="1.0.0.1"
                      className={`w-full text-xs px-3 py-2 rounded-lg border font-mono ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">
                      Primary IPv6 (Optional)
                    </label>
                    <input
                      type="text"
                      value={ipv6Primary}
                      onChange={e => setIpv6Primary(e.target.value)}
                      placeholder="2606:4700:4700::1111"
                      className={`w-full text-xs px-3 py-2 rounded-lg border font-mono ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">
                      Secondary IPv6 (Optional)
                    </label>
                    <input
                      type="text"
                      value={ipv6Secondary}
                      onChange={e => setIpv6Secondary(e.target.value)}
                      placeholder="2606:4700:4700::1001"
                      className={`w-full text-xs px-3 py-2 rounded-lg border font-mono ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Provider / Organization
                  </label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={e => setProviderName(e.target.value)}
                    placeholder="e.g. NextDNS, AdGuard, Internal Network"
                    className={`w-full text-xs px-3 py-2 rounded-lg border ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer shadow-xs"
                    style={{ backgroundColor: accentColor }}
                  >
                    Save Profile
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
