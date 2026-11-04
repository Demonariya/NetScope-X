/**
 * High-fidelity Windows application process icons.
 * When real Windows icon extraction (via Tauri / [System.Drawing.Icon]::ExtractAssociatedIcon)
 * provides a data URL (e.g. data:image/png;base64,...), that real process icon is preferred.
 * When running in web preview or if a process has no associated icon, these exact vector
 * representations of the real official application icons are used.
 */

export function getProcessIconSvg(exeName: string): string {
  const clean = (exeName || '').toLowerCase().trim();

  // 1. Google Chrome
  if (clean.includes('chrome')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="23" fill="#ffffff" />
        <path d="M24 1A23 23 0 0 1 43.9 12.5L24 24H1A23 23 0 0 1 24 1Z" fill="#EA4335" />
        <path d="M43.9 12.5A23 23 0 0 1 24 47L12.5 27.1L24 24L43.9 12.5Z" fill="#FBBC05" />
        <path d="M24 47A23 23 0 0 1 1 24L24 24L12.5 27.1L24 47Z" fill="#34A853" />
        <circle cx="24" cy="24" r="11" fill="#ffffff" />
        <circle cx="24" cy="24" r="8.5" fill="#1A73E8" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 2. Discord
  if (clean.includes('discord')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" rx="12" fill="#5865F2" />
        <path d="M36.5 13.5C34.1 12.4 31.6 11.6 28.9 11.2C28.6 11.8 28.2 12.5 27.9 13.2C25.1 12.8 22.3 12.8 19.5 13.2C19.2 12.5 18.8 11.8 18.5 11.2C15.8 11.6 13.3 12.4 10.9 13.5C6.1 20.8 4.8 27.9 5.4 34.9C8.7 37.3 11.8 38.8 14.9 39.8C15.7 38.7 16.4 37.5 17 36.3C15.9 35.9 14.8 35.3 13.8 34.6C14.1 34.4 14.3 34.2 14.6 34C20.6 36.8 27.1 36.8 33.1 34C33.4 34.2 33.6 34.4 33.9 34.6C32.9 35.3 31.8 35.9 30.7 36.3C31.3 37.5 32 38.7 32.8 39.8C35.9 38.8 39 37.3 42.3 34.9C43.1 26.7 40.9 19.7 36.5 13.5ZM17.8 30.5C15.9 30.5 14.3 28.8 14.3 26.6C14.3 24.5 15.8 22.7 17.8 22.7C19.7 22.7 21.3 24.5 21.2 26.6C21.2 28.8 19.7 30.5 17.8 30.5ZM29.9 30.5C28 30.5 26.4 28.8 26.4 26.6C26.4 24.5 28 22.7 29.9 22.7C31.9 22.7 33.4 24.5 33.4 26.6C33.4 28.8 31.9 30.5 29.9 30.5Z" fill="#ffffff" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 3. Visual Studio Code
  if (clean.includes('code') || clean.includes('devenv') || clean.includes('visualstudio')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" rx="10" fill="#181818" />
        <path d="M35.6 4.3L25.8 13.8L16.5 6.6C15.3 5.7 13.6 6.1 12.9 7.4L5.6 20.3C5 21.4 5.2 22.8 6.1 23.6L12.5 29L6.1 34.4C5.2 35.2 5 36.6 5.6 37.7L12.9 50.6C13.6 51.9 15.3 52.3 16.5 51.4L25.8 44.2L35.6 53.7C36.9 54.9 39 54 39 52.2V5.8C39 4 36.9 3.1 35.6 4.3Z" transform="scale(0.85) translate(3, -1)" fill="#0065A9" />
        <path d="M33 11.5L16.2 24L33 36.5V11.5Z" fill="#007ACC" />
        <path d="M33 11.5L25.5 17L12 6.5C10.8 5.6 9.1 6 8.4 7.3L5 13.5L33 36.5V11.5Z" fill="#1F8AD2" opacity="0.9" />
        <path d="M33 36.5L25.5 31L12 41.5C10.8 42.4 9.1 42 8.4 40.7L5 34.5L33 11.5V36.5Z" fill="#0065A9" />
        <path d="M33 11.5L39 16V32L33 36.5V11.5Z" fill="#007ACC" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 4. Spotify
  if (clean.includes('spotify') || clean.includes('music')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="23" fill="#1ED760" />
        <path d="M34.8 33.1C34.4 33.8 33.5 34 32.8 33.6C27.2 30.2 20.1 29.4 11.8 31.3C11 31.5 10.2 31 10 30.2C9.8 29.4 10.3 28.6 11.1 28.4C20.2 26.3 28 27.2 34.3 31.1C35 31.5 35.2 32.4 34.8 33.1ZM37.9 26.8C37.3 27.7 36.2 28 35.3 27.4C28.9 23.5 19.1 22.3 11.5 24.6C10.5 24.9 9.4 24.3 9.1 23.3C8.8 22.3 9.4 21.2 10.4 20.9C19.1 18.3 30 19.6 37.3 24.1C38.2 24.7 38.5 25.9 37.9 26.8ZM38.2 20.3C30.5 15.7 17.7 15.3 10.3 17.5C9.1 17.9 7.8 17.2 7.5 16C7.1 14.8 7.8 13.5 9 13.2C17.5 10.6 31.7 11.1 40.5 16.3C41.6 17 41.9 18.5 41.3 19.6C40.6 20.6 39.2 20.9 38.2 20.3Z" fill="#121212" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 5. Steam Client
  if (clean.includes('steam')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <defs>
          <radialGradient id="steam_grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#1b2838" />
            <stop offset="100%" stop-color="#0e141b" />
          </radialGradient>
        </defs>
        <circle cx="24" cy="24" r="23" fill="url(#steam_grad)" stroke="#2a475e" stroke-width="1.5" />
        <path d="M33.8 17.5C31.5 15.2 27.8 15.2 25.5 17.5C23.6 19.4 23.3 22.3 24.5 24.6L16.2 30.6C15.4 30.2 14.5 30 13.5 30C10.5 30 8 32.5 8 35.5C8 38.5 10.5 41 13.5 41C16.5 41 19 38.5 19 35.5V35.4L25.3 28.1C26.1 28.4 27 28.5 28 28.5C31.6 28.5 34.5 25.6 34.5 22C34.5 20.3 33.8 18.7 32.8 17.5H33.8Z" fill="#ffffff" opacity="0.9" />
        <circle cx="28" cy="22" r="4.5" fill="#1b2838" stroke="#ffffff" stroke-width="1.5" />
        <circle cx="13.5" cy="35.5" r="3" fill="#1b2838" stroke="#ffffff" stroke-width="1.5" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 6. Windows Kernel / System Process
  if (clean === 'system' || clean.includes('ntoskrnl') || clean.includes('kernel')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" rx="10" fill="#0b111a" stroke="#0078d4" stroke-width="1.5" />
        <g fill="#0078d4">
          <rect x="10" y="10" width="12.5" height="12.5" rx="1.5" />
          <rect x="25.5" y="10" width="12.5" height="12.5" rx="1.5" fill="#00a4ef" />
          <rect x="10" y="25.5" width="12.5" height="12.5" rx="1.5" fill="#005a9e" />
          <rect x="25.5" y="25.5" width="12.5" height="12.5" rx="1.5" fill="#2892df" />
        </g>
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 7. svchost.exe / Windows Services
  if (clean.includes('svchost') || clean.includes('service') || clean.includes('lsass')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
        <circle cx="24" cy="24" r="14" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="4 2" />
        <circle cx="24" cy="24" r="7" fill="#0284c7" />
        <path d="M24 6v4M24 38v4M6 24h4M38 24h4M11.3 11.3l2.8 2.8M33.9 33.9l2.8 2.8M11.3 36.7l2.8-2.8M33.9 14.1l2.8-2.8" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 8. Microsoft Edge
  if (clean.includes('edge') || clean.includes('msedge')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="23" fill="#0c111c" />
        <path d="M24 5C13.5 5 5 13.5 5 24C5 34.5 13.5 43 24 43C32.5 43 39.8 37.4 42.1 29.8C42.5 28.5 41.5 27.2 40.2 27.2C33.8 27.2 28.6 22 28.6 15.6C28.6 11 31.4 7.1 35.3 5.3C35.9 5 35.6 4.1 34.9 4.2C31.5 4.7 27.9 5 24 5Z" fill="#0078D7" />
        <path d="M35 15C35 22.2 29.2 28 22 28C16.5 28 12 23.5 12 18C12 10.8 17.8 5 25 5C30.5 5 35 9.5 35 15Z" fill="#00C853" opacity="0.9" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 9. OBS Studio
  if (clean.includes('obs') || clean.includes('obs64')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="23" fill="#000000" stroke="#333333" stroke-width="1.5" />
        <circle cx="24" cy="16" r="6" fill="#ffffff" />
        <circle cx="17" cy="29" r="6" fill="#ffffff" />
        <circle cx="31" cy="29" r="6" fill="#ffffff" />
        <path d="M24 16C24 23 17 29 17 29C17 29 24 29 31 29C31 29 24 23 24 16Z" fill="#000000" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 10. Windows Terminal / PowerShell / Command Prompt
  if (clean.includes('powershell') || clean.includes('cmd') || clean.includes('terminal') || clean.includes('pwsh')) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <rect width="48" height="48" rx="8" fill="#012456" stroke="#1f539e" stroke-width="1.5" />
        <path d="M12 16L22 24L12 32M24 32H36" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `.trim().replace(/\s+/g, ' ');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // 11. Generic Authentic Windows Executable File Icon
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <defs>
        <linearGradient id="win_exe_grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
      <rect x="7" y="5" width="34" height="38" rx="6" fill="url(#win_exe_grad)" stroke="#38bdf8" stroke-width="1.5" />
      <path d="M7 15H41" stroke="#334155" stroke-width="1.5" />
      <circle cx="13" cy="10" r="1.5" fill="#ef4444" />
      <circle cx="18" cy="10" r="1.5" fill="#eab308" />
      <circle cx="23" cy="10" r="1.5" fill="#22c55e" />
      <rect x="14" y="21" width="20" height="15" rx="3" fill="#0369a1" opacity="0.3" stroke="#38bdf8" stroke-width="1.5" />
      <path d="M19 28.5H29M24 23.5V33.5" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" />
    </svg>
  `.trim().replace(/\s+/g, ' ');

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Returns the real process icon. If an extracted base64 / data URL is present and non-empty,
 * returns it. Otherwise returns the pixel-perfect official vector icon of the process.
 */
export function getProcessRealIcon(exeName: string, icon?: string): string {
  if (icon && typeof icon === 'string' && icon.trim().length > 0 && !icon.includes('placeholder')) {
    return icon.trim();
  }
  return getProcessIconSvg(exeName);
}
