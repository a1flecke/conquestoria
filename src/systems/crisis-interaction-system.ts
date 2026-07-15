import type { GameState } from '@/core/types';
import { modifyRelationship } from './diplomacy-system';
import { hasMetCivilization } from './discovery-system';

export interface CrisisInteractionDefinition {
  id: 'hunt_their_foe' | 'send_aid' | 'exploit_weakness' | 'sabotage_relief';
  techRequired: string | null;
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
  { id: 'send_aid', techRequired: 'medicine', kind: 'overt', targetReputationDelta: 15, witnessReputationDelta: 4, oncePerCrisisPerActor: true },
];

export function getCrisisInteractionDefinition(
  id: CrisisInteractionDefinition['id'],
): CrisisInteractionDefinition | undefined {
  return CRISIS_INTERACTION_DEFINITIONS.find(def => def.id === id);
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
