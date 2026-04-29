import type { City, GameState, LegendaryWonderProject } from '@/core/types';
import { reconquerBreakawayCity } from '@/systems/breakaway-system';
import { BUILDINGS } from '@/systems/city-system';
import { modifyRelationship } from '@/systems/diplomacy-system';
import { hexKey } from '@/systems/hex-utils';

export type MajorCityCaptureDisposition = 'occupy' | 'raze';

export function computeRazeGold(city: City): number {
  const salvage = city.buildings.reduce((sum, buildingId) => {
    const building = BUILDINGS[buildingId];
    return sum + Math.floor((building?.productionCost ?? 0) / 2);
  }, 0);
  return 10 + salvage;
}

function buildLegendaryWonderProjectKey(project: LegendaryWonderProject): string {
  return `${project.wonderId}:${project.ownerId}:${project.cityId}`;
}

function transferLegendaryWonderProjectsForCity(
  projects: GameState['legendaryWonderProjects'],
  cityId: string,
  newOwnerId: string,
): GameState['legendaryWonderProjects'] {
  const entries = Object.entries(projects ?? {});
  if (entries.length === 0) {
    return projects;
  }

  const updated = Object.fromEntries(entries.map(([projectId, project]) => {
    if (project.cityId !== cityId) {
      return [projectId, project];
    }

    const movedProject = { ...project, ownerId: newOwnerId };
    return [buildLegendaryWonderProjectKey(movedProject), movedProject];
  }));

  return updated;
}

function removeLegendaryWonderProjectsForCity(
  projects: GameState['legendaryWonderProjects'],
  cityId: string,
): GameState['legendaryWonderProjects'] {
  const entries = Object.entries(projects ?? {});
  if (entries.length === 0) {
    return projects;
  }

  return Object.fromEntries(entries.filter(([, project]) => project.cityId !== cityId));
}

export function resolveMajorCityCapture(
  state: GameState,
  cityId: string,
  newOwnerId: string,
  disposition: MajorCityCaptureDisposition,
  turn: number,
): {
  state: GameState;
  outcome: 'occupied' | 'razed';
  goldAwarded: number;
} {
  const city = state.cities[cityId];
  if (!city) {
    return { state, outcome: 'razed', goldAwarded: 0 };
  }

  const previousOwnerId = city.owner;
  const previousOwner = state.civilizations[previousOwnerId];
  const capturingCiv = state.civilizations[newOwnerId];
  if (!capturingCiv || previousOwnerId === newOwnerId) {
    return { state, outcome: 'razed', goldAwarded: 0 };
  }

  const forcedDisposition: MajorCityCaptureDisposition = disposition;

  if (forcedDisposition === 'occupy' && previousOwner?.breakaway?.originOwnerId === newOwnerId) {
    const reconquered = reconquerBreakawayCity(state, newOwnerId, previousOwnerId, cityId);
    return {
      state: {
        ...reconquered,
        legendaryWonderProjects: transferLegendaryWonderProjectsForCity(
          reconquered.legendaryWonderProjects,
          cityId,
          newOwnerId,
        ),
      },
      outcome: 'occupied',
      goldAwarded: 0,
    };
  }

  if (forcedDisposition === 'occupy') {
    const occupiedCity: City = {
      ...city,
      owner: newOwnerId,
      population: Math.max(1, Math.floor(city.population / 2)),
      conquestTurn: turn,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
      occupation: {
        originalOwnerId: previousOwnerId,
        turnsRemaining: 10,
      },
    };

    const nextTiles = { ...state.map.tiles };
    for (const coord of occupiedCity.ownedTiles) {
      const key = hexKey(coord);
      if (nextTiles[key]) {
        nextTiles[key] = { ...nextTiles[key], owner: newOwnerId };
      }
    }

    return {
      state: {
        ...state,
        map: {
          ...state.map,
          tiles: nextTiles,
        },
        cities: {
          ...state.cities,
          [cityId]: occupiedCity,
        },
        civilizations: {
          ...state.civilizations,
          ...(previousOwner ? {
            [previousOwnerId]: {
              ...previousOwner,
              cities: previousOwner.cities.filter(id => id !== cityId),
            },
          } : {}),
          [newOwnerId]: {
            ...capturingCiv,
            cities: capturingCiv.cities.includes(cityId) ? capturingCiv.cities : [...capturingCiv.cities, cityId],
          },
        },
        legendaryWonderProjects: transferLegendaryWonderProjectsForCity(
          state.legendaryWonderProjects,
          cityId,
          newOwnerId,
        ),
      },
      outcome: 'occupied',
      goldAwarded: 0,
    };
  }

  const goldAwarded = computeRazeGold(city);
  const nextTiles = { ...state.map.tiles };
  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    if (nextTiles[key]) {
      nextTiles[key] = { ...nextTiles[key], owner: null };
    }
  }

  const nextCivilizations = {
    ...state.civilizations,
    ...(previousOwner ? {
      [previousOwnerId]: {
        ...previousOwner,
        cities: previousOwner.cities.filter(id => id !== cityId),
        diplomacy: modifyRelationship(previousOwner.diplomacy, newOwnerId, -40),
      },
    } : {}),
    [newOwnerId]: {
      ...capturingCiv,
      gold: capturingCiv.gold + goldAwarded,
    },
  };

  const nextCities = { ...state.cities };
  delete nextCities[cityId];

  return {
    state: {
      ...state,
      map: {
        ...state.map,
        tiles: nextTiles,
      },
      cities: nextCities,
      civilizations: nextCivilizations,
      legendaryWonderProjects: removeLegendaryWonderProjectsForCity(state.legendaryWonderProjects, cityId),
    },
    outcome: 'razed',
    goldAwarded,
  };
}

export function transferCapturedCityOwnership(
  state: GameState,
  cityId: string,
  newOwnerId: string,
  turn: number,
): GameState {
  const city = state.cities[cityId];
  if (!city) {
    return state;
  }

  const previousOwnerId = city.owner;
  const previousOwner = state.civilizations[previousOwnerId];
  const capturingCiv = state.civilizations[newOwnerId];
  if (!capturingCiv || previousOwnerId === newOwnerId) {
    return state;
  }

  if (previousOwner?.breakaway?.originOwnerId === newOwnerId) {
    return reconquerBreakawayCity(state, newOwnerId, previousOwnerId, cityId);
  }

  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: {
        ...city,
        owner: newOwnerId,
        conquestTurn: turn,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      ...state.civilizations,
      ...(previousOwner ? {
        [previousOwnerId]: {
          ...previousOwner,
          cities: previousOwner.cities.filter(id => id !== cityId),
        },
      } : {}),
      [newOwnerId]: {
        ...capturingCiv,
        cities: capturingCiv.cities.includes(cityId) ? capturingCiv.cities : [...capturingCiv.cities, cityId],
      },
    },
  };
}
