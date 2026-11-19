import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  Search,
  Activity,
  Server,
  RefreshCw,
  Check,
  Zap,
  Copy,
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
  Sliders,
  X,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NetworkAdapter } from '../../types/network';
import {
  DnsActivityEntry,
  DnsConfig,
  DnsProfile,
  DnsQueryResult,
  DnsTestResult,
} from '../../types/dns';
import { api } from '../../services/api';
import {
  BenchmarkResolverItem,
  DEFAULT_BENCHMARK_RESOLVERS,
  DNS_RECORD_TYPES,
  computeDnsHealthDiagnostics,
  getEffectiveDnsMode,
  getProfileDescription,
  isProfileActiveOnConfig,
  isValidHostnameInput,
  isValidIpAddress,
  isValidIpv4,
  isValidIpv6,
  verifyAppliedProfileConfig,
} from '../../utils/dns';

interface DnsTabProps {
  adapters: NetworkAdapter[];
  selectedAdapterId: string;
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
  onShowToast: (
    title: string,
    message?: string,
    type?: 'info' | 'success' | 'warning' | 'error'
  ) => void;
}

interface ResolverBenchmarkState {
  ip: string;
  name: string;
  provider: string;
  latest?: DnsTestResult;
  successCount: number;
  failureCount: number;
  isTesting: boolean;
}

interface OperationBanner {
  status: 'loading' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

const HISTORY_STORAGE_KEY = 'netscope_dns_activity_history';
const HISTORY_PREF_KEY = 'netscope_dns_activity_retention';

function formatClockTime(ts?: number | null): string {
  if (!ts) return 'Not tested';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLatencyValue(ms?: number | null): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '--';
  return `${ms.toFixed(1)} ms`;
}

export const DnsTab: React.FC<DnsTabProps> = ({
  adapters,
  selectedAdapterId,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
  onShowToast,
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const physicalAdapters = useMemo(
    () => adapters.filter(a => a.type !== 'virtual' && a.type !== 'loopback'),
    [adapters]
  );

  const defaultAdapter = useMemo(
    () =>
      physicalAdapters.find(a => a.id === selectedAdapterId) ||
      physicalAdapters.find(a => a.isDefault) ||
      physicalAdapters.find(a => a.status === 'connected') ||
      physicalAdapters[0],
    [physicalAdapters, selectedAdapterId]
  );

  const [selectedAlias, setSelectedAlias] = useState<string>(defaultAdapter?.name || 'auto');

  useEffect(() => {
    if (defaultAdapter?.name && selectedAlias === 'auto') {
      setSelectedAlias(defaultAdapter.name);
    } else if (
      defaultAdapter?.name &&
      physicalAdapters.length > 0 &&
      !physicalAdapters.some(a => a.name === selectedAlias)
    ) {
      setSelectedAlias(defaultAdapter.name);
    }
  }, [defaultAdapter, physicalAdapters, selectedAlias]);

  const selectedAdapterObj = useMemo(
    () => physicalAdapters.find(a => a.name === selectedAlias) || defaultAdapter,
    [physicalAdapters, selectedAlias, defaultAdapter]
  );

  // Core DNS config & profiles state
  const [dnsConfig, setDnsConfig] = useState<DnsConfig | null>(null);
  const [configFetchedAt, setConfigFetchedAt] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<DnsProfile[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyingTargetId, setApplyingTargetId] = useState<string | null>(null);
  const [operationBanner, setOperationBanner] = useState<OperationBanner | null>(null);

  // Stale request guard for adapter DNS fetches
  const configRequestSeqRef = useRef(0);

  // Profile search, delete confirm, and modal state
  const [profileSearch, setProfileSearch] = useState('');
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'save' | 'custom_apply'>('save');
  const [editingProfile, setEditingProfile] = useState<DnsProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [providerName, setProviderName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [configureIpv4, setConfigureIpv4] = useState(true);
  const [configureIpv6, setConfigureIpv6] = useState(false);
  const [ipv4Primary, setIpv4Primary] = useState('');
  const [ipv4Secondary, setIpv4Secondary] = useState('');
  const [ipv6Primary, setIpv6Primary] = useState('');
  const [ipv6Secondary, setIpv6Secondary] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Hostname query diagnostics state
  const [queryHost, setQueryHost] = useState('cloudflare.com');
  const [recordType, setRecordType] = useState<(typeof DNS_RECORD_TYPES)[number]>('A');
  const [queryResolver, setQueryResolver] = useState<string>('system');
  const [customQueryResolver, setCustomQueryResolver] = useState<string>('');
  const [queryResult, setQueryResult] = useState<DnsQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const queryRequestSeqRef = useRef(0);

  // DNS latency comparison benchmark state
  const [benchmarkHost, setBenchmarkHost] = useState('cloudflare.com');
  const [benchmarkRecordType, setBenchmarkRecordType] = useState<'A' | 'AAAA'>('A');
  const [selectedBenchmarkIp, setSelectedBenchmarkIp] = useState<string>('1.1.1.1');
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkStats, setBenchmarkStats] = useState<Record<string, ResolverBenchmarkState>>({});
  const benchmarkCancelRef = useRef(false);

  // Local DNS activity history (opt-in / controllable by user)
  const [retainHistory, setRetainHistory] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_PREF_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [activityHistory, setActivityHistory] = useState<DnsActivityEntry[]>(() => {
    try {
      const pref = localStorage.getItem(HISTORY_PREF_KEY);
      if (pref === 'false') return [];
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as DnsActivityEntry[]) : [];
    } catch {
      return [];
    }
  });

  // Expandable Advanced Details
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  // Persist history preference & entries cleanly
  const appendActivityEntry = useCallback(
    (entry: DnsActivityEntry) => {
      if (!retainHistory) return;
      setActivityHistory(prev => {
        const next = [entry, ...prev].slice(0, 25);
        try {
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Optional local persistence
        }
        return next;
      });
    },
    [retainHistory]
  );

  const handleToggleHistoryRetention = (enabled: boolean) => {
    setRetainHistory(enabled);
    try {
      localStorage.setItem(HISTORY_PREF_KEY, String(enabled));
      if (!enabled) {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        setActivityHistory([]);
      }
    } catch {
      // Ignore storage restrictions
    }
  };

  const handleClearActivityHistory = () => {
    setActivityHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage restrictions
    }
    onShowToast('DNS Activity Log Cleared', 'Local DNS query history was removed.', 'info');
  };

  // Load DNS config & profiles for current adapter
  const loadDnsData = useCallback(
    async (alias: string, silent = false) => {
      const seq = ++configRequestSeqRef.current;
      setIsLoadingConfig(true);
      try {
        const target = alias && alias !== 'auto' ? alias : undefined;
        const [config, profs] = await Promise.all([
          api.getDnsConfig(target),
          api.getDnsProfiles(),
        ]);
        if (configRequestSeqRef.current !== seq) return;
        setDnsConfig(config);
        setConfigFetchedAt(Date.now());
        setProfiles(profs);
      } catch (err) {
        if (configRequestSeqRef.current !== seq) return;
        const message = err instanceof Error ? err.message : String(err);
        setOperationBanner({
          status: 'error',
          message: `Failed to read DNS configuration: ${message}`,
          timestamp: Date.now(),
        });
        if (!silent) {
          onShowToast('DNS Status Query Failed', message, 'error');
        }
      } finally {
        if (configRequestSeqRef.current === seq) {
          setIsLoadingConfig(false);
        }
      }
    },
    [onShowToast]
  );

  useEffect(() => {
    void loadDnsData(selectedAlias, true);
  }, [selectedAlias, loadDnsData]);

  // Escape key closes modal cleanly
  useEffect(() => {
    if (!isProfileModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isProfileModalOpen]);

  // Flush Windows DNS cache
  const handleFlushCache = async () => {
    if (isFlushing) return;
    setIsFlushing(true);
    setOperationBanner({
      status: 'loading',
      message: 'Flushing Windows DNS Client resolver cache…',
      timestamp: Date.now(),
    });
    try {
      const ok = await api.flushDnsCache();
      if (!ok) throw new Error('Windows did not confirm DNS cache flush.');
      setOperationBanner({
        status: 'success',
        message: 'Windows DNS Client resolver cache flushed and verified.',
        timestamp: Date.now(),
      });
      onShowToast(
        'DNS Cache Flushed',
        'Windows DNS Client resolver cache was cleared successfully.',
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOperationBanner({
        status: 'error',
        message: `Cache flush failed: ${msg}`,
        timestamp: Date.now(),
      });
      onShowToast('DNS Cache Flush Failed', msg, 'error');
    } finally {
      setIsFlushing(false);
    }
  };

  // Restore Automatic (DHCP) DNS
  const handleRestoreDhcp = async (family: 'all' | 'ipv4' | 'ipv6' = 'all') => {
    if (isApplying) return;
    const targetAlias = dnsConfig?.adapterAlias || selectedAlias;
    if (!targetAlias || targetAlias === 'Unknown' || targetAlias === 'auto') {
      onShowToast('No Target Adapter', 'Select a valid Windows network adapter first.', 'warning');
      return;
    }

    setIsApplying(true);
    setApplyingTargetId(`dhcp_${family}`);
    setOperationBanner({
      status: 'loading',
      message: `Restoring automatic DHCP (${family.toUpperCase()}) on "${targetAlias}"…`,
      timestamp: Date.now(),
    });

    try {
      await api.resetDnsDhcp(targetAlias, family);
      const refreshed = await api.getDnsConfig(targetAlias);
      setDnsConfig(refreshed);
      setConfigFetchedAt(Date.now());

      const v4Dhcp = refreshed.ipv4IsDhcp ?? refreshed.isDhcp;
      const v6Dhcp = refreshed.ipv6IsDhcp ?? refreshed.isDhcp;
      const verified =
        (family === 'all' && v4Dhcp && v6Dhcp) ||
        (family === 'ipv4' && v4Dhcp) ||
        (family === 'ipv6' && v6Dhcp);

      if (!verified) {
        throw new Error(
          `Windows did not confirm DHCP restoration for ${family.toUpperCase()} on "${targetAlias}". Administrator privileges may be required.`
        );
      }

      const label =
        family === 'all'
          ? 'IPv4 and IPv6 DNS'
          : family === 'ipv4'
          ? 'IPv4 DNS'
          : 'IPv6 DNS';
      setOperationBanner({
        status: 'success',
        message: `Restored ${label} to Automatic (DHCP) and verified on "${targetAlias}".`,
        timestamp: Date.now(),
      });
      onShowToast(
        'DNS Restored to Automatic',
        `${label} on "${targetAlias}" now obtains addresses from DHCP.`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOperationBanner({
        status: 'error',
        message: `Restore DHCP failed: ${msg}`,
        timestamp: Date.now(),
      });
      onShowToast('DHCP Reset Failed', msg, 'error');
    } finally {
      setIsApplying(false);
      setApplyingTargetId(null);
    }
  };

  // Apply DNS servers (with full validation -> preserve -> apply -> re-read -> verify flow)
  const applyDnsConfiguration = async (
    targetLabel: string,
    targetId: string,
    v4Servers: string[],
    v6Servers?: string[]
  ): Promise<boolean> => {
    const targetAlias = dnsConfig?.adapterAlias || selectedAlias;
    if (!targetAlias || targetAlias === 'Unknown' || targetAlias === 'auto') {
      onShowToast('No Target Adapter', 'Select a valid Windows network adapter first.', 'warning');
      return false;
    }

    for (const ip of v4Servers) {
      if (!isValidIpv4(ip)) {
        onShowToast('Validation Error', `Invalid IPv4 DNS address: ${ip}`, 'warning');
        return false;
      }
    }
    if (v6Servers) {
      for (const ip of v6Servers) {
        if (!isValidIpv6(ip)) {
          onShowToast('Validation Error', `Invalid IPv6 DNS address: ${ip}`, 'warning');
          return false;
        }
      }
    }
    if (v4Servers.length === 0 && (!v6Servers || v6Servers.length === 0)) {
      onShowToast(
        'Validation Error',
        'Specify at least one valid IPv4 or IPv6 DNS address.',
        'warning'
      );
      return false;
    }

    setIsApplying(true);
    setApplyingTargetId(targetId);
    setOperationBanner({
      status: 'loading',
      message: `Applying "${targetLabel}" to "${targetAlias}" and verifying Windows state…`,
      timestamp: Date.now(),
    });

    try {
      await api.setDnsServers(
        targetAlias,
        v4Servers,
        v6Servers && v6Servers.length > 0 ? v6Servers : undefined
      );

      const refreshed = await api.getDnsConfig(targetAlias);
      setDnsConfig(refreshed);
      setConfigFetchedAt(Date.now());

      const verification = verifyAppliedProfileConfig(refreshed, v4Servers, v6Servers);
      if (!verification.verified) {
        throw new Error(verification.reason || 'Applied DNS settings could not be verified.');
      }

      setOperationBanner({
        status: 'success',
        message: `Verified "${targetLabel}" active on "${targetAlias}".`,
        timestamp: Date.now(),
      });
      onShowToast(
        'DNS Configuration Verified',
        `Applied and verified "${targetLabel}" on "${targetAlias}".`,
        'success'
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOperationBanner({
        status: 'error',
        message: `Failed to apply "${targetLabel}": ${msg}`,
        timestamp: Date.now(),
      });
      onShowToast('DNS Configuration Failed', msg, 'error');
      return false;
    } finally {
      setIsApplying(false);
      setApplyingTargetId(null);
    }
  };

  const handleApplyProfile = async (profile: DnsProfile) => {
    if (isApplying) return;
    const v4Servers = [profile.ipv4Primary, profile.ipv4Secondary]
      .filter((s): s is string => Boolean(s && s.trim()))
      .map(s => s.trim());
    const v6Servers = [profile.ipv6Primary, profile.ipv6Secondary]
      .filter((s): s is string => Boolean(s && s.trim()))
      .map(s => s.trim());

    await applyDnsConfiguration(
      profile.name,
      profile.id,
      v4Servers,
      v6Servers.length > 0 ? v6Servers : undefined
    );
  };

  // Profile / Custom DNS Modal Helpers
  const resetProfileForm = () => {
    setProfileName('');
    setProviderName('');
    setProfileDescription('');
    setConfigureIpv4(true);
    setConfigureIpv6(false);
    setIpv4Primary('');
    setIpv4Secondary('');
    setIpv6Primary('');
    setIpv6Secondary('');
    setModalError(null);
  };

  const handleOpenAddModal = () => {
    setModalMode('save');
    setEditingProfile(null);
    resetProfileForm();
    setIsProfileModalOpen(true);
  };

  const handleOpenCustomApplyModal = () => {
    setModalMode('custom_apply');
    setEditingProfile(null);
    resetProfileForm();
    setProfileName('Custom DNS');
    if (dnsConfig?.ipv4Servers[0]) {
      setIpv4Primary(dnsConfig.ipv4Servers[0]);
      setIpv4Secondary(dnsConfig.ipv4Servers[1] || '');
    }
    if (dnsConfig?.ipv6Servers[0]) {
      setConfigureIpv6(true);
      setIpv6Primary(dnsConfig.ipv6Servers[0]);
      setIpv6Secondary(dnsConfig.ipv6Servers[1] || '');
    }
    setIsProfileModalOpen(true);
  };

  const handleOpenEditModal = (profile: DnsProfile) => {
    setModalMode('save');
    setEditingProfile(profile);
    setProfileName(profile.name);
    setProviderName(profile.provider || '');
    setProfileDescription(profile.description || '');
    setConfigureIpv4(Boolean(profile.ipv4Primary));
    setConfigureIpv6(Boolean(profile.ipv6Primary));
    setIpv4Primary(profile.ipv4Primary || '');
    setIpv4Secondary(profile.ipv4Secondary || '');
    setIpv6Primary(profile.ipv6Primary || '');
    setIpv6Secondary(profile.ipv6Secondary || '');
    setModalError(null);
    setIsProfileModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent, alsoApply = false) => {
    e.preventDefault();
    setModalError(null);

    const v4List: string[] = [];
    const v6List: string[] = [];

    if (configureIpv4) {
      if (!ipv4Primary.trim() || !isValidIpv4(ipv4Primary)) {
        setModalError('Enter a valid Primary IPv4 DNS address (e.g. 1.1.1.1).');
        return;
      }
      v4List.push(ipv4Primary.trim());
      if (ipv4Secondary.trim()) {
        if (!isValidIpv4(ipv4Secondary)) {
          setModalError('Secondary IPv4 DNS address is invalid.');
          return;
        }
        v4List.push(ipv4Secondary.trim());
      }
    }

    if (configureIpv6) {
      if (!ipv6Primary.trim() || !isValidIpv6(ipv6Primary)) {
        setModalError('Enter a valid Primary IPv6 DNS address (e.g. 2606:4700:4700::1111).');
        return;
      }
      v6List.push(ipv6Primary.trim());
      if (ipv6Secondary.trim()) {
        if (!isValidIpv6(ipv6Secondary)) {
          setModalError('Secondary IPv6 DNS address is invalid.');
          return;
        }
        v6List.push(ipv6Secondary.trim());
      }
    }

    if (v4List.length === 0 && v6List.length === 0) {
      setModalError('Enable and configure at least one IPv4 or IPv6 DNS address.');
      return;
    }

    if (modalMode === 'custom_apply' && !alsoApply) {
      const ok = await applyDnsConfiguration(
        profileName.trim() || 'Custom DNS',
        'custom_direct',
        v4List,
        v6List.length > 0 ? v6List : undefined
      );
      if (ok) {
        setIsProfileModalOpen(false);
        resetProfileForm();
      }
      return;
    }

    if (!profileName.trim()) {
      setModalError('Profile name is required to save a custom profile.');
      return;
    }

    const savedProfile: DnsProfile = {
      id: editingProfile ? editingProfile.id : `custom_dns_${Date.now()}`,
      name: profileName.trim(),
      isPreset: false,
      ipv4Primary: v4List[0] || '',
      ipv4Secondary: v4List[1] || undefined,
      ipv6Primary: v6List[0] || undefined,
      ipv6Secondary: v6List[1] || undefined,
      provider: providerName.trim() || 'Custom',
      description: profileDescription.trim() || undefined,
      createdAt: editingProfile ? editingProfile.createdAt : Date.now(),
    };

    try {
      await api.saveDnsProfile(savedProfile);
      setProfiles(await api.getDnsProfiles());
      setIsProfileModalOpen(false);
      setEditingProfile(null);
      resetProfileForm();
      onShowToast('Profile Saved', `DNS profile "${savedProfile.name}" saved.`, 'success');

      if (alsoApply) {
        await handleApplyProfile(savedProfile);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalError(msg);
      onShowToast('Failed to Save Profile', msg, 'error');
    }
  };

  const handleDeleteProfile = async (profileId: string, name: string) => {
    try {
      await api.deleteDnsProfile(profileId);
      setProfiles(await api.getDnsProfiles());
      setConfirmDeleteProfileId(null);
      onShowToast('Profile Deleted', `Custom profile "${name}" was removed.`, 'info');
    } catch (err) {
      onShowToast('Delete Failed', err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // Hostname Resolution Lookup
  const handleExecuteQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanHost = queryHost.trim();
    if (!isValidHostnameInput(cleanHost)) {
      setQueryError('Enter a valid domain hostname (e.g. cloudflare.com).');
      return;
    }

    let resolvedTarget: string | undefined;
    if (queryResolver === 'custom') {
      const customIp = customQueryResolver.trim();
      if (!isValidIpAddress(customIp)) {
        setQueryError('Enter a valid custom resolver IPv4 or IPv6 address.');
        return;
      }
      resolvedTarget = customIp;
    } else if (queryResolver !== 'system') {
      resolvedTarget = queryResolver;
    }

    setQueryError(null);
    setIsQuerying(true);
    const seq = ++queryRequestSeqRef.current;

    try {
      const res = await api.resolveDnsQuery(cleanHost, recordType, resolvedTarget);
      if (queryRequestSeqRef.current !== seq) return;
      const stamped: DnsQueryResult = {
        ...res,
        queriedAt: res.queriedAt || Date.now(),
        resolverUsed: res.resolverUsed || resolvedTarget || 'System DNS',
      };
      setQueryResult(stamped);

      appendActivityEntry({
        id: `dns_act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: stamped.queriedAt || Date.now(),
        hostname: stamped.query,
        recordType: stamped.recordType,
        resolver: stamped.resolverUsed || 'System DNS',
        responseTimeMs: stamped.responseTimeMs,
        status: stamped.status,
        recordCount: stamped.records.length,
        errorMessage: stamped.errorMessage,
      });

      if (stamped.status === 'success') {
        onShowToast(
          'DNS Lookup Complete',
          `${stamped.query} (${stamped.recordType}) resolved in ${stamped.responseTimeMs} ms`,
          'success'
        );
      } else {
        onShowToast(
          'DNS Resolution Failed',
          stamped.errorMessage || `No ${stamped.recordType} records returned.`,
          'warning'
        );
      }
    } catch (err) {
      if (queryRequestSeqRef.current !== seq) return;
      const msg = err instanceof Error ? err.message : String(err);
      setQueryError(msg);
      onShowToast('DNS Query Error', msg, 'error');
    } finally {
      if (queryRequestSeqRef.current === seq) {
        setIsQuerying(false);
      }
    }
  };

  // Benchmark Resolvers List (includes active adapter resolver if custom)
  const benchmarkResolverList = useMemo<BenchmarkResolverItem[]>(() => {
    const base = [...DEFAULT_BENCHMARK_RESOLVERS];
    const adapterPrimary = dnsConfig?.ipv4Servers[0];
    if (adapterPrimary && !base.some(item => item.ip === adapterPrimary)) {
      base.unshift({
        id: 'adapter_primary',
        name: 'Current Adapter DNS',
        ip: adapterPrimary,
        provider: dnsConfig?.isDhcp ? 'DHCP' : 'Static',
      });
    }
    return base;
  }, [dnsConfig]);

  // Run a single resolver probe and update stats
  const probeResolver = useCallback(
    async (item: BenchmarkResolverItem, host: string, rtype: 'A' | 'AAAA') => {
      setBenchmarkStats(prev => ({
        ...prev,
        [item.ip]: {
          ip: item.ip,
          name: item.name,
          provider: item.provider,
          latest: prev[item.ip]?.latest,
          successCount: prev[item.ip]?.successCount ?? 0,
          failureCount: prev[item.ip]?.failureCount ?? 0,
          isTesting: true,
        },
      }));

      try {
        const res = await api.testDnsServer(item.ip, host, rtype);
        if (benchmarkCancelRef.current) return;
        setBenchmarkStats(prev => {
          const current = prev[item.ip] || {
            ip: item.ip,
            name: item.name,
            provider: item.provider,
            successCount: 0,
            failureCount: 0,
            isTesting: false,
          };
          return {
            ...prev,
            [item.ip]: {
              ...current,
              latest: {
                ...res,
                testedAt: res.testedAt || Date.now(),
                queryHost: res.queryHost || host,
                recordType: res.recordType || rtype,
              },
              successCount: res.reachable ? current.successCount + 1 : current.successCount,
              failureCount: !res.reachable ? current.failureCount + 1 : current.failureCount,
              isTesting: false,
            },
          };
        });
      } catch (err) {
        if (benchmarkCancelRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setBenchmarkStats(prev => {
          const current = prev[item.ip] || {
            ip: item.ip,
            name: item.name,
            provider: item.provider,
            successCount: 0,
            failureCount: 0,
            isTesting: false,
          };
          return {
            ...prev,
            [item.ip]: {
              ...current,
              latest: {
                serverIp: item.ip,
                reachable: false,
                latencyMs: 0,
                testedAt: Date.now(),
                queryHost: host,
                recordType: rtype,
                errorMessage: message,
              },
              failureCount: current.failureCount + 1,
              isTesting: false,
            },
          };
        });
      }
    },
    []
  );

  const handleBenchmarkAll = async () => {
    if (isBenchmarking) return;
    const cleanHost = benchmarkHost.trim();
    if (!isValidHostnameInput(cleanHost)) {
      onShowToast('Invalid Benchmark Hostname', 'Enter a valid hostname to benchmark.', 'warning');
      return;
    }

    benchmarkCancelRef.current = false;
    setIsBenchmarking(true);

    try {
      // Controlled concurrency (2 workers at a time) for consistent measurements without flooding
      const queue = [...benchmarkResolverList];
      const runWorker = async () => {
        while (queue.length > 0 && !benchmarkCancelRef.current) {
          const next = queue.shift();
          if (next) {
            await probeResolver(next, cleanHost, benchmarkRecordType);
          }
        }
      };
      await Promise.all([runWorker(), runWorker()]);

      if (!benchmarkCancelRef.current) {
        onShowToast(
          'DNS Benchmark Complete',
          `Tested ${benchmarkResolverList.length} resolvers for ${cleanHost} (${benchmarkRecordType}).`,
          'info'
        );
      }
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleBenchmarkSingle = async (ip: string) => {
    if (isBenchmarking) return;
    const cleanHost = benchmarkHost.trim();
    if (!isValidHostnameInput(cleanHost)) {
      onShowToast('Invalid Benchmark Hostname', 'Enter a valid hostname to test.', 'warning');
      return;
    }
    const target = benchmarkResolverList.find(r => r.ip === ip);
    if (!target) return;
    benchmarkCancelRef.current = false;
    setIsBenchmarking(true);
    try {
      await probeResolver(target, cleanHost, benchmarkRecordType);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleCancelBenchmark = () => {
    benchmarkCancelRef.current = true;
    setIsBenchmarking(false);
    setBenchmarkStats(prev => {
      const next: Record<string, ResolverBenchmarkState> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = { ...v, isTesting: false };
      }
      return next;
    });
    onShowToast('Benchmark Cancelled', 'Stopped remaining DNS resolver probes.', 'info');
  };

  // Copy helper
  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500);
    } catch {
      onShowToast('Clipboard Unavailable', 'Could not write to clipboard.', 'warning');
    }
  };

  // Derived consistent status metrics
  const effectiveMode = useMemo(() => getEffectiveDnsMode(dnsConfig), [dnsConfig]);
  const healthDiagnostics = useMemo(
    () => computeDnsHealthDiagnostics(dnsConfig, queryResult),
    [dnsConfig, queryResult]
  );

  const filteredProfiles = useMemo(() => {
    const q = profileSearch.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(p => {
      const hay = [
        p.name,
        p.provider || '',
        p.ipv4Primary,
        p.ipv4Secondary || '',
        p.ipv6Primary || '',
        getProfileDescription(p),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [profiles, profileSearch]);

  // Dynamic max latency for proportional benchmark bars (no hardcoded denominators)
  const maxMeasuredLatencyMs = useMemo(() => {
    const latencies = Object.values(benchmarkStats)
      .filter(s => s.latest?.reachable && Number.isFinite(s.latest.latencyMs))
      .map(s => s.latest!.latencyMs);
    if (latencies.length === 0) return 0;
    return Math.max(...latencies, 1);
  }, [benchmarkStats]);

  const cardSurface = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900/75 border-slate-800 text-slate-100';
  const subSurface = isLight
    ? 'bg-slate-50 border-slate-200 text-slate-800'
    : 'bg-slate-950/60 border-slate-800/80 text-slate-200';
  const inputSurface = isLight
    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-sky-500';
  const secondaryButton = isLight
    ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
    : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700';

  const activeResolverLabel =
    dnsConfig?.ipv4Servers[0] || dnsConfig?.ipv6Servers[0] || 'None assigned';

  return (
    <div className="space-y-4 pb-8 w-full min-w-0">
      {/* 1. Main Header */}
      <header className={`p-4 rounded-xl border ${cardSurface}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: `${accentColor}1A`,
                borderColor: `${accentColor}40`,
                color: accentColor,
              }}
            >
              <Globe className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight">DNS Manager</h1>
                {selectedAdapterObj && (
                  <span className="text-xs text-slate-400 font-medium truncate">
                    · {selectedAdapterObj.name} ({selectedAdapterObj.status === 'connected' ? 'Connected' : 'Disconnected'})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure IPv4/IPv6 DNS resolvers, manage profiles, benchmark query latency, and diagnose lookups.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="sr-only" htmlFor="dns-adapter-select">
              Select network adapter
            </label>
            <select
              id="dns-adapter-select"
              value={selectedAlias}
              onChange={e => setSelectedAlias(e.target.value)}
              disabled={isApplying}
              className={`h-9 text-xs px-3 rounded-lg border font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 max-w-full min-w-[160px] ${inputSurface}`}
            >
              {physicalAdapters.length === 0 && (
                <option value="auto">Active Default Adapter</option>
              )}
              {physicalAdapters.map(adapter => (
                <option key={adapter.id} value={adapter.name}>
                  {adapter.name} · {adapter.type.toUpperCase()} ({adapter.status === 'connected' ? 'Up' : 'Down'})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void loadDnsData(selectedAlias)}
              disabled={isLoadingConfig}
              title="Refresh adapter DNS configuration"
              aria-label="Refresh adapter DNS configuration"
              className={`h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${secondaryButton}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingConfig ? 'animate-spin' : ''}`} />
              <span>{isLoadingConfig ? 'Refreshing…' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleFlushCache()}
              disabled={isFlushing}
              title="Clear Windows DNS Client resolver cache"
              aria-label="Flush DNS cache"
              className={`h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${secondaryButton}`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
              <span>{isFlushing ? 'Flushing…' : 'Flush Cache'}</span>
            </button>
          </div>
        </div>

        {/* Live Operation Status Feedback */}
        {operationBanner && (
          <div
            role="status"
            className={`mt-3 px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              operationBanner.status === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : operationBanner.status === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : operationBanner.status === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {operationBanner.status === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : operationBanner.status === 'error' ? (
                <XCircle className="w-3.5 h-3.5 shrink-0" />
              ) : operationBanner.status === 'warning' ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
              )}
              <span className="truncate font-medium">{operationBanner.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono tabular-nums opacity-80">
                {formatClockTime(operationBanner.timestamp)}
              </span>
              <button
                type="button"
                onClick={() => setOperationBanner(null)}
                title="Dismiss status message"
                aria-label="Dismiss status message"
                className="p-0.5 rounded hover:bg-black/15 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. DNS Status Overview Grid (4 Balanced Cards) */}
      <section aria-label="DNS Status Overview" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Card 1: Configuration */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between min-w-0 ${cardSurface}`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400">Configuration</span>
              <Sliders className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>

            <div className="mt-2">
              <div className="text-sm font-bold truncate" title={dnsConfig?.adapterAlias || selectedAlias}>
                {dnsConfig?.adapterAlias || selectedAlias}
              </div>
              <div className="text-xs mt-1 flex items-center gap-1.5 font-medium">
                <span
                  className={
                    effectiveMode.kind === 'unavailable'
                      ? 'text-rose-400'
                      : effectiveMode.kind === 'dhcp'
                      ? 'text-sky-400'
                      : effectiveMode.kind === 'manual'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {effectiveMode.label}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5 font-mono tabular-nums truncate">
                Active: {activeResolverLabel}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-2">
            {effectiveMode.kind !== 'dhcp' && effectiveMode.kind !== 'unavailable' ? (
              <button
                type="button"
                onClick={() => void handleRestoreDhcp('all')}
                disabled={isApplying}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore DHCP</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">
                {effectiveMode.kind === 'dhcp' ? 'Router / DHCP assigned' : 'No adapter detected'}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: IPv4 DNS */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between min-w-0 ${cardSurface}`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400">IPv4 DNS</span>
              <span className="text-[11px] font-mono text-slate-400">
                {effectiveMode.ipv4Mode === 'manual' ? 'Manual' : 'DHCP'}
              </span>
            </div>

            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 shrink-0">Primary</span>
                <span className="font-mono font-semibold tabular-nums truncate">
                  {dnsConfig?.ipv4Servers[0] || 'None assigned'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 shrink-0">Secondary</span>
                <span className="font-mono font-medium tabular-nums truncate text-slate-300">
                  {dnsConfig?.ipv4Servers[1] || 'None'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-1.5 text-[11px]">
            {!dnsConfig || dnsConfig.status === 'unavailable' ? (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Status unavailable</span>
              </span>
            ) : dnsConfig.ipv4Servers.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Unconfigured · No IPv4 DNS</span>
              </span>
            ) : dnsConfig.ipv4Reachable === true ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Reachable ({formatLatencyValue(dnsConfig.ipv4LatencyMs ?? dnsConfig.responseTimeMs)})</span>
              </span>
            ) : dnsConfig.ipv4Reachable === false ? (
              <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Configured · Unreachable</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Configured · Not probed</span>
              </span>
            )}
          </div>
        </div>

        {/* Card 3: IPv6 DNS */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between min-w-0 ${cardSurface}`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400">IPv6 DNS</span>
              <span className="text-[11px] font-mono text-slate-400">
                {effectiveMode.ipv6Mode === 'manual' ? 'Manual' : 'DHCP'}
              </span>
            </div>

            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                <span className="text-slate-400 shrink-0">Primary</span>
                <span
                  className="font-mono font-semibold tabular-nums truncate"
                  title={dnsConfig?.ipv6Servers[0] || undefined}
                >
                  {dnsConfig?.ipv6Servers[0] || 'None assigned'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                <span className="text-slate-400 shrink-0">Secondary</span>
                <span
                  className="font-mono font-medium tabular-nums truncate text-slate-300"
                  title={dnsConfig?.ipv6Servers[1] || undefined}
                >
                  {dnsConfig?.ipv6Servers[1] || 'None'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-1.5 text-[11px]">
            {!dnsConfig || dnsConfig.status === 'unavailable' ? (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Status unavailable</span>
              </span>
            ) : dnsConfig.ipv6Servers.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>No IPv6 DNS assigned</span>
              </span>
            ) : dnsConfig.ipv6Reachable === true ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Reachable ({formatLatencyValue(dnsConfig.ipv6LatencyMs)})</span>
              </span>
            ) : dnsConfig.ipv6Reachable === false ? (
              <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Configured · Unreachable</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Configured · Not probed</span>
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Resolver Health */}
        <div className={`p-3.5 rounded-xl border flex flex-col justify-between min-w-0 ${cardSurface}`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400">Resolver Health</span>
              <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>

            <div className="mt-2">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    dnsConfig?.responseTimeMs != null
                      ? dnsConfig.responseTimeMs < 35
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                      : 'text-slate-400'
                  }`}
                >
                  {dnsConfig?.responseTimeMs != null ? dnsConfig.responseTimeMs.toFixed(1) : '--'}
                </span>
                <span className="text-xs text-slate-400">ms</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate font-mono">
                Target: {activeResolverLabel}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-2 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                dnsConfig?.status === 'configured'
                  ? 'text-emerald-400'
                  : dnsConfig?.status === 'unreachable'
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              {dnsConfig?.status === 'configured'
                ? 'Resolving'
                : dnsConfig?.status === 'unreachable'
                ? 'Unreachable'
                : dnsConfig?.status === 'unconfigured'
                ? 'No Resolver'
                : 'Unavailable'}
            </span>
            <span className="text-slate-400 font-mono tabular-nums">
              {formatClockTime(dnsConfig?.testedAt ?? configFetchedAt)}
            </span>
          </div>
        </div>
      </section>

      {/* 3. DNS Health Diagnostics */}
      <section aria-label="DNS Health Diagnostics" className={`p-3.5 rounded-xl border ${cardSurface}`}>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold">DNS Health Diagnostics</h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono tabular-nums">
            {healthDiagnostics.filter(d => d.severity === 'ok').length}/{healthDiagnostics.length} checks healthy
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {healthDiagnostics.map(check => (
            <div
              key={check.id}
              className={`px-3 py-2 rounded-lg border text-xs flex items-start gap-2 min-w-0 ${subSurface}`}
            >
              {check.severity === 'ok' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              ) : check.severity === 'error' ? (
                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              ) : check.severity === 'warning' ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="font-semibold text-[11px] text-slate-300">{check.label}</div>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{check.message}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. DNS Profiles & Custom Configuration */}
      <section aria-label="DNS Profiles" className={`p-4 rounded-xl border ${cardSurface}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-bold">DNS Profiles & Custom Resolvers</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Apply validated public DNS presets or configure custom IPv4/IPv6 servers independently.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={profileSearch}
                onChange={e => setProfileSearch(e.target.value)}
                placeholder="Search profiles…"
                aria-label="Search DNS profiles"
                className={`h-9 pl-8 pr-3 rounded-lg border text-xs w-44 sm:w-52 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${inputSurface}`}
              />
            </div>

            <button
              type="button"
              onClick={handleOpenCustomApplyModal}
              disabled={isApplying}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${secondaryButton}`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Custom DNS</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="h-9 px-3.5 rounded-lg text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              style={{ backgroundColor: accentColor }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Profile</span>
            </button>
          </div>
        </div>

        {filteredProfiles.length === 0 ? (
          <div className={`p-6 rounded-lg border border-dashed text-center text-xs text-slate-400 ${subSurface}`}>
            No DNS profiles match "{profileSearch}". Try clearing the search filter or add a custom profile.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProfiles.map(profile => {
              const active = isProfileActiveOnConfig(profile, dnsConfig);
              const measured = benchmarkStats[profile.ipv4Primary]?.latest;
              const isThisApplying = isApplying && applyingTargetId === profile.id;
              const confirmingDelete = confirmDeleteProfileId === profile.id;

              return (
                <div
                  key={profile.id}
                  className={`p-3.5 rounded-lg border flex flex-col justify-between transition-colors min-w-0 ${
                    active
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : isLight
                      ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold truncate">{profile.name}</h3>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>{profile.provider || 'Custom'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{profile.isPreset ? 'Built-in' : 'Saved Custom'}</span>
                        </div>
                      </div>

                      {active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      ) : measured ? (
                        <span
                          className={`text-[11px] font-mono tabular-nums shrink-0 ${
                            measured.reachable ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {measured.reachable ? `${measured.latencyMs.toFixed(1)} ms` : 'Unreachable'}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                      {getProfileDescription(profile)}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-800/50 space-y-1 font-mono text-[11px] tabular-nums">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-slate-400 shrink-0">IPv4</span>
                        <span className="font-semibold truncate">
                          {profile.ipv4Primary || 'Not set'}
                          {profile.ipv4Secondary ? ` / ${profile.ipv4Secondary}` : ''}
                        </span>
                      </div>
                      {profile.ipv6Primary && (
                        <div className="flex items-center justify-between gap-2 min-w-0 text-slate-400">
                          <span className="shrink-0">IPv6</span>
                          <span
                            className="truncate"
                            title={`${profile.ipv6Primary}${profile.ipv6Secondary ? ` / ${profile.ipv6Secondary}` : ''}`}
                          >
                            {profile.ipv6Primary}
                            {profile.ipv6Secondary ? ` / ${profile.ipv6Secondary}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/50 flex items-center justify-between gap-2">
                    {!profile.isPreset ? (
                      confirmingDelete ? (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => void handleDeleteProfile(profile.id, profile.name)}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProfileId(null)}
                            className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(profile)}
                            title="Edit custom DNS profile"
                            aria-label={`Edit ${profile.name}`}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProfileId(profile.id)}
                            title="Delete custom DNS profile"
                            aria-label={`Delete ${profile.name}`}
                            className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    ) : (
                      <span className="text-[11px] text-slate-400">Verified on apply</span>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleApplyProfile(profile)}
                      disabled={active || isApplying}
                      className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        active
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default'
                          : 'bg-sky-600 hover:bg-sky-500 text-white cursor-pointer disabled:opacity-50'
                      }`}
                    >
                      {isThisApplying ? 'Applying…' : active ? 'Applied' : 'Apply'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Diagnostics Workspace: Hostname Lookup + Live Resolver Benchmark */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        {/* Left Panel: Hostname Query Diagnostics */}
        <section
          aria-label="Hostname Query Diagnostics"
          className={`p-4 rounded-xl border flex flex-col justify-between min-w-0 ${cardSurface}`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-4 h-4 text-sky-400 shrink-0" />
                <h2 className="text-sm font-bold truncate">Hostname Query Diagnostics</h2>
              </div>
              {queryResult && (
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText(
                      'summary',
                      `${queryResult.query} (${queryResult.recordType}) via ${queryResult.resolverUsed || 'System DNS'} — ${queryResult.status.toUpperCase()} (${queryResult.responseTimeMs} ms)\n${queryResult.records.join('\n')}`
                    )
                  }
                  title="Copy full diagnostic lookup result"
                  className="text-[11px] text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedKey === 'summary' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'summary' ? 'Copied' : 'Copy Result'}</span>
                </button>
              )}
            </div>

            <form onSubmit={e => void handleExecuteQuery(e)} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6 min-w-0">
                  <label className="sr-only" htmlFor="dns-lookup-host">
                    Hostname to resolve
                  </label>
                  <input
                    id="dns-lookup-host"
                    type="text"
                    value={queryHost}
                    onChange={e => setQueryHost(e.target.value)}
                    placeholder="e.g. cloudflare.com"
                    className={`w-full h-9 text-xs px-3 rounded-lg border font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${inputSurface}`}
                  />
                </div>
                <div className="sm:col-span-3 min-w-0">
                  <label className="sr-only" htmlFor="dns-lookup-type">
                    DNS record type
                  </label>
                  <select
                    id="dns-lookup-type"
                    value={recordType}
                    onChange={e =>
                      setRecordType(e.target.value as (typeof DNS_RECORD_TYPES)[number])
                    }
                    className={`w-full h-9 text-xs px-2.5 rounded-lg border font-mono font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${inputSurface}`}
                  >
                    {DNS_RECORD_TYPES.map(rt => (
                      <option key={rt} value={rt}>
                        {rt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3 min-w-0">
                  <button
                    type="submit"
                    disabled={isQuerying}
                    className="w-full h-9 px-3 rounded-lg text-xs font-semibold text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    style={{ backgroundColor: accentColor }}
                  >
                    {isQuerying ? 'Resolving…' : 'Lookup'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label className="text-[11px] text-slate-400 block mb-1" htmlFor="dns-lookup-resolver">
                    Resolver
                  </label>
                  <select
                    id="dns-lookup-resolver"
                    value={queryResolver}
                    onChange={e => setQueryResolver(e.target.value)}
                    className={`w-full h-8 text-xs px-2.5 rounded-lg border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${inputSurface}`}
                  >
                    <option value="system">System DNS (Adapter)</option>
                    {DEFAULT_BENCHMARK_RESOLVERS.map(r => (
                      <option key={r.ip} value={r.ip}>
                        {r.name} ({r.ip})
                      </option>
                    ))}
                    <option value="custom">Custom Resolver IP…</option>
                  </select>
                </div>
                {queryResolver === 'custom' && (
                  <div className="min-w-0">
                    <label className="text-[11px] text-slate-400 block mb-1" htmlFor="dns-lookup-custom-resolver">
                      Custom Resolver IP
                    </label>
                    <input
                      id="dns-lookup-custom-resolver"
                      type="text"
                      value={customQueryResolver}
                      onChange={e => setCustomQueryResolver(e.target.value)}
                      placeholder="e.g. 1.1.1.1"
                      className={`w-full h-8 text-xs px-2.5 rounded-lg border font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${inputSurface}`}
                    />
                  </div>
                )}
              </div>

              {queryError && (
                <div className="text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{queryError}</span>
                </div>
              )}
            </form>

            {/* Query Result Panel */}
            <div className="mt-3.5">
              {isQuerying ? (
                <div className={`p-4 rounded-lg border text-xs flex items-center gap-2 text-slate-400 ${subSurface}`}>
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
                  <span>Running live {recordType} lookup for {queryHost.trim()}…</span>
                </div>
              ) : queryResult ? (
                <div
                  className={`p-3 rounded-lg border ${
                    queryResult.status === 'success'
                      ? 'bg-emerald-500/5 border-emerald-500/25'
                      : 'bg-rose-500/5 border-rose-500/25'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-2 border-b border-slate-800/60">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {queryResult.status === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono font-semibold truncate">
                        {queryResult.query} ({queryResult.recordType})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                      <span>{queryResult.resolverUsed || 'System DNS'}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          queryResult.status === 'success' ? 'text-emerald-400 font-semibold' : 'text-rose-400'
                        }
                      >
                        {queryResult.responseTimeMs.toFixed(1)} ms
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatClockTime(queryResult.queriedAt)}</span>
                    </div>
                  </div>

                  {queryResult.status === 'success' && queryResult.records.length > 0 ? (
                    <div className="space-y-1.5 mt-2.5 max-h-48 overflow-y-auto">
                      {(queryResult.detailedRecords && queryResult.detailedRecords.length > 0
                        ? queryResult.detailedRecords
                        : queryResult.records.map(value => ({
                            value,
                            ttl: null,
                            recordType: queryResult.recordType,
                          }))
                      ).map((rec, idx) => (
                        <div
                          key={`${rec.value}_${idx}`}
                          className={`flex items-center justify-between gap-2 text-xs font-mono px-2.5 py-1.5 rounded border min-w-0 ${subSurface}`}
                        >
                          <span className="truncate select-text">{rec.value}</span>
                          <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-400 tabular-nums">
                            {rec.ttl !== null && rec.ttl !== undefined && (
                              <span>TTL {rec.ttl}s</span>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleCopyText(`rec_${idx}`, rec.value)}
                              title={`Copy ${rec.value}`}
                              aria-label={`Copy record ${rec.value}`}
                              className="p-1 rounded hover:bg-slate-800/70 text-slate-400 hover:text-slate-100 cursor-pointer"
                            >
                              {copiedKey === `rec_${idx}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-rose-400 mt-2">
                      {queryResult.errorMessage || 'No DNS records returned for this query.'}
                    </p>
                  )}
                </div>
              ) : (
                <div className={`p-5 rounded-lg border border-dashed text-center text-xs text-slate-400 ${subSurface}`}>
                  Enter a hostname and record type above, choose System DNS or a specific resolver, and press Enter or click Lookup.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 text-[11px] text-slate-400">
            Supports A, AAAA, MX, TXT, CNAME, and NS queries with live TTL and duration reporting.
          </div>
        </section>

        {/* Right Panel: DNS Latency Comparison (Real Benchmarking) */}
        <section
          aria-label="DNS Latency Comparison"
          className={`p-4 rounded-xl border flex flex-col justify-between min-w-0 ${cardSurface}`}
        >
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                <h2 className="text-sm font-bold truncate">DNS Latency Comparison</h2>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {isBenchmarking ? (
                  <button
                    type="button"
                    onClick={handleCancelBenchmark}
                    className="h-8 px-2.5 rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Cancel Benchmark
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleBenchmarkSingle(selectedBenchmarkIp)}
                      className={`h-8 px-2.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap ${secondaryButton}`}
                    >
                      Test Selected
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBenchmarkAll()}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                      style={{ backgroundColor: accentColor }}
                    >
                      Benchmark All
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Uniform Test Conditions Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-3">
              <div className="sm:col-span-5 min-w-0">
                <label className="text-[11px] text-slate-400 block mb-1" htmlFor="dns-bench-host">
                  Benchmark Host
                </label>
                <input
                  id="dns-bench-host"
                  type="text"
                  value={benchmarkHost}
                  onChange={e => setBenchmarkHost(e.target.value)}
                  placeholder="cloudflare.com"
                  className={`w-full h-8 text-xs px-2.5 rounded-lg border font-mono ${inputSurface}`}
                />
              </div>
              <div className="sm:col-span-2 min-w-0">
                <label className="text-[11px] text-slate-400 block mb-1" htmlFor="dns-bench-type">
                  Type
                </label>
                <select
                  id="dns-bench-type"
                  value={benchmarkRecordType}
                  onChange={e => setBenchmarkRecordType(e.target.value as 'A' | 'AAAA')}
                  className={`w-full h-8 text-xs px-2 rounded-lg border font-mono ${inputSurface}`}
                >
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                </select>
              </div>
              <div className="sm:col-span-5 min-w-0">
                <label className="text-[11px] text-slate-400 block mb-1" htmlFor="dns-bench-selected">
                  Selected Resolver
                </label>
                <select
                  id="dns-bench-selected"
                  value={selectedBenchmarkIp}
                  onChange={e => setSelectedBenchmarkIp(e.target.value)}
                  className={`w-full h-8 text-xs px-2 rounded-lg border font-mono ${inputSurface}`}
                >
                  {benchmarkResolverList.map(r => (
                    <option key={r.ip} value={r.ip}>
                      {r.name} ({r.ip})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Resolver Results List */}
            <div className="space-y-2.5">
              {benchmarkResolverList.map(item => {
                const stat = benchmarkStats[item.ip];
                const latest = stat?.latest;
                const isTesting = Boolean(stat?.isTesting);
                const reachable = latest?.reachable ?? false;
                const widthPct =
                  latest && reachable && maxMeasuredLatencyMs > 0
                    ? Math.min(100, Math.max(8, (latest.latencyMs / maxMeasuredLatencyMs) * 100))
                    : 0;

                return (
                  <div key={item.ip} className={`p-2.5 rounded-lg border ${subSurface}`}>
                    <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate">{item.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono shrink-0">{item.ip}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[11px]">
                        {isTesting ? (
                          <span className="text-sky-400 inline-flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Testing…</span>
                          </span>
                        ) : latest ? (
                          reachable ? (
                            <span className="text-emerald-400 font-semibold">
                              {latest.latencyMs.toFixed(1)} ms
                            </span>
                          ) : (
                            <span
                              className="text-rose-400 font-semibold"
                              title={latest.errorMessage || 'Resolver failed to respond'}
                            >
                              Failed
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">Not tested</span>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleBenchmarkSingle(item.ip)}
                          disabled={isBenchmarking}
                          title={`Re-test ${item.name} (${item.ip})`}
                          aria-label={`Test ${item.name}`}
                          className="p-1 rounded hover:bg-slate-800/70 text-slate-400 hover:text-slate-100 cursor-pointer disabled:opacity-40"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-slate-800/90 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor:
                            !latest || !reachable
                              ? 'transparent'
                              : latest.latencyMs < 20
                              ? '#10b981'
                              : latest.latencyMs < 50
                              ? '#38bdf8'
                              : '#f59e0b',
                        }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 text-[11px] text-slate-400">
                      <span>
                        {isTesting
                          ? 'Running UDP DNS probe…'
                          : latest
                          ? reachable
                            ? `Available · ${latest.queryHost || benchmarkHost} (${latest.recordType || benchmarkRecordType})`
                            : latest.errorMessage || 'Resolver unreachable or timed out'
                          : 'Click Benchmark All or Test to measure real DNS RTT'}
                      </span>
                      <span className="font-mono tabular-nums shrink-0">
                        {stat
                          ? `${stat.successCount} ok / ${stat.failureCount} fail${latest?.testedAt ? ` · ${formatClockTime(latest.testedAt)}` : ''}`
                          : '0 runs'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 text-[11px] text-slate-400">
            Measures actual UDP DNS query round-trip time under identical host/type conditions. Latency varies with network routing, cache state, and server location.
          </div>
        </section>
      </div>

      {/* 6. Local DNS Activity History */}
      <section aria-label="DNS Activity History" className={`p-4 rounded-xl border ${cardSurface}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <h2 className="text-sm font-bold">DNS Activity History</h2>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Optional local-only log of diagnostic lookups run on this tab. Stored strictly on this device.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={retainHistory}
                onChange={e => handleToggleHistoryRetention(e.target.checked)}
                className="rounded border-slate-600 accent-sky-500 cursor-pointer"
              />
              <span className="text-xs text-slate-300">Log lookups locally</span>
            </label>

            {activityHistory.length > 0 && (
              <button
                type="button"
                onClick={handleClearActivityHistory}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
              >
                Clear Log
              </button>
            )}
          </div>
        </div>

        {!retainHistory ? (
          <div className={`p-3 rounded-lg border text-xs text-slate-400 ${subSurface}`}>
            Local lookup logging is disabled. Diagnostic queries are not recorded.
          </div>
        ) : activityHistory.length === 0 ? (
          <div className={`p-4 rounded-lg border border-dashed text-center text-xs text-slate-400 ${subSurface}`}>
            No DNS lookups recorded yet. Run a Hostname Query above to inspect timestamped resolution metrics.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] text-slate-400">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Hostname</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Resolver</th>
                  <th className="py-2 pr-3 font-medium text-right">Duration</th>
                  <th className="py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono tabular-nums">
                {activityHistory.slice(0, 10).map(item => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="py-2 pr-3 text-slate-400 whitespace-nowrap">
                      {formatClockTime(item.timestamp)}
                    </td>
                    <td className="py-2 pr-3 font-semibold max-w-[200px] truncate">{item.hostname}</td>
                    <td className="py-2 pr-3">{item.recordType}</td>
                    <td className="py-2 pr-3 text-slate-400 max-w-[140px] truncate">{item.resolver}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {item.responseTimeMs.toFixed(1)} ms
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <span
                        className={
                          item.status === 'success' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'
                        }
                      >
                        {item.status === 'success' ? `Resolved (${item.recordCount})` : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 7. Expandable Advanced Adapter & Resolver Details */}
      <section aria-label="Advanced DNS Details" className={`rounded-xl border overflow-hidden ${cardSurface}`}>
        <button
          type="button"
          onClick={() => setShowAdvancedDetails(prev => !prev)}
          aria-expanded={showAdvancedDetails}
          className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left text-xs font-semibold hover:bg-slate-800/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Advanced Adapter & Resolver Details</span>
          </span>
          {showAdvancedDetails ? (
            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          )}
        </button>

        {showAdvancedDetails && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className={`p-3 rounded-lg border ${subSurface}`}>
              <div className="text-[11px] text-slate-400">Adapter & Interface Index</div>
              <div className="font-mono font-semibold mt-1 truncate">
                {dnsConfig?.adapterAlias || selectedAlias} (ifIndex: {dnsConfig?.interfaceIndex ?? selectedAdapterObj?.id ?? '--'})
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {dnsConfig?.adapterDescription || selectedAdapterObj?.description || 'Description unavailable'}
              </div>
            </div>

            <div className={`p-3 rounded-lg border ${subSurface}`}>
              <div className="text-[11px] text-slate-400">IPv4 & IPv6 Assignment Modes</div>
              <div className="font-mono mt-1 space-y-0.5">
                <div>IPv4: {effectiveMode.ipv4Mode === 'manual' ? 'Static Manual' : 'DHCP Automatic'}</div>
                <div>IPv6: {effectiveMode.ipv6Mode === 'manual' ? 'Static Manual' : 'DHCP Automatic'}</div>
              </div>
            </div>

            <div className={`p-3 rounded-lg border ${subSurface}`}>
              <div className="text-[11px] text-slate-400">DNS Suffix & Verification Time</div>
              <div className="font-mono mt-1 truncate">
                Suffix: {dnsConfig?.dnsSuffix || 'None configured'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-1">
                Verified: {formatClockTime(configFetchedAt)}
              </div>
            </div>

            <div className={`p-3 rounded-lg border sm:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-2 ${subSurface}`}>
              <div className="text-[11px] text-slate-400">
                Per-family DHCP reset controls (target only selected adapter):
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRestoreDhcp('ipv4')}
                  disabled={isApplying || effectiveMode.ipv4Mode === 'dhcp'}
                  className={`px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer disabled:opacity-40 ${secondaryButton}`}
                >
                  Reset IPv4 to DHCP
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestoreDhcp('ipv6')}
                  disabled={isApplying || effectiveMode.ipv6Mode === 'dhcp'}
                  className={`px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer disabled:opacity-40 ${secondaryButton}`}
                >
                  Reset IPv6 to DHCP
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 8. Add / Edit / Custom DNS Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/65 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dns-profile-modal-title"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className={`w-full max-w-lg p-5 rounded-2xl border shadow-2xl max-h-[90vh] overflow-y-auto ${
                isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 id="dns-profile-modal-title" className="text-base font-bold">
                    {modalMode === 'custom_apply'
                      ? `Configure Custom DNS (${dnsConfig?.adapterAlias || selectedAlias})`
                      : editingProfile
                      ? 'Edit Custom DNS Profile'
                      : 'Add Custom DNS Profile'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure IPv4 and IPv6 DNS servers independently with address validation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={e => void handleModalSubmit(e, false)} className="space-y-3.5">
                {modalMode !== 'custom_apply' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs font-semibold text-slate-400 block mb-1" htmlFor="modal-profile-name">
                          Profile Name *
                        </label>
                        <input
                          id="modal-profile-name"
                          type="text"
                          required
                          value={profileName}
                          onChange={e => setProfileName(e.target.value)}
                          placeholder="e.g. Pi-hole, Office DNS"
                          className={`w-full h-9 text-xs px-3 rounded-lg border ${inputSurface}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 block mb-1" htmlFor="modal-provider">
                          Provider / Label
                        </label>
                        <input
                          id="modal-provider"
                          type="text"
                          value={providerName}
                          onChange={e => setProviderName(e.target.value)}
                          placeholder="e.g. NextDNS, Internal"
                          className={`w-full h-9 text-xs px-3 rounded-lg border ${inputSurface}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1" htmlFor="modal-desc">
                        Description (Optional)
                      </label>
                      <input
                        id="modal-desc"
                        type="text"
                        value={profileDescription}
                        onChange={e => setProfileDescription(e.target.value)}
                        placeholder="Short note describing filtering or routing purpose"
                        className={`w-full h-9 text-xs px-3 rounded-lg border ${inputSurface}`}
                      />
                    </div>
                  </>
                )}

                {/* Independent IPv4 Configuration Toggle & Inputs */}
                <div className={`p-3 rounded-lg border space-y-2.5 ${subSurface}`}>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configureIpv4}
                      onChange={e => setConfigureIpv4(e.target.checked)}
                      className="accent-sky-500 cursor-pointer"
                    />
                    <span>Configure IPv4 DNS Servers</span>
                  </label>

                  {configureIpv4 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1" htmlFor="modal-v4-1">
                          Primary IPv4 *
                        </label>
                        <input
                          id="modal-v4-1"
                          type="text"
                          value={ipv4Primary}
                          onChange={e => setIpv4Primary(e.target.value)}
                          placeholder="1.1.1.1"
                          className={`w-full h-9 text-xs px-3 rounded-lg border font-mono ${inputSurface}`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1" htmlFor="modal-v4-2">
                          Secondary IPv4
                        </label>
                        <input
                          id="modal-v4-2"
                          type="text"
                          value={ipv4Secondary}
                          onChange={e => setIpv4Secondary(e.target.value)}
                          placeholder="1.0.0.1"
                          className={`w-full h-9 text-xs px-3 rounded-lg border font-mono ${inputSurface}`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Independent IPv6 Configuration Toggle & Inputs */}
                <div className={`p-3 rounded-lg border space-y-2.5 ${subSurface}`}>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configureIpv6}
                      onChange={e => setConfigureIpv6(e.target.checked)}
                      className="accent-sky-500 cursor-pointer"
                    />
                    <span>Configure IPv6 DNS Servers</span>
                  </label>

                  {configureIpv6 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1" htmlFor="modal-v6-1">
                          Primary IPv6 *
                        </label>
                        <input
                          id="modal-v6-1"
                          type="text"
                          value={ipv6Primary}
                          onChange={e => setIpv6Primary(e.target.value)}
                          placeholder="2606:4700:4700::1111"
                          className={`w-full h-9 text-xs px-3 rounded-lg border font-mono ${inputSurface}`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1" htmlFor="modal-v6-2">
                          Secondary IPv6
                        </label>
                        <input
                          id="modal-v6-2"
                          type="text"
                          value={ipv6Secondary}
                          onChange={e => setIpv6Secondary(e.target.value)}
                          placeholder="2606:4700:4700::1001"
                          className={`w-full h-9 text-xs px-3 rounded-lg border font-mono ${inputSurface}`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {modalError && (
                  <div className="text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="h-9 px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  {modalMode === 'custom_apply' ? (
                    <>
                      <button
                        type="button"
                        onClick={e => void handleModalSubmit(e, true)}
                        disabled={isApplying}
                        className={`h-9 px-3.5 rounded-lg border text-xs font-semibold cursor-pointer ${secondaryButton}`}
                      >
                        Save Profile & Apply
                      </button>
                      <button
                        type="submit"
                        disabled={isApplying}
                        className="h-9 px-4 rounded-lg text-xs font-semibold text-white cursor-pointer"
                        style={{ backgroundColor: accentColor }}
                      >
                        {isApplying ? 'Applying…' : 'Apply & Verify'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="submit"
                      className="h-9 px-4 rounded-lg text-xs font-semibold text-white cursor-pointer"
                      style={{ backgroundColor: accentColor }}
                    >
                      Save Profile
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
