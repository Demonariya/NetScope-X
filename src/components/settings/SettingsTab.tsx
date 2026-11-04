import React, { useState } from 'react';
import {
  Sliders,
  Activity,
  HardDrive,
  Palette,
  Power,
  Save,
  Moon,
  Sun,
  Laptop,
  Check,
} from 'lucide-react';
import { AppSettings, NetworkAdapter } from '../../types/network';
import { ACCENT_PALETTE } from '../../utils/appearance';

interface SettingsTabProps {
  settings: AppSettings;
  adapters: NetworkAdapter[];
  currentTheme: 'dark' | 'light' | 'system';
  onThemeChange: (theme: 'dark' | 'light' | 'system') => void | Promise<void>;
  accentColor?: string;
  onAccentColorChange?: (color: string) => void;
  onSaveSettings: (settings: AppSettings) => void | Promise<void>;
  onResetSession: () => void;
  onClearHistory: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  adapters,
  currentTheme,
  onThemeChange,
  accentColor = '#38bdf8',
  onAccentColorChange,
  onSaveSettings,
  onResetSession,
  onShowToast,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleAccentColorSelect = (color: string) => {
    onAccentColorChange?.(color);
    setLocalSettings(prev => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        accentColor: color,
      },
    }));
    onShowToast('Accent Palette Updated', `Active accent set to ${color}`, 'success');
  };

  const handleThemeSelect = (theme: 'dark' | 'light' | 'system') => {
    void onThemeChange(theme);
    setLocalSettings(prev => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        theme,
      },
    }));
    onShowToast('Theme Mode Updated', `Switched to ${theme} theme`, 'success');
  };

  const handleToggle = async (
    section: 'startup' | 'monitoring',
    key: string,
    label: string,
    onDesc?: string,
    offDesc?: string
  ) => {
    const copy: AppSettings = JSON.parse(JSON.stringify(localSettings));
    const currentVal = (copy[section] as any)[key];
    const nextVal = !currentVal;
    (copy[section] as any)[key] = nextVal;

    setLocalSettings(copy);
    try {
      await onSaveSettings(copy);
      onShowToast(
        `${label} ${nextVal ? 'Enabled' : 'Disabled'}`,
        nextVal ? (onDesc || `${label} is now active.`) : (offDesc || `${label} has been turned off.`),
        'success'
      );
    } catch (error) {
      onShowToast(
        'Failed to Update Setting',
        error instanceof Error ? error.message : String(error),
        'error'
      );
    }
  };

  const handleAdapterChange = async (adapterId: string) => {
    const updated: AppSettings = {
      ...localSettings,
      monitoring: { ...localSettings.monitoring, adapterId },
    };
    setLocalSettings(updated);
    try {
      await onSaveSettings(updated);
      onShowToast(
        'Adapter Bound',
        adapterId === 'auto' ? 'NetScope X will follow default active route' : 'Bound to selected network interface',
        'success'
      );
    } catch (error) {
      onShowToast('Adapter Update Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleRetentionChange = async (days: number) => {
    const updated: AppSettings = {
      ...localSettings,
      storage: { ...localSettings.storage, dataRetentionDays: days },
    };
    setLocalSettings(updated);
    try {
      await onSaveSettings(updated);
      onShowToast(
        'Retention Configured',
        `Traffic records older than ${days} days will be automatically pruned`,
        'success'
      );
    } catch (error) {
      onShowToast('Retention Update Failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleSave = async () => {
    try {
      await onSaveSettings(localSettings);
      onShowToast('Settings Saved', 'All preferences have been persisted', 'success');
    } catch (error) {
      onShowToast(
        'Settings Not Saved',
        error instanceof Error ? error.message : String(error),
        'error'
      );
    }
  };

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* Header and Save Button */}
      <div className={`flex items-center justify-between pb-2 border-b gap-2 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
          <h2 className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
            Preferences & Diagnostics
          </h2>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded transition-colors shadow-xs shadow-sky-500/20 shrink-0 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>
      </div>

      {/* 1. Appearance & Theme Configuration */}
      <div className={`rounded-xl border p-3 space-y-3 transition-colors ${
        isLight ? 'bg-white/90 border-slate-200 shadow-xs' : 'bg-slate-900/80 border-slate-800/80'
      }`}>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Palette className="w-4 h-4 text-amber-400 shrink-0" />
          <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>Appearance & Theme</span>
        </div>

        <div className="space-y-2.5 text-xs">
          {/* Theme Selector: Dark, Light, System */}
          <div className={`py-1 border-b space-y-1.5 ${isLight ? 'border-slate-200' : 'border-slate-800/50'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Theme Mode</span>
              <span className="text-[10px] text-slate-400 capitalize">{currentTheme} Mode</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => handleThemeSelect('dark')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  currentTheme === 'dark'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-semibold'
                    : isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeSelect('light')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  currentTheme === 'light'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-600 font-semibold'
                    : isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeSelect('system')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  currentTheme === 'system'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-400 font-semibold'
                    : isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Accent Color Palette */}
          <div className="py-1 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Accent Palette</span>
                <span className="text-[11px] text-slate-400">Telemetry highlight and graph stroke</span>
              </div>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded border text-sky-400 ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                {ACCENT_PALETTE.find(c => c.hex.toLowerCase() === accentColor.toLowerCase())?.label || 'Custom'}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-2 pt-0.5">
              {ACCENT_PALETTE.map(({ hex, label }) => {
                const isSelected = accentColor.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => handleAccentColorSelect(hex)}
                    className={`h-7 rounded-lg border-2 transition-all cursor-pointer flex items-center justify-center relative shadow-xs ${
                      isSelected
                        ? 'border-white ring-2 ring-white/40 scale-105 shadow-md shadow-black/40'
                        : 'border-slate-800/90 hover:border-slate-600 opacity-85 hover:opacity-100 hover:scale-102'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={`${label} (${hex})`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Monitoring Configuration */}
      <div className={`rounded-xl border p-3 space-y-3 transition-colors ${
        isLight ? 'bg-white/90 border-slate-200 shadow-xs' : 'bg-slate-900/80 border-slate-800/80'
      }`}>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Activity className="w-4 h-4 text-sky-400 shrink-0" />
          <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>Kernel Monitoring & Telemetry</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <label className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2 cursor-pointer">
            <div className="flex-1">
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>System Monitoring</span>
              <span className="text-[11px] text-slate-400">Collect real-time system and adapter bandwidth</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.monitoring.enabled}
              onChange={() => handleToggle('monitoring', 'enabled', 'Kernel Monitoring', 'Real-time telemetry active', 'Monitoring paused')}
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2 cursor-pointer">
            <div className="flex-1">
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Per-Application Attribution</span>
              <span className="text-[11px] text-slate-400">Attribute socket byte transfers to Windows processes</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.monitoring.perAppEnabled}
              onChange={() => handleToggle('monitoring', 'perAppEnabled', 'Process Attribution', 'ETW process tracking active', 'Process tracking disabled')}
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </label>

          <div className="py-1 border-b border-slate-800/50 space-y-1.5">
            <div>
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Target Network Adapter</span>
              <span className="text-[11px] text-slate-400">Select specific interface or follow active gateway</span>
            </div>
            <select
              value={localSettings.monitoring.adapterId}
              onChange={e => handleAdapterChange(e.target.value)}
              className={`text-xs border rounded px-2.5 py-1.5 w-full cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <option value="auto">Auto (Default Route / Gateway)</option>
              {adapters
                .filter(a => a.type !== 'virtual' && a.type !== 'loopback')
                .map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type.toUpperCase()})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center justify-between py-1 gap-2">
            <div>
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Telemetry Refresh Rate</span>
              <span className="text-[11px] text-slate-400">Interval between speed delta samples</span>
            </div>
            <span className="font-mono text-xs text-sky-400 shrink-0 font-semibold">
              {localSettings.monitoring.updateIntervalMs} ms
            </span>
          </div>
        </div>
      </div>

      {/* 3. Startup & System Tray */}
      <div className={`rounded-xl border p-3 space-y-3 transition-colors ${
        isLight ? 'bg-white/90 border-slate-200 shadow-xs' : 'bg-slate-900/80 border-slate-800/80'
      }`}>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Power className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>Windows Startup & System Tray</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <label className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2 cursor-pointer">
            <div className="flex-1">
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Start with Windows</span>
              <span className="text-[11px] text-slate-400">Launch NetScope X automatically on user login (HKCU\Run)</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.startWithWindows}
              onChange={() =>
                handleToggle(
                  'startup',
                  'startWithWindows',
                  'Start with Windows',
                  'NetScope X will automatically launch on Windows login.',
                  'Startup entry removed from Windows registry.'
                )
              }
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2 cursor-pointer">
            <div className="flex-1">
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Minimize to Tray on Close</span>
              <span className="text-[11px] text-slate-400">Keep monitoring in the system tray when window is closed</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.minimizeToTrayOnClose}
              onChange={() =>
                handleToggle(
                  'startup',
                  'minimizeToTrayOnClose',
                  'Minimize to Tray',
                  'Closing the window will minimize NetScope X to the system tray.',
                  'Closing the window will exit the application.'
                )
              }
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </label>
        </div>
      </div>

      {/* 4. Storage & Retention */}
      <div className={`rounded-xl border p-3 space-y-3 transition-colors ${
        isLight ? 'bg-white/90 border-slate-200 shadow-xs' : 'bg-slate-900/80 border-slate-800/80'
      }`}>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <HardDrive className="w-4 h-4 text-purple-400 shrink-0" />
          <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>Local Storage & Retention</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="py-1 border-b border-slate-800/50 space-y-1.5">
            <div>
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Data Retention Period</span>
              <span className="text-[11px] text-slate-400">Automatically prune records older than specified duration</span>
            </div>
            <select
              value={localSettings.storage.dataRetentionDays}
              onChange={e => handleRetentionChange(parseInt(e.target.value, 10))}
              className={`text-xs border rounded px-2.5 py-1.5 w-full cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={365}>1 Year</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-1 gap-2">
            <div>
              <span className={`font-medium block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Reset Session Counters</span>
              <span className="text-[11px] text-slate-400">Zero out current session bytes without touching historical records</span>
            </div>
            <button
              onClick={() => {
                void onResetSession();
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors shrink-0 cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* 5. Application Information & Version */}
      <div className={`rounded-xl border p-3 flex items-center justify-between text-xs transition-colors ${
        isLight ? 'bg-white/90 border-slate-200 text-slate-800 shadow-xs' : 'bg-slate-900/80 border-slate-800/80 text-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold font-mono text-xs">
            NX
          </div>
          <div>
            <div className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>NetScope X</div>
            <div className="text-[11px] text-slate-400">Windows Network Intelligence Suite</div>
          </div>
        </div>
        <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border text-sky-400 ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          v0.0.1
        </span>
      </div>
    </div>
  );
};
