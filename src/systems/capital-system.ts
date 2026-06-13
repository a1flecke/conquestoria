import type { City, GameState } from '@/core/types';

export function getCapitalCityId(state: GameState, civilizationId: string): string | null {
  const civilization = state.civilizations[civilizationId];
  // capital = cities[0] by convention; callers share this validation helper.
  const [capitalId] = civilization?.cities ?? [];
  if (!capitalId) return null;

  const capital = state.cities[capitalId];
  return capital?.owner === civilizationId ? capitalId : null;
}

export function getCapitalCity(state: GameState, civilizationId: string): City | null {
  const capitalId = getCapitalCityId(state, civilizationId);
  return capitalId ? state.cities[capitalId] ?? null : null;
}
