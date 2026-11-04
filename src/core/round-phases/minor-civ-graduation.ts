import { isCityStateGraduationEnabled } from '@/systems/city-state-graduation-flag';
import { graduateMinorCiv } from '@/systems/minor-civ-graduation-conversion';
import { planMinorCivGraduations } from '@/systems/minor-civ-graduation';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * City-state graduation (#497). Runs right after `minor-civs`: the city-state has finished this round's economy, quests
 * and league turn, and `per-civ` has already run, so the new civilization is first visited next round (never twice in
 * one). At most one city-state graduates per round, and none unless the campaign opted in.
 *
 * The decision is `planMinorCivGraduations` (pure, seeded); the change is `graduateMinorCiv` (atomic, re-checks the
 * plan's preconditions). Events are announced from the returned transition, never used to cause the change.
 */
const runMinorCivGraduation: RoundPhase['run'] = (state, context: RoundPhaseContext) => {
  if (!isCityStateGraduationEnabled(state)) return state;
  const plan = planMinorCivGraduations(state);
  if (plan.status !== 'evaluated' || plan.selectedMinorCivId === null) return state;

  const result = graduateMinorCiv(state, plan.selectedMinorCivId);
  if (!result.ok) return state;

  const { transition } = result;
  emitMinorCivQuestTransitions(context.bus, transition.allianceTransitions, result.state);
  context.bus.emit('minor-civ:graduated', {
    minorCivId: transition.minorCivId,
    civId: transition.civId,
    definitionId: transition.definitionId,
    turn: transition.turn,
  });
  return result.state;
};

export const minorCivGraduationPhase: RoundPhase = { id: 'minor-civ-graduation', run: runMinorCivGraduation };
