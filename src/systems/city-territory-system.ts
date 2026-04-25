import type { City, GameMap, GameState, HexCoord } from '@/core/types';
import { hexDistance, hexKey, wrapHexCoord, wrappedHexDistance } from './hex-utils';

export const MIN_CITY_CENTER_DISTANCE = 4;

export interface CityFoundingBlocker {
  reason: 'too-close' | 'invalid-terrain' | 'occupied' | 'unreachable';
  cityId?: string;
  cityName?: string;
  distance?: number;
}

export interface TileWorkClaim {
  cityId: string;
  civId: string;
  coord: HexCoord;
}

export type CityWorkClaimIndex = Record<string, TileWorkClaim>;

export interface CityWorkClaimNormalizationResult {
  state: GameState;
  changedCityIds: string[];
}

export interface CityFoundingValidationOptions {
  ignoreUnitId?: string;
}

export function canonicalizeCityCoord(coord: HexCoord, map: GameMap): HexCoord {
  return map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : { ...coord };
}

export function cityDistance(a: HexCoord, b: HexCoord, map: GameMap): number {
  return map.wrapsHorizontally ? wrappedHexDistance(a, b, map.width) : hexDistance(a, b);
}

function isValidCityCenterTerrain(state: GameState, position: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(canonicalizeCityCoord(position, state.map))];
  return Boolean(tile && tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain');
}

export function getCityFoundingBlockers(
  state: GameState,
  position: HexCoord,
  options: CityFoundingValidationOptions = {},
): CityFoundingBlocker[] {
  const canonical = canonicalizeCityCoord(position, state.map);
  const blockers: CityFoundingBlocker[] = [];

  if (!isValidCityCenterTerrain(state, canonical)) {
    blockers.push({ reason: 'invalid-terrain' });
  }

  const occupied = Object.values(state.units).some(unit =>
    unit.id !== options.ignoreUnitId &&
    unit.position.q === canonical.q &&
    unit.position.r === canonical.r,
  );
  if (occupied) {
    blockers.push({ reason: 'occupied' });
  }

  for (const city of Object.values(state.cities)) {
    const distance = cityDistance(canonical, city.position, state.map);
    if (distance < MIN_CITY_CENTER_DISTANCE) {
      blockers.push({
        reason: 'too-close',
        cityId: city.id,
        cityName: city.name,
        distance,
      });
    }
  }

  return blockers;
}

export function canFoundCityAt(
  state: GameState,
  position: HexCoord,
  options: CityFoundingValidationOptions = {},
): boolean {
  return getCityFoundingBlockers(state, position, options).length === 0;
}

export function formatCityFoundingBlockerMessage(blockers: CityFoundingBlocker[]): string {
  const tooClose = blockers.find(blocker => blocker.reason === 'too-close');
  if (tooClose?.cityName) return `Too close to ${tooClose.cityName}.`;
  if (blockers.some(blocker => blocker.reason === 'invalid-terrain')) return 'Cities must be founded on land.';
  if (blockers.some(blocker => blocker.reason === 'occupied')) return 'Another unit is blocking this city site.';
  return 'This location cannot support a city.';
}

export function buildCityWorkClaimIndex(state: GameState): CityWorkClaimIndex {
  const index: CityWorkClaimIndex = {};
  for (const city of Object.values(state.cities)) {
    for (const coord of city.workedTiles ?? []) {
      const canonical = canonicalizeCityCoord(coord, state.map);
      const key = hexKey(canonical);
      if (!index[key]) {
        index[key] = { cityId: city.id, civId: city.owner, coord: canonical };
      }
    }
  }
  return index;
}

function compareClaimCities(tileOwner: string | null, tileCoord: HexCoord, map: GameMap, left: City, right: City): number {
  const leftControlsTile = left.owner === tileOwner ? 0 : 1;
  const rightControlsTile = right.owner === tileOwner ? 0 : 1;
  if (leftControlsTile !== rightControlsTile) return leftControlsTile - rightControlsTile;

  const leftDistance = cityDistance(left.position, tileCoord, map);
  const rightDistance = cityDistance(right.position, tileCoord, map);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;

  return left.id.localeCompare(right.id);
}

interface ClaimCandidate {
  city: City;
  coord: HexCoord;
}

export function normalizeCityWorkClaims(state: GameState): CityWorkClaimNormalizationResult {
  const claimsByTile = new Map<string, ClaimCandidate[]>();
  const changedCityIds = new Set<string>();

  for (const city of Object.values(state.cities)) {
    for (const coord of city.workedTiles ?? []) {
      const canonical = canonicalizeCityCoord(coord, state.map);
      const key = hexKey(canonical);
      const current = claimsByTile.get(key) ?? [];
      current.push({ city, coord: canonical });
      claimsByTile.set(key, current);
    }
  }

  const allowedByCity = new Map<string, Set<string>>();
  for (const [key, candidates] of claimsByTile.entries()) {
    const canonical = candidates[0].coord;
    const tileOwner = state.map.tiles[key]?.owner ?? null;
    const eligible = candidates.filter(candidate => candidate.city.owner === tileOwner);

    if (eligible.length === 0) {
      for (const candidate of candidates) {
        changedCityIds.add(candidate.city.id);
      }
      continue;
    }

    const [winner] = eligible
      .slice()
      .sort((left, right) => compareClaimCities(tileOwner, canonical, state.map, left.city, right.city));
    if (!winner) continue;
    const allowed = allowedByCity.get(winner.city.id) ?? new Set<string>();
    allowed.add(key);
    allowedByCity.set(winner.city.id, allowed);
    for (const candidate of candidates) {
      if (candidate.city.id !== winner.city.id || candidate.coord.q !== canonical.q || candidate.coord.r !== canonical.r) {
        changedCityIds.add(candidate.city.id);
      }
    }
  }

  const cities = { ...state.cities };
  for (const city of Object.values(state.cities)) {
    const allowed = allowedByCity.get(city.id) ?? new Set<string>();
    const seen = new Set<string>();
    const normalized = (city.workedTiles ?? [])
      .map(coord => canonicalizeCityCoord(coord, state.map))
      .filter(coord => {
        const key = hexKey(coord);
        if (!allowed.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (JSON.stringify(normalized) !== JSON.stringify(city.workedTiles ?? [])) {
      cities[city.id] = { ...city, workedTiles: normalized };
      changedCityIds.add(city.id);
    }
  }

  return { state: { ...state, cities }, changedCityIds: Array.from(changedCityIds) };
}
