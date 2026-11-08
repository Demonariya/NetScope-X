import React, { useState, useMemo } from 'react';
import {
  Network,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Boxes,
} from 'lucide-react';
import { SocketConnection } from '../../types/network';
import { ProcessIcon } from '../common/ProcessIcon';

interface ConnectionsTabProps {
  connections: SocketConnection[];
  onShowToast: (title: string, message?: string) => void;
  currentTheme?: 'dark' | 'light' | 'system';
}

export interface GroupedAppSockets {
  id: string;
  processName: string;
  pids: number[];
  connections: SocketConnection[];
  tcpCount: number;
  udpCount: number;
  establishedCount: number;
  listeningCount: number;
  boundCount: number;
  otherCount: number;
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  connections,
  onShowToast,
  currentTheme = 'dark',
}) => {
  const isLight =
    currentTheme === 'light' ||
    (currentTheme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [protocolFilter, setProtocolFilter] = useState<'ALL' | 'TCP' | 'UDP'>('ALL');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'ESTABLISHED' | 'LISTENING' | 'BOUND'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGrouped, setIsGrouped] = useState(true);
  const [expandedAppKeys, setExpandedAppKeys] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyEndpoint = async (conn: SocketConnection) => {
    const hasRemoteEndpoint = Boolean(conn.remoteAddress) && conn.remotePort > 0;
    const text = hasRemoteEndpoint
      ? `${conn.remoteAddress}:${conn.remotePort}`
      : `${conn.localAddress}:${conn.localPort}`;

    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        success = true;
      }
    } catch {}

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {}
    }

    if (success) {
      setCopiedId(conn.id);
      onShowToast(hasRemoteEndpoint ? 'Remote Endpoint Copied' : 'Local Endpoint Copied', text);
      window.setTimeout(() => setCopiedId(null), 2000);
    } else {
      onShowToast('Copy Failed', 'Clipboard access is restricted in this window.');
    }
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
          conn.localPort.toString().includes(q) ||
          (conn.remotePort > 0 && conn.remotePort.toString().includes(q)) ||
          conn.pid.toString().includes(q)
        );
      }
      return true;
    });
  }, [connections, protocolFilter, stateFilter, searchQuery]);

  // Group connections by application executable
  const groupedConnections = useMemo<GroupedAppSockets[]>(() => {
    const map = new Map<string, GroupedAppSockets>();

    for (const conn of filteredConnections) {
      const rawName = (conn.processName || 'Unknown').trim();
      const baseName = rawName.split(/[/\\]/).pop() || rawName;
      const key = baseName.toLowerCase().trim();

      let group = map.get(key);
      if (!group) {
        group = {
          id: key,
          processName: baseName,
          pids: [],
          connections: [],
          tcpCount: 0,
          udpCount: 0,
          establishedCount: 0,
          listeningCount: 0,
          boundCount: 0,
          otherCount: 0,
        };
        map.set(key, group);
      }

      if (!group.pids.includes(conn.pid)) {
        group.pids.push(conn.pid);
      }
      group.connections.push(conn);

      if (conn.protocol === 'TCP') group.tcpCount += 1;
      else if (conn.protocol === 'UDP') group.udpCount += 1;

      if (conn.state === 'ESTABLISHED') group.establishedCount += 1;
      else if (conn.state === 'LISTENING') group.listeningCount += 1;
      else if (conn.state === 'BOUND') group.boundCount += 1;
      else group.otherCount += 1;
    }

    const list = Array.from(map.values());
    list.sort((a, b) => b.connections.length - a.connections.length);
    return list;
  }, [filteredConnections]);

  const toggleExpand = (id: string) => {
    setExpandedAppKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleExpandAll = () => {
    if (expandedAppKeys.size === groupedConnections.length) {
      setExpandedAppKeys(new Set());
    } else {
      setExpandedAppKeys(new Set(groupedConnections.map(g => g.id)));
    }
  };

  return (
    <div className="space-y-3 p-3 max-w-full pb-16 w-full">
      {/* Filter and Search Bar */}
      <div className={`rounded-xl border p-3 shadow-sm space-y-2.5 transition-colors ${
        isLight ? 'bg-white/90 border-slate-200 shadow-xs' : 'bg-slate-900/80 border-slate-800/80'
      }`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Network className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className={`text-xs font-semibold truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
              Active Network Sockets
            </h2>
            <span className="text-[11px] text-slate-400 font-mono shrink-0">
              ({filteredConnections.length} sockets {isGrouped ? `in ${groupedConnections.length} apps` : ''})
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle: Group by App vs Flat List */}
            <div className={`flex items-center gap-1 p-0.5 rounded border text-[11px] shrink-0 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                onClick={() => setIsGrouped(true)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 ${
                  isGrouped
                    ? isLight ? 'bg-white text-sky-600 font-semibold shadow-xs' : 'bg-slate-800 text-sky-400 font-semibold'
                    : isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Group by App</span>
              </button>
              <button
                onClick={() => setIsGrouped(false)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 ${
                  !isGrouped
                    ? isLight ? 'bg-white text-sky-600 font-semibold shadow-xs' : 'bg-slate-800 text-sky-400 font-semibold'
                    : isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Boxes className="w-3 h-3" />
                <span>Flat List</span>
              </button>
            </div>

            {/* Protocol Toggle Buttons */}
            <div className={`flex items-center gap-1 p-0.5 rounded border text-[11px] shrink-0 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              {(['ALL', 'TCP', 'UDP'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setProtocolFilter(p)}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    protocolFilter === p
                      ? isLight ? 'bg-white text-sky-600 font-semibold shadow-xs' : 'bg-slate-800 text-sky-400 font-semibold'
                      : isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* State Filter & Search Row */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by application name, remote IP, port, or PID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 border rounded-md text-xs focus:outline-none focus:border-sky-500 ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
                  : 'bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600'
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value as any)}
              className={`text-xs border rounded px-2.5 py-1.5 focus:outline-none focus:border-sky-500 shrink-0 cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <option value="ALL">All States</option>
              <option value="ESTABLISHED">Established</option>
              <option value="LISTENING">Listening (TCP)</option>
              <option value="BOUND">Bound (UDP)</option>
            </select>

            {isGrouped && groupedConnections.length > 0 && (
              <button
                onClick={handleToggleExpandAll}
                className="text-[11px] px-2.5 py-1.5 rounded border border-slate-800 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {expandedAppKeys.size === groupedConnections.length ? 'Collapse All' : 'Expand All'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sockets View Area */}
      {filteredConnections.length === 0 ? (
        <div className={`col-span-full rounded-xl border p-8 text-center text-slate-400 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800/80'
        }`}>
          <Network className="w-8 h-8 mx-auto text-slate-500 mb-2" />
          <p className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            No active sockets match filter.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Try resetting the protocol filter or clearing search.
          </p>
        </div>
      ) : isGrouped ? (
        /* Grouped by Application View */
        <div className="space-y-2">
          {groupedConnections.map(app => {
            const isExpanded = expandedAppKeys.has(app.id);

            return (
              <div
                key={`app_group_${app.id}`}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-xs'
                    : 'border-slate-800/80 bg-slate-900/70 hover:border-slate-700/80'
                }`}
              >
                {/* Application Group Header */}
                <div
                  onClick={() => toggleExpand(app.id)}
                  className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button className="text-slate-400 hover:text-slate-200 p-0.5 shrink-0 cursor-pointer">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <ProcessIcon
                      exeName={app.processName}
                      containerClassName={`w-7 h-7 rounded-lg p-1 border shrink-0 flex items-center justify-center overflow-hidden ${
                        isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                      className="w-4 h-4"
                      size={16}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-xs truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                          {app.processName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800/80 text-slate-400 font-mono shrink-0">
                          {app.pids.length === 1 ? `PID #${app.pids[0]}` : `${app.pids.length} PIDs`}
                        </span>
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20 font-semibold shrink-0">
                          {app.connections.length} {app.connections.length === 1 ? 'socket' : 'sockets'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Protocol & State Summary Chips */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {app.tcpCount > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {app.tcpCount} TCP
                      </span>
                    )}
                    {app.udpCount > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        {app.udpCount} UDP
                      </span>
                    )}
                    {app.establishedCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {app.establishedCount} Est.
                      </span>
                    )}
                    {app.listeningCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                        {app.listeningCount} Listen
                      </span>
                    )}
                    {app.boundCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {app.boundCount} Bound
                      </span>
                    )}
                  </div>
                </div>

                {/* Sockets Inside Application Group */}
                {isExpanded && (
                  <div className={`border-t p-2.5 space-y-2 ${
                    isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-800/70 bg-slate-950/60'
                  }`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {app.connections.map(conn => {
                        const isCopied = copiedId === conn.id;
                        const hasRemoteEndpoint = Boolean(conn.remoteAddress) && conn.remotePort > 0;

                        return (
                          <div
                            key={conn.id}
                            className={`rounded-lg border p-2.5 space-y-1.5 text-xs min-w-0 ${
                              isLight
                                ? 'bg-white border-slate-200 shadow-xs'
                                : 'border-slate-800/80 bg-slate-900/90'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                    conn.protocol === 'TCP'
                                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                      : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                  }`}
                                >
                                  {conn.protocol}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  PID #{conn.pid}
                                </span>
                              </div>

                              <span
                                className={`text-[9px] font-medium px-1.5 py-0.2 rounded shrink-0 ${
                                  conn.state === 'ESTABLISHED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : conn.state === 'LISTENING'
                                    ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                                    : isLight
                                    ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {conn.state}
                              </span>
                            </div>

                            {/* Endpoints routing tile */}
                            <div className={`p-1.5 rounded border font-mono text-[11px] flex items-center justify-between gap-2 ${
                              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800/60'
                            }`}>
                              <div className="min-w-0 flex-1 truncate">
                                <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans">
                                  {hasRemoteEndpoint ? 'Remote Endpoint' : 'Local Endpoint'}
                                </span>
                                <span className={`font-medium truncate block ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                  {hasRemoteEndpoint
                                    ? `${conn.remoteAddress}:${conn.remotePort}`
                                    : `${conn.localAddress}:${conn.localPort}`}
                                </span>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans">
                                  {hasRemoteEndpoint ? 'Local Port' : 'Protocol'}
                                </span>
                                <span className={`block ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                  {hasRemoteEndpoint ? `:${conn.localPort}` : conn.protocol}
                                </span>
                              </div>

                              <button
                                onClick={() => handleCopyEndpoint(conn)}
                                title={hasRemoteEndpoint ? "Copy remote endpoint IP:Port" : "Copy local endpoint IP:Port"}
                                className={`p-1.5 rounded transition-colors ml-1 shrink-0 cursor-pointer ${
                                  isLight ? 'hover:bg-slate-200 text-slate-500 hover:text-sky-600' : 'hover:bg-slate-800 text-slate-400 hover:text-sky-300'
                                }`}
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
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Flat Socket List View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredConnections.map(conn => {
            const isCopied = copiedId === conn.id;
            const hasRemoteEndpoint = Boolean(conn.remoteAddress) && conn.remotePort > 0;

            return (
              <div
                key={conn.id}
                className={`rounded-xl border transition-all p-3 space-y-2 text-xs min-w-0 ${
                  isLight
                    ? 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                    : 'border-slate-800/80 bg-slate-900/70 hover:bg-slate-900/90 hover:border-slate-700/80'
                }`}
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

                    <ProcessIcon
                      exeName={conn.processName}
                      containerClassName={`w-5 h-5 rounded p-0.5 border shrink-0 flex items-center justify-center overflow-hidden ${
                        isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                      className="w-3.5 h-3.5"
                    />

                    <div className="min-w-0 truncate flex-1">
                      <span className={`font-semibold truncate block ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
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
                        : isLight
                        ? 'bg-slate-100 text-slate-500 border border-slate-200'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {conn.state}
                  </span>
                </div>

                {/* Endpoints Routing Info Tile */}
                <div className={`p-2 rounded border font-mono text-[11px] flex items-center justify-between gap-2 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800/60'
                }`}>
                  <div className="min-w-0 flex-1 truncate">
                    <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans">
                      {hasRemoteEndpoint ? 'Remote Endpoint' : 'Local Endpoint'}
                    </span>
                    <span className={`font-medium truncate block ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                      {hasRemoteEndpoint
                        ? `${conn.remoteAddress}:${conn.remotePort}`
                        : `${conn.localAddress}:${conn.localPort}`}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-sans">
                      {hasRemoteEndpoint ? 'Local Port' : 'Protocol'}
                    </span>
                    <span className={`block ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                      {hasRemoteEndpoint ? `:${conn.localPort}` : conn.protocol}
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopyEndpoint(conn)}
                    title={hasRemoteEndpoint ? "Copy remote endpoint IP:Port" : "Copy local endpoint IP:Port"}
                    className={`p-1.5 rounded transition-colors ml-1 shrink-0 cursor-pointer ${
                      isLight ? 'hover:bg-slate-200 text-slate-500 hover:text-sky-600' : 'hover:bg-slate-800 text-slate-400 hover:text-sky-300'
                    }`}
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
          })}
        </div>
      )}
    </div>
  );
};
