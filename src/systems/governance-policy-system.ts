import type { GameState } from '../core/types';
import type { GovernancePolicyId } from './governance-types';
import { getGovernancePolicyDefinition } from './governance-policy-definitions';
import { getGovernanceCapacity, getGovernanceLoad } from './governance-capacity';

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
  if (!civ) return { success: false, state, message: 'Unknown civilization.' };

  const definition = getGovernancePolicyDefinition(policyId);
  const currentlyEnabled = isGovernancePolicyActive(state, civId, policyId);
  if (currentlyEnabled === enabled) {
    return {
      success: false, state,
      message: enabled ? `${definition.name} is already active.` : `${definition.name} is already disabled.`,
    };
  }
  if (!canToggleGovernancePolicy(state, civId, policyId)) {
    return {
      success: false, state,
      message: `${definition.name} cannot be changed again until turn ${getGovernancePolicyLockedUntilTurn(state, civId, policyId)}.`,
    };
  }
  if (enabled) {
    const capacity = getGovernanceCapacity(state, civId).total;
    const load = getGovernanceLoad(state, civId).total;
    if (load + definition.loadCost > capacity) {
      return {
        success: false, state,
        message: `Not enough governance capacity to adopt ${definition.name} (needs ${definition.loadCost}, have ${Math.max(0, capacity - load)} free).`,
      };
    }
  }

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
