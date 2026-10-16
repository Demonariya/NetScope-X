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
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Activity },
    { id: 'applications' as TabType, label: 'Apps', icon: Layers },
    { id: 'traffic' as TabType, label: 'Traffic', icon: BarChart3 },
    { id: 'connections' as TabType, label: 'Sockets', icon: Network },
    { id: 'history' as TabType, label: 'History', icon: History },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  // Exactly one portrait navigation bar: bottom ergonomic navigation
  return (
    <div className="h-14 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-1 xs:px-2 flex items-center justify-around shrink-0 z-30 select-none pb-[env(safe-area-inset-bottom)] w-full">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-0.5 rounded-md transition-all ${
              isActive
                ? 'text-sky-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className={`w-4 h-4 mb-0.5 transition-transform ${isActive ? 'scale-110 text-sky-400' : ''}`} />
            <span className="text-[10px] tracking-tight truncate max-w-full">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
