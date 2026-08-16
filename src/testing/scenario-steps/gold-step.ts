import type { GameState } from '@/core/types';
import { ScenarioError, type GoldStep } from '@/testing/scenario-types';

export function applyGoldStep(state: GameState, step: GoldStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in gold step`);
  return {
    ...state,
    civilizations: { ...state.civilizations, [step.civId]: { ...civ, gold: civ.gold + step.amount } },
  };
}
