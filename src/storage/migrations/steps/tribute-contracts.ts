import type { GameState, Treaty } from '@/core/types';
import { TRIBUTE_DURATION_ROUNDS, TRIBUTE_MAX_GOLD_PER_ROUND, isTributeTreaty } from '@/systems/diplomacy-tribute';

/**
 * #1334 — repairs standalone tribute contracts the game never writes in this shape: a record without valid terms, one
 * whose holder is not a party, an out-of-range payment or term, a duplicate, or a one-sided record (a tribute is mirrored
 * on both civs with identical terms). The orphan is dropped, never reconstructed: loading creates no payment or consent.
 *
 * Whether a well-formed contract is still *live* (a war or a vassalage since it was signed) is deliberately not decided
 * here; the round's tribute settlement removes a dead contract from both civs, once.
 */
export function normalizeTributeContracts(state: GameState): GameState {
  const civs = state.civilizations ?? {};
  const valid = (holderId: string, treaty: Treaty): boolean => {
    if (!isTributeTreaty(treaty)) return false;
    const { demanderId, payerId, goldPerRound } = treaty.tribute;
    return Object.hasOwn(civs, demanderId) && Object.hasOwn(civs, payerId) && demanderId !== payerId
      && (holderId === demanderId || holderId === payerId)
      && treaty.civA === holderId && treaty.civB === (holderId === demanderId ? payerId : demanderId)
      && Number.isInteger(goldPerRound) && goldPerRound >= 1 && goldPerRound <= TRIBUTE_MAX_GOLD_PER_ROUND
      && Number.isInteger(treaty.turnsRemaining) && treaty.turnsRemaining >= 1 && treaty.turnsRemaining <= TRIBUTE_DURATION_ROUNDS;
  };
  const sameTerms = (a: Treaty, b: Treaty): boolean => isTributeTreaty(a) && isTributeTreaty(b)
    && a.tribute.demanderId === b.tribute.demanderId && a.tribute.payerId === b.tribute.payerId
    && a.tribute.goldPerRound === b.tribute.goldPerRound;

  const wellFormed: Record<string, Treaty[]> = {};
  let touched = false;
  for (const [civId, civ] of Object.entries(civs)) {
    const seen = new Set<string>();
    wellFormed[civId] = (civ.diplomacy?.treaties ?? []).filter(treaty => {
      if (treaty?.type !== 'tribute') return true;
      const pairKey = `${treaty.civA}>${treaty.civB}`;
      const ok = valid(civId, treaty) && !seen.has(pairKey);
      if (ok) seen.add(pairKey);
      else touched = true;
      return ok;
    });
  }
  const civilizations = Object.fromEntries(Object.entries(civs).map(([civId, civ]) => {
    const treaties = wellFormed[civId].filter(treaty => {
      if (treaty.type !== 'tribute') return true;
      const mirror = (wellFormed[treaty.civB] ?? []).some(other =>
        other.type === 'tribute' && other.civA === treaty.civB && other.civB === civId && sameTerms(treaty, other));
      if (!mirror) touched = true;
      return mirror;
    });
    return [civId, treaties.length === (civ.diplomacy?.treaties ?? []).length && !touched
      ? civ
      : { ...civ, diplomacy: { ...civ.diplomacy, treaties } }];
  }));
  return touched ? { ...state, civilizations } : state;
}
