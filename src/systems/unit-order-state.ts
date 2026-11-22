import type { Unit } from '@/core/types';

/**
 * Order-state queries (#1010): which units still need the player's attention this
 * turn. Read-only and pure (types only) -- never mutates a unit.
 */

export function getUnmovedUnits(
  units: Record<string, Unit>,
  civId: string,
): Unit[] {
  return Object.values(units).filter(u => u.owner === civId && isUnitAwaitingOrders(u));
}

export function isUnitAwaitingOrders(unit: Unit): boolean {
  return !unit.transportId
    && !unit.airBase
    && !unit.hasMoved
    && !unit.hasActed
    && !unit.skippedTurn
    && !unit.isFortified
    && !unit.committedToRouteId
    && !unit.workerTask;
}

/**
 * The one answer to "may this unit spend a normal action right now?" — the shared
 * action-points gate for actions whose contract is "unused movement and no action yet
 * this turn" (unit attacks, city bombardment). Read-only and pure like its neighbours.
 *
 * A unit normally needs at least one movement point. Seize the Moment is the one
 * exception the design names: contract §19 grants "another legal attack" while
 * explicitly forbidding a full movement refresh — `issueSeizeTheMoment` never touches
 * `movementPointsLeft` (pinned by `great-general-mr4-invariants.test.ts`). The attack
 * that made the unit Seize-eligible spent every point, so requiring movement here would
 * make the granted action unreachable. The marker is per-turn (`resetUnitTurn` clears
 * it) and the action it funds writes `hasActed`, so it can fund at most one action and
 * can never be spent twice.
 */
export function canSpendUnitAction(
  unit: Pick<Unit, 'hasActed' | 'movementPointsLeft' | 'seizeGrantedBy'>,
  turn: number,
): boolean {
  if (unit.hasActed) return false;
  if (unit.movementPointsLeft > 0) return true;
  return unit.seizeGrantedBy?.turn === turn;
}
