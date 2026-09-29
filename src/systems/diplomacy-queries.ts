/**
 * Read-only diplomacy queries: the seam every domain that merely needs to ask
 * "what is the relationship / are we at war / which agreements exist?" imports
 * -- movement, supply, combat, economy, AI -- instead of the diplomacy
 * integration module. Types-only leaf: no mutation, no imports from any other
 * diplomacy module.
 *
 * Two facts are deliberately kept separate from each other and from anything
 * a consumer derives from them:
 *  - war state is per-side (`DiplomacyState.atWarWith`), asked with `isAtWar`;
 *  - an agreement is a `Treaty` record, asked with `hasTreatyBetween`.
 * What an agreement *permits* (movement access, logistics) is a decision each
 * consuming domain makes; this module never encodes it.
 */
import type { DiplomacyState, GameState, TreatyType } from '@/core/types';

export function getRelationship(state: DiplomacyState, civId: string): number {
  return state.relationships[civId] ?? 0;
}

export function isAtWar(state: DiplomacyState, civId: string): boolean {
  return state.atWarWith.includes(civId);
}


/**
 * Is a `type` treaty recorded between the two civs? Reads BOTH parties'
 * records: signing writes each side (`commitTreatyAgreement`), and asking
 * either side's ledger keeps the answer symmetric even for a save whose two
 * records disagree. Treaty order and direction (`civA`/`civB`) never matter.
 */
export function hasTreatyBetween(state: GameState, civA: string, civB: string, type: TreatyType): boolean {
  const recordedBy = (holderId: string): boolean =>
    (state.civilizations[holderId]?.diplomacy?.treaties ?? []).some(treaty =>
      treaty.type === type
      && ((treaty.civA === civA && treaty.civB === civB) || (treaty.civA === civB && treaty.civB === civA)));
  return recordedBy(civA) || recordedBy(civB);
}

/** An alliance treaty exists between the two civs (either party's record). */
export function hasAllianceTreaty(state: GameState, civA: string, civB: string): boolean {
  return hasTreatyBetween(state, civA, civB, 'alliance');
}
