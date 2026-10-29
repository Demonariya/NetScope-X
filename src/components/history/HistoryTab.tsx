import React, { useState, useMemo } from 'react';
import {
  History as HistoryIcon,
  Calendar,
  FileSpreadsheet,
  FileJson,
  Trash2,
  RotateCcw,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Activity,
  Layers,
  Search,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { TrafficHistoryRecord } from '../../types/network';
import { formatBytes } from '../../utils/formatters';
import { api } from '../../services/api';

interface HistoryTabProps {
  history: TrafficHistoryRecord[];
  historyRange: 'today' | '7d' | '30d' | 'all';
  onRangeChange: (range: 'today' | '7d' | '30d' | 'all') => void;
  onClearHistory: () => void;
  onResetSession?: () => void;
  isMonitoring?: boolean;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
}

type ViewAggregation = 'auto' | 'hourly' | 'daily';

export const HistoryTab: React.FC<HistoryTabProps> = ({
  history,
  historyRange,
  onRangeChange,
  onClearHistory,
  onResetSession,
  isMonitoring = true,
  onShowToast,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [searchFilter, setSearchFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewAggregation>('auto');
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [sortField, setSortField] = useState<'time' | 'down' | 'up' | 'total'>('time');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter history records by search query
  const filteredHistory = useMemo(() => {
    if (!searchFilter.trim()) return history;
    const query = searchFilter.toLowerCase().trim();
    return history.filter(
      item =>
        item.dateStr.toLowerCase().includes(query) ||
        item.hourStr.toLowerCase().includes(query) ||
        (item.topApp && item.topApp.toLowerCase().includes(query))
    );
  }, [history, searchFilter]);

  // Aggregate totals
  const totalDownload = useMemo(
    () => filteredHistory.reduce((sum, item) => sum + item.downloadBytes, 0),
    [filteredHistory]
  );
  const totalUpload = useMemo(
    () => filteredHistory.reduce((sum, item) => sum + item.uploadBytes, 0),
    [filteredHistory]
  );
  const totalVolume = totalDownload + totalUpload;

  // Determine whether to aggregate by day or display hourly intervals
  const isMultiDay = historyRange === '7d' || historyRange === '30d' || historyRange === 'all';
  const effectiveAggregation: 'hourly' | 'daily' =
    viewMode === 'auto' ? (historyRange === 'today' ? 'hourly' : 'daily') : viewMode;

  // Process data for charts with strict unique keys and unambiguous timestamps
  const chartData = useMemo(() => {
    if (effectiveAggregation === 'daily') {
      // Group by dateStr
      const dayMap = new Map<
        string,
        {
          dateStr: string;
          downloadBytes: number;
          uploadBytes: number;
          topApps: Set<string>;
          firstTimestamp: number;
        }
      >();

      for (const item of filteredHistory) {
        const existing = dayMap.get(item.dateStr);
        if (!existing) {
          dayMap.set(item.dateStr, {
            dateStr: item.dateStr,
            downloadBytes: item.downloadBytes,
            uploadBytes: item.uploadBytes,
            topApps: new Set([item.topApp]),
            firstTimestamp: item.timestamp,
          });
        } else {
          existing.downloadBytes += item.downloadBytes;
          existing.uploadBytes += item.uploadBytes;
          existing.topApps.add(item.topApp);
        }
      }

      return Array.from(dayMap.values())
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
        .map(day => {
          // Format date as "Oct 24" or "MM/DD"
          const parsed = new Date(`${day.dateStr}T00:00:00`);
          const label = !isNaN(parsed.getTime())
            ? parsed.toLocaleDateString([], { month: 'short', day: 'numeric' })
            : day.dateStr;

          const totalBytes = day.downloadBytes + day.uploadBytes;
          return {
            key: day.dateStr,
            label,
            fullInterval: `${day.dateStr} (Full Day)`,
            downloadBytes: day.downloadBytes,
            uploadBytes: day.uploadBytes,
            totalBytes,
            downMB: Math.round((day.downloadBytes / (1024 * 1024)) * 10) / 10,
            upMB: Math.round((day.uploadBytes / (1024 * 1024)) * 10) / 10,
            totalMB: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
            topApp: Array.from(day.topApps).filter(Boolean).join(', ') || 'Network Adapter',
          };
        });
    }

    // Hourly intervals: ensure unique keys even across midnight or multi-day
    return filteredHistory.map(item => {
      // Display label: if multi-day, prepend "MM/DD "; if today, just "HH:00"
      const label = isMultiDay ? `${item.dateStr.slice(5)} ${item.hourStr}` : item.hourStr;
      const totalBytes = item.downloadBytes + item.uploadBytes;

      return {
        key: `${item.dateStr}T${item.hourStr}_${item.id}`,
        label,
        fullInterval: `${item.dateStr} ${item.hourStr} - ${item.hourStr.slice(0, 2)}:59`,
        downloadBytes: item.downloadBytes,
        uploadBytes: item.uploadBytes,
        totalBytes,
        downMB: Math.round((item.downloadBytes / (1024 * 1024)) * 10) / 10,
        upMB: Math.round((item.uploadBytes / (1024 * 1024)) * 10) / 10,
        totalMB: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
        topApp: item.topApp || 'Network Adapter',
      };
    });
  }, [filteredHistory, effectiveAggregation, isMultiDay]);

  // Table rows sorted
  const sortedTableRows = useMemo(() => {
    return [...filteredHistory].sort((a, b) => {
      let diff = 0;
      if (sortField === 'time') diff = a.timestamp - b.timestamp;
      else if (sortField === 'down') diff = a.downloadBytes - b.downloadBytes;
      else if (sortField === 'up') diff = a.uploadBytes - b.uploadBytes;
      else if (sortField === 'total') {
        diff = a.downloadBytes + a.uploadBytes - (b.downloadBytes + b.uploadBytes);
      }
      return sortAsc ? diff : -diff;
    });
  }, [filteredHistory, sortField, sortAsc]);

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const content = await api.exportHistory(format, historyRange);
      const filename = `netscope_traffic_${historyRange}_${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}${format === 'csv' ? '.csv' : '.json'}`;
      const mimeType =
        format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
      const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onShowToast(
        `${format.toUpperCase()} Export Generated`,
        `Saved ${filename} (${filteredHistory.length} records)`,
        'success'
      );
    } catch (error) {
      onShowToast(
        'Export Failed',
        error instanceof Error ? error.message : String(error),
        'error'
      );
    }
  };

  const handleConfirmClear = () => {
    onClearHistory();
    setShowClearConfirm(false);
    onShowToast('Database Purged', 'All historical SQLite records have been deleted.', 'success');
  };

  const handleConfirmResetSession = () => {
    if (onResetSession) {
      onResetSession();
    }
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* 1. Header Strip with Status Badge, Exports, and Discretionary Actions */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <HistoryIcon className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-100 truncate">
              Persistent History
            </h2>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border shrink-0 ${
                isMonitoring
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isMonitoring ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>{isMonitoring ? 'Recording' : 'Paused'}</span>
            </span>
          </div>

          {/* Action Buttons: Export CSV, Export JSON, Reset Session, Purge DB */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                void handleExport('csv');
              }}
              title="Export displayed history to CSV spreadsheet"
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>

            <button
              onClick={() => {
                void handleExport('json');
              }}
              title="Export structured history to JSON"
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
            >
              <FileJson className="w-3.5 h-3.5 text-sky-400" />
              <span>JSON</span>
            </button>

            {onResetSession && (
              <button
                onClick={() => setShowResetConfirm(true)}
                title="Reset live session throughput counters (keeps SQLite history)"
                className="p-1 rounded bg-slate-800 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
              title="Purge all stored SQLite history records"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Date Range Selector & View Resolution Controls */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
          {/* Range Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px] overflow-x-auto no-scrollbar">
            <Calendar className="w-3 h-3 text-slate-500 ml-1.5 mr-0.5 shrink-0" />
            {(['today', '7d', '30d', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => onRangeChange(range)}
                className={`px-2 py-0.5 rounded capitalize whitespace-nowrap transition-all ${
                  historyRange === range
                    ? 'bg-slate-800 text-sky-400 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range === 'today'
                  ? 'Today'
                  : range === '7d'
                  ? '7 Days'
                  : range === '30d'
                  ? '30 Days'
                  : 'All Time'}
              </button>
            ))}
          </div>

          {/* Granularity & Chart Mode Toggle */}
          <div className="flex items-center gap-1 text-[10px]">
            {isMultiDay && (
              <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() => setViewMode('daily')}
                  className={`px-1.5 py-0.5 rounded ${
                    effectiveAggregation === 'daily'
                      ? 'bg-slate-800 text-sky-400 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setViewMode('hourly')}
                  className={`px-1.5 py-0.5 rounded ${
                    effectiveAggregation === 'hourly'
                      ? 'bg-slate-800 text-sky-400 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Hourly
                </button>
              </div>
            )}

            <button
              onClick={() => setChartType(chartType === 'area' ? 'bar' : 'area')}
              title={chartType === 'area' ? 'Switch to Bar chart' : 'Switch to Area chart'}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {chartType === 'area' ? 'Area' : 'Bars'}
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by interface or date (e.g. 2026-10 or Wi-Fi)..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className="w-full pl-7 pr-3 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Confirmation Dialog: Clear SQLite Database Records */}
      {showClearConfirm && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-rose-300 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Purge all stored SQLite traffic records?</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            This permanently deletes historical hourly database records. Live adapter counters and
            session totals will remain intact.
          </p>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClear}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
            >
              Confirm Purge
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Reset Live Session Counters */}
      {showResetConfirm && (
        <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-sky-300 font-medium">
            <RotateCcw className="w-4 h-4 shrink-0 text-sky-400" />
            <span>Reset current session traffic counters?</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            This zeros out live session counters across active adapters. Stored historical database
            records are preserved.
          </p>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmResetSession}
              className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium"
            >
              Confirm Reset
            </button>
          </div>
        </div>
      )}

      {/* 2. Aggregated Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
          <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
            <span>Total Volume</span>
            <Layers className="w-2.5 h-2.5 text-slate-500" />
          </div>
          <span className="text-sm font-bold font-mono text-slate-100 tabular-nums truncate block">
            {formatBytes(totalVolume)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
            {filteredHistory.length} intervals
          </span>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
          <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
            <span className="truncate">Download</span>
            <ArrowDown className="w-2.5 h-2.5 text-sky-400 shrink-0" />
          </div>
          <span className="text-sm font-bold font-mono text-sky-400 tabular-nums truncate block">
            {formatBytes(totalDownload)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
            {totalVolume > 0 ? `${Math.round((totalDownload / totalVolume) * 100)}% share` : '--'}
          </span>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
          <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
            <span className="truncate">Upload</span>
            <ArrowUp className="w-2.5 h-2.5 text-teal-400 shrink-0" />
          </div>
          <span className="text-sm font-bold font-mono text-teal-400 tabular-nums truncate block">
            {formatBytes(totalUpload)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
            {totalVolume > 0 ? `${Math.round((totalUpload / totalVolume) * 100)}% share` : '--'}
          </span>
        </div>
      </div>

      {/* 3. Usage Timeline Chart with Strictly Non-Colliding Keys & Tooltip Fix */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-100">
            Usage Timeline ({effectiveAggregation === 'daily' ? 'Daily Aggregated' : 'Hourly Breakdown'})
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">
            {chartData.length} data points
          </span>
        </div>

        {chartData.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center text-[11px] text-slate-500 px-5 gap-1">
            <Activity className="w-6 h-6 text-slate-600 mb-1" />
            <p className="font-medium text-slate-400">No telemetry recorded for this timeframe.</p>
            <p className="text-[10px] text-slate-600">
              Keep network monitoring enabled to collect and persist interface traffic.
            </p>
          </div>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: -22, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="histDownGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accentColor} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={accentColor} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="histUpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    stroke={isLight ? '#94a3b8' : '#475569'}
                    fontSize={9}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={isLight ? '#94a3b8' : '#475569'}
                    fontSize={9}
                    tickLine={false}
                    tickFormatter={val => `${val}M`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div
                          className={`p-2 rounded-lg border text-xs shadow-xl backdrop-blur-md ${
                            isLight
                              ? 'bg-white/95 border-slate-300 text-slate-900'
                              : 'bg-slate-950/95 border-slate-700 text-slate-100'
                          }`}
                        >
                          <div className="font-semibold text-[11px] mb-1.5 pb-1 border-b border-slate-800 text-slate-200">
                            {data.fullInterval}
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex items-center justify-between gap-3 text-sky-400">
                              <span>Download:</span>
                              <span className="font-bold">{formatBytes(data.downloadBytes)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-teal-400">
                              <span>Upload:</span>
                              <span className="font-bold">{formatBytes(data.uploadBytes)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-slate-300 pt-1 border-t border-slate-800/50">
                              <span>Combined:</span>
                              <span className="font-bold">{formatBytes(data.totalBytes)}</span>
                            </div>
                          </div>
                          <div className="mt-1.5 pt-1 border-t border-slate-800/50 text-[10px] text-slate-400 truncate">
                            Source: {data.topApp}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="downMB"
                    stroke={accentColor}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#histDownGrad)"
                    name="Download"
                  />
                  <Area
                    type="monotone"
                    dataKey="upMB"
                    stroke="#2dd4bf"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#histUpGrad)"
                    name="Upload"
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: -22, bottom: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    stroke={isLight ? '#94a3b8' : '#475569'}
                    fontSize={9}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={isLight ? '#94a3b8' : '#475569'}
                    fontSize={9}
                    tickLine={false}
                    tickFormatter={val => `${val}M`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div
                          className={`p-2 rounded-lg border text-xs shadow-xl backdrop-blur-md ${
                            isLight
                              ? 'bg-white/95 border-slate-300 text-slate-900'
                              : 'bg-slate-950/95 border-slate-700 text-slate-100'
                          }`}
                        >
                          <div className="font-semibold text-[11px] mb-1.5 pb-1 border-b border-slate-800 text-slate-200">
                            {data.fullInterval}
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex items-center justify-between gap-3 text-sky-400">
                              <span>Download:</span>
                              <span className="font-bold">{formatBytes(data.downloadBytes)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-teal-400">
                              <span>Upload:</span>
                              <span className="font-bold">{formatBytes(data.uploadBytes)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-slate-300 pt-1 border-t border-slate-800/50">
                              <span>Combined:</span>
                              <span className="font-bold">{formatBytes(data.totalBytes)}</span>
                            </div>
                          </div>
                          <div className="mt-1.5 pt-1 border-t border-slate-800/50 text-[10px] text-slate-400 truncate">
                            Source: {data.topApp}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="downMB"
                    fill={accentColor}
                    radius={[3, 3, 0, 0]}
                    name="Download"
                  />
                  <Bar
                    dataKey="upMB"
                    fill="#2dd4bf"
                    radius={[3, 3, 0, 0]}
                    name="Upload"
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 4. Detailed History Table with Column Sorting and Search Results */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 overflow-hidden shadow-sm">
        <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (sortField === 'time') setSortAsc(!sortAsc);
                else {
                  setSortField('time');
                  setSortAsc(false);
                }
              }}
              className="hover:text-slate-200 transition-colors flex items-center gap-1"
            >
              <span>Interval / Interface</span>
              {sortField === 'time' && <span>{sortAsc ? '↑' : '↓'}</span>}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (sortField === 'down') setSortAsc(!sortAsc);
                else {
                  setSortField('down');
                  setSortAsc(false);
                }
              }}
              className="hover:text-sky-300 transition-colors flex items-center gap-0.5"
            >
              <span>Down</span>
              {sortField === 'down' && <span>{sortAsc ? '↑' : '↓'}</span>}
            </button>

            <button
              onClick={() => {
                if (sortField === 'up') setSortAsc(!sortAsc);
                else {
                  setSortField('up');
                  setSortAsc(false);
                }
              }}
              className="hover:text-teal-300 transition-colors flex items-center gap-0.5"
            >
              <span>Up</span>
              {sortField === 'up' && <span>{sortAsc ? '↑' : '↓'}</span>}
            </button>

            <button
              onClick={() => {
                if (sortField === 'total') setSortAsc(!sortAsc);
                else {
                  setSortField('total');
                  setSortAsc(false);
                }
              }}
              className="hover:text-slate-200 transition-colors flex items-center gap-0.5"
            >
              <span>Total</span>
              {sortField === 'total' && <span>{sortAsc ? '↑' : '↓'}</span>}
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-800/50 max-h-56 overflow-y-auto pr-1">
          {sortedTableRows.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-slate-500">
              No historical traffic records match the active criteria.
            </div>
          ) : (
            sortedTableRows.map(item => {
              const combinedBytes = item.downloadBytes + item.uploadBytes;
              return (
                <div
                  key={item.id}
                  className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-slate-200 text-[11px] block truncate font-medium">
                      {item.dateStr} {item.hourStr}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                      Interface: <span className="text-slate-300">{item.topApp || 'Adapter'}</span>
                    </span>
                  </div>

                  <div className="text-right font-mono shrink-0 space-y-0.5">
                    <div className="flex items-center gap-2 justify-end text-[11px]">
                      <span className="text-sky-400">↓ {formatBytes(item.downloadBytes)}</span>
                      <span className="text-teal-400">↑ {formatBytes(item.uploadBytes)}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      Total: {formatBytes(combinedBytes)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
