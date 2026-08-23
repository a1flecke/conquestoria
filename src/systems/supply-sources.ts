import type { City, GameState, HexCoord } from '@/core/types';
import { hexKey, mapDistance } from './hex-utils';
import { getFortificationTier } from './fortification-system';

/**
 * Conservative initial values (contract §29 — intentionally not locked,
 * tunable). Chosen relative to the existing city cultural-territory radius
 * scale (2-3 hexes, see `getCulturalTerritoryRadius` in
 * city-territory-system.ts) so City supply reach reads as "a bit more than
 * your territory," not "the whole continent."
 */
export const LAND_SUPPLY_RADII = {
  fort: 1,
  citadel: 2,
  city: 3,
} as const;

export const CAPTURED_SOURCE_STABILIZATION_TURNS = {
  city: 5,
  fort: 2,
} as const;

export function isCityStabilized(state: Pick<GameState, 'turn'>, city: Pick<City, 'conquestTurn'>): boolean {
  if (city.conquestTurn === undefined) return true;
  return state.turn - city.conquestTurn >= CAPTURED_SOURCE_STABILIZATION_TURNS.city;
}

export function isFortStabilized(state: GameState, coord: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || tile.fortStabilizationSinceTurn === undefined) return true;
  return state.turn - tile.fortStabilizationSinceTurn >= CAPTURED_SOURCE_STABILIZATION_TURNS.fort;
}

function isMatureFortAt(state: GameState, ownerId: string, coord: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || tile.owner !== ownerId || tile.improvement !== 'fort' || tile.improvementTurnsLeft > 0) return false;
  return isFortStabilized(state, coord);
}

/** True if `coord` is within Full Supply range of any friendly City or Fort/Citadel. */
export function getLandSupplySourceCoverage(
  state: GameState,
  civId: string,
  coord: HexCoord,
): boolean {
  for (const city of Object.values(state.cities)) {
    if (city.owner !== civId) continue;
    if (isCityStabilized(state, city) && mapDistance(state.map, city.position, coord) <= LAND_SUPPLY_RADII.city) {
      return true;
    }
  }
  const tier = getFortificationTier(state.civilizations[civId]?.techState.completed ?? []);
  const fortRadius = LAND_SUPPLY_RADII[tier.id];
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.improvement !== 'fort' || tile.owner !== civId) continue;
    if (isMatureFortAt(state, civId, tile.coord) && mapDistance(state.map, tile.coord, coord) <= fortRadius) {
      return true;
    }
  }
  return false;
}
