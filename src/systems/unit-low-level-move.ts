import type { Unit, HexCoord, GameState } from '@/core/types';
import { getZoneOfControlAt } from './zone-of-control-system';

/**
 * The LOW-LEVEL position movers (#1025 / #1010) -- a guarded primitive, not an
 * API. They change a unit's position and movement points with NO legality check
 * (no terrain, blocker, territorial-access or ZoC-from-the-path validation), so
 * ordinary movement must go through `resolveUnitMoveIntent` /
 * `executeValidatedUnitMove` (`unit-movement-system.ts`), which is the only
 * module that calls them.
 *
 * Reachability is structural, not conventional:
 *  - this module is NOT re-exported by the deprecated `unit-system.ts` barrel;
 *  - `tests/app/architecture-boundaries.test.ts` pins the exact set of modules
 *    allowed to import it (the executor, plus the two world-actor
 *    `movement-contract-exempt` callers named there);
 *  - `scripts/check-src-rule-violations.sh` / `check-src-edit.sh` still reject a
 *    call to these names anywhere else.
 */

export function moveUnit(unit: Unit, to: HexCoord, cost: number): Unit {
  return {
    ...unit,
    position: { ...to },
    movementPointsLeft: Math.max(0, unit.movementPointsLeft - cost),
    hasMoved: true,
    isFortified: undefined,
  };
}

export function moveUnitWithZoneOfControl(
  state: Readonly<GameState>, unit: Unit, to: HexCoord, cost: number,
): { unit: Unit; stopped: boolean } {
  const moved = moveUnit(unit, to, cost);
  const stopped = getZoneOfControlAt(state, moved, to).limited;
  return { unit: stopped ? { ...moved, movementPointsLeft: 0 } : moved, stopped };
}
