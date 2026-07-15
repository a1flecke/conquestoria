import type { ActiveCrisis, City, CrisisArchetype, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { modifyRelationship } from './diplomacy-system';
import { hasMetCivilization } from './discovery-system';
import { resolveWorldPressureFlags } from './world-pressure-flags';
import { getCityAppeaseCost } from './faction-system';

export interface CrisisInteractionDefinition {
  id: 'hunt_their_foe' | 'send_aid' | 'exploit_weakness' | 'sabotage_relief';
  // send_aid's tech gate differs by crisis archetype (medicine for outbreak,
  // trade-routes for catastrophe) -- a per-archetype map, resolved via
  // resolveInteractionTechRequired, keeps this one row instead of two.
  techRequired: string | null | Partial<Record<CrisisArchetype, string>>;
  kind: 'overt' | 'covert';
  targetReputationDelta: number;
  witnessReputationDelta: number;
  oncePerCrisisPerActor: boolean;
}

// One row per hook (spec §Interactions) -- the resolver consumes rows generically, so a
// future hook is a row, not a branch (same pattern as NP_PRODUCTION_DISCOUNTS in
// city-system.ts, per .claude/rules/game-balance.md). MR6 ships the first two rows;
// MR7 appends exploit_weakness and sabotage_relief.
export const CRISIS_INTERACTION_DEFINITIONS: CrisisInteractionDefinition[] = [
  { id: 'hunt_their_foe', techRequired: null, kind: 'overt', targetReputationDelta: 15, witnessReputationDelta: 4, oncePerCrisisPerActor: true },
  { id: 'send_aid', techRequired: { outbreak: 'medicine', catastrophe: 'trade-routes' }, kind: 'overt', targetReputationDelta: 15, witnessReputationDelta: 4, oncePerCrisisPerActor: true },
];

export function getCrisisInteractionDefinition(
  id: CrisisInteractionDefinition['id'],
): CrisisInteractionDefinition | undefined {
  return CRISIS_INTERACTION_DEFINITIONS.find(def => def.id === id);
}

// string | null: the row's literal gate (or none). undefined: the row's gate is a
// per-archetype map with no entry for this archetype -- i.e. never satisfiable, since
// no tech unlocks the hook for that archetype at all (e.g. send_aid vs. a hunt crisis).
export function resolveInteractionTechRequired(
  def: CrisisInteractionDefinition,
  archetype?: CrisisArchetype,
): string | null | undefined {
  if (def.techRequired === null || typeof def.techRequired === 'string') return def.techRequired;
  if (!archetype) return undefined;
  return def.techRequired[archetype];
}

// Witnesses: civs that have met BOTH actor and target, excluding actor/target themselves
// (spec §Interactions -- "civs that have met both actor and target, including human civs").
export function getWitnessCivIds(state: GameState, actorId: string, targetId: string): string[] {
  return Object.keys(state.civilizations)
    .filter(civId => civId !== actorId && civId !== targetId)
    .filter(civId => hasMetCivilization(state, civId, actorId) && hasMetCivilization(state, civId, targetId))
    .sort();
}

function applyBilateralRelationshipDelta(
  state: GameState,
  civAId: string,
  civBId: string,
  delta: number,
): GameState {
  const civA = state.civilizations[civAId];
  const civB = state.civilizations[civBId];
  if (!civA || !civB) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civAId]: { ...civA, diplomacy: modifyRelationship(civA.diplomacy, civBId, delta) },
      [civBId]: { ...civB, diplomacy: modifyRelationship(civB.diplomacy, civAId, delta) },
    },
  };
}

// Bilateral actor<->target delta, then bilateral actor<->witness delta for every witness.
// No special-casing by either party's humanity -- hot-seat co-op and AI-on-AI interactions
// go through the exact same path.
export function applyInteractionReputation(
  state: GameState,
  actorId: string,
  targetId: string,
  def: CrisisInteractionDefinition,
): GameState {
  const witnessIds = getWitnessCivIds(state, actorId, targetId);
  let next = applyBilateralRelationshipDelta(state, actorId, targetId, def.targetReputationDelta);
  for (const witnessId of witnessIds) {
    next = applyBilateralRelationshipDelta(next, actorId, witnessId, def.witnessReputationDelta);
  }
  return next;
}

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
