import type { GameState } from '@/core/types';

export function isMinorCivAtWar(state: GameState, majorCivId: string, minorCivId: string): boolean {
  const majorCiv = state.civilizations[majorCivId];
  const minorCiv = state.minorCivs[minorCivId];
  return Boolean(
    majorCiv?.diplomacy.atWarWith.includes(minorCivId)
    || minorCiv?.diplomacy.atWarWith.includes(majorCivId),
  );
}
