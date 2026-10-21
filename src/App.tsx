import React, { useState, useEffect, useRef } from 'react';
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
  AdapterDiscoveryStatus,
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
    try { localStorage.setItem('netscope_theme', theme); } catch { /* Preferences are optional. */ }

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
  const [adapterDiscoveryStatus, setAdapterDiscoveryStatus] = useState<AdapterDiscoveryStatus>('loading');
  const [selectedAdapterId, setSelectedAdapterId] = useState<string>('auto');
  const [liveStats, setLiveStats] = useState<NetworkStats | null>(null);
  const [activePingTarget, setActivePingTarget] = useState<string>('1.1.1.1');
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const pingAttemptsRef = useRef<{ target: string; status: PingResult['status']; latencyMs: number }[]>([]);
  const [processes, setProcesses] = useState<ProcessNetworkUsage[]>([]);
  const [connections, setConnections] = useState<SocketConnection[]>([]);
  const [history, setHistory] = useState<TrafficHistoryRecord[]>([]);
  const [historyRange, setHistoryRange] = useState<'today' | '7d' | '30d' | 'all'>('today');
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

  // Aggregate actual ICMP ping probes; failed attempts are not treated as 0 ms.
  const recordPingAttempt = (result: PingResult) => {
    const previous = pingAttemptsRef.current;
    const sameTarget = previous.length > 0 && previous[previous.length - 1].target === result.target;
    const attempts = [
      ...(sameTarget ? previous : []),
      { target: result.target, status: result.status, latencyMs: result.latencyMs },
    ].slice(-20);
    pingAttemptsRef.current = attempts;
    const successful = attempts
      .filter(attempt => attempt.status === 'success' && Number.isFinite(attempt.latencyMs))
      .map(attempt => attempt.latencyMs);
    const jitter = successful.length > 1
      ? successful.slice(1).reduce((sum, value, index) => sum + Math.abs(value - successful[index]), 0) / (successful.length - 1)
      : 0;
    const failures = attempts.length
      ? (attempts.filter(attempt => attempt.status !== 'success').length / attempts.length) * 100
      : 0;
    setPingResult({
      ...result,
      minLatencyMs: successful.length ? Math.min(...successful) : 0,
      maxLatencyMs: successful.length ? Math.max(...successful) : 0,
      avgLatencyMs: successful.length ? successful.reduce((sum, value) => sum + value, 0) / successful.length : 0,
      jitterMs: jitter,
      packetLossPercent: failures,
      history: successful,
    });
  };

  // Initial Data Fetch — a failed subsystem must not fabricate data or block other tabs.
  useEffect(() => {
    async function init() {
      if (!isTauri) {
        setAdapterDiscoveryStatus('desktop-required');
        setSettings(DEFAULT_SETTINGS);
        setIsMonitoring(false);
        addToast('Windows Desktop Runtime Required', 'Live telemetry is available only in the packaged Tauri app. Demo data is disabled.', 'info');
        return;
      }

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

      const adapterRequest = api.getAdapters().then(found => {
        setAdapterDiscoveryStatus(found.length > 0 ? 'available' : 'empty');
        return found;
      }).catch(error => {
        setAdapterDiscoveryStatus('error');
        throw error;
      });

      const [adp, st, png, procs, hist, cfg] = await Promise.all([
        safeLoad<NetworkAdapter[]>(adapterRequest, [], 'Network adapters'),
        safeLoad<NetworkStats | null>(api.getLiveStats(selectedAdapterId), null, 'Network counters'),
        safeLoad<PingResult | null>(api.getPing(), null, 'Ping probe'),
        safeLoad<ProcessNetworkUsage[]>(api.getProcesses(), [], 'Process list'),
        safeLoad<TrafficHistoryRecord[]>(api.getHistory('today'), [], 'Traffic history'),
        safeLoad<AppSettings>(api.getSettings(), DEFAULT_SETTINGS, 'Settings'),
      ]);

      setAdapters(adp);
      setLiveStats(st);
      if (png) recordPingAttempt(png);
      else setPingResult(null);
      setProcesses(procs);
      setConnections(procs.flatMap(process => process.connections ?? []));
      setHistory(hist);
      const savedAdapterId = cfg.monitoring.adapterId || 'auto';
      const resolvedAdapterId =
        savedAdapterId === 'auto' || adp.some(adapter => adapter.id === savedAdapterId)
          ? savedAdapterId
          : 'auto';
      const effectiveConfig =
        cfg.monitoring.adapterId === resolvedAdapterId
          ? cfg
          : { ...cfg, monitoring: { ...cfg.monitoring, adapterId: resolvedAdapterId } };

      setSettings(effectiveConfig);
      setSelectedAdapterId(resolvedAdapterId);
      setIsMonitoring(effectiveConfig.monitoring.enabled);

      if (effectiveConfig !== cfg) {
        void api.saveSettings(effectiveConfig).catch(error => {
          addToast(
            'Adapter Preference Not Saved',
            error instanceof Error ? error.message : String(error),
            'error'
          );
        });
      }

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

  // Sample interface counters frequently, but never let slow OS queries overlap.
  useEffect(() => {
    if (!isTauri || !isMonitoring) return;

    let inFlight = false;
    let cancelled = false;
    let adapterRecoveryInFlight = false;
    let statsQueryFailureNotified = false;
    const pollStats = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const stats = await api.getLiveStats(selectedAdapterId);
        if (cancelled) return;
        statsQueryFailureNotified = false;
        setLiveStats(stats);
        setSpeedHistory(prev => {
          const time = formatTime(stats.timestamp);
          return [...prev, { time, downBps: stats.downloadBps, upBps: stats.uploadBps }].slice(-120);
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const selectedInterfaceDisappeared =
          selectedAdapterId !== 'auto' &&
          /Selected interface .* no longer exists/i.test(detail);

        if (!selectedInterfaceDisappeared) {
          console.error('Network counter sample failed:', error);
          if (!cancelled && !statsQueryFailureNotified) {
            statsQueryFailureNotified = true;
            addToast('Network Monitoring Unavailable', detail, 'error');
          }
          return;
        }
        if (adapterRecoveryInFlight) {
          console.warn('Skipping duplicate adapter recovery while the previous attempt is active.');
          return;
        }

        adapterRecoveryInFlight = true;
        try {
          const discovered = await api.getAdapters();
          if (cancelled) return;
          setAdapters(discovered);
          setAdapterDiscoveryStatus(discovered.length > 0 ? 'available' : 'empty');

          if (discovered.some(adapter => adapter.id === selectedAdapterId)) {
            console.warn('Selected adapter is still present, but its counters could not be read:', error);
            return;
          }

          const lostAdapterId = selectedAdapterId;
          setSelectedAdapterId('auto');
          setLiveStats(null);
          setSpeedHistory([]);
          setSettings(prev =>
            prev
              ? { ...prev, monitoring: { ...prev.monitoring, adapterId: 'auto' } }
              : prev
          );

          try {
            const latestSettings = await api.getSettings();
            const updatedSettings = {
              ...latestSettings,
              monitoring: { ...latestSettings.monitoring, adapterId: 'auto' },
            };
            await api.saveSettings(updatedSettings);
            if (!cancelled) setSettings(updatedSettings);
          } catch (saveError) {
            if (!cancelled) {
              addToast(
                'Adapter Preference Not Saved',
                saveError instanceof Error ? saveError.message : String(saveError),
                'error'
              );
            }
          }

          if (!cancelled) {
            addToast(
              'Adapter Disconnected',
              `Selected interface ${lostAdapterId} disappeared. Switched to Auto Select.`,
              'info'
            );
          }
        } catch (recoveryError) {
          console.error('Could not refresh adapters after a stale adapter selection:', recoveryError);
          if (!cancelled) {
            setAdapterDiscoveryStatus('error');
            addToast(
              'Adapter Detection Failed',
              recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
              'error'
            );
          }
        } finally {
          adapterRecoveryInFlight = false;
        }
      } finally {
        inFlight = false;
      }
    };

    const intervalMs = Math.max(500, Math.min(10000, settings?.monitoring.updateIntervalMs || 1000));
    const timer = window.setInterval(() => { void pollStats(); }, intervalMs);
    void pollStats();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isMonitoring, settings?.monitoring.updateIntervalMs, selectedAdapterId]);

  // Process enumeration also gathers each PID's socket list; refresh both from that one query every 4 seconds.
  useEffect(() => {
    if (!isTauri || !isMonitoring) return;

    let inFlight = false;
    let cancelled = false;
    let processQueryFailureNotified = false;
    const refreshProcesses = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const current = await api.getProcesses();
        if (cancelled) return;
        processQueryFailureNotified = false;
        setProcesses(current);
        setConnections(current.flatMap(process => process.connections ?? []));
      } catch (error) {
        console.error('Live process/socket query failed:', error);
        if (!cancelled && !processQueryFailureNotified) {
          processQueryFailureNotified = true;
          addToast(
            'Process / Socket Query Failed',
            error instanceof Error ? error.message : String(error),
            'error'
          );
        }
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => { void refreshProcesses(); }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isTauri, isMonitoring]);

  // The backend refreshes SQLite history while either traffic-related tab is visible.
  useEffect(() => {
    if (!isTauri || (activeTab !== 'traffic' && activeTab !== 'history')) return;
    let inFlight = false;
    let cancelled = false;
    let historyQueryFailureNotified = false;
    const refreshHistory = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const records = await api.getHistory(historyRange);
        if (!cancelled) {
          historyQueryFailureNotified = false;
          setHistory(records);
        }
      } catch (error) {
        console.error('Traffic history refresh failed:', error);
        if (!cancelled && !historyQueryFailureNotified) {
          historyQueryFailureNotified = true;
          addToast(
            'Traffic History Unavailable',
            error instanceof Error ? error.message : String(error),
            'error'
          );
        }
      } finally {
        inFlight = false;
      }
    };
    void refreshHistory();
    const timer = isMonitoring ? window.setInterval(() => { void refreshHistory(); }, 15000) : undefined;
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [isMonitoring, activeTab, historyRange]);

  // ICMP probing runs on a blocking worker, so sample it less often than interface counters.
  useEffect(() => {
    if (!isTauri || !isMonitoring) return;

    let inFlight = false;
    let cancelled = false;
    let pingQueryFailureNotified = false;
    const pollPing = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const result = await api.getPing(activePingTarget);
        if (!cancelled) {
          pingQueryFailureNotified = false;
          recordPingAttempt(result);
        }
      } catch (error) {
        console.error('Ping probe failed:', error);
        if (!cancelled && !pingQueryFailureNotified) {
          pingQueryFailureNotified = true;
          addToast(
            'Ping Probe Failed',
            error instanceof Error ? error.message : String(error),
            'error'
          );
        }
      } finally {
        inFlight = false;
      }
    };

    const intervalMs = Math.max(1000, Math.min(15000, settings?.diagnostics.pingIntervalMs || 2000));
    const timer = window.setInterval(() => { void pollPing(); }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isTauri, isMonitoring, activePingTarget, settings?.diagnostics.pingIntervalMs]);

  // Adapter selection drives live counters and is persisted with Settings.
  const handleSelectAdapter = (id: string) => {
    setSelectedAdapterId(id);
    setLiveStats(null);
    setSpeedHistory([]);
    if (settings) {
      const updated = { ...settings, monitoring: { ...settings.monitoring, adapterId: id } };
      setSettings(updated);
      void api.saveSettings(updated).catch(error => {
        addToast('Adapter Preference Not Saved', error instanceof Error ? error.message : String(error), 'error');
      });
    }
    addToast('Adapter Selected', id === 'auto' ? 'Default Gateway Auto-Routing' : id, 'info');
  };

  // Handle ping target change
  const handleSelectPingTarget = async (target: string) => {
    const cleanTarget = target.trim();
    if (!cleanTarget) return;
    setActivePingTarget(cleanTarget);
    try {
      const res = await api.getPing(cleanTarget);
      recordPingAttempt(res);
      setSettings(prev =>
        prev
          ? {
              ...prev,
              diagnostics: { ...prev.diagnostics, activePingTarget: cleanTarget },
            }
          : prev
      );
      addToast(
        res.status === 'success' ? 'Ping Target Switched' : 'Ping Failed',
        res.status === 'success'
          ? `Target: ${cleanTarget} (${formatLatency(res.latencyMs)})`
          : `ICMP ping to ${cleanTarget} failed (${res.status}).`,
        res.status === 'success' ? 'success' : 'error'
      );
    } catch (error) {
      addToast(
        'Probe Failed',
        error instanceof Error ? error.message : `Could not query ${cleanTarget}`,
        'error'
      );
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
  const handleAccentColorChange = async (color: string) => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    setAccentColor(normalized);
    try {
      localStorage.setItem('netscope_accent_color', normalized);
    } catch {
      // The current session still uses the selected accent when storage is unavailable.
    }
    if (settings) {
      const updated = {
        ...settings,
        appearance: {
          ...settings.appearance,
          accentColor: normalized,
        },
      };
      setSettings(updated);
      try {
        await api.saveSettings(updated);
        addToast('Accent Palette Updated', `Active accent set to ${normalized}`, 'success');
      } catch (error) {
        addToast(
          'Accent Not Saved',
          error instanceof Error ? error.message : String(error),
          'error'
        );
      }
    } else {
      addToast('Accent Palette Updated', `Active accent set to ${normalized}`, 'success');
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
    const requestedAdapterId = settingsToSave.monitoring.adapterId || 'auto';
    setSelectedAdapterId(
      requestedAdapterId === 'auto' || adapters.some(adapter => adapter.id === requestedAdapterId)
        ? requestedAdapterId
        : 'auto'
    );
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
      setHistory(await api.getHistory(historyRange));
      addToast('History Cleared', 'Stored traffic history was deleted.', 'success');
    } catch (error) {
      addToast('History Clear Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  // Native desktop controls — these change the actual Tauri window instead of only showing a toast.
  const handleToggleMonitoring = async () => {
    if (!isTauri) {
      addToast('Windows Desktop Runtime Required', 'Monitoring controls work only in the packaged Tauri app.', 'info');
      return;
    }
    const next = !isMonitoring;
    try {
      await api.setMonitoringEnabled(next);
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

  const isLightEffective =
    theme === 'light' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-center overflow-hidden font-sans p-0 select-none transition-colors duration-200 ${
        isLightEffective ? 'bg-slate-200 text-slate-900' : 'bg-[#070a0f] text-slate-100'
      }`}
    >
      {/* Strict 405 × 720 px, 9:16 Portrait Canvas Frame */}
      <div
        style={{ width: '405px', height: '720px' }}
        className={`max-w-full max-h-[100dvh] aspect-[9/16] flex flex-col overflow-hidden relative shadow-2xl rounded-none sm:rounded-2xl mx-auto border transition-colors duration-200 ${
          isLightEffective
            ? 'bg-white border-slate-300 text-slate-900 shadow-slate-400/40'
            : 'bg-[#0b0f17] border-slate-800/80 text-slate-100 shadow-black/60'
        }`}
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
              adapterDiscoveryStatus={adapterDiscoveryStatus}
              selectedAdapterId={selectedAdapterId}
              onSelectAdapter={handleSelectAdapter}
              liveStats={liveStats}
              activePingTarget={activePingTarget}
              pingResult={pingResult}
              onSelectPingTarget={handleSelectPingTarget}
              speedHistory={speedHistory}
              accentColor={accentColor}
              currentTheme={theme}
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
            <TrafficTab
              history={history}
              processes={processes}
              accentColor={accentColor}
              currentTheme={theme}
            />
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
              historyRange={historyRange}
              onRangeChange={setHistoryRange}
              onClearHistory={handleClearHistory}
              onShowToast={(t, m, type) => addToast(t, m, type ?? 'info')}
              accentColor={accentColor}
              currentTheme={theme}
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
