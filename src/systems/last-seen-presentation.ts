import type { GameState, HexTile, LastSeenTilePresentation } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, parseHexKey } from '@/systems/hex-utils';

export function createLastSeenTilePresentation(
  state: GameState,
  _viewerId: string,
  tile: HexTile,
): LastSeenTilePresentation {
  const tileKey = hexKey(tile.coord);
  const city = Object.values(state.cities).find(candidate => hexKey(candidate.position) === tileKey);
  return {
    coord: { ...tile.coord },
    terrain: tile.terrain,
    elevation: tile.elevation,
    resource: tile.resource,
    improvement: tile.improvement,
    improvementTurnsLeft: tile.improvementTurnsLeft,
    owner: tile.owner,
    hasRiver: tile.hasRiver,
    wonder: tile.wonder,
    city: city
      ? { id: city.id, name: city.name, owner: city.owner, population: city.population }
      : undefined,
  };
}

export function refreshLastSeenPresentationsForCiv(state: GameState, viewerId: string): void {
  const civ = state.civilizations[viewerId];
  if (!civ?.visibility) return;

  civ.visibility.lastSeen ??= {};
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    const coord = tile.coord ?? parseHexKey(key);
    if (getVisibility(civ.visibility, coord) !== 'visible') continue;
    civ.visibility.lastSeen[key] = createLastSeenTilePresentation(state, viewerId, { ...tile, coord });
  }
}
