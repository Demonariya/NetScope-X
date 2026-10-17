import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './components/layout/TitleBar';
import { Navigation, TabType } from './components/layout/Navigation';
import { OverviewTab } from './components/overview/OverviewTab';
import { ApplicationsTab } from './components/applications/ApplicationsTab';
import { TrafficTab } from './components/traffic/TrafficTab';
import { ConnectionsTab } from './components/connections/ConnectionsTab';
import { HistoryTab } from './components/history/HistoryTab';
import { SettingsTab } from './components/settings/SettingsTab';
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
import { api, DEFAULT_SETTINGS, isTauri } from './services/api';
import { formatTime, formatLatency } from './utils/formatters';
import { DEFAULT_ACCENT_COLOR, getAccentCssVariables, normalizeHexColor } from './utils/appearance';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isMonitoring, setIsMonitoring] = useState(true);

  // Theme state: dark | light | system
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    try {
      const saved = localStorage.getItem('netscope_theme');
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    } catch {
      // Storage may be unavailable in restricted webview contexts.
    }
    return 'dark';
  });
  const [accentColor, setAccentColor] = useState<string>(() => {
    try {
      return normalizeHexColor(localStorage.getItem('netscope_accent_color')) ?? DEFAULT_ACCENT_COLOR;
    } catch {
      return DEFAULT_ACCENT_COLOR;
    }
  });

  // Apply theme to DOM
  useEffect(() => {
    const applyTheme = () => {
      let effective = theme;
      if (theme === 'system') {
        effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      const root = document.documentElement;
      const body = document.body;
      if (effective === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
        body?.classList.add('light');
        body?.classList.remove('dark');
        body?.setAttribute('data-theme', 'light');
      } else {
        root.classList.add('dark');
        root.classList.remove('light');
        root.setAttribute('data-theme', 'dark');
        body?.classList.add('dark');
        body?.classList.remove('light');
        body?.setAttribute('data-theme', 'dark');
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

  // Apply the selected accent to Tailwind's runtime sky color tokens.
  useEffect(() => {
    const root = document.documentElement;
    for (const [property, value] of Object.entries(getAccentCssVariables(accentColor))) {
      root.style.setProperty(property, value);
    }
  }, [accentColor]);

  // Keep React synchronized with the real native tray's monitoring toggle.
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<boolean>('monitoring-toggled', event => setIsMonitoring(event.payload))
      .then(stop => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(error => console.warn('Could not listen for tray monitoring events:', error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Core telemetry state
  const [adapters, setAdapters] = useState<NetworkAdapter[]>([]);
  const [selectedAdapterId, setSelectedAdapterId] = useState<string>('auto');
  const [liveStats, setLiveStats] = useState<NetworkStats | null>(null);
  const [activePingTarget, setActivePingTarget] = useState<string>('1.1.1.1');
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

  // Initial Data Fetch — a failed subsystem must not fabricate data or block other tabs.
  useEffect(() => {
    async function init() {
      const safeLoad = async <T,>(operation: Promise<T>, fallback: T, label: string): Promise<T> => {
        try {
          return await operation;
        } catch (error) {
          console.error(`${label} load failed:`, error);
          const detail = error instanceof Error ? error.message : String(error);
          addToast(`${label} unavailable`, detail, 'error');
          return fallback;
        }
      };

      const [adp, st, png, procs, conns, hist, cfg] = await Promise.all([
        safeLoad<NetworkAdapter[]>(api.getAdapters(), [], 'Network adapters'),
        safeLoad<NetworkStats | null>(api.getLiveStats(selectedAdapterId), null, 'Network counters'),
        safeLoad<PingResult | null>(api.getPing(), null, 'Ping probe'),
        safeLoad<ProcessNetworkUsage[]>(api.getProcesses(), [], 'Process list'),
        safeLoad<SocketConnection[]>(api.getConnections(), [], 'Network sockets'),
        safeLoad<TrafficHistoryRecord[]>(api.getHistory('today'), [], 'Traffic history'),
        safeLoad<AppSettings>(api.getSettings(), DEFAULT_SETTINGS, 'Settings'),
      ]);

      setAdapters(adp);
      setLiveStats(st);
      setPingResult(png);
      setProcesses(procs);
      setConnections(conns);
      setHistory(hist);
      setSettings(cfg);
      setIsMonitoring(cfg.monitoring.enabled);

      let storedAccent: string | null = null;
      let localSavedTheme: string | null = null;
      try {
        storedAccent = normalizeHexColor(localStorage.getItem('netscope_accent_color'));
        localSavedTheme = localStorage.getItem('netscope_theme');
      } catch {
        // Persisted appearance preferences are optional; runtime defaults remain usable.
      }
      const configuredAccent = normalizeHexColor(cfg.appearance?.accentColor);
      if (!storedAccent && configuredAccent) setAccentColor(configuredAccent);
      if (cfg.diagnostics?.activePingTarget) setActivePingTarget(cfg.diagnostics.activePingTarget);
      if (cfg.appearance?.theme && !localSavedTheme) setTheme(cfg.appearance.theme);
    }
    void init();
  }, []);

  // Poll actual Windows counters, processes, sockets, and the selected ping target.
  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(async () => {
      const [st, procs, png, conns] = await Promise.all([
        api.getLiveStats(selectedAdapterId).catch(error => {
          console.warn('Network counter sample failed:', error);
          return null;
        }),
        api.getProcesses().catch(error => {
          console.warn('Live process query failed:', error);
          return null;
        }),
        api.getPing(activePingTarget).catch(error => {
          console.warn('Ping probe failed:', error);
          return null;
        }),
        api.getConnections().catch(error => {
          console.warn('Socket query failed:', error);
          return null;
        }),
      ]);

      if (st) {
        setLiveStats(st);
        setSpeedHistory(prev => {
          const nowStr = formatTime(st.timestamp);
          return [...prev, { time: nowStr, downBps: st.downloadBps, upBps: st.uploadBps }].slice(-120);
        });
      }
      if (procs) setProcesses(procs);
      if (png) setPingResult(png);
      if (conns) setConnections(conns);
    }, settings?.monitoring.updateIntervalMs || 1000);

    return () => clearInterval(interval);
  }, [isMonitoring, settings?.monitoring.updateIntervalMs, activePingTarget, selectedAdapterId]);

  // Handle adapter selection
  const handleSelectAdapter = (id: string) => {
    setSelectedAdapterId(id);
    addToast('Adapter Selected', id === 'auto' ? 'Default Gateway Auto-Routing' : id, 'info');
  };

  // Handle ping target change
  const handleSelectPingTarget = async (target: string) => {
    const cleanTarget = target.trim();
    if (!cleanTarget) return;
    setActivePingTarget(cleanTarget);
    try {
      const res = await api.getPing(cleanTarget);
      setPingResult(res);
      setSettings(prev =>
        prev
          ? {
              ...prev,
              diagnostics: { ...prev.diagnostics, activePingTarget: cleanTarget },
            }
          : prev
      );
      addToast('Ping Probe Switched', `Target: ${cleanTarget} (${formatLatency(res.latencyMs)})`, 'success');
    } catch {
      addToast('Probe Failed', `Could not reach ${cleanTarget}`, 'error');
    }
  };

  // Reset measured session counters. Per-process resets are explicitly rejected until native attribution exists.
  const handleResetProcessStats = async (pid?: number) => {
    try {
      await api.resetProcessStats(pid);
      const [updated, stats] = await Promise.all([
        api.getProcesses(),
        api.getLiveStats(selectedAdapterId),
      ]);
      setProcesses(updated);
      setLiveStats(stats);
      addToast('Counters Reset', 'Measured session counters have been reset.', 'success');
    } catch (error) {
      addToast('Reset Unavailable', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Change the real Windows Firewall rule, then verify it against a fresh Windows process query.
  const handleToggleBlock = async (exeName: string, block: boolean, pid?: number) => {
    try {
      await api.toggleBlockProcess(exeName, block, pid);
      const refreshedProcesses = await api.getProcesses();
      setProcesses(refreshedProcesses);

      const target = refreshedProcesses.find(process =>
        pid !== undefined
          ? process.pid === pid
          : process.exeName.toLowerCase() === exeName.toLowerCase()
      );
      if (!target) {
        throw new Error('Windows accepted the request, but the target process was not returned for verification.');
      }
      if (target.isBlocked !== block) {
        throw new Error(
          `Windows Firewall did not confirm that ${exeName} is ${block ? 'blocked' : 'unblocked'}. Check the Windows Firewall service and retry.`
        );
      }

      addToast(
        block ? 'Application Blocked' : 'Application Unblocked',
        block
          ? `Windows Firewall confirmed the block rule for ${exeName}.`
          : `Windows Firewall confirmed network access for ${exeName}.`,
        'success'
      );
    } catch (error) {
      addToast(
        'Firewall Rule Error',
        error instanceof Error ? error.message : `Failed to update rule for ${exeName}`,
        'error'
      );
    }
  };

  // Accent selection is applied immediately and persisted independently so it survives restarts.
  const handleAccentColorChange = (color: string) => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    setAccentColor(normalized);
    try {
      localStorage.setItem('netscope_accent_color', normalized);
    } catch {
      // The current session still uses the selected accent when storage is unavailable.
    }
  };

  // Handle Theme Change
  const handleThemeChange = async (newTheme: 'dark' | 'light' | 'system') => {
    setTheme(newTheme);
    if (!settings) {
      addToast('Theme Updated', `${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode active for this session`, 'info');
      return;
    }

    const updated = {
      ...settings,
      appearance: {
        ...settings.appearance,
        theme: newTheme,
        accentColor,
      },
    };
    setSettings(updated);
    try {
      await api.saveSettings(updated);
      addToast('Theme Updated', `${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode saved`, 'success');
    } catch (error) {
      addToast(
        'Theme Not Saved',
        error instanceof Error ? error.message : String(error),
        'error'
      );
    }
  };

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    void handleThemeChange(next);
  };

  // Save settings
  const handleSaveSettings = async (newSettings: AppSettings) => {
    const normalizedAccent = normalizeHexColor(newSettings.appearance?.accentColor) ?? accentColor;
    const settingsToSave: AppSettings = {
      ...newSettings,
      appearance: { ...newSettings.appearance, accentColor: normalizedAccent },
    };
    setSettings(settingsToSave);
    setAccentColor(normalizedAccent);
    try {
      localStorage.setItem('netscope_accent_color', normalizedAccent);
    } catch {
      // Saving other preferences should still proceed if storage is unavailable.
    }
    await api.saveSettings(settingsToSave);
    setIsMonitoring(settingsToSave.monitoring.enabled);
  };

  // Reset measured network totals without deleting saved traffic history.
  const handleResetSession = async () => {
    try {
      await api.resetNetworkSessionStats();
      setLiveStats(await api.getLiveStats(selectedAdapterId));
      addToast('Session Reset', 'Counters will resume from the next real network sample.', 'success');
    } catch (error) {
      addToast('Session Reset Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Clear persisted real traffic history.
  const handleClearHistory = async () => {
    try {
      await api.resetHistory();
      setHistory(await api.getHistory('today'));
      addToast('History Cleared', 'Stored traffic history was deleted.', 'success');
    } catch (error) {
      addToast('History Clear Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Native desktop controls — these change the actual Tauri window instead of only showing a toast.
  const handleToggleMonitoring = async () => {
    const next = !isMonitoring;
    try {
      if (isTauri) await api.setMonitoringEnabled(next);
      setIsMonitoring(next);
      addToast(next ? 'Monitoring Resumed' : 'Monitoring Paused', next ? 'Live system sampling resumed.' : 'Live system sampling paused.', 'info');
    } catch (error) {
      addToast('Monitoring Control Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleHideToTray = async () => {
    try {
      await api.hideWindow();
    } catch (error) {
      addToast('Hide to Tray Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleMinimize = async () => {
    try {
      await api.minimizeWindow();
    } catch (error) {
      addToast('Minimize Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleClose = async () => {
    try {
      if (settings?.startup?.minimizeToTrayOnClose !== false) {
        await api.hideWindow();
      } else {
        await api.exitApp();
      }
    } catch (error) {
      addToast('Close Failed', error instanceof Error ? error.message : String(error), 'error');
    }
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
          onToggleMonitoring={handleToggleMonitoring}
          onHideToTray={handleHideToTray}
          onMinimize={handleMinimize}
          onClose={handleClose}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          accentColor={accentColor}
        />

        {/* Viewport Content Area with Vertical Scrolling */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative min-h-0 w-full">
          {activeTab === 'overview' && (
            <OverviewTab
              adapters={adapters}
              selectedAdapterId={selectedAdapterId}
              onSelectAdapter={handleSelectAdapter}
              liveStats={liveStats}
              activePingTarget={activePingTarget}
              pingResult={pingResult}
              onSelectPingTarget={handleSelectPingTarget}
              speedHistory={speedHistory}
              accentColor={accentColor}
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
              accentColor={accentColor}
              onAccentColorChange={handleAccentColorChange}
              onSaveSettings={handleSaveSettings}
              onResetSession={handleResetSession}
              onClearHistory={handleClearHistory}
              onShowToast={(t, m, type = 'info') => addToast(t, m, type)}
            />
          )}
        </div>

        {/* Dedicated 9:16 Portrait Bottom Navigation Bar */}
        <Navigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          accentColor={accentColor}
        />
      </div>

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
