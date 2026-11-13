import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord } from '@/core/types';
import { collectUsedCityNames } from '@/systems/city-name-system';
import {
  emitCivilizationLivenessTransitions,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { foundCity } from '@/systems/city-system';
import {
  buildTerritoryTileFlippedEvents,
  canFoundCityAt,
  canonicalizeCityCoord,
  cityDistance,
  recalculateTerritory,
} from '@/systems/city-territory-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { hexKey } from '@/systems/hex-utils';
import { initializeLegendaryWonderProjectsForCity } from '@/systems/legendary-wonder-system';
import { getFoundingBonusProduction } from '@/systems/tech-yield-definitions';
import { removeUnits } from '@/systems/unit-removal-system';
import { findPath } from '@/systems/unit-pathfinding';

export interface FoundCityInStateResult {
  state: GameState;
  cityId: string;
}

export function foundCityInState(
  state: GameState,
  settlerId: string,
  bus: EventBus,
): FoundCityInStateResult {
  const settler = state.units[settlerId];
  if (!settler) throw new Error('Settler not found');
  if (settler.type !== 'settler') throw new Error('Unit cannot found a city');
  if (settler.hasActed) throw new Error('Settler has already acted');
  if (settler.movementPointsLeft <= 0) {
    throw new Error('Settler has no movement remaining');
  }
  const civilization = state.civilizations[settler.owner];
  if (!civilization) throw new Error('Settler owner not found');
  if (settler.transportId) {
    throw new Error('Settler cannot found a city while aboard a transport');
  }
  if (!getCivilizationLiveness(state, settler.owner).living) {
    throw new Error('Settler owner is not living');
  }
  if (!canFoundCityAt(state, settler.position)) {
    throw new Error('City cannot be founded here');
  }

  let nextState = structuredClone(state);
  const nextCivilization = nextState.civilizations[settler.owner];
  const definition = resolveCivDefinition(nextState, nextCivilization.civType);
  const existingOwnedCityIds = nextCivilization.cities.filter(cityId =>
    nextState.cities[cityId]?.owner === settler.owner);
  const targetRegion = nextState.map.tiles[hexKey(canonicalizeCityCoord(settler.position, nextState.map))]?.regionKey;
  const isForeignLandmass = targetRegion != null && !existingOwnedCityIds.some(cityId => {
    const c = nextState.cities[cityId];
    return c != null && nextState.map.tiles[hexKey(canonicalizeCityCoord(c.position, nextState.map))]?.regionKey === targetRegion;
  });
  const city = foundCity(
    settler.owner,
    settler.position,
    nextState.map,
    nextState.idCounters,
    {
      civType: nextCivilization.civType,
      namingPool: definition?.cityNames,
      civName: definition?.name ?? nextCivilization.name,
      usedNames: collectUsedCityNames(nextState),
      completedTechs: nextCivilization.techState.completed,
      foundingProductionBonus: getFoundingBonusProduction(nextCivilization.techState.completed, isForeignLandmass),
    },
  );
  const recoveredFromNearDefeat = nextCivilization.nearDefeat === true
    && existingOwnedCityIds.length >= 1;
  nextState = {
    ...nextState,
    cities: {
      ...nextState.cities,
      [city.id]: city,
    },
    civilizations: {
      ...nextState.civilizations,
      [settler.owner]: {
        ...nextCivilization,
        cities: [...existingOwnedCityIds, city.id],
        nearDefeat: recoveredFromNearDefeat
          ? false
          : nextCivilization.nearDefeat,
      },
    },
  };
  // The settler is spent founding the city (also scrubs it from a transport manifest).
  nextState = removeUnits(nextState, [settlerId], { reason: 'consumed' }).state;
  nextState = initializeLegendaryWonderProjectsForCity(
    nextState,
    settler.owner,
    city.id,
  );
  const beforeTerritory = nextState;
  const territory = recalculateTerritory(nextState, {
    reason: 'founding',
    preserveForeignHolders: true,
  });
  nextState = territory.state;
  // Rome's Roman Roads: after territory, so the route respects the borders the new city just drew.
  nextState = applyAutoRoadsForNewCity(nextState, city.id).state;
  const liveness = reconcileCivilizationLiveness(state, nextState);
  nextState = liveness.state;

  for (const event of buildTerritoryTileFlippedEvents(
    beforeTerritory,
    nextState,
    territory.resolutions,
  )) {
    bus.emit('territory:tile-flipped', event);
  }
  bus.emit('city:founded', {
    city: nextState.cities[city.id] ?? city,
    founderId: settler.owner,
  });
  emitCivilizationLivenessTransitions(liveness, bus);
  if (recoveredFromNearDefeat) {
    bus.emit('civ:recovered-from-near-defeat', { civId: settler.owner });
  }

  return { state: nextState, cityId: city.id };
}

/** A new Roman city is linked to the nearest Roman city no farther than this many tiles away. */
export const AUTO_ROAD_MAX_CITY_DISTANCE = 10;

/**
 * Rome "Roman Roads" (#1692 A1): founding a city lays a finished road along the land route to the nearest city
 * the same civilization already owns. No technology or worker is needed (that is the bonus), but the ordinary
 * placement rules still hold: never on a city centre and never on another owner's land, so a route that crosses
 * a neighbour simply has a gap there. Returns the input state when the owner has no such bonus, no other city in
 * range, or no land route.
 */
export function applyAutoRoadsForNewCity(state: GameState, cityId: string): { state: GameState; roadTiles: HexCoord[] } {
  const city = state.cities[cityId];
  const civ = city ? state.civilizations[city.owner] : undefined;
  if (!city || !civ) return { state, roadTiles: [] };
  if (resolveCivDefinition(state, civ.civType ?? '')?.bonusEffect.type !== 'auto_roads') return { state, roadTiles: [] };

  const cityKeys = new Set(Object.values(state.cities).map(other => hexKey(other.position)));
  const neighbours = civ.cities
    .map(id => state.cities[id])
    .filter((other): other is NonNullable<typeof other> => Boolean(other) && other!.id !== city.id && other!.owner === city.owner)
    .map(other => ({ other, distance: cityDistance(city.position, other.position, state.map) }))
    .filter(entry => entry.distance <= AUTO_ROAD_MAX_CITY_DISTANCE)
    .sort((a, b) => a.distance - b.distance || a.other.id.localeCompare(b.other.id));

  for (const { other } of neighbours) {
    const path = findPath(city.position, other.position, state.map, 'land');
    if (!path) continue;
    const tiles = { ...state.map.tiles };
    const roadTiles: HexCoord[] = [];
    for (const coord of path) {
      const key = hexKey(coord);
      const tile = tiles[key];
      if (!tile || tile.hasRoad || cityKeys.has(key)) continue;
      if (tile.owner !== null && tile.owner !== undefined && tile.owner !== city.owner) continue;
      tiles[key] = { ...tile, hasRoad: true };
      roadTiles.push(coord);
    }
    if (roadTiles.length === 0) return { state, roadTiles };
    return { state: { ...state, map: { ...state.map, tiles } }, roadTiles };
  }
  return { state, roadTiles: [] };
}
