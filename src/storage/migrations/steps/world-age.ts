import type { GameState } from '@/core/types';
import { resolveWorldAge } from '@/systems/tech-definitions';
import { migrateLegacyBasedAircraft } from './legacy-aircraft';

/**
 * Schema 5 — recompute World Age from the per-civ personal eras, replacing the
 * single `era` field older saves carried.
 *
 * Note the call into schema 4's aircraft migration: that is pre-existing
 * behaviour, preserved verbatim by #1023, not an extraction artifact. It is
 * redundant for any save below 4 (the ordered loop already ran step 4 on the
 * way here) and only does work for a save that entered the chain at exactly
 * version 4. Left as-is because #1023 is behaviour-preserving; untangling it
 * would be a separate, testable change.
 */
export function migrateDualEraWorldAge(state: GameState): GameState {
  const withAircraft = migrateLegacyBasedAircraft(state);
  return { ...withAircraft, era: resolveWorldAge(withAircraft.civilizations) };
}
