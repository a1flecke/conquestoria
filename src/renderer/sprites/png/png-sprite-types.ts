/**
 * PNG spritesheet unit sprites — the raster counterpart of the serialized v2 SVG sprites.
 *
 * A PNG unit ships as two sheets produced by scripts/sprite-puppet/puppet.py:
 *   sheet — the painted frames; civ-tinted regions are desaturated to a luminance ramp
 *   mask  — alpha = how much of each pixel takes the owner's colour
 * The DOM overlay tints at runtime (CSS mask + multiply blend) and the Canvas path bakes the same result, so a PNG unit
 * works for ANY civ colour with no per-civ art. Rows are animation states; columns are frames.
 */
export type PngSpriteState = 'idle' | 'walk' | 'attack';

export interface PngSpriteStateEntry {
  /** Sheet row holding this state's frames. */
  row: number;
  /** Frames in the row, 2..cols. */
  frames: number;
  /** Playback rate; the loop lasts frames / fps seconds. */
  fps: number;
}

export interface PngSpriteManifest {
  id: string;
  /** Edge length of one square cell in the sheets, in pixels. */
  frameSize: number;
  cols: number;
  rows: number;
  states: Record<PngSpriteState, PngSpriteStateEntry>;
  /** Paths relative to the app base URL (no leading slash). */
  sheet: string;
  mask: string;
  /** Direction the painted unit faces. The map does not mirror units today; recorded for when it does. */
  facing: 'right' | 'left';
}
