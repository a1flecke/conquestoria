import type { GameState, HexCoord, Unit } from '@/core/types';
import { isAtWar } from './diplomacy-queries';
import { hexDistance, wrappedHexDistance } from './hex-utils';
import { isCityCoastal } from './city-lifecycle';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { derivePirateBlockades } from './pirate-behavior';

/**
 * Canonical naval-blockade facts (#1333).
 *
 * Pirate blockades have existed since #522; this module owns the general
 * "hostile major-civ warships blockade an enemy coastal city" rule and the one
 * authoritative read that unions both sources. The economic consequence stays in
 * `economy-system.ts`'s existing `blockadedCityIds` seam -- this module only
 * decides *whether* a city is blockaded, never what it costs.
 *
 * The fact is simulation truth derived from real state (war, unit positions,
 * city geometry), independent of any viewer. Viewer-scoped presentation decides
 * what a player is told; it must never feed back into this predicate.
 */

/** A blockading fleet must have this many warships within this hex distance. */
export const MAJOR_CIV_BLOCKADE_RADIUS = 2;

export interface MajorCivBlockade {
  blockaderCivId: string;
  cityId: string;
  victimCivId: string;
}

function distance(state: GameState, from: HexCoord, to: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

/**
 * The one combat-naval classifier for blockade purposes: a real naval hull with
 * attack strength. Excludes transports (strength 0), embarked cargo (land domain
 * or `transportId` set) and every non-major-civ actor.
 */
function isCombatWarship(unit: Unit): boolean {
  if (unit.transportId) return false;
  const definition = UNIT_DEFINITIONS[unit.type];
  return definition?.domain === 'naval' && definition.strength > 0;
}

function indexCombatWarshipsByOwner(state: GameState): Map<string, Unit[]> {
  const byOwner = new Map<string, Unit[]>();
  for (const unit of Object.values(state.units)) {
    // Major civs only: pirates, beasts, barbarians and rebels have their own rules.
    if (!state.civilizations[unit.owner]) continue;
    if (!isCombatWarship(unit)) continue;
    const ships = byOwner.get(unit.owner);
    if (ships) ships.push(unit);
    else byOwner.set(unit.owner, [unit]);
  }
  return byOwner;
}

/**
 * Every major-civ blockade this round. A coastal city is blockaded by a hostile
 * major civ when that civ has >= 2 combat warships within
 * `MAJOR_CIV_BLOCKADE_RADIUS`, at least one of them adjacent, and the city's
 * owner has no combat warship contesting the same ring. A city is reported at
 * most once, no matter how many hostile fleets independently qualify.
 */
export function deriveMajorCivBlockades(state: GameState): MajorCivBlockade[] {
  const warshipsByOwner = indexCombatWarshipsByOwner(state);
  const blockaderCivIds = [...warshipsByOwner.keys()].sort();
  const blockades: MajorCivBlockade[] = [];

  for (const city of Object.values(state.cities).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!state.civilizations[city.owner]) continue;
    if (!isCityCoastal(city, state.map)) continue;
    for (const blockaderCivId of blockaderCivIds) {
      if (blockaderCivId === city.owner) continue;
      if (!isAtWar(state.civilizations[blockaderCivId].diplomacy, city.owner)) continue;
      const ships = warshipsByOwner.get(blockaderCivId) ?? [];
      const nearby = ships.filter(ship => distance(state, ship.position, city.position) <= MAJOR_CIV_BLOCKADE_RADIUS);
      if (nearby.length < 2) continue;
      if (!nearby.some(ship => distance(state, ship.position, city.position) === 1)) continue;
      const defenders = warshipsByOwner.get(city.owner) ?? [];
      if (defenders.some(ship => distance(state, ship.position, city.position) <= MAJOR_CIV_BLOCKADE_RADIUS)) continue;
      blockades.push({ blockaderCivId, cityId: city.id, victimCivId: city.owner });
      break; // one fact per city, no matter how many hostile fleets qualify
    }
  }
  return blockades;
}

/** City ids blockaded by a hostile major civ, sorted and deduped. */
export function getMajorCivBlockadeCityIds(state: GameState): string[] {
  return [...new Set(deriveMajorCivBlockades(state).map(blockade => blockade.cityId))].sort();
}

/**
 * The one authoritative blockade read: every city blockaded by pirates OR a
 * hostile major civ, deduped. Presentation and AI consume this. The round
 * economy unions the pirate round's own list with the major-civ ids instead, so
 * the pirate derivation is never re-run after a siege can raze a city.
 */
export function getBlockadedCityIds(state: GameState): string[] {
  const ids = new Set<string>();
  for (const blockade of derivePirateBlockades(state)) ids.add(blockade.cityId);
  for (const blockade of deriveMajorCivBlockades(state)) ids.add(blockade.cityId);
  return [...ids].sort();
}
