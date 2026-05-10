import type { GameState } from '@/core/types';

export function checkDominationVictory(state: GameState): string | null {
  const entries = Object.entries(state.civilizations);
  if (entries.length < 2) return null;

  const withCities = entries.filter(([, civ]) => civ.cities.length > 0);
  if (withCities.length === 1) return withCities[0][0];
  return null;
}
