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
