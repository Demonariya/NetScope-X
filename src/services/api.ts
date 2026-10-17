import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { normalizePingResult } from '../utils/normalizers';
import {
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
  AppSettings,
} from '../types/network';

export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: {
      core?: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

async function nativeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error(`The "${cmd}" command requires the NetScope X Windows desktop application.`);
  }
  return invoke<T>(cmd, args);
}

async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).trim(); } catch {}
    throw new Error(`Request failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return response.json() as Promise<T>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  monitoring: {
    enabled: true,
    perAppEnabled: true,
    adapterId: 'auto',
    updateIntervalMs: 1000,
    showInactiveApps: true,
    groupByExe: true,
  },
  diagnostics: {
    pingTargets: [
      { id: 'cf', name: 'Cloudflare', host: '1.1.1.1' },
      { id: 'gg', name: 'Google DNS', host: '8.8.8.8' },
      { id: 'q9', name: 'Quad9', host: '9.9.9.9' },
    ],
    activePingTarget: '1.1.1.1',
    pingIntervalMs: 2000,
    pingTimeoutMs: 1500,
    mode: 'tcp',
  },
  startup: {
    startWithWindows: false,
    launchMinimized: false,
    minimizeToTrayOnClose: true,
    keepMonitoringInTray: true,
    showTraySpeedTooltip: true,
  },
  storage: {
    dataRetentionDays: 30,
    autoPrune: true,
  },
  appearance: {
    theme: 'dark',
    accentColor: '#38bdf8',
    defaultCanvasMode: 'portrait_9_16',
    chartStyle: 'area',
  },
};

export const api = {
  async getAdapters(): Promise<NetworkAdapter[]> {
    if (isTauri) return nativeCommand<NetworkAdapter[]>('get_network_adapters');
    return httpJson<NetworkAdapter[]>('/api/network/adapters');
  },

  async getLiveStats(adapterId = 'auto'): Promise<NetworkStats> {
    if (isTauri) {
      return nativeCommand<NetworkStats>('get_live_network_stats', { adapterId });
    }
    return httpJson<NetworkStats>(`/api/network/live-stats?adapterId=${encodeURIComponent(adapterId)}`);
  },

  async getPing(target?: string): Promise<PingResult> {
    const host = target?.trim() || '1.1.1.1';
    if (isTauri) {
      const result = await nativeCommand<unknown>('ping_target', { target: host });
      return normalizePingResult(result, host);
    }
    const result = await httpJson<unknown>(`/api/network/ping?target=${encodeURIComponent(host)}`);
    return normalizePingResult(result, host);
  },

  async getProcesses(): Promise<ProcessNetworkUsage[]> {
    if (isTauri) return nativeCommand<ProcessNetworkUsage[]>('get_process_network_usage');
    return httpJson<ProcessNetworkUsage[]>('/api/processes');
  },

  async resetProcessStats(pid?: number): Promise<{ success: boolean }> {
    if (isTauri) {
      const success = await nativeCommand<boolean>('reset_process_stats', { pid });
      if (!success) throw new Error('The native backend did not confirm the reset.');
      return { success };
    }
    return httpJson('/api/processes/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid }),
    });
  },

  async toggleBlockProcess(exeName: string, block: boolean, pid?: number): Promise<{ success: boolean; isBlocked: boolean; exeName: string }> {
    if (isTauri) {
      const success = await nativeCommand<boolean>('toggle_process_block', { exeName, block, pid });
      if (!success) throw new Error('Windows Firewall did not confirm the requested change.');
      return { success, isBlocked: block, exeName };
    }
    return httpJson('/api/processes/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exeName, block, pid }),
    });
  },

  async getConnections(): Promise<SocketConnection[]> {
    if (isTauri) return nativeCommand<SocketConnection[]>('get_active_connections');
    return httpJson<SocketConnection[]>('/api/network/connections');
  },

  async getHistory(range: 'today' | '7d' | '30d' | 'all' = 'today'): Promise<TrafficHistoryRecord[]> {
    if (isTauri) return nativeCommand<TrafficHistoryRecord[]>('get_traffic_history', { range });
    return httpJson<TrafficHistoryRecord[]>(`/api/history?range=${encodeURIComponent(range)}`);
  },

  async getSettings(): Promise<AppSettings> {
    if (isTauri) return nativeCommand<AppSettings>('get_settings');
    return httpJson<AppSettings>('/api/settings');
  },

  async saveSettings(settings: AppSettings): Promise<{ success: boolean }> {
    if (isTauri) {
      const success = await nativeCommand<boolean>('save_settings', { settings });
      if (!success) throw new Error('The native backend did not confirm saving settings.');
      return { success };
    }
    return httpJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },

  async resetHistory(): Promise<{ success: boolean }> {
    if (isTauri) {
      const success = await nativeCommand<boolean>('clear_history');
      if (!success) throw new Error('The native backend did not confirm clearing history.');
      return { success };
    }
    return httpJson('/api/settings/reset-history', { method: 'POST' });
  },

  async triggerTrayAction(action: 'minimize' | 'restore' | 'hide' | 'toggle_monitor' | 'quit'): Promise<{ success: boolean; state?: string }> {
    if (isTauri) {
      const success = await nativeCommand<boolean>('system_tray_action', { action });
      if (!success) throw new Error(`The native backend did not complete tray action "${action}".`);
      return { success, state: action };
    }
    return httpJson('/api/tray/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
  },

  async setMonitoringEnabled(enabled: boolean): Promise<boolean> {
    return nativeCommand<boolean>('set_monitoring_enabled', { enabled });
  },

  async minimizeWindow(): Promise<void> {
    if (!isTauri) throw new Error('Window controls are available only in the desktop application.');
    await getCurrentWindow().minimize();
  },

  async hideWindow(): Promise<void> {
    if (!isTauri) throw new Error('The system tray is available only in the desktop application.');
    await getCurrentWindow().hide();
  },

  async restoreWindow(): Promise<void> {
    if (!isTauri) throw new Error('Window controls are available only in the desktop application.');
    const window = getCurrentWindow();
    await window.show();
    await window.unminimize();
    await window.setFocus();
  },

  async exitApp(): Promise<void> {
    await nativeCommand<void>('exit_app');
  },
};
