import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Navigation, TabType } from './components/layout/Navigation';
import { OverviewTab } from './components/overview/OverviewTab';
import { ApplicationsTab } from './components/applications/ApplicationsTab';
import { TrafficTab } from './components/traffic/TrafficTab';
import { ConnectionsTab } from './components/connections/ConnectionsTab';
import { HistoryTab } from './components/history/HistoryTab';
import { SettingsTab } from './components/settings/SettingsTab';
import { SystemTrayModal } from './components/tray/SystemTrayModal';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import {
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
  AppSettings,
} from './types/network';
import { api } from './services/api';
import { formatTime } from './utils/formatters';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [isTrayModalOpen, setIsTrayModalOpen] = useState(false);

  // Theme state: dark | light | system
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    const saved = localStorage.getItem('netscope_theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    return 'dark';
  });

  // Apply theme to DOM
  useEffect(() => {
    const applyTheme = () => {
      let effective = theme;
      if (theme === 'system') {
        effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      const root = document.documentElement;
      if (effective === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
      } else {
        root.classList.add('dark');
        root.classList.remove('light');
        root.setAttribute('data-theme', 'dark');
      }
    };

    applyTheme();
    localStorage.setItem('netscope_theme', theme);

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    }
  }, [theme]);

  // Core telemetry state
  const [adapters, setAdapters] = useState<NetworkAdapter[]>([]);
  const [selectedAdapterId, setSelectedAdapterId] = useState<string>('auto');
  const [liveStats, setLiveStats] = useState<NetworkStats | null>(null);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [processes, setProcesses] = useState<ProcessNetworkUsage[]>([]);
  const [connections, setConnections] = useState<SocketConnection[]>([]);
  const [history, setHistory] = useState<TrafficHistoryRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Rolling speed chart buffer (bounded in-memory)
  const [speedHistory, setSpeedHistory] = useState<{ time: string; downBps: number; upBps: number }[]>([]);

  const addToast = (title: string, message?: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts(prev => [...prev.slice(-4), { id, title, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Initial Data Fetch
  useEffect(() => {
    async function init() {
      try {
        const [adp, st, png, procs, conns, hist, cfg] = await Promise.all([
          api.getAdapters(),
          api.getLiveStats(),
          api.getPing(),
          api.getProcesses(),
          api.getConnections(),
          api.getHistory('today'),
          api.getSettings(),
        ]);
        setAdapters(adp);
        setLiveStats(st);
        setPingResult(png);
        setProcesses(procs);
        setConnections(conns);
        setHistory(hist);
        setSettings(cfg);
        if (cfg?.appearance?.theme) {
          setTheme(cfg.appearance.theme);
        }
      } catch (err) {
        console.error('Initial telemetry load failed:', err);
      }
    }
    init();
  }, []);

  // Continuous Telemetry Polling Loop
  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(async () => {
      try {
        const [st, procs, png] = await Promise.all([
          api.getLiveStats(),
          api.getProcesses(),
          api.getPing(settings?.diagnostics.activePingTarget),
        ]);

        setLiveStats(st);
        setProcesses(procs);
        setPingResult(png);

        // Update rolling chart buffer
        setSpeedHistory(prev => {
          const nowStr = formatTime(st.timestamp);
          const next = [...prev, { time: nowStr, downBps: st.downloadBps, upBps: st.uploadBps }];
          return next.slice(-120); // Keep last 120 seconds
        });
      } catch (err) {
        console.warn('Telemetry cycle warning:', err);
      }
    }, settings?.monitoring.updateIntervalMs || 1000);

    return () => clearInterval(interval);
  }, [isMonitoring, settings?.monitoring.updateIntervalMs, settings?.diagnostics.activePingTarget]);

  // Handle adapter selection
  const handleSelectAdapter = (id: string) => {
    setSelectedAdapterId(id);
    addToast('Adapter Selected', id === 'auto' ? 'Default Gateway Auto-Routing' : id, 'info');
  };

  // Handle ping target change
  const handleSelectPingTarget = async (target: string) => {
    try {
      const res = await api.getPing(target);
      setPingResult(res);
      addToast('Ping Probe Switched', `Target: ${target} (${res.latencyMs.toFixed(1)} ms)`, 'success');
    } catch {
      addToast('Probe Failed', `Could not reach ${target}`, 'error');
    }
  };

  // Reset process stats
  const handleResetProcessStats = async (pid?: number) => {
    await api.resetProcessStats(pid);
    const updated = await api.getProcesses();
    setProcesses(updated);
    addToast('Process Stats Reset', pid ? `PID ${pid} counters cleared` : 'All process counters cleared', 'success');
  };

  // Toggle Block / Unblock process
  const handleToggleBlock = async (exeName: string, block: boolean, pid?: number) => {
    try {
      await api.toggleBlockProcess(exeName, block, pid);
      // Immediately reflect blocked state in UI
      setProcesses(prev =>
        prev.map(p =>
          p.exeName.toLowerCase() === exeName.toLowerCase()
            ? {
                ...p,
                isBlocked: block,
                downloadBps: block ? 0 : p.downloadBps,
                uploadBps: block ? 0 : p.uploadBps,
              }
            : p
        )
      );

      if (block) {
        addToast(
          'Application Blocked',
          `Traffic for ${exeName} blocked via Windows Firewall rule`,
          'error'
        );
      } else {
        addToast(
          'Application Unblocked',
          `Network access restored for ${exeName}`,
          'success'
        );
      }
    } catch {
      addToast('Firewall Rule Error', `Failed to update rule for ${exeName}`, 'error');
    }
  };

  // Handle Theme Change
  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    setTheme(newTheme);
    if (settings) {
      const updated = {
        ...settings,
        appearance: {
          ...settings.appearance,
          theme: newTheme,
        },
      };
      setSettings(updated);
      api.saveSettings(updated);
    }
    addToast('Theme Updated', `${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode active`, 'info');
  };

  // Save settings
  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await api.saveSettings(newSettings);
  };

  // Reset session counters
  const handleResetSession = async () => {
    await api.resetHistory();
    const st = await api.getLiveStats();
    setLiveStats(st);
  };

  // Clear history
  const handleClearHistory = async () => {
    await api.resetHistory();
    const hist = await api.getHistory('today');
    setHistory(hist);
  };

  // Window controls
  const handleMinimize = () => {
    addToast('Minimized to Taskbar', 'NetScope X window hidden', 'info');
  };

  const handleClose = () => {
    setIsTrayModalOpen(true);
    addToast('Window Minimized to Tray', 'Monitoring remains active in background', 'info');
  };

  return (
    <div className="min-h-screen w-full bg-[#070a0f] flex flex-col items-center justify-center overflow-hidden font-sans text-slate-100 p-0 select-none">
      {/* Strict 405 × 720 px, 9:16 Portrait Canvas Frame */}
      <div
        style={{ width: '405px', height: '720px' }}
        className="max-w-full max-h-[100dvh] aspect-[9/16] flex flex-col bg-[#0b0f17] overflow-hidden relative shadow-2xl border border-slate-800/80 rounded-none sm:rounded-2xl mx-auto"
      >
        {/* Native Windows Custom Title Bar */}
        <TitleBar
          isMonitoring={isMonitoring}
          onToggleMonitoring={() => setIsMonitoring(!isMonitoring)}
          onOpenTrayModal={() => setIsTrayModalOpen(true)}
          onMinimize={handleMinimize}
          onClose={handleClose}
        />

        {/* Viewport Content Area with Vertical Scrolling */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative min-h-0 w-full">
          {activeTab === 'overview' && (
            <OverviewTab
              adapters={adapters}
              selectedAdapterId={selectedAdapterId}
              onSelectAdapter={handleSelectAdapter}
              liveStats={liveStats}
              pingResult={pingResult}
              onSelectPingTarget={handleSelectPingTarget}
              speedHistory={speedHistory}
            />
          )}

          {activeTab === 'applications' && (
            <ApplicationsTab
              processes={processes}
              onResetStats={handleResetProcessStats}
              onToggleBlock={handleToggleBlock}
              isMonitoring={isMonitoring}
            />
          )}

          {activeTab === 'traffic' && (
            <TrafficTab history={history} processes={processes} />
          )}

          {activeTab === 'connections' && (
            <ConnectionsTab
              connections={connections}
              onShowToast={(t, m) => addToast(t, m, 'info')}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab
              history={history}
              onClearHistory={handleClearHistory}
              onShowToast={(t, m) => addToast(t, m, 'success')}
            />
          )}

          {activeTab === 'settings' && settings && (
            <SettingsTab
              settings={settings}
              adapters={adapters}
              currentTheme={theme}
              onThemeChange={handleThemeChange}
              onSaveSettings={handleSaveSettings}
              onResetSession={handleResetSession}
              onClearHistory={handleClearHistory}
              onShowToast={(t, m) => addToast(t, m, 'success')}
            />
          )}
        </div>

        {/* Dedicated 9:16 Portrait Bottom Navigation Bar */}
        <Navigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Interactive System Tray Simulation Modal */}
      <SystemTrayModal
        isOpen={isTrayModalOpen}
        onClose={() => setIsTrayModalOpen(false)}
        isMonitoring={isMonitoring}
        onToggleMonitoring={() => setIsMonitoring(!isMonitoring)}
        liveStats={liveStats}
        onOpenSettings={() => setActiveTab('settings')}
        onRestore={() => setIsTrayModalOpen(false)}
        onShowToast={(t, m) => addToast(t, m, 'info')}
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
