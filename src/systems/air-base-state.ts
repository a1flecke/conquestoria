// src/systems/air-base-state.ts
// #1248: the one question about air basing that movement, occupancy and targeting all ask — "is this unit
// housed at an air base, and so not a map-occupying entity?". A leaf: it reads a single Unit field and
// imports nothing, so the occupancy/targeting layer no longer has to import the air-operations system
// (strikes, interception, rebasing) just to ask it. The roster, capacity and mission rules stay in
// air-operations-system.ts.
import type { Unit } from '@/core/types';

export function isBasedAirUnit(unit: Unit): boolean {
  return unit.airBase !== undefined;
}
