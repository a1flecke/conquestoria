import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { foundCity } from '@/systems/city-system';
import {
  buildTerritoryTileFlippedEvents,
  canFoundCityAt,
  recalculateTerritory,
} from '@/systems/city-territory-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { initializeLegendaryWonderProjectsForCity } from '@/systems/legendary-wonder-system';

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
  if (!canFoundCityAt(state, settler.position)) {
    throw new Error('City cannot be founded here');
  }

  let nextState = structuredClone(state);
  const nextCivilization = nextState.civilizations[settler.owner];
  const definition = resolveCivDefinition(nextState, nextCivilization.civType);
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
    },
  );
  const existingOwnedCityIds = nextCivilization.cities.filter(cityId =>
    nextState.cities[cityId]?.owner === settler.owner);
  const recoveredFromNearDefeat = nextCivilization.nearDefeat === true
    && existingOwnedCityIds.length >= 1;
  const { [settlerId]: _removed, ...remainingUnits } = nextState.units;
  nextState = {
    ...nextState,
    units: remainingUnits,
    cities: {
      ...nextState.cities,
      [city.id]: city,
    },
    civilizations: {
      ...nextState.civilizations,
      [settler.owner]: {
        ...nextCivilization,
        units: nextCivilization.units.filter(unitId => unitId !== settlerId),
        cities: [...existingOwnedCityIds, city.id],
        nearDefeat: recoveredFromNearDefeat
          ? false
          : nextCivilization.nearDefeat,
      },
    },
  };
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
  if (recoveredFromNearDefeat) {
    bus.emit('civ:recovered-from-near-defeat', { civId: settler.owner });
  }

  return { state: nextState, cityId: city.id };
}
