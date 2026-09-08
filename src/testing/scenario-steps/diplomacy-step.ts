import type { GameState } from '@/core/types';
import { declareMajorWar, makeMajorPeace, signTreaty } from '@/systems/diplomacy-system';
import { ScenarioError, type DiplomacyStep } from '@/testing/scenario-types';

const ALLIANCE_TURNS_REMAINING = 999; // scenarios don't tick turns; effectively permanent

export function applyDiplomacyStep(state: GameState, step: DiplomacyStep): GameState {
  const civA = state.civilizations[step.civA];
  const civB = state.civilizations[step.civB];
  if (!civA) throw new ScenarioError(`Unknown civId "${step.civA}" in diplomacy step`);
  if (!civB) throw new ScenarioError(`Unknown civId "${step.civB}" in diplomacy step`);

  // Bilateral transitions by construction (#995) — never hand-roll both sides.
  if (step.status === 'war') {
    return declareMajorWar(state, step.civA, step.civB);
  }

  if (step.status === 'peace') {
    return makeMajorPeace(state, step.civA, step.civB);
  }

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [step.civA]: {
        ...civA,
        diplomacy: signTreaty(civA.diplomacy, step.civA, step.civB, 'alliance', ALLIANCE_TURNS_REMAINING, state.turn),
      },
      [step.civB]: {
        ...civB,
        diplomacy: signTreaty(civB.diplomacy, step.civB, step.civA, 'alliance', ALLIANCE_TURNS_REMAINING, state.turn),
      },
    },
  };
}
