import type { City, GameEvents, GameMap, GameState, HexCoord, TerritoryFrontierState } from '@/core/types';
import { BUILDINGS } from './city-system';
import { hexDistance, hexesInRange, hexKey, wrapHexCoord, wrappedHexDistance } from './hex-utils';

export const MIN_CITY_CENTER_DISTANCE = 4;

export interface CityFoundingBlocker {
  reason: 'too-close' | 'invalid-terrain';
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

export type TerritoryRecalculationReason =
  | 'founding'
  | 'capture'
  | 'raze'
  | 'city-loss'
  | 'turn'
  | 'load';

export interface TerritoryClaim {
  cityId: string;
  civId: string;
  coord: HexCoord;
  radiusBand: number;
  pressure: number;
  reason: TerritoryRecalculationReason;
}

export interface TerritoryResolution {
  coord: HexCoord;
  previousOwner: string | null;
  winningCityId: string | null;
  winningCivId: string | null;
  competingClaims: TerritoryClaim[];
  reason: TerritoryRecalculationReason;
}

export interface TerritoryRecalculationOptions {
  reason: TerritoryRecalculationReason;
  preserveForeignHolders?: boolean;
  preserveCurrentHolderOnTie?: boolean;
}

export interface TerritoryRecalculationResult {
  state: GameState;
  resolutions: TerritoryResolution[];
  contestedResolutions: TerritoryResolution[];
}

export interface TerritoryFrontierProgressResult {
  state: GameState;
  flippedResolutions: TerritoryResolution[];
}

export function canonicalizeCityCoord(coord: HexCoord, map: GameMap): HexCoord {
  return map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : { ...coord };
}

export function cityDistance(a: HexCoord, b: HexCoord, map: GameMap): number {
  return map.wrapsHorizontally ? wrappedHexDistance(a, b, map.width) : hexDistance(a, b);
}

function canClaimTile(tile: GameState['map']['tiles'][string] | undefined): boolean {
  return Boolean(tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain');
}

const CULTURE_BUILDING_IDS = new Set(
  Object.values(BUILDINGS)
    .filter(building => building.category === 'culture')
    .map(building => building.id),
);

export function countCultureBuildings(city: City): number {
  return city.buildings.filter(id => CULTURE_BUILDING_IDS.has(id)).length;
}

export function getCulturalTerritoryRadius(city: City): number {
  const cultureBuildings = countCultureBuildings(city);
  if (city.population >= 4) return 3;
  if (city.maturity === 'town' || city.maturity === 'city' || city.maturity === 'metropolis') return 3;
  if (city.population >= 3 && cultureBuildings >= 1) return 3;
  if (cultureBuildings >= 2) return 3;
  return 2;
}

export function getBaseTerritoryRadius(city: City): number {
  return getCulturalTerritoryRadius(city);
}

export const TERRITORY_PRESSURE_BALANCE = {
  basePressure: 6,
  softTrimMargin: 2,
  cultureBuildingCap: 3,
  likelyToFlipProgress: 8,
  frontierFlipProgress: 10,
  maturityBonus: {
    outpost: 0,
    village: 1,
    town: 2,
    city: 3,
    metropolis: 4,
  } satisfies Record<City['maturity'], number>,
} as const;

export function calculateCityPressureForTile(state: GameState, city: City, coord: HexCoord): number {
  return TERRITORY_PRESSURE_BALANCE.basePressure
    + TERRITORY_PRESSURE_BALANCE.maturityBonus[city.maturity]
    + Math.floor(city.population / 2)
    + Math.min(TERRITORY_PRESSURE_BALANCE.cultureBuildingCap, countCultureBuildings(city))
    - cityDistance(city.position, coord, state.map);
}

function getStrongestChallengerClaim(
  claims: TerritoryClaim[],
  holderCivId: string,
): TerritoryClaim | null {
  return claims
    .filter(claim => claim.civId !== holderCivId)
    .sort((left, right) => {
      if (right.pressure !== left.pressure) return right.pressure - left.pressure;
      if (left.radiusBand !== right.radiusBand) return left.radiusBand - right.radiusBand;
      return left.cityId.localeCompare(right.cityId);
    })[0] ?? null;
}

export function generateTerritoryClaimsForCity(
  state: GameState,
  city: City,
  reason: TerritoryRecalculationReason,
): TerritoryClaim[] {
  const claims: TerritoryClaim[] = [];
  for (const rawCoord of hexesInRange(city.position, getBaseTerritoryRadius(city))) {
    const coord = canonicalizeCityCoord(rawCoord, state.map);
    const tile = state.map.tiles[hexKey(coord)];
    if (!canClaimTile(tile)) continue;
    claims.push({
      cityId: city.id,
      civId: city.owner,
      coord,
      radiusBand: cityDistance(city.position, coord, state.map),
      pressure: calculateCityPressureForTile(state, city, coord),
      reason,
    });
  }
  return claims;
}

function chooseTerritoryWinner(
  claims: TerritoryClaim[],
  previousOwner: string | null,
  options: TerritoryRecalculationOptions,
): TerritoryClaim | null {
  if (options.preserveForeignHolders && previousOwner) {
    const holderClaim = claims.find(claim => claim.civId === previousOwner);
    if (holderClaim) return holderClaim;
    return null;
  }

  const holderClaim = previousOwner ? claims.find(claim => claim.civId === previousOwner) ?? null : null;
  const strongest = claims.slice().sort((left, right) => {
    if (right.pressure !== left.pressure) return right.pressure - left.pressure;
    if (left.radiusBand !== right.radiusBand) return left.radiusBand - right.radiusBand;
    return left.cityId.localeCompare(right.cityId);
  })[0] ?? null;
  if (
    options.preserveCurrentHolderOnTie
    && holderClaim
    && strongest
    && strongest.civId !== holderClaim.civId
    && strongest.pressure - holderClaim.pressure < TERRITORY_PRESSURE_BALANCE.softTrimMargin
  ) {
    return holderClaim;
  }
  return strongest;
}

function clearWorkerTasksForCoord(units: GameState['units'], coord: HexCoord): GameState['units'] {
  const key = hexKey(coord);
  let changed = false;
  const nextUnits: GameState['units'] = {};
  for (const [unitId, unit] of Object.entries(units)) {
    if (unit.workerTask && hexKey(unit.workerTask.coord) === key) {
      nextUnits[unitId] = { ...unit, workerTask: undefined };
      changed = true;
    } else {
      nextUnits[unitId] = unit;
    }
  }
  return changed ? nextUnits : units;
}

function addOwnedTile(city: City, coord: HexCoord): City {
  const key = hexKey(coord);
  if (city.ownedTiles.some(owned => hexKey(owned) === key)) return city;
  return { ...city, ownedTiles: [...city.ownedTiles, coord] };
}

function removeOwnedTile(city: City, coord: HexCoord): City {
  const key = hexKey(coord);
  return { ...city, ownedTiles: city.ownedTiles.filter(owned => hexKey(owned) !== key) };
}

export function recalculateTerritory(
  state: GameState,
  options: TerritoryRecalculationOptions,
): TerritoryRecalculationResult {
  const claimsByTile = new Map<string, TerritoryClaim[]>();
  for (const city of Object.values(state.cities)) {
    for (const claim of generateTerritoryClaimsForCity(state, city, options.reason)) {
      const key = hexKey(claim.coord);
      claimsByTile.set(key, [...(claimsByTile.get(key) ?? []), claim]);
    }
  }

  const nextTiles = { ...state.map.tiles };
  const nextCities: GameState['cities'] = {};
  let nextUnits = state.units;
  const ownedByCity = new Map<string, HexCoord[]>();
  const resolutions: TerritoryResolution[] = [];
  const contestedResolutions: TerritoryResolution[] = [];

  for (const city of Object.values(state.cities)) {
    nextCities[city.id] = { ...city, ownedTiles: [] };
  }

  const keysToResolve = new Set<string>(claimsByTile.keys());
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    if (tile.owner) keysToResolve.add(key);
  }

  for (const key of keysToResolve) {
    const claims = claimsByTile.get(key) ?? [];
    const tile = state.map.tiles[key];
    if (!tile) continue;

    const previousOwner = tile.owner ?? null;
    const winner = chooseTerritoryWinner(claims, previousOwner, options);
    const winningCivId = winner?.civId ?? (options.preserveForeignHolders && previousOwner ? previousOwner : null);
    if (winner) {
      let nextTile = { ...tile, owner: winner.civId };
      if (previousOwner !== winner.civId && tile.improvement !== 'none' && tile.improvementTurnsLeft > 0) {
        nextTile = { ...nextTile, improvement: 'none', improvementTurnsLeft: 0 };
        nextUnits = clearWorkerTasksForCoord(nextUnits, tile.coord);
      }
      nextTiles[key] = nextTile;
      ownedByCity.set(winner.cityId, [...(ownedByCity.get(winner.cityId) ?? []), winner.coord]);
    } else if (!options.preserveForeignHolders || !previousOwner) {
      let nextTile = { ...tile, owner: null };
      if (previousOwner !== null && tile.improvement !== 'none' && tile.improvementTurnsLeft > 0) {
        nextTile = { ...nextTile, improvement: 'none', improvementTurnsLeft: 0 };
        nextUnits = clearWorkerTasksForCoord(nextUnits, tile.coord);
      }
      nextTiles[key] = nextTile;
    }

    if (winningCivId !== previousOwner) {
      resolutions.push({
        coord: tile.coord,
        previousOwner,
        winningCityId: winner?.cityId ?? null,
        winningCivId,
        competingClaims: claims,
        reason: options.reason,
      });
    } else if (previousOwner && winner?.civId === previousOwner && claims.length > 1) {
      const holderClaim = claims.find(claim => claim.civId === previousOwner) ?? null;
      const challengerClaim = getStrongestChallengerClaim(claims, previousOwner);
      if (holderClaim && challengerClaim && challengerClaim.pressure > holderClaim.pressure) {
        contestedResolutions.push({
          coord: tile.coord,
          previousOwner,
          winningCityId: challengerClaim.cityId,
          winningCivId: challengerClaim.civId,
          competingClaims: claims,
          reason: options.reason,
        });
      }
    }
  }

  for (const [cityId, city] of Object.entries(nextCities)) {
    const seen = new Set<string>();
    nextCities[cityId] = {
      ...city,
      ownedTiles: (ownedByCity.get(cityId) ?? []).filter(coord => {
        const key = hexKey(coord);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    };
  }

  const normalized = normalizeCityWorkClaims({
    ...state,
    map: {
      ...state.map,
      tiles: nextTiles,
    },
    cities: nextCities,
    units: nextUnits,
  });

  return { state: normalized.state, resolutions, contestedResolutions };
}

export function buildTerritoryTileFlippedEvents(
  before: GameState,
  after: GameState,
  resolutions: TerritoryResolution[],
): GameEvents['territory:tile-flipped'][] {
  const events: GameEvents['territory:tile-flipped'][] = [];
  for (const resolution of resolutions) {
    if (!resolution.previousOwner || !resolution.winningCivId || resolution.previousOwner === resolution.winningCivId) {
      continue;
    }
    const key = hexKey(resolution.coord);
    const beforeTile = before.map.tiles[key];
    const afterTile = after.map.tiles[key];
    if (!beforeTile || !afterTile) continue;
    events.push({
      coord: resolution.coord,
      previousOwner: resolution.previousOwner,
      newOwner: resolution.winningCivId,
      improvement: afterTile.improvement,
      constructionCancelled: beforeTile.improvement !== 'none'
        && beforeTile.improvementTurnsLeft > 0
        && afterTile.improvement === 'none'
        && afterTile.improvementTurnsLeft === 0,
    });
  }
  return events;
}

function hasStrongerCompetingFrontierClaim(state: GameState, frontier: TerritoryFrontierState): boolean {
  const holderCity = state.cities[frontier.holderCityId];
  const challengerCity = state.cities[frontier.challengerCityId];
  if (!holderCity || !challengerCity) return false;
  const key = hexKey(frontier.coord);
  const holderClaim = generateTerritoryClaimsForCity(state, holderCity, 'turn')
    .find(claim => hexKey(claim.coord) === key && claim.civId === frontier.holderCivId);
  const challengerClaim = generateTerritoryClaimsForCity(state, challengerCity, 'turn')
    .find(claim => hexKey(claim.coord) === key && claim.civId === frontier.challengerCivId);
  return Boolean(holderClaim && challengerClaim && challengerClaim.pressure > holderClaim.pressure);
}

export function cleanupTerritoryFrontiers(state: GameState): GameState {
  const next: Record<string, TerritoryFrontierState> = {};
  for (const [key, frontier] of Object.entries(state.territoryFrontiers ?? {})) {
    if (!state.cities[frontier.holderCityId] || !state.cities[frontier.challengerCityId]) continue;
    const tile = state.map.tiles[key];
    if (!tile || tile.owner !== frontier.holderCivId) continue;
    if (!hasStrongerCompetingFrontierClaim(state, frontier)) continue;
    next[key] = frontier;
  }
  return { ...state, territoryFrontiers: next };
}

export function applyTerritoryFrontierProgress(territory: TerritoryRecalculationResult): GameState {
  return applyTerritoryFrontierProgressWithEvents(territory).state;
}

export function applyTerritoryFrontierProgressWithEvents(
  territory: TerritoryRecalculationResult,
): TerritoryFrontierProgressResult {
  const frontiers: Record<string, TerritoryFrontierState> = { ...(territory.state.territoryFrontiers ?? {}) };
  const flippedResolutions: TerritoryResolution[] = [];

  for (const resolution of territory.contestedResolutions) {
    const holder = resolution.previousOwner;
    const challenger = resolution.winningCivId;
    if (!holder || !challenger || holder === challenger) continue;
    const holderClaim = resolution.competingClaims.find(claim => claim.civId === holder);
    const challengerClaim = resolution.competingClaims.find(claim => claim.civId === challenger);
    if (!holderClaim || !challengerClaim) continue;
    const key = hexKey(resolution.coord);
    const previous = frontiers[key]?.progress ?? 0;
    const delta = Math.max(1, challengerClaim.pressure - holderClaim.pressure);
    const progress = Math.min(TERRITORY_PRESSURE_BALANCE.frontierFlipProgress, previous + delta);
    if (progress >= TERRITORY_PRESSURE_BALANCE.frontierFlipProgress) {
      flippedResolutions.push({
        ...resolution,
        winningCityId: challengerClaim.cityId,
        winningCivId: challengerClaim.civId,
      });
      delete frontiers[key];
      continue;
    }
    frontiers[key] = {
      coord: resolution.coord,
      holderCivId: holder,
      challengerCivId: challenger,
      holderCityId: holderClaim.cityId,
      challengerCityId: challengerClaim.cityId,
      progress,
      trend: progress >= TERRITORY_PRESSURE_BALANCE.likelyToFlipProgress ? 'likely-to-flip' : 'contested',
      reason: `${challenger} cultural pressure is challenging ${holder}.`,
    };
  }

  let nextState = cleanupTerritoryFrontiers({ ...territory.state, territoryFrontiers: frontiers });
  if (flippedResolutions.length === 0) {
    return { state: nextState, flippedResolutions };
  }

  let nextUnits = nextState.units;
  const nextTiles = { ...nextState.map.tiles };
  const nextCities = { ...nextState.cities };
  const appliedResolutions: TerritoryResolution[] = [];
  for (const resolution of flippedResolutions) {
    if (!resolution.previousOwner || !resolution.winningCivId || !resolution.winningCityId) continue;
    const key = hexKey(resolution.coord);
    const tile = nextTiles[key];
    if (!tile || tile.owner !== resolution.previousOwner) continue;
    let nextTile = { ...tile, owner: resolution.winningCivId };
    if (tile.improvement !== 'none' && tile.improvementTurnsLeft > 0) {
      nextTile = { ...nextTile, improvement: 'none', improvementTurnsLeft: 0 };
      nextUnits = clearWorkerTasksForCoord(nextUnits, tile.coord);
    }
    nextTiles[key] = nextTile;
    const holderCity = nextCities[resolution.competingClaims.find(claim => claim.civId === resolution.previousOwner)?.cityId ?? ''];
    const challengerCity = nextCities[resolution.winningCityId];
    if (holderCity) nextCities[holderCity.id] = removeOwnedTile(holderCity, resolution.coord);
    if (challengerCity) nextCities[challengerCity.id] = addOwnedTile(challengerCity, resolution.coord);
    delete nextState.territoryFrontiers?.[key];
    appliedResolutions.push(resolution);
  }

  nextState = normalizeCityWorkClaims({
    ...nextState,
    map: { ...nextState.map, tiles: nextTiles },
    cities: nextCities,
    units: nextUnits,
  }).state;

  return { state: nextState, flippedResolutions: appliedResolutions };
}

export function processTerritoryFrontiers(state: GameState): GameState {
  return applyTerritoryFrontierProgress(
    recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true }),
  );
}

function isValidCityCenterTerrain(state: GameState, position: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(canonicalizeCityCoord(position, state.map))];
  return Boolean(tile && tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain');
}

export function getCityFoundingBlockers(
  state: GameState,
  position: HexCoord,
): CityFoundingBlocker[] {
  const canonical = canonicalizeCityCoord(position, state.map);
  const blockers: CityFoundingBlocker[] = [];

  if (!isValidCityCenterTerrain(state, canonical)) {
    blockers.push({ reason: 'invalid-terrain' });
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
): boolean {
  return getCityFoundingBlockers(state, position).length === 0;
}

export function formatCityFoundingBlockerMessage(blockers: CityFoundingBlocker[]): string {
  const tooClose = blockers.find(blocker => blocker.reason === 'too-close');
  if (tooClose?.cityName) return `Too close to ${tooClose.cityName}.`;
  if (blockers.some(blocker => blocker.reason === 'invalid-terrain')) return 'Cities must be founded on land.';
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
