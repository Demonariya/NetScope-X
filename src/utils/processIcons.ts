/**
 * Neutral fallback used when Windows cannot extract an executable's actual icon.
 * Returns a fully encoded, browser-safe SVG data URL.
 */
export function getProcessIconSvg(exeName: string): string {
  const clean = (exeName || '').toLowerCase();
  
  let primaryColor = '%2338bdf8'; // sky
  let iconPath = '<path d="M15 23h18M15 29h12M15 35h8" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round"/>';

  if (clean.includes('chrome') || clean.includes('edge') || clean.includes('firefox')) {
    primaryColor = '%2338bdf8';
    iconPath = '<circle cx="24" cy="24" r="10" stroke="%2338bdf8" stroke-width="2" fill="none"/><circle cx="24" cy="24" r="4" fill="%2338bdf8"/>';
  } else if (clean.includes('discord')) {
    primaryColor = '%23818cf8';
    iconPath = '<path d="M16 20a3 3 0 00-3 3v6a3 3 0 003 3h2v-3h12v3h2a3 3 0 003-3v-6a3 3 0 00-3-3H16z" fill="%23818cf8"/>';
  } else if (clean.includes('code')) {
    primaryColor = '%2360a5fa';
    iconPath = '<path d="M19 19l-5 5 5 5M29 19l5 5-5 5M26 16l-4 16" stroke="%2360a5fa" stroke-width="2" stroke-linecap="round"/>';
  } else if (clean.includes('spotify')) {
    primaryColor = '%2334d399';
    iconPath = '<circle cx="24" cy="24" r="12" fill="%2310b981"/><path d="M18 21c4-1 8 0 12 2M19 25c3-1 6 0 10 2M20 29c2-1 5 0 8 1" stroke="%23ffffff" stroke-width="2" stroke-linecap="round"/>';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` +
    `<rect x="4" y="6" width="40" height="36" rx="8" fill="%230f172a" stroke="${primaryColor}" stroke-width="2"/>` +
    `<path d="M4 16h40" stroke="%23334155" stroke-width="1.5"/>` +
    `<circle cx="10" cy="11" r="1.5" fill="%23ef4444"/>` +
    `<circle cx="15" cy="11" r="1.5" fill="%23eab308"/>` +
    `<circle cx="20" cy="11" r="1.5" fill="%2322c55e"/>` +
    iconPath +
    `</svg>`;

  return `data:image/svg+xml;utf8,${svg}`;
}
