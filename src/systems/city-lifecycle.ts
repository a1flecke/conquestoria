import type { City, GameMap, GameState, HexCoord } from '@/core/types';
import type { IdCounters } from '@/core/types/ids';
import { hexKey, hexesInRange, hexNeighbors, wrapHexCoord } from './hex-utils';
import { drawNextCityName, DEFAULT_CITY_NAMES } from './city-name-system';
import { INITIAL_CITY_FOCUS, INITIAL_CITY_MATURITY } from './city-maturity-system';
import { getFoundingBonusFood } from './tech-yield-definitions';

/**
 * City lifecycle and geography (#1008): founding a city, coastal/positional
 * predicates and forest razing. Leaf-ward -- depends on map/hex/name helpers,
 * not on cost, availability, turn processing or presentation.
 */
export const CITY_NAMES = DEFAULT_CITY_NAMES;

export interface FoundCityOptions {
  civType?: string;
  namingPool?: string[];
  usedNames?: Set<string>;
  civName?: string;
  completedTechs?: string[];
  foundingProductionBonus?: number;
}

export function foundCity(owner: string, position: HexCoord, map: GameMap, counters: IdCounters, options: FoundCityOptions = {}): City {
  const canonicalPosition = map.wrapsHorizontally ? wrapHexCoord(position, map.width) : { ...position };
  const name = drawNextCityName(options.civType ?? owner, options.usedNames ?? new Set<string>(), {
    namingPool: options.namingPool,
    civName: options.civName,
  });

  // Claim nearby land tiles (radius 1)
  const ownedTileMap = new Map<string, HexCoord>();
  const nearby = hexesInRange(canonicalPosition, 1);
  for (const coord of nearby) {
    const canonical = map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : { ...coord };
    const tile = map.tiles[hexKey(canonical)];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain') {
      ownedTileMap.set(hexKey(canonical), canonical);
    }
  }
  const ownedTiles = Array.from(ownedTileMap.values());
  const foundingBonusFood = getFoundingBonusFood(options.completedTechs ?? []);

  return {
    id: `city-${counters.nextCityId++}`,
    name,
    owner,
    position: canonicalPosition,
    population: 1,
    food: foundingBonusFood,
    foodNeeded: 15,
    buildings: [],
    productionQueue: [],
    productionProgress: options.foundingProductionBonus ?? 0,
    ownedTiles,
    workedTiles: [],
    focus: INITIAL_CITY_FOCUS,
    maturity: INITIAL_CITY_MATURITY,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
  };
}

export function isPositionCoastal(position: HexCoord, map: GameMap): boolean {
  const coordsToCheck = [position, ...hexNeighbors(position)];
  return coordsToCheck.some(coord => {
    const wrapped = map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : coord;
    const t = map.tiles[hexKey(wrapped)];
    return t?.terrain === 'ocean' || t?.terrain === 'coast';
  });
}

export function isCityCoastal(city: City, map: GameMap): boolean {
  return isPositionCoastal(city.position, map);
}

/** #1107 — does this civilization currently own at least one genuinely coastal city? */
export function civHasCoastalCity(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  return civ.cities.some(cityId => {
    const city = state.cities[cityId];
    return city ? isCityCoastal(city, state.map) : false;
  });
}

export function razeForestForProduction(
  city: City,
  map: GameMap,
  tileCoord: HexCoord,
): { city: City; map: GameMap } | null {
  const key = `${tileCoord.q},${tileCoord.r}`;
  const tile = map.tiles[key];
  if (!tile || tile.terrain !== 'forest') return null;

  const isOwned = city.ownedTiles.some(t => t.q === tileCoord.q && t.r === tileCoord.r);
  if (!isOwned) return null;

  const newTile = { ...tile, terrain: 'plains' as const, improvement: 'none' as const, improvementTurnsLeft: 0 };
  const newMap = { ...map, tiles: { ...map.tiles, [key]: newTile } };
  const newCity = { ...city, productionProgress: city.productionProgress + 30 };
  return { city: newCity, map: newMap };
}
