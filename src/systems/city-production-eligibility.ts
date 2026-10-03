import type { Building, GameState, TrainableUnitEntry } from '@/core/types';
import { getAvailableBuildings, getTrainableUnitsForCity, cityFollowsOwnFaith } from '@/systems/city-availability';
import { getReservedNationalProjectKeys } from '@/systems/national-project-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getArsenalStatus } from '@/systems/strategic-arsenal-system';
import { getCapitalCityId } from '@/systems/capital-system';

/**
 * What a city may put in its production queue right now (#1220), derived from state in one place.
 *
 * This is the list the city panel's Build tab shows and the list `enqueueCityProduction` validates against, so
 * "offered" and "accepted" cannot drift: the panel, the idle-city recommendation, the AI's idle-city fill and the
 * enqueue executor all ask this. It is the same tech / resource / coastal / faith / reserved-national-project /
 * arsenal / capital inputs every caller used to assemble by hand.
 *
 * Deliberately NOT in here: gates that depend on state which can change while an item waits in the queue (the
 * air-base slot an aircraft needs at completion, a unit-cap, treasury). Those are enforced at completion, with
 * `processCity`'s dequeue as the backstop; refusing them at enqueue time would withhold items the player may
 * legitimately line up behind a base that is still being built.
 */
export interface QueueableProduction {
  buildings: Building[];
  units: TrainableUnitEntry[];
}

export function getQueueableProductionForCity(state: GameState, cityId: string): QueueableProduction | null {
  const city = state.cities[cityId];
  const civ = city ? state.civilizations[city.owner] : undefined;
  if (!city || !civ || !state.map) return null;

  const completedTechs = civ.techState.completed ?? [];
  const resources = getCivAvailableResources(state, city.owner);
  return {
    buildings: getAvailableBuildings(
      city,
      completedTechs,
      state.map,
      resources,
      resolveCivilizationEra(completedTechs),
      getReservedNationalProjectKeys(state, city.owner),
      city.owner,
      getArsenalStatus(state, city.owner),
      getCapitalCityId(state, city.owner),
    ),
    units: getTrainableUnitsForCity(
      city,
      completedTechs,
      state.map,
      civ.civType,
      resources,
      cityFollowsOwnFaith(state, city),
    ),
  };
}
