import React, { useState, useEffect, useRef } from 'react';
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
  CanvasMode,
} from './types/network';
import { api } from './services/api';
import { formatTime } from './utils/formatters';

export default function App() {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('portrait_9_16');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [isTrayModalOpen, setIsTrayModalOpen] = useState(false);

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
        if (cfg.appearance.defaultCanvasMode) {
          setCanvasMode(cfg.appearance.defaultCanvasMode);
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

  const handleMaximize = () => {
    setCanvasMode(prev => (prev === 'maximized' ? 'portrait_9_16' : 'maximized'));
  };

  const handleClose = () => {
    setIsTrayModalOpen(true);
    addToast('Window Minimized to Tray', 'Monitoring remains active in background', 'info');
  };

  const isPortrait = canvasMode === 'portrait_9_16';

  // Layout container classes based on CanvasMode
  const getContainerClasses = () => {
    switch (canvasMode) {
      case 'portrait_9_16':
        return 'w-full max-w-[460px] h-[92vh] max-h-[880px] rounded-2xl shadow-2xl shadow-black/80 border border-slate-800/80 my-auto';
      case 'standard_desktop':
        return 'w-full max-w-[880px] h-[90vh] max-h-[820px] rounded-xl shadow-2xl shadow-black/80 border border-slate-800/80 my-auto';
      case 'expanded_desktop':
        return 'w-full max-w-[1180px] h-[92vh] max-h-[860px] rounded-xl shadow-2xl shadow-black/80 border border-slate-800/80 my-auto';
      case 'maximized':
        return 'w-full h-screen rounded-none border-0';
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070a0f] flex items-center justify-center overflow-hidden font-sans text-slate-100 p-0 sm:p-2">
      {/* Native Desktop Window Container */}
      <div className={`flex flex-col bg-[#0b0f17] overflow-hidden transition-all duration-300 relative ${getContainerClasses()}`}>
        {/* Windows Custom Title Bar */}
        <TitleBar
          canvasMode={canvasMode}
          onCanvasModeChange={setCanvasMode}
          isMonitoring={isMonitoring}
          onToggleMonitoring={() => setIsMonitoring(!isMonitoring)}
          onOpenTrayModal={() => setIsTrayModalOpen(true)}
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />

        {/* Desktop Top Navigation (when not in portrait bottom-nav mode) */}
        {!isPortrait && (
          <Navigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isPortrait={false}
          />
        )}

        {/* Viewport Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
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
              onSaveSettings={handleSaveSettings}
              onResetSession={handleResetSession}
              onClearHistory={handleClearHistory}
              onShowToast={(t, m) => addToast(t, m, 'success')}
            />
          )}
        </div>

        {/* Portrait Mode Bottom Ergonomic Navigation Bar */}
        {isPortrait && (
          <Navigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isPortrait={true}
          />
        )}
      </div>

      {/* Interactive System Tray Simulation Modal */}
      <SystemTrayModal
        isOpen={isTrayModalOpen}
        onClose={() => setIsTrayModalOpen(false)}
        isMonitoring={isMonitoring}
        onToggleMonitoring={() => setIsMonitoring(!isMonitoring)}
        liveStats={liveStats}
        onOpenSettings={() => setActiveTab('settings')}
        onRestore={() => setCanvasMode('portrait_9_16')}
        onShowToast={(t, m) => addToast(t, m, 'info')}
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
