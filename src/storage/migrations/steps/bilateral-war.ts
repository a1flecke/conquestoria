import type { GameState } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';

/**
 * #995 — repairs structurally impossible MAJOR-civilization war state that the
 * game never writes: a duplicate id, a civ at war with itself, or a one-sided
 * war (A lists B but B does not list A). One-sided major war silently drives
 * war-weariness, AI war-pressure and peace availability off a phantom.
 *
 * Conservative by design:
 *  - an asymmetry between two live majors is repaired by DROPPING the orphaned
 *    entry, never by fabricating the reciprocal war;
 *  - a `classifyOwner === 'major'` id that is not a live civ in the roster is
 *    a dangling major-war entry and is dropped;
 *  - NON-major ids (minor civs `mc-…`, `barbarian`, …) are left untouched apart
 *    from dedup / self-reference — a `mc-…` entry is a legitimate city-state
 *    war (see `.claude/rules/game-systems.md#bilateral-diplomacy`); a dangling
 *    non-major id is #1001's concern, not this rule's.
 */
export function normalizeBilateralWar(state: GameState): GameState {
  const civs = state.civilizations ?? {};
  const isMajor = (id: string): boolean => Object.hasOwn(civs, id);

  // Pass 1 — per-civ hygiene: drop non-strings, self, and duplicates.
  const cleaned: Record<string, string[]> = {};
  for (const [civId, civ] of Object.entries(civs)) {
    const seen = new Set<string>();
    cleaned[civId] = (civ.diplomacy?.atWarWith ?? []).filter(otherId => {
      if (typeof otherId !== 'string' || otherId === civId || seen.has(otherId)) return false;
      seen.add(otherId);
      return true;
    });
  }

  // Pass 2 — major↔major only: drop a dangling major id, and drop the orphan
  // side of a one-sided war. Non-major ids pass through.
  for (const [civId, list] of Object.entries(cleaned)) {
    cleaned[civId] = list.filter(otherId => {
      if (classifyOwner(otherId) !== 'major') return true;
      if (!isMajor(otherId)) return false; // dangling major-war entry
      return cleaned[otherId]?.includes(civId) ?? false;
    });
  }

  let changed = false;
  const civilizations: GameState['civilizations'] = {};
  for (const [civId, civ] of Object.entries(civs)) {
    const original = civ.diplomacy?.atWarWith ?? [];
    const next = cleaned[civId];
    if (next.length === original.length && next.every((id, i) => id === original[i])) {
      civilizations[civId] = civ;
      continue;
    }
    changed = true;
    civilizations[civId] = { ...civ, diplomacy: { ...civ.diplomacy, atWarWith: next } };
  }
  return changed ? { ...state, civilizations } : state;
}
