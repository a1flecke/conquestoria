import type { GameState } from '@/core/types';

/**
 * Legacy hard-resource queue grace. Compatibility normalization: scrubs stale
 * grace data down to the units that still legitimately hold it.
 */

export function normalizeLegacyTechGrace(state: GameState): GameState {
  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    if (city.legacyTechGrace === undefined) return [cityId, city];
    const legacyTechGrace = Array.isArray(city.legacyTechGrace)
      ? city.legacyTechGrace.filter(item => item === 'cavalry' || item === 'knight')
      : [];
    if (legacyTechGrace.length > 0) return [cityId, { ...city, legacyTechGrace }];
    const { legacyTechGrace: _invalidGrace, ...withoutLegacyTechGrace } = city;
    return [cityId, withoutLegacyTechGrace];
  }));
  return { ...state, cities };
}
