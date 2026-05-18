import type { GameState, HexCoord, HexTile, LastSeenTilePresentation, Unit } from '@/core/types';
import { getVisibility, updateVisibility } from '@/systems/fog-of-war';
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

/**
 * One-time migration for old saves that have fog tiles but no lastSeen entries.
 * Builds snapshots from the current live map state for any fogged tile that
 * lacks a snapshot. Visible tiles are handled by the normal refresh cycle.
 * Does not overwrite existing entries.
 */
export function reconstructLastSeenFromMap(state: GameState, civId: string): void {
  const civ = state.civilizations[civId];
  if (!civ?.visibility) return;
  civ.visibility.lastSeen ??= {};
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    if (civ.visibility.tiles[key] !== 'fog') continue;
    if (civ.visibility.lastSeen[key]) continue;
    const coord = tile.coord ?? parseHexKey(key);
    civ.visibility.lastSeen[key] = createLastSeenTilePresentation(state, civId, { ...tile, coord });
  }
}

export function updateAndRefreshVisibility(state: GameState, civId: string): void {
  const civ = state.civilizations[civId];
  if (!civ?.visibility) return;
  const units = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = civ.cities
    .map(id => state.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(civ.visibility, units, state.map, cityPositions);
  refreshLastSeenPresentationsForCiv(state, civId);
}
