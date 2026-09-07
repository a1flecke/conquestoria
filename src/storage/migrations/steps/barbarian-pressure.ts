import type { GameState } from '@/core/types';
import { normalizeBarbarianCampPressure } from '@/systems/barbarian-pressure';

/**
 * Schema 14 — the coarse per-camp barbarian pressure ledger. The implementation
 * lives in `@/systems/barbarian-pressure`; this is the migration-side wrapper.
 */

export function migrateBarbarianCampPressure(state: GameState): GameState {
  return normalizeBarbarianCampPressure({ ...state, barbarianCampPressure: state.barbarianCampPressure ?? {} });
}
