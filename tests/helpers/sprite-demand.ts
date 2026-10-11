import { BUILDING_SPRITE_CATALOG, UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import type { SpriteDemandItem } from '@/renderer/sprites/sprite-loader';

/**
 * Every unit type and building id in the sprite catalogs for each given civilization: the demand
 * that reproduces the old "load everything up front" behaviour, for tests that assert the whole
 * catalog is cached. (Pirate hulls load as their own set, so they are not listed per civ.)
 */
export function allSpriteDemand(civIds: readonly string[]): SpriteDemandItem[] {
  const ids = [...Object.keys(UNIT_SPRITE_CATALOG), ...Object.keys(BUILDING_SPRITE_CATALOG)];
  return civIds.flatMap(civId => ids.map(id => ({ id, civId })));
}
