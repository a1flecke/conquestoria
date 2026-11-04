import type { GameState } from '@/core/types';

/**
 * Schema 38 (#497) — give every city-state a founding turn.
 *
 * A city-state in an earlier save never recorded when it came into being, so the load turn is the
 * honest lower bound on its age: it starts ageing from the upgrade. A valid recorded value (a
 * non-negative integer) is left alone, which keeps the step idempotent; anything else is replaced.
 */
export function migrateMinorCivFoundedTurn(state: GameState): GameState {
  const minorCivs = state.minorCivs ?? {};
  let changed = false;
  const stamped = Object.fromEntries(Object.entries(minorCivs).map(([id, minorCiv]) => {
    const recorded = minorCiv.foundedTurn;
    if (Number.isInteger(recorded) && (recorded as number) >= 0) return [id, minorCiv];
    changed = true;
    return [id, { ...minorCiv, foundedTurn: state.turn }];
  }));
  return changed ? { ...state, minorCivs: stamped } : state;
}
