import type { City, GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { recalculateTerritory } from '@/systems/city-territory-system';
import { initializeLegendaryWonderProjectsForCity } from '@/systems/legendary-wonder-system';
import { hexKey } from '@/systems/hex-utils';
import { ScenarioError, type CityStep } from '@/testing/scenario-types';

export function applyCityStep(state: GameState, step: CityStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in city step`);

  const key = hexKey(step.position);
  if (!state.map.tiles[key]) throw new ScenarioError(`Invalid coordinate ${key} in city step`);

  if (!step.unsafe) {
    const existingCity = Object.values(state.cities).find(c => hexKey(c.position) === key);
    if (existingCity) {
      throw new ScenarioError(`Tile ${key} already has city "${existingCity.id}" (pass unsafe: true to override)`);
    }
  }

  const civDef = resolveCivDefinition(state, civ.civType);
  const city: City = {
    ...foundCity(step.civId, step.position, state.map, state.idCounters, {
      civType: civ.civType,
      namingPool: civDef?.cityNames,
      civName: civDef?.name ?? civ.name,
      usedNames: collectUsedCityNames(state),
      completedTechs: civ.techState.completed,
    }),
    ...step.overrides,
  };

  let nextState: GameState = {
    ...state,
    cities: { ...state.cities, [city.id]: city },
    civilizations: {
      ...state.civilizations,
      [step.civId]: { ...civ, cities: [...civ.cities, city.id] },
    },
  };
  nextState = initializeLegendaryWonderProjectsForCity(nextState, step.civId, city.id);
  nextState = recalculateTerritory(nextState, { reason: 'founding', preserveForeignHolders: true }).state;
  return nextState;
}
