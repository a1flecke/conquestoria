import type { City, GameState } from '@/core/types';

export function getOccupiedCityYieldMultiplier(city: City): 0.5 | 0.75 | 1 {
  const turnsRemaining = city.occupation?.turnsRemaining ?? 0;
  if (turnsRemaining >= 6) {
    return 0.5;
  }
  if (turnsRemaining >= 1) {
    return 0.75;
  }
  return 1;
}

export function tickOccupiedCities(state: GameState): GameState {
  let changed = false;
  const cities = Object.fromEntries(
    Object.entries(state.cities).map(([cityId, city]) => {
      if (!city.occupation) {
        return [cityId, city];
      }

      changed = true;
      const turnsRemaining = city.occupation.turnsRemaining - 1;
      if (turnsRemaining <= 0) {
        return [cityId, { ...city, occupation: undefined }];
      }

      return [cityId, {
        ...city,
        occupation: {
          ...city.occupation,
          turnsRemaining,
        },
      }];
    }),
  );

  return changed ? { ...state, cities } : state;
}
