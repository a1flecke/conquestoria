import '@/assets/png-sprite-animations.css';
import { FACTION_SPRITE_ACCENT, NEUTRAL_PNG_TINT } from '../faction-accent-colors';
import { resolveAppAssetUrl } from '../../asset-url';
import type { PngPuppetState, PngUnitSprite } from './png-sprite-types';

const STATES: readonly PngPuppetState[] = ['idle', 'walk', 'attack'];
/** Colours reach a style attribute, so accept only hex notation (never a free-form string). */
const SAFE_HEX = /^#[0-9a-fA-F]{3,8}$/;

export function resolvePngTint(civColor: string, faction: string): string {
  if (civColor && SAFE_HEX.test(civColor)) return civColor;
  return FACTION_SPRITE_ACCENT[faction] ?? NEUTRAL_PNG_TINT;
}

function pct(n: number): string {
  return `${Math.round(n * 10000) / 10000}%`;
}

/**
 * CSS custom properties the player stylesheet reads for one sheet: grid size and, per state, its row, last-frame
 * position, step count and loop duration. Percent positions follow background-position semantics: with the sheet sized
 * to `cols * 100%`, cell k sits at k / (cols - 1) * 100%.
 */
export function getPngSpriteCssVars(manifest: PngUnitSprite): Record<string, string> {
  const { cols, rows } = manifest;
  const vars: Record<string, string> = { '--cols': String(cols), '--rows': String(rows) };
  for (const state of STATES) {
    const s = manifest.clips[state][0];
    vars[`--${state}-y`] = pct(rows > 1 ? (s.row / (rows - 1)) * 100 : 0);
    vars[`--${state}-end`] = pct(cols > 1 ? ((s.frames - 1) / (cols - 1)) * 100 : 0);
    vars[`--${state}-steps`] = String(s.frames);
    vars[`--${state}-dur`] = `${Math.round((s.frames / s.fps) * 1000) / 1000}s`;
  }
  return vars;
}

export function pngSpriteUrl(manifest: PngUnitSprite, which: 'sheet' | 'mask'): string {
  return resolveAppAssetUrl(manifest[which]);
}

/**
 * The overlay's DOM for one PNG unit. Mirrors the serialized SVG sprites' contract so the overlay needs no special
 * case: the first element is `.cq-sprite-wrap`, state arrives as `data-state`, the phase offset as `--phase`.
 * Contains only values this module built (manifest paths, validated colour), so it is safe to insert as HTML.
 */
export function buildPngUnitSpriteHtml(manifest: PngUnitSprite, tint: string): string {
  const vars = Object.entries(getPngSpriteCssVars(manifest)).map(([k, v]) => `${k}:${v}`).join(';');
  const sheet = pngSpriteUrl(manifest, 'sheet');
  const mask = pngSpriteUrl(manifest, 'mask');
  return `<div class="cq-sprite-wrap cq-png" data-state="idle" data-sprite-kind="png" data-unit-type="${manifest.id}" `
    + `style="--phase:0;--cq-tint:${tint};${vars}">`
    + `<div class="cq-png-layer cq-png-base" style="background-image:url('${sheet}')"></div>`
    + `<div class="cq-png-layer cq-png-tint" style="-webkit-mask-image:url('${mask}');mask-image:url('${mask}')"></div>`
    + `</div>`;
}
