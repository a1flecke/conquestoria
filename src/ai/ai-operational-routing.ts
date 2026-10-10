import type { GameMap, GameState, Unit } from '@/core/types';
import type { HexCoord } from '@/core/types/hex';
import { isUnitConcealedFrom } from '@/systems/concealment';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { isTrustedObservedLastSeenTile } from '@/systems/last-seen-presentation';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';
import { getBlockingMapEntitiesByHex, isBlockingCityFor } from '@/systems/unit-movement-legality';
import { findPath } from '@/systems/unit-pathfinding';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { removeUnits } from '@/systems/unit-removal-system';
import { buildKnownPathMap } from './ai-path-knowledge';

/** Added operational searches, shared across every plan and lookahead in one civ turn. */
export const MAX_OPERATIONAL_ROUTE_QUERIES = 32;

export interface AIOperationalRouting {
  remainingQueries: number;
  maps: WeakMap<GameState, Map<string, { map: GameMap; id: number }>>;
  mapIds: Map<string, number>;
  routes: Map<string, HexCoord[] | null>;
}

export function createOperationalRouting(): AIOperationalRouting {
  return { remainingQueries: MAX_OPERATIONAL_ROUTE_QUERIES, maps: new WeakMap(), mapIds: new Map(), routes: new Map() };
}

/** Canonical range on this actor's facts; the executor retains the authoritative state. */
export function getKnownOperationalRange(state: GameState, unit: Unit, routing: AIOperationalRouting): HexCoord[] {
  const visibility = state.civilizations[unit.owner]?.visibility;
  const visible = (position: HexCoord) => getVisibility(visibility, position) === 'visible';
  const hiddenUnitIds = Object.values(state.units).filter(other =>
    other.owner !== unit.owner && (!visible(other.position) || isUnitConcealedFrom(state, other, unit.owner)))
    .map(other => other.id);
  // A scratch knowledge slice still uses canonical removal so cargo, wings and
  // rosters cannot leave ghost occupancy behind. No events or authoritative writes.
  const perceived = removeUnits(state, hiddenUnitIds, { reason: 'eliminated' }).state;
  const units = perceived.units;
  const known: GameState = {
    ...perceived,
    map: routing.maps.get(state)?.get(unit.owner)?.map ?? buildKnownPathMap(state, unit.owner),
    units,
    cities: Object.fromEntries(Object.entries(state.cities).filter(([, city]) => city.owner === unit.owner || visible(city.position))),
    barbarianCamps: Object.fromEntries(Object.entries(state.barbarianCamps ?? {}).filter(([, camp]) => visible(camp.position))),
    pirates: state.pirates ? {
      ...state.pirates,
      factions: Object.fromEntries(Object.entries(state.pirates.factions).filter(([, faction]) =>
        faction.headquarters.kind !== 'coastal-enclave' || visible(faction.headquarters.position))),
    } : state.pirates,
  };
  const occupied = new Set(Object.values(units).filter(other => other.id !== unit.id && !other.transportId && !other.airBase)
    .map(other => hexKey(other.position)));
  return getMovementRangeDetails(known, unit.id).reachable.filter(coord => !occupied.has(hexKey(coord)));
}

/**
 * A belief route, never an executable command. Visible blockers and remembered cities
 * constrain the canonical pathfinder; unseen troops never do. The current-turn range
 * and real executor still decide how much of the route can actually be traversed.
 */
export function getOperationalRoute(
  state: GameState,
  unit: Unit,
  target: HexCoord,
  routing: AIOperationalRouting,
): HexCoord[] | null {
  let actorMaps = routing.maps.get(state);
  if (!actorMaps) {
    actorMaps = new Map();
    routing.maps.set(state, actorMaps);
  }
  let knowledge = actorMaps.get(unit.owner);
  if (!knowledge) {
    const map = buildKnownPathMap(state, unit.owner);
    const signature = JSON.stringify([unit.owner, Object.entries(map.tiles).map(([key, tile]) =>
      [key, tile.terrain, tile.owner, tile.hasRoad, tile.hasRiver]), map.rivers]);
    let id = routing.mapIds.get(signature);
    if (id === undefined) {
      id = routing.mapIds.size;
      routing.mapIds.set(signature, id);
    }
    knowledge = { map, id };
    actorMaps.set(unit.owner, knowledge);
  }
  const { map } = knowledge;
  const visibility = state.civilizations[unit.owner]?.visibility;
  const blocked = new Set<string>();
  for (const key of getBlockingMapEntitiesByHex(state, unit).keys()) {
    const tile = state.map.tiles[key];
    if (tile && getVisibility(visibility, tile.coord) === 'visible') blocked.add(key);
  }
  for (const [key, snapshot] of Object.entries(visibility?.lastSeen ?? {})) {
    if (getVisibility(visibility, snapshot.coord) === 'fog'
      && isTrustedObservedLastSeenTile(snapshot)
      && snapshot.city && isBlockingCityFor(state, unit, snapshot.city)) blocked.add(key);
  }
  for (const other of Object.values(state.units)) {
    // Friendly troops may be passed through by the canonical executor, even though
    // tactics never selects an occupied final destination.
    if (other.id === unit.id || other.owner === unit.owner || other.transportId || other.airBase) continue;
    if (getVisibility(visibility, other.position) === 'visible'
      && !isUnitConcealedFrom(state, other, unit.owner)) blocked.add(hexKey(other.position));
  }
  const denied = getDeniedTerritoryOwners({ ...state, map }, unit);
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const key = JSON.stringify([
    unit.owner, unit.id, unit.type, hexKey(unit.position), hexKey(target), knowledge.id,
    [...blocked].sort(), [...denied].sort(), completedTechs,
  ]);
  if (routing.routes.has(key)) return routing.routes.get(key)!;
  if (routing.remainingQueries <= 0) return null;
  routing.remainingQueries -= 1;
  const route = findPath(unit.position, target, map, 'land', {
    unit, completedTechs, deniedOwnerIds: denied, blockedHexKeys: blocked,
  });
  routing.routes.set(key, route);
  return route;
}
