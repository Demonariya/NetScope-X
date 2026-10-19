/**
 * Neutral fallback used only when Windows cannot extract an executable's actual icon.
 * Real icon PNGs are supplied by the native process enumerator when available.
 */
export function getProcessIconSvg(_exeName: string): string {
  return 'data:image/svg+xml;utf8,' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
    '<rect x="5" y="7" width="38" height="34" rx="6" fill="%23111827" stroke="%2364758b" stroke-width="2"/>' +
    '<path d="M5 15h38" stroke="%2364758b" stroke-width="2"/>' +
    '<circle cx="11" cy="11" r="1" fill="%2394a3b8"/>' +
    '<circle cx="15" cy="11" r="1" fill="%2394a3b8"/>' +
    '<path d="M15 23h18M15 29h12M15 35h8" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';
}
