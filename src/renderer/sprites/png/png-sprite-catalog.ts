import type { PngSpriteManifest } from './png-sprite-types';
import { manifest as cavalry } from './generated/cavalry.manifest';
import { manifest as horseman } from './generated/horseman.manifest';

/**
 * Units drawn from PNG spritesheets instead of serialized SVG. This is the migration seam: a unit listed here is
 * rendered by the PNG player (DOM overlay and Canvas); every other unit keeps its SVG sprite. Moving a unit across is
 * one row here plus its generated manifest — and moving it back is deleting the row.
 *
 * Recipe: scripts/sprite-puppet/README.md.
 */
const PNG_UNIT_SPRITES: Readonly<Record<string, PngSpriteManifest>> = {
  cavalry,
  horseman,
};

export function getPngUnitManifest(unitType: string): PngSpriteManifest | null {
  return PNG_UNIT_SPRITES[unitType] ?? null;
}

export function isPngUnit(unitType: string): boolean {
  return unitType in PNG_UNIT_SPRITES;
}

export function listPngUnitManifests(): readonly PngSpriteManifest[] {
  return Object.values(PNG_UNIT_SPRITES);
}
