import type { GameState } from '@/core/types';
import { getTechById } from '@/systems/tech-system';
import { ScenarioError, type TechStep } from '@/testing/scenario-types';

export function applyTechStep(state: GameState, step: TechStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in tech step`);

  for (const techId of step.techIds) {
    if (!getTechById(techId)) throw new ScenarioError(`Unknown tech id "${techId}" in tech step`);
  }

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [step.civId]: {
        ...civ,
        techState: {
          ...civ.techState,
          completed: [...new Set([...civ.techState.completed, ...step.techIds])],
        },
      },
    },
  };
}
