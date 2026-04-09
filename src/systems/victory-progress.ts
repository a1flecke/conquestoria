import type { GameState } from '@/core/types';

export function getVictoryProgressSummary(state: GameState, civId: string): {
  toWin: { summary: string };
  domination: { visibleRivals: number };
} {
  const civ = state.civilizations[civId];
  const visibleRivals = Object.values(state.civilizations).filter(other => other.id !== civId).length;
  const cityCount = civ?.cities.length ?? 0;

  return {
    toWin: {
      summary: `${cityCount} cities under your banner`,
    },
    domination: {
      visibleRivals,
    },
  };
}
