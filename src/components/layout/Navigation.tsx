import React from 'react';
import {
  Activity,
  Layers,
  BarChart3,
  Network,
  History,
  Settings,
} from 'lucide-react';
import { motion } from 'motion/react';

export type TabType = 'overview' | 'applications' | 'traffic' | 'connections' | 'history' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  accentColor?: string;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  accentColor = '#38bdf8',
}) => {
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Activity },
    { id: 'applications' as TabType, label: 'Apps', icon: Layers },
    { id: 'traffic' as TabType, label: 'Traffic', icon: BarChart3 },
    { id: 'connections' as TabType, label: 'Sockets', icon: Network },
    { id: 'history' as TabType, label: 'History', icon: History },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  // Exactly one portrait navigation bar: bottom ergonomic navigation with sliding pill animation
  return (
    <div className="h-14 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-1 xs:px-2 flex items-center justify-around shrink-0 z-30 select-none pb-[env(safe-area-inset-bottom)] w-full">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <motion.button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            whileTap={{ scale: 0.92 }}
            style={{ color: isActive ? accentColor : undefined }}
            className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-0.5 rounded-lg transition-colors cursor-pointer ${
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
              className={`w-4 h-4 mb-0.5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}
            />
            <span className="text-[10px] tracking-tight truncate max-w-full">{tab.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
};
