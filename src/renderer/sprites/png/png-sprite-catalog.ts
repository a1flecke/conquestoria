import type { PngSpriteManifest, PngUnitSprite } from './png-sprite-types';
import { fromPuppetManifest } from './png-sprite-normalise';
import { manifest as cavalry } from './generated/cavalry.manifest';
import { sprite as biplane } from './generated/biplane.manifest';
import { manifest as horseman } from './generated/horseman.manifest';
import { sprite as ironclad } from './generated/ironclad.manifest';
import { manifest as machine_gunner } from './generated/machine_gunner.manifest';
import { manifest as observation_balloon } from './generated/observation_balloon.manifest';
import { manifest as pre_dreadnought } from './generated/pre_dreadnought.manifest';
import { manifest as rifleman } from './generated/rifleman.manifest';
import { manifest as submarine } from './generated/submarine.manifest';
import { sprite as tank } from './generated/tank.manifest';
import { sprite as archer } from './generated/archer.manifest';
import { sprite as spearman } from './generated/spearman.manifest';

/**
 * Units drawn from PNG spritesheets instead of serialized SVG. This is the migration seam: a unit listed here is
 * rendered by the PNG player (DOM overlay and Canvas); every other unit keeps its SVG sprite. Moving a unit across is
 * one row here plus its generated manifest — and moving it back is deleting the row.
 *
 * Puppet units (`puppet.py`) are generated as `PngSpriteManifest` and converted once by `fromPuppetManifest`; strip units
 * (`strips.py export`) are generated as `PngUnitSprite` and listed directly.
 *
 * Recipe: scripts/sprite-puppet/README.md.
 */
const PUPPET_UNITS: Readonly<Record<string, PngSpriteManifest>> = {
  cavalry,
  horseman,
  machine_gunner,
  observation_balloon,
  pre_dreadnought,
  rifleman,
  submarine,
};

/** Strip units: drawn strips exported by `strips.py export`, already in the player's shape. */
const STRIP_UNITS: readonly PngUnitSprite[] = [archer, biplane, ironclad, spearman, tank];

const PNG_UNIT_SPRITES: Readonly<Record<string, PngUnitSprite>> = Object.fromEntries([
  ...Object.entries(PUPPET_UNITS).map(([id, manifest]) => [id, fromPuppetManifest(manifest)] as const),
  ...STRIP_UNITS.map(sprite => [sprite.id, sprite] as const),
]);

export function getPngUnitManifest(unitType: string): PngUnitSprite | null {
  return PNG_UNIT_SPRITES[unitType] ?? null;
}

export function isPngUnit(unitType: string): boolean {
  return unitType in PNG_UNIT_SPRITES;
}

export function listPngUnitManifests(): readonly PngUnitSprite[] {
  return Object.values(PNG_UNIT_SPRITES);
}

/** True when this unit's sprite has its own death clip, so a dead unit is worth keeping on the map for a moment. */
export function hasPngDeathClip(unitType: string): boolean {
  // Match against the list, not a keyed lookup: `getPngUnitManifest('__proto__')` is truthy (a plain-object table).
  return listPngUnitManifests().some(sprite => sprite.id === unitType && sprite.clips.death !== undefined);
}
