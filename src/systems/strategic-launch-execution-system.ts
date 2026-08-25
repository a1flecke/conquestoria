import type { GameState } from '@/core/types';
import { resolveStrategicStrike, type StrategicStrikeResult } from '@/systems/strategic-strike-system';
import { isStrategicStrikeRetaliation } from '@/systems/strategic-launch-system';
import { getWitnessCivIds, applyBilateralRelationshipDelta } from '@/systems/crisis-interaction-definitions';

// #545 spec §11: unprovoked first use is a much harsher penalty than
// retaliation against a civ that struck you first. No separate
// "self-defense" tier -- these two are the only cases.
const STRIKE_REPUTATION_DELTAS = {
  unprovoked: { target: -60, witness: -25 },
  retaliation: { target: -20, witness: -5 },
} as const;

function applyStrategicStrikeReputation(
  state: GameState,
  actorId: string,
  targetId: string,
  deltas: { target: number; witness: number },
): GameState {
  const witnessIds = getWitnessCivIds(state, actorId, targetId);
  let next = applyBilateralRelationshipDelta(state, actorId, targetId, deltas.target);
  for (const witnessId of witnessIds) {
    next = applyBilateralRelationshipDelta(next, actorId, witnessId, deltas.witness);
  }
  return next;
}

function recordStrategicStrikeReceived(state: GameState, actorId: string, targetCivId: string): GameState {
  const targetCiv = state.civilizations[targetCivId];
  if (!targetCiv) return state;
  const receivedFrom = targetCiv.diplomacy.strategicStrikesReceivedFrom ?? [];
  if (receivedFrom.includes(actorId)) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [targetCivId]: {
        ...targetCiv,
        diplomacy: {
          ...targetCiv.diplomacy,
          strategicStrikesReceivedFrom: [...receivedFrom, actorId],
        },
      },
    },
  };
}

/**
 * #545 MR4: the ONLY entry point UI code may call to launch a strategic
 * strike. Wraps MR3's resolveStrategicStrike with spec §11's reputation
 * consequences and the retaliation-tracking write -- UI code must never call
 * resolveStrategicStrike directly, or a strike would silently skip
 * reputation/witness consequences and retaliation tracking.
 *
 * A new file (not added to strategic-launch-system.ts) deliberately --
 * strategic-strike-system.ts already imports getStrategicLaunchLegality FROM
 * strategic-launch-system.ts, so adding this function there would need to
 * import resolveStrategicStrike back, creating a circular import.
 *
 * Retaliation is classified using the PRE-strike state's
 * strategicStrikesReceivedFrom (equivalently the post-strike state, since
 * resolveStrategicStrike never touches this field) -- see
 * isStrategicStrikeRetaliation's own doc comment.
 */
export function executeStrategicLaunch(
  state: GameState,
  actorCivId: string,
  targetCityId: string,
): StrategicStrikeResult {
  const result = resolveStrategicStrike(state, actorCivId, targetCityId);
  if (!result.ok) return result;

  const targetCity = result.state.cities[targetCityId]!;
  const targetCivId = targetCity.owner;
  const deltas = isStrategicStrikeRetaliation(result.state, actorCivId, targetCivId)
    ? STRIKE_REPUTATION_DELTAS.retaliation
    : STRIKE_REPUTATION_DELTAS.unprovoked;

  let nextState = applyStrategicStrikeReputation(result.state, actorCivId, targetCivId, deltas);
  nextState = recordStrategicStrikeReceived(nextState, actorCivId, targetCivId);

  return { ...result, state: nextState };
}
