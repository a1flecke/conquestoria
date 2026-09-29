/**
 * Treachery (betrayal reputation): per-civ score raised by breaking
 * agreements and its broadcast/decay. Depends only on relationship writes.
 */
import type { DiplomacyState } from '@/core/types';
import { modifyRelationship } from '@/systems/diplomacy-state';

const TREACHERY_AMOUNTS: Record<string, number> = {
  non_aggression_pact: 20,
  trade_agreement: 15,
  alliance: 30,
  vassalage: 40,
  vassalage_independence: 20,
  leave_embargo: 5,
  leave_league: 10,
  // #988: conquering far past a declared war goal. Bounded and applied at most
  // once per war -- see war-goal-system.ts's overreachPenaltyApplied guard.
  war_goal_overreach: 10,
};

export function applyTreachery(
  state: DiplomacyState,
  action: string,
): DiplomacyState {
  const amount = TREACHERY_AMOUNTS[action] ?? 0;
  return {
    ...state,
    treacheryScore: Math.min(100, state.treacheryScore + amount),
  };
}

export function broadcastTreacheryPenalty(
  allDipStates: Record<string, DiplomacyState>,
  betrayerCivId: string,
): Record<string, DiplomacyState> {
  const betrayer = allDipStates[betrayerCivId];
  if (!betrayer) return allDipStates;

  const penalty = -Math.floor(betrayer.treacheryScore / 4);
  const result = { ...allDipStates };

  for (const [civId, dip] of Object.entries(result)) {
    if (civId === betrayerCivId) continue;
    if (dip.relationships[betrayerCivId] !== undefined) {
      result[civId] = modifyRelationship(dip, betrayerCivId, penalty);
    }
  }

  return result;
}

export function decayTreachery(state: DiplomacyState, turn: number): DiplomacyState {
  if (turn % 5 !== 0 || state.treacheryScore <= 0) return state;
  return {
    ...state,
    treacheryScore: Math.max(0, state.treacheryScore - 1),
  };
}
