import React from 'react';
import {
  Activity,
  Layers,
  Gauge,
  BarChart3,
  Network,
  Globe,
  History,
  Settings,
} from 'lucide-react';
import { motion } from 'motion/react';

export type TabType = 'overview' | 'applications' | 'bandwidth' | 'traffic' | 'connections' | 'dns' | 'history' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  accentColor?: string;
  isMonitoring?: boolean;
  mode?: 'sidebar' | 'bottom';
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  accentColor = '#38bdf8',
  isMonitoring = true,
  mode = 'bottom',
}) => {
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', fullLabel: 'Overview', icon: Activity },
    { id: 'applications' as TabType, label: 'Apps', fullLabel: 'Applications', icon: Layers },
    { id: 'bandwidth' as TabType, label: 'Control', fullLabel: 'Bandwidth', icon: Gauge },
    { id: 'traffic' as TabType, label: 'Traffic', fullLabel: 'Traffic', icon: BarChart3 },
    { id: 'connections' as TabType, label: 'Sockets', fullLabel: 'Connections', icon: Network },
    { id: 'dns' as TabType, label: 'DNS', fullLabel: 'DNS Manager', icon: Globe },
    { id: 'history' as TabType, label: 'History', fullLabel: 'History', icon: History },
    { id: 'settings' as TabType, label: 'Settings', fullLabel: 'Settings', icon: Settings },
  ];

  if (mode === 'sidebar') {
    return (
      <aside className="w-44 lg:w-52 shrink-0 h-full bg-slate-950/95 backdrop-blur-md border-r border-slate-800/80 flex flex-col justify-between py-3 px-2 z-20 select-none hidden md:flex">
        <div className="space-y-1 min-w-0">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Navigation
          </div>
          <div className="flex flex-col gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  whileTap={{ scale: 0.96 }}
                  style={{ color: isActive ? accentColor : undefined }}
                  className={`relative flex items-center gap-2.5 w-full py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    isActive
                      ? 'font-semibold text-slate-100'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeSidebarIndicator"
                      className="absolute inset-0 rounded-lg -z-10 shadow-xs"
                      style={{
                        backgroundColor: `${accentColor}18`,
                        border: `1px solid ${accentColor}35`,
                      }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon
                    style={{ color: isActive ? accentColor : undefined }}
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                      isActive ? 'scale-110' : ''
                    }`}
                  />
                  <span className="truncate whitespace-nowrap">{tab.fullLabel}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer: System Status */}
        <div className="pt-2 border-t border-slate-800/60 px-3 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isMonitoring ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="text-[10px] font-medium truncate">
              {isMonitoring ? 'MONITORING' : 'PAUSED'}
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-400 shrink-0">v0.0.1</span>
        </div>
      </aside>
    );
  }

  // Mobile / Compact Bottom Navigation Bar
  return (
    <div className="h-14 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-1 xs:px-2 flex md:hidden items-center justify-around shrink-0 z-30 select-none pb-[env(safe-area-inset-bottom)] w-full">
      <div className="w-full max-w-xl mx-auto flex items-center justify-around h-full gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              whileTap={{ scale: 0.92 }}
              style={{ color: isActive ? accentColor : undefined }}
              className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer min-w-0 ${
                isActive
                  ? 'font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 rounded-lg -z-10"
                  style={{
                    backgroundColor: `${accentColor}18`,
                    border: `1px solid ${accentColor}35`,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon
                style={{ color: isActive ? accentColor : undefined }}
                className={`w-4 h-4 mb-0.5 transition-transform duration-200 shrink-0 ${isActive ? 'scale-110' : ''}`}
              />
              <span className="text-[10px] tracking-tight truncate max-w-full block">{tab.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
