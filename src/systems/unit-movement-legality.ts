import type { City, GameState, HexCoord, Unit } from '@/core/types';
import { hexKey } from './hex-utils';
import { isPirateOwner } from '@/core/owner-kind';
import { hasAllianceTreaty } from './diplomacy-system';

/**
 * Movement legality (#1010) — the single source of truth for "does a map entity
 * block this mover from this tile?" (#843 / #845 / #965 / #970). A foreign
 * unallied city, a barbarian camp, an intact pirate coastal-enclave anchor.
 *
 * This module MUST NOT import pathfinding, the movement-queries module, or the
 * cost module. Territorial access (#870 / #871) is added here as a new
 * `BlockingMapEntity['reason']` variant plus a predicate — `getBlockingMapEntityAt`
 * / `getBlockingMapEntityKeys` / `BLOCKING_MAP_ENTITY_MESSAGES` then pick it up
 * for free.
 */
export type UnitMovementBlockerCode =
  | 'unknown-tile'
  | 'unexplored'
  | 'impassable-water'
  | 'impassable-terrain'
  | 'requires-ocean-hull'
  | 'occupied'
  | 'foreign-city'
  | 'barbarian-camp'
  | 'pirate-enclave'
  | 'unreachable'
  | 'insufficient-movement';

export interface BlockingMapEntity {
  reason: 'foreign-city' | 'barbarian-camp' | 'pirate-enclave';
  entityId: string;
}

// A pirate faction's coastal-enclave headquarters anchors on a land tile (#965;
// pirate-factions design). Like a barbarian camp, an intact enclave blocks
// ordinary movement onto that anchor for everyone except the pirate faction that
// owns it -- a land unit cannot walk in, stack, or "capture" it. The enclave is
// resolved only by a naval assault from an adjacent sea tile
// (see getEnclaveAssaultPreview); it never transfers ownership to a civ.
function isBlockingPirateEnclaveFor(unit: Unit): boolean {
  return !isPirateOwner(unit.owner);
}

/** Land anchors of every intact pirate coastal-enclave headquarters. */
function pirateEnclaveAnchorEntries(state: GameState): Array<{ id: string; key: string }> {
  const factions = state.pirates?.factions;
  if (!factions) return [];
  const entries: Array<{ id: string; key: string }> = [];
  for (const faction of Object.values(factions)) {
    if (faction.headquarters.kind === 'coastal-enclave') {
      entries.push({ id: faction.id, key: hexKey(faction.headquarters.position) });
    }
  }
  return entries;
}

export function isBlockingCityFor(state: GameState, unit: Unit, city: City): boolean {
  return city.owner !== unit.owner && !hasAllianceTreaty(state, unit.owner, city.owner);
}

// Camps have no owner field -- they're always barbarian-hostile to every civ (#845), the same
// way `isAlwaysHostilePair` treats the 'barbarian' owner class elsewhere. The one exception is
// a barbarian-owned mover itself (e.g. a raider that spawned on/near its own camp), which must
// not be blocked from its own camp the same way a city never blocks its own owner.
function isBlockingCampFor(unit: Unit): boolean {
  return unit.owner !== 'barbarian';
}

/**
 * A foreign, unallied city -- or a barbarian camp -- blocks ordinary movement onto its tile
 * exactly like `validateUnitMove`'s rejection checks: this is the single source of truth both
 * that executor and the movement-range preview BFS (`getMovementRange`/
 * `getMovementRangeDetails`) consult, so the two layers can never drift out of sync the way
 * they did before this predicate existed (#843). Returns `null` when `coord` has no blocking
 * entity.
 */
export function getBlockingMapEntityAt(
  state: GameState,
  unit: Unit,
  coord: HexCoord,
): BlockingMapEntity | null {
  const key = hexKey(coord);
  const city = Object.values(state.cities).find(c => hexKey(c.position) === key);
  if (city && isBlockingCityFor(state, unit, city)) {
    return { reason: 'foreign-city', entityId: city.id };
  }
  const camp = Object.values(state.barbarianCamps ?? {}).find(c => hexKey(c.position) === key);
  if (camp && isBlockingCampFor(unit)) {
    return { reason: 'barbarian-camp', entityId: camp.id };
  }
  if (isBlockingPirateEnclaveFor(unit)) {
    const enclave = pirateEnclaveAnchorEntries(state).find(entry => entry.key === key);
    if (enclave) {
      return { reason: 'pirate-enclave', entityId: enclave.id };
    }
  }
  return null;
}

export const BLOCKING_MAP_ENTITY_MESSAGES: Record<BlockingMapEntity['reason'], string> = {
  'foreign-city': 'Move adjacent, then use the city assault action.',
  'barbarian-camp': 'Move adjacent, then attack to destroy the camp.',
  'pirate-enclave': 'This pirate stronghold can only be destroyed by a warship attacking from an adjacent sea tile.',
};

/**
 * Every hex `unit` cannot enter via ordinary movement due to a blocking map entity
 * (see `getBlockingMapEntityAt`). Callers that only have decomposed occupancy data
 * (not a full `GameState`) -- `getMovementRange`'s two live callers -- compute this set
 * once up front and pass it in, rather than threading `GameState` through the BFS.
 */
export function getBlockingMapEntityKeys(state: GameState, unit: Unit): Set<string> {
  const keys = new Set<string>();
  for (const city of Object.values(state.cities)) {
    if (isBlockingCityFor(state, unit, city)) {
      keys.add(hexKey(city.position));
    }
  }
  if (isBlockingCampFor(unit)) {
    for (const camp of Object.values(state.barbarianCamps ?? {})) {
      keys.add(hexKey(camp.position));
    }
  }
  if (isBlockingPirateEnclaveFor(unit)) {
    for (const { key } of pirateEnclaveAnchorEntries(state)) {
      keys.add(key);
    }
  }
  return keys;
}
