import React, { useState } from 'react';
import {
  Globe,
  MessageSquare,
  Code2,
  Music,
  Gamepad2,
  Cpu,
  Terminal,
  Activity,
  AppWindow,
} from 'lucide-react';

interface ProcessIconProps {
  exeName: string;
  icon?: string;
  className?: string;
  containerClassName?: string;
  size?: number;
}

export const ProcessIcon: React.FC<ProcessIconProps> = ({
  exeName,
  icon,
  className = 'w-4 h-4',
  containerClassName = 'w-7 h-7 rounded-lg bg-slate-950 p-1 border border-slate-800 shrink-0 flex items-center justify-center overflow-hidden',
  size = 16,
}) => {
  const [imageError, setImageError] = useState(false);
  const cleanName = (exeName || '').toLowerCase().trim();

  // If a valid image URL is given and hasn't errored, use it with a safe fallback handler
  if (icon && !imageError && icon.trim().length > 0) {
    return (
      <div className={containerClassName}>
        <img
          src={icon}
          alt={exeName}
          className={`${className} object-contain`}
          onError={() => setImageError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  // Dynamic branded SVG and vector glyphs for known processes
  const renderGlyph = () => {
    if (cleanName.includes('chrome') || cleanName.includes('edge') || cleanName.includes('brave') || cleanName.includes('firefox')) {
      return <Globe className={`${className} text-sky-400`} style={{ width: size, height: size }} />;
    }
    if (cleanName.includes('discord')) {
      return <MessageSquare className={`${className} text-indigo-400`} style={{ width: size, height: size }} />;
    }
    if (cleanName.includes('code') || cleanName.includes('devenv') || cleanName.includes('idea')) {
      return <Code2 className={`${className} text-blue-400`} style={{ width: size, height: size }} />;
    }
    if (cleanName.includes('spotify') || cleanName.includes('music')) {
      return <Music className={`${className} text-emerald-400`} style={{ width: size, height: size }} />;
    }
    if (cleanName.includes('steam') || cleanName.includes('game') || cleanName.includes('epic')) {
      return <Gamepad2 className={`${className} text-purple-400`} style={{ width: size, height: size }} />;
    }
    if (cleanName === 'system' || cleanName.includes('svchost') || cleanName.includes('explorer') || cleanName.includes('services')) {
      return <Cpu className={`${className} text-amber-400`} style={{ width: size, height: size }} />;
    }
    if (cleanName.includes('terminal') || cleanName.includes('powershell') || cleanName.includes('cmd') || cleanName.includes('bash')) {
      return <Terminal className={`${className} text-teal-400`} style={{ width: size, height: size }} />;
    }
    if (cleanName.includes('netscope')) {
      return <Activity className={`${className} text-cyan-400`} style={{ width: size, height: size }} />;
    }
    return <AppWindow className={`${className} text-slate-400`} style={{ width: size, height: size }} />;
  };

  return (
    <div className={containerClassName}>
      {renderGlyph()}
    </div>
  );
};
