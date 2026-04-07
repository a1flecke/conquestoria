import type { GameState } from '@/core/types';
import { reconquerBreakawayCity } from '@/systems/breakaway-system';

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
