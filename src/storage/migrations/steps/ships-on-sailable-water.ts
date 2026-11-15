import type { GameState } from '@/core/types';
import { isBasedAirUnit } from '@/systems/air-base-state';
import { getWrappedHexesInRange, hexKey, hexesInRange, mapDistance } from '@/systems/hex-utils';
import { canPirateHullSail, PIRATE_HULL_DEFINITIONS, PIRATE_HULL_TYPES, type PirateHullType } from '@/systems/pirate-definitions';
import { findLegalSpawnTile, isUnitOnEnterableTerrain } from '@/systems/unit-spawn-placement';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

/** The lightest pirate hull that can sail open ocean: what a stranded coast-only pirate ship is refitted as. */
function lightestOceanPirateHull(): PirateHullType {
  return [...PIRATE_HULL_TYPES]
    .filter(type => canPirateHullSail(type, 'ocean'))
    .sort((a, b) => PIRATE_HULL_DEFINITIONS[a].introducedAtStage - PIRATE_HULL_DEFINITIONS[b].introducedAtStage
      || a.localeCompare(b))[0]!;
}

function isPirateHull(type: string): type is PirateHullType {
  return (PIRATE_HULL_TYPES as readonly string[]).includes(type);
}

/** How far a stranded ship may be moved to water it can sail. */
const RESCUE_RADIUS = 3;

/**
 * Schema 40 — every ship floats on water its hull can sail.
 *
 * Deep-sea pirate flotillas used to be crewed with coast-only galleys and corsairs on open ocean,
 * where they could never sail or relocate. Pirates now follow the same hull rules as every ship, so
 * an older save is fixed once:
 * - a coast-only pirate hull of a deep-sea flotilla on open ocean is refitted as the lightest
 *   ocean-going hull, in place (the flotilla keeps its station and can sail again);
 * - any other ship on terrain it cannot enter (a coast-only hull on ocean, a ship on land outside
 *   its own port) moves to the nearest tile within `RESCUE_RADIUS` it can sail
 *   (`findLegalSpawnTile`, friendly stacking allowed), ties broken by tile key;
 * - a pirate hull with no such tile is refitted the same way.
 * Land units are left alone: a land unit on water has its own designed recovery (#447), which shows
 * the player where to come ashore. A ship with nowhere to go stays put rather than being deleted.
 * Cargo aboard a ship and based aircraft are not on the map. Ships are visited in id order and each
 * sees the moves before it, so the result is deterministic.
 */
export function migrateShipsOnSailableWater(state: GameState): GameState {
  const map = state.map;
  if (!map?.tiles) return state;
  let next = state;
  for (const unitId of Object.keys(state.units ?? {}).sort()) {
    const unit = next.units[unitId];
    if (!unit || unit.transportId || isBasedAirUnit(unit)) continue;
    if ((UNIT_DEFINITIONS[unit.type]?.domain ?? 'land') !== 'naval') continue;
    if (isUnitOnEnterableTerrain(next, unit)) continue;
    const candidates = (map.wrapsHorizontally
      ? getWrappedHexesInRange(unit.position, RESCUE_RADIUS, map.width)
      : hexesInRange(unit.position, RESCUE_RADIUS))
      .filter(coord => hexKey(coord) !== hexKey(unit.position))
      .sort((a, b) => mapDistance(map, unit.position, a) - mapDistance(map, unit.position, b)
        || hexKey(a).localeCompare(hexKey(b)));
    // A pirate ship of a deep-sea flotilla lives on open ocean: a coast-only hull stranded there is
    // refitted as the lightest ocean-going hull, so the flotilla stays where it is and can sail again.
    const onOcean = next.map.tiles[hexKey(unit.position)]?.terrain === 'ocean';
    const flotillaShip = next.pirates?.factions[unit.owner]?.headquarters.kind === 'deep-sea-flotilla';
    if (isPirateHull(unit.type) && onOcean && flotillaShip) {
      next = { ...next, units: { ...next.units, [unitId]: { ...unit, type: lightestOceanPirateHull() } } };
      continue;
    }
    const destination = findLegalSpawnTile(next, { ownerId: unit.owner, unitType: unit.type, stacking: 'same-owner' }, candidates);
    if (destination) {
      next = { ...next, units: { ...next.units, [unitId]: { ...unit, position: { ...destination } } } };
    } else if (isPirateHull(unit.type) && onOcean) {
      next = { ...next, units: { ...next.units, [unitId]: { ...unit, type: lightestOceanPirateHull() } } };
    }
  }
  return next;
}
