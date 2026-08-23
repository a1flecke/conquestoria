import type { GameState } from '@/core/types';
import { hexKey, mapDistance } from './hex-utils';
import { getShoreSupplyCapability, getUnitLandSupplyCost, unitParticipatesInLandSupply } from './supply-participation';
import { isLandUnitCompatibleWithShip } from './transport-system';

/**
 * Geography-first, deterministic naval shore-supply allocation (contract
 * #544 §10): each ship independently allocates capacity to compatible,
 * in-range, deployed (not embarked) land units, closest-first, stable
 * tie-break, skip-if-doesn't-fit-continue, no pooling across ships, one
 * unit supplied by at most one source, full recompute every round.
 */
export function getNavalShoreSupplyAssignments(state: GameState, civId: string): Set<string> {
  const assigned = new Set<string>();
  const ships = Object.values(state.units)
    .filter(unit => unit.owner === civId && getShoreSupplyCapability(unit.type) !== null)
    .sort((a, b) => hexKey(a.position).localeCompare(hexKey(b.position)));

  const candidateUnits = Object.values(state.units).filter(unit =>
    unit.owner === civId && !unit.transportId && unitParticipatesInLandSupply(unit),
  );

  for (const ship of ships) {
    const capability = getShoreSupplyCapability(ship.type)!;
    const inRange = candidateUnits
      .filter(unit => !assigned.has(unit.id) && isLandUnitCompatibleWithShip(unit, ship))
      .filter(unit => mapDistance(state.map, ship.position, unit.position) <= capability.projectsLandSupplyRange)
      .sort((a, b) =>
        mapDistance(state.map, ship.position, a.position) - mapDistance(state.map, ship.position, b.position)
        || hexKey(a.position).localeCompare(hexKey(b.position)),
      );

    let remainingCapacity = capability.landSupplyCapacity;
    for (const unit of inRange) {
      const cost = getUnitLandSupplyCost(unit.type);
      if (cost > remainingCapacity) continue; // skip, don't stop — contract §10 step 4
      assigned.add(unit.id);
      remainingCapacity -= cost;
    }
  }
  return assigned;
}
