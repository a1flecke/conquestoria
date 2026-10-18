import type { GameState, Unit } from '@/core/types';

/**
 * #1502 MR05 — the finite trip counter is retired.
 *
 * A route no longer expires after a fixed number of trips: its trader repeats until the owner
 * cancels it or it is destroyed, so `Unit.tripsRemaining` has no reader and no writer any more.
 * Removing a persisted field is a save-compatibility change, so this step deletes it rather than
 * leaving a dead value on every unit of a save written before the change.
 *
 * The route's own new fields (`paused`, `cancelPending`) are optional and every reader tolerates
 * their absence, so they need no transformation here.
 */
export function migrateTradeRoutePersistence(state: GameState): GameState {
  let changed = false;
  const units: Record<string, Unit> = {};
  for (const [unitId, unit] of Object.entries(state.units)) {
    if (!('tripsRemaining' in unit)) {
      units[unitId] = unit;
      continue;
    }
    changed = true;
    const { tripsRemaining: _retired, ...rest } = unit as Unit & { tripsRemaining?: number };
    units[unitId] = rest as Unit;
  }
  return changed ? { ...state, units } : state;
}
