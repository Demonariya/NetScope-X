import React, { useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  Zap,
  Activity,
  Layers,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ProcessNetworkUsage, TrafficHistoryRecord } from '../../types/network';
import { formatBytes } from '../../utils/formatters';

interface TrafficTabProps {
  history: TrafficHistoryRecord[];
  processes: ProcessNetworkUsage[];
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
}

export const TrafficTab: React.FC<TrafficTabProps> = ({
  history,
  processes,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Active socket distribution counts
  const totalConns = useMemo(
    () => processes.reduce((acc, p) => acc + (p.connections?.length || 0), 0),
    [processes]
  );
  const tcpConns = useMemo(
    () => processes.reduce((acc, p) => acc + (p.connections?.filter(c => c.protocol === 'TCP').length || 0), 0),
    [processes]
  );
  const udpConns = totalConns - tcpConns;
  const tcpPercent = totalConns > 0 ? Math.round((tcpConns / totalConns) * 100) : 0;
  const udpPercent = totalConns > 0 ? 100 - tcpPercent : 0;

  // Hourly transferred volume data for the chart:
  // Take the most recent 12 hourly entries with unambiguous date+hour labels to prevent repeated keys
  const hourlyData = useMemo(() => {
    const recent = history.slice(-12);
    // Check if multiple dates exist in the recent 12 entries
    const dates = new Set(recent.map(r => r.dateStr));
    const isMultiDay = dates.size > 1;

    return recent.map(item => {
      const label = isMultiDay ? `${item.dateStr.slice(5)} ${item.hourStr}` : item.hourStr;
      const totalBytes = item.downloadBytes + item.uploadBytes;
      return {
        key: `${item.dateStr}_${item.hourStr}_${item.id}`,
        label,
        intervalName: `${item.dateStr} ${item.hourStr}`,
        downloadBytes: item.downloadBytes,
        uploadBytes: item.uploadBytes,
        totalBytes,
        downMB: Math.round((item.downloadBytes / (1024 * 1024)) * 10) / 10,
        upMB: Math.round((item.uploadBytes / (1024 * 1024)) * 10) / 10,
        totalMB: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
        topApp: item.topApp || 'Network Adapter',
      };
    });
  }, [history]);

  // Processes with active kernel ETW attribution
  const attributedProcesses = useMemo(
    () => processes.filter(process => process.trafficAvailable),
    [processes]
  );
  const hasProcessAttribution = attributedProcesses.length > 0;

  // Group processes by application executable for accurate ranking
  const topConsumers = useMemo(() => {
    if (!hasProcessAttribution) return [];

    const groupedMap = new Map<
      string,
      {
        key: string;
        friendlyName: string;
        exeName: string;
        totalBytes: number;
        downloadBps: number;
        uploadBps: number;
        instances: number;
      }
    >();

    for (const proc of attributedProcesses) {
      if (proc.totalBytes <= 0 && proc.downloadBps <= 0 && proc.uploadBps <= 0) continue;
      const key = (proc.exeName || proc.name || 'unknown').toLowerCase().trim();
      const existing = groupedMap.get(key);
      if (!existing) {
        groupedMap.set(key, {
          key,
          friendlyName: proc.friendlyName || proc.exeName || proc.name,
          exeName: proc.exeName || proc.name,
          totalBytes: proc.totalBytes,
          downloadBps: proc.downloadBps,
          uploadBps: proc.uploadBps,
          instances: 1,
        });
      } else {
        existing.totalBytes += proc.totalBytes;
        existing.downloadBps += proc.downloadBps;
        existing.uploadBps += proc.uploadBps;
        existing.instances += 1;
      }
    }

    return Array.from(groupedMap.values())
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 5);
  }, [attributedProcesses, hasProcessAttribution]);

  const totalSessionData = useMemo(
    () => topConsumers.reduce((acc, item) => acc + item.totalBytes, 0),
    [topConsumers]
  );

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* 1. Protocol Distribution Card */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-sky-400 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-100">
              Active Socket Protocol Mix
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {totalConns} active endpoints
          </span>
        </div>

        <div className="space-y-2.5">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">TCP connections</span>
              <span className="font-mono text-sky-400 font-semibold">
                {totalConns > 0 ? `${tcpPercent}% (${tcpConns})` : '--'}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-400 rounded-full transition-all duration-500"
                style={{ width: `${tcpPercent}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">UDP endpoints</span>
              <span className="font-mono text-teal-400 font-semibold">
                {totalConns > 0 ? `${udpPercent}% (${udpConns})` : '--'}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${udpPercent}%` }}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Observed Socket Endpoints:</span>
            <span className="font-mono text-slate-200 font-medium">
              {tcpConns} TCP · {udpConns} UDP
            </span>
          </div>
        </div>
      </div>

      {/* 2. Collection & Attribution Status Banner */}
      <div
        className={`rounded-xl bg-slate-900/80 border p-3 space-y-2 ${
          hasProcessAttribution ? 'border-emerald-500/25' : 'border-amber-500/25'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap
              className={`w-4 h-4 shrink-0 ${
                hasProcessAttribution ? 'text-emerald-400' : 'text-amber-400'
              }`}
            />
            <h3 className="text-xs font-semibold text-slate-100">
              Per-Application Traffic Telemetry
            </h3>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
              hasProcessAttribution
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            {hasProcessAttribution ? 'Active' : 'Unavailable'}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {hasProcessAttribution
            ? 'Per-process byte attribution is active. Rates and rankings use measured ETW telemetry captured while NetScope X is monitoring.'
            : 'Live interface bandwidth is collected from Windows NDIS counters. Per-application attribution requires Windows Event Tracing with Administrator elevation.'}
        </p>
      </div>

      {/* 3. Hourly Transferred Volume Chart */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-100">
              Hourly Transferred Volume (Megabytes)
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {hourlyData.length > 0 ? `Past ${hourlyData.length} intervals` : 'No data'}
          </span>
        </div>

        {hourlyData.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center text-[11px] text-slate-500 px-5 gap-1">
            <Activity className="w-6 h-6 text-slate-600 mb-1" />
            <p className="font-medium text-slate-400">No hourly transfer samples recorded yet.</p>
            <p className="text-[10px] text-slate-600">
              Hourly buckets will accumulate automatically as network traffic is measured.
            </p>
          </div>
        ) : (
          <div className="h-44 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
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
                          {data.intervalName}
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
                            <span>Combined Total:</span>
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
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 4. Top Bandwidth Consumers Ranking */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-400 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-100">Top Bandwidth Consumers</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Ranked by session volume
          </span>
        </div>

        <div className="space-y-2.5">
          {!hasProcessAttribution || topConsumers.length === 0 ? (
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">
                {hasProcessAttribution
                  ? 'No process byte transfer recorded during this session.'
                  : 'Process Attribution Not Available'}
              </p>
              <p className="text-[11px] text-slate-500">
                {hasProcessAttribution
                  ? 'Active programs will be ranked here as sockets transfer data.'
                  : 'Start NetScope X with Administrator elevation to enable per-process attribution.'}
              </p>
            </div>
          ) : (
            topConsumers.map((item, index) => {
              const share = totalSessionData > 0 ? (item.totalBytes / totalSessionData) * 100 : 0;
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-4 text-[11px] font-mono font-bold text-slate-500 shrink-0">
                        0{index + 1}
                      </span>
                      <span className="font-medium text-slate-200 truncate">
                        {item.friendlyName}
                      </span>
                      {item.instances > 1 && (
                        <span className="text-[9px] text-sky-400 font-mono px-1 py-0.2 rounded bg-sky-500/10 shrink-0">
                          {item.instances} PIDs
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 font-mono shrink-0">
                      <span className="text-slate-300">{formatBytes(item.totalBytes)}</span>
                      <span className="text-[10px] text-sky-400 font-semibold">
                        ({share.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(2, share)}%` }}
                    />
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
