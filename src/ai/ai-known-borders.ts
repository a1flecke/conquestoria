import type { GameState } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';

/**
 * Major civs whose territory `civId` can SEE touching its own (#870).
 *
 * The AI's Open Borders valuation needs to know where two territories meet, and it may
 * only use what it has earned: a border counts only when the foreign tile is currently
 * `visible` to `civId` (its own visibility map) -- never a tile it has not seen, and never
 * a fogged/remembered one. Reads the civ's own tiles as the starting side, so it cannot
 * be used to discover where an unseen civilization lives.
 */
export function getKnownSharedBorderOwners(state: GameState, civId: string): ReadonlySet<string> {
  const owners = new Set<string>();
  const visibility = state.civilizations[civId]?.visibility;
  if (!visibility) return owners;
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.owner !== civId) continue;
    for (const neighbor of mapNeighbors(state.map, tile.coord)) {
      const other = state.map.tiles[hexKey(neighbor)];
      if (!other?.owner || other.owner === civId || classifyOwner(other.owner) !== 'major') continue;
      if (getVisibility(visibility, neighbor) !== 'visible') continue;
      owners.add(other.owner);
    }
  }
  return owners;
}
