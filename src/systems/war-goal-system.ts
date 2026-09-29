import type { EventBus } from '@/core/event-bus';
import type { GameState, WarGoal, WarGoalKind, WarGoalStatus } from '@/core/types';
import { isAtWar } from '@/systems/diplomacy-queries';
import { applyTreachery, broadcastTreacheryPenalty } from '@/systems/diplomacy-treachery';
import { recordGoalDeclared } from '@/systems/war-history-system';

export const WAR_GOAL_KINDS: readonly WarGoalKind[] = ['conquer_city', 'liberate_city', 'force_vassalage'];

export type WarGoalEligibility = { ok: true } | { ok: false; reason: string };

export function canDeclareWarGoal(
  state: GameState,
  civId: string,
  opponentCivId: string,
  kind: WarGoalKind,
  targetCityId?: string,
): WarGoalEligibility {
  const civ = state.civilizations[civId];
  const opponent = state.civilizations[opponentCivId];
  if (!civ || !opponent || civId === opponentCivId) {
    return { ok: false, reason: 'Both civilizations must exist.' };
  }
  if (!isAtWar(civ.diplomacy, opponentCivId) || !isAtWar(opponent.diplomacy, civId)) {
    return { ok: false, reason: 'You must be at war with this civilization.' };
  }
  if (kind === 'conquer_city' || kind === 'liberate_city') {
    if (!targetCityId) return { ok: false, reason: 'Choose a target city.' };
    const city = state.cities[targetCityId];
    if (!city || city.owner !== opponentCivId) {
      return { ok: false, reason: 'That city does not belong to this opponent.' };
    }
    return { ok: true };
  }
  // force_vassalage
  if (opponent.diplomacy.vassalage.overlord) {
    return { ok: false, reason: 'This civilization already has an overlord.' };
  }
  if (civ.diplomacy.vassalage.overlord) {
    return { ok: false, reason: 'A vassal cannot pursue its own war goals.' };
  }
  return { ok: true };
}

/**
 * Declares (or replaces) `civId`'s own war goal against `opponentCivId`.
 * Single-side write, like `declareWar`/`makePeace` -- each side's declared
 * purpose is independent. A no-op (returns `state` unchanged) when illegal;
 * callers that need player-facing rejection copy should call
 * {@link canDeclareWarGoal} first.
 */
export function declareWarGoal(
  state: GameState,
  civId: string,
  opponentCivId: string,
  kind: WarGoalKind,
  targetCityId: string | undefined,
  turn: number,
): GameState {
  if (!canDeclareWarGoal(state, civId, opponentCivId, kind, targetCityId).ok) return state;
  const civ = state.civilizations[civId];
  // #988: redeclaring a goal against an opponent this civ ALREADY holds a
  // goal against (escalating war aims mid-war is legitimate) carries the
  // existing overreach bookkeeping forward rather than resetting it -- a
  // fresh 0 here would let a player launder overreach by simply restating
  // "conquer the city I already took" right before making peace.
  const existingGoal = civ.diplomacy.warGoals?.[opponentCivId];
  const goal: WarGoal = {
    kind,
    opponentCivId,
    targetCityId: kind === 'force_vassalage' ? undefined : targetCityId,
    declaredTurn: turn,
    citiesCapturedFromOpponent: existingGoal?.citiesCapturedFromOpponent ?? 0,
    overreachPenaltyApplied: existingGoal?.overreachPenaltyApplied ?? false,
  };
  const next = {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        diplomacy: {
          ...civ.diplomacy,
          warGoals: { ...civ.diplomacy.warGoals, [opponentCivId]: goal },
        },
      },
    },
  };
  return recordGoalDeclared(next, civId, opponentCivId, kind, turn);
}

/** Pure, queryable status -- AI and UI both read this instead of inferring from military power. */
export function getWarGoalStatus(state: GameState, civId: string, opponentCivId: string): WarGoalStatus {
  const goal = state.civilizations[civId]?.diplomacy.warGoals?.[opponentCivId];
  if (!goal) return 'none';

  let satisfied: boolean;
  if (goal.kind === 'force_vassalage') {
    satisfied = state.civilizations[opponentCivId]?.diplomacy.vassalage.overlord === civId;
  } else {
    const city = goal.targetCityId ? state.cities[goal.targetCityId] : undefined;
    if (!city) return 'abandoned';
    satisfied = goal.kind === 'conquer_city' ? city.owner === civId : city.owner !== opponentCivId;
  }
  if (!satisfied) return 'active';

  const overreachThreshold = goal.kind === 'force_vassalage' ? 0 : 1;
  return goal.citiesCapturedFromOpponent > overreachThreshold ? 'exceeded' : 'satisfied';
}

/**
 * Viewer-safe "kind — status" war-goal label (e.g. "Conquer Rome — Achieved"),
 * shared by every UI surface that shows a civ's own declared goal
 * (`diplomacy-panel.ts`, `war-conference-panel.ts`). City names come from the
 * viewer's own declared goal (they picked the city, so it is already known to
 * them) -- this never reads a foreign civ's undiscovered state.
 */
export function describeWarGoalLabel(state: GameState, civId: string, opponentCivId: string): string | null {
  const goal = state.civilizations[civId]?.diplomacy.warGoals?.[opponentCivId];
  if (!goal) return null;
  const status = getWarGoalStatus(state, civId, opponentCivId);
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const kindLabel = goal.kind === 'force_vassalage'
    ? 'Force Vassalage'
    : `${goal.kind === 'conquer_city' ? 'Conquer' : 'Liberate'} ${goal.targetCityId ? (state.cities[goal.targetCityId]?.name ?? 'a city') : 'a city'}`;
  return `${kindLabel} — ${statusLabel}`;
}

/**
 * Bookkeeping hook: call whenever `capturingCivId` takes a city that belonged
 * to `previousOwnerCivId`, regardless of disposition. A no-op unless
 * `capturingCivId` has an active goal against that exact opponent -- this is
 * a per-war counter, not a history ledger (#991 owns actual history).
 */
export function recordWarGoalCityCapture(
  state: GameState,
  capturingCivId: string,
  previousOwnerCivId: string,
): GameState {
  const civ = state.civilizations[capturingCivId];
  const goal = civ?.diplomacy.warGoals?.[previousOwnerCivId];
  if (!goal) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [capturingCivId]: {
        ...civ,
        diplomacy: {
          ...civ.diplomacy,
          warGoals: {
            ...civ.diplomacy.warGoals,
            [previousOwnerCivId]: { ...goal, citiesCapturedFromOpponent: goal.citiesCapturedFromOpponent + 1 },
          },
        },
      },
    },
  };
}

/**
 * A civ that conquers far past its declared goal incurs a bounded,
 * legible, one-time reputation cost -- reusing the existing
 * treachery/relationship machinery rather than a new morality meter (#988).
 */
export function applyWarGoalOverreachIfNeeded(
  state: GameState,
  civId: string,
  opponentCivId: string,
  turn: number,
  bus?: EventBus,
): GameState {
  const civ = state.civilizations[civId];
  const goal = civ?.diplomacy.warGoals?.[opponentCivId];
  if (!goal || goal.overreachPenaltyApplied) return state;
  if (getWarGoalStatus(state, civId, opponentCivId) !== 'exceeded') return state;

  const withTreachery = applyTreachery(civ.diplomacy, 'war_goal_overreach');
  let next: GameState = {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        diplomacy: {
          ...withTreachery,
          warGoals: { ...withTreachery.warGoals, [opponentCivId]: { ...goal, overreachPenaltyApplied: true } },
        },
      },
    },
  };
  const allDipStates = Object.fromEntries(
    Object.entries(next.civilizations).map(([id, c]) => [id, c.diplomacy]),
  );
  const broadcast = broadcastTreacheryPenalty(allDipStates, civId);
  next = {
    ...next,
    civilizations: Object.fromEntries(
      Object.entries(next.civilizations).map(([id, c]) => [id, { ...c, diplomacy: broadcast[id] ?? c.diplomacy }]),
    ),
  };
  bus?.emit('diplomacy:war-goal-exceeded', { civId, opponentCivId, turn });
  return next;
}
