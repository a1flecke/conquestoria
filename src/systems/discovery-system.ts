import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from './hex-utils';
import { getVisibility } from './fog-of-war';

export function hasExploredCoord(state: GameState, viewerCivId: string, coord: HexCoord): boolean {
  const vis = state.civilizations[viewerCivId]?.visibility;
  if (!vis) return false;
  const visibility = getVisibility(vis, coord);
  return visibility === 'visible' || visibility === 'fog';
}

export function hasDiscoveredMinorCiv(state: GameState, viewerCivId: string, minorCivId: string): boolean {
  const mc = state.minorCivs?.[minorCivId];
  if (!mc || mc.isDestroyed) return false;
  const city = state.cities[mc.cityId];
  if (!city) return false;
  return hasExploredCoord(state, viewerCivId, city.position);
}

export function hasMetCivilization(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  if (viewerCivId === targetCivId) return true;

  const viewer = state.civilizations[viewerCivId];
  const target = state.civilizations[targetCivId];
  if (!viewer || !target) return false;
  if (target.breakaway?.originOwnerId === viewerCivId) return true;
  if (viewer.breakaway?.originOwnerId === targetCivId) return true;

  if (viewer.diplomacy.atWarWith.includes(targetCivId)) return true;
  if (viewer.diplomacy.treaties.some(t => t.civA === targetCivId || t.civB === targetCivId)) return true;

  const targetCities = target.cities
    .map(cityId => state.cities[cityId])
    .filter((city): city is NonNullable<typeof city> => Boolean(city));
  for (const city of targetCities) {
    if (hasExploredCoord(state, viewerCivId, city.position)) {
      return true;
    }
    if (city.ownedTiles.some(coord => hasExploredCoord(state, viewerCivId, coord))) {
      return true;
    }
  }

  const viewerVis = viewer.visibility;
  for (const unitId of target.units) {
    const unit = state.units[unitId];
    if (!unit) continue;
    if (getVisibility(viewerVis, unit.position) === 'visible') {
      return true;
    }
  }

  const targetTileKeys = Object.values(state.map.tiles)
    .filter(tile => tile.owner === targetCivId)
    .map(tile => hexKey(tile.coord));
  return targetTileKeys.some(key => {
    const coord = state.map.tiles[key]?.coord;
    return coord ? hasExploredCoord(state, viewerCivId, coord) : false;
  });
}
