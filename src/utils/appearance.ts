export const DEFAULT_ACCENT_COLOR = '#38bdf8';
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
