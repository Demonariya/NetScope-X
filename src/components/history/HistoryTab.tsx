import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  History as HistoryIcon,
  Calendar,
  FileSpreadsheet,
  FileJson,
  Trash2,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Activity,
  Layers,
  Search,
  Filter,
  CalendarDays,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Radio,
  Cpu,
  Network,
  Clock,
  Download,
  Upload,
  Copy,
  Check,
  Zap,
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
  LineChart,
  Line,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrafficHistoryRecord,
  HistoryRange,
  PingSessionRecord,
  AppAccountingRecord,
  SocketConnection,
} from '../../types/network';
import { formatBytes, formatLatency, formatTime } from '../../utils/formatters';
import { getContrastingUploadColor } from '../../utils/appearance';
import { api } from '../../services/api';

export type HistoryCategory = 'traffic' | 'applications' | 'ping' | 'connections';

interface HistoryTabProps {
  history: TrafficHistoryRecord[];
  historyRange: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  onClearHistory: () => void;
  onResetSession?: () => void;
  isMonitoring?: boolean;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  accentColor?: string;
  currentTheme?: 'dark' | 'light' | 'system';
  onCustomDateFilter?: (startDate: string, endDate: string) => void;
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
  onCustomDateFilter,
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Active Category Tab
  const [activeCategory, setActiveCategory] = useState<HistoryCategory>('traffic');

  // Secondary data sets
  const [pingSessions, setPingSessions] = useState<PingSessionRecord[]>([]);
  const [appAccounting, setAppAccounting] = useState<AppAccountingRecord[]>([]);
  const [connections, setConnections] = useState<SocketConnection[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filter State
  const [searchFilter, setSearchFilter] = useState('');
  const [interfaceFilter, setInterfaceFilter] = useState<string>('all');
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [appRunningFilter, setAppRunningFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewAggregation>('auto');
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  // Modals
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDateRangeDeleteModal, setShowDateRangeDeleteModal] = useState(false);
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [selectedRecordDetail, setSelectedRecordDetail] = useState<{
    type: HistoryCategory;
    data: any;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Custom Date Range State
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date(Date.now() - 7 * 86400_000);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Prune Date Range State
  const [pruneStartDate, setPruneStartDate] = useState<string>(() => {
    const d = new Date(Date.now() - 30 * 86400_000);
    return d.toISOString().split('T')[0];
  });
  const [pruneEndDate, setPruneEndDate] = useState<string>(() => {
    const d = new Date(Date.now() - 7 * 86400_000);
    return d.toISOString().split('T')[0];
  });

  // Sorting
  const [sortField, setSortField] = useState<string>('time');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Load secondary category datasets
  const loadCategoryData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [pings, apps, conns] = await Promise.all([
        api.getPingSessions(100).catch(() => []),
        api.getAppAccountingRecords().catch(() => []),
        api.getConnections().catch(() => []),
      ]);
      setPingSessions(pings);
      setAppAccounting(apps);
      setConnections(conns);
    } catch (err) {
      console.warn('Could not load history sub-datasets:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCategoryData();
  }, [loadCategoryData]);

  // Reset page number on category, search, or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchFilter, interfaceFilter, protocolFilter, appRunningFilter, historyRange]);

  // Available interfaces extracted from actual traffic records
  const availableInterfaces = useMemo(() => {
    const set = new Set<string>();
    for (const item of history) {
      if (item.interfaceName) set.add(item.interfaceName);
    }
    if (set.size === 0) {
      set.add('Wi-Fi 6');
      set.add('Ethernet');
    }
    return Array.from(set);
  }, [history]);

  // Filter history records by search query, date range, and interface filter
  const filteredHistory = useMemo(() => {
    let list = history;

    // Interface Filter
    if (interfaceFilter !== 'all') {
      list = list.filter(
        item =>
          item.interfaceName === interfaceFilter ||
          (item.topApp && item.topApp.toLowerCase().includes(interfaceFilter.toLowerCase()))
      );
    }

    // Custom Date Range Filter
    if (historyRange === 'custom') {
      if (customStartDate) {
        list = list.filter(item => item.dateStr >= customStartDate);
      }
      if (customEndDate) {
        list = list.filter(item => item.dateStr <= customEndDate);
      }
    }

    // Search query filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        item =>
          item.dateStr.toLowerCase().includes(q) ||
          item.hourStr.toLowerCase().includes(q) ||
          (item.topApp && item.topApp.toLowerCase().includes(q)) ||
          (item.interfaceName && item.interfaceName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [history, interfaceFilter, historyRange, customStartDate, customEndDate, searchFilter]);

  // Filter App Accounting records
  const filteredApps = useMemo(() => {
    let list = appAccounting;
    if (appRunningFilter === 'running') {
      list = list.filter(a => a.isRunning);
    } else if (appRunningFilter === 'stopped') {
      list = list.filter(a => !a.isRunning);
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        a =>
          a.exeName.toLowerCase().includes(q) ||
          a.friendlyName.toLowerCase().includes(q) ||
          a.fullPath.toLowerCase().includes(q)
      );
    }
    return list;
  }, [appAccounting, appRunningFilter, searchFilter]);

  // Filter Ping Sessions
  const filteredPingSessions = useMemo(() => {
    let list = pingSessions;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        s => s.target.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [pingSessions, searchFilter]);

  // Filter Connections
  const filteredConnections = useMemo(() => {
    let list = connections;
    if (protocolFilter !== 'all') {
      list = list.filter(c => c.protocol === protocolFilter);
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        c =>
          c.processName.toLowerCase().includes(q) ||
          c.remoteAddress.toLowerCase().includes(q) ||
          c.localAddress.toLowerCase().includes(q) ||
          String(c.remotePort).includes(q) ||
          String(c.localPort).includes(q) ||
          String(c.pid).includes(q)
      );
    }
    return list;
  }, [connections, protocolFilter, searchFilter]);

  // Traffic totals
  const totalDownload = useMemo(
    () => filteredHistory.reduce((sum, item) => sum + item.downloadBytes, 0),
    [filteredHistory]
  );
  const totalUpload = useMemo(
    () => filteredHistory.reduce((sum, item) => sum + item.uploadBytes, 0),
    [filteredHistory]
  );
  const totalVolume = totalDownload + totalUpload;

  // Average & peak speeds across intervals
  const peakIntervalBytes = useMemo(() => {
    if (filteredHistory.length === 0) return 0;
    return Math.max(...filteredHistory.map(h => h.downloadBytes + h.uploadBytes));
  }, [filteredHistory]);

  const avgIntervalBytes = useMemo(() => {
    if (filteredHistory.length === 0) return 0;
    return Math.round(totalVolume / filteredHistory.length);
  }, [totalVolume, filteredHistory.length]);

  const uploadColor = useMemo(() => getContrastingUploadColor(accentColor), [accentColor]);

  // Multi-day check
  const isMultiDay =
    historyRange === '7d' ||
    historyRange === '30d' ||
    historyRange === 'this_month' ||
    historyRange === 'prev_month' ||
    historyRange === 'all' ||
    historyRange === 'custom';

  const effectiveAggregation: 'hourly' | 'daily' =
    viewMode === 'auto'
      ? historyRange === 'today' || historyRange === 'yesterday' || historyRange === '15m' || historyRange === '1h' || historyRange === '6h' || historyRange === '24h'
        ? 'hourly'
        : 'daily'
      : viewMode;

  // Chart data for Traffic
  const rawChartPoints = useMemo(() => {
    if (effectiveAggregation === 'daily') {
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
            topApp: Array.from(day.topApps).filter(Boolean).join(', ') || 'Network Adapter',
          };
        });
    }

    return [...filteredHistory]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(item => {
        const label = isMultiDay ? `${item.dateStr.slice(5)} ${item.hourStr}` : item.hourStr;
        const totalBytes = item.downloadBytes + item.uploadBytes;
        return {
          key: `${item.dateStr}T${item.hourStr}_${item.id}`,
          label,
          fullInterval: `${item.dateStr} ${item.hourStr}`,
          downloadBytes: item.downloadBytes,
          uploadBytes: item.uploadBytes,
          totalBytes,
          topApp: item.topApp || 'Network Adapter',
        };
      });
  }, [filteredHistory, effectiveAggregation, isMultiDay]);

  const { chartUnit, unitDivisor, chartData } = useMemo(() => {
    const maxVal = Math.max(
      ...rawChartPoints.map(p => Math.max(p.downloadBytes, p.uploadBytes)),
      0
    );

    let unit = 'MB';
    let divisor = 1024 * 1024;
    if (maxVal < 1024 * 1024 && maxVal > 0) {
      unit = 'KB';
      divisor = 1024;
    } else if (maxVal >= 1024 * 1024 * 1024) {
      unit = 'GB';
      divisor = 1024 * 1024 * 1024;
    }

    const scaled = rawChartPoints.map(p => ({
      ...p,
      downScaled: Math.round((p.downloadBytes / divisor) * 10) / 10,
      upScaled: Math.round((p.uploadBytes / divisor) * 10) / 10,
      totalScaled: Math.round((p.totalBytes / divisor) * 10) / 10,
    }));

    return { chartUnit: unit, unitDivisor: divisor, chartData: scaled };
  }, [rawChartPoints]);

  // App chart data: Top 6 apps by volume
  const appChartData = useMemo(() => {
    return [...filteredApps]
      .sort((a, b) => (b.lifetimeDownloadBytes + b.lifetimeUploadBytes) - (a.lifetimeDownloadBytes + a.lifetimeUploadBytes))
      .slice(0, 6)
      .map(app => ({
        name: app.friendlyName || app.exeName,
        downloadMB: Math.round(app.lifetimeDownloadBytes / (1024 * 1024)),
        uploadMB: Math.round(app.lifetimeUploadBytes / (1024 * 1024)),
        totalMB: Math.round((app.lifetimeDownloadBytes + app.lifetimeUploadBytes) / (1024 * 1024)),
      }));
  }, [filteredApps]);

  // Ping chart data: Latency & jitter timeline
  const pingChartData = useMemo(() => {
    return [...filteredPingSessions]
      .sort((a, b) => a.startTime - b.startTime)
      .slice(-15)
      .map(s => ({
        time: new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avgMs: Math.round(s.avgLatencyMs * 10) / 10,
        jitterMs: Math.round(s.jitterMs * 10) / 10,
        target: s.target,
        loss: s.packetLossPercent,
      }));
  }, [filteredPingSessions]);

  // Sorted and Paginated Data per Category
  const sortedData = useMemo(() => {
    if (activeCategory === 'traffic') {
      return [...filteredHistory].sort((a, b) => {
        let diff = 0;
        if (sortField === 'time') diff = a.timestamp - b.timestamp;
        else if (sortField === 'down') diff = a.downloadBytes - b.downloadBytes;
        else if (sortField === 'up') diff = a.uploadBytes - b.uploadBytes;
        else if (sortField === 'total') {
          diff = a.downloadBytes + a.uploadBytes - (b.downloadBytes + b.uploadBytes);
        } else if (sortField === 'app') diff = a.topApp.localeCompare(b.topApp);
        return sortAsc ? diff : -diff;
      });
    }

    if (activeCategory === 'applications') {
      return [...filteredApps].sort((a, b) => {
        let diff = 0;
        if (sortField === 'name') diff = (a.friendlyName || a.exeName).localeCompare(b.friendlyName || b.exeName);
        else if (sortField === 'down') diff = a.lifetimeDownloadBytes - b.lifetimeDownloadBytes;
        else if (sortField === 'up') diff = a.lifetimeUploadBytes - b.lifetimeUploadBytes;
        else if (sortField === 'total') {
          diff = (a.lifetimeDownloadBytes + a.lifetimeUploadBytes) - (b.lifetimeDownloadBytes + b.lifetimeUploadBytes);
        } else if (sortField === 'seen') diff = a.lastSeen - b.lastSeen;
        return sortAsc ? diff : -diff;
      });
    }

    if (activeCategory === 'ping') {
      return [...filteredPingSessions].sort((a, b) => {
        let diff = 0;
        if (sortField === 'time') diff = a.startTime - b.startTime;
        else if (sortField === 'target') diff = a.target.localeCompare(b.target);
        else if (sortField === 'latency') diff = a.avgLatencyMs - b.avgLatencyMs;
        else if (sortField === 'jitter') diff = a.jitterMs - b.jitterMs;
        else if (sortField === 'loss') diff = a.packetLossPercent - b.packetLossPercent;
        return sortAsc ? diff : -diff;
      });
    }

    // Connections
    return [...filteredConnections].sort((a, b) => {
      let diff = 0;
      if (sortField === 'process') diff = a.processName.localeCompare(b.processName);
      else if (sortField === 'proto') diff = a.protocol.localeCompare(b.protocol);
      else if (sortField === 'state') diff = a.state.localeCompare(b.state);
      else if (sortField === 'port') diff = a.localPort - b.localPort;
      return sortAsc ? diff : -diff;
    });
  }, [activeCategory, filteredHistory, filteredApps, filteredPingSessions, filteredConnections, sortField, sortAsc]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Export handler with active category awareness
  const handleExport = async (format: 'csv' | 'json') => {
    try {
      let content = '';
      let filename = `netscope_${activeCategory}_${historyRange}_${new Date().toISOString().replace(/[:.]/g, '-')}`;

      if (activeCategory === 'traffic') {
        content = await api.exportHistory(
          format,
          historyRange,
          historyRange === 'custom' ? customStartDate : undefined,
          historyRange === 'custom' ? customEndDate : undefined,
          interfaceFilter !== 'all' ? interfaceFilter : undefined
        );
      } else if (activeCategory === 'applications') {
        if (format === 'json') {
          content = JSON.stringify(filteredApps, null, 2);
        } else {
          const headers = ['AppKey', 'ExeName', 'FriendlyName', 'FullPath', 'FirstSeen', 'LastSeen', 'LifetimeDownloadBytes', 'LifetimeUploadBytes', 'LifetimeTotalBytes', 'IsRunning'];
          const rows = filteredApps.map(a => [
            `"${a.appKey}"`,
            `"${a.exeName}"`,
            `"${a.friendlyName}"`,
            `"${a.fullPath.replace(/"/g, '""')}"`,
            new Date(a.firstSeen).toISOString(),
            new Date(a.lastSeen).toISOString(),
            a.lifetimeDownloadBytes,
            a.lifetimeUploadBytes,
            a.lifetimeDownloadBytes + a.lifetimeUploadBytes,
            a.isRunning ? 'Yes' : 'No',
          ].join(','));
          content = [headers.join(','), ...rows].join('\n');
        }
      } else if (activeCategory === 'ping') {
        if (format === 'json') {
          content = JSON.stringify(filteredPingSessions, null, 2);
        } else {
          const headers = ['ID', 'Target', 'Host', 'StartTime', 'EndTime', 'TotalRequests', 'SuccessfulRequests', 'FailedRequests', 'PacketLossPercent', 'MinLatencyMs', 'MaxLatencyMs', 'AvgLatencyMs', 'JitterMs'];
          const rows = filteredPingSessions.map(p => [
            `"${p.id}"`,
            `"${p.target}"`,
            `"${p.host}"`,
            new Date(p.startTime).toISOString(),
            new Date(p.endTime).toISOString(),
            p.totalRequests,
            p.successfulRequests,
            p.failedRequests,
            p.packetLossPercent,
            p.minLatencyMs,
            p.maxLatencyMs,
            p.avgLatencyMs,
            p.jitterMs,
          ].join(','));
          content = [headers.join(','), ...rows].join('\n');
        }
      } else {
        // Connections
        if (format === 'json') {
          content = JSON.stringify(filteredConnections, null, 2);
        } else {
          const headers = ['ID', 'Protocol', 'PID', 'ProcessName', 'LocalAddress', 'LocalPort', 'RemoteAddress', 'RemotePort', 'State'];
          const rows = filteredConnections.map(c => [
            `"${c.id}"`,
            `"${c.protocol}"`,
            c.pid,
            `"${c.processName}"`,
            `"${c.localAddress}"`,
            c.localPort,
            `"${c.remoteAddress}"`,
            c.remotePort,
            `"${c.state}"`,
          ].join(','));
          content = [headers.join(','), ...rows].join('\n');
        }
      }

      filename += format === 'csv' ? '.csv' : '.json';
      const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
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
        `Exported ${sortedData.length} records to ${filename}`,
        'success'
      );
    } catch (error) {
      onShowToast('Export Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Delete Individual Record
  const handleDeleteRecord = async (type: HistoryCategory, id: string) => {
    try {
      if (type === 'traffic') {
        await api.deleteHistoryRecord(id);
        onShowToast('Record Deleted', `Deleted traffic record ${id}`, 'success');
        onRangeChange(historyRange); // trigger parent reload
      } else if (type === 'ping') {
        await api.deletePingSession(id);
        setPingSessions(prev => prev.filter(p => p.id !== id));
        onShowToast('Session Deleted', `Deleted ping session ${id}`, 'success');
      } else if (type === 'applications') {
        await api.clearAppAccounting(id);
        setAppAccounting(prev => prev.filter(a => a.appKey !== id));
        onShowToast('App Removed', `Cleared application accounting for ${id}`, 'success');
      }
      setSelectedRecordDetail(null);
    } catch (error) {
      onShowToast('Deletion Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Delete Date Range
  const handleConfirmDateRangeDelete = async () => {
    try {
      const deleted = await api.deleteHistoryRange(pruneStartDate, pruneEndDate);
      setShowDateRangeDeleteModal(false);
      onShowToast('Date Range Pruned', `Deleted ${deleted} records from ${pruneStartDate} to ${pruneEndDate}`, 'success');
      onRangeChange(historyRange);
    } catch (error) {
      onShowToast('Prune Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Clear Category Data
  const handleConfirmClear = async () => {
    try {
      if (activeCategory === 'traffic') {
        onClearHistory();
        onShowToast('Database Purged', 'All historical SQLite traffic records deleted.', 'success');
      } else if (activeCategory === 'ping') {
        await api.clearPingSessions();
        setPingSessions([]);
        onShowToast('Ping History Cleared', 'All saved ping probe sessions deleted.', 'success');
      } else if (activeCategory === 'applications') {
        await api.clearAppAccounting();
        setAppAccounting([]);
        onShowToast('App History Cleared', 'All application lifetime traffic accounting records deleted.', 'success');
      }
      setShowClearConfirm(false);
    } catch (error) {
      onShowToast('Clear Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRangeChange(historyRange);
    await loadCategoryData();
    setIsRefreshing(false);
    onShowToast('Data Refreshed', `Reloaded ${activeCategory} records from database.`, 'info');
  };

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    onRangeChange('custom');
    if (onCustomDateFilter) {
      onCustomDateFilter(customStartDate, customEndDate);
    }
    setShowCustomDateModal(false);
    onShowToast('Custom Range Applied', `Filtering traffic from ${customStartDate} to ${customEndDate}.`, 'info');
  };

  const copyToClipboard = (text: string, key: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
      onShowToast('Copied to Clipboard', text.length > 40 ? text.slice(0, 40) + '...' : text, 'info');
    } catch {}
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* 1. Header Strip with Category Navigation & Universal Action Bar */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm space-y-3">
        {/* Category Selector Tabs */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-lg border border-slate-800/80">
            <button
              onClick={() => setActiveCategory('traffic')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeCategory === 'traffic'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Traffic</span>
            </button>

            <button
              onClick={() => setActiveCategory('applications')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeCategory === 'applications'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Applications</span>
            </button>

            <button
              onClick={() => setActiveCategory('ping')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeCategory === 'ping'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Ping Quality</span>
            </button>

            <button
              onClick={() => setActiveCategory('connections')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeCategory === 'connections'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Sockets</span>
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh database records"
              className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-sky-400 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
            </button>

            <button
              onClick={() => handleExport('csv')}
              title={`Export ${activeCategory} to CSV`}
              className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => handleExport('json')}
              title={`Export ${activeCategory} to JSON`}
              className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-sky-400 transition-colors cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5" />
            </button>

            {activeCategory === 'traffic' && (
              <button
                onClick={() => setShowDateRangeDeleteModal(true)}
                title="Prune records in custom date range"
                className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => setShowClearConfirm(true)}
              title={`Clear all ${activeCategory} records`}
              className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Time-Range Selector Bar (Primarily for Traffic) */}
        {activeCategory === 'traffic' && (
          <div className="space-y-2 pt-1 border-t border-slate-800/60">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <div className="flex items-center gap-1 text-[11px] overflow-x-auto pb-1 scrollbar-none flex-1">
                {(
                  [
                    '15m',
                    '1h',
                    '6h',
                    '24h',
                    'today',
                    'yesterday',
                    'this_week',
                    '7d',
                    '30d',
                    'this_month',
                    'prev_month',
                    'all',
                  ] as HistoryRange[]
                ).map(range => (
                  <motion.button
                    key={range}
                    onClick={() => onRangeChange(range)}
                    whileTap={{ scale: 0.94 }}
                    className={`h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded border transition-colors shrink-0 cursor-pointer leading-none ${
                      historyRange === range
                        ? 'border-sky-500/50 text-sky-400 font-semibold bg-sky-500/10'
                        : isLight
                        ? 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {range === '15m'
                      ? '15m'
                      : range === '1h'
                      ? '1h'
                      : range === '6h'
                      ? '6h'
                      : range === '24h'
                      ? '24h'
                      : range === 'today'
                      ? 'Today'
                      : range === 'yesterday'
                      ? 'Yesterday'
                      : range === 'this_week'
                      ? 'This Week'
                      : range === '7d'
                      ? '7 Days'
                      : range === '30d'
                      ? '30 Days'
                      : range === 'this_month'
                      ? 'This Month'
                      : range === 'prev_month'
                      ? 'Prev Month'
                      : 'All Time'}
                  </motion.button>
                ))}

                {/* Custom Range Button */}
                <motion.button
                  onClick={() => setShowCustomDateModal(true)}
                  whileTap={{ scale: 0.94 }}
                  title="Filter by custom date range"
                  className={`h-6 px-2 text-[10px] inline-flex items-center justify-center gap-1 rounded border transition-colors shrink-0 cursor-pointer leading-none ${
                    historyRange === 'custom'
                      ? 'border-sky-500/50 text-sky-400 font-semibold bg-sky-500/10'
                      : isLight
                      ? 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CalendarDays className="w-3 h-3 shrink-0" />
                  <span>Custom</span>
                  {historyRange === 'custom' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  )}
                </motion.button>
              </div>

              {/* View Aggregation & Chart Type */}
              <div className="flex items-center gap-1 text-[10px]">
                {isMultiDay && (
                  <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded border border-slate-800">
                    <button
                      onClick={() => setViewMode('daily')}
                      className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                        effectiveAggregation === 'daily'
                          ? 'bg-slate-800 text-sky-300 font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setViewMode('hourly')}
                      className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                        effectiveAggregation === 'hourly'
                          ? 'bg-slate-800 text-sky-300 font-medium'
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
                  className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {chartType === 'area' ? 'Area' : 'Bars'}
                </button>
              </div>
            </div>

            {historyRange === 'custom' && customStartDate && customEndDate && (
              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/40 text-slate-400">
                <span className="flex items-center gap-1.5 text-sky-400 font-mono">
                  <CalendarDays className="w-3 h-3 shrink-0" />
                  <span>Active Range: {customStartDate} to {customEndDate}</span>
                </span>
                <button
                  onClick={() => onRangeChange('today')}
                  className="text-[10px] text-slate-400 hover:text-sky-400 underline cursor-pointer"
                >
                  Reset to Today
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search & Dynamic Filter Row */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/40">
          {/* Category-Specific Filter */}
          <div className="relative">
            {activeCategory === 'traffic' && (
              <select
                value={interfaceFilter}
                onChange={e => setInterfaceFilter(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-sky-500"
              >
                <option value="all">All Interfaces</option>
                {availableInterfaces.map(iface => (
                  <option key={iface} value={iface}>
                    {iface}
                  </option>
                ))}
              </select>
            )}

            {activeCategory === 'applications' && (
              <select
                value={appRunningFilter}
                onChange={e => setAppRunningFilter(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-sky-500"
              >
                <option value="all">All Process States</option>
                <option value="running">Active / Running Only</option>
                <option value="stopped">Historical / Stopped</option>
              </select>
            )}

            {activeCategory === 'ping' && (
              <div className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-400 flex items-center justify-between">
                <span>Targets Logged: {new Set(pingSessions.map(p => p.target)).size}</span>
                <span className="font-mono text-[10px] text-sky-400">{pingSessions.length} total</span>
              </div>
            )}

            {activeCategory === 'connections' && (
              <select
                value={protocolFilter}
                onChange={e => setProtocolFilter(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-sky-500"
              >
                <option value="all">All Protocols (TCP & UDP)</option>
                <option value="TCP">TCP Only</option>
                <option value="UDP">UDP Only</option>
              </select>
            )}
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
            <input
              type="text"
              placeholder={`Search ${activeCategory}...`}
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full pl-7 pr-3 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* 2. Dynamic Real Summary Cards (Category-Specific) */}
      {activeCategory === 'traffic' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Total Transferred</span>
              <Layers className="w-2.5 h-2.5 text-slate-500" />
            </div>
            <span className="text-sm font-bold font-mono text-slate-100 tabular-nums truncate block">
              {formatBytes(totalVolume)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              {filteredHistory.length} intervals recorded
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Download</span>
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
              <span>Upload</span>
              <ArrowUp className="w-2.5 h-2.5 text-teal-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-teal-400 tabular-nums truncate block">
              {formatBytes(totalUpload)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              {totalVolume > 0 ? `${Math.round((totalUpload / totalVolume) * 100)}% share` : '--'}
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Peak Interval</span>
              <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-amber-400 tabular-nums truncate block">
              {formatBytes(peakIntervalBytes)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Avg: {formatBytes(avgIntervalBytes)}/int
            </span>
          </div>
        </div>
      )}

      {activeCategory === 'applications' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Tracked Apps</span>
              <Cpu className="w-2.5 h-2.5 text-slate-500" />
            </div>
            <span className="text-sm font-bold font-mono text-slate-100 tabular-nums truncate block">
              {filteredApps.length}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              {filteredApps.filter(a => a.isRunning).length} currently active
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Lifetime Traffic</span>
              <Layers className="w-2.5 h-2.5 text-sky-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-sky-400 tabular-nums truncate block">
              {formatBytes(filteredApps.reduce((acc, a) => acc + a.lifetimeDownloadBytes + a.lifetimeUploadBytes, 0))}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Persistent accounting
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Top Consumer</span>
              <ArrowDown className="w-2.5 h-2.5 text-teal-400 shrink-0" />
            </div>
            <span className="text-sm font-bold text-teal-400 truncate block">
              {filteredApps[0]?.friendlyName || filteredApps[0]?.exeName || '--'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              {filteredApps[0] ? formatBytes(filteredApps[0].lifetimeDownloadBytes + filteredApps[0].lifetimeUploadBytes) : '--'}
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Active Sockets</span>
              <Network className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums truncate block">
              {connections.length}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Live OS connections
            </span>
          </div>
        </div>
      )}

      {activeCategory === 'ping' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Sessions Saved</span>
              <Radio className="w-2.5 h-2.5 text-slate-500" />
            </div>
            <span className="text-sm font-bold font-mono text-slate-100 tabular-nums truncate block">
              {filteredPingSessions.length}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Recorded probe cycles
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Average Latency</span>
              <Clock className="w-2.5 h-2.5 text-sky-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-sky-400 tabular-nums truncate block">
              {filteredPingSessions.length > 0
                ? formatLatency(filteredPingSessions.reduce((acc, p) => acc + p.avgLatencyMs, 0) / filteredPingSessions.length)
                : '--'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Historical average
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Avg Packet Loss</span>
              <Activity className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-amber-400 tabular-nums truncate block">
              {filteredPingSessions.length > 0
                ? `${(filteredPingSessions.reduce((acc, p) => acc + p.packetLossPercent, 0) / filteredPingSessions.length).toFixed(1)}%`
                : '--'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Network reliability
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Best Latency</span>
              <Zap className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums truncate block">
              {filteredPingSessions.length > 0
                ? formatLatency(Math.min(...filteredPingSessions.map(p => p.minLatencyMs)))
                : '--'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Minimum probe recorded
            </span>
          </div>
        </div>
      )}

      {activeCategory === 'connections' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Total Sockets</span>
              <Network className="w-2.5 h-2.5 text-slate-500" />
            </div>
            <span className="text-sm font-bold font-mono text-slate-100 tabular-nums truncate block">
              {filteredConnections.length}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Active OS sockets
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Established TCP</span>
              <Layers className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums truncate block">
              {filteredConnections.filter(c => c.state === 'ESTABLISHED').length}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Active connections
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Listening Ports</span>
              <Radio className="w-2.5 h-2.5 text-sky-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-sky-400 tabular-nums truncate block">
              {filteredConnections.filter(c => c.state === 'LISTENING').length}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Inbound servers
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5 min-w-0">
            <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-sans mb-1">
              <span>Distinct Apps</span>
              <Cpu className="w-2.5 h-2.5 text-teal-400 shrink-0" />
            </div>
            <span className="text-sm font-bold font-mono text-teal-400 tabular-nums truncate block">
              {new Set(filteredConnections.map(c => c.processName)).size}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate">
              Unique processes
            </span>
          </div>
        </div>
      )}

      {/* 3. Interactive Visualizations */}
      {activeCategory === 'traffic' && (
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-100">
              Traffic Timeline ({effectiveAggregation === 'daily' ? 'Daily' : 'Hourly'} in {chartUnit})
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {chartData.length} intervals recorded
            </span>
          </div>

          {chartData.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center text-[11px] text-slate-500 px-5 gap-1">
              <Activity className="w-6 h-6 text-slate-600 mb-1" />
              <p className="font-medium text-slate-400">No traffic telemetry recorded for this timeframe.</p>
              <p className="text-[10px] text-slate-600">
                Keep network monitoring enabled to log and persist adapter traffic.
              </p>
            </div>
          ) : (
            <div className="h-44 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' ? (
                  <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="histDownGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={accentColor} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={accentColor} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="histUpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={uploadColor} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={uploadColor} stopOpacity={0.0} />
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
                      tickFormatter={val => `${val} ${chartUnit}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div
                            className={`p-2.5 rounded-lg border text-xs shadow-xl backdrop-blur-md ${
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
                              <div className="flex items-center justify-between gap-3" style={{ color: uploadColor }}>
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
                      dataKey="downScaled"
                      stroke={accentColor}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#histDownGrad)"
                      name="Download"
                    />
                    <Area
                      type="monotone"
                      dataKey="upScaled"
                      stroke={uploadColor}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#histUpGrad)"
                      name="Upload"
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
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
                      tickFormatter={val => `${val} ${chartUnit}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div
                            className={`p-2.5 rounded-lg border text-xs shadow-xl backdrop-blur-md ${
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
                              <div className="flex items-center justify-between gap-3" style={{ color: uploadColor }}>
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
                    <Bar dataKey="downScaled" fill={accentColor} radius={[3, 3, 0, 0]} name="Download" />
                    <Bar dataKey="upScaled" fill={uploadColor} radius={[3, 3, 0, 0]} name="Upload" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeCategory === 'applications' && (
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-100">Top Consumer Applications (Lifetime in MB)</h3>
            <span className="text-[10px] text-slate-400 font-mono">Top {appChartData.length} of {filteredApps.length} apps</span>
          </div>

          {appChartData.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center text-[11px] text-slate-500 px-5 gap-1">
              <Cpu className="w-6 h-6 text-slate-600 mb-1" />
              <p className="font-medium text-slate-400">No application accounting records stored.</p>
            </div>
          ) : (
            <div className="h-44 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={appChartData} layout="vertical" margin={{ top: 5, right: 15, left: 35, bottom: 0 }}>
                  <XAxis type="number" stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} tickFormatter={v => `${v} MB`} />
                  <YAxis type="category" dataKey="name" stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} width={80} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-lg border border-slate-700 bg-slate-950/95 text-slate-100 text-xs shadow-xl">
                          <div className="font-semibold text-sky-400 mb-1">{d.name}</div>
                          <div className="font-mono text-[11px] space-y-0.5">
                            <div>Download: {d.downloadMB} MB</div>
                            <div>Upload: {d.uploadMB} MB</div>
                            <div className="text-slate-300 font-bold border-t border-slate-800 pt-1">Total: {d.totalMB} MB</div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="downloadMB" fill={accentColor} stackId="a" radius={[0, 0, 0, 0]} name="Download" />
                  <Bar dataKey="uploadMB" fill={uploadColor} stackId="a" radius={[0, 3, 3, 0]} name="Upload" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeCategory === 'ping' && (
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-100">Ping Probe History (Latency & Jitter in ms)</h3>
            <span className="text-[10px] text-slate-400 font-mono">Recent {pingChartData.length} sessions</span>
          </div>

          {pingChartData.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center text-[11px] text-slate-500 px-5 gap-1">
              <Radio className="w-6 h-6 text-slate-600 mb-1" />
              <p className="font-medium text-slate-400">No ping probe sessions recorded yet.</p>
              <p className="text-[10px] text-slate-600">Run continuous or one-off ping probes from the Overview tab to log sessions.</p>
            </div>
          ) : (
            <div className="h-44 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pingChartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <XAxis dataKey="time" stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} />
                  <YAxis stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickLine={false} tickFormatter={v => `${v}ms`} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-lg border border-slate-700 bg-slate-950/95 text-slate-100 text-xs shadow-xl">
                          <div className="font-semibold text-slate-200 mb-1">Target: {d.target} ({d.time})</div>
                          <div className="font-mono text-[11px] space-y-0.5">
                            <div className="text-sky-400">Avg Latency: {d.avgMs} ms</div>
                            <div className="text-teal-400">Jitter: {d.jitterMs} ms</div>
                            <div className={d.loss > 0 ? 'text-rose-400' : 'text-emerald-400'}>Packet Loss: {d.loss}%</div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="avgMs" stroke={accentColor} strokeWidth={2} dot={{ r: 2 }} name="Latency" />
                  <Line type="monotone" dataKey="jitterMs" stroke={uploadColor} strokeWidth={1.5} dot={{ r: 2 }} name="Jitter" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 4. Functional Paginated Data Table */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 overflow-hidden shadow-sm">
        {/* Table Header Row with Column Sorting Controls */}
        <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          {activeCategory === 'traffic' && (
            <>
              <button onClick={() => toggleSort('time')} className="hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer">
                <span>Interval / Date</span>
                {sortField === 'time' && <span>{sortAsc ? '↑' : '↓'}</span>}
              </button>

              <div className="flex items-center gap-3">
                <button onClick={() => toggleSort('down')} className="hover:text-sky-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Down</span>
                  {sortField === 'down' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <button onClick={() => toggleSort('up')} className="hover:text-teal-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Up</span>
                  {sortField === 'up' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <button onClick={() => toggleSort('total')} className="hover:text-slate-200 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Total</span>
                  {sortField === 'total' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <span className="w-12 text-right">Actions</span>
              </div>
            </>
          )}

          {activeCategory === 'applications' && (
            <>
              <button onClick={() => toggleSort('name')} className="hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer">
                <span>Application Name</span>
                {sortField === 'name' && <span>{sortAsc ? '↑' : '↓'}</span>}
              </button>

              <div className="flex items-center gap-3">
                <button onClick={() => toggleSort('down')} className="hover:text-sky-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Down</span>
                  {sortField === 'down' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <button onClick={() => toggleSort('up')} className="hover:text-teal-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Up</span>
                  {sortField === 'up' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <button onClick={() => toggleSort('total')} className="hover:text-slate-200 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Lifetime Total</span>
                  {sortField === 'total' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <span className="w-12 text-right">Actions</span>
              </div>
            </>
          )}

          {activeCategory === 'ping' && (
            <>
              <button onClick={() => toggleSort('target')} className="hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer">
                <span>Target Host</span>
                {sortField === 'target' && <span>{sortAsc ? '↑' : '↓'}</span>}
              </button>

              <div className="flex items-center gap-3">
                <button onClick={() => toggleSort('latency')} className="hover:text-sky-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Avg Latency</span>
                  {sortField === 'latency' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <button onClick={() => toggleSort('loss')} className="hover:text-amber-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Loss</span>
                  {sortField === 'loss' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <button onClick={() => toggleSort('time')} className="hover:text-slate-200 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Recorded</span>
                  {sortField === 'time' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <span className="w-12 text-right">Actions</span>
              </div>
            </>
          )}

          {activeCategory === 'connections' && (
            <>
              <button onClick={() => toggleSort('process')} className="hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer">
                <span>Process / Remote End</span>
                {sortField === 'process' && <span>{sortAsc ? '↑' : '↓'}</span>}
              </button>

              <div className="flex items-center gap-3">
                <button onClick={() => toggleSort('proto')} className="hover:text-sky-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>Proto</span>
                  {sortField === 'proto' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <button onClick={() => toggleSort('state')} className="hover:text-emerald-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                  <span>State</span>
                  {sortField === 'state' && <span>{sortAsc ? '↑' : '↓'}</span>}
                </button>
                <span className="w-12 text-right">Details</span>
              </div>
            </>
          )}
        </div>

        {/* Table Body */}
        <div className="divide-y divide-slate-800/50 min-h-36 max-h-72 overflow-y-auto pr-1">
          {paginatedRows.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-slate-500">
              No {activeCategory} records match the current criteria.
            </div>
          ) : (
            paginatedRows.map((item: any, idx) => {
              if (activeCategory === 'traffic') {
                const combinedBytes = item.downloadBytes + item.uploadBytes;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedRecordDetail({ type: 'traffic', data: item })}
                    className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors gap-2 cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-200 text-[11px] font-medium truncate">
                          {item.dateStr} {item.hourStr}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 font-mono">
                          #{item.id.slice(-6)}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                        Interface: <span className="text-slate-300">{item.interfaceName || item.topApp || 'Adapter'}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono shrink-0 space-y-0.5">
                        <div className="flex items-center gap-2 justify-end text-[11px]">
                          <span className="text-sky-400">↓ {formatBytes(item.downloadBytes)}</span>
                          <span className="text-teal-400">↑ {formatBytes(item.uploadBytes)}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block">Total: {formatBytes(combinedBytes)}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedRecordDetail({ type: 'traffic', data: item });
                          }}
                          title="View record details"
                          className="p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            void handleDeleteRecord('traffic', item.id);
                          }}
                          title="Delete record from database"
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (activeCategory === 'applications') {
                const total = item.lifetimeDownloadBytes + item.lifetimeUploadBytes;
                return (
                  <div
                    key={item.appKey}
                    onClick={() => setSelectedRecordDetail({ type: 'applications', data: item })}
                    className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors gap-2 cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-100 text-[11px] truncate">
                          {item.friendlyName || item.exeName}
                        </span>
                        {item.isRunning && (
                          <span className="px-1 py-0.2 rounded text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 truncate block mt-0.5 font-mono">
                        {item.fullPath}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono shrink-0 space-y-0.5">
                        <div className="flex items-center gap-2 justify-end text-[11px]">
                          <span className="text-sky-400">↓ {formatBytes(item.lifetimeDownloadBytes)}</span>
                          <span className="text-teal-400">↑ {formatBytes(item.lifetimeUploadBytes)}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block">Lifetime: {formatBytes(total)}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedRecordDetail({ type: 'applications', data: item });
                          }}
                          title="View application details"
                          className="p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            void handleDeleteRecord('applications', item.appKey);
                          }}
                          title="Clear application history"
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (activeCategory === 'ping') {
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedRecordDetail({ type: 'ping', data: item })}
                    className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors gap-2 cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-100 text-[11px] truncate">
                          {item.target}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">({item.host})</span>
                      </div>
                      <span className="text-[10px] text-slate-500 truncate block mt-0.5">
                        {item.totalRequests} probes • {item.successfulRequests} ok • {item.failedRequests} failed
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono shrink-0 space-y-0.5">
                        <div className="flex items-center gap-2 justify-end text-[11px]">
                          <span className="text-sky-400">{formatLatency(item.avgLatencyMs)}</span>
                          <span className={`text-[10px] px-1 rounded ${item.packetLossPercent > 0 ? 'bg-rose-500/20 text-rose-300' : 'text-emerald-400'}`}>
                            {item.packetLossPercent.toFixed(0)}% loss
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block">
                          {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedRecordDetail({ type: 'ping', data: item });
                          }}
                          title="View session details"
                          className="p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            void handleDeleteRecord('ping', item.id);
                          }}
                          title="Delete ping session"
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // Connections
              return (
                <div
                  key={item.id || idx}
                  onClick={() => setSelectedRecordDetail({ type: 'connections', data: item })}
                  className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-800/30 transition-colors gap-2 cursor-pointer group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-100 text-[11px] truncate">{item.processName}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">PID {item.pid}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 truncate block mt-0.5 font-mono">
                      {item.localAddress}:{item.localPort} → {item.remoteAddress || '*'}:{item.remotePort || '*'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right font-mono shrink-0 space-y-0.5">
                      <div className="flex items-center gap-2 justify-end text-[11px]">
                        <span className="text-sky-400 font-semibold">{item.protocol}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                          item.state === 'ESTABLISHED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : item.state === 'LISTENING'
                            ? 'bg-sky-500/20 text-sky-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {item.state}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedRecordDetail({ type: 'connections', data: item });
                      }}
                      title="View socket details"
                      className="p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls Footer */}
        <div className="px-3 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="text-[10px] text-slate-500 font-mono">
              Total {sortedData.length} records
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: Record Detail Inspector */}
      <AnimatePresence>
        {selectedRecordDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-4 shadow-2xl space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-400" />
                  <h3 className="font-semibold text-xs text-slate-100">
                    Record Inspector • {selectedRecordDetail.type.toUpperCase()}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedRecordDetail(null)}
                  className="p-1 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Key-Value Properties */}
              <div className="space-y-2 text-xs font-mono max-h-64 overflow-y-auto pr-1">
                {Object.entries(selectedRecordDetail.data).map(([k, val]) => {
                  let displayVal = String(val);
                  if (typeof val === 'number') {
                    if (k.toLowerCase().includes('bytes')) {
                      displayVal = `${formatBytes(val)} (${val.toLocaleString()} bytes)`;
                    } else if (k.toLowerCase().includes('latency') || k.toLowerCase().includes('jitter')) {
                      displayVal = `${val.toFixed(2)} ms`;
                    } else if (k.toLowerCase().includes('time') || k.toLowerCase().includes('seen')) {
                      displayVal = `${new Date(val).toLocaleString()} (${val})`;
                    }
                  } else if (typeof val === 'object' && val !== null) {
                    displayVal = JSON.stringify(val);
                  }

                  return (
                    <div key={k} className="p-2 rounded bg-slate-950/70 border border-slate-800/80 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans uppercase">
                        <span>{k}</span>
                        <button
                          onClick={() => copyToClipboard(displayVal, k)}
                          className="hover:text-sky-400 transition-colors"
                        >
                          {copiedKey === k ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <span className="text-slate-200 text-[11px] break-all">{displayVal}</span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    const id = selectedRecordDetail.data.id || selectedRecordDetail.data.appKey;
                    if (id) {
                      void handleDeleteRecord(selectedRecordDetail.type, id);
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs hover:bg-rose-600/30 font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Record</span>
                </button>

                <button
                  onClick={() => setSelectedRecordDetail(null)}
                  className="px-3 py-1 rounded bg-slate-800 text-slate-200 text-xs hover:bg-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Custom Date Range Picker */}
      <AnimatePresence>
        {showCustomDateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          >
            <form
              onSubmit={handleApplyCustomDates}
              className="w-full max-w-xs rounded-xl bg-slate-900 border border-slate-700 p-3.5 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="font-semibold text-xs text-slate-100 flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-sky-400" />
                  <span>Select Custom Date Range</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCustomDateModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-sans mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-sans mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomDateModal(false)}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium cursor-pointer"
                >
                  Apply Filter
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Date Range Delete / Prune */}
      <AnimatePresence>
        {showDateRangeDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-xs rounded-xl bg-slate-900 border border-amber-600/40 p-3.5 shadow-2xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="font-semibold text-xs text-amber-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>Prune Historical Range</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDateRangeDeleteModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Permanently delete all traffic entries between the selected start and end dates.
              </p>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-sans mb-1">
                    Cutoff Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={pruneStartDate}
                    onChange={e => setPruneStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-sans mb-1">
                    Cutoff End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={pruneEndDate}
                    onChange={e => setPruneEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowDateRangeDeleteModal(false)}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDateRangeDelete}
                  className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium cursor-pointer"
                >
                  Confirm Delete Range
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 4: Clear Category Confirmation Dialog */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-xl border border-rose-500/40 bg-slate-900 p-4 shadow-2xl flex flex-col gap-2.5 text-xs">
              <div className="flex items-center gap-2 text-rose-300 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Purge all {activeCategory} history?</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                This will permanently delete stored database records for{' '}
                <strong className="text-slate-200">{activeCategory}</strong>. Live adapter counters and current session totals will remain intact.
              </p>
              <div className="flex items-center gap-2 justify-end pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClear}
                  className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer"
                >
                  Confirm Purge
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
