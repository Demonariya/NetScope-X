import React from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  Zap,
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

  // These percentages represent live endpoint counts, not bandwidth volume.
  const totalConns = processes.reduce((acc, p) => acc + (p.connections?.length || 0), 0);
  const tcpConns = processes.reduce(
    (acc, p) => acc + (p.connections?.filter(c => c.protocol === 'TCP').length || 0),
    0
  );
  const udpConns = totalConns - tcpConns;
  const tcpPercent = totalConns > 0 ? Math.round((tcpConns / totalConns) * 100) : 0;
  const udpPercent = totalConns > 0 ? 100 - tcpPercent : 0;

  // Format hourly history data for chart
  const hourlyData = history.slice(-12).map(item => ({
    hour: item.hourStr,
    downMB: Math.round(item.downloadBytes / (1024 * 1024)),
    upMB: Math.round(item.uploadBytes / (1024 * 1024)),
    totalMB: Math.round((item.downloadBytes + item.uploadBytes) / (1024 * 1024)),
    topApp: item.topApp,
  }));

  const attributedProcesses = processes.filter(process => process.trafficAvailable);
  const hasProcessAttribution = attributedProcesses.length > 0;
  const topConsumers = hasProcessAttribution
    ? [...attributedProcesses]
        .filter(process => process.totalBytes > 0 || process.downloadBps > 0 || process.uploadBps > 0)
        .sort((a, b) => b.totalBytes - a.totalBytes)
        .slice(0, 5)
    : [];
  const totalSessionData = attributedProcesses.reduce((acc, process) => acc + process.totalBytes, 0);

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* 1. Protocol Distribution Card */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <PieIcon className="w-4 h-4 text-sky-400 shrink-0" />
          <h3 className="text-xs font-semibold text-slate-100">
            Active Socket Protocol Mix
          </h3>
        </div>

        <div className="space-y-2.5">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">TCP connections</span>
              <span className="font-mono text-sky-400 font-semibold">{totalConns > 0 ? `${tcpPercent}%` : '--'}</span>
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
              <span className="font-mono text-teal-400 font-semibold">{totalConns > 0 ? `${udpPercent}%` : '--'}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${udpPercent}%` }}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Observed Sockets:</span>
            <span className="font-mono text-slate-200 font-medium">
              {tcpConns} TCP / {udpConns} UDP
            </span>
          </div>
        </div>
      </div>

      <div className={`rounded-xl bg-slate-900/80 border ${hasProcessAttribution ? 'border-emerald-500/20' : 'border-amber-500/20'} p-3 space-y-2`}>
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 shrink-0 ${hasProcessAttribution ? 'text-emerald-400' : 'text-amber-400'}`} />
          <h3 className="text-xs font-semibold text-slate-100">Per-Application Traffic</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {hasProcessAttribution
            ? 'Per-process byte counters are active. Rates and rankings use measured ETW samples collected while NetScope X is running.'
            : 'Live interface throughput comes from Windows network counters. Per-app byte attribution is not currently active; enable Kernel Monitoring & Telemetry in Settings.'}
        </p>
        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Per-app attribution</span>
          <span className={`px-2 py-0.5 rounded border font-medium ${hasProcessAttribution ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
            {hasProcessAttribution ? 'Available' : 'Not available'}
          </span>
        </div>
      </div>

      {/* 3. Hourly Data Transfer Bar Chart */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-100">
              Hourly Transferred Volume (MB)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Past 12h</span>
        </div>

        {hourlyData.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-center text-[11px] text-slate-500 px-5">
            Historical samples will appear here once traffic has been recorded.
          </div>
        ) : (
          <div className="h-44 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
              <XAxis dataKey="hour" stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} />
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
                formatter={(val: any, name: any) => [
                  `${val} MB`,
                  name === 'downMB' ? 'Download' : 'Upload',
                ]}
              />
              <Bar dataKey="downMB" fill={accentColor} radius={[3, 3, 0, 0]} name="Download" />
              <Bar dataKey="upMB" fill="#2dd4bf" radius={[3, 3, 0, 0]} name="Upload" />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 4. Top Bandwidth Consumers Ranking */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <TrendingUp className="w-4 h-4 text-sky-400 shrink-0" />
          <h3 className="text-xs font-semibold text-slate-100">Top Bandwidth Consumers</h3>
        </div>

        <div className="space-y-2">
          {!hasProcessAttribution || topConsumers.length === 0 ? (
            <p className="text-xs text-slate-400">
              {hasProcessAttribution
                ? 'The ETW collector is active; per-app totals will appear after traffic is attributed to a process.'
                : 'No per-application byte counters are available yet. Interface history below is measured from Windows.'}
            </p>
          ) : topConsumers.map((proc, index) => {
            const share = totalSessionData > 0 ? (proc.totalBytes / totalSessionData) * 100 : 0;
            return (
              <div key={proc.pid} className="space-y-1">
                <div className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 text-[11px] font-mono font-bold text-slate-500 shrink-0">
                      0{index + 1}
                    </span>
                    <span className="font-medium text-slate-200 truncate">{proc.friendlyName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono shrink-0">
                    <span className="text-slate-300">{formatBytes(proc.totalBytes)}</span>
                    <span className="text-[10px] text-sky-400 font-semibold">({share.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full"
                    style={{ width: `${Math.max(2, share)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
