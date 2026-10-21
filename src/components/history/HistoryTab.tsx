import React, { useState } from 'react';
import {
  History as HistoryIcon,
  Calendar,
  FileSpreadsheet,
  FileJson,
  Trash2,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrafficHistoryRecord } from '../../types/network';
import { formatBytes } from '../../utils/formatters';
import { api } from '../../services/api';

interface HistoryTabProps {
  history: TrafficHistoryRecord[];
  historyRange: 'today' | '7d' | '30d' | 'all';
  onRangeChange: (range: 'today' | '7d' | '30d' | 'all') => void;
  onClearHistory: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  history,
  historyRange,
  onRangeChange,
  onClearHistory,
  onShowToast,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const dateRange = historyRange;
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Compute totals
  const totalDownload = history.reduce((sum, item) => sum + item.downloadBytes, 0);
  const totalUpload = history.reduce((sum, item) => sum + item.uploadBytes, 0);
  const totalVolume = totalDownload + totalUpload;

  // Format chart data
  const chartData = history.map(item => ({
    time: item.hourStr,
    downMB: Math.round((item.downloadBytes / (1024 * 1024)) * 10) / 10,
    upMB: Math.round((item.uploadBytes / (1024 * 1024)) * 10) / 10,
    topApp: item.topApp,
  }));

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const content = await api.exportHistory(format, dateRange);
      const filename = `netscope_traffic_${dateRange}_${new Date().toISOString().replace(/[:.]/g, '-')}${format === 'csv' ? '.csv' : '.json'}`;
      const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
      const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onShowToast(`${format.toUpperCase()} Exported`, `${filename} was downloaded.`, 'success');
    } catch (error) {
      onShowToast('Export Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleConfirmClear = () => {
    onClearHistory();
    setShowClearConfirm(false);
  };

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* Header Strip with Date Range & Export Actions */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <HistoryIcon className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-100 truncate">
              Persistent History
            </h2>
          </div>

          {/* Export & Clear Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => { void handleExport('csv'); }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>

            <button
              onClick={() => { void handleExport('json'); }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
            >
              <FileJson className="w-3.5 h-3.5 text-sky-400" />
              <span>JSON</span>
            </button>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-1 rounded bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
              title="Clear historical database"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px] overflow-x-auto no-scrollbar">
          <Calendar className="w-3 h-3 text-slate-500 ml-1.5 mr-1 shrink-0" />
          {(['today', '7d', '30d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => onRangeChange(range)}
              className={`px-2 py-0.5 rounded capitalize whitespace-nowrap transition-all ${
                dateRange === range
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {range === 'today' ? 'Today' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Confirmation Dialog for clearing history */}
      {showClearConfirm && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>Purge all stored SQLite traffic records?</span>
          </div>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClear}
              className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium"
            >
              Confirm Clear
            </button>
          </div>
        </div>
      )}

      {/* Aggregated Totals Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
          <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-sans truncate">
            Total Volume
          </span>
          <span className="text-sm font-bold font-mono text-slate-100 tabular-nums truncate block mt-0.5">
            {formatBytes(totalVolume)}
          </span>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
          <div className="flex items-center gap-1 text-[9px] text-slate-400 uppercase tracking-wider truncate">
            <ArrowDown className="w-2.5 h-2.5 text-sky-400 shrink-0" />
            <span className="truncate">Download</span>
          </div>
          <span className="text-sm font-bold font-mono text-sky-400 tabular-nums truncate block mt-0.5">
            {formatBytes(totalDownload)}
          </span>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
          <div className="flex items-center gap-1 text-[9px] text-slate-400 uppercase tracking-wider truncate">
            <ArrowUp className="w-2.5 h-2.5 text-teal-400 shrink-0" />
            <span className="truncate">Upload</span>
          </div>
          <span className="text-sm font-bold font-mono text-teal-400 tabular-nums truncate block mt-0.5">
            {formatBytes(totalUpload)}
          </span>
        </div>
      </div>

      {/* Historical Trend Chart */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
        <h3 className="text-xs font-semibold text-slate-100 mb-2">
          Usage Timeline (Megabytes)
        </h3>
        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-center text-[11px] text-slate-500 px-5">
            No saved traffic for this period yet. Keep monitoring enabled to collect hourly totals.
          </div>
        ) : (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="histDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={accentColor} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="histUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} />
                <YAxis stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} tickFormatter={val => `${val}M`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isLight ? '#ffffff' : '#090d16',
                    borderColor: isLight ? '#cbd5e1' : '#334155',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: isLight ? '#0f172a' : '#f1f5f9',
                  }}
                  labelStyle={{ color: isLight ? '#475569' : '#94a3b8' }}
                  formatter={(value, name) => [`${value} MB`, name === 'downMB' ? 'Download' : 'Upload']}
                />
                <Area type="monotone" dataKey="downMB" stroke={accentColor} strokeWidth={2} fillOpacity={1} fill="url(#histDown)" name="Download (MB)" />
                <Area type="monotone" dataKey="upMB" stroke="#2dd4bf" strokeWidth={2} fillOpacity={1} fill="url(#histUp)" name="Upload (MB)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Hourly History Table */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 overflow-hidden shadow-sm">
        <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <span>Time & Interface</span>
          <span>Transfer (Down / Up)</span>
        </div>

        <div className="divide-y divide-slate-800/50 max-h-56 overflow-y-auto">
          {history.length === 0 ? (
            <div className="px-3 py-5 text-center text-[11px] text-slate-500">
              No recorded traffic in the selected period.
            </div>
          ) : history.map(item => (
            <div
              key={item.id}
              className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors gap-2"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-slate-300 text-[11px] block truncate">
                  {item.hourStr}
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  Interface: <span className="text-slate-200">{item.topApp}</span>
                </span>
              </div>

              <div className="text-right font-mono shrink-0">
                <span className="text-sky-400 text-[11px] block">
                  ↓ {formatBytes(item.downloadBytes)}
                </span>
                <span className="text-teal-400 text-[10px] block">
                  ↑ {formatBytes(item.uploadBytes)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
