import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NotificationType, ToastNotification, MAX_SIMULTANEOUS_NOTIFICATIONS } from '../../utils/notifications';

export type ToastMessage = ToastNotification;

interface ToastProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  // Enforce the strict 5 notification ceiling in rendering
  const visibleToasts = toasts.slice(-MAX_SIMULTANEOUS_NOTIFICATIONS);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-3 right-3 z-50 flex flex-col gap-1.5 max-w-[340px] w-full pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {visibleToasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastNotification; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.durationMs || 4000);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs, onDismiss]);

  const icons: Record<NotificationType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
  };

  const borderClasses: Record<NotificationType, string> = {
    success: 'border-emerald-500/35 bg-slate-900/95 shadow-emerald-500/5',
    warning: 'border-amber-500/35 bg-slate-900/95 shadow-amber-500/5',
    error: 'border-rose-500/40 bg-slate-900/95 shadow-rose-500/10',
    info: 'border-sky-500/35 bg-slate-900/95 shadow-sky-500/5',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-2.5 p-2.5 rounded-lg border backdrop-blur-md shadow-xl text-slate-200 ${borderClasses[toast.type]}`}
    >
      <div className="pt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-100 leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed break-words">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
};
