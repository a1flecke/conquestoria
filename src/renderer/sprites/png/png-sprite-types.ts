/**
 * PNG spritesheet unit sprites — the raster counterpart of the serialized v2 SVG sprites.
 *
 * A PNG unit ships as two sheets:
 *   sheet — the painted frames; civ-tinted regions are desaturated to a luminance ramp
 *   mask  — alpha = how much of each pixel takes the owner's colour
 * The DOM overlay tints at runtime (CSS mask + multiply blend) and the Canvas path bakes the same result, so a PNG unit
 * works for ANY civ colour with no per-civ art. Rows are animation clips; columns are frames.
 *
 * Two producers write these sheets. `scripts/sprite-puppet/puppet.py` rigs one still into three square rows
 * (`PngSpriteManifest`, the shape its generated files use); `scripts/sprite-puppet/strips.py export` writes drawn strips with
 * rows per damage tier and one-shot rows (`PngUnitSprite`, written directly). The game only ever reads `PngUnitSprite`:
 * `fromPuppetManifest` is the one conversion from the older shape.
 */
export type PngSpriteState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'work';

/** Damage tier from health, as the sprite overlay defines it: 0 = 76–100 HP, 1 = 51–75, 2 = 26–50, 3 = 0–25. */
export type PngDamageTier = 0 | 1 | 2 | 3;

/** The three states every puppet sheet has. */
export type PngPuppetState = 'idle' | 'walk' | 'attack';

export interface PngSpriteStateEntry {
  /** Sheet row holding this state's frames. */
  row: number;
  /** Frames in the row, 2..cols. */
  frames: number;
  /** Playback rate; the loop lasts frames / fps seconds. */
  fps: number;
}

/** The puppet pipeline's manifest: square cells, three looping rows. Generated; never hand-edited. */
export interface PngSpriteManifest {
  id: string;
  /** Edge length of one square cell in the sheets, in pixels. */
  frameSize: number;
  cols: number;
  rows: number;
  states: Record<PngPuppetState, PngSpriteStateEntry>;
  /** Paths relative to the app base URL (no leading slash). */
  sheet: string;
  mask: string;
  /** Direction the painted unit faces. The map does not mirror units today; recorded for when it does. */
  facing: 'right' | 'left';
}

/** One animation: `frames` cells starting at `firstCol` of `row`, played at `fps`, looping or once. */
export interface PngClip {
  row: number;
  firstCol: number;
  frames: number;
  fps: number;
  loop: boolean;
}

/** One clip per damage tier, indexed by `PngDamageTier`. A state with no tiered art repeats the same clip. */
export type PngTierClips = readonly [PngClip, PngClip, PngClip, PngClip];

export interface PngUnitSprite {
  id: string;
  cellWidth: number;
  cellHeight: number;
  cols: number;
  rows: number;
  /** Pixels from a cell's top to the ground line; `null` = a square puppet cell that fills the unit box. */
  baseline: number | null;
  clips: Record<PngPuppetState, PngTierClips> & Partial<Record<'hurt' | 'death' | 'work', PngTierClips>>;
  /** Paths relative to the app base URL (no leading slash). */
  sheet: string;
  mask: string;
  /** Direction the painted unit faces. The map does not mirror units today; recorded for when it does. */
  facing: 'right' | 'left';
}
