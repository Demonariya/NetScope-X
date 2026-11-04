import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gauge,
  Sliders,
  ArrowDown,
  ArrowUp,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  Save,
  Check,
  AlertTriangle,
  Info,
  Search,
  Wifi,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Gamepad2,
  Tv,
  Globe,
  Download,
  Briefcase,
  Layers,
  Pause,
  Play,
  X,
} from 'lucide-react';
import {
  BandwidthConfig,
  BandwidthLimitRule,
  BandwidthProfile,
  BandwidthUnit,
  ApplicationPriority,
} from '../../types/bandwidth';
import { NetworkAdapter, ProcessNetworkUsage, NetworkStats } from '../../types/network';
import {
  toBitsPerSecond,
  fromBitsPerSecond,
  formatBandwidthLimit,
  getPriorityQosMapping,
  detectPolicyConflicts,
} from '../../utils/bandwidth';
import { formatBytes, formatSpeed } from '../../utils/formatters';
import { ProcessIcon } from '../common/ProcessIcon';

interface BandwidthTabProps {
  bandwidthConfig: BandwidthConfig;
  onApplyGlobalLimit: (
    downloadLimitBps?: number,
    uploadLimitBps?: number,
    downloadEnabled?: boolean,
    uploadEnabled?: boolean,
    adapterAlias?: string
  ) => void;
  onApplyAppLimit: (rule: BandwidthLimitRule) => void;
  onRemoveLimit: (targetType: string, targetIdentifier: string) => void;
  onResetAllLimits: () => void;
  onSaveProfile: (name: string, description?: string) => void;
  onApplyProfile: (profileId: string) => void;
  onTogglePause?: () => void;
  adapters: NetworkAdapter[];
  processes: ProcessNetworkUsage[];
  liveStats: NetworkStats | null;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
}

export const BandwidthTab: React.FC<BandwidthTabProps> = ({
  bandwidthConfig,
  onApplyGlobalLimit,
  onApplyAppLimit,
  onRemoveLimit,
  onResetAllLimits,
  onSaveProfile,
  onApplyProfile,
  onTogglePause,
  adapters,
  processes,
  liveStats,
  onShowToast,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Global Limit Form State
  const [globalDownEnabled, setGlobalDownEnabled] = useState(
    bandwidthConfig.globalRule.downloadEnabled
  );
  const [globalUpEnabled, setGlobalUpEnabled] = useState(
    bandwidthConfig.globalRule.uploadEnabled
  );
  const [globalDownValue, setGlobalDownValue] = useState<string>(() => {
    const bps = bandwidthConfig.globalRule.downloadLimitBps;
    return bps ? String(fromBitsPerSecond(bps, 'MB/s')) : '';
  });
  const [globalDownUnit, setGlobalDownUnit] = useState<BandwidthUnit>('MB/s');

  const [globalUpValue, setGlobalUpValue] = useState<string>(() => {
    const bps = bandwidthConfig.globalRule.uploadLimitBps;
    return bps ? String(fromBitsPerSecond(bps, 'MB/s')) : '';
  });
  const [globalUpUnit, setGlobalUpUnit] = useState<BandwidthUnit>('MB/s');

  const [selectedAdapter, setSelectedAdapter] = useState<string>(
    bandwidthConfig.globalRule.adapterAlias || 'auto'
  );

  // Dialog & App Rule State
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSaveProfileModal, setShowSaveProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [selectedAppForEdit, setSelectedAppForEdit] = useState<ProcessNetworkUsage | null>(null);

  // Editing Rule modal state
  const [editAppDownLimit, setEditAppDownLimit] = useState('');
  const [editAppDownUnit, setEditAppDownUnit] = useState<BandwidthUnit>('MB/s');
  const [editAppDownEnabled, setEditAppDownEnabled] = useState(false);
  const [editAppUpLimit, setEditAppUpLimit] = useState('');
  const [editAppUpUnit, setEditAppUpUnit] = useState<BandwidthUnit>('KB/s');
  const [editAppUpEnabled, setEditAppUpEnabled] = useState(false);
  const [editAppPriority, setEditAppPriority] = useState<ApplicationPriority>('Normal');
  const [editIsGroup, setEditIsGroup] = useState(true);

  // Previous configuration backup for restore button
  const [previousConfigBackup, setPreviousConfigBackup] = useState<BandwidthConfig | null>(null);

  // Filter running processes by search
  const filteredProcesses = useMemo(() => {
    if (!appSearch.trim()) return processes;
    const q = appSearch.toLowerCase().trim();
    return processes.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.friendlyName.toLowerCase().includes(q) ||
        p.exeName.toLowerCase().includes(q) ||
        String(p.pid).includes(q)
    );
  }, [processes, appSearch]);

  const handleApplyGlobal = () => {
    // Save backup before applying
    setPreviousConfigBackup(bandwidthConfig);

    const downBits =
      globalDownEnabled && globalDownValue
        ? toBitsPerSecond(parseFloat(globalDownValue), globalDownUnit)
        : undefined;

    const upBits =
      globalUpEnabled && globalUpValue
        ? toBitsPerSecond(parseFloat(globalUpValue), globalUpUnit)
        : undefined;

    onApplyGlobalLimit(
      downBits,
      upBits,
      globalDownEnabled,
      globalUpEnabled,
      selectedAdapter
    );

    onShowToast(
      'Global Limits Applied',
      `Outbound QoS: ${globalUpEnabled && upBits ? formatBandwidthLimit(upBits) : 'Unlimited'} · Inbound Advisory: ${globalDownEnabled && downBits ? formatBandwidthLimit(downBits) : 'Unlimited'}`,
      'success'
    );
  };

  const handleSetGlobalUnlimited = () => {
    setGlobalDownEnabled(false);
    setGlobalUpEnabled(false);
    setGlobalDownValue('');
    setGlobalUpValue('');
    onApplyGlobalLimit(undefined, undefined, false, false, selectedAdapter);
    onShowToast('Global Unlimited Mode', 'Global upload and download caps removed.', 'info');
  };

  const handleRestorePrevious = () => {
    if (!previousConfigBackup) {
      onShowToast('No Previous Configuration', 'No prior session backup available to restore.', 'warning');
      return;
    }
    const b = previousConfigBackup.globalRule;
    setGlobalDownEnabled(b.downloadEnabled);
    setGlobalUpEnabled(b.uploadEnabled);
    if (b.downloadLimitBps) {
      setGlobalDownValue(String(fromBitsPerSecond(b.downloadLimitBps, globalDownUnit)));
    } else {
      setGlobalDownValue('');
    }
    if (b.uploadLimitBps) {
      setGlobalUpValue(String(fromBitsPerSecond(b.uploadLimitBps, globalUpUnit)));
    } else {
      setGlobalUpValue('');
    }
    setSelectedAdapter(b.adapterAlias || 'auto');
    onApplyGlobalLimit(
      b.downloadLimitBps,
      b.uploadLimitBps,
      b.downloadEnabled,
      b.uploadEnabled,
      b.adapterAlias
    );
    onShowToast('Configuration Restored', 'Restored previous bandwidth limits.', 'success');
  };

  const openAppLimitEditor = (proc: ProcessNetworkUsage) => {
    setSelectedAppForEdit(proc);
    const existingRule = bandwidthConfig.appRules.find(
      r =>
        (r.targetType === 'application' && r.targetIdentifier.toLowerCase() === proc.exeName.toLowerCase()) ||
        (r.targetType === 'process' && r.pid === proc.pid)
    );

    if (existingRule) {
      setEditAppDownEnabled(existingRule.downloadEnabled);
      setEditAppUpEnabled(existingRule.uploadEnabled);
      setEditAppDownValueFromBits(existingRule.downloadLimitBps);
      setEditAppUpValueFromBits(existingRule.uploadLimitBps);
      setEditAppPriority(existingRule.priority);
      setEditIsGroup(existingRule.targetType === 'application');
    } else {
      setEditAppDownEnabled(false);
      setEditAppUpEnabled(false);
      setEditAppDownLimit('');
      setEditAppUpLimit('');
      setEditAppPriority('Normal');
      setEditIsGroup(true);
    }
  };

  const setEditAppDownValueFromBits = (bits?: number) => {
    if (bits && bits > 0) {
      setEditAppDownLimit(String(fromBitsPerSecond(bits, editAppDownUnit)));
    } else {
      setEditAppDownLimit('');
    }
  };

  const setEditAppUpValueFromBits = (bits?: number) => {
    if (bits && bits > 0) {
      setEditAppUpLimit(String(fromBitsPerSecond(bits, editAppUpUnit)));
    } else {
      setEditAppUpLimit('');
    }
  };

  const handleSaveAppRule = () => {
    if (!selectedAppForEdit) return;

    const downBits =
      editAppDownEnabled && editAppDownLimit
        ? toBitsPerSecond(parseFloat(editAppDownLimit), editAppDownUnit)
        : undefined;

    const upBits =
      editAppUpEnabled && editAppUpLimit
        ? toBitsPerSecond(parseFloat(editAppUpLimit), editAppUpUnit)
        : undefined;

    const targetType = editIsGroup ? 'application' : 'process';
    const targetIdentifier = editIsGroup ? selectedAppForEdit.exeName : String(selectedAppForEdit.pid);

    const rule: BandwidthLimitRule = {
      id: `rule_${targetType}_${targetIdentifier}`,
      name: selectedAppForEdit.friendlyName || selectedAppForEdit.exeName,
      targetType,
      targetIdentifier,
      appPath: selectedAppForEdit.fullPath || selectedAppForEdit.exeName,
      pid: editIsGroup ? undefined : selectedAppForEdit.pid,
      downloadLimitBps: downBits,
      uploadLimitBps: upBits,
      downloadEnabled: editAppDownEnabled && Boolean(downBits),
      uploadEnabled: editAppUpEnabled && Boolean(upBits),
      priority: editAppPriority,
      uploadEnforcement: editAppUpEnabled && upBits ? 'enforced' : 'disabled',
      downloadEnforcement: editAppDownEnabled && downBits ? 'advisory' : 'disabled',
      isGroupRule: editIsGroup,
    };

    // Conflict check
    const conflict = detectPolicyConflicts(rule, bandwidthConfig.appRules);
    if (conflict) {
      onShowToast('Policy Conflict Detected', conflict, 'warning');
    }

    onApplyAppLimit(rule);
    onShowToast(
      'App Limit Saved',
      `${rule.name}: Upload ${editAppUpEnabled && upBits ? formatBandwidthLimit(upBits) : 'Unlimited'} (QoS Enforced) · Priority ${editAppPriority}`,
      'success'
    );
    setSelectedAppForEdit(null);
  };

  const handleRemoveAppRule = (targetType: string, targetIdentifier: string) => {
    onRemoveLimit(targetType, targetIdentifier);
    onShowToast('Rule Removed', `Removed bandwidth policy for ${targetIdentifier}.`, 'info');
    if (selectedAppForEdit) setSelectedAppForEdit(null);
  };

  const handleConfirmResetAll = () => {
    onResetAllLimits();
    setGlobalDownEnabled(false);
    setGlobalUpEnabled(false);
    setGlobalDownValue('');
    setGlobalUpValue('');
    setShowResetConfirm(false);
    onShowToast('Bandwidth Reset', 'All global and per-application network caps cleared to unlimited.', 'success');
  };

  const handleSaveProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    onSaveProfile(newProfileName.trim(), 'Custom user-saved bandwidth configuration profile.');
    setShowSaveProfileModal(false);
    setNewProfileName('');
    onShowToast('Profile Saved', `Saved configuration profile "${newProfileName.trim()}".`, 'success');
  };

  const getPresetIcon = (presetType?: string) => {
    switch (presetType) {
      case 'gaming':
        return <Gamepad2 className="w-3.5 h-3.5 text-rose-400" />;
      case 'streaming':
        return <Tv className="w-3.5 h-3.5 text-purple-400" />;
      case 'browsing':
        return <Globe className="w-3.5 h-3.5 text-sky-400" />;
      case 'download':
        return <Download className="w-3.5 h-3.5 text-emerald-400" />;
      case 'work':
        return <Briefcase className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Sliders className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* 1. Header with Active Profile & Quick Controls */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Gauge className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-100 truncate">
              Bandwidth Control
            </h2>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border shrink-0 ${
                !bandwidthConfig.isPaused
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  !bandwidthConfig.isPaused ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {!bandwidthConfig.isPaused ? 'Active' : 'Paused'}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onTogglePause && (
              <button
                onClick={onTogglePause}
                title={bandwidthConfig.isPaused ? 'Resume bandwidth management' : 'Pause bandwidth management'}
                className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {bandwidthConfig.isPaused ? (
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>
            )}
            <button
              onClick={() => setShowSaveProfileModal(true)}
              title="Save current limits as a profile"
              className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              title="Reset all limits to unlimited"
              className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Preset Profiles Carousel / Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
          {bandwidthConfig.profiles.map(profile => {
            const isActive = bandwidthConfig.activeProfileId === profile.id;
            return (
              <button
                key={profile.id}
                onClick={() => {
                  onApplyProfile(profile.id);
                  onShowToast(
                    'Profile Activated',
                    `Switched to ${profile.name}: ${profile.description}`,
                    'info'
                  );
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-semibold shadow-xs'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {getPresetIcon(profile.presetType)}
                <span>{profile.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Real Windows OS Capability & Enforcement Notice */}
      <div className="rounded-xl border border-sky-500/25 bg-sky-950/20 p-2.5 text-xs">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-slate-200 font-medium text-[11px] leading-tight">
              Windows Native QoS Architecture
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Outbound upload throttling and DSCP priorities are strictly enforced at the OS TCP/IP
              kernel level via Windows Policy-based QoS (<code className="font-mono text-sky-300">pacer.sys</code>).
              Inbound download rates are governed by receiver window buffer management (OS Advisory tracking).
            </p>
          </div>
        </div>
      </div>

      {/* 2. Global Bandwidth Limiting Card */}
      <div
        className={`rounded-xl border p-3 shadow-sm transition-all duration-200 ${
          isLight
            ? 'bg-white/90 border-slate-200 hover:border-slate-300'
            : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700/80'
        }`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 mb-2.5">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-100">Global Bandwidth Caps</h3>
          </div>
          <button
            onClick={handleSetGlobalUnlimited}
            className="text-[10px] font-medium text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
          >
            Clear to Unlimited
          </button>
        </div>

        {/* Adapter Selection */}
        <div className="mb-3">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1 font-sans">
            Target Network Adapter
          </label>
          <select
            value={selectedAdapter}
            onChange={e => setSelectedAdapter(e.target.value)}
            className="w-full text-xs bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-sky-500"
          >
            <option value="auto">All Supported Adapters (Default Gateway)</option>
            {adapters.map(a => (
              <option key={a.id} value={a.name}>
                {a.name} ({a.type.toUpperCase()}) {a.status === 'connected' ? '· Connected' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Global Download and Upload Controls in Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
          {/* Global Download Control */}
          <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-sky-400 font-medium">
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Download Speed Cap</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={globalDownEnabled}
                  onChange={e => setGlobalDownEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500" />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                disabled={!globalDownEnabled}
                placeholder="e.g. 5"
                value={globalDownValue}
                onChange={e => setGlobalDownValue(e.target.value)}
                className="flex-1 min-w-0 text-xs bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 disabled:opacity-40 font-mono"
              />
              <select
                disabled={!globalDownEnabled}
                value={globalDownUnit}
                onChange={e => setGlobalDownUnit(e.target.value as BandwidthUnit)}
                className="text-xs bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-300 disabled:opacity-40 shrink-0 cursor-pointer"
              >
                <option value="KB/s">KB/s</option>
                <option value="MB/s">MB/s</option>
                <option value="Mbps">Mbps</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
              <span>Current: {formatSpeed(liveStats?.downloadBps || 0).full}</span>
              <span className="text-slate-500">
                {globalDownEnabled && globalDownValue ? 'Advisory Tracking' : 'No Limit'}
              </span>
            </div>
          </div>

          {/* Global Upload Control */}
          <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-teal-400 font-medium">
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Upload Speed Cap (Windows QoS)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={globalUpEnabled}
                  onChange={e => setGlobalUpEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-500" />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                disabled={!globalUpEnabled}
                placeholder="e.g. 1"
                value={globalUpValue}
                onChange={e => setGlobalUpValue(e.target.value)}
                className="flex-1 min-w-0 text-xs bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 disabled:opacity-40 font-mono"
              />
              <select
                disabled={!globalUpEnabled}
                value={globalUpUnit}
                onChange={e => setGlobalUpUnit(e.target.value as BandwidthUnit)}
                className="text-xs bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-300 disabled:opacity-40 shrink-0 cursor-pointer"
              >
                <option value="KB/s">KB/s</option>
                <option value="MB/s">MB/s</option>
                <option value="Mbps">Mbps</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
              <span>Current: {formatSpeed(liveStats?.uploadBps || 0).full}</span>
              <span className="text-emerald-400 font-semibold">
                {globalUpEnabled && globalUpValue ? 'OS Hardware Enforced' : 'No Limit'}
              </span>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleApplyGlobal}
            className="flex-1 py-1.5 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Global Limits</span>
          </button>
          {previousConfigBackup && (
            <button
              onClick={handleRestorePrevious}
              title="Restore previous configuration"
              className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Restore
            </button>
          )}
        </div>
      </div>

      {/* 3. Per-Application Network Bandwidth & QoS Priority */}
      <div
        className={`rounded-xl border p-3 shadow-sm transition-all duration-200 ${
          isLight
            ? 'bg-white/90 border-slate-200 hover:border-slate-300'
            : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700/80'
        }`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 mb-2.5">
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-400 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-100">
              Per-Application Limits & Priority
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {bandwidthConfig.appRules.length} rules active
          </span>
        </div>

        {/* App Search Bar */}
        <div className="relative mb-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search application to configure speed caps & priority..."
            value={appSearch}
            onChange={e => setAppSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Process List with active bandwidth limit indicators */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {filteredProcesses.map(proc => {
            const rule = bandwidthConfig.appRules.find(
              r =>
                (r.targetType === 'application' && r.targetIdentifier.toLowerCase() === proc.exeName.toLowerCase()) ||
                (r.targetType === 'process' && r.pid === proc.pid)
            );

            const hasActiveLimit = Boolean(
              rule && (rule.downloadEnabled || rule.uploadEnabled || rule.priority !== 'Normal')
            );

            return (
              <div
                key={`proc_${proc.pid}`}
                className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                  hasActiveLimit
                    ? 'bg-slate-950 border-sky-500/40'
                    : 'bg-slate-950/60 border-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ProcessIcon
                    exeName={proc.exeName}
                    icon={proc.icon}
                    containerClassName="w-7 h-7 rounded-lg bg-slate-900 p-1 border border-slate-800 shrink-0 flex items-center justify-center overflow-hidden"
                    className="w-4 h-4"
                    size={16}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-100 truncate">
                        {proc.friendlyName || proc.exeName}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 shrink-0">
                        PID {proc.pid}
                      </span>
                    {rule && rule.priority !== 'Normal' && (
                      <span className="text-[9px] px-1 py-0.2 rounded font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                        {rule.priority}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                    <span className="text-sky-400">↓ {formatSpeed(proc.downloadBps).full}</span>
                    <span className="text-teal-400">↑ {formatSpeed(proc.uploadBps).full}</span>
                    {rule?.uploadLimitBps && rule.uploadEnabled ? (
                      <span className="text-amber-300">
                        Cap: {formatBandwidthLimit(rule.uploadLimitBps)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openAppLimitEditor(proc)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                  >
                    {hasActiveLimit ? 'Edit Limit' : 'Set Limit'}
                  </button>
                  {hasActiveLimit && (
                    <button
                      onClick={() => handleRemoveAppRule(rule!.targetType, rule!.targetIdentifier)}
                      title="Clear limit for this application"
                      className="p-1 rounded bg-slate-900 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Edit Application Speed Limit & Priority */}
      <AnimatePresence>
        {selectedAppForEdit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700 p-3.5 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-xs text-slate-100 truncate">
                    Configure Limits & Priority
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    {selectedAppForEdit.friendlyName || selectedAppForEdit.exeName} (PID {selectedAppForEdit.pid})
                  </p>
                </div>
                <button
                  onClick={() => setSelectedAppForEdit(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Group vs Instance Scope Toggle */}
              <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 text-xs">
                <div className="min-w-0 pr-2">
                  <span className="font-medium text-slate-200 block text-[11px]">Apply to All Instances</span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {editIsGroup ? `Applies to all ${selectedAppForEdit.exeName} processes` : `Applies exclusively to PID ${selectedAppForEdit.pid}`}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editIsGroup}
                  onChange={e => setEditIsGroup(e.target.checked)}
                  className="rounded text-sky-500 focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Download Cap */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Download Cap</span>
                  <label className="text-[10px] flex items-center gap-1 text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAppDownEnabled}
                      onChange={e => setEditAppDownEnabled(e.target.checked)}
                      className="rounded"
                    />
                    Enable
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    disabled={!editAppDownEnabled}
                    placeholder="Unlimited"
                    value={editAppDownLimit}
                    onChange={e => setEditAppDownLimit(e.target.value)}
                    className="flex-1 text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 disabled:opacity-40 font-mono"
                  />
                  <select
                    disabled={!editAppDownEnabled}
                    value={editAppDownUnit}
                    onChange={e => setEditAppDownUnit(e.target.value as BandwidthUnit)}
                    className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-300 disabled:opacity-40"
                  >
                    <option value="KB/s">KB/s</option>
                    <option value="MB/s">MB/s</option>
                    <option value="Mbps">Mbps</option>
                  </select>
                </div>
              </div>

              {/* Upload Cap (Windows QoS) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Upload Cap (Windows QoS)</span>
                  <label className="text-[10px] flex items-center gap-1 text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAppUpEnabled}
                      onChange={e => setEditAppUpEnabled(e.target.checked)}
                      className="rounded"
                    />
                    Enable
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    disabled={!editAppUpEnabled}
                    placeholder="Unlimited"
                    value={editAppUpLimit}
                    onChange={e => setEditAppUpLimit(e.target.value)}
                    className="flex-1 text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 disabled:opacity-40 font-mono"
                  />
                  <select
                    disabled={!editAppUpEnabled}
                    value={editAppUpUnit}
                    onChange={e => setEditAppUpUnit(e.target.value as BandwidthUnit)}
                    className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-300 disabled:opacity-40"
                  >
                    <option value="KB/s">KB/s</option>
                    <option value="MB/s">MB/s</option>
                    <option value="Mbps">Mbps</option>
                  </select>
                </div>
              </div>

              {/* Priority Scheduling Selector */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-slate-400 font-sans block">
                  Traffic Scheduling Priority (DSCP & 802.1p)
                </label>
                <select
                  value={editAppPriority}
                  onChange={e => setEditAppPriority(e.target.value as ApplicationPriority)}
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="Critical">Critical (DSCP 46 · Voice/Gaming Priority)</option>
                  <option value="High">High (DSCP 34 · Video/Interactive Streaming)</option>
                  <option value="Normal">Normal (Standard Best Effort)</option>
                  <option value="Low">Low (DSCP 10 · Background Assurance)</option>
                  <option value="Background">Background (DSCP 8 · Scavenger Priority)</option>
                </select>
                <p className="text-[10px] text-slate-500">
                  {getPriorityQosMapping(editAppPriority).description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedAppForEdit(null)}
                  className="flex-1 py-1.5 rounded bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAppRule}
                  className="flex-1 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
                >
                  Save Policy
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Save Custom Profile */}
      <AnimatePresence>
        {showSaveProfileModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          >
            <form
              onSubmit={handleSaveProfileSubmit}
              className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700 p-3.5 shadow-2xl space-y-3"
            >
              <h3 className="font-semibold text-xs text-slate-100">
                Save Bandwidth Configuration Profile
              </h3>
              <p className="text-[11px] text-slate-400">
                Store the active global caps and per-application limits as a named profile for quick restoration.
              </p>
              <input
                type="text"
                required
                placeholder="Profile Name (e.g. Work-From-Home)"
                value={newProfileName}
                onChange={e => setNewProfileName(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
              <div className="flex items-center gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowSaveProfileModal(false)}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog: Reset All Limits to Unlimited */}
      {showResetConfirm && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-rose-300 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Reset all bandwidth limits to Unlimited?</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            This removes all global speed caps, per-application throttles, and NetScope-configured
            Windows Policy-based QoS rules.
          </p>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmResetAll}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
            >
              Confirm Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
