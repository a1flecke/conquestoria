import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { processResearch } from '@/systems/tech-system';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { applyResearchCompletionConsequences } from '@/systems/tech-completion-system';
import type { CivTurn, CivIncome } from './types';

/**
 * Research for the turn: output from the authoritative city science, progress, and the consequences of a finished tech.
 */
export function runCivResearch(state: GameState, turn: CivTurn, income: CivIncome, bus: EventBus): GameState {
  let newState = state;
  const { civId, civ } = turn;
  const { authoritativeCityScience } = income;

  const researchOutput = calculateCivResearchOutput(newState, civId, { authoritativeCityScience });
  const researchResult = processResearch(civ.techState, researchOutput.finalScience);
  newState.civilizations[civId].techState = researchResult.state;
  if (researchResult.completedTech) {
    const techId = researchResult.completedTech;
    bus.emit('tech:completed', {
      civId,
      techId,
      carriedProgress: researchResult.carriedProgress,
      carriedIntoTechId: researchResult.carriedProgress > 0 ? researchResult.state.currentResearch : null,
    });
    newState = applyResearchCompletionConsequences(newState, civId, techId, bus);
  }
  return newState;
}
