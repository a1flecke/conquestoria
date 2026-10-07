import type { GameState } from '../core/types';
import type { GovernancePolicyId } from './governance-types';
import { getGovernancePolicyDefinition } from './governance-policy-definitions';
import { getGovernanceFreeCapacity } from './governance-capacity';

// One lock, both directions — same anti-thrash rationale as
// FEDERALISM_LOCK_TURNS (faction-system.ts): stops a rapid on/off cycle from
// grabbing a policy's benefit without ever paying its cost for more than an
// instant ("cannot be used to dodge an in-flight consequence", per the issue's
// own testing requirement). Per-policy, not empire-wide — three independent
// policies must not share one lock clock.
export const GOVERNANCE_POLICY_LOCK_TURNS = 5;

export function isGovernancePolicyActive(state: GameState, civId: string, policyId: GovernancePolicyId): boolean {
  return state.civilizations[civId]?.governancePolicies?.[policyId] === true;
}

export function getGovernancePolicyLockedUntilTurn(
  state: GameState,
  civId: string,
  policyId: GovernancePolicyId,
): number {
  const changedTurn = state.civilizations[civId]?.governancePolicyChangedTurn?.[policyId];
  return changedTurn === undefined ? -Infinity : changedTurn + GOVERNANCE_POLICY_LOCK_TURNS;
}

export function canToggleGovernancePolicy(state: GameState, civId: string, policyId: GovernancePolicyId): boolean {
  if (!state.civilizations[civId]) return false;
  return state.turn >= getGovernancePolicyLockedUntilTurn(state, civId, policyId);
}

export type GovernancePolicyEligibility = { ok: true } | { ok: false; message: string };

/**
 * The one legality definition for toggling a policy (#1373): `setGovernancePolicy` re-runs it before its first
 * write, and the presentation and opportunity projections ask it instead of copying its checks. Pass
 * `freeCapacity` when asking about several policies so capacity and load are computed once.
 */
export function getGovernancePolicyEligibility(
  state: GameState,
  civId: string,
  policyId: GovernancePolicyId,
  enabled: boolean,
  freeCapacity?: number,
): GovernancePolicyEligibility {
  if (!state.civilizations[civId]) return { ok: false, message: 'Unknown civilization.' };
  const definition = getGovernancePolicyDefinition(policyId);
  if (isGovernancePolicyActive(state, civId, policyId) === enabled) {
    return { ok: false, message: enabled ? `${definition.name} is already active.` : `${definition.name} is already disabled.` };
  }
  if (!canToggleGovernancePolicy(state, civId, policyId)) {
    return { ok: false, message: `${definition.name} cannot be changed again until turn ${getGovernancePolicyLockedUntilTurn(state, civId, policyId)}.` };
  }
  if (enabled) {
    const free = freeCapacity ?? getGovernanceFreeCapacity(state, civId);
    if (definition.loadCost > free) {
      return { ok: false, message: `Not enough governance capacity to adopt ${definition.name} (needs ${definition.loadCost}, have ${free} free).` };
    }
  }
  return { ok: true };
}

export interface GovernancePolicyToggleResult {
  success: boolean;
  state: GameState;
  message: string;
}

export function setGovernancePolicy(
  state: GameState,
  civId: string,
  policyId: GovernancePolicyId,
  enabled: boolean,
): GovernancePolicyToggleResult {
  const civ = state.civilizations[civId];
  const definition = getGovernancePolicyDefinition(policyId);
  const eligibility = getGovernancePolicyEligibility(state, civId, policyId, enabled);
  if (!eligibility.ok || !civ) return { success: false, state, message: eligibility.ok ? 'Unknown civilization.' : eligibility.message };

  return {
    success: true,
    message: enabled ? `${definition.name} adopted.` : `${definition.name} repealed.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: {
          ...civ,
          governancePolicies: { ...civ.governancePolicies, [policyId]: enabled },
          governancePolicyChangedTurn: { ...civ.governancePolicyChangedTurn, [policyId]: state.turn },
        },
      },
    },
  };
}
