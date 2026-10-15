import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
  };

  const borders = {
    success: 'border-emerald-500/30',
    error: 'border-red-500/30',
    info: 'border-sky-500/30',
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-3 rounded-lg bg-slate-900/95 backdrop-blur-md border ${borders[toast.type]} shadow-xl shadow-black/40 text-slate-200 transition-all duration-200`}
    >
      <div className="pt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-100">{toast.title}</p>
        {toast.message && <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{toast.message}</p>}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-500 hover:text-slate-300 p-0.5 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
