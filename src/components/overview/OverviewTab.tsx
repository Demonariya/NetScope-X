import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Wifi,
  Network as EthernetIcon,
  Activity,
  Globe,
  Radio,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { AdapterDiscoveryStatus, NetworkAdapter, NetworkStats, PingResult } from '../../types/network';
import { formatBytes, formatSpeed, formatLatency, formatJitter, formatPercent } from '../../utils/formatters';

interface OverviewTabProps {
  adapters: NetworkAdapter[];
  adapterDiscoveryStatus: AdapterDiscoveryStatus;
  selectedAdapterId: string;
  onSelectAdapter: (id: string) => void;
  liveStats: NetworkStats | null;
  activePingTarget?: string;
  pingResult: PingResult | null;
  onSelectPingTarget: (target: string) => void;
  speedHistory: { time: string; downBps: number; upBps: number }[];
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
}

/**
 * Animated metric value component that renders fluid vertical entry and exit transitions
 * whenever the underlying numerical or textual value changes.
 */
const AnimatedValue: React.FC<{
  value: string | number;
  unit?: string;
  className?: string;
  unitClassName?: string;
}> = ({ value, unit, className = '', unitClassName = '' }) => (
  <span className="inline-flex items-baseline gap-1.5 overflow-hidden">
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={String(value)}
        initial={{ opacity: 0, y: -6, filter: 'blur(1px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 6, filter: 'blur(1px)' }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={`inline-block tabular-nums ${className}`}
      >
        {value}
      </motion.span>
    </AnimatePresence>
    {unit && <span className={unitClassName}>{unit}</span>}
  </span>
);

export const OverviewTab: React.FC<OverviewTabProps> = ({
  adapters,
  adapterDiscoveryStatus,
  selectedAdapterId,
  onSelectAdapter,
  liveStats,
  activePingTarget,
  pingResult,
  onSelectPingTarget,
  speedHistory,
  accentColor = '#38bdf8',
  currentTheme = 'dark',
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [chartTimeframe, setChartTimeframe] = useState<'30s' | '60s' | '5m'>('30s');
  const [customPingHost, setCustomPingHost] = useState('');

  const activeAdapter = selectedAdapterId === 'auto'
    ? adapters.find(a => a.isDefault) || adapters.find(a => a.status === 'connected') || adapters[0]
    : adapters.find(a => a.id === selectedAdapterId);

  const adapterDescription = activeAdapter?.description || ({
    loading: 'Detecting Windows network adapters…',
    available: 'The selected adapter is not present in the current adapter list.',
    empty: 'Windows did not report any network adapters.',
    error: 'Adapter detection failed. Review the diagnostic notification for details.',
    'desktop-required': 'Live adapter detection requires the Windows desktop application.',
  } satisfies Record<AdapterDiscoveryStatus, string>)[adapterDiscoveryStatus];

  const downSpeed = formatSpeed(liveStats?.downloadBps || 0);
  const upSpeed = formatSpeed(liveStats?.uploadBps || 0);
  const latencyMs = typeof pingResult?.latencyMs === 'number' && Number.isFinite(pingResult.latencyMs) ? pingResult.latencyMs : 0;
  const minLatencyMs = typeof pingResult?.minLatencyMs === 'number' && Number.isFinite(pingResult.minLatencyMs) ? pingResult.minLatencyMs : latencyMs;
  const maxLatencyMs = typeof pingResult?.maxLatencyMs === 'number' && Number.isFinite(pingResult.maxLatencyMs) ? pingResult.maxLatencyMs : latencyMs;
  const avgLatencyMs = typeof pingResult?.avgLatencyMs === 'number' && Number.isFinite(pingResult.avgLatencyMs) ? pingResult.avgLatencyMs : latencyMs;
  const jitterMs = typeof pingResult?.jitterMs === 'number' && Number.isFinite(pingResult.jitterMs) ? pingResult.jitterMs : 0;
  const packetLossPercent = typeof pingResult?.packetLossPercent === 'number' && Number.isFinite(pingResult.packetLossPercent) ? pingResult.packetLossPercent : 0;
  const latencyHistory = Array.isArray(pingResult?.history)
    ? pingResult.history.filter(value => typeof value === 'number' && Number.isFinite(value))
    : [];
  const lastProbeSucceeded = pingResult?.status === 'success' && Number.isFinite(pingResult.latencyMs);
  const hasSuccessfulPing = latencyHistory.length > 0;

  // Filter chart history based on timeframe
  const filteredHistory = React.useMemo(() => {
    const count = chartTimeframe === '30s' ? 30 : chartTimeframe === '60s' ? 60 : 120;
    return speedHistory.slice(-count).map(item => ({
      ...item,
      downKbps: Math.round(item.downBps / 1024),
      upKbps: Math.round(item.upBps / 1024),
    }));
  }, [speedHistory, chartTimeframe]);

  const handleCustomPingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPingHost.trim()) {
      onSelectPingTarget(customPingHost.trim());
      setCustomPingHost('');
    }
  };

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* 1. Connection Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/60">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-sky-400 shrink-0">
              {activeAdapter?.type === 'wifi' ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <EthernetIcon className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs text-slate-100 truncate">
                  {activeAdapter?.name || 'Network Adapter'}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full border font-medium shrink-0 ${
                  activeAdapter?.status === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : activeAdapter?.status === 'connecting'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                }`}>
                  {!activeAdapter ? 'Unavailable' : activeAdapter.status === 'connected' ? 'Connected' : activeAdapter.status === 'connecting' ? 'Connecting' : 'Disconnected'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {adapterDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Adapter Switcher Dropdown */}
        <div className="pt-2">
          <select
            value={selectedAdapterId}
            onChange={e => onSelectAdapter(e.target.value)}
            className="w-full text-xs bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-sky-500"
          >
            <option value="auto">Auto Select Adapter (Gateway)</option>
            {adapters.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {/* Adapter Properties 2x2 Grid with smooth entry/exit transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeAdapter?.id || 'auto'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-2 pt-2.5 text-xs"
          >
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 min-w-0">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Local IPv4
              </span>
              <span className="font-mono text-slate-200 font-medium truncate block text-xs mt-0.5">
                <AnimatedValue value={activeAdapter?.localIPv4 || '--'} />
              </span>
            </div>

            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 min-w-0">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Gateway
              </span>
              <span className="font-mono text-slate-200 font-medium truncate block text-xs mt-0.5">
                <AnimatedValue value={activeAdapter?.gateway || '--'} />
              </span>
            </div>

            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 min-w-0">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                {activeAdapter?.type === 'wifi' ? 'Wi-Fi Signal' : 'Link Speed'}
              </span>
              <span className="font-mono text-slate-200 font-medium truncate block text-xs mt-0.5">
                <AnimatedValue
                  value={
                    activeAdapter?.type === 'wifi'
                      ? `${activeAdapter.ssid || 'SSID unavailable'} (${activeAdapter.signalPercent != null ? `${activeAdapter.signalPercent}%` : 'signal unavailable'})`
                      : activeAdapter?.speedMbps ? `${activeAdapter.speedMbps} Mbps` : '--'
                  }
                />
              </span>
            </div>

            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 min-w-0">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                MAC Address
              </span>
              <span className="font-mono text-slate-200 font-medium truncate block text-xs mt-0.5">
                <AnimatedValue value={activeAdapter?.macAddress || '--'} />
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* 2. Download and Upload Speed Cards */}
      <div className="space-y-2.5">
        {/* Download Rate Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25, delay: 0.05, ease: 'easeOut' }}
          className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0">
                <ArrowDown className="w-3.5 h-3.5" />
              </div>
              <span className="font-medium text-slate-300">Download Throughput</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Session: <AnimatedValue value={liveStats ? formatBytes(liveStats.sessionDownloadBytes) : '--'} />
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-1.5 h-9 overflow-hidden">
            <AnimatedValue
              value={liveStats ? downSpeed.value : '--'}
              unit={liveStats ? downSpeed.unit : ''}
              className="text-3xl font-bold tracking-tight text-slate-100 font-mono"
              unitClassName="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono"
            />
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Measured Today:</span>
            <span className="font-mono text-slate-200 font-medium">
              <AnimatedValue value={liveStats ? formatBytes(liveStats.dailyDownloadBytes) : '--'} />
            </span>
          </div>
        </motion.div>

        {/* Upload Rate Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25, delay: 0.1, ease: 'easeOut' }}
          className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0">
                <ArrowUp className="w-3.5 h-3.5" />
              </div>
              <span className="font-medium text-slate-300">Upload Throughput</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Session: <AnimatedValue value={liveStats ? formatBytes(liveStats.sessionUploadBytes) : '--'} />
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-1.5 h-9 overflow-hidden">
            <AnimatedValue
              value={liveStats ? upSpeed.value : '--'}
              unit={liveStats ? upSpeed.unit : ''}
              className="text-3xl font-bold tracking-tight text-slate-100 font-mono"
              unitClassName="text-xs font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 font-mono"
            />
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Today's Total:</span>
            <span className="font-mono text-slate-200 font-medium">
              <AnimatedValue value={liveStats ? formatBytes(liveStats.dailyUploadBytes) : '--'} />
            </span>
          </div>
        </motion.div>
      </div>

      {/* 3. Live Traffic Graph Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.25, delay: 0.15, ease: 'easeOut' }}
        className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-semibold text-xs text-slate-200">Live Bandwidth Stream</span>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px]">
            {(['30s', '60s', '5m'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setChartTimeframe(tf)}
                className={`px-2 py-0.5 rounded transition-all ${
                  chartTimeframe === tf
                    ? 'bg-slate-800 text-sky-400 font-medium'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Legend */}
        <div className="flex items-center gap-3 text-[11px] pb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: accentColor }} />
            <span className="text-slate-400">Download</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-xs bg-teal-400" />
            <span className="text-slate-400">Upload</span>
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="h-44 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredHistory} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} />
              <YAxis
                stroke={isLight ? '#94a3b8' : '#475569'}
                fontSize={9}
                tickLine={false}
                tickFormatter={val => `${val}K`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isLight ? '#ffffff' : '#090d16',
                  borderColor: isLight ? '#cbd5e1' : '#334155',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: isLight ? '#0f172a' : '#f1f5f9',
                }}
                labelStyle={{ color: isLight ? '#475569' : '#94a3b8' }}
                formatter={(value: any, name: any) => [
                  `${value} KB/s`,
                  name === 'downKbps' ? 'Download' : 'Upload',
                ]}
              />
              <Area
                type="monotone"
                dataKey="downKbps"
                stroke={accentColor}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#downGrad)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="upKbps"
                stroke="#2dd4bf"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#upGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* 4. ICMP Ping Latency Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.25, delay: 0.2, ease: 'easeOut' }}
        className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3"
      >
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/60">
          <div className="flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold text-xs text-slate-200">Quality & Latency</span>
          </div>

          {/* Quick Target Switcher */}
          <div className="flex items-center gap-1 text-[11px]">
            {['1.1.1.1', '8.8.8.8', '9.9.9.9'].map(target => {
              const isSelected = activePingTarget === target || (!activePingTarget && pingResult?.target === target);
              return (
                <button
                  key={target}
                  onClick={() => onSelectPingTarget(target)}
                  className={`px-2 py-0.5 rounded border transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 font-medium'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {target === '1.1.1.1' ? '1.1.1.1' : target === '8.8.8.8' ? '8.8.8.8' : 'Quad9'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Latency Stats 2x2 Grid + Packet Loss with Entry/Exit Transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activePingTarget || '1.1.1.1'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-2 pt-2.5"
          >
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                  Current Ping Latency
                </span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={pingResult?.status ?? 'none'}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.18 }}
                    className={`text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                      !lastProbeSucceeded
                        ? 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                        : latencyMs < 40
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : latencyMs < 100
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {!pingResult ? 'Unavailable' : pingResult.status === 'timeout' ? 'Timeout' : pingResult.status === 'error' ? 'Error' : latencyMs < 40 ? 'Optimal' : latencyMs < 100 ? 'Good' : 'High'}
                  </motion.span>
                </AnimatePresence>
              </div>
              <div className="mt-0.5 h-7 overflow-hidden">
                <AnimatedValue
                  value={pingResult ? (pingResult.status === 'success' ? formatLatency(latencyMs) : pingResult.status === 'timeout' ? 'Timed out' : 'Failed') : '--'}
                  className="text-xl font-bold font-mono text-emerald-400"
                />
              </div>
            </div>

            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Average Ping Latency
              </span>
              <div className="mt-1 h-6 overflow-hidden">
                <AnimatedValue
                  value={hasSuccessfulPing ? formatLatency(avgLatencyMs) : '--'}
                  className="text-base font-semibold font-mono text-slate-200"
                />
              </div>
            </div>

            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Min / Max
              </span>
              <div className="mt-1 h-5 overflow-hidden">
                <AnimatedValue
                  value={hasSuccessfulPing ? `${minLatencyMs.toFixed(0)} / ${maxLatencyMs.toFixed(0)} ms` : '--'}
                  className="text-xs font-semibold font-mono text-slate-200"
                />
              </div>
            </div>

            <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Jitter / Failed Probes
              </span>
              <div className="mt-1 h-5 overflow-hidden">
                <AnimatedValue
                  value={hasSuccessfulPing ? `${formatJitter(jitterMs)} (${formatPercent(packetLossPercent)})` : '--'}
                  className="text-xs font-semibold font-mono text-sky-400"
                />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Latency History Sparkline Chart */}
        {hasSuccessfulPing && latencyHistory.length > 1 && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1">
              <span>Latency Variance (Last {latencyHistory.length} Probes)</span>
              <span className="font-mono text-emerald-400 font-semibold">{latencyMs.toFixed(1)} ms</span>
            </div>
            <div className="h-12 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={latencyHistory.map((lat, idx) => ({ idx: idx + 1, lat: Number(lat.toFixed(1)) }))}
                  margin={{ top: 2, right: 2, left: 2, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#090d16',
                      borderColor: '#1e293b',
                      borderRadius: '6px',
                      fontSize: '11px',
                      padding: '4px 8px',
                    }}
                    formatter={(value: any) => [`${value} ms`, 'Latency']}
                    labelFormatter={label => `Probe #${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="lat"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#latencyGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Custom Ping Probe Form */}
        <form onSubmit={handleCustomPingSubmit} className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1">
            <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="text"
              placeholder="Hostname or IPv4 address, e.g. 1.1.1.1"
              value={customPingHost}
              onChange={e => setCustomPingHost(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold rounded transition-colors shrink-0"
          >
            Probe
          </button>
        </form>
      </motion.div>
    </div>
  );
};
