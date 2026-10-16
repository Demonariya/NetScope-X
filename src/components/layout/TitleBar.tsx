import React from 'react';
import {
  Activity,
  Minus,
  X,
  Radio,
} from 'lucide-react';

interface TitleBarProps {
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  onOpenTrayModal: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isMonitoring,
  onToggleMonitoring,
  onOpenTrayModal,
  onMinimize,
  onClose,
}) => {
  return (
    <div className="h-10 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-3 flex items-center justify-between select-none z-40 shrink-0 gap-2 w-full">
      {/* Left: Brand Identity & Live Monitoring Status */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-xs shadow-sky-500/20 shrink-0">
          <Activity className="w-3 h-3 text-slate-950 stroke-[2.5]" />
        </div>
        <span className="font-semibold text-xs tracking-tight text-slate-100 flex items-center gap-1 truncate">
          <span>NetScope</span>
          <span className="text-[10px] px-1 py-0.2 rounded bg-sky-500/20 text-sky-400 font-mono font-bold">X</span>
        </span>

        {/* Live Status indicator button */}
        <button
          onClick={onToggleMonitoring}
          title={isMonitoring ? 'Click to Pause Monitoring' : 'Click to Resume Monitoring'}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition-colors shrink-0 ${
            isMonitoring
              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isMonitoring ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span>{isMonitoring ? 'LIVE' : 'PAUSED'}</span>
        </button>
      </div>

      {/* Right: System Tray & Windows Controls */}
      <div className="flex items-center gap-1 shrink-0">
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
