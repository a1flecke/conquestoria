import type { GameState, HeroicAbilityId, Unit } from '@/core/types';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { mapDistance } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { isAIHostileOwner } from '@/ai/ai-hostility';

/**
 * #544 MR5: one candidate action a General could take this turn, already
 * scored by its ability-specific evaluator. `execute` is the exact issuance
 * call (issueRally/issueSeizeTheMoment/issueLastStand) bound with whatever
 * arguments that evaluator already resolved (e.g. Last Stand's chosen target
 * hex) -- the shared spend layer never needs to know each ability's own
 * argument shape, only how to compare and call `execute`.
 */
export interface GeneralCommandOpportunity {
  ability: HeroicAbilityId;
  score: number;
  execute: (state: GameState) => GameState;
}

/** Every `great_general` unit `civId` owns with a resolvable definition -- a
 * unit with `generalDefinitionId` pointing at an id no longer in the roster
 * (shouldn't happen, but mirrors this codebase's existing defensive-lookup
 * convention elsewhere in great-general-abilities.ts) is excluded. */
export function getEraGenerals(state: GameState, civId: string): Unit[] {
  const civ = state.civilizations[civId];
  if (!civ) return [];
  return civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.type === 'great_general' && u.generalDefinitionId)
    .filter(u => GENERAL_DEFINITIONS.some(g => g.id === u.generalDefinitionId));
}

const GENERAL_DANGER_RADIUS = 1;

/**
 * contract item 84 (no hidden-info AI): only ever checks units the owning
 * civ can actually see (`getVisibility(...) === 'visible'`), never a raw
 * scan of `state.units`. A General adjacent to a visible hostile unit is
 * "in danger" -- the shared spend layer uses this to discourage (but not
 * forbid) spending a scarce charge while exposed.
 */
export function isGeneralInDanger(state: GameState, general: Pick<Unit, 'owner' | 'position'>): boolean {
  const visibility = state.civilizations[general.owner]?.visibility;
  if (!visibility) return false;
  return Object.values(state.units).some(candidate =>
    candidate.owner !== general.owner
    && isAIHostileOwner(state, general.owner, candidate.owner)
    && getVisibility(visibility, candidate.position) === 'visible'
    && mapDistance(state.map, general.position, candidate.position) <= GENERAL_DANGER_RADIUS);
}
