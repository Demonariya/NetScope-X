import {
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
  AppSettings,
} from '../types/network';

// Check if running inside Tauri 2 webview
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    if (window.__TAURI__?.core?.invoke) {
      return await window.__TAURI__.core.invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`[Tauri] invoke "${cmd}" fallback to API:`, err);
  }
  return null;
}

export const api = {
  async getAdapters(): Promise<NetworkAdapter[]> {
    if (isTauri) {
      const res = await tauriInvoke<NetworkAdapter[]>('get_network_adapters');
      if (res) return res;
    }
    const res = await fetch('/api/network/adapters');
    if (!res.ok) throw new Error('Failed to fetch network adapters');
    return res.json();
  },

  async getLiveStats(): Promise<NetworkStats> {
    if (isTauri) {
      const res = await tauriInvoke<NetworkStats>('get_live_network_stats');
      if (res) return res;
    }
    const res = await fetch('/api/network/live-stats');
    if (!res.ok) throw new Error('Failed to fetch live stats');
    return res.json();
  },

  async getPing(target?: string): Promise<PingResult> {
    const query = target ? `?target=${encodeURIComponent(target)}` : '';
    if (isTauri) {
      const res = await tauriInvoke<PingResult>('ping_target', { target });
      if (res) return res;
    }
    const res = await fetch(`/api/network/ping${query}`);
    if (!res.ok) throw new Error('Failed to fetch ping probe');
    return res.json();
  },

  async getProcesses(): Promise<ProcessNetworkUsage[]> {
    if (isTauri) {
      const res = await tauriInvoke<ProcessNetworkUsage[]>('get_process_network_usage');
      if (res) return res;
    }
    const res = await fetch('/api/processes');
    if (!res.ok) throw new Error('Failed to fetch process bandwidth usage');
    return res.json();
  },

  async resetProcessStats(pid?: number): Promise<{ success: boolean }> {
    if (isTauri) {
      const res = await tauriInvoke<{ success: boolean }>('reset_process_stats', { pid });
      if (res) return res;
    }
    const res = await fetch('/api/processes/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid }),
    });
    return res.json();
  },

  async toggleBlockProcess(exeName: string, block: boolean, pid?: number): Promise<{ success: boolean; isBlocked: boolean; exeName: string }> {
    if (isTauri) {
      const res = await tauriInvoke<boolean>('toggle_process_block', { exe_name: exeName, block, pid });
      if (res !== null) return { success: true, isBlocked: block, exeName };
    }
    const res = await fetch('/api/processes/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exeName, block, pid }),
    });
    if (!res.ok) throw new Error('Failed to update process firewall rule');
    return res.json();
  },

  async getConnections(): Promise<SocketConnection[]> {
    if (isTauri) {
      const res = await tauriInvoke<SocketConnection[]>('get_active_connections');
      if (res) return res;
    }
    const res = await fetch('/api/network/connections');
    if (!res.ok) throw new Error('Failed to fetch connections');
    return res.json();
  },

  async getHistory(range: 'today' | '7d' | '30d' | 'all' = 'today'): Promise<TrafficHistoryRecord[]> {
    if (isTauri) {
      const res = await tauriInvoke<TrafficHistoryRecord[]>('get_traffic_history', { range });
      if (res) return res;
    }
    const res = await fetch(`/api/history?range=${range}`);
    if (!res.ok) throw new Error('Failed to fetch traffic history');
    return res.json();
  },

  async getSettings(): Promise<AppSettings> {
    if (isTauri) {
      const res = await tauriInvoke<AppSettings>('get_settings');
      if (res) return res;
    }
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async saveSettings(settings: AppSettings): Promise<{ success: boolean }> {
    if (isTauri) {
      const res = await tauriInvoke<{ success: boolean }>('save_settings', { settings });
      if (res) return res;
    }
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return res.json();
  },

  async resetHistory(): Promise<{ success: boolean }> {
    if (isTauri) {
      const res = await tauriInvoke<{ success: boolean }>('clear_history');
      if (res) return res;
    }
    const res = await fetch('/api/settings/reset-history', { method: 'POST' });
    return res.json();
  },

  async triggerTrayAction(action: 'minimize' | 'restore' | 'toggle_monitor' | 'quit'): Promise<{ success: boolean; state?: string }> {
    if (isTauri) {
      const res = await tauriInvoke<{ success: boolean; state?: string }>('system_tray_action', { action });
      if (res) return res;
    }
    const res = await fetch('/api/tray/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    return res.json();
  },
};
