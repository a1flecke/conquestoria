import type { City, GameState, HexCoord } from '@/core/types';
import { hexKey, mapDistance, mapNeighbors } from './hex-utils';
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

/**
 * Contract §9: "road/rail extension values" intentionally not locked --
 * small relative to LAND_SUPPLY_RADII, easy to retune here.
 */
export const ROAD_SUPPLY_EXTENSION = {
  road: 1, // owner has military-logistics
  rail: 2, // owner has railway-expansion (tiered, not additive with road -- matches the movement-discount precedent's non-stacking rule)
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

/**
 * Bounded, tech-gated coverage bonus for a coord on/adjacent to an owned
 * road tile (contract §9: "extend a nearby valid source by a bounded
 * amount... road/rail extension scales with technology, not source type").
 * Mirrors getFortificationTier's "one flag, owner-tech-derived tier"
 * convention: hasRoad is the single persisted flag (no separate rail tile,
 * see road-network.ts's resolveTileHasRail for the identical precedent);
 * which tier applies is derived purely from the checking civ's completed
 * techs. Gates on military-logistics/railway-expansion -- the same two
 * techs the movement-cost discount already uses, never both stacking
 * (.claude/rules/game-balance.md's "Roads discount, they don't stack").
 * Deliberately NOT a network trace: checks only coord and its immediate
 * wrap-aware neighbors via mapNeighbors, so a long chain of connected road
 * tiles cannot extend supply an unbounded distance (contract §9: "do not
 * trace unlimited networks" -- see getCitiesConnectedToCapital in
 * road-network.ts for what an actual road-network BFS looks like in this
 * codebase; this function must never grow into that).
 */
export function getRoadSupplyExtension(state: GameState, civId: string, coord: HexCoord): number {
  const completedTechs = state.civilizations[civId]?.techState.completed ?? [];
  if (!completedTechs.includes('military-logistics')) return 0;

  const isOwnedRoadTile = (candidate: HexCoord): boolean => {
    const tile = state.map.tiles[hexKey(candidate)];
    return tile?.hasRoad === true && tile.owner === civId;
  };
  const nearRoad = isOwnedRoadTile(coord) || mapNeighbors(state.map, coord).some(isOwnedRoadTile);
  if (!nearRoad) return 0;

  return completedTechs.includes('railway-expansion') ? ROAD_SUPPLY_EXTENSION.rail : ROAD_SUPPLY_EXTENSION.road;
}

export function getPrimarySupplySource(
  state: GameState,
  civId: string,
  coord: HexCoord,
  candidates: CivSupplySourceCandidates = getCivSupplySourceCandidates(state, civId),
): SupplySourceRef | null {
  const ranked: Array<SupplySourceRef & { distance: number }> = [];
  const roadExtension = getRoadSupplyExtension(state, civId, coord);

  for (const city of candidates.cities) {
    const distance = mapDistance(state.map, city.position, coord);
    if (distance <= LAND_SUPPLY_RADII.city + roadExtension) ranked.push({ kind: 'city', id: city.id, coord: city.position, distance });
  }
  for (const fortCoord of candidates.fortCoords) {
    const distance = mapDistance(state.map, fortCoord, coord);
    if (distance <= candidates.fortRadius + roadExtension) ranked.push({ kind: 'fort', id: hexKey(fortCoord), coord: fortCoord, distance });
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
  const roadExtension = getRoadSupplyExtension(state, civId, coord);
  for (const city of candidates.cities) {
    if (mapDistance(state.map, city.position, coord) <= LAND_SUPPLY_RADII.city + roadExtension) return true;
  }
  for (const fortCoord of candidates.fortCoords) {
    if (mapDistance(state.map, fortCoord, coord) <= candidates.fortRadius + roadExtension) return true;
  }
  return false;
}
