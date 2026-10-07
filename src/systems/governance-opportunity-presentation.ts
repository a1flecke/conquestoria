// #1373: spendable governance capacity, projected for the strategic assessment (#1374) to rank.
// Pure and deterministic: no RNG, no mutation, no events, no save field. Own-empire only.
//
// Governance load is not a constraint (nothing is penalised when it is high), so this never reports
// "overload". It reports the positive choice instead: free capacity that an actually-legal policy
// adoption or governor assignment could use. Legality comes from the same resolvers the executors run
// (`getGovernancePolicyEligibility`, `getGovernorAssignmentEligibility`), so it can never advertise an
// action the executor would refuse. It does not pick a policy or a city: that choice stays with the player.
import type { GameState } from '@/core/types';
import { getGovernanceFreeCapacity } from '@/systems/governance-capacity';
import { GOVERNANCE_POLICY_DEFINITIONS } from '@/systems/governance-policy-definitions';
import { getGovernancePolicyEligibility } from '@/systems/governance-policy-system';
import { getGovernorAssignmentEligibility } from '@/systems/governor-system';

/** Relative rank input (1-100): a deliberate choice, but never urgent. */
export const GOVERNANCE_OPPORTUNITY_PRIORITY = 50;

export interface GovernanceOpportunity {
  id: 'governance-capacity';
  freeCapacity: number;
  /** Inactive policies that could be adopted right now. */
  adoptablePolicyCount: number;
  /** Owned, ungoverned cities that could receive a governor right now. */
  assignableGovernorCount: number;
  priority: number;
  title: string;
  why: string;
  destination: { kind: 'open-governance' };
}

export function getGovernanceOpportunity(state: GameState, civId: string): GovernanceOpportunity | null {
  if (!state.civilizations[civId]) return null;
  // Computed once; every eligibility call below reuses it.
  const freeCapacity = getGovernanceFreeCapacity(state, civId);
  if (freeCapacity <= 0) return null;

  const adoptablePolicyCount = GOVERNANCE_POLICY_DEFINITIONS
    .filter(policy => getGovernancePolicyEligibility(state, civId, policy.id, true, freeCapacity).ok).length;
  const assignableGovernorCount = Object.values(state.cities)
    .filter(city => city.owner === civId && getGovernorAssignmentEligibility(state, civId, city.id, freeCapacity).ok).length;
  if (adoptablePolicyCount === 0 && assignableGovernorCount === 0) return null;

  const room = adoptablePolicyCount > 0 && assignableGovernorCount > 0
    ? 'Another policy or governor can fit without giving up a current commitment.'
    : adoptablePolicyCount > 0
      ? 'You have room to adopt another governance policy.'
      : 'You have room to assign another governor.';
  return {
    id: 'governance-capacity',
    freeCapacity,
    adoptablePolicyCount,
    assignableGovernorCount,
    priority: GOVERNANCE_OPPORTUNITY_PRIORITY,
    title: 'Governance capacity is available',
    why: `You have ${freeCapacity} capacity free. ${room}`,
    destination: { kind: 'open-governance' },
  };
}
