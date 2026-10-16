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
} from 'lucide-react';
import { AppSettings, NetworkAdapter } from '../../types/network';

interface SettingsTabProps {
  settings: AppSettings;
  adapters: NetworkAdapter[];
  currentTheme: 'dark' | 'light' | 'system';
  onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
  onSaveSettings: (settings: AppSettings) => void;
  onResetSession: () => void;
  onClearHistory: () => void;
  onShowToast: (title: string, message?: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  adapters,
  currentTheme,
  onThemeChange,
  onSaveSettings,
  onResetSession,
  onShowToast,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  const handleToggle = (path: string[]) => {
    setLocalSettings(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      let cur = copy;
      for (let i = 0; i < path.length - 1; i++) {
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = !cur[path[path.length - 1]];
      return copy;
    });
  };

  const handleThemeSelect = (theme: 'dark' | 'light' | 'system') => {
    onThemeChange(theme);
    setLocalSettings(prev => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        theme,
      },
    }));
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
    onShowToast('Settings Saved', 'Preferences have been persisted');
  };

  return (
    <div className="space-y-3 p-3 w-full pb-16">
      {/* Header and Save Button */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
          <h2 className="text-xs font-semibold text-slate-100">Preferences & Diagnostics</h2>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded transition-colors shadow-xs shadow-sky-500/20 shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>
      </div>

      {/* 1. Appearance & Theme Configuration */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Palette className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Appearance & Theme</span>
        </div>

        <div className="space-y-2.5 text-xs">
          {/* Theme Selector: Dark, Light, System */}
          <div className="py-1 border-b border-slate-800/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200 block">Theme Mode</span>
              <span className="text-[10px] text-slate-400 capitalize">{currentTheme} Mode</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => handleThemeSelect('dark')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                  currentTheme === 'dark'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeSelect('light')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                  currentTheme === 'light'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeSelect('system')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                  currentTheme === 'system'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Locked 405x720 UI Specification */}
          <div className="py-1 border-b border-slate-800/50 space-y-1">
            <span className="font-medium text-slate-200 block">Window Resolution</span>
            <div className="p-2 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-sky-400 flex items-center justify-between">
              <span>405 × 720 px (9:16 Portrait)</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-sans">
                Fixed Window
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              The application window is locked strictly to 405 × 720 logical pixels with fixed aspect ratio.
            </p>
          </div>

          {/* Accent Color */}
          <div className="flex items-center justify-between py-1 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">Accent Palette</span>
              <span className="text-[11px] text-slate-400">Telemetry highlight and graph stroke</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {['#38bdf8', '#0ea5e9', '#2dd4bf', '#6366f1'].map(color => (
                <button
                  key={color}
                  onClick={() =>
                    setLocalSettings(prev => ({
                      ...prev,
                      appearance: { ...prev.appearance, accentColor: color },
                    }))
                  }
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    localSettings.appearance.accentColor === color
                      ? 'border-white scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Monitoring Configuration */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Activity className="w-4 h-4 text-sky-400 shrink-0" />
          <span>Kernel Monitoring & Telemetry</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">System Monitoring</span>
              <span className="text-[11px] text-slate-400">Collect real-time system and adapter bandwidth</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.monitoring.enabled}
              onChange={() => handleToggle(['monitoring', 'enabled'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">Per-Application Attribution</span>
              <span className="text-[11px] text-slate-400">Attribute socket byte transfers to Windows processes</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.monitoring.perAppEnabled}
              onChange={() => handleToggle(['monitoring', 'perAppEnabled'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </div>

          <div className="py-1 border-b border-slate-800/50 space-y-1.5">
            <div>
              <span className="font-medium text-slate-200 block">Target Network Adapter</span>
              <span className="text-[11px] text-slate-400">Select specific interface or follow active gateway</span>
            </div>
            <select
              value={localSettings.monitoring.adapterId}
              onChange={e =>
                setLocalSettings(prev => ({
                  ...prev,
                  monitoring: { ...prev.monitoring, adapterId: e.target.value },
                }))
              }
              className="text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-300 w-full"
            >
              <option value="auto">Auto (Default Route)</option>
              {adapters.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between py-1 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">Telemetry Refresh Rate</span>
              <span className="text-[11px] text-slate-400">Interval between speed delta samples</span>
            </div>
            <span className="font-mono text-xs text-sky-400 shrink-0 font-semibold">
              {localSettings.monitoring.updateIntervalMs} ms
            </span>
          </div>
        </div>
      </div>

      {/* 3. Startup & System Tray */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Power className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Windows Startup & System Tray</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">Start with Windows</span>
              <span className="text-[11px] text-slate-400">Launch NetScope X on user login</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.startWithWindows}
              onChange={() => handleToggle(['startup', 'startWithWindows'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/50 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">Minimize to Tray on Close</span>
              <span className="text-[11px] text-slate-400">Keep monitoring in the system tray when window is closed</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.minimizeToTrayOnClose}
              onChange={() => handleToggle(['startup', 'minimizeToTrayOnClose'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </div>

          <div className="flex items-center justify-between py-1 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">Tray Tooltip Speeds</span>
              <span className="text-[11px] text-slate-400">Show current upload/download rates in tray hover card</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.showTraySpeedTooltip}
              onChange={() => handleToggle(['startup', 'showTraySpeedTooltip'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer shrink-0"
            />
          </div>
        </div>
      </div>

      {/* 4. Storage & Retention */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <HardDrive className="w-4 h-4 text-purple-400 shrink-0" />
          <span>Local Storage & Retention</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="py-1 border-b border-slate-800/50 space-y-1.5">
            <div>
              <span className="font-medium text-slate-200 block">Data Retention Period</span>
              <span className="text-[11px] text-slate-400">Automatically prune records older than specified duration</span>
            </div>
            <select
              value={localSettings.storage.dataRetentionDays}
              onChange={e =>
                setLocalSettings(prev => ({
                  ...prev,
                  storage: { ...prev.storage, dataRetentionDays: parseInt(e.target.value, 10) },
                }))
              }
              className="text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-300 w-full"
            >
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={365}>1 Year</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-1 gap-2">
            <div>
              <span className="font-medium text-slate-200 block">Reset Session Counters</span>
              <span className="text-[11px] text-slate-400">Zero out current session bytes without touching historical records</span>
            </div>
            <button
              onClick={() => {
                onResetSession();
                onShowToast('Session Reset', 'Session traffic counters set to 0 B');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors shrink-0"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
