import '@/assets/png-sprite-animations.css';
import { FACTION_SPRITE_ACCENT, NEUTRAL_PNG_TINT } from '../faction-accent-colors';
import { resolveAppAssetUrl } from '../../asset-url';
import { getPngCellPlacement } from './png-sprite-layout';
import { getPngPlaybackCssVars, resolvePngPlayback } from './png-sprite-playback';
import type { PngUnitSprite } from './png-sprite-types';

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
 * The custom properties the player stylesheet reads before any state arrives: the sheet's grid, where the cell sits inside
 * the unit box, and the healthy idle clip. The overlay replaces the clip variables as the unit's state and damage change
 * (`applyPngPlayback`); a list icon keeps these and so holds the first frame of the healthy pose.
 */
export function getPngSpriteCssVars(sprite: PngUnitSprite): Record<string, string> {
  const placement = getPngCellPlacement(sprite);
  return {
    '--cols': String(sprite.cols),
    '--rows': String(sprite.rows),
    '--cell-width': pct(placement.widthPct),
    '--cell-left': pct(placement.leftPct),
    '--cell-top': pct(placement.topPct),
    ...getPngPlaybackCssVars(sprite, resolvePngPlayback(sprite, 'idle', 0), 0),
  };
}

export function pngSpriteUrl(sprite: PngUnitSprite, which: 'sheet' | 'mask'): string {
  return resolveAppAssetUrl(sprite[which]);
}

/**
 * The overlay's DOM for one PNG unit. Mirrors the serialized SVG sprites' contract so the overlay needs no special
 * case: the first element is `.cq-sprite-wrap`, state arrives as `data-state`, the phase offset as `--phase`.
 * Contains only values this module built (manifest paths, validated colour), so it is safe to insert as HTML.
 */
export function buildPngUnitSpriteHtml(sprite: PngUnitSprite, tint: string): string {
  const vars = Object.entries(getPngSpriteCssVars(sprite)).map(([k, v]) => `${k}:${v}`).join(';');
  const sheet = pngSpriteUrl(sprite, 'sheet');
  const mask = pngSpriteUrl(sprite, 'mask');
  const idle = resolvePngPlayback(sprite, 'idle', 0).clip;
  return `<div class="cq-sprite-wrap cq-png" data-state="idle" data-sprite-kind="png" data-unit-type="${sprite.id}" `
    + `data-png-epoch="0"${idle.frames === 1 ? ' data-png-static="true"' : ''} `
    + `style="--phase:0;--cq-tint:${tint};${vars}">`
    + `<div class="cq-png-layer cq-png-base" style="background-image:url('${sheet}')"></div>`
    + `<div class="cq-png-layer cq-png-tint" style="-webkit-mask-image:url('${mask}');mask-image:url('${mask}')"></div>`
    + `</div>`;
}
