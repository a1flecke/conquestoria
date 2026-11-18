import type { BreakawayMetadata, Civilization, GameState } from '@/core/types';
import { transferLegendaryWondersForCity } from './legendary-wonder-ownership';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { isSpyUnitType } from '@/systems/spy-unit-types';
import { findLegalSpawnTile, spawnNeighbours } from '@/systems/unit-spawn-placement';
import { withNewOwner } from './unit-trained-movement-bonus';
import { removeNationalProjectsHostedBy } from './national-project-system';
import { beginCityMaterialOccurrence, releaseCityMaterialCommitment } from './city-production-materials';
import {
  eliminateCivilization,
  emitCivilizationLivenessTransitions,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';

const BREAKAWAY_ESTABLISHMENT_TURNS = 50;
export const REABSORB_RELATIONSHIP_MINIMUM = 50;
export const REABSORB_GOLD_COST = 200;

export function isBreakawayCiv(civ: Civilization): boolean {
  return civ.breakaway !== undefined;
}

function moveLoyalSpiesOffCity(state: GameState, cityId: string, ownerId: string): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  let next = state;
  const spies = Object.values(state.units)
    .filter(unit => unit.owner === ownerId && !unit.transportId && isSpyUnitType(unit.type)
      && unit.position.q === city.position.q && unit.position.r === city.position.r)
    .map(unit => unit.id)
    .sort();
  for (const spyId of spies) {
    const spy = next.units[spyId]!;
    const destination = findLegalSpawnTile(
      next,
      { ownerId, unitType: spy.type, stacking: 'same-owner' },
      spawnNeighbours(next, city.position),
    );
    if (destination) next = { ...next, units: { ...next.units, [spyId]: { ...spy, position: { ...destination } } } };
  }
  return next;
}

export function createBreakawayFromCity(
  stateBefore: GameState,
  cityId: string,
  bus: EventBus,
): GameState {
  // #1506 MR09: the city leaves its owner's control, so its material commitment is released against the
  // old owner's ledger first; the breakaway then funds the inherited work from its own (empty) ledger.
  const state = releaseCityMaterialCommitment(stateBefore, cityId);
  const city = state.cities[cityId];
  if (!city) {
    throw new Error(`Cannot create breakaway from missing city ${cityId}`);
  }

  const previousOwner = state.civilizations[city.owner];
  if (!previousOwner) {
    throw new Error(`Cannot create breakaway from missing owner ${city.owner}`);
  }

  const breakawayId = `breakaway-${cityId}`;
  const metadata: BreakawayMetadata = {
    originOwnerId: previousOwner.id,
    originCityId: cityId,
    startedTurn: state.turn,
    establishesOnTurn: state.turn + BREAKAWAY_ESTABLISHMENT_TURNS,
    status: 'secession',
  };

  const cityTerritory = new Set(city.ownedTiles.map(coord => `${coord.q},${coord.r}`));
  // A spy is its owner's agent, not part of the local garrison: it stays loyal (its espionage
  // record lives with the old owner, so a seceded spy unit would be a phantom that still fills a
  // spy slot), and one standing on the seceding city steps out, since a spy never stands on a city
  // its owner does not hold.
  const transferredUnitIds = Object.values(state.units)
    .filter(unit => unit.owner === previousOwner.id
      && !isSpyUnitType(unit.type)
      && cityTerritory.has(`${unit.position.q},${unit.position.r}`))
    .map(unit => unit.id);

  const updatedCity = {
    ...city,
    owner: breakawayId,
    unrestLevel: 0 as const,
    unrestTurns: 0,
  };

  const updatedMapTiles = { ...state.map.tiles };
  for (const coord of city.ownedTiles) {
    const key = `${coord.q},${coord.r}`;
    const tile = updatedMapTiles[key];
    if (tile) {
      updatedMapTiles[key] = {
        ...tile,
        owner: breakawayId,
      };
    }
  }

  // The new civilization meets only the living: an eliminated civ is never re-seeded a relationship
  // (#1001), and every living civ gets an entry for the newcomer (Diplomacy Lifecycle).
  const livingCivIds = Object.keys(state.civilizations).filter(id => !state.civilizations[id]!.isEliminated);
  const newCivIds = [...livingCivIds, breakawayId];
  const breakawayCiv: Civilization = {
    id: breakawayId,
    name: `${city.name} Secession`,
    color: '#c2410c',
    isHuman: false,
    civType: 'generic',
    cities: [cityId],
    units: transferredUnitIds,
    techState: {
      ...previousOwner.techState,
      completed: [...previousOwner.techState.completed],
      trackPriorities: { ...previousOwner.techState.trackPriorities },
    },
    gold: 0,
    visibility: { tiles: { ...previousOwner.visibility.tiles }, lastSeen: { ...(previousOwner.visibility.lastSeen ?? {}) } },
    score: 0,
    diplomacy: createDiplomacyState(newCivIds, breakawayId),
    breakaway: metadata,
  };

  breakawayCiv.diplomacy.relationships[previousOwner.id] = -80;

  const updatedCivilizations = { ...state.civilizations };
  for (const civId of livingCivIds) {
    const civ = updatedCivilizations[civId]!;
    if (civId === previousOwner.id || civ.diplomacy.relationships[breakawayId] !== undefined) continue;
    updatedCivilizations[civId] = {
      ...civ,
      diplomacy: { ...civ.diplomacy, relationships: { ...civ.diplomacy.relationships, [breakawayId]: 0 } },
    };
  }
  updatedCivilizations[previousOwner.id] = {
    ...previousOwner,
    cities: previousOwner.cities.filter(id => id !== cityId),
    units: previousOwner.units.filter(id => !transferredUnitIds.includes(id)),
    diplomacy: {
      ...previousOwner.diplomacy,
      relationships: {
        ...previousOwner.diplomacy.relationships,
        [breakawayId]: -80,
      },
    },
  };
  updatedCivilizations[breakawayId] = breakawayCiv;

  // Each unit takes the breakaway's own bonuses, so they are computed once its record exists.
  const withBreakaway: GameState = { ...state, civilizations: updatedCivilizations };
  const updatedUnits = { ...state.units };
  for (const unitId of transferredUnitIds) {
    updatedUnits[unitId] = withNewOwner(withBreakaway, updatedUnits[unitId]!, breakawayId);
  }

  const nextState: GameState = {
    ...state,
    units: updatedUnits,
    map: {
      ...state.map,
      tiles: updatedMapTiles,
    },
    cities: {
      ...state.cities,
      [cityId]: updatedCity,
    },
    civilizations: updatedCivilizations,
  };

  bus.emit('faction:breakaway-started', {
    cityId,
    oldOwner: previousOwner.id,
    breakawayId,
  });

  // The city's national projects leave the old owner with it, exactly as on a capture.
  const withLoyalSpiesOut = moveLoyalSpiesOffCity(
    removeNationalProjectsHostedBy(transferLegendaryWondersForCity(beginCityMaterialOccurrence(nextState, cityId), cityId, breakawayId), cityId),
    cityId,
    previousOwner.id,
  );
  const liveness = reconcileCivilizationLiveness(state, withLoyalSpiesOut);
  emitCivilizationLivenessTransitions(liveness, bus);
  return liveness.state;
}

export function processBreakawayTurn(state: GameState, bus: EventBus): GameState {
  let mutated = false;
  const civilizations = { ...state.civilizations };

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (!civ.breakaway || civ.breakaway.status !== 'secession') {
      continue;
    }
    if (state.turn < civ.breakaway.establishesOnTurn) {
      bus.emit('faction:critical-status', {
        cityId: civ.breakaway.originCityId,
        owner: civ.breakaway.originOwnerId,
        status: 'breakaway',
        breakawayId: civId,
      });
      continue;
    }

    civilizations[civId] = {
      ...civ,
      breakaway: {
        ...civ.breakaway,
        status: 'established',
      },
    };
    bus.emit('faction:breakaway-established', {
      civId,
      originOwnerId: civ.breakaway.originOwnerId,
    });
    mutated = true;
  }

  if (!mutated) {
    return state;
  }

  return {
    ...state,
    civilizations,
  };
}

export function tryReabsorbBreakaway(
  stateBefore: GameState,
  ownerId: string,
  breakawayId: string,
  bus?: EventBus,
): GameState {
  const owner = stateBefore.civilizations[ownerId];
  const breakaway = stateBefore.civilizations[breakawayId];
  if (!owner || !breakaway?.breakaway) {
    throw new Error('Breakaway civilization not found');
  }
  if (breakaway.breakaway.originOwnerId !== ownerId) {
    throw new Error('Only the origin owner can reabsorb this breakaway');
  }

  const relationship = owner.diplomacy.relationships[breakawayId] ?? 0;
  if (relationship < REABSORB_RELATIONSHIP_MINIMUM) {
    throw new Error('Relationship is too low to reabsorb this breakaway');
  }
  if (owner.gold < REABSORB_GOLD_COST) {
    throw new Error('Gold is too low to reabsorb this breakaway');
  }

  if (!Object.values(stateBefore.cities).some(city => city.owner === breakawayId)) {
    throw new Error('Breakaway city not found');
  }
  // #1506 MR09: each city leaves the breakaway's control, so its material commitment is released against
  // the breakaway's ledger first; the origin owner funds the inherited work from its own ledger below.
  let state = stateBefore;
  for (const city of Object.values(stateBefore.cities)) {
    if (city.owner === breakawayId) state = releaseCityMaterialCommitment(state, city.id);
  }
  const transferredCities = Object.values(state.cities)
    .filter(city => city.owner === breakawayId);
  const transferredCityIds = transferredCities.map(city => city.id);

  const updatedCivilizations = { ...state.civilizations };
  const transferredUnitIds = Object.values(state.units)
    .filter(unit => unit.owner === breakawayId)
    .map(unit => unit.id);
  updatedCivilizations[ownerId] = {
    ...owner,
    gold: owner.gold - REABSORB_GOLD_COST,
    cities: [...owner.cities, ...transferredCityIds.filter(cityId => !owner.cities.includes(cityId))],
    units: [...owner.units, ...transferredUnitIds.filter(unitId => !owner.units.includes(unitId))],
  };
  // The breakaway keeps its record until the teardown below has scrubbed it from everyone else.
  updatedCivilizations[breakawayId] = { ...breakaway, cities: [], units: [] };

  const updatedUnits = { ...state.units };
  for (const unitId of transferredUnitIds) {
    updatedUnits[unitId] = withNewOwner(state, updatedUnits[unitId]!, ownerId);
  }

  const updatedMapTiles = { ...state.map.tiles };
  for (const [key, tile] of Object.entries(updatedMapTiles)) {
    if (tile.owner === breakawayId) updatedMapTiles[key] = { ...tile, owner: ownerId };
  }

  const nextState: GameState = {
    ...state,
    units: updatedUnits,
    map: {
      ...state.map,
      tiles: updatedMapTiles,
    },
    cities: {
      ...state.cities,
      ...Object.fromEntries(transferredCities.map(city => [city.id, {
        ...city,
        owner: ownerId,
        unrestLevel: 0,
        unrestTurns: 0,
      }])),
    },
    civilizations: updatedCivilizations,
  };
  // Removing a civilization must scrub it from every other civ's relationships, wars, treaties,
  // vassalage, embargoes, leagues, pending requests, espionage and AI plans in the same operation
  // (Diplomacy Lifecycle). That is exactly the elimination teardown; the breakaway now holds
  // nothing, so it removes nothing else. Its record is then dropped, as reabsorption always did,
  // and no elimination is announced: a reabsorption is not a defeat.
  const funded = transferredCityIds.reduce((acc, id) => beginCityMaterialOccurrence(acc, id), nextState);
  const tornDown = eliminateCivilization(funded, breakawayId, ownerId).state;
  const { [breakawayId]: _reabsorbed, ...remainingCivilizations } = tornDown.civilizations;
  const withoutBreakaway: GameState = { ...tornDown, civilizations: remainingCivilizations };
  const liveness = reconcileCivilizationLiveness(state, withoutBreakaway);
  if (bus) emitCivilizationLivenessTransitions(liveness, bus);
  return liveness.state;
}

export function reconquerBreakawayCity(
  state: GameState,
  ownerId: string,
  breakawayId: string,
  cityId: string,
): GameState {
  const owner = state.civilizations[ownerId];
  const breakaway = state.civilizations[breakawayId];
  const city = state.cities[cityId];
  if (!owner || !breakaway?.breakaway || !city) {
    throw new Error('Cannot reconquer missing breakaway state');
  }

  const updatedCity = {
    ...city,
    owner: ownerId,
    unrestLevel: 1 as const,
    unrestTurns: 0,
  };

  const updatedMapTiles = { ...state.map.tiles };
  for (const coord of city.ownedTiles) {
    const key = `${coord.q},${coord.r}`;
    const tile = updatedMapTiles[key];
    if (tile) {
      updatedMapTiles[key] = {
        ...tile,
        owner: ownerId,
      };
    }
  }

  return {
    ...state,
    map: {
      ...state.map,
      tiles: updatedMapTiles,
    },
    cities: {
      ...state.cities,
      [cityId]: updatedCity,
    },
    civilizations: {
      ...state.civilizations,
      [ownerId]: {
        ...owner,
        cities: owner.cities.includes(cityId) ? owner.cities : [...owner.cities, cityId],
      },
      [breakawayId]: {
        ...breakaway,
        cities: breakaway.cities.filter(id => id !== cityId),
      },
    },
  };
}
