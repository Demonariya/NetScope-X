import React from 'react';
import {
  Activity,
  Maximize2,
  Minimize2,
  Minus,
  X,
  Smartphone,
  Monitor,
  Maximize,
  Radio,
} from 'lucide-react';
import { CanvasMode } from '../../types/network';

interface TitleBarProps {
  canvasMode: CanvasMode;
  onCanvasModeChange: (mode: CanvasMode) => void;
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  onOpenTrayModal: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  canvasMode,
  onCanvasModeChange,
  isMonitoring,
  onToggleMonitoring,
  onOpenTrayModal,
  onMinimize,
  onMaximize,
  onClose,
}) => {
  return (
    <div className="h-10 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-3 flex items-center justify-between select-none z-40 shrink-0">
      {/* Left: Brand Identity & Status */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-sm shadow-sky-500/20">
          <Activity className="w-3 h-3 text-slate-950 stroke-[2.5]" />
        </div>
        <span className="font-semibold text-xs tracking-tight text-slate-100 flex items-center gap-1.5 truncate">
          <span>NetScope</span>
          <span className="text-[10px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-400 font-mono font-bold">X</span>
        </span>

        {/* Live Status indicator */}
        <button
          onClick={onToggleMonitoring}
          title={isMonitoring ? 'Click to Pause Monitoring' : 'Click to Resume Monitoring'}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            isMonitoring
              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span>{isMonitoring ? 'LIVE' : 'PAUSED'}</span>
        </button>
      </div>

      {/* Center: Canvas Aspect-Ratio Switcher (Requirement 2) */}
      <div className="hidden sm:flex items-center gap-1 bg-slate-900/80 p-0.5 rounded border border-slate-800 text-[11px]">
        <button
          onClick={() => onCanvasModeChange('portrait_9_16')}
          title="9:16 Portrait Canvas (Compact Mobile/Vertical Window)"
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${
            canvasMode === 'portrait_9_16'
              ? 'bg-sky-500/20 text-sky-300 font-medium shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Smartphone className="w-3 h-3" />
          <span>9:16 Portrait</span>
        </button>
        <button
          onClick={() => onCanvasModeChange('standard_desktop')}
          title="Standard Desktop Window"
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${
            canvasMode === 'standard_desktop'
              ? 'bg-sky-500/20 text-sky-300 font-medium shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Monitor className="w-3 h-3" />
          <span>Desktop</span>
        </button>
        <button
          onClick={() => onCanvasModeChange('maximized')}
          title="Maximized Full-Width Layout"
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${
            canvasMode === 'maximized'
              ? 'bg-sky-500/20 text-sky-300 font-medium shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Maximize className="w-3 h-3" />
          <span>Full</span>
        </button>
      </div>

      {/* Right: Tray Simulation & Windows Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenTrayModal}
          title="Inspect Windows System Tray Interface"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Radio className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-3.5 bg-slate-800 mx-1" />

        {/* Windows Standard Window Buttons */}
        <button
          onClick={onMinimize}
          title="Minimize"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMaximize}
          title="Maximize / Restore"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
        >
          {canvasMode === 'maximized' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
        <button
          onClick={onClose}
          title="Close (Minimizes to Tray by default)"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/80 hover:text-white text-slate-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
