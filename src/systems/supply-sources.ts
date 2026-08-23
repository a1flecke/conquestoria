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

export interface SupplySourceRef {
  kind: 'city' | 'fort';
  id: string;
  coord: HexCoord;
}

export interface CivSupplySourceCandidates {
  /** This civ's own cities that have finished captured-source stabilization (or were never captured). */
  cities: City[];
  /** This civ's own mature Fort tile coordinates. */
  fortCoords: HexCoord[];
  fortRadius: number;
}

/**
 * Precomputes one civ's full candidate source list once (contract §35's
 * performance requirement: "avoid unbounded AI tile scans"). Callers that
 * need coverage/primary-source answers for many positions in the same
 * civ's resolution pass (e.g. `resolveLandSupplyForCiv` checking every
 * participating unit) MUST compute this once and pass it through, rather
 * than letting `getLandSupplySourceCoverage`/`getPrimarySupplySource`
 * default to recomputing a full `Object.values(state.map.tiles)` scan on
 * every call — the earlier draft of this module did the latter, turning
 * one civ's resolution into O(units × map size) instead of O(map size).
 */
export function getCivSupplySourceCandidates(state: GameState, civId: string): CivSupplySourceCandidates {
  const tier = getFortificationTier(state.civilizations[civId]?.techState.completed ?? []);
  const cities = Object.values(state.cities).filter(city => city.owner === civId && isCityStabilized(state, city));
  const fortCoords = Object.values(state.map.tiles)
    .filter(tile => tile.improvement === 'fort' && tile.owner === civId && tile.improvementTurnsLeft === 0 && isFortStabilized(state, tile.coord))
    .map(tile => tile.coord);
  return { cities, fortCoords, fortRadius: LAND_SUPPLY_RADII[tier.id] };
}

export function getPrimarySupplySource(
  state: GameState,
  civId: string,
  coord: HexCoord,
  candidates: CivSupplySourceCandidates = getCivSupplySourceCandidates(state, civId),
): SupplySourceRef | null {
  const ranked: Array<SupplySourceRef & { distance: number }> = [];

  for (const city of candidates.cities) {
    const distance = mapDistance(state.map, city.position, coord);
    if (distance <= LAND_SUPPLY_RADII.city) ranked.push({ kind: 'city', id: city.id, coord: city.position, distance });
  }
  for (const fortCoord of candidates.fortCoords) {
    const distance = mapDistance(state.map, fortCoord, coord);
    if (distance <= candidates.fortRadius) ranked.push({ kind: 'fort', id: hexKey(fortCoord), coord: fortCoord, distance });
  }

  if (ranked.length === 0) return null;
  ranked.sort((a, b) => a.distance - b.distance || hexKey(a.coord).localeCompare(hexKey(b.coord)));
  const { distance: _distance, ...ref } = ranked[0]!;
  return ref;
}

/** True if `coord` is within Full Supply range of any friendly City or Fort/Citadel. */
export function getLandSupplySourceCoverage(
  state: GameState,
  civId: string,
  coord: HexCoord,
  candidates: CivSupplySourceCandidates = getCivSupplySourceCandidates(state, civId),
): boolean {
  for (const city of candidates.cities) {
    if (mapDistance(state.map, city.position, coord) <= LAND_SUPPLY_RADII.city) return true;
  }
  for (const fortCoord of candidates.fortCoords) {
    if (mapDistance(state.map, fortCoord, coord) <= candidates.fortRadius) return true;
  }
  return false;
}
