import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
  ExternalLink,
  WifiOff,
} from 'lucide-react';
import { ProcessNetworkUsage } from '../../types/network';
import { formatBytes, formatSpeed, formatTime } from '../../utils/formatters';
import { getProcessIconSvg } from '../../utils/processIcons';

interface ApplicationsTabProps {
  processes: ProcessNetworkUsage[];
  onResetStats: (pid?: number) => void;
  isMonitoring: boolean;
}

type SortField = 'download' | 'upload' | 'total' | 'name' | 'pid';
type SortOrder = 'asc' | 'desc';

export const ApplicationsTab: React.FC<ApplicationsTabProps> = ({
  processes,
  onResetStats,
  isMonitoring,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('download');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);
  const [groupByExe, setGroupByExe] = useState(false);
  const [expandedPids, setExpandedPids] = useState<Set<number>>(new Set());

  const toggleExpand = (pid: number) => {
    const next = new Set(expandedPids);
    if (next.has(pid)) {
      next.delete(pid);
    } else {
      next.add(pid);
    }
    setExpandedPids(next);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Filter and sort processes
  const filteredAndSorted = useMemo(() => {
    return processes
      .filter(proc => {
        if (filterActiveOnly && proc.downloadBps === 0 && proc.uploadBps === 0) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          proc.friendlyName.toLowerCase().includes(q) ||
          proc.exeName.toLowerCase().includes(q) ||
          proc.pid.toString().includes(q)
        );
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'download') diff = a.downloadBps - b.downloadBps;
        else if (sortField === 'upload') diff = a.uploadBps - b.uploadBps;
        else if (sortField === 'total') diff = a.totalBytes - b.totalBytes;
        else if (sortField === 'name') diff = a.friendlyName.localeCompare(b.friendlyName);
        else if (sortField === 'pid') diff = a.pid - b.pid;

        return sortOrder === 'desc' ? -diff : diff;
      });
  }, [processes, searchQuery, sortField, sortOrder, filterActiveOnly]);

  return (
    <div className="space-y-3.5 p-3 sm:p-4 max-w-5xl mx-auto pb-16">
      {/* Header & Controls Strip */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs font-semibold text-slate-100">
              Per-Application Network Accounting
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              ({filteredAndSorted.length} programs)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onResetStats()}
              title="Reset session counters for all monitored programs"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Counters</span>
            </button>
          </div>
        </div>

        {/* Search, Filter & Group Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by application, executable, or PID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Filter Active Only Toggle */}
          <button
            onClick={() => setFilterActiveOnly(!filterActiveOnly)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              filterActiveOnly
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {filterActiveOnly ? 'Active Traffic Only' : 'All Programs'}
          </button>

          {/* Group by Executable Toggle */}
          <button
            onClick={() => setGroupByExe(!groupByExe)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              groupByExe
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Group Exe
          </button>
        </div>
      </div>

      {/* Process Table Header */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider select-none">
        <div
          className="col-span-4 flex items-center gap-1 cursor-pointer hover:text-slate-200"
          onClick={() => handleSort('name')}
        >
          <span>Application / Program</span>
          <ArrowUpDown className="w-2.5 h-2.5" />
        </div>
        <div
          className="col-span-2 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-slate-200"
          onClick={() => handleSort('download')}
        >
          <span>Download Speed</span>
          <ArrowUpDown className="w-2.5 h-2.5" />
        </div>
        <div
          className="col-span-2 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-slate-200"
          onClick={() => handleSort('upload')}
        >
          <span>Upload Speed</span>
          <ArrowUpDown className="w-2.5 h-2.5" />
        </div>
        <div
          className="col-span-2 text-right flex items-center justify-end gap-1 cursor-pointer hover:text-slate-200"
          onClick={() => handleSort('total')}
        >
          <span>Total Session</span>
          <ArrowUpDown className="w-2.5 h-2.5" />
        </div>
        <div className="col-span-2 text-right">
          <span>Sockets / State</span>
        </div>
      </div>

      {/* Process List Rows */}
      <div className="space-y-2">
        {filteredAndSorted.length === 0 ? (
          <div className="rounded-xl bg-slate-900/40 border border-slate-800/80 p-8 text-center text-slate-400">
            <WifiOff className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-300">No applications match your filter.</p>
            <p className="text-[11px] text-slate-500 mt-1">Try clearing your search query or enabling inactive programs.</p>
          </div>
        ) : (
          filteredAndSorted.map(proc => {
            const isExpanded = expandedPids.has(proc.pid);
            const down = formatSpeed(proc.downloadBps);
            const up = formatSpeed(proc.uploadBps);
            const iconSrc = proc.icon || getProcessIconSvg(proc.exeName);
            const hasActiveTraffic = proc.downloadBps > 0 || proc.uploadBps > 0;

            return (
              <div
                key={proc.pid}
                className={`rounded-xl border transition-all ${
                  isExpanded
                    ? 'bg-slate-900 border-sky-500/40 shadow-md shadow-black/20'
                    : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-900/90 hover:border-slate-700/80'
                }`}
              >
                {/* Main Row */}
                <div
                  onClick={() => toggleExpand(proc.pid)}
                  className="p-3 sm:px-4 cursor-pointer flex flex-col sm:grid sm:grid-cols-12 gap-2 items-start sm:items-center"
                >
                  {/* Col 1: Icon, Friendly Name, Exe & PID */}
                  <div className="col-span-4 flex items-center gap-3 min-w-0 w-full sm:w-auto">
                    <button className="text-slate-500 hover:text-slate-300 shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-sky-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <div className="w-8 h-8 rounded-lg bg-slate-950 p-1 border border-slate-800 shrink-0 flex items-center justify-center overflow-hidden">
                      <img
                        src={iconSrc}
                        alt={proc.friendlyName}
                        className="w-6 h-6 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-100 truncate">
                          {proc.friendlyName}
                        </span>
                        {hasActiveTraffic && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono truncate">
                        <span>{proc.exeName}</span>
                        <span>·</span>
                        <span>PID {proc.pid}</span>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Row Metrics Strip */}
                  <div className="flex sm:contents items-center justify-between w-full pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                    {/* Col 2: Download Speed */}
                    <div className="col-span-2 text-left sm:text-right">
                      <span className="sm:hidden text-[10px] text-slate-400 block">Download</span>
                      <span
                        className={`text-xs font-mono font-medium tabular-nums ${
                          proc.downloadBps > 0 ? 'text-sky-400' : 'text-slate-400'
                        }`}
                      >
                        {down.full}
                      </span>
                    </div>

                    {/* Col 3: Upload Speed */}
                    <div className="col-span-2 text-left sm:text-right">
                      <span className="sm:hidden text-[10px] text-slate-400 block">Upload</span>
                      <span
                        className={`text-xs font-mono font-medium tabular-nums ${
                          proc.uploadBps > 0 ? 'text-teal-400' : 'text-slate-400'
                        }`}
                      >
                        {up.full}
                      </span>
                    </div>

                    {/* Col 4: Session Total */}
                    <div className="col-span-2 text-left sm:text-right">
                      <span className="sm:hidden text-[10px] text-slate-400 block">Total</span>
                      <span className="text-xs font-mono text-slate-300 tabular-nums">
                        {formatBytes(proc.totalBytes)}
                      </span>
                    </div>

                    {/* Col 5: Socket Connections */}
                    <div className="col-span-2 text-right">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 font-medium">
                        {proc.connectionCount} sockets
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Deep Inspection Panel (Section 8) */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                          Full Executable Path
                        </span>
                        <span className="font-mono text-slate-300 break-all text-[11px]">
                          {proc.fullPath}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                          Session Downloaded / Uploaded
                        </span>
                        <div className="flex items-center gap-3 font-mono text-slate-200 mt-0.5">
                          <span className="text-sky-400">↓ {formatBytes(proc.sessionDownloadBytes)}</span>
                          <span className="text-teal-400">↑ {formatBytes(proc.sessionUploadBytes)}</span>
                        </div>
                      </div>

                      <div className="flex sm:justify-end items-center gap-2">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onResetStats(proc.pid);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 text-slate-400" />
                          <span>Reset Process Stats</span>
                        </button>
                      </div>
                    </div>

                    {/* Active Remote Sockets Table for this Process */}
                    {proc.connections && proc.connections.length > 0 ? (
                      <div className="pt-2">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5">
                          Active Network Sockets & Remote Endpoints
                        </span>
                        <div className="rounded-lg border border-slate-800/80 overflow-hidden bg-slate-950">
                          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-semibold text-slate-400 border-b border-slate-800">
                            <span className="col-span-2">Protocol</span>
                            <span className="col-span-4">Local Address:Port</span>
                            <span className="col-span-4">Remote Endpoint</span>
                            <span className="col-span-2 text-right">State</span>
                          </div>
                          {proc.connections.map(conn => (
                            <div
                              key={conn.id}
                              className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[11px] font-mono text-slate-300 border-b last:border-b-0 border-slate-800/50"
                            >
                              <span className="col-span-2 text-sky-400">{conn.protocol}</span>
                              <span className="col-span-4 text-slate-400 truncate">
                                {conn.localAddress}:{conn.localPort}
                              </span>
                              <span className="col-span-4 text-slate-200 truncate">
                                {conn.remoteAddress}:{conn.remotePort}
                              </span>
                              <span className="col-span-2 text-right text-emerald-400">
                                {conn.state}
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
