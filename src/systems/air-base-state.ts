// src/systems/air-base-state.ts
// #1248: the questions about air basing that movement, occupancy and targeting all ask — "is this unit housed at an
// air base, and so not a map-occupying entity?" and "where do a carrier's based aircraft sit when it moves?". A leaf: it
// reads Unit fields and the unit catalog, so the occupancy/targeting/movement layer no longer imports the air-operations
// system (strikes, interception, rebasing) to ask them. The roster, capacity and mission rules stay in
// air-operations-system.ts.
import type { GameState, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-definitions';

export function isBasedAirUnit(unit: Unit): boolean {
  return unit.airBase !== undefined;
}

export function syncCarrierBasedAircraft(state: GameState, carrierId: string): GameState {
  const carrier = state.units[carrierId];
  // #582: any carrier-family hull, not just plain 'carrier' -- same
  // carrierDeckCapacity-driven check as getAirBaseKind in air-operations-system.ts.
  if (!carrier || UNIT_DEFINITIONS[carrier.type].carrierDeckCapacity == null) return state;
  let changed = false;
  const units = { ...state.units };
  for (const unit of Object.values(units)) {
    if (unit.airBase?.kind !== 'carrier' || unit.airBase.unitId !== carrierId) continue;
    if (unit.position.q === carrier.position.q && unit.position.r === carrier.position.r) continue;
    units[unit.id] = { ...unit, position: { ...carrier.position } };
    changed = true;
  }
  return changed ? { ...state, units } : state;
}
