// Leaf module (#526 MR7 review fix): the definition table, witness/reputation
// resolvers, and the opportunistic-war penalty live here rather than in
// crisis-interaction-system.ts specifically so espionage-system.ts can import them
// without a circular import. crisis-interaction-system.ts (send_aid's canSendAid/
// applySendAid) needs faction-system.ts, which imports city-system.ts, which imports
// espionage-system.ts (isSpyUnitType) -- so crisis-interaction-system.ts is NOT safe
// for espionage-system.ts to import. This module only depends on diplomacy-system.ts,
// discovery-system.ts, and world-pressure-flags.ts, none of which reach back to
// city-system.ts, so it is safe for both crisis-interaction-system.ts (which re-exports
// everything below for existing callers) and espionage-system.ts to import directly.
import type { ActiveCrisis, CrisisArchetype, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { modifyRelationship } from './diplomacy-system';
import { hasMetCivilization } from './discovery-system';
import { resolveWorldPressureFlags } from './world-pressure-flags';

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
// city-system.ts, per .claude/rules/game-balance.md). MR6 shipped the first two rows;
// MR7 appends exploit_weakness and sabotage_relief.
export const CRISIS_INTERACTION_DEFINITIONS: CrisisInteractionDefinition[] = [
  { id: 'hunt_their_foe', techRequired: null, kind: 'overt', targetReputationDelta: 15, witnessReputationDelta: 4, oncePerCrisisPerActor: true },
  // #590 MR3: famine reuses outbreak's medicine gate exactly — "send-aid diplomacy
  // interaction applies unchanged" means the same tech, the same behavior.
  { id: 'send_aid', techRequired: { outbreak: 'medicine', catastrophe: 'trade-routes', famine: 'medicine' }, kind: 'overt', targetReputationDelta: 15, witnessReputationDelta: 4, oncePerCrisisPerActor: true },
  // exploit_weakness's reputation penalty applies to ANY war declared on a crisis-struck
  // civ regardless of the declarer's tech (see applyOpportunisticWarPenaltyIfCrisisStruck
  // below) -- techRequired here gates only the bonus intel detail in
  // world-pressure-presentation.ts, not the reputation consequence itself.
  { id: 'exploit_weakness', techRequired: 'diplomatic-networks', kind: 'overt', targetReputationDelta: -15, witnessReputationDelta: -8, oncePerCrisisPerActor: false },
  // sabotage_relief has no per-actor once-only limit -- uniqueness is "one active
  // sabotage per crisis, across all actors" and is enforced by checking
  // ActiveCrisis.sabotage directly (espionage-system.ts), not this generic flag. This
  // row is the single source of truth for the -25/-8 deltas espionage-system.ts applies
  // on discovery -- if you change them here, they change there too (same import).
  { id: 'sabotage_relief', techRequired: 'covert-operations', kind: 'covert', targetReputationDelta: -25, witnessReputationDelta: -8, oncePerCrisisPerActor: false },
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

export function getActiveCrisisForCiv(
  state: GameState,
  civId: string,
  archetype?: CrisisArchetype,
): ActiveCrisis | undefined {
  return Object.values(state.activeCrises ?? {})
    .find(crisis => crisis.targetCivId === civId && (!archetype || crisis.archetype === archetype));
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

// Exploit weakness (#526 MR7 Task 7.1): declaring war on a civ with ANY active crisis is
// marked opportunistic, regardless of the declarer's own tech level -- diplomatic-networks
// only gates the bonus intel detail (world-pressure-presentation.ts), not this consequence.
// Actor-complete: called from every real war-declaration path (main.ts's diplomacy-panel
// handler and ensurePlayerWarState, basic-ai.ts's AI decision loop) rather than being
// threaded through declareWar itself, which would create a diplomacy-system.ts <->
// crisis-interaction-system.ts import cycle (diplomacy-system.ts is already imported BY
// this module for modifyRelationship).
export function applyOpportunisticWarPenaltyIfCrisisStruck(
  state: GameState,
  actorId: string,
  targetCivId: string,
  bus: EventBus,
): GameState {
  if (resolveWorldPressureFlags(state.settings).aiCrisisInteractions !== 'full') return state;
  const crisis = getActiveCrisisForCiv(state, targetCivId);
  if (!crisis) return state;

  const next = applyInteractionReputation(state, actorId, targetCivId, getCrisisInteractionDefinition('exploit_weakness')!);
  bus.emit('diplomacy:opportunistic-war', { actorId, targetCivId, crisisId: crisis.id });
  return next;
}
