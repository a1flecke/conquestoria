import type { BreakawayMetadata, Civilization, GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';

const BREAKAWAY_ESTABLISHMENT_TURNS = 50;
export const REABSORB_RELATIONSHIP_MINIMUM = 50;
export const REABSORB_GOLD_COST = 200;

export function isBreakawayCiv(civ: Civilization): boolean {
  return civ.breakaway !== undefined;
}

export function createBreakawayFromCity(
  state: GameState,
  cityId: string,
  bus: EventBus,
): GameState {
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

  const transferredUnitIds = previousOwner.units.filter(unitId => state.units[unitId]?.position.q === city.position.q
    && state.units[unitId]?.position.r === city.position.r);

  const updatedUnits = { ...state.units };
  for (const unitId of transferredUnitIds) {
    updatedUnits[unitId] = {
      ...updatedUnits[unitId],
      owner: breakawayId,
    };
  }

  const updatedCity = {
    ...city,
    owner: breakawayId,
    unrestLevel: 0 as const,
    unrestTurns: 0,
  };

  const newCivIds = [...Object.keys(state.civilizations), breakawayId];
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
    visibility: { tiles: { ...previousOwner.visibility.tiles } },
    score: 0,
    diplomacy: createDiplomacyState(newCivIds, breakawayId),
    breakaway: metadata,
  };

  breakawayCiv.diplomacy.relationships[previousOwner.id] = -80;

  const updatedCivilizations = { ...state.civilizations };
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

  const nextState: GameState = {
    ...state,
    units: updatedUnits,
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

  return nextState;
}

export function processBreakawayTurn(state: GameState, bus: EventBus): GameState {
  let mutated = false;
  const civilizations = { ...state.civilizations };

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (!civ.breakaway || civ.breakaway.status !== 'secession') {
      continue;
    }
    if (state.turn < civ.breakaway.establishesOnTurn) {
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
  state: GameState,
  ownerId: string,
  breakawayId: string,
): GameState {
  const owner = state.civilizations[ownerId];
  const breakaway = state.civilizations[breakawayId];
  if (!owner || !breakaway?.breakaway) {
    throw new Error('Breakaway civilization not found');
  }

  const relationship = owner.diplomacy.relationships[breakawayId] ?? 0;
  if (relationship < REABSORB_RELATIONSHIP_MINIMUM) {
    throw new Error('Relationship is too low to reabsorb this breakaway');
  }
  if (owner.gold < REABSORB_GOLD_COST) {
    throw new Error('Gold is too low to reabsorb this breakaway');
  }

  const cityId = breakaway.breakaway.originCityId;
  const city = state.cities[cityId];
  if (!city) {
    throw new Error('Breakaway city not found');
  }

  const updatedCivilizations = { ...state.civilizations };
  delete updatedCivilizations[breakawayId];
  updatedCivilizations[ownerId] = {
    ...owner,
    gold: owner.gold - REABSORB_GOLD_COST,
    cities: owner.cities.includes(cityId) ? owner.cities : [...owner.cities, cityId],
    diplomacy: {
      ...owner.diplomacy,
      relationships: {
        ...owner.diplomacy.relationships,
      },
    },
  };
  delete updatedCivilizations[ownerId].diplomacy.relationships[breakawayId];

  for (const civ of Object.values(updatedCivilizations)) {
    if (civ.id === ownerId) {
      continue;
    }
    if (civ.diplomacy.relationships[breakawayId] !== undefined) {
      civ.diplomacy = {
        ...civ.diplomacy,
        relationships: { ...civ.diplomacy.relationships },
      };
      delete civ.diplomacy.relationships[breakawayId];
    }
  }

  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: {
        ...city,
        owner: ownerId,
        unrestLevel: 0,
        unrestTurns: 0,
      },
    },
    civilizations: updatedCivilizations,
  };
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

  return {
    ...state,
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
