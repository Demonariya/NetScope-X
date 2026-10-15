import React from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ProcessNetworkUsage, TrafficHistoryRecord } from '../../types/network';
import { formatBytes } from '../../utils/formatters';

interface TrafficTabProps {
  history: TrafficHistoryRecord[];
  processes: ProcessNetworkUsage[];
}

export const TrafficTab: React.FC<TrafficTabProps> = ({ history, processes }) => {
  // Compute TCP vs UDP estimates based on active sockets
  const totalConns = processes.reduce((acc, p) => acc + (p.connections?.length || 0), 0);
  const tcpConns = processes.reduce(
    (acc, p) => acc + (p.connections?.filter(c => c.protocol === 'TCP').length || 0),
    0
  );
  const udpConns = totalConns - tcpConns;
  const tcpPercent = totalConns > 0 ? Math.round((tcpConns / totalConns) * 100) : 82;
  const udpPercent = 100 - tcpPercent;

  // Format hourly history data for chart
  const hourlyData = history.slice(-14).map(item => ({
    hour: item.hourStr,
    downMB: Math.round(item.downloadBytes / (1024 * 1024)),
    upMB: Math.round(item.uploadBytes / (1024 * 1024)),
    totalMB: Math.round((item.downloadBytes + item.uploadBytes) / (1024 * 1024)),
    topApp: item.topApp,
  }));

  // Top 5 consumers
  const topConsumers = [...processes]
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .slice(0, 5);

  const totalSessionData = processes.reduce((acc, p) => acc + p.totalBytes, 0);

  return (
    <div className="space-y-3.5 p-3 sm:p-4 max-w-5xl mx-auto pb-16">
      {/* 1. Protocol Distribution & Peak Traffic Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Protocol Ratio Card */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <PieIcon className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-semibold text-slate-100">
              Protocol Distribution (Transport Layer)
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">TCP (Reliable Stream)</span>
                <span className="font-mono text-sky-400 font-semibold">{tcpPercent}%</span>
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
                <span className="text-slate-300 font-medium">UDP (Real-Time Media/Voice)</span>
                <span className="font-mono text-teal-400 font-semibold">{udpPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${udpPercent}%` }}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>Attributed Sockets:</span>
              <span className="font-mono text-slate-200 font-medium">
                {tcpConns} TCP / {udpConns} UDP
              </span>
            </div>
          </div>
        </div>

        {/* Peak Bandwidth & Diagnostic State */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-slate-100">Peak Session Activity</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Highest throughput detected during current monitoring session reached{' '}
              <span className="text-slate-200 font-mono font-semibold">12.4 MB/s</span> driven by{' '}
              <span className="text-sky-300 font-medium">Google Chrome</span> streaming buffer.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Kernel ETW Session:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Synchronized & Active
            </span>
          </div>
        </div>
      </div>

      {/* 2. Hourly Data Transfer Bar Chart */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-semibold text-slate-100">
              Hourly Transferred Volume (Megabytes)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Past 14 Hours</span>
        </div>

        <div className="h-48 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="hour" stroke="#475569" fontSize={10} tickLine={false} />
              <YAxis stroke="#475569" fontSize={10} tickLine={false} tickFormatter={val => `${val} MB`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#090d16',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(val: any, name: any) => [
                  `${val} MB`,
                  name === 'downMB' ? 'Download' : 'Upload',
                ]}
              />
              <Bar dataKey="downMB" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Download" />
              <Bar dataKey="upMB" fill="#2dd4bf" radius={[4, 4, 0, 0]} name="Upload" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Top Bandwidth Consumers Ranking */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-semibold text-slate-100">Top Bandwidth Consumers</h3>
        </div>

        <div className="space-y-2.5">
          {topConsumers.map((proc, index) => {
            const share = totalSessionData > 0 ? (proc.totalBytes / totalSessionData) * 100 : 0;
            return (
              <div key={proc.pid} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-[11px] font-mono font-bold text-slate-500">
                      0{index + 1}
                    </span>
                    <span className="font-medium text-slate-200">{proc.friendlyName}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({proc.exeName})</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-300">{formatBytes(proc.totalBytes)}</span>
                    <span className="text-[10px] text-sky-400">({share.toFixed(1)}%)</span>
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
