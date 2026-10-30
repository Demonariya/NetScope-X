export const DEFAULT_ACCENT_COLOR = '#0ea5e9';

export interface AccentOption {
  hex: string;
  label: string;
}

export const ACCENT_PALETTE: AccentOption[] = [
  { hex: '#0ea5e9', label: 'Electric Blue' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#f43f5e', label: 'Rose' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#f97316', label: 'Orange' },
];

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function mixHex(base: string, target: string, amount: number): string {
  const normalizedBase = normalizeHexColor(base) ?? DEFAULT_ACCENT_COLOR;
  const normalizedTarget = normalizeHexColor(target) ?? '#ffffff';
  const from = normalizedBase.slice(1).match(/.{2}/g)!.map(part => parseInt(part, 16));
  const to = normalizedTarget.slice(1).match(/.{2}/g)!.map(part => parseInt(part, 16));
  const ratio = Math.min(1, Math.max(0, amount));
  return `#${from.map((value, index) => Math.round(value + (to[index] - value) * ratio).toString(16).padStart(2, '0')).join('')}`;
}

/** Re-map Tailwind v4 sky tokens to the selected accent at runtime. */
export function getAccentCssVariables(input: unknown): Record<string, string> {
  const accent = normalizeHexColor(input) ?? DEFAULT_ACCENT_COLOR;
  const darker = (amount: number) => mixHex(accent, '#000000', amount);
  const lighter = (amount: number) => mixHex(accent, '#ffffff', amount);
  return {
    '--color-sky-50': lighter(0.94),
    '--color-sky-100': lighter(0.88),
    '--color-sky-200': lighter(0.72),
    '--color-sky-300': lighter(0.48),
    '--color-sky-400': accent,
    '--color-sky-500': accent,
    '--color-sky-600': darker(0.14),
    '--color-sky-700': darker(0.27),
    '--color-sky-800': darker(0.41),
    '--color-sky-900': darker(0.56),
    '--color-sky-950': darker(0.76),
    '--color-accent': accent,
    '--accent-color': accent,
  };
}

/** Computes a guaranteed contrasting upload color so metrics never clash with the download accent. */
export function getContrastingUploadColor(accentColor?: string): string {
  const norm = (normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR).toLowerCase();
  // Emerald / Teal / Cyan accents clash with greens -> return high-contrast Purple
  if (['#10b981', '#2dd4bf', '#06b6d4', '#14b8a6', '#22c55e'].includes(norm)) {
    return '#a855f7';
  }
  // Purple / Violet / Rose accents -> return high-contrast Emerald
  if (['#a855f7', '#818cf8', '#c084fc', '#f43f5e', '#ec4899', '#e11d48'].includes(norm)) {
    return '#10b981';
  }
  // Amber / Orange accents -> return vibrant Cyan
  if (['#f59e0b', '#f97316', '#fb923c', '#d97706'].includes(norm)) {
    return '#06b6d4';
  }
  // Electric Blue / Sky accents -> return vivid Emerald Green
  return '#10b981';
}
