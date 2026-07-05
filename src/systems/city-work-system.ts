import type { CityFocus, CivBonusEffect, GameState, HexCoord, ResourceYield } from '@/core/types';
import { hexKey } from './hex-utils';
import { calculateCityYields } from './resource-system';
import { getTileYield } from './tile-yield';
import {
  buildCityWorkClaimIndex,
  canonicalizeCityCoord,
  normalizeCityWorkClaims,
  type TileWorkClaim,
} from './city-territory-system';

export interface WorkableCityTile {
  coord: HexCoord;
  yield: ResourceYield;
  isWater: boolean;
  available: boolean;
  claim?: TileWorkClaim;
}

export interface CityWorkMutationResult {
  state: GameState;
  changed: boolean;
  reason?: 'missing-city' | 'not-workable' | 'claimed' | 'no-capacity';
  unassignedCitizens: number;
}

export function calculateWorkedTileYield(state: GameState, coord: HexCoord): ResourceYield {
  const canonical = canonicalizeCityCoord(coord, state.map);
  const tile = state.map.tiles[hexKey(canonical)];
  if (!tile) return { food: 0, production: 0, gold: 0, science: 0 };

  const completedTechs = tile.owner != null
    ? (state.civilizations[tile.owner]?.techState.completed ?? [])
    : [];

  return getTileYield(tile, state.map, canonical, { completedTechs });
}

function sameCoord(left: HexCoord, right: HexCoord): boolean {
  return left.q === right.q && left.r === right.r;
}

function isWorkableTerrain(terrain: string): boolean {
  return terrain !== 'ocean';
}

function isWaterTerrain(terrain: string): boolean {
  return terrain === 'coast';
}

function isClaimStillValid(state: GameState, tileKey: string, claim: TileWorkClaim): boolean {
  const claimedCity = state.cities[claim.cityId];
  const tile = state.map.tiles[tileKey];
  return Boolean(claimedCity && tile && tile.owner === claimedCity.owner);
}

export function getWorkableTilesForCity(state: GameState, cityId: string): WorkableCityTile[] {
  const city = state.cities[cityId];
  if (!city) return [];

  const claims = buildCityWorkClaimIndex(state);
  const seen = new Set<string>();
  const tiles: WorkableCityTile[] = [];

  for (const rawCoord of city.ownedTiles) {
    const coord = canonicalizeCityCoord(rawCoord, state.map);
    const key = hexKey(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    if (sameCoord(coord, city.position)) continue;

    const tile = state.map.tiles[key];
    if (!tile || tile.owner !== city.owner || !isWorkableTerrain(tile.terrain)) continue;

    const claim = claims[key];
    const claimedByOtherCity = Boolean(claim && claim.cityId !== city.id && isClaimStillValid(state, key, claim));
    tiles.push({
      coord,
      yield: calculateWorkedTileYield(state, coord),
      isWater: isWaterTerrain(tile.terrain),
      available: !claimedByOtherCity,
      claim: claimedByOtherCity ? claim : undefined,
    });
  }

  return tiles;
}

function scoreYieldForFocus(yieldValue: ResourceYield, focus: CityFocus): number {
  switch (focus) {
    case 'food':
      return yieldValue.food * 100 + yieldValue.production * 10 + yieldValue.gold + yieldValue.science;
    case 'production':
      return yieldValue.production * 100 + yieldValue.food * 10 + yieldValue.gold + yieldValue.science;
    case 'gold':
      return yieldValue.gold * 100 + yieldValue.food * 10 + yieldValue.production + yieldValue.science;
    case 'science':
      return yieldValue.science * 100 + yieldValue.food * 10 + yieldValue.production + yieldValue.gold;
    case 'balanced':
    case 'custom':
      return yieldValue.food * 3 + yieldValue.production * 3 + yieldValue.gold * 2 + yieldValue.science * 2;
  }
}

function countUnassigned(cityPopulation: number, workedTiles: HexCoord[]): number {
  return Math.max(0, cityPopulation - workedTiles.length);
}

export function assignCityFocus(state: GameState, cityId: string, focus: Exclude<CityFocus, 'custom'>): CityWorkMutationResult {
  const city = state.cities[cityId];
  if (!city) return { state, changed: false, reason: 'missing-city', unassignedCitizens: 0 };

  const ranked = getWorkableTilesForCity(state, cityId)
    .filter(tile => tile.available)
    .sort((left, right) => {
      const scoreDelta = scoreYieldForFocus(right.yield, focus) - scoreYieldForFocus(left.yield, focus);
      return scoreDelta || hexKey(left.coord).localeCompare(hexKey(right.coord));
    });

  const workedTiles = ranked.slice(0, city.population).map(tile => tile.coord);
  const cities = {
    ...state.cities,
    [cityId]: { ...city, focus, workedTiles },
  };
  const normalized = normalizeCityWorkClaims({ ...state, cities });
  const normalizedCity = normalized.state.cities[cityId];
  return {
    state: normalized.state,
    changed: true,
    unassignedCitizens: countUnassigned(normalizedCity.population, normalizedCity.workedTiles),
  };
}

export function setCityWorkedTile(state: GameState, cityId: string, coord: HexCoord, worked: boolean): CityWorkMutationResult {
  const city = state.cities[cityId];
  if (!city) return { state, changed: false, reason: 'missing-city', unassignedCitizens: 0 };

  const canonical = canonicalizeCityCoord(coord, state.map);
  const key = hexKey(canonical);
  const workable = getWorkableTilesForCity(state, cityId).find(tile => hexKey(tile.coord) === key);
  if (!workable) {
    return { state, changed: false, reason: 'not-workable', unassignedCitizens: countUnassigned(city.population, city.workedTiles) };
  }
  if (worked && !workable.available) {
    return { state, changed: false, reason: 'claimed', unassignedCitizens: countUnassigned(city.population, city.workedTiles) };
  }

  const existing = city.workedTiles.map(tile => canonicalizeCityCoord(tile, state.map));
  const withoutTarget = existing.filter(tile => hexKey(tile) !== key);
  const nextWorkedTiles = worked ? [...withoutTarget, canonical].slice(0, city.population) : withoutTarget;
  if (worked && nextWorkedTiles.length === existing.length && !existing.some(tile => hexKey(tile) === key)) {
    return { state, changed: false, reason: 'no-capacity', unassignedCitizens: 0 };
  }

  const cities = {
    ...state.cities,
    [cityId]: { ...city, focus: 'custom' as const, workedTiles: nextWorkedTiles },
  };
  const normalized = normalizeCityWorkClaims({ ...state, cities });
  const normalizedCity = normalized.state.cities[cityId];
  return {
    state: normalized.state,
    changed: true,
    unassignedCitizens: countUnassigned(normalizedCity.population, normalizedCity.workedTiles),
  };
}

export function normalizeWorkedTilesForCity(state: GameState, cityId: string): CityWorkMutationResult {
  const city = state.cities[cityId];
  if (!city) return { state, changed: false, reason: 'missing-city', unassignedCitizens: 0 };

  const validKeys = new Set(getWorkableTilesForCity(state, cityId).filter(tile => tile.available).map(tile => hexKey(tile.coord)));
  const workedTiles = city.workedTiles
    .map(coord => canonicalizeCityCoord(coord, state.map))
    .filter(coord => validKeys.has(hexKey(coord)))
    .slice(0, city.population);
  const cities = { ...state.cities, [cityId]: { ...city, workedTiles } };
  const normalized = normalizeCityWorkClaims({ ...state, cities });
  const normalizedCity = normalized.state.cities[cityId];
  return {
    state: normalized.state,
    changed: true,
    unassignedCitizens: countUnassigned(normalizedCity.population, normalizedCity.workedTiles),
  };
}

export function normalizeCityWorkAfterTerritoryChange(state: GameState, cityId: string): CityWorkMutationResult {
  const city = state.cities[cityId];
  if (!city) return { state, changed: false, reason: 'missing-city', unassignedCitizens: 0 };
  return city.focus === 'custom'
    ? normalizeWorkedTilesForCity(state, cityId)
    : assignCityFocus(state, cityId, city.focus);
}

export function calculateProjectedCityYields(
  state: GameState,
  cityId: string,
  bonusEffect?: CivBonusEffect,
): ResourceYield {
  const city = state.cities[cityId];
  if (!city) return { food: 0, production: 0, gold: 0, science: 0 };

  const workResult = city.focus === 'custom'
    ? normalizeWorkedTilesForCity(state, cityId)
    : assignCityFocus(state, cityId, city.focus);
  const projectedCity = workResult.state.cities[cityId] ?? city;
  const completedTechs = workResult.state.civilizations?.[projectedCity.owner]?.techState.completed ?? [];
  const yields = calculateCityYields(projectedCity, workResult.state.map, bonusEffect, completedTechs);

  if (city.productionQueue.length === 0 && city.idleProduction) {
    if (city.idleProduction === 'gold') {
      return { ...yields, production: 0, gold: yields.gold + yields.production };
    }
    if (city.idleProduction === 'science') {
      return { ...yields, production: 0, science: yields.science + yields.production };
    }
  }

  return yields;
}
