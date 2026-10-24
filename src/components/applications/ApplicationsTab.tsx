import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { ProcessNetworkUsage, SocketConnection } from '../../types/network';
import { formatBytes, formatSpeed } from '../../utils/formatters';
import { getProcessIconSvg } from '../../utils/processIcons';
import { ProcessIcon } from '../common/ProcessIcon';

interface ApplicationsTabProps {
  processes: ProcessNetworkUsage[];
  onResetStats: (pid?: number) => void;
  onToggleBlock: (exeName: string, block: boolean, pid?: number) => void;
  isMonitoring: boolean;
}

type SortField = 'download' | 'upload' | 'total' | 'name' | 'pid';
type SortOrder = 'asc' | 'desc';
type FilterMode = 'all' | 'active' | 'blocked';

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

export const ApplicationsTab: React.FC<ApplicationsTabProps> = ({
  processes,
  onResetStats,
  onToggleBlock,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('download');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isGrouped, setIsGrouped] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

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
      const key = (proc.exeName || proc.name || 'unknown').toLowerCase().trim();
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

    // Sort instances inside each group by bandwidth descending, then PID
    for (const group of map.values()) {
      group.instances.sort(
        (a, b) => b.downloadBps + b.uploadBps - (a.downloadBps + a.uploadBps) || a.pid - b.pid
      );
    }

    return Array.from(map.values());
  }, [processes, isGrouped]);

  const blockedCount = useMemo(() => {
    return groupedApplications.filter(g => g.isBlocked).length;
  }, [groupedApplications]);

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
  }, [groupedApplications, searchQuery, sortField, sortOrder, filterMode]);

  return (
    <div className="space-y-3 p-3 max-w-full pb-16 w-full">
      {/* Header & Controls Strip */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-100 truncate">
              Application Control
            </h2>
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
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search application, executable or PID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Filter Tabs, View Grouping Toggle & Quick Sort Strip */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5 text-xs flex-wrap">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px]">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2 py-0.5 rounded transition-all ${
                filterMode === 'all'
                  ? 'bg-slate-800 text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('active')}
              className={`px-2 py-0.5 rounded transition-all ${
                filterMode === 'active'
                  ? 'bg-sky-500/20 text-sky-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilterMode('blocked')}
              className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                filterMode === 'blocked'
                  ? 'bg-rose-500/20 text-rose-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3 h-3" />
              <span>Blocked ({blockedCount})</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            {/* View Mode: Grouped by Application vs Separate PIDs */}
            <button
              onClick={() => setIsGrouped(!isGrouped)}
              title={isGrouped ? 'Switch to separate PIDs' : 'Group duplicate processes by application'}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                isGrouped
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {isGrouped ? <Boxes className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
              <span>{isGrouped ? 'Grouped' : 'PIDs'}</span>
            </button>

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
                  {/* Top Bar: Icon, Friendly Name, Instance Count & Block/Unblock Action */}
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

                    {/* Block / Unblock Action Button */}
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
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-all shrink-0 ${
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

                  {/* High-Density 2x2 Metric Tiles */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-xs font-mono">
                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">Down</span>
                      <span
                        className={`font-semibold tabular-nums ${
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

                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">Up</span>
                      <span
                        className={`font-semibold tabular-nums ${
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

                {/* Expanded Deep Inspection Panel */}
                {isExpanded && (
                  <div className="px-3.5 pb-4 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-3 text-xs">
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
                        className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors shrink-0 ${
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
                          <span>Bandwidth / Sockets</span>
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                          {app.instances.map(inst => {
                            const instDown = formatSpeed(inst.downloadBps);
                            const instUp = formatSpeed(inst.uploadBps);
                            const isInstActive = inst.downloadBps > 0 || inst.uploadBps > 0;
                            return (
                              <div
                                key={inst.pid}
                                className="flex items-center justify-between p-1.5 rounded bg-slate-950/80 border border-slate-800/80 text-[11px] font-mono"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-300 font-semibold">
                                    PID {inst.pid}
                                  </span>
                                  {isInstActive && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
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
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 transition-colors shrink-0"
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
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
