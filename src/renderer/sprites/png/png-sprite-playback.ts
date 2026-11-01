import type { PngClip, PngDamageTier, PngSpriteState, PngUnitSprite } from './png-sprite-types';

export interface PngPlayback {
  clip: PngClip;
  tier: PngDamageTier;
  /** The state this sprite has no art for and is standing in with its idle clip; null when the clip is the state's own. */
  fallback: 'hurt' | 'death' | 'work' | null;
}

/** Health-driven damage level (0..3) from whatever the overlay was handed: odd values clamp, never index a missing clip. */
export function toPngDamageTier(damage: number | undefined): PngDamageTier {
  if (damage === undefined || !Number.isFinite(damage)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(damage))) as PngDamageTier;
}

export function resolvePngPlayback(sprite: PngUnitSprite, state: PngSpriteState, damage: number | undefined): PngPlayback {
  const tier = toPngDamageTier(damage);
  if (state === 'idle' || state === 'walk' || state === 'attack') {
    return { clip: sprite.clips[state][tier], tier, fallback: null };
  }
  const own = sprite.clips[state];
  if (own) return { clip: own[tier], tier, fallback: null };
  return { clip: sprite.clips.idle[tier], tier, fallback: state };
}

function pct(n: number): string {
  return `${Math.round(n * 10000) / 10000}%`;
}

function seconds(n: number): string {
  return `${Math.round(n * 1000) / 1000 || 0}s`; // `|| 0` turns -0 into 0
}

/**
 * CSS custom properties the player stylesheet reads for the clip now playing. Percent positions follow background-position
 * semantics: with the sheet sized to `cols * 100%`, cell k sits at k / (cols - 1) * 100%. A loop takes the unit's phase so a
 * stack of units does not step in unison; a one-shot always starts on its first frame.
 */
export function getPngPlaybackCssVars(sprite: PngUnitSprite, playback: PngPlayback, phase: number): Record<string, string> {
  const { clip } = playback;
  const { cols, rows } = sprite;
  const col = (k: number): string => pct(cols > 1 ? (k / (cols - 1)) * 100 : 0);
  const duration = clip.frames / clip.fps;
  return {
    '--row': pct(rows > 1 ? (clip.row / (rows - 1)) * 100 : 0),
    '--from': col(clip.firstCol),
    '--to': col(clip.firstCol + clip.frames - 1),
    '--steps': String(clip.frames),
    '--dur': seconds(duration),
    '--iter': clip.loop ? 'infinite' : '1',
    '--delay': clip.loop ? seconds(-phase * duration) : '0s',
  };
}
