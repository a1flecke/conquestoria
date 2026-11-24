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
 * The one answer to "is this unit's Seize grant a live action budget right now?" (#1807).
 * Same owner turn, not yet spent. `resetUnitTurn` clears the whole marker, so a stale
 * entry can only exist in hand-built fixtures and old saves — both covered by tests.
 */
export function isSeizeGrantSpendable(
  unit: Pick<Unit, 'seizeGrantedBy'>,
  turn: number,
): boolean {
  const grant = unit.seizeGrantedBy;
  return grant !== undefined && grant.turn === turn && grant.spent !== true;
}

/**
 * The one answer to "may this unit spend a normal action right now?" — the shared
 * action-points gate for actions whose contract is "unused movement and no action yet
 * this turn" (unit attacks, city bombardment, city capture, camp/naval/embarked
 * assault). Read-only and pure like its neighbours.
 *
 * Movement points are always required. A unit that has not acted spends them normally;
 * Seize the Moment is the one way an acted unit still gets any (#1807): the grant is
 * the per-turn `seizeGrantedBy` marker plus the bounded budget `issueSeizeTheMoment`
 * writes, so `hasActed` is forgiven exactly while that marker is live and unspent.
 * The granted action is one-shot: every attack path zeroes the granted movement
 * itself, and a granted reposition marks the marker `spent` (see
 * `executeValidatedUnitMove`) so the budget can buy a reposition OR an attack,
 * never both.
 */
export function canSpendUnitAction(
  unit: Pick<Unit, 'hasActed' | 'movementPointsLeft' | 'seizeGrantedBy'>,
  turn: number,
): boolean {
  if (unit.movementPointsLeft <= 0) return false;
  if (!unit.hasActed) return true;
  return isSeizeGrantSpendable(unit, turn);
}
