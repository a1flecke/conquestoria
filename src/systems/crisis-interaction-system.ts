import type { ActiveCrisis, City, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getCityAppeaseCost } from './faction-system';
import { resolveWorldPressureFlags } from './world-pressure-flags';
import {
  getCrisisInteractionDefinition,
  resolveInteractionTechRequired,
  applyInteractionReputation,
} from './crisis-interaction-definitions';

// Re-exported for existing callers (main.ts, crisis-system.ts, tests) -- the actual
// definitions live in crisis-interaction-definitions.ts, a leaf module with no
// faction-system.ts/city-system.ts dependency, so espionage-system.ts can import them
// directly without the circular import this file's own faction-system.ts dependency
// (below, for send_aid's gold cost) would otherwise create. See that file's header
// comment for the full cycle.
export type { CrisisInteractionDefinition } from './crisis-interaction-definitions';
export {
  CRISIS_INTERACTION_DEFINITIONS,
  getCrisisInteractionDefinition,
  resolveInteractionTechRequired,
  getActiveCrisisForCiv,
  getWitnessCivIds,
  applyInteractionReputation,
  applyOpportunisticWarPenaltyIfCrisisStruck,
} from './crisis-interaction-definitions';

// The city a send-aid payment is priced/applied against: the most populous city among
// the crisis's own cityIds (works for both outbreak, where cityIds are the infected
// cities, and catastrophe, where cityIds is the single devastated-tile owner's city).
function getSendAidCity(state: GameState, crisis: ActiveCrisis): City | undefined {
  return crisis.cityIds
    .map(id => state.cities[id])
    .filter((city): city is City => Boolean(city))
    .sort((a, b) => b.population - a.population || a.id.localeCompare(b.id))[0];
}

export type SendAidFailureReason =
  | 'no-tech' | 'already-aided' | 'not-enough-gold' | 'unknown-civ' | 'flag-off' | 'no-crisis';

// goldCost and the missing techId ride along on every failure branch where they're
// computable (i.e. once a real crisis+city exists), not just the branches that
// specifically test them -- the diplomacy panel shows both in the disabled-button
// tooltip regardless of which gate actually failed, so "Send Aid (75 Gold)" never
// degrades to a bare "?" once the player has already located the right crisis.
export function canSendAid(
  state: GameState,
  actorCivId: string,
  crisisId: string,
): { ok: true; goldCost: number }
  | { ok: false; reason: SendAidFailureReason; goldCost?: number; techId?: string } {
  if (resolveWorldPressureFlags(state.settings).aiCrisisInteractions === 'off') {
    return { ok: false, reason: 'flag-off' };
  }
  const actor = state.civilizations[actorCivId];
  if (!actor) return { ok: false, reason: 'unknown-civ' };

  const crisis = state.activeCrises?.[crisisId];
  if (!crisis) return { ok: false, reason: 'no-crisis' };

  const city = getSendAidCity(state, crisis);
  const goldCost = city ? getCityAppeaseCost(city) : undefined;

  if (crisis.aidedByCivIds?.includes(actorCivId)) {
    return { ok: false, reason: 'already-aided', goldCost };
  }

  const def = getCrisisInteractionDefinition('send_aid')!;
  const techRequired = resolveInteractionTechRequired(def, crisis.archetype);
  if (techRequired === undefined || (techRequired !== null && !actor.techState.completed.includes(techRequired))) {
    return { ok: false, reason: 'no-tech', goldCost, techId: techRequired ?? undefined };
  }

  if (!city || goldCost === undefined) return { ok: false, reason: 'no-crisis' };
  if (actor.gold < goldCost) return { ok: false, reason: 'not-enough-gold', goldCost };

  return { ok: true, goldCost };
}

// Outbreak: pays the target's remedy cost from the ACTOR's treasury and writes the same
// remedyCompletionByCity record applyRemedy would (crisis-system.ts's tick reads that
// record unchanged either way) -- never call applyRemedy itself, it deducts the
// TARGET's gold. Catastrophe: the actor's payment is credited to the target civ as
// relief gold instead. Both archetypes: aidedByCivIds enforces once-per-crisis-per-actor,
// reputation moves bilaterally (actor<->target, actor<->every witness), and
// crisis:aid-sent fires once.
export function applySendAid(
  state: GameState,
  actorCivId: string,
  crisisId: string,
  bus: EventBus,
): GameState {
  const check = canSendAid(state, actorCivId, crisisId);
  if (!check.ok) return state;

  const crisis = state.activeCrises![crisisId];
  const actor = state.civilizations[actorCivId]!;
  const city = getSendAidCity(state, crisis)!;

  let nextState: GameState = {
    ...state,
    civilizations: {
      ...state.civilizations,
      [actorCivId]: { ...actor, gold: actor.gold - check.goldCost },
    },
  };

  if (crisis.archetype === 'catastrophe') {
    const targetCiv = nextState.civilizations[crisis.targetCivId];
    if (targetCiv) {
      nextState = {
        ...nextState,
        civilizations: {
          ...nextState.civilizations,
          [crisis.targetCivId]: { ...targetCiv, gold: targetCiv.gold + check.goldCost },
        },
      };
    }
  }

  const updatedCrisis: ActiveCrisis = {
    ...crisis,
    aidedByCivIds: [...(crisis.aidedByCivIds ?? []), actorCivId],
    ...(crisis.archetype === 'outbreak' ? {
      remedyCompletionByCity: { ...(crisis.remedyCompletionByCity ?? {}), [city.id]: nextState.turn + 2 },
    } : {}),
  };
  nextState = {
    ...nextState,
    activeCrises: { ...nextState.activeCrises, [crisisId]: updatedCrisis },
  };

  nextState = applyInteractionReputation(
    nextState, actorCivId, crisis.targetCivId, getCrisisInteractionDefinition('send_aid')!,
  );

  bus.emit('crisis:aid-sent', {
    crisisId, actorCivId, targetCivId: crisis.targetCivId, goldCost: check.goldCost,
  });

  return nextState;
}
