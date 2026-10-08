import type { GameState } from '@/core/types';
import type { AdvisorType } from '@/core/types/council';
import type { CivTurn } from './types';

/**
 * Expires advisor disable timers, counts down the research penalty and the satellite surveillance targets.
 */
export function tickCivTimers(state: GameState, turn: CivTurn): void {
  const { civId, currentCivState } = turn;

  // Clear expired advisor disable timers after all start-of-turn effects are processed.
  if (currentCivState.advisorDisabledUntil) {
    const stillDisabled: Partial<Record<AdvisorType, number>> = {};
    for (const [advisor, untilTurn] of Object.entries(currentCivState.advisorDisabledUntil)) {
      if ((untilTurn as number) > state.turn) {
        stillDisabled[advisor as AdvisorType] = untilTurn as number;
      }
    }
    state.civilizations[civId].advisorDisabledUntil =
      Object.keys(stillDisabled).length > 0 ? stillDisabled : undefined;
  }

  if ((currentCivState.researchPenaltyTurns ?? 0) > 0) {
    state.civilizations[civId].researchPenaltyTurns = Math.max(0, (currentCivState.researchPenaltyTurns ?? 0) - 1);
    if ((state.civilizations[civId].researchPenaltyTurns ?? 0) === 0) {
      state.civilizations[civId].researchPenaltyMultiplier = 0;
    }
  }

  const updatedTargets: Record<string, number> = {};
  for (const [targetCivId, turnsRemaining] of Object.entries(currentCivState.satelliteSurveillanceTargets ?? {})) {
    const nextTurns = Math.max(0, turnsRemaining - 1);
    if (nextTurns > 0) {
      updatedTargets[targetCivId] = nextTurns;
    }
  }
  state.civilizations[civId].satelliteSurveillanceTargets =
    Object.keys(updatedTargets).length > 0 ? updatedTargets : undefined;
}
