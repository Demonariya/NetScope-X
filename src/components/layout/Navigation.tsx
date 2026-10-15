import React from 'react';
import {
  Activity,
  Layers,
  BarChart3,
  Network,
  History,
  Settings,
} from 'lucide-react';

export type TabType = 'overview' | 'applications' | 'traffic' | 'connections' | 'history' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isPortrait: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  isPortrait,
}) => {
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Activity },
    { id: 'applications' as TabType, label: 'Applications', icon: Layers },
    { id: 'traffic' as TabType, label: 'Traffic', icon: BarChart3 },
    { id: 'connections' as TabType, label: 'Sockets', icon: Network },
    { id: 'history' as TabType, label: 'History', icon: History },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  if (isPortrait) {
    // Bottom ergonomic navigation for 9:16 Portrait Canvas
    return (
      <div className="h-14 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-2 flex items-center justify-around shrink-0 z-30">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-md transition-all ${
                isActive
                  ? 'text-sky-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 mb-1 transition-transform ${isActive ? 'scale-110 text-sky-400' : ''}`} />
              <span className="text-[10px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Top segmented selector for Desktop Mode
  return (
    <div className="h-11 bg-slate-900/60 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-lg border border-slate-800/60">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
                isActive
                  ? 'bg-slate-800 text-sky-400 font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-slate-500 font-mono hidden md:block">
        ETW Live Telemetry Active
      </div>
    </div>
  );
};
