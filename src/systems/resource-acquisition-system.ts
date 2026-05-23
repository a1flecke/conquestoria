import type { GameState, ResourceType } from '@/core/types';
import { hexKey } from './hex-utils';
import { RESOURCE_DEFINITIONS } from './trade-system';

/**
 * Returns the set of resource IDs that a civ currently has access to.
 *
 * A civ "has" a resource when ALL of the following are true for some tile in
 * one of their cities' owned territory:
 *   1. The tile has a resource.
 *   2. The civ has researched the tech that reveals that resource.
 *   3. Either:
 *      a. The tile IS the city center (tech alone is sufficient — the city
 *         implicitly exploits its own tile), OR
 *      b. A completed improvement of the required type exists on the tile
 *         (improvementTurnsLeft === 0).
 *
 * Pure function — reads state only, never mutates.
 */
export function getCivAvailableResources(state: GameState, civId: string): Set<ResourceType> {
  const result = new Set<ResourceType>();
  const civ = state.civilizations[civId];
  if (!civ) return result;

  const completedTechs = new Set(civ.techState.completed);
  const resourceDefMap = new Map(RESOURCE_DEFINITIONS.map(d => [d.id, d]));

  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;

    const cityKey = hexKey(city.position);

    for (const coord of city.ownedTiles) {
      const key = hexKey(coord);
      const tile = state.map.tiles[key];
      if (!tile?.resource) continue;

      const def = resourceDefMap.get(tile.resource as ResourceType);
      if (!def) continue;

      // Tech gate — must have researched the revealing tech.
      if (!completedTechs.has(def.tech)) continue;

      if (key === cityKey) {
        // City-center exception: tech alone grants the resource.
        result.add(tile.resource as ResourceType);
      } else {
        // Off-center tile: requires a completed improvement of the right type.
        if (
          tile.improvement === def.requiredImprovement &&
          tile.improvementTurnsLeft === 0
        ) {
          result.add(tile.resource as ResourceType);
        }
      }
    }
  }

  return result;
}
