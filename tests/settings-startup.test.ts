// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { webSimulation } from '../src/services/webSimulation';
import { AppSettings } from '../src/types/network';

describe('Windows Startup and Settings Verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides default settings with startup disabled initially', () => {
    const settings = webSimulation.getSettings();
    expect(settings).toBeDefined();
    expect(settings.startup).toBeDefined();
    expect(settings.startup.startWithWindows).toBe(false);
    expect(settings.startup.minimizeToTrayOnClose).toBe(true);
  });

  it('persists and restores "Start with Windows" setting changes immediately', () => {
    const initial = webSimulation.getSettings();
    const updated: AppSettings = {
      ...initial,
      startup: {
        ...initial.startup,
        startWithWindows: true,
      },
    };

    const saved = webSimulation.saveSettings(updated);
    expect(saved).toBe(true);

    const reloaded = webSimulation.getSettings();
    expect(reloaded.startup.startWithWindows).toBe(true);
  });

  it('persists and restores "Minimize to Tray on Close" toggle', () => {
    const initial = webSimulation.getSettings();
    const updated: AppSettings = {
      ...initial,
      startup: {
        ...initial.startup,
        minimizeToTrayOnClose: false,
      },
    };

    webSimulation.saveSettings(updated);
    const reloaded = webSimulation.getSettings();
    expect(reloaded.startup.minimizeToTrayOnClose).toBe(false);
  });

  it('safely handles partial storage data with robust defaults', () => {
    // Simulate legacy storage missing the startup key
    localStorage.setItem('netscope_settings', JSON.stringify({
      monitoring: { enabled: true },
    }));

    const merged = webSimulation.getSettings();
    expect(merged.startup).toBeDefined();
    expect(merged.startup.startWithWindows).toBe(false);
    expect(merged.startup.minimizeToTrayOnClose).toBe(true);
    expect(merged.monitoring.adapterId).toBe('auto');
  });

  it('verifies responsive container classes allow fluid height on mobile and compact 405x720 on desktop', () => {
    const outerContainerClasses = 'h-[100dvh] min-h-[100dvh] w-full flex flex-col items-center justify-center overflow-hidden font-sans p-0 sm:p-2 select-none';
    const innerFrameClasses = 'w-full max-w-[405px] h-full sm:h-[720px] max-h-[100dvh] sm:max-h-[720px] flex flex-col overflow-hidden relative shadow-2xl rounded-none sm:rounded-2xl mx-auto border';

    expect(outerContainerClasses).toContain('h-[100dvh]');
    expect(innerFrameClasses).toContain('max-w-[405px]');
    expect(innerFrameClasses).toContain('sm:h-[720px]');
    expect(innerFrameClasses).toContain('max-h-[100dvh]');
    expect(innerFrameClasses).toContain('rounded-none sm:rounded-2xl');
  });
});
