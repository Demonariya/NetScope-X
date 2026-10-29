import React from 'react';
import {
  Activity,
  Minus,
  X,
  Radio,
  Moon,
  Sun,
  Laptop,
} from 'lucide-react';
import { motion } from 'motion/react';

interface TitleBarProps {
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  onHideToTray: () => void;
  onMinimize: () => void;
  onClose: () => void;
  currentTheme?: 'dark' | 'light' | 'system';
  onToggleTheme?: () => void;
  accentColor?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isMonitoring,
  onToggleMonitoring,
  onHideToTray,
  onMinimize,
  onClose,
  currentTheme = 'dark',
  onToggleTheme,
  accentColor = '#38bdf8',
}) => {
  return (
    <div data-tauri-drag-region className="h-10 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-3 flex items-center justify-between select-none z-40 shrink-0 gap-2 w-full">
      {/* Left: Brand Identity & Live Monitoring Status */}
      <div data-tauri-drag-region className="flex items-center gap-2 min-w-0 shrink">
        <div
          style={{ background: `linear-gradient(135deg, ${accentColor}, #2563eb)` }}
          className="w-5 h-5 rounded-md flex items-center justify-center shadow-xs shrink-0"
        >
          <Activity className="w-3 h-3 text-slate-950 stroke-[2.5]" />
        </div>
        <span data-tauri-drag-region className="font-semibold text-xs tracking-tight text-slate-100 flex items-center gap-1 truncate">
          <span>NetScope</span>
          <span
            className="text-[10px] px-1 py-0.2 rounded font-mono font-bold"
            style={{ backgroundColor: `${accentColor}33`, color: accentColor }}
          >
            X
          </span>
        </span>

        {/* Live Status indicator button with animated radar pulse */}
        <motion.button
          data-tauri-drag-region="false"
          onClick={onToggleMonitoring}
          whileTap={{ scale: 0.93 }}
          title={isMonitoring ? 'Click to Pause Monitoring' : 'Click to Resume Monitoring'}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition-colors shrink-0 cursor-pointer ${
            isMonitoring
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/30'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {isMonitoring && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isMonitoring ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </span>
          <span>{isMonitoring ? 'LIVE' : 'PAUSED'}</span>
        </motion.button>
      </div>

      {/* Right: Theme Switcher, System Tray & Windows Controls */}
      <div data-tauri-drag-region="false" className="flex items-center gap-1 shrink-0">
        {onToggleTheme && (
          <button
            data-tauri-drag-region="false"
            onClick={onToggleTheme}
            title={`Active Theme: ${currentTheme.toUpperCase()} (Click to switch)`}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            {currentTheme === 'light' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : currentTheme === 'system' ? (
              <Laptop className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-sky-400" />
            )}
          </button>
        )}

        <button
          data-tauri-drag-region="false"
          onClick={onHideToTray}
          title="Hide NetScope X to the Windows system tray"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Radio className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-3.5 bg-slate-800 mx-1" />

        {/* Windows Standard Window Buttons */}
        <button
          data-tauri-drag-region="false"
          onClick={onMinimize}
          title="Minimize"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          data-tauri-drag-region="false"
          onClick={onClose}
          title="Close (Minimizes to Tray by default)"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/80 hover:text-white text-slate-400 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
