import type { GameState } from '@/core/types';
import { GOVERNANCE_POLICY_DEFINITIONS } from '@/systems/governance-policy-definitions';

/**
 * Schema 31 (#987) — the governance layer added `governancePolicies` /
 * `governancePolicyChangedTurn` to `Civilization`.
 *
 * CORRUPTION REPAIR, not a real versioning step, mirroring migration 25's
 * federalism precedent exactly: both fields are optional and absent already
 * means "no policies" everywhere they are read, so this is a no-op for every
 * save the game itself wrote. It exists purely to scrub a malformed
 * hand-edited value (an unknown policy id, a non-boolean enabled flag, or a
 * non-integer/negative changed-turn) rather than let it silently corrupt the
 * lock-turn arithmetic or the capacity/load calculation. No toggle event or
 * pressure-row mutation fires on load.
 */
export function repairGovernancePolicyFields(state: GameState): GameState {
  const knownIds = new Set(GOVERNANCE_POLICY_DEFINITIONS.map(policy => policy.id));
  let changedAny = false;
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => {
    let policies: typeof civ.governancePolicies;
    if (civ.governancePolicies !== undefined) {
      const cleaned = Object.fromEntries(
        Object.entries(civ.governancePolicies).filter(
          ([id, enabled]) => knownIds.has(id as never) && typeof enabled === 'boolean',
        ),
      );
      policies = Object.keys(cleaned).length > 0 ? (cleaned as typeof civ.governancePolicies) : undefined;
    } else {
      policies = undefined;
    }

    let changedTurns: typeof civ.governancePolicyChangedTurn;
    if (civ.governancePolicyChangedTurn !== undefined) {
      const cleaned = Object.fromEntries(
        Object.entries(civ.governancePolicyChangedTurn).filter(
          ([id, turn]) => knownIds.has(id as never) && Number.isInteger(turn) && (turn as number) >= 0,
        ),
      );
      changedTurns = Object.keys(cleaned).length > 0 ? (cleaned as typeof civ.governancePolicyChangedTurn) : undefined;
    } else {
      changedTurns = undefined;
    }

    if (policies === civ.governancePolicies && changedTurns === civ.governancePolicyChangedTurn) {
      return [civId, civ];
    }
    changedAny = true;
    return [civId, { ...civ, governancePolicies: policies, governancePolicyChangedTurn: changedTurns }];
  }));

  return changedAny ? { ...state, civilizations } : state;
}
