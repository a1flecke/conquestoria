import type {
  GameState,
  HexCoord,
  HexTile,
  LastSeenHealthBand,
  LastSeenTilePresentation,
  LastSeenUnitPresentation,
  Unit,
} from '@/core/types';
import { getVisibility, isForestConcealedUnit, updateVisibility } from '@/systems/fog-of-war';
import { hexKey, parseHexKey, wrapHexCoord } from '@/systems/hex-utils';
import { canInspectUnitForViewer } from './viewer-intel';

function healthBand(health: number): LastSeenHealthBand {
  if (health >= 70) return 'healthy';
  if (health >= 30) return 'damaged';
  return 'critical';
}

function visibleUnitsByTile(
  state: GameState,
  viewerId: string,
): Map<string, LastSeenUnitPresentation[]> {
  const byTile = new Map<string, LastSeenUnitPresentation[]>();
  for (const unit of Object.values(state.units)
    .filter(unit => !unit.transportId)
    .filter(unit => canInspectUnitForViewer(state, viewerId, unit.id))
    .filter(unit => !isForestConcealedUnit(state, viewerId, unit))) {
    const position = state.map.wrapsHorizontally
      ? wrapHexCoord(unit.position, state.map.width)
      : unit.position;
    const key = hexKey(position);
    const presentations = byTile.get(key) ?? [];
    presentations.push({
      id: unit.id,
      owner: unit.owner,
      type: unit.type,
      healthBand: healthBand(unit.health),
    });
    byTile.set(key, presentations);
  }
  for (const presentations of byTile.values()) {
    presentations.sort((left, right) => left.id.localeCompare(right.id));
  }
  return byTile;
}

function createTilePresentation(
  state: GameState,
  tile: HexTile,
  units: LastSeenUnitPresentation[],
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
    observedTurn: state.turn,
    source: 'observed',
    units,
  };
}

export function createLastSeenTilePresentation(
  state: GameState,
  viewerId: string,
  tile: HexTile,
): LastSeenTilePresentation {
  return createTilePresentation(
    state,
    tile,
    visibleUnitsByTile(state, viewerId).get(hexKey(tile.coord)) ?? [],
  );
}

export function refreshLastSeenPresentationsForCiv(state: GameState, viewerId: string): void {
  const civ = state.civilizations[viewerId];
  if (!civ?.visibility) return;

  civ.visibility.lastSeen ??= {};
  const unitsByTile = visibleUnitsByTile(state, viewerId);
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    const coord = tile.coord ?? parseHexKey(key);
    if (getVisibility(civ.visibility, coord) !== 'visible') continue;
    civ.visibility.lastSeen[key] = createTilePresentation(
      state,
      { ...tile, coord },
      unitsByTile.get(key) ?? [],
    );
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
    const {
      observedTurn: _observedTurn,
      units: _units,
      ...presentation
    } = createTilePresentation(state, { ...tile, coord }, []);
    civ.visibility.lastSeen[key] = {
      ...presentation,
      source: 'legacy-reconstructed',
    };
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
