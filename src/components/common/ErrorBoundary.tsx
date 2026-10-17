import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('NetScope X uncaught error boundary caught:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-[405px] h-[720px] bg-[#0b0f17] text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-slate-100 mb-1">
            Application Startup Issue
          </h2>
          <p className="text-xs text-slate-400 mb-4 max-w-xs">
            NetScope X encountered an initialization error. The internal telemetry engine has safely contained it.
          </p>
          <div className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-left mb-5">
            <span className="text-[10px] text-slate-500 font-mono block uppercase mb-1">Diagnostic Details</span>
            <p className="text-xs font-mono text-rose-300 break-words max-h-32 overflow-y-auto">
              {this.state.error?.message || 'Unknown runtime error'}
            </p>
          </div>
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload NetScope X
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
