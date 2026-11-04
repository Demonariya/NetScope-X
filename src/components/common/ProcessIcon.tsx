import React, { useState } from 'react';
import { getProcessRealIcon } from '../../utils/processIcons';

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
  const realIconSrc = !imageError && icon && icon.trim().length > 0
    ? icon.trim()
    : getProcessRealIcon(exeName);

  return (
    <div className={containerClassName}>
      <img
        src={realIconSrc}
        alt={exeName}
        style={{ width: size, height: size }}
        className={`${className} object-contain transition-opacity duration-150`}
        onError={() => {
          if (!imageError && icon) {
            setImageError(true);
          }
        }}
        loading="lazy"
        draggable={false}
      />
    </div>
  );
};
