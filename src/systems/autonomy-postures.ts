import type { AutonomyPostureId, NetworkPlan } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { getAutonomyCapacity, getAutonomyLoad } from './autonomy-capacity';

export interface AutonomySurgeResult {
  state: GameState;
  validation: { ok: true } | { ok: false; reason: 'missing-plan' | 'surge-unavailable' | 'ordinary-load-exceeds-capacity' };
}

const SURGE_RULES: Readonly<Record<AutonomyPostureId, { allowance: number; recoveryRounds: number }>> = {
  safeguarded: { allowance: 1, recoveryRounds: 2 },
  integrated: { allowance: 1, recoveryRounds: 2 },
  accelerated: { allowance: 3, recoveryRounds: 3 },
};

export function getAutonomySurgeRules(posture: AutonomyPostureId) {
  return SURGE_RULES[posture];
}

export function requestAutonomyPosture(
  state: GameState,
  civId: string,
  posture: AutonomyPostureId,
): GameState {
  const autonomy = state.autonomyByCiv?.[civId];
  if (!autonomy || autonomy.posture === posture || autonomy.pendingPosture
    || (autonomy.postureChangedTurn !== null && autonomy.postureChangedTurn !== undefined
      && state.turn < autonomy.postureChangedTurn + 3)) return state;
  return {
    ...state,
    autonomyByCiv: {
      ...state.autonomyByCiv,
      [civId]: { ...autonomy, pendingPosture: { id: posture, appliesOnTurn: state.turn + 1 } },
    },
  };
}

export function applyPendingAutonomyPosture(state: GameState, civId: string): GameState {
  const autonomy = state.autonomyByCiv?.[civId];
  if (!autonomy?.pendingPosture || autonomy.pendingPosture.appliesOnTurn > state.turn) return state;
  return {
    ...state,
    autonomyByCiv: {
      ...state.autonomyByCiv,
      [civId]: { ...autonomy, posture: autonomy.pendingPosture.id, pendingPosture: null, postureChangedTurn: state.turn },
    },
  };
}

export function beginAutonomySurge(state: GameState, civId: string, planId: string): AutonomySurgeResult {
  const autonomy = state.autonomyByCiv?.[civId];
  const plan = autonomy?.plans[planId];
  if (!autonomy || !plan || plan.status !== 'active') return { state, validation: { ok: false, reason: 'missing-plan' } };
  const capacity = getAutonomyCapacity(state, civId).unrestricted;
  // Surge may temporarily exceed Capacity; eligibility is based on ordinary Load only.
  const ordinaryLoad = getAutonomyLoad({ ...state, turn: state.turn + 1 }, civId).unrestricted;
  if (ordinaryLoad > capacity) {
    return { state, validation: { ok: false, reason: 'ordinary-load-exceeds-capacity' } };
  }
  const surgedThisTurn = Object.values(autonomy.plans)
    .filter(candidate => candidate.surgeResolutionTurn === state.turn);
  const rules = getAutonomySurgeRules(autonomy.posture);
  const inPriorRecovery = autonomy.surgeRecoveryUntilTurn !== null && autonomy.surgeRecoveryUntilTurn > state.turn;
  const inCooldown = autonomy.surgeCooldownUntilTurn !== null && autonomy.surgeCooldownUntilTurn > state.turn;
  if (plan.surgeResolutionTurn === state.turn || inCooldown || (inPriorRecovery && surgedThisTurn.length === 0)
    || surgedThisTurn.length >= rules.allowance) {
    return { state, validation: { ok: false, reason: 'surge-unavailable' } };
  }
  const surgedPlan: NetworkPlan = { ...plan, surgeResolutionTurn: state.turn };
  return {
    state: {
      ...state,
      autonomyByCiv: {
        ...state.autonomyByCiv,
        [civId]: {
          ...autonomy,
          plans: { ...autonomy.plans, [planId]: surgedPlan },
          surgeRecoveryUntilTurn: state.turn + rules.recoveryRounds,
        },
      },
    },
    validation: { ok: true },
  };
}

/** Applies state transitions at each owner's boundary; expired Surge flags need no mutation. */
export function advanceAutonomySurge(state: GameState, civId: string): GameState {
  const autonomy = state.autonomyByCiv?.[civId];
  if (!autonomy || autonomy.surgeRecoveryUntilTurn === null || state.turn < autonomy.surgeRecoveryUntilTurn) return state;
  return {
    ...state,
    autonomyByCiv: {
      ...state.autonomyByCiv,
      [civId]: { ...autonomy, surgeRecoveryUntilTurn: null, surgeCooldownUntilTurn: state.turn + 4 },
    },
  };
}
