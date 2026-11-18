import type { GameState, Unit, UnitType } from '@/core/types';
import type { HexCoord } from '@/core/types/hex';
import { hexKey, hexNeighbors, wrapHexCoord } from './hex-utils';
import { isPassableForParams, movementStepCostParamsForType } from './unit-movement-cost';
import { getBlockingMapEntityKeysForOwner } from './unit-movement-legality';
import { isCityCoastal } from './city-lifecycle';
import { buildUnitOccupancy, getUnitIdsAtCoord, type UnitOccupancyIndex } from './unit-occupancy';

/**
 * Where may a unit that does not exist yet be put on the map? The creation-time twin of the
 * movement resolver, for every path that conjures a unit instead of walking one: rewards,
 * espionage consequences, rebels, returning spies.
 *
 * A tile is legal for `ownerId`'s new `unitType` when it
 * - exists,
 * - is terrain that unit type can enter (the movement step-cost model, so a land unit is never
 *   put on water and a coast-only hull never on ocean),
 * - holds no map entity that blocks that owner (foreign city, barbarian camp, pirate enclave —
 *   `getBlockingMapEntityKeysForOwner`, the same set ordinary movement refuses), and
 * - holds no map unit of a different owner (cargo and based aircraft are not map occupants,
 *   exactly as for movement and `assertNoIllegalBlockingOccupancy`).
 *
 * `stacking: 'empty-only'` also refuses a tile holding the owner's own units, for spawns that are
 * meant to spread out (rebel bands); `'same-owner'` allows friendly stacking, which ordinary
 * movement and city production allow. Several units from different owners never share a tile.
 *
 * Territorial access (#871) is not consulted: every caller places units on the owner's own city
 * or for a non-major owner, which border obedience exempts.
 */
export type SpawnStacking = 'empty-only' | 'same-owner';

export interface SpawnPlacementQuery {
  ownerId: string;
  unitType: UnitType;
  stacking: SpawnStacking;
}

export interface SpawnPlacementIndex {
  readonly blocked: ReadonlySet<string>;
  readonly occupancy: UnitOccupancyIndex;
}

export function buildSpawnPlacementIndex(state: GameState, ownerId: string): SpawnPlacementIndex {
  return {
    blocked: getBlockingMapEntityKeysForOwner(state, ownerId),
    occupancy: buildUnitOccupancy(state.units),
  };
}

export function isLegalSpawnTile(
  state: GameState,
  query: SpawnPlacementQuery,
  coord: HexCoord,
  index: SpawnPlacementIndex = buildSpawnPlacementIndex(state, query.ownerId),
): boolean {
  const key = hexKey(coord);
  const tile = state.map.tiles[key];
  if (!tile) return false;
  if (!isPassableForParams(movementStepCostParamsForType(query.unitType), tile.terrain)) return false;
  if (index.blocked.has(key)) return false;
  const occupants = getUnitIdsAtCoord(index.occupancy, coord);
  if (query.stacking === 'empty-only') return occupants.length === 0;
  return occupants.every(id => index.occupancy.ownersByUnitId[id] === query.ownerId);
}

/** Every candidate that is legal, in the order given. Each candidate is judged on `state` as given. */
export function filterLegalSpawnTiles(
  state: GameState,
  query: SpawnPlacementQuery,
  candidates: readonly HexCoord[],
): HexCoord[] {
  const index = buildSpawnPlacementIndex(state, query.ownerId);
  return candidates.filter(coord => isLegalSpawnTile(state, query, coord, index));
}

/** The first legal candidate, or `null` when none is legal (the caller then spawns nothing). */
export function findLegalSpawnTile(
  state: GameState,
  query: SpawnPlacementQuery,
  candidates: readonly HexCoord[],
): HexCoord | null {
  return filterLegalSpawnTiles(state, query, candidates)[0] ?? null;
}

/**
 * #1724: where a city-generated map unit may appear. The city centre is the intended tile
 * and is preferred; when it cannot hold the unit (a foreign occupant, a blocking entity, or
 * a hostile stack) the six neighbours are tried in their stable `spawnNeighbours` order.
 *
 * The city-centre exception is deliberate: a naval unit trained in a port stands on its
 * own city tile even though that tile's terrain is land (`isUnitOnEnterableTerrain`). An
 * adjacent fallback must still be genuine water/coast for a hull. Air units are based, not
 * placed on the map, and callers skip this helper for them.
 *
 * `null` means no legal tile among the city centre and its neighbours; the caller must then
 * report an explicit no-placement outcome rather than create a unit in an illegal stack.
 */
export function findCityUnitSpawnTile(
  state: GameState,
  query: SpawnPlacementQuery,
  cityPosition: HexCoord,
): HexCoord | null {
  const city = Object.values(state.cities).find(candidate =>
    candidate.owner === query.ownerId && hexKey(candidate.position) === hexKey(cityPosition));
  if (!city) return null;

  const index = buildSpawnPlacementIndex(state, query.ownerId);
  const candidates = [city.position, ...spawnNeighbours(state, city.position)];
  for (const coord of candidates) {
    const key = hexKey(coord);
    const tile = state.map.tiles[key];
    if (!tile) continue;
    if (index.blocked.has(key)) continue;
    const occupants = getUnitIdsAtCoord(index.occupancy, coord);
    const stackingOk = query.stacking === 'empty-only'
      ? occupants.length === 0
      : occupants.every(id => index.occupancy.ownersByUnitId[id] === query.ownerId);
    if (!stackingOk) continue;
    const terrainOk = key === hexKey(city.position)
      ? isUnitOnEnterableTerrain(state, { owner: query.ownerId, type: query.unitType, position: coord })
      : isPassableForParams(movementStepCostParamsForType(query.unitType), tile.terrain);
    if (terrainOk) return coord;
  }
  return null;
}

/**
 * The legacy order the rebel spawners have always drawn from. Kept so a seeded draw over an
 * all-legal neighbourhood picks the same tile it did before legality was checked.
 */
export const REBEL_SPAWN_OFFSETS: readonly HexCoord[] = [
  { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
  { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
];

/**
 * The six neighbours of `center` (in `offsets` order, `hexNeighbors` order by default), wrapped
 * across the seam on a wrapping map.
 */
export function spawnNeighbours(
  state: GameState,
  center: HexCoord,
  offsets?: readonly HexCoord[],
): HexCoord[] {
  const raw = offsets
    ? offsets.map(offset => ({ q: center.q + offset.q, r: center.r + offset.r }))
    : hexNeighbors(center);
  return state.map.wrapsHorizontally ? raw.map(coord => wrapHexCoord(coord, state.map.width)) : raw;
}

/**
 * Where a spy that leaves its cover (exfiltrated, recalled from an embedding, expelled home)
 * reappears: on `center` — its own city, beside the garrison — or else a neighbour it can stand on.
 */
export function findSpyReturnTile(
  state: GameState,
  ownerId: string,
  unitType: UnitType,
  center: HexCoord,
): HexCoord | null {
  return findLegalSpawnTile(
    state,
    { ownerId, unitType, stacking: 'same-owner' },
    [center, ...spawnNeighbours(state, center)],
  );
}


/**
 * Does `unit` stand on terrain its type can enter? The movement step-cost model decides (no land
 * unit on water, no coast-only hull on open ocean), for every owner, pirates included.
 * Ships in their own coastal ports and traders inside a freight passage can remain on land tiles. A trader
 * retains a legal position after the channel closes so it can sail out on a later turn. Cargo
 * aboard a ship and based aircraft are not on the map; callers skip them.
 */
export function isUnitOnEnterableTerrain(
  state: GameState,
  unit: Pick<Unit, 'owner' | 'type' | 'position'>,
): boolean {
  const key = hexKey(unit.position);
  const tile = state.map.tiles[key];
  if (!tile) return false;
  const params = movementStepCostParamsForType(unit.type);
  if (isPassableForParams(params, tile.terrain) || (tile.freightPassage && params.freightHull)) return true;
  if (params.domain !== 'naval') return false;
  // "In port" means a genuinely coastal city. A landlocked owned city is not a harbour;
  // leaving that open let a coastline-only hull sit in an inland city without failing the
  // terrain invariant (#1725).
  return Object.values(state.cities).some(city =>
    city.owner === unit.owner && hexKey(city.position) === key && isCityCoastal(city, state.map));
}
