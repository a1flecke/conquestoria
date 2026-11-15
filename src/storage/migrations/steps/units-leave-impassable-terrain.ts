import type { GameState } from '@/core/types';
import { isBasedAirUnit } from '@/systems/air-base-state';
import { getWrappedHexesInRange, hexKey, hexesInRange, mapDistance } from '@/systems/hex-utils';
import { findLegalSpawnTile, isUnitOnEnterableTerrain } from '@/systems/unit-spawn-placement';

/** How far a stranded unit may be carried to dry land (or water, for a beached ship). */
const RESCUE_RADIUS = 3;

/**
 * Schema 40 — every unit on the map stands on terrain it can enter.
 *
 * Before this, several placement paths (revolt rebels, arms-smuggled rebels, quest reward units,
 * returning spies) only checked that a tile existed, so an older save can hold a land unit on
 * water that can never move again. Each such unit is moved once to the nearest tile, within
 * `RESCUE_RADIUS`, where it may legally stand (`findLegalSpawnTile`, friendly stacking allowed),
 * ties broken by tile key. A unit with nowhere to go stays where it is rather than being deleted.
 * Cargo aboard a ship and based aircraft are not on the map and are left alone. Units are visited
 * in id order and each sees the moves before it, so the result is deterministic. A save with no
 * stranded unit is returned unchanged.
 */
export function migrateUnitsLeaveImpassableTerrain(state: GameState): GameState {
  const map = state.map;
  if (!map?.tiles) return state;
  let next = state;
  for (const unitId of Object.keys(state.units ?? {}).sort()) {
    const unit = next.units[unitId];
    if (!unit || unit.transportId || isBasedAirUnit(unit)) continue;
    if (isUnitOnEnterableTerrain(next, unit)) continue;
    const candidates = (map.wrapsHorizontally
      ? getWrappedHexesInRange(unit.position, RESCUE_RADIUS, map.width)
      : hexesInRange(unit.position, RESCUE_RADIUS))
      .filter(coord => hexKey(coord) !== hexKey(unit.position))
      .sort((a, b) => mapDistance(map, unit.position, a) - mapDistance(map, unit.position, b)
        || hexKey(a).localeCompare(hexKey(b)));
    const destination = findLegalSpawnTile(next, { ownerId: unit.owner, unitType: unit.type, stacking: 'same-owner' }, candidates);
    if (!destination) continue;
    next = { ...next, units: { ...next.units, [unitId]: { ...unit, position: { ...destination } } } };
  }
  return next;
}
