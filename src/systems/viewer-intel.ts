import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';

function hasVisibleCoord(state: GameState, viewerCivId: string, coord: HexCoord): boolean {
  const visibility = state.civilizations[viewerCivId]?.visibility;
  return visibility ? getVisibility(visibility, coord) === 'visible' : false;
}

function hasContactMemory(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  if (viewerCivId === targetCivId) return true;

  const viewer = state.civilizations[viewerCivId];
  const target = state.civilizations[targetCivId];
  if (!viewer || !target) return false;
  if (viewer.knownCivilizations?.includes(targetCivId)) return true;
  if (target.knownCivilizations?.includes(viewerCivId)) return true;
  if (target.breakaway?.originOwnerId === viewerCivId) return true;
  if (viewer.breakaway?.originOwnerId === targetCivId) return true;
  if (viewer.diplomacy.atWarWith?.includes(targetCivId)) return true;
  return viewer.diplomacy.treaties?.some(t => t.civA === targetCivId || t.civB === targetCivId) ?? false;
}

function hasCurrentVisibleEvidence(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  const target = state.civilizations[targetCivId];
  if (!target) return false;

  for (const cityId of target.cities ?? []) {
    const city = state.cities[cityId];
    if (!city) continue;
    if (hasVisibleCoord(state, viewerCivId, city.position)) return true;
    if (city.ownedTiles.some(coord => hasVisibleCoord(state, viewerCivId, coord))) return true;
  }

  for (const unitId of target.units ?? []) {
    const unit = state.units[unitId];
    if (unit && hasVisibleCoord(state, viewerCivId, unit.position)) return true;
  }

  return Object.values(state.map.tiles).some(tile =>
    tile.owner === targetCivId && hasVisibleCoord(state, viewerCivId, tile.coord),
  );
}

export function shouldListMajorCivForViewer(
  state: GameState,
  viewerCivId: string,
  targetCivId: string,
): boolean {
  return hasContactMemory(state, viewerCivId, targetCivId)
    || hasCurrentVisibleEvidence(state, viewerCivId, targetCivId);
}

export function canInspectCityForViewer(
  state: GameState,
  viewerCivId: string,
  cityId: string,
): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return city.owner === viewerCivId || hasVisibleCoord(state, viewerCivId, city.position);
}

export function canInspectUnitForViewer(
  state: GameState,
  viewerCivId: string,
  unitId: string,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  return unit.owner === viewerCivId || hasVisibleCoord(state, viewerCivId, unit.position);
}

export function canInspectTileOwnerForViewer(
  state: GameState,
  viewerCivId: string,
  coord: HexCoord,
): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile?.owner) return false;
  return tile.owner === viewerCivId || hasVisibleCoord(state, viewerCivId, coord);
}
