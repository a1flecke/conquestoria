/**
 * Boundary helpers for values that cross into inline HTML/SVG attribute or style strings.
 * Pure leaf (zero imports) so storage, renderer, and UI layers can all share one definition.
 */

const SAFE_HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const DEFAULT_SAFE_COLOR = '#888888';

/** True only for strict hex color literals (#rgb, #rgba, #rrggbb, #rrggbbaa). */
export function isSafeHexColor(value: unknown): value is string {
  return typeof value === 'string' && SAFE_HEX_COLOR_PATTERN.test(value);
}

/** Returns `value` if it is a strict hex color literal, otherwise `fallback`. */
export function sanitizeHexColor(value: unknown, fallback: string = DEFAULT_SAFE_COLOR): string {
  return isSafeHexColor(value) ? value : fallback;
}

/** Escapes characters that can break out of an HTML attribute value or inject markup. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('`', '&#96;');
}
