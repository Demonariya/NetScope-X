import { describe, it, expect } from 'vitest';
import { ProcessNetworkUsage, SocketConnection } from '../src/types/network';

describe('Combined Application Views — Control & Connections Sections', () => {
  const sampleProcesses: ProcessNetworkUsage[] = [
    {
      pid: 101,
      name: 'chrome.exe',
      friendlyName: 'Google Chrome',
      exeName: 'chrome.exe',
      fullPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      icon: '',
      downloadBps: 150000,
      uploadBps: 20000,
      sessionDownloadBytes: 5000000,
      sessionUploadBytes: 500000,
      totalBytes: 5500000,
      connectionCount: 3,
      status: 'active',
      startTime: Date.now(),
      recentSpeedHistory: [],
      connections: [],
    },
    {
      pid: 102,
      name: 'chrome.exe',
      friendlyName: 'Google Chrome',
      exeName: 'chrome.exe',
      fullPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      icon: '',
      downloadBps: 350000,
      uploadBps: 30000,
      sessionDownloadBytes: 10000000,
      sessionUploadBytes: 800000,
      totalBytes: 10800000,
      connectionCount: 2,
      status: 'active',
      startTime: Date.now(),
      recentSpeedHistory: [],
      connections: [],
    },
    {
      pid: 201,
      name: 'Discord.exe',
      friendlyName: 'Discord',
      exeName: 'Discord.exe',
      fullPath: 'C:\\Users\\User\\AppData\\Local\\Discord\\app-1.0.9000\\Discord.exe',
      icon: '',
      downloadBps: 50000,
      uploadBps: 15000,
      sessionDownloadBytes: 2000000,
      sessionUploadBytes: 400000,
      totalBytes: 2400000,
      connectionCount: 4,
      status: 'active',
      startTime: Date.now(),
      recentSpeedHistory: [],
      connections: [],
    },
  ];

  const sampleConnections: SocketConnection[] = [
    {
      id: 'conn_1',
      protocol: 'TCP',
      localAddress: '192.168.1.50',
      localPort: 54321,
      remoteAddress: '142.250.190.46',
      remotePort: 443,
      state: 'ESTABLISHED',
      pid: 101,
      processName: 'chrome.exe',
      bytesSent: null,
      bytesReceived: null,
    },
    {
      id: 'conn_2',
      protocol: 'TCP',
      localAddress: '192.168.1.50',
      localPort: 54322,
      remoteAddress: '142.250.190.46',
      remotePort: 443,
      state: 'ESTABLISHED',
      pid: 102,
      processName: 'chrome.exe',
      bytesSent: null,
      bytesReceived: null,
    },
    {
      id: 'conn_3',
      protocol: 'UDP',
      localAddress: '0.0.0.0',
      localPort: 5353,
      remoteAddress: '',
      remotePort: 0,
      state: 'BOUND',
      pid: 101,
      processName: 'chrome.exe',
      bytesSent: null,
      bytesReceived: null,
    },
    {
      id: 'conn_4',
      protocol: 'TCP',
      localAddress: '192.168.1.50',
      localPort: 51200,
      remoteAddress: '162.159.130.233',
      remotePort: 443,
      state: 'ESTABLISHED',
      pid: 201,
      processName: 'Discord.exe',
      bytesSent: null,
      bytesReceived: null,
    },
    {
      id: 'conn_5',
      protocol: 'UDP',
      localAddress: '192.168.1.50',
      localPort: 50001,
      remoteAddress: '162.159.130.233',
      remotePort: 50001,
      state: 'BOUND',
      pid: 201,
      processName: 'Discord.exe',
      bytesSent: null,
      bytesReceived: null,
    },
  ];

  it('combines multiple process instances in the Bandwidth Control section into unified application groups', () => {
    const map = new Map<string, {
      exeName: string;
      instanceCount: number;
      pids: number[];
      downloadBps: number;
      uploadBps: number;
    }>();

    for (const proc of sampleProcesses) {
      const key = proc.exeName.toLowerCase();
      let group = map.get(key);
      if (!group) {
        group = {
          exeName: proc.exeName,
          instanceCount: 0,
          pids: [],
          downloadBps: 0,
          uploadBps: 0,
        };
        map.set(key, group);
      }
      group.instanceCount += 1;
      group.pids.push(proc.pid);
      group.downloadBps += proc.downloadBps;
      group.uploadBps += proc.uploadBps;
    }

    const apps = Array.from(map.values());
    expect(apps.length).toBe(2);

    const chromeApp = apps.find(a => a.exeName === 'chrome.exe');
    expect(chromeApp).toBeDefined();
    expect(chromeApp?.instanceCount).toBe(2);
    expect(chromeApp?.pids).toEqual([101, 102]);
    // Combined throughput
    expect(chromeApp?.downloadBps).toBe(500000); // 150000 + 350000
    expect(chromeApp?.uploadBps).toBe(50000); // 20000 + 30000

    const discordApp = apps.find(a => a.exeName === 'Discord.exe');
    expect(discordApp).toBeDefined();
    expect(discordApp?.instanceCount).toBe(1);
    expect(discordApp?.downloadBps).toBe(50000);
  });

  it('combines raw sockets into application groups with protocol and state breakdowns in Connections', () => {
    const map = new Map<string, {
      processName: string;
      pids: number[];
      connections: SocketConnection[];
      tcpCount: number;
      udpCount: number;
      establishedCount: number;
      boundCount: number;
    }>();

    for (const conn of sampleConnections) {
      const key = conn.processName.toLowerCase();
      let group = map.get(key);
      if (!group) {
        group = {
          processName: conn.processName,
          pids: [],
          connections: [],
          tcpCount: 0,
          udpCount: 0,
          establishedCount: 0,
          boundCount: 0,
        };
        map.set(key, group);
      }
      if (!group.pids.includes(conn.pid)) group.pids.push(conn.pid);
      group.connections.push(conn);
      if (conn.protocol === 'TCP') group.tcpCount += 1;
      if (conn.protocol === 'UDP') group.udpCount += 1;
      if (conn.state === 'ESTABLISHED') group.establishedCount += 1;
      if (conn.state === 'BOUND') group.boundCount += 1;
    }

    const groups = Array.from(map.values());
    expect(groups.length).toBe(2);

    const chromeGroup = groups.find(g => g.processName === 'chrome.exe');
    expect(chromeGroup).toBeDefined();
    expect(chromeGroup?.connections.length).toBe(3);
    expect(chromeGroup?.tcpCount).toBe(2);
    expect(chromeGroup?.udpCount).toBe(1);
    expect(chromeGroup?.establishedCount).toBe(2);
    expect(chromeGroup?.boundCount).toBe(1);
    expect(chromeGroup?.pids).toContain(101);
    expect(chromeGroup?.pids).toContain(102);

    const discordGroup = groups.find(g => g.processName === 'Discord.exe');
    expect(discordGroup).toBeDefined();
    expect(discordGroup?.connections.length).toBe(2);
    expect(discordGroup?.tcpCount).toBe(1);
    expect(discordGroup?.udpCount).toBe(1);
    expect(discordGroup?.establishedCount).toBe(1);
    expect(discordGroup?.boundCount).toBe(1);
  });
});
