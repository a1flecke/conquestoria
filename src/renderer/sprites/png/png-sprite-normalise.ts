import type { PngClip, PngPuppetState, PngSpriteManifest, PngTierClips, PngUnitSprite } from './png-sprite-types';

const PUPPET_STATES: readonly PngPuppetState[] = ['idle', 'walk', 'attack'];

/**
 * The one conversion from the puppet pipeline's manifest. A puppet sheet has no damage tiers and no one-shot rows: every
 * tier repeats the state's looping clip, so the unit looks exactly as it did before the strip player existed.
 */
export function fromPuppetManifest(manifest: PngSpriteManifest): PngUnitSprite {
  const clips = {} as Record<PngPuppetState, PngTierClips>;
  for (const state of PUPPET_STATES) {
    const entry = manifest.states[state];
    const clip: PngClip = { row: entry.row, firstCol: 0, frames: entry.frames, fps: entry.fps, loop: true };
    clips[state] = [clip, clip, clip, clip];
  }
  return {
    id: manifest.id,
    cellWidth: manifest.frameSize,
    cellHeight: manifest.frameSize,
    cols: manifest.cols,
    rows: manifest.rows,
    baseline: null,
    clips,
    sheet: manifest.sheet,
    mask: manifest.mask,
    facing: manifest.facing,
  };
}
