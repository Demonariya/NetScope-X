import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Layers,
  WifiOff,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Shield,
  Boxes,
  Cpu,
  Gauge,
  Sliders,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  X,
  Check,
  Zap,
  Sparkles,
  Activity,
} from 'lucide-react';
import { ProcessNetworkUsage, SocketConnection } from '../../types/network';
import {
  BandwidthConfig,
  BandwidthLimitRule,
  BandwidthUnit,
  ApplicationPriority,
} from '../../types/bandwidth';
import {
  toBitsPerSecond,
  fromBitsPerSecond,
  formatBandwidthLimit,
  getPriorityQosMapping,
  detectPolicyConflicts,
} from '../../utils/bandwidth';
import { formatBytes, formatSpeed } from '../../utils/formatters';
import { ProcessIcon } from '../common/ProcessIcon';

interface ApplicationsTabProps {
  processes: ProcessNetworkUsage[];
  onResetStats: (pid?: number) => void;
  onToggleBlock: (exeName: string, block: boolean, pid?: number) => void;
  isMonitoring: boolean;
  bandwidthConfig?: BandwidthConfig;
  onApplyAppLimit?: (rule: BandwidthLimitRule) => void;
  onRemoveAppLimit?: (targetType: string, targetIdentifier: string) => void;
  onShowToast?: (title: string, message?: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
}

type SortField = 'download' | 'upload' | 'total' | 'name' | 'pid';
type SortOrder = 'asc' | 'desc';
type FilterMode = 'all' | 'active' | 'blocked' | 'throttled';

export interface GroupedApplication {
  id: string;
  exeName: string;
  friendlyName: string;
  fullPath: string;
  icon?: string;
  instanceCount: number;
  instances: ProcessNetworkUsage[];
  downloadBps: number;
  uploadBps: number;
  totalBytes: number;
  sessionDownloadBytes: number;
  sessionUploadBytes: number;
  connectionCount: number;
  isBlocked: boolean;
  trafficAvailable: boolean;
  primaryPid: number;
  connections: (SocketConnection & { processId?: number })[];
}

interface EditTargetModal {
  targetType: 'application' | 'process';
  targetIdentifier: string;
  friendlyName: string;
  exeName: string;
  pid?: number;
  appPath?: string;
  isGroupRule?: boolean;
}

export const ApplicationsTab: React.FC<ApplicationsTabProps> = ({
  processes,
  onResetStats,
  onToggleBlock,
  bandwidthConfig,
  onApplyAppLimit,
  onRemoveAppLimit,
  onShowToast,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('download');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isGrouped, setIsGrouped] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Edit Modal State
  const [editingTarget, setEditingTarget] = useState<EditTargetModal | null>(null);
  const [modalDownEnabled, setModalDownEnabled] = useState(false);
  const [modalUpEnabled, setModalUpEnabled] = useState(false);
  const [modalDownValue, setModalDownValue] = useState<string>('2');
  const [modalUpValue, setModalUpValue] = useState<string>('512');
  const [modalDownUnit, setModalDownUnit] = useState<BandwidthUnit>('MB/s');
  const [modalUpUnit, setModalUpUnit] = useState<BandwidthUnit>('KB/s');
  const [modalPriority, setModalPriority] = useState<ApplicationPriority>('Normal');

  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleExpand = (key: string) => {
    const next = new Set(expandedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedKeys(next);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Group multiple instances of the same executable into a unified application entry
  const groupedApplications = useMemo<GroupedApplication[]>(() => {
    if (!isGrouped) {
      // Return individual processes wrapped as 1-instance groups
      return processes.map(proc => ({
        id: `proc_${proc.pid}`,
        exeName: proc.exeName || proc.name,
        friendlyName: proc.friendlyName || proc.exeName || proc.name,
        fullPath: proc.fullPath || '',
        icon: proc.icon,
        instanceCount: 1,
        instances: [proc],
        downloadBps: proc.downloadBps,
        uploadBps: proc.uploadBps,
        totalBytes: proc.totalBytes,
        sessionDownloadBytes: proc.sessionDownloadBytes,
        sessionUploadBytes: proc.sessionUploadBytes,
        connectionCount: proc.connectionCount,
        isBlocked: !!proc.isBlocked,
        trafficAvailable: proc.trafficAvailable ?? false,
        primaryPid: proc.pid,
        connections: (proc.connections || []).map(conn => ({ ...conn, processId: proc.pid })),
      }));
    }

    const map = new Map<string, GroupedApplication>();

    for (const proc of processes) {
      const rawExe = (proc.exeName || proc.name || 'unknown').trim();
      const baseName = rawExe.split(/[/\\]/).pop() || rawExe;
      const key = baseName.toLowerCase().trim();
      const existing = map.get(key);

      const procConns = (proc.connections || []).map(conn => ({
        ...conn,
        processId: proc.pid,
      }));

      if (!existing) {
        map.set(key, {
          id: key,
          exeName: proc.exeName || proc.name,
          friendlyName: proc.friendlyName || proc.exeName || proc.name,
          fullPath: proc.fullPath || '',
          icon: proc.icon,
          instanceCount: 1,
          instances: [proc],
          downloadBps: proc.downloadBps,
          uploadBps: proc.uploadBps,
          totalBytes: proc.totalBytes,
          sessionDownloadBytes: proc.sessionDownloadBytes,
          sessionUploadBytes: proc.sessionUploadBytes,
          connectionCount: proc.connectionCount,
          isBlocked: !!proc.isBlocked,
          trafficAvailable: proc.trafficAvailable ?? false,
          primaryPid: proc.pid,
          connections: procConns,
        });
      } else {
        existing.instanceCount += 1;
        existing.instances.push(proc);
        existing.downloadBps += proc.downloadBps;
        existing.uploadBps += proc.uploadBps;
        existing.totalBytes += proc.totalBytes;
        existing.sessionDownloadBytes += proc.sessionDownloadBytes;
        existing.sessionUploadBytes += proc.sessionUploadBytes;
        existing.connectionCount += proc.connectionCount;
        if (proc.isBlocked) existing.isBlocked = true;
        if (proc.trafficAvailable) existing.trafficAvailable = true;
        if (!existing.icon && proc.icon) existing.icon = proc.icon;
        if (!existing.fullPath && proc.fullPath) existing.fullPath = proc.fullPath;
        if (existing.friendlyName.endsWith('.exe') && proc.friendlyName && !proc.friendlyName.endsWith('.exe')) {
          existing.friendlyName = proc.friendlyName;
        }
        if (procConns.length > 0) {
          existing.connections.push(...procConns);
        }
        // Promote primary PID if higher active traffic
        const currentPrimaryTraffic =
          existing.instances.find(i => i.pid === existing.primaryPid)?.downloadBps || 0;
        if (proc.downloadBps + proc.uploadBps > currentPrimaryTraffic) {
          existing.primaryPid = proc.pid;
        }
      }
    }

    // Propagate group icon to child instances if missing, and sort
    for (const group of map.values()) {
      if (group.icon) {
        for (const inst of group.instances) {
          if (!inst.icon) inst.icon = group.icon;
        }
      }
      group.instances.sort(
        (a, b) => b.downloadBps + b.uploadBps - (a.downloadBps + a.uploadBps) || a.pid - b.pid
      );
    }

    return Array.from(map.values());
  }, [processes, isGrouped]);

  const blockedCount = useMemo(() => {
    return groupedApplications.filter(g => g.isBlocked).length;
  }, [groupedApplications]);

  // Lookup helper for bandwidth rules
  const getAppRule = (exeName: string, pid?: number): BandwidthLimitRule | undefined => {
    if (!bandwidthConfig) return undefined;
    if (pid !== undefined) {
      const pidRule = bandwidthConfig.appRules.find(
        r => r.targetType === 'process' && r.pid === pid
      );
      if (pidRule) return pidRule;
    }
    return bandwidthConfig.appRules.find(
      r =>
        r.targetType === 'application' &&
        r.targetIdentifier.toLowerCase() === exeName.toLowerCase()
    );
  };

  // Open Edit Modal for an application or specific PID
  const openEditModal = (target: EditTargetModal) => {
    const existingRule = getAppRule(target.exeName, target.pid);
    if (existingRule) {
      setModalDownEnabled(existingRule.downloadEnabled);
      setModalUpEnabled(existingRule.uploadEnabled);
      setModalPriority(existingRule.priority);

      if (existingRule.downloadLimitBps && existingRule.downloadLimitBps > 0) {
        if (existingRule.downloadLimitBps >= 8_000_000) {
          setModalDownValue(String(fromBitsPerSecond(existingRule.downloadLimitBps, 'MB/s')));
          setModalDownUnit('MB/s');
        } else {
          setModalDownValue(String(fromBitsPerSecond(existingRule.downloadLimitBps, 'KB/s')));
          setModalDownUnit('KB/s');
        }
      } else {
        setModalDownValue('2');
        setModalDownUnit('MB/s');
      }

      if (existingRule.uploadLimitBps && existingRule.uploadLimitBps > 0) {
        if (existingRule.uploadLimitBps >= 8_000_000) {
          setModalUpValue(String(fromBitsPerSecond(existingRule.uploadLimitBps, 'MB/s')));
          setModalUpUnit('MB/s');
        } else {
          setModalUpValue(String(fromBitsPerSecond(existingRule.uploadLimitBps, 'KB/s')));
          setModalUpUnit('KB/s');
        }
      } else {
        setModalUpValue('512');
        setModalUpUnit('KB/s');
      }
    } else {
      setModalDownEnabled(false);
      setModalUpEnabled(false);
      setModalDownValue('2');
      setModalDownUnit('MB/s');
      setModalUpValue('512');
      setModalUpUnit('KB/s');
      setModalPriority('Normal');
    }
    setEditingTarget(target);
  };

  const handleSaveModalRule = () => {
    if (!editingTarget || !onApplyAppLimit) return;
    const downNum = parseFloat(modalDownValue);
    const upNum = parseFloat(modalUpValue);

    const downBps =
      modalDownEnabled && Number.isFinite(downNum) && downNum > 0
        ? toBitsPerSecond(downNum, modalDownUnit)
        : undefined;

    const upBps =
      modalUpEnabled && Number.isFinite(upNum) && upNum > 0
        ? toBitsPerSecond(upNum, modalUpUnit)
        : undefined;

    const newRule: BandwidthLimitRule = {
      id: `rule_${editingTarget.targetType}_${editingTarget.targetIdentifier}`,
      name: editingTarget.friendlyName,
      targetType: editingTarget.targetType,
      targetIdentifier: editingTarget.targetIdentifier,
      appPath: editingTarget.appPath,
      pid: editingTarget.pid,
      downloadLimitBps: downBps,
      uploadLimitBps: upBps,
      downloadEnabled: modalDownEnabled && downBps !== undefined,
      uploadEnabled: modalUpEnabled && upBps !== undefined,
      priority: modalPriority,
      uploadEnforcement: modalUpEnabled && upBps ? 'enforced' : 'disabled',
      downloadEnforcement: modalDownEnabled && downBps ? 'advisory' : 'disabled',
      isGroupRule: editingTarget.isGroupRule ?? editingTarget.targetType === 'application',
    };

    onApplyAppLimit(newRule);
    setEditingTarget(null);
  };

  const handleResetModalToUnlimited = () => {
    if (!editingTarget) return;
    if (onRemoveAppLimit) {
      onRemoveAppLimit(editingTarget.targetType, editingTarget.targetIdentifier);
    }
    setEditingTarget(null);
  };

  // Filter and sort applications
  const filteredAndSorted = useMemo(() => {
    return groupedApplications
      .filter(app => {
        if (
          filterMode === 'active' &&
          app.connectionCount === 0 &&
          app.downloadBps === 0 &&
          app.uploadBps === 0
        ) {
          return false;
        }
        if (filterMode === 'blocked' && !app.isBlocked) {
          return false;
        }
        if (filterMode === 'throttled') {
          const rule = getAppRule(app.exeName);
          if (!rule || (!rule.downloadEnabled && !rule.uploadEnabled && rule.priority === 'Normal')) {
            return false;
          }
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          app.friendlyName.toLowerCase().includes(q) ||
          app.exeName.toLowerCase().includes(q) ||
          app.instances.some(inst => inst.pid.toString().includes(q))
        );
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'download') diff = a.downloadBps - b.downloadBps;
        else if (sortField === 'upload') diff = a.uploadBps - b.uploadBps;
        else if (sortField === 'total') diff = a.totalBytes - b.totalBytes;
        else if (sortField === 'name') diff = a.friendlyName.localeCompare(b.friendlyName);
        else if (sortField === 'pid') diff = a.primaryPid - b.primaryPid;

        return sortOrder === 'desc' ? -diff : diff;
      });
  }, [groupedApplications, searchQuery, sortField, sortOrder, filterMode, bandwidthConfig]);

  // Priority color styling helper
  const getPriorityBadgeClass = (priority: ApplicationPriority) => {
    switch (priority) {
      case 'Critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/35';
      case 'High':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/35';
      case 'Normal':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/25';
      case 'Low':
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
      case 'Background':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className="space-y-3 p-3 max-w-full pb-16 w-full">
      {/* Header & Controls Strip */}
      <div
        className={`rounded-xl border p-3 shadow-sm space-y-2.5 transition-colors ${
          isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-900/80 border-slate-800/80'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-semibold truncate">Application Control</h2>
            <span className="text-[11px] text-slate-400 font-mono shrink-0">
              ({filteredAndSorted.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {blockedCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-[10px] text-rose-400 font-semibold">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                <span>{blockedCount} Blocked</span>
              </span>
            )}
            <button
              onClick={() => onResetStats()}
              title="Reset session counters for all monitored programs"
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Search Bar with Embedded Clear Button */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search application, executable or PID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 border rounded-md text-xs placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}
          />
        </div>

        {/* Filter Tabs, View Grouping Toggle & Quick Sort Strip */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5 text-xs flex-wrap">
          {/* Filter Pills */}
          <div
            className={`flex items-center gap-1 p-0.5 rounded border text-[11px] relative ${
              isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setFilterMode('all')}
              className={`relative px-2 py-0.5 rounded transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {filterMode === 'all' && (
                <motion.div
                  layoutId="appFilterPill"
                  className="absolute inset-0 bg-slate-800 rounded -z-10"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              All
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setFilterMode('active')}
              className={`relative px-2 py-0.5 rounded transition-colors cursor-pointer ${
                filterMode === 'active'
                  ? 'text-sky-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {filterMode === 'active' && (
                <motion.div
                  layoutId="appFilterPill"
                  className="absolute inset-0 bg-sky-500/20 rounded -z-10"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              Active
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setFilterMode('throttled')}
              className={`relative px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                filterMode === 'throttled'
                  ? 'text-amber-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {filterMode === 'throttled' && (
                <motion.div
                  layoutId="appFilterPill"
                  className="absolute inset-0 bg-amber-500/20 rounded -z-10"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Gauge className="w-3 h-3" />
              <span>Capped</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setFilterMode('blocked')}
              className={`relative px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                filterMode === 'blocked'
                  ? 'text-rose-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {filterMode === 'blocked' && (
                <motion.div
                  layoutId="appFilterPill"
                  className="absolute inset-0 bg-rose-500/20 rounded -z-10"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Shield className="w-3 h-3" />
              <span>Blocked ({blockedCount})</span>
            </motion.button>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            {/* View Mode: Grouped by Application vs Separate PIDs */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setIsGrouped(!isGrouped)}
              title={isGrouped ? 'Switch to separate PIDs' : 'Group duplicate processes by application'}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                isGrouped
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {isGrouped ? <Boxes className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
              <span>{isGrouped ? 'Grouped' : 'PIDs'}</span>
            </motion.button>

            {/* Quick Sort Dropdown */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider shrink-0">
                Sort:
              </span>
              <select
                value={sortField}
                onChange={e => handleSort(e.target.value as SortField)}
                className="text-xs bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-slate-200 focus:outline-none focus:border-sky-500 max-w-[85px] truncate"
              >
                <option value="download">Down</option>
                <option value="upload">Up</option>
                <option value="total">Total</option>
                <option value="name">Name</option>
                <option value="pid">PID</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Portrait Process List Cards */}
      <div className="space-y-2">
        {filteredAndSorted.length === 0 ? (
          <div className="rounded-xl bg-slate-900/40 border border-slate-800/80 p-8 text-center text-slate-400">
            <WifiOff className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-300">
              No applications match your filter.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Try clearing your search query or selecting a different filter.
            </p>
          </div>
        ) : (
          filteredAndSorted.map(app => {
            const isExpanded = expandedKeys.has(app.id);
            const isBlocked = !!app.isBlocked;
            const hasPerAppTraffic = app.trafficAvailable === true;
            const down = formatSpeed(app.downloadBps);
            const up = formatSpeed(app.uploadBps);
            const hasActiveTraffic = !isBlocked && (app.downloadBps > 0 || app.uploadBps > 0);

            // Bandwidth Rule Check
            const appRule = getAppRule(app.exeName);
            const hasRule = !!appRule && (appRule.downloadEnabled || appRule.uploadEnabled || appRule.priority !== 'Normal');
            const conflictMessage = appRule && bandwidthConfig ? detectPolicyConflicts(appRule, bandwidthConfig.appRules) : null;

            return (
              <div
                key={app.id}
                className={`rounded-xl border transition-all ${
                  isBlocked
                    ? 'bg-rose-950/20 border-rose-500/30'
                    : isExpanded
                    ? 'bg-slate-900 border-sky-500/40 shadow-md shadow-black/20'
                    : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-900/90 hover:border-slate-700/80'
                }`}
              >
                {/* Main Portrait Card Header */}
                <div
                  onClick={() => toggleExpand(app.id)}
                  className="p-3 cursor-pointer flex flex-col gap-2.5"
                >
                  {/* Top Bar: Icon, Friendly Name, Badges & Actions */}
                  <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button className="text-slate-500 hover:text-slate-300 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-sky-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      <ProcessIcon
                        exeName={app.exeName}
                        icon={app.icon}
                        containerClassName="w-8 h-8 rounded-lg bg-slate-950 p-1 border border-slate-800 shrink-0 flex items-center justify-center overflow-hidden"
                        className="w-5 h-5"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-semibold text-xs truncate ${
                              isBlocked
                                ? 'text-rose-200 line-through decoration-rose-500/60'
                                : 'text-slate-100'
                            }`}
                          >
                            {app.friendlyName}
                          </span>
                          {hasActiveTraffic && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          )}
                          {isGrouped && app.instanceCount > 1 && (
                            <span className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 text-[10px] font-mono font-medium shrink-0">
                              {app.instanceCount} instances
                            </span>
                          )}
                          {isBlocked && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-bold uppercase tracking-wider shrink-0">
                              Blocked
                            </span>
                          )}

                          {/* Bandwidth Priority & Cap Badges */}
                          {appRule && appRule.priority !== 'Normal' && (
                            <span
                              className={`px-1.5 py-0.2 rounded border text-[9px] font-semibold flex items-center gap-0.5 shrink-0 ${getPriorityBadgeClass(
                                appRule.priority
                              )}`}
                            >
                              <Zap className="w-2.5 h-2.5" />
                              <span>{appRule.priority}</span>
                            </span>
                          )}

                          {appRule?.uploadEnabled && appRule.uploadLimitBps && (
                            <span
                              title="Outbound QoS Throttle Rate Cap (pacer.sys)"
                              className="px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-300 border border-teal-500/25 text-[9px] font-mono font-medium shrink-0"
                            >
                              ↑ {formatBandwidthLimit(appRule.uploadLimitBps)}
                            </span>
                          )}

                          {appRule?.downloadEnabled && appRule.downloadLimitBps && (
                            <span
                              title="Inbound Advisory Download Cap"
                              className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 text-[9px] font-mono font-medium shrink-0"
                            >
                              ↓ {formatBandwidthLimit(appRule.downloadLimitBps)}
                            </span>
                          )}

                          {conflictMessage && (
                            <span
                              title={conflictMessage}
                              className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35 text-[9px] font-semibold flex items-center gap-0.5 shrink-0"
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>Conflict</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono truncate">
                          <span>{app.exeName}</span>
                          <span>·</span>
                          <span>
                            {isGrouped && app.instanceCount > 1
                              ? `${app.instanceCount} processes`
                              : `PID ${app.primaryPid}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Strip: Bandwidth Limit Config & Firewall Block */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          openEditModal({
                            targetType: 'application',
                            targetIdentifier: app.exeName,
                            friendlyName: app.friendlyName,
                            exeName: app.exeName,
                            appPath: app.fullPath,
                            isGroupRule: true,
                          });
                        }}
                        title={`Configure Bandwidth Limits & QoS for ${app.friendlyName}`}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition-all cursor-pointer ${
                          hasRule
                            ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40 shadow-xs'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">QoS</span>
                      </button>

                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onToggleBlock(app.exeName, !isBlocked, app.primaryPid);
                        }}
                        title={
                          isBlocked
                            ? `Unblock ${app.friendlyName}`
                            : `Block network access for ${app.friendlyName}`
                        }
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-all shrink-0 cursor-pointer ${
                          isBlocked
                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40 shadow-xs'
                            : 'bg-slate-800 hover:bg-rose-950/70 text-slate-300 hover:text-rose-300 border-slate-700 hover:border-rose-700/60'
                        }`}
                      >
                        {isBlocked ? (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Unblock</span>
                          </>
                        ) : (
                          <>
                            <ShieldOff className="w-3.5 h-3.5 text-slate-400" />
                            <span>Block</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* High-Density 2x2 Metric Tiles with Measured vs Configured Rate */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-xs font-mono">
                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-sans">
                        <span>Down</span>
                        {appRule?.downloadEnabled && appRule.downloadLimitBps ? (
                          <span className="text-[9px] text-sky-400 lowercase font-mono">
                            cap {formatBandwidthLimit(appRule.downloadLimitBps)}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`font-semibold tabular-nums text-sm mt-0.5 ${
                          isBlocked
                            ? 'text-rose-400/70'
                            : app.downloadBps > 0
                            ? 'text-sky-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isBlocked ? 'Blocked' : hasPerAppTraffic ? down.full : 'Unavailable'}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-sans">
                        <span>Up</span>
                        {appRule?.uploadEnabled && appRule.uploadLimitBps ? (
                          <span className="text-[9px] text-teal-400 lowercase font-mono">
                            cap {formatBandwidthLimit(appRule.uploadLimitBps)}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`font-semibold tabular-nums text-sm mt-0.5 ${
                          isBlocked
                            ? 'text-rose-400/70'
                            : app.uploadBps > 0
                            ? 'text-teal-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isBlocked ? 'Blocked' : hasPerAppTraffic ? up.full : 'Unavailable'}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">Session</span>
                      <span className="text-slate-300 tabular-nums">
                        {hasPerAppTraffic ? formatBytes(app.totalBytes) : '--'}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">Sockets</span>
                      <span
                        className={`font-medium ${
                          isBlocked ? 'text-rose-400/80' : 'text-slate-300'
                        }`}
                      >
                        {isBlocked ? 'Restricted' : app.connectionCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Deep Inspection Panel with Smooth Accordion Animation */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-4 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-3 text-xs">
                        {/* Windows Policy-Based QoS & Bandwidth Control Panel */}
                        <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/90 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                              <Gauge className="w-3.5 h-3.5 text-sky-400" />
                              <span>Windows QoS & Rate Shaping</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              Priority: <strong className="text-sky-300">{appRule?.priority || 'Normal'}</strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                              <span className="text-[10px] text-slate-400 block font-sans">Inbound Cap (Down)</span>
                              <span className="font-semibold text-slate-200">
                                {appRule?.downloadEnabled && appRule.downloadLimitBps
                                  ? `${formatBandwidthLimit(appRule.downloadLimitBps)} (Advisory)`
                                  : 'Unlimited'}
                              </span>
                            </div>
                            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                              <span className="text-[10px] text-slate-400 block font-sans">Outbound Cap (Up)</span>
                              <span className="font-semibold text-teal-300">
                                {appRule?.uploadEnabled && appRule.uploadLimitBps
                                  ? `${formatBandwidthLimit(appRule.uploadLimitBps)} (pacer.sys)`
                                  : 'Unlimited'}
                              </span>
                            </div>
                          </div>

                          {conflictMessage && (
                            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>{conflictMessage}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-500 font-sans">
                              DSCP: {getPriorityQosMapping(appRule?.priority || 'Normal').dscpAction} | 802.1p: {getPriorityQosMapping(appRule?.priority || 'Normal').priorityValue8021}
                            </span>
                            <div className="flex items-center gap-2">
                              {hasRule && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (onRemoveAppLimit) {
                                      onRemoveAppLimit('application', app.exeName);
                                    }
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-rose-400 cursor-pointer"
                                >
                                  Clear Rule
                                </button>
                              )}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  openEditModal({
                                    targetType: 'application',
                                    targetIdentifier: app.exeName,
                                    friendlyName: app.friendlyName,
                                    exeName: app.exeName,
                                    appPath: app.fullPath,
                                    isGroupRule: true,
                                  });
                                }}
                                className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-[10px] font-semibold cursor-pointer"
                              >
                                Edit Policy
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Firewall Rule Status Banner */}
                        <div
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                            isBlocked
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isBlocked ? (
                              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="font-semibold block text-[11px]">
                                {isBlocked
                                  ? 'Firewall Rule: Traffic Blocked'
                                  : 'Network Access: Allowed'}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {isBlocked
                                  ? `All ${app.instanceCount > 1 ? `${app.instanceCount} instances of ` : ''}${app.exeName} blocked via Windows Firewall`
                                  : 'Normal TCP/UDP socket transmission enabled'}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onToggleBlock(app.exeName, !isBlocked, app.primaryPid);
                            }}
                            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors shrink-0 cursor-pointer ${
                              isBlocked
                                ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                            }`}
                          >
                            {isBlocked ? 'Unblock Now' : 'Block App'}
                          </button>
                        </div>

                        {/* Grouped Process Breakdown (if multiple instances) */}
                        {app.instanceCount > 1 && (
                          <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider">
                              <span>Grouped Processes ({app.instanceCount} PIDs)</span>
                              <span>Bandwidth / Per-PID Control</span>
                            </div>
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {app.instances.map(inst => {
                                const instDown = formatSpeed(inst.downloadBps);
                                const instUp = formatSpeed(inst.uploadBps);
                                const isInstActive = inst.downloadBps > 0 || inst.uploadBps > 0;
                                const pidRule = getAppRule(app.exeName, inst.pid);
                                return (
                                  <div
                                    key={inst.pid}
                                    className="flex items-center justify-between p-1.5 rounded bg-slate-950/80 border border-slate-800/80 text-[11px] font-mono"
                                  >
                                    <div className="flex items-center gap-2">
                                      <ProcessIcon
                                        exeName={inst.exeName || app.exeName}
                                        icon={inst.icon || app.icon}
                                        containerClassName="w-5 h-5 rounded bg-slate-950 p-0.5 border border-slate-800 shrink-0 flex items-center justify-center overflow-hidden"
                                        className="w-3.5 h-3.5"
                                        size={14}
                                      />
                                      <span className="text-slate-300 font-semibold">
                                        PID {inst.pid}
                                      </span>
                                      {isInstActive && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      )}
                                      {pidRule && pidRule.uploadEnabled && (
                                        <span className="text-[9px] px-1 rounded bg-teal-500/20 text-teal-300">
                                          Cap: {formatBandwidthLimit(pidRule.uploadLimitBps)}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-slate-500 font-sans">
                                        ({inst.connectionCount} {inst.connectionCount === 1 ? 'socket' : 'sockets'})
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sky-400 text-[10px]">
                                        ↓ {inst.trafficAvailable ? instDown.full : '--'}
                                      </span>
                                      <span className="text-teal-400 text-[10px]">
                                        ↑ {inst.trafficAvailable ? instUp.full : '--'}
                                      </span>
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          openEditModal({
                                            targetType: 'process',
                                            targetIdentifier: String(inst.pid),
                                            friendlyName: `${app.friendlyName} (PID ${inst.pid})`,
                                            exeName: app.exeName,
                                            pid: inst.pid,
                                            appPath: inst.fullPath || app.fullPath,
                                            isGroupRule: false,
                                          });
                                        }}
                                        title={`Set specific cap for PID ${inst.pid}`}
                                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                                      >
                                        <Sliders className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 pt-1">
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                              Executable Path
                            </span>
                            <span className="font-mono text-slate-300 break-all text-[11px] block mt-0.5">
                              {app.fullPath || 'Windows System / Service Process'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/50">
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                                Session Transferred
                              </span>
                              <div className="flex items-center gap-3 font-mono text-slate-200 mt-0.5">
                                <span className="text-sky-400">
                                  ↓{' '}
                                  {hasPerAppTraffic
                                    ? formatBytes(app.sessionDownloadBytes)
                                    : '--'}
                                </span>
                                <span className="text-teal-400">
                                  ↑{' '}
                                  {hasPerAppTraffic
                                    ? formatBytes(app.sessionUploadBytes)
                                    : '--'}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={e => {
                                e.stopPropagation();
                                app.instances.forEach(i => onResetStats(i.pid));
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3 text-slate-400" />
                              <span>Reset Counters</span>
                            </button>
                          </div>
                        </div>

                        {/* Active Remote Sockets */}
                        {app.connections && app.connections.length > 0 ? (
                          <div className="pt-2">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5">
                              Remote Sockets & Endpoints ({app.connections.length})
                            </span>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                              {app.connections.map(conn => (
                                <div
                                  key={conn.id}
                                  className="p-2 rounded bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-slate-300 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0 flex-1 truncate">
                                    <span className="text-sky-400 font-bold mr-1.5">
                                      {conn.protocol}
                                    </span>
                                    <span className="text-slate-200 truncate">
                                      {conn.remoteAddress}:{conn.remotePort}
                                    </span>
                                    {app.instanceCount > 1 && conn.processId && (
                                      <span className="ml-1.5 text-[9px] text-slate-500 font-sans">
                                        [PID {conn.processId}]
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-emerald-400 shrink-0 px-1 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                                    {isBlocked ? 'BLOCKED' : conn.state}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic pt-1">
                            No active socket endpoints open currently.
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Per-Application Bandwidth & QoS Configuration Modal */}
      <AnimatePresence>
        {editingTarget && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-[370px] rounded-2xl border p-4 shadow-2xl space-y-3.5 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="min-w-0">
                  <h3 className="font-bold text-xs flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-sky-400" />
                    <span className="truncate">{editingTarget.friendlyName}</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {editingTarget.targetType === 'process'
                      ? `Single Instance · PID ${editingTarget.pid}`
                      : 'All Process Instances (Group Rule)'}
                  </span>
                </div>
                <button
                  onClick={() => setEditingTarget(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Priority Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                  Application Priority & Scheduling
                </label>
                <select
                  value={modalPriority}
                  onChange={e => setModalPriority(e.target.value as ApplicationPriority)}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="Critical">Critical (DSCP 46 / EF, 802.1p 6)</option>
                  <option value="High">High (DSCP 34 / AF41, 802.1p 5)</option>
                  <option value="Normal">Normal (DSCP 0 / Best Effort)</option>
                  <option value="Low">Low (DSCP 10 / AF11, 802.1p 1)</option>
                  <option value="Background">Background (DSCP 8 / CS1, 802.1p 1)</option>
                </select>
                <span className="text-[9px] text-slate-500 block">
                  {getPriorityQosMapping(modalPriority).description}
                </span>
              </div>

              {/* Download Cap */}
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-sky-300">
                    <input
                      type="checkbox"
                      checked={modalDownEnabled}
                      onChange={e => setModalDownEnabled(e.target.checked)}
                      className="rounded accent-sky-500"
                    />
                    <span>Download Limit</span>
                  </label>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25">
                    Advisory
                  </span>
                </div>
                {modalDownEnabled && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value={modalDownValue}
                      onChange={e => setModalDownValue(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                    />
                    <select
                      value={modalDownUnit}
                      onChange={e => setModalDownUnit(e.target.value as BandwidthUnit)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                    >
                      <option value="KB/s">KB/s</option>
                      <option value="MB/s">MB/s</option>
                      <option value="Mbps">Mbps</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Upload Cap (Windows Policy-based QoS Enforced) */}
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-teal-300">
                    <input
                      type="checkbox"
                      checked={modalUpEnabled}
                      onChange={e => setModalUpEnabled(e.target.checked)}
                      className="rounded accent-teal-500"
                    />
                    <span>Upload Limit</span>
                  </label>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                    Enforced (pacer.sys)
                  </span>
                </div>
                {modalUpEnabled && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      value={modalUpValue}
                      onChange={e => setModalUpValue(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                    />
                    <select
                      value={modalUpUnit}
                      onChange={e => setModalUpUnit(e.target.value as BandwidthUnit)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                    >
                      <option value="KB/s">KB/s</option>
                      <option value="MB/s">MB/s</option>
                      <option value="Mbps">Mbps</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Conflict Detection Banner */}
              {editingTarget.targetType === 'process' && bandwidthConfig && (
                (() => {
                  const testRule: BandwidthLimitRule = {
                    id: 'temp_test',
                    name: editingTarget.exeName,
                    targetType: 'process',
                    targetIdentifier: String(editingTarget.pid),
                    pid: editingTarget.pid,
                    downloadLimitBps: modalDownEnabled ? toBitsPerSecond(parseFloat(modalDownValue) || 0, modalDownUnit) : undefined,
                    uploadLimitBps: modalUpEnabled ? toBitsPerSecond(parseFloat(modalUpValue) || 0, modalUpUnit) : undefined,
                    downloadEnabled: modalDownEnabled,
                    uploadEnabled: modalUpEnabled,
                    priority: modalPriority,
                    uploadEnforcement: 'enforced',
                    downloadEnforcement: 'advisory',
                  };
                  const conflict = detectPolicyConflicts(testRule, bandwidthConfig.appRules);
                  if (conflict) {
                    return (
                      <div className="p-2 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{conflict}</span>
                      </div>
                    );
                  }
                  return null;
                })()
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleResetModalToUnlimited}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Set Unlimited
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTarget(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveModalRule}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Policy</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
