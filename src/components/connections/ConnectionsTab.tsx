import React, { useState, useMemo } from 'react';
import {
  Network,
  Search,
  Copy,
  Check,
  Shield,
  Filter,
} from 'lucide-react';
import { SocketConnection } from '../../types/network';
import { getProcessIconSvg } from '../../utils/processIcons';

interface ConnectionsTabProps {
  connections: SocketConnection[];
  onShowToast: (title: string, message?: string) => void;
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  connections,
  onShowToast,
}) => {
  const [protocolFilter, setProtocolFilter] = useState<'ALL' | 'TCP' | 'UDP'>('ALL');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'ESTABLISHED' | 'LISTENING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyEndpoint = (conn: SocketConnection) => {
    const text = `${conn.remoteAddress}:${conn.remotePort}`;
    navigator.clipboard.writeText(text);
    setCopiedId(conn.id);
    onShowToast('Endpoint Copied', text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredConnections = useMemo(() => {
    return connections.filter(conn => {
      if (protocolFilter !== 'ALL' && conn.protocol !== protocolFilter) return false;
      if (stateFilter !== 'ALL' && conn.state !== stateFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          conn.processName.toLowerCase().includes(q) ||
          conn.remoteAddress.toLowerCase().includes(q) ||
          conn.localAddress.toLowerCase().includes(q) ||
          conn.pid.toString().includes(q)
        );
      }
      return true;
    });
  }, [connections, protocolFilter, stateFilter, searchQuery]);

  return (
    <div className="space-y-3.5 p-3 sm:p-4 max-w-5xl mx-auto pb-16">
      {/* Filter and Search Bar */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs font-semibold text-slate-100">
              Active Network Sockets & Endpoints
            </h2>
            <span className="text-[11px] text-slate-500 font-mono">
              ({filteredConnections.length} active sockets)
            </span>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2">
            {/* Protocol Buttons */}
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px]">
              {(['ALL', 'TCP', 'UDP'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setProtocolFilter(p)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    protocolFilter === p
                      ? 'bg-slate-800 text-sky-400 font-medium'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* State Filter */}
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value as any)}
              className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All States</option>
              <option value="ESTABLISHED">ESTABLISHED</option>
              <option value="LISTENING">LISTENING</option>
            </select>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by remote IP, process, or port..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Sockets Table */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950 border-b border-slate-800">
          <span className="col-span-1">Proto</span>
          <span className="col-span-3">Process / PID</span>
          <span className="col-span-3">Local Endpoint</span>
          <span className="col-span-3">Remote Endpoint</span>
          <span className="col-span-2 text-right">State / Action</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-800/60">
          {filteredConnections.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No active network connections match the selected filters.
            </div>
          ) : (
            filteredConnections.map(conn => {
              const iconSrc = getProcessIconSvg(conn.processName);
              const isCopied = copiedId === conn.id;

              return (
                <div
                  key={conn.id}
                  className="p-3 sm:px-4 flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-center text-xs hover:bg-slate-800/30 transition-colors"
                >
                  {/* Protocol */}
                  <div className="col-span-1 flex items-center gap-1.5">
                    <span
                      className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        conn.protocol === 'TCP'
                          ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                          : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                      }`}
                    >
                      {conn.protocol}
                    </span>
                  </div>

                  {/* Process Name & PID */}
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <img
                      src={iconSrc}
                      alt={conn.processName}
                      className="w-4 h-4 object-contain shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="truncate">
                      <span className="font-medium text-slate-200 block truncate">
                        {conn.processName}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        PID {conn.pid}
                      </span>
                    </div>
                  </div>

                  {/* Local Endpoint */}
                  <div className="col-span-3 font-mono text-[11px] text-slate-400 truncate">
                    <span className="sm:hidden text-[10px] text-slate-500 block uppercase">Local:</span>
                    {conn.localAddress}:{conn.localPort}
                  </div>

                  {/* Remote Endpoint */}
                  <div className="col-span-3 font-mono text-[11px] text-slate-200 truncate">
                    <span className="sm:hidden text-[10px] text-slate-500 block uppercase">Remote:</span>
                    {conn.remoteAddress}:{conn.remotePort}
                  </div>

                  {/* State & Copy Button */}
                  <div className="col-span-2 flex items-center justify-between sm:justify-end gap-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${
                        conn.state === 'ESTABLISHED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : conn.state === 'LISTENING'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {conn.state}
                    </span>

                    <button
                      onClick={() => handleCopyEndpoint(conn)}
                      title="Copy remote endpoint"
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
