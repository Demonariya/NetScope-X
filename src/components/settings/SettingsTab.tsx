import React, { useState } from 'react';
import {
  Sliders,
  Activity,
  Radio,
  HardDrive,
  Palette,
  Power,
  Plus,
  Trash2,
  Check,
  Save,
} from 'lucide-react';
import { AppSettings, NetworkAdapter } from '../../types/network';

interface SettingsTabProps {
  settings: AppSettings;
  adapters: NetworkAdapter[];
  onSaveSettings: (settings: AppSettings) => void;
  onResetSession: () => void;
  onClearHistory: () => void;
  onShowToast: (title: string, message?: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  adapters,
  onSaveSettings,
  onResetSession,
  onClearHistory,
  onShowToast,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetHost, setNewTargetHost] = useState('');

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

  const handleSave = () => {
    onSaveSettings(localSettings);
    onShowToast('Settings Saved', 'Preferences have been persisted');
  };

  const handleAddPingTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTargetName.trim() && newTargetHost.trim()) {
      const newTarget = {
        id: `target_${Date.now()}`,
        name: newTargetName.trim(),
        host: newTargetHost.trim(),
      };
      setLocalSettings(prev => ({
        ...prev,
        diagnostics: {
          ...prev.diagnostics,
          pingTargets: [...prev.diagnostics.pingTargets, newTarget],
        },
      }));
      setNewTargetName('');
      setNewTargetHost('');
    }
  };

  const handleRemovePingTarget = (id: string) => {
    setLocalSettings(prev => ({
      ...prev,
      diagnostics: {
        ...prev.diagnostics,
        pingTargets: prev.diagnostics.pingTargets.filter(t => t.id !== id),
      },
    }));
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-5xl mx-auto pb-16">
      {/* Header and Save Button */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h2 className="text-xs font-semibold text-slate-100">NetScope X Settings</h2>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded transition-colors shadow-sm shadow-sky-500/20"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Preferences</span>
        </button>
      </div>

      {/* 1. Monitoring Configuration */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Activity className="w-4 h-4 text-sky-400" />
          <span>Monitoring & Kernel Telemetry</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <div>
              <span className="font-medium text-slate-200 block">System Monitoring</span>
              <span className="text-[11px] text-slate-400">Collect real-time system and adapter bandwidth</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.monitoring.enabled}
              onChange={() => handleToggle(['monitoring', 'enabled'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <div>
              <span className="font-medium text-slate-200 block">Per-Application Attribution</span>
              <span className="text-[11px] text-slate-400">Attribute socket byte transfers to Windows processes</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.monitoring.perAppEnabled}
              onChange={() => handleToggle(['monitoring', 'perAppEnabled'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
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
              className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
            >
              <option value="auto">Auto (Default Route)</option>
              {adapters.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <span className="font-medium text-slate-200 block">Telemetry Refresh Rate</span>
              <span className="text-[11px] text-slate-400">Interval between speed delta samples (500ms - 5000ms)</span>
            </div>
            <span className="font-mono text-xs text-sky-400">
              {localSettings.monitoring.updateIntervalMs} ms
            </span>
          </div>
        </div>
      </div>

      {/* 2. Startup & System Tray */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Power className="w-4 h-4 text-emerald-400" />
          <span>Windows Startup & System Tray</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <div>
              <span className="font-medium text-slate-200 block">Start with Windows</span>
              <span className="text-[11px] text-slate-400">Launch NetScope X automatically on user login</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.startWithWindows}
              onChange={() => handleToggle(['startup', 'startWithWindows'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <div>
              <span className="font-medium text-slate-200 block">Minimize to Tray on Close</span>
              <span className="text-[11px] text-slate-400">Keep monitoring in the system tray when window is closed</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.minimizeToTrayOnClose}
              onChange={() => handleToggle(['startup', 'minimizeToTrayOnClose'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <span className="font-medium text-slate-200 block">Tray Tooltip Speeds</span>
              <span className="text-[11px] text-slate-400">Show current upload/download rates in tray hover card</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.startup.showTraySpeedTooltip}
              onChange={() => handleToggle(['startup', 'showTraySpeedTooltip'])}
              className="accent-sky-500 w-4 h-4 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 3. Storage & Retention */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <HardDrive className="w-4 h-4 text-purple-400" />
          <span>Local Storage & Retention</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
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
              className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
            >
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={365}>1 Year</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="font-medium text-slate-200 block">Reset Session Counters</span>
              <span className="text-[11px] text-slate-400">Zero out current session bytes without touching historical records</span>
            </div>
            <button
              onClick={() => {
                onResetSession();
                onShowToast('Session Reset', 'Session traffic counters set to 0 B');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
            >
              Reset Session
            </button>
          </div>
        </div>
      </div>

      {/* 4. Appearance */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Palette className="w-4 h-4 text-amber-400" />
          <span>Appearance & Canvas Mode</span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
            <div>
              <span className="font-medium text-slate-200 block">Default Window Canvas</span>
              <span className="text-[11px] text-slate-400">Initial layout mode upon application launch</span>
            </div>
            <select
              value={localSettings.appearance.defaultCanvasMode}
              onChange={e =>
                setLocalSettings(prev => ({
                  ...prev,
                  appearance: { ...prev.appearance, defaultCanvasMode: e.target.value as any },
                }))
              }
              className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
            >
              <option value="portrait_9_16">9:16 Portrait Canvas (Recommended)</option>
              <option value="standard_desktop">Standard Desktop</option>
              <option value="expanded_desktop">Expanded Desktop</option>
            </select>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <span className="font-medium text-slate-200 block">Accent Palette</span>
              <span className="text-[11px] text-slate-400">Refined electric blue / cool cyan accents</span>
            </div>
            <div className="flex items-center gap-1.5">
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
    </div>
  );
};
