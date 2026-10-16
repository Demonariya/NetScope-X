import React, { useState, useMemo } from 'react';
import {
  Network,
  Search,
  Copy,
  Check,
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
    <div className="space-y-3 p-3 max-w-full pb-16 w-full">
      {/* Filter and Search Bar */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Network className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-100 truncate">
              Active Network Sockets
            </h2>
            <span className="text-[11px] text-slate-400 font-mono shrink-0">
              ({filteredConnections.length})
            </span>
          </div>

          {/* Protocol Toggle Buttons */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px] shrink-0">
            {(['ALL', 'TCP', 'UDP'] as const).map(p => (
              <button
                key={p}
                onClick={() => setProtocolFilter(p)}
                className={`px-2 py-0.5 rounded transition-all ${
                  protocolFilter === p
                    ? 'bg-slate-800 text-sky-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* State Filter & Search Row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by remote IP, process, port..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value as any)}
            className="text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-sky-500 shrink-0"
          >
            <option value="ALL">All States</option>
            <option value="ESTABLISHED">Established</option>
            <option value="LISTENING">Listening</option>
          </select>
        </div>
      </div>

      {/* Sockets Portrait Card Feed */}
      <div className="space-y-2">
        {filteredConnections.length === 0 ? (
          <div className="rounded-xl bg-slate-900/40 border border-slate-800/80 p-8 text-center text-slate-400">
            <Network className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-300">No active sockets match filter.</p>
            <p className="text-[11px] text-slate-500 mt-1">Try resetting the protocol filter or clearing search.</p>
          </div>
        ) : (
          filteredConnections.map(conn => {
            const iconSrc = getProcessIconSvg(conn.processName);
            const isCopied = copiedId === conn.id;

            return (
              <div
                key={conn.id}
                className="rounded-xl border border-slate-800/80 bg-slate-900/70 hover:bg-slate-900/90 hover:border-slate-700/80 transition-all p-3 space-y-2 text-xs"
              >
                {/* Header: Protocol Badge, Process Identity, State Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        conn.protocol === 'TCP'
                          ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                          : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                      }`}
                    >
                      {conn.protocol}
                    </span>

                    <img
                      src={iconSrc}
                      alt={conn.processName}
                      className="w-4 h-4 object-contain shrink-0"
                      referrerPolicy="no-referrer"
                    />

                    <div className="min-w-0 truncate">
                      <span className="font-semibold text-slate-200 truncate block">
                        {conn.processName}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      #{conn.pid}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                      conn.state === 'ESTABLISHED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : conn.state === 'LISTENING'
                        ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {conn.state}
                  </span>
                </div>

                {/* Endpoints Routing Info Tile */}
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800/60 font-mono text-[11px] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans">
                      Remote Endpoint
                    </span>
                    <span className="text-slate-200 font-medium truncate block">
                      {conn.remoteAddress}:{conn.remotePort}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans">
                      Local Port
                    </span>
                    <span className="text-slate-300 block">
                      :{conn.localPort}
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopyEndpoint(conn)}
                    title="Copy remote endpoint IP:Port"
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-300 transition-colors ml-1 shrink-0"
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
  );
};
