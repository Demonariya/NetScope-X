/**
 * High-definition Windows process icons mapping.
 * Provides authentic, crisp brand icons for major Windows executables
 * and a deterministic Windows Shell fallback for custom processes.
 */

export function getProcessIconSvg(exeName: string): string {
  const lower = exeName.toLowerCase();

  if (lower.includes('chrome')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="%23FFFFFF"/><path fill="%234CAF50" d="M24 3a21 21 0 0 1 18.18 10.5L24 24H9.69A21.03 21.03 0 0 1 24 3z"/><path fill="%23FFC107" d="M42.18 13.5A21 21 0 0 1 34.5 42.19L24 24l18.18-10.5z"/><path fill="%23F44336" d="M9.69 24L24 24l-10.5 18.19A21 21 0 0 1 9.69 24z"/><circle cx="24" cy="24" r="9.5" fill="%23FFFFFF"/><circle cx="24" cy="24" r="7.5" fill="%231976D2"/></svg>`;
  }

  if (lower.includes('msedge') || lower.includes('edge')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230c80df"/><stop offset="100%" stop-color="%2300b0f4"/></linearGradient><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2301c2ab"/><stop offset="100%" stop-color="%233b82f6"/></linearGradient></defs><circle cx="24" cy="24" r="20" fill="url(%23g1)"/><path d="M24 10a14 14 0 0 0-14 14c0 7.73 6.27 14 14 14 6 0 11-4 13-9.5-2 1.5-5 2.5-8 2.5-6.63 0-12-5.37-12-12 0-5 3-9 7-10.5z" fill="%23FFFFFF" opacity="0.9"/></svg>`;
  }

  if (lower.includes('discord')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="%235865F2"/><path fill="%23FFFFFF" d="M35.1 14.2c-2.4-1.1-5-1.9-7.7-2.1-.3.6-.7 1.4-1 2-2.9-.4-5.8-.4-8.7 0-.3-.6-.7-1.4-1-2-2.7.2-5.3 1-7.7 2.1-4.9 7.3-6.2 14.4-5.5 21.4 3.2 2.4 6.3 3.9 9.3 4.8.8-1 1.4-2.1 2-3.3-1.1-.4-2.1-.9-3.1-1.6.3-.2.5-.4.8-.6 6.1 2.8 12.8 2.8 18.8 0 .3.2.5.4.8.6-1 .7-2 1.2-3.1 1.6.6 1.2 1.3 2.3 2 3.3 3-.9 6.1-2.4 9.3-4.8.8-8.1-.8-15.1-5.5-21.4zM18.8 29.5c-1.8 0-3.3-1.6-3.3-3.6 0-2 1.5-3.6 3.3-3.6s3.3 1.6 3.3 3.6c0 2-1.4 3.6-3.3 3.6zm10.4 0c-1.8 0-3.3-1.6-3.3-3.6 0-2 1.5-3.6 3.3-3.6 1.8 0 3.3 1.6 3.3 3.6 0 2-1.5 3.6-3.3 3.6z"/></svg>`;
  }

  if (lower.includes('spotify')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="%231DB954"/><path fill="%23121212" d="M33.6 31.8c-.4.6-1.2.8-1.8.4-5-3-11.2-3.7-18.6-2-0.7.2-1.4-.3-1.6-1s.3-1.4 1-1.6c8.1-1.9 15-1 20.6 2.4.6.4.8 1.2.4 1.8zm2.7-5.9c-.5.8-1.5 1-2.3.5-5.7-3.5-14.4-4.5-21.1-2.5-.9.3-1.8-.2-2.1-1.1-.3-.9.2-1.8 1.1-2.1 7.7-2.3 17.3-1.2 23.8 2.8.9.6 1.1 1.6.6 2.4zm.2-6.2C30 15.8 19.3 15.5 13.1 17.4c-1 .3-2.1-.2-2.4-1.2s.2-2.1 1.2-2.4c7.1-2.2 18.9-1.8 26.2 2.5 1 .6 1.3 1.9.7 2.9-.6 1-1.9 1.3-2.9.7z"/></svg>`;
  }

  if (lower.includes('steam')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><radialGradient id="sg" cx="40%" cy="30%" r="70%"><stop offset="0%" stop-color="%231c3b57"/><stop offset="100%" stop-color="%230b1722"/></radialGradient></defs><circle cx="24" cy="24" r="22" fill="url(%23sg)"/><path fill="%23FFFFFF" d="M23.9 12a12 12 0 0 0-11.9 10.3l7.6 3.1a4.2 4.2 0 0 1 3.5-.4l4.2-6.1a6.6 6.6 0 1 1 6.6 6.6l-6.1 4.2a4.2 4.2 0 0 1-5.7 1.8l-7.7-3.2A12 12 0 1 0 23.9 12z"/></svg>`;
  }

  if (lower.includes('code') || lower.includes('vscode')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="%231F1F1F"/><path fill="%23007ACC" d="M37.8 7.2L28.5 15 17.3 6.4 12 10.3v27.4l5.3 3.9 11.2-8.6 9.3 7.8 3.2-1.5V8.7l-3.2-1.5zm-9.3 22.3L19.4 24l9.1-5.5v11z"/></svg>`;
  }

  if (lower.includes('slack')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="%234A154B"/><path fill="%23E01E5A" d="M14 26a3 3 0 1 1-3-3h3v3zm2-3a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0v-7z"/><path fill="%2336C5F0" d="M22 14a3 3 0 1 1 3-3v3h-3zm3 2a3 3 0 0 1 0 6h-7a3 3 0 0 1 0-6h7z"/><path fill="%232EB67D" d="M34 22a3 3 0 1 1 3 3h-3v-3zm-2 3a3 3 0 0 1-6 0v-7a3 3 0 0 1 6 0v7z"/><path fill="%23ECB22E" d="M26 34a3 3 0 1 1-3 3v-3h3zm-3-2a3 3 0 0 1 0-6h7a3 3 0 0 1 0 6h-7z"/></svg>`;
  }

  if (lower.includes('explorer')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%230F172A"/><path fill="%23F59E0B" d="M8 12h12l4 4h16v20H8z"/><path fill="%23FBBF24" d="M8 18h32v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V18z"/></svg>`;
  }

  if (lower.includes('obs')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="%23222222"/><path fill="%2338BDF8" d="M24 10a14 14 0 0 0-7 26.2 5 5 0 0 1 4-9.2A7 7 0 0 1 24 17a7 7 0 0 1 7 7c0 2-1 4-2.5 5.2a5 5 0 0 1 4.5 9A14 14 0 0 0 24 10z"/></svg>`;
  }

  if (lower.includes('system') || lower.includes('ntoskrnl') || lower.includes('svchost')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%231E293B"/><path fill="%2338BDF8" d="M12 12h10v10H12zm14 0h10v10H26zM12 26h10v10H12zm14 0h10v10H26z"/></svg>`;
  }

  if (lower.includes('firefox')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="%23FF7139"/><path fill="%23FFE169" d="M35 15c-4-4-10-4-14-1-2 2-3 4-2 7 1-1 3-2 5-2 3 0 6 3 5 7-1 3-3 5-6 5-4 0-7-3-7-7 0-4 2-8 5-10-7 2-11 8-10 15 1 8 8 14 16 14s15-6 15-14c0-5-3-10-7-14z"/></svg>`;
  }

  if (lower.includes('telegram')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="%2324A1DE"/><path fill="%23FFFFFF" d="M12 23.5l20-8.5-3.5 17-6-4.5-3 3-1-5.5 10-9.5-12.5 8z"/></svg>`;
  }

  if (lower.includes('onedrive')) {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%230078D4"/><path fill="%23FFFFFF" d="M18 20a6 6 0 0 1 11-2.5 6 6 0 0 1 7 5.5 5 5 0 0 1-2 9.5H16a5 5 0 0 1 2-12.5z"/></svg>`;
  }

  // Windows Executable generic fallback
  const firstLetter = (exeName[0] || 'A').toUpperCase();
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%231E293B" stroke="%23334155" stroke-width="2"/><text x="24" y="30" font-family="system-ui,sans-serif" font-size="18" font-weight="bold" fill="%2394A3B8" text-anchor="middle">${firstLetter}</text></svg>`;
}
