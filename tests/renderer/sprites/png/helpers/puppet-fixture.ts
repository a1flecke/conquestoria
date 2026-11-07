import { fromPuppetManifest } from '@/renderer/sprites/png/png-sprite-normalise';
import type { PngSpriteManifest, PngUnitSprite } from '@/renderer/sprites/png/png-sprite-types';

/**
 * A puppet-shaped manifest (square cells, three looping rows) that belongs to no shipped unit.
 *
 * Since #1627 every unit in `PNG_UNIT_SPRITES` is a strip unit, so tests of the puppet pipeline's shape
 * (`fromPuppetManifest`, the square-cell placement, the clipped overlay) can no longer borrow a catalog unit. They build
 * their puppet from this fixture instead, so the conversion stays covered without keeping a puppet unit in the game.
 */
export const PUPPET_MANIFEST: PngSpriteManifest = {
  id: 'puppetunit',
  frameSize: 192,
  cols: 8,
  rows: 3,
  states: {
    idle: { row: 0, frames: 4, fps: 3 },
    walk: { row: 1, frames: 8, fps: 8 },
    attack: { row: 2, frames: 8, fps: 6 },
  },
  sheet: 'images/units/puppetunit/sheet.png',
  mask: 'images/units/puppetunit/mask.png',
  facing: 'right',
};

export const PUPPET_SPRITE: PngUnitSprite = fromPuppetManifest(PUPPET_MANIFEST);
