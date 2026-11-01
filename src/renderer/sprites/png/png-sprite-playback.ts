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
 * Writes the clip for (state, tier, epoch) onto a `.cq-png` root. A no-op while that key is unchanged, so a loop is never
 * restarted by a sync that changed nothing. When the key changes the epoch attribute flips between `0` and `1`, which swaps the
 * stylesheet's keyframe set and so restarts the animation: that is how a second attack inside the first one's hold replays.
 * `epoch` is when the current transient began (0 for none); it only has to differ between two plays of the same clip.
 */
export function applyPngPlayback(
  el: HTMLElement,
  sprite: PngUnitSprite,
  state: PngSpriteState,
  damage: number | undefined,
  epoch: number,
  phase: number,
): void {
  const playback = resolvePngPlayback(sprite, state, damage);
  const key = `${state}:${playback.tier}:${epoch}`;
  if (el.getAttribute('data-png-key') === key) return;
  el.setAttribute('data-png-key', key);
  for (const [name, value] of Object.entries(getPngPlaybackCssVars(sprite, playback, phase))) el.style.setProperty(name, value);
  el.setAttribute('data-png-epoch', el.getAttribute('data-png-epoch') === '0' ? '1' : '0');
  el.setAttribute('data-png-loop', String(playback.clip.loop));
  if (playback.clip.frames === 1) el.setAttribute('data-png-static', 'true');
  else el.removeAttribute('data-png-static');
  if (playback.fallback) el.setAttribute('data-png-fallback', playback.fallback);
  else el.removeAttribute('data-png-fallback');
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
