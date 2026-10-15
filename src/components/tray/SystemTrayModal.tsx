import React from 'react';
import {
  Radio,
  X,
  Play,
  Pause,
  ExternalLink,
  Settings,
  Power,
  Activity,
  ArrowDown,
  ArrowUp,
  Wifi,
} from 'lucide-react';
import { NetworkStats } from '../../types/network';
import { formatSpeed, formatBytes } from '../../utils/formatters';

interface SystemTrayModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  liveStats: NetworkStats | null;
  onOpenSettings: () => void;
  onRestore: () => void;
  onShowToast: (title: string, message?: string) => void;
}

export const SystemTrayModal: React.FC<SystemTrayModalProps> = ({
  isOpen,
  onClose,
  isMonitoring,
  onToggleMonitoring,
  liveStats,
  onOpenSettings,
  onRestore,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const down = formatSpeed(liveStats?.downloadBps || 0);
  const up = formatSpeed(liveStats?.uploadBps || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-200">
        {/* Tray Header */}
        <div className="px-3.5 py-2.5 bg-slate-950 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold text-slate-100">Windows System Tray Preview</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Windows Tray Tooltip Card Simulation */}
        <div className="p-3.5 bg-slate-950/40 border-b border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-sky-500/20 flex items-center justify-center text-sky-400">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-semibold block text-slate-200 text-xs">NetScope X</span>
                <span className="text-[10px] text-slate-400">
                  {isMonitoring ? 'Monitoring Active (ETW)' : 'Monitoring Suspended'}
                </span>
              </div>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-mono">
              2.5 GbE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-mono">
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Download</span>
              <span className="text-sky-400 font-bold">{down.full}</span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Upload</span>
              <span className="text-teal-400 font-bold">{up.full}</span>
            </div>
          </div>
        </div>

        {/* Tray Context Menu Items */}
        <div className="p-2 space-y-1 text-xs">
          <button
            onClick={() => {
              onRestore();
              onClose();
              onShowToast('Window Restored', 'NetScope X brought to foreground');
            }}
            className="w-full px-3 py-2 text-left rounded-lg hover:bg-slate-800 flex items-center gap-2.5 transition-colors text-slate-200"
          >
            <ExternalLink className="w-4 h-4 text-sky-400" />
            <span>Open NetScope X Window</span>
          </button>

          <button
            onClick={() => {
              onToggleMonitoring();
              onShowToast(
                isMonitoring ? 'Monitoring Paused' : 'Monitoring Resumed',
                isMonitoring ? 'Packet counters frozen' : 'Active ETW stream live'
              );
            }}
            className="w-full px-3 py-2 text-left rounded-lg hover:bg-slate-800 flex items-center gap-2.5 transition-colors text-slate-200"
          >
            {isMonitoring ? (
              <>
                <Pause className="w-4 h-4 text-amber-400" />
                <span>Pause Monitoring</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-emerald-400" />
                <span>Resume Monitoring</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full px-3 py-2 text-left rounded-lg hover:bg-slate-800 flex items-center gap-2.5 transition-colors text-slate-200"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Open Settings...</span>
          </button>

          <div className="my-1 border-t border-slate-800" />

          <button
            onClick={() => {
              onClose();
              onShowToast('NetScope X Background', 'Application remains active in system tray');
            }}
            className="w-full px-3 py-2 text-left rounded-lg hover:bg-red-500/20 text-red-400 flex items-center gap-2.5 transition-colors"
          >
            <Power className="w-4 h-4" />
            <span>Exit NetScope X</span>
          </button>
        </div>
      </div>
    </div>
  );
};
