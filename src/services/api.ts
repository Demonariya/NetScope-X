import { invoke } from '@tauri-apps/api/core';
import { normalizePingResult } from '../utils/normalizers';
import {
  NetworkAdapter,
  NetworkStats,
  PingResult,
  ProcessNetworkUsage,
  SocketConnection,
  TrafficHistoryRecord,
  HistoryRange,
  AppSettings,
} from '../types/network';
import {
  BandwidthConfig,
  BandwidthLimitRule,
  BandwidthProfile,
  BandwidthCapabilities,
} from '../types/bandwidth';

import { webSimulation, SIMULATED_ADAPTERS } from './webSimulation';

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

async function handleWebSimulation<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'get_network_adapters':
      return Promise.resolve(webSimulation.getAdapters() as unknown as T);
    case 'get_live_network_stats':
      return Promise.resolve(
        webSimulation.getLiveStats((args?.adapterId as string) || 'auto') as unknown as T
      );
    case 'ping_target':
      return Promise.resolve(
        webSimulation.getPing(
          (args?.target as string) || '1.1.1.1',
          (args?.timeout_ms as number) || (args?.timeoutMs as number) || 2000
        ) as unknown as T
      );
    case 'get_process_network_usage':
      return Promise.resolve(webSimulation.getProcesses() as unknown as T);
    case 'get_active_connections':
      return Promise.resolve(webSimulation.getConnections() as unknown as T);
    case 'toggle_process_block':
      if (args?.exeName) {
        webSimulation.toggleBlock(args.exeName as string, Boolean(args.block));
      }
      return Promise.resolve(true as unknown as T);
    case 'reset_process_stats':
      webSimulation.resetProcessStats(args?.pid as number | undefined);
      return Promise.resolve(true as unknown as T);
    case 'get_traffic_history':
      return Promise.resolve(
        webSimulation.getHistory(
          (args?.range as HistoryRange) || 'today',
          args?.customStart as string | undefined,
          args?.customEnd as string | undefined,
          args?.interfaceFilter as string | undefined
        ) as unknown as T
      );
    case 'export_traffic_history':
      return Promise.resolve(
        webSimulation.exportHistory(
          (args?.format as 'csv' | 'json') || 'csv',
          (args?.range as HistoryRange) || 'today',
          args?.customStart as string | undefined,
          args?.customEnd as string | undefined,
          args?.interfaceFilter as string | undefined
        ) as unknown as T
      );
    case 'get_settings':
      return Promise.resolve(webSimulation.getSettings() as unknown as T);
    case 'save_settings':
      if (args?.settings) webSimulation.saveSettings(args.settings as AppSettings);
      return Promise.resolve(true as unknown as T);
    case 'reset_network_session_stats':
      webSimulation.resetSession();
      return Promise.resolve(true as unknown as T);
    case 'clear_history':
      webSimulation.clearHistory();
      return Promise.resolve(true as unknown as T);
    case 'system_tray_action':
      return Promise.resolve(true as unknown as T);
    case 'set_monitoring_enabled':
      webSimulation.setMonitoring(Boolean(args?.enabled));
      return Promise.resolve(true as unknown as T);
    case 'exit_app':
      return Promise.resolve(undefined as unknown as T);
    case 'get_bandwidth_capabilities':
      return Promise.resolve(webSimulation.getBandwidthCapabilities() as unknown as T);
    case 'get_bandwidth_config':
      return Promise.resolve(webSimulation.getBandwidthConfig() as unknown as T);
    case 'apply_global_bandwidth_limit':
      return Promise.resolve(
        webSimulation.applyGlobalBandwidthLimit(
          args?.downloadLimitBps as number | undefined,
          args?.uploadLimitBps as number | undefined,
          Boolean(args?.downloadEnabled),
          Boolean(args?.uploadEnabled),
          args?.adapterAlias as string | undefined
        ) as unknown as T
      );
    case 'apply_app_bandwidth_limit':
      return Promise.resolve(
        webSimulation.applyAppBandwidthLimit(args?.rule as BandwidthLimitRule) as unknown as T
      );
    case 'remove_bandwidth_limit':
      return Promise.resolve(
        webSimulation.removeBandwidthLimit(
          args?.targetType as string,
          args?.targetIdentifier as string
        ) as unknown as T
      );
    case 'reset_all_bandwidth_limits':
      return Promise.resolve(webSimulation.resetAllBandwidthLimits() as unknown as T);
    case 'save_bandwidth_profile':
      return Promise.resolve(
        webSimulation.saveBandwidthProfile(args?.profile as BandwidthProfile) as unknown as T
      );
    case 'apply_bandwidth_profile':
      return Promise.resolve(
        webSimulation.applyBandwidthProfile(args?.profileId as string) as unknown as T
      );
    default:
      return Promise.resolve({} as unknown as T);
  }
}

async function nativeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    return handleWebSimulation<T>(cmd, args);
  }
  return invoke<T>(cmd, args);
}

async function runNativeWindowAction(action: 'minimize' | 'restore' | 'hide'): Promise<void> {
  const success = await nativeCommand<boolean>('system_tray_action', { action });
  if (!success) throw new Error(`The native backend did not complete window action "${action}".`);
}

export const DEFAULT_SETTINGS: AppSettings = {
  monitoring: {
    enabled: true,
    perAppEnabled: true,
    adapterId: 'auto',
    updateIntervalMs: 1000,
  },
  diagnostics: {
    activePingTarget: '1.1.1.1',
    pingIntervalMs: 2000,
  },
  startup: {
    startWithWindows: false,
    minimizeToTrayOnClose: true,
  },
  storage: {
    dataRetentionDays: 30,
  },
  appearance: {
    theme: 'dark',
    accentColor: '#38bdf8',
  },
};

export const api = {
  async getAdapters(): Promise<NetworkAdapter[]> {
    return nativeCommand<NetworkAdapter[]>('get_network_adapters');
  },

  async getLiveStats(adapterId = 'auto'): Promise<NetworkStats> {
    return nativeCommand<NetworkStats>('get_live_network_stats', { adapterId });
  },

  async getPing(target?: string, timeoutMs = 2000): Promise<PingResult> {
    const host = target?.trim() || '1.1.1.1';
    const result = await nativeCommand<unknown>('ping_target', {
      target: host,
      timeout_ms: timeoutMs,
    });
    return normalizePingResult(result, host);
  },

  async getProcesses(): Promise<ProcessNetworkUsage[]> {
    return nativeCommand<ProcessNetworkUsage[]>('get_process_network_usage');
  },

  async resetProcessStats(pid?: number): Promise<{ success: boolean }> {
    if (!isTauri) {
      webSimulation.resetProcessStats(pid);
      return { success: true };
    }
    const success = await nativeCommand<boolean>('reset_process_stats', { pid });
    if (!success) throw new Error('The native backend did not confirm the reset.');
    return { success };
  },

  async toggleBlockProcess(exeName: string, block: boolean, pid?: number): Promise<{ success: boolean; isBlocked: boolean; exeName: string }> {
    if (!isTauri) {
      return webSimulation.toggleBlock(exeName, block);
    }
    const success = await nativeCommand<boolean>('toggle_process_block', { exeName, block, pid });
    if (!success) throw new Error('Windows Firewall did not confirm the requested change.');
    return { success, isBlocked: block, exeName };
  },

  async getConnections(): Promise<SocketConnection[]> {
    return nativeCommand<SocketConnection[]>('get_active_connections');
  },

  async getHistory(
    range: HistoryRange = 'today',
    customStart?: string,
    customEnd?: string,
    interfaceFilter?: string
  ): Promise<TrafficHistoryRecord[]> {
    return nativeCommand<TrafficHistoryRecord[]>('get_traffic_history', {
      range,
      customStart,
      customEnd,
      interfaceFilter,
    });
  },

  async exportHistory(
    format: 'csv' | 'json',
    range: HistoryRange = 'today',
    customStart?: string,
    customEnd?: string,
    interfaceFilter?: string
  ): Promise<string> {
    return nativeCommand<string>('export_traffic_history', {
      format,
      range,
      customStart,
      customEnd,
      interfaceFilter,
    });
  },

  async getSettings(): Promise<AppSettings> {
    return nativeCommand<AppSettings>('get_settings');
  },

  async saveSettings(settings: AppSettings): Promise<{ success: boolean }> {
    const success = await nativeCommand<boolean>('save_settings', { settings });
    if (!success) throw new Error('The native backend did not confirm saving settings.');
    return { success };
  },

  async resetNetworkSessionStats(): Promise<boolean> {
    const success = await nativeCommand<boolean>('reset_network_session_stats');
    if (!success) throw new Error('The native backend did not confirm resetting session counters.');
    return true;
  },

  async resetHistory(): Promise<{ success: boolean }> {
    const success = await nativeCommand<boolean>('clear_history');
    if (!success) throw new Error('The native backend did not confirm clearing history.');
    return { success };
  },

  async triggerTrayAction(action: 'minimize' | 'restore' | 'hide' | 'toggle_monitor' | 'quit'): Promise<{ success: boolean; state?: string }> {
    const success = await nativeCommand<boolean>('system_tray_action', { action });
    if (!success) throw new Error(`The native backend did not complete tray action "${action}".`);
    return { success, state: action };
  },

  async setMonitoringEnabled(enabled: boolean): Promise<boolean> {
    return nativeCommand<boolean>('set_monitoring_enabled', { enabled });
  },

  async minimizeWindow(): Promise<void> {
    await runNativeWindowAction('minimize');
  },

  async hideWindow(): Promise<void> {
    await runNativeWindowAction('hide');
  },

  async restoreWindow(): Promise<void> {
    await runNativeWindowAction('restore');
  },

  async exitApp(): Promise<void> {
    await nativeCommand<void>('exit_app');
  },

  // Bandwidth Control APIs
  async getBandwidthCapabilities(): Promise<BandwidthCapabilities> {
    return nativeCommand<BandwidthCapabilities>('get_bandwidth_capabilities');
  },

  async getBandwidthConfig(): Promise<BandwidthConfig> {
    return nativeCommand<BandwidthConfig>('get_bandwidth_config');
  },

  async applyGlobalBandwidthLimit(
    downloadLimitBps?: number,
    uploadLimitBps?: number,
    downloadEnabled = false,
    uploadEnabled = false,
    adapterAlias = 'auto'
  ): Promise<BandwidthLimitRule> {
    return nativeCommand<BandwidthLimitRule>('apply_global_bandwidth_limit', {
      downloadLimitBps,
      uploadLimitBps,
      downloadEnabled,
      uploadEnabled,
      adapterAlias,
    });
  },

  async applyAppBandwidthLimit(rule: BandwidthLimitRule): Promise<BandwidthLimitRule> {
    return nativeCommand<BandwidthLimitRule>('apply_app_bandwidth_limit', {
      rule,
      name: rule.name,
      targetType: rule.targetType,
      targetIdentifier: rule.targetIdentifier,
      appPath: rule.appPath,
      pid: rule.pid,
      downloadLimitBps: rule.downloadLimitBps,
      uploadLimitBps: rule.uploadLimitBps,
      downloadEnabled: rule.downloadEnabled,
      uploadEnabled: rule.uploadEnabled,
      priority: rule.priority,
      isGroupRule: rule.isGroupRule,
    });
  },

  async removeBandwidthLimit(targetType: string, targetIdentifier: string): Promise<boolean> {
    return nativeCommand<boolean>('remove_bandwidth_limit', {
      targetType,
      targetIdentifier,
    });
  },

  async resetAllBandwidthLimits(): Promise<boolean> {
    return nativeCommand<boolean>('reset_all_bandwidth_limits');
  },

  async saveBandwidthProfile(profile: BandwidthProfile): Promise<BandwidthProfile> {
    return nativeCommand<BandwidthProfile>('save_bandwidth_profile', { profile });
  },

  async applyBandwidthProfile(profileId: string): Promise<BandwidthConfig> {
    return nativeCommand<BandwidthConfig>('apply_bandwidth_profile', { profileId });
  },

  toggleBandwidthPause(paused?: boolean): boolean {
    if (!isTauri) {
      return webSimulation.toggleBandwidthPause(paused);
    }
    return false;
  },
};
