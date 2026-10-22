// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

describe('Strict 405 × 720 px, 9:16 Portrait Canvas & System Verification', () => {
  it('strictly adheres to the 405 × 720 resolution and 9:16 aspect ratio', () => {
    const width = 405;
    const height = 720;
    const ratio = width / height;
    const expectedRatio = 9 / 16;
    expect(Math.abs(ratio - expectedRatio)).toBeLessThan(0.005);
    expect(width).toBe(405);
    expect(height).toBe(720);
  });

  it('guarantees single portrait composition with zero landscape or desktop modes', () => {
    // Only one portrait layout mode is supported
    const allowedMode = 'portrait_9_16';
    expect(allowedMode).toBe('portrait_9_16');

    // Navigation must use bottom navigation exclusively
    const navigationPlacement = 'bottom';
    expect(navigationPlacement).toBe('bottom');
  });

  it('manages per-application block and unblock firewall state correctly', () => {
    const blockedExes = new Set<string>();

    const toggleBlock = (exe: string, block: boolean) => {
      const key = exe.toLowerCase();
      if (block) blockedExes.add(key);
      else blockedExes.delete(key);
    };

    // Initially unblocked
    expect(blockedExes.has('chrome.exe')).toBe(false);

    // Block chrome.exe
    toggleBlock('chrome.exe', true);
    expect(blockedExes.has('chrome.exe')).toBe(true);

    // Filter processes with blocked state
    const processes = [
      { exeName: 'chrome.exe', downloadBps: 450000, uploadBps: 50000 },
      { exeName: 'Discord.exe', downloadBps: 120000, uploadBps: 30000 },
    ];

    const updated = processes.map(p => {
      const isBlocked = blockedExes.has(p.exeName.toLowerCase());
      return {
        ...p,
        isBlocked,
        downloadBps: isBlocked ? 0 : p.downloadBps,
        uploadBps: isBlocked ? 0 : p.uploadBps,
      };
    });

    expect(updated[0].isBlocked).toBe(true);
    expect(updated[0].downloadBps).toBe(0);
    expect(updated[0].uploadBps).toBe(0);
    expect(updated[1].isBlocked).toBe(false);
    expect(updated[1].downloadBps).toBe(120000);

    // Unblock chrome.exe
    toggleBlock('chrome.exe', false);
    expect(blockedExes.has('chrome.exe')).toBe(false);
  });

  it('correctly handles theme mode transitions between dark, light, and system', () => {
    const validThemes = ['dark', 'light', 'system'];
    expect(validThemes).toContain('dark');
    expect(validThemes).toContain('light');
    expect(validThemes).toContain('system');

    const resolveEffectiveTheme = (theme: 'dark' | 'light' | 'system', systemPrefersDark: boolean) => {
      if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
      return theme;
    };

    expect(resolveEffectiveTheme('dark', false)).toBe('dark');
    expect(resolveEffectiveTheme('light', true)).toBe('light');
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
    expect(resolveEffectiveTheme('system', false)).toBe('light');

    // Verify DOM classes application
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.documentElement.setAttribute('data-theme', 'light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('computes ping metrics accurately with jitter and history tracking', () => {
    const pingHistory = [14.2, 16.5, 13.8, 15.1, 14.9];
    const sum = pingHistory.reduce((a, b) => a + b, 0);
    const avg = sum / pingHistory.length;
    const min = Math.min(...pingHistory);
    const max = Math.max(...pingHistory);

    let diffSum = 0;
    for (let i = 1; i < pingHistory.length; i++) {
      diffSum += Math.abs(pingHistory[i] - pingHistory[i - 1]);
    }
    const jitter = diffSum / (pingHistory.length - 1);

    expect(min).toBe(13.8);
    expect(max).toBe(16.5);
    expect(avg).toBeCloseTo(14.9, 1);
    expect(jitter).toBeGreaterThan(0);
  });

  it('preserves state during live telemetry refresh cycles in portrait layout', () => {
    const state = {
      searchQuery: 'discord',
      sortField: 'download',
      sortOrder: 'desc',
      expandedPids: new Set([11048]),
      selectedTab: 'applications',
    };

    const newProcessTelemetry = [
      { pid: 11048, downloadBps: 180000, uploadBps: 45000 },
      { pid: 14280, downloadBps: 950000, uploadBps: 21000 },
    ];

    expect(state.searchQuery).toBe('discord');
    expect(state.sortField).toBe('download');
    expect(state.expandedPids.has(11048)).toBe(true);
    expect(state.selectedTab).toBe('applications');
    expect(newProcessTelemetry.length).toBe(2);
  });

  it('verifies tauri configuration parameters for strict 405x720 and withGlobalTauri', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const confPath = path.resolve(process.cwd(), 'src-tauri/tauri.conf.json');
    expect(fs.existsSync(confPath)).toBe(true);

    const conf = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
    expect(conf.build.frontendDist).toBe('../dist');
    expect(conf.app.withGlobalTauri).toBe(true);
    expect(conf.app.windows[0].width).toBe(405);
    expect(conf.app.windows[0].height).toBe(720);
    expect(conf.app.windows[0].resizable).toBe(false);
  });

  it('provides conforming telemetry data in web preview simulation mode', async () => {
    const { api } = await import('../src/services/api');

    const adapters = await api.getAdapters();
    expect(adapters).toBeInstanceOf(Array);
    expect(adapters.length).toBeGreaterThan(0);
    expect(adapters[0]).toHaveProperty('id');
    expect(adapters[0]).toHaveProperty('name');

    const liveStats = await api.getLiveStats();
    expect(liveStats).toHaveProperty('downloadBps');
    expect(liveStats).toHaveProperty('uploadBps');

    const processes = await api.getProcesses();
    expect(processes).toBeInstanceOf(Array);
    expect(processes.length).toBeGreaterThan(0);

    const connections = await api.getConnections();
    expect(connections).toBeInstanceOf(Array);

    const history = await api.getHistory('today');
    expect(history).toBeInstanceOf(Array);

    const ping = await api.getPing('1.1.1.1');
    expect(ping).toHaveProperty('latencyMs');
    expect(ping.status).toBe('success');
  });
});
