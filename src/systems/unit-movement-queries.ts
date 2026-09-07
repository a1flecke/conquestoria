import type { GameMap, GameState, HexCoord, Unit, VisibilityState } from '@/core/types';
import {
  hexKey,
  hexNeighbors,
  getWrappedHexNeighbors,
  wrapHexCoord,
} from './hex-utils';
import { isHostileOwnerTo } from './owner-hostility';
import { getZoneOfControlAt } from './zone-of-control-system';
import { UNIT_DEFINITIONS } from './unit-definitions';
import {
  isPassableForUnitInContext,
  canHullEnterOcean,
  getMovementStepCost,
  type UnitMovementContext,
} from './unit-movement-cost';
import {
  BLOCKING_MAP_ENTITY_MESSAGES,
  getBlockingMapEntityAt,
  type BlockingMapEntity,
} from './unit-movement-legality';
import { findPath } from './unit-pathfinding';
import { resolveUnitMoveIntent } from './unit-movement-validation';

/**
 * Movement queries (#1010). A read-only derived answer for a UI / AI consumer,
 * composed from the cost + legality + pathfinding modules: what tiles can a unit
 * reach this turn (`getMovementRange` / `getMovementRangeDetails`), and why is a
 * specific tap illegal (`getMovementBlockerReason`).
 *
 * Admission criterion: everything here mutates nothing and owns no rule of its
 * own. Anything that owns a movement rule belongs in the cost or legality
 * module instead.
 *
 * NOTE (#1025 follow-up): `getMovementBlockerReason` is the player-facing tap
 * explainer and is a *second* derivation of movement legality — it omits
 * `validateUnitMove`'s hostile-occupant and path-crossing checks. It is kept
 * verbatim here (moved, not changed); collapsing it onto `resolveUnitMoveIntent`
 * is tracked under #1025. `unit-movement-resolver-parity.test.ts` pins the gap.
 */
export interface MovementBlockerReason {
  code:
    | 'unexplored'
    | 'unknown-tile'
    | 'impassable-water'
    | 'impassable-terrain'
    | 'requires-ocean-hull'
    | 'occupied'
    | 'foreign-city'
    | 'barbarian-camp'
    | 'pirate-enclave'
    | 'unreachable'
    | 'insufficient-movement'
    | 'zone-of-control';
  message: string;
}

/**
 * The ONE viewer-scoping rule for movement rejections (#1025 MR4 / #1002).
 * `resolveUnitMoveIntent` is deliberately omniscient — it sees units, blockers and terrain the
 * viewer has not discovered. Surfacing its reason verbatim would leak that. When the
 * destination is unexplored to the viewer, every reason collapses to the generic one.
 *
 * Known limitation (owned by #1002): this keys off the DESTINATION only. If the destination is
 * explored but a path tile is not, the reason can still describe that unexplored tile. Making
 * redaction path-aware is out of scope here — do not widen the leak, do not silently fix it.
 */
export function redactMovementRejectionForViewer(
  reason: MovementBlockerReason,
  visibilityState: VisibilityState | undefined,
): MovementBlockerReason {
  if (visibilityState === 'unexplored') {
    return { code: 'unexplored', message: 'Too far away to spot.' };
  }
  return reason;
}

/**
 * The first tile on `path` (excluding the start) whose *entry* is Zone-of-Control limited,
 * or `null`. `moveUnitWithZoneOfControl` stops a unit immediately after entering such a tile,
 * so if this is not the destination the executor will stop the unit short.
 *
 * Derived from the executor's own predicate (`getZoneOfControlAt`) rather than re-deriving the
 * rule — the same "precomputation derived from the canonical rule" pattern
 * `getBlockingMapEntityKeys` uses. `getZoneOfControlAt` reads only the mover's type/owner and
 * the destination's neighbours, never the mover's position, so passing the unmoved unit for
 * every step gives the executor's answer.
 */
export function findZoneOfControlStop(
  state: GameState,
  unit: Unit,
  path: HexCoord[],
): HexCoord | null {
  for (const step of path.slice(1)) {
    if (getZoneOfControlAt(state, unit, step).limited) return step;
  }
  return null;
}

/**
 * Why can this unit not move to `to` — the **viewer-scoped** answer (#1025 MR4).
 *
 * This owns NO legality of its own. It resolves through `resolveUnitMoveIntent` (the one
 * omniscient legality+cost source), projects that typed rejection, and then applies the one
 * redaction rule. `getZoneOfControlAt` is consulted only to describe an outcome the executor
 * would produce (a partial move), which the resolver reports as `ok: true`.
 *
 * Owner-scoped, never viewer-scoped, for legality: `civId` is always `unit.owner`, so hot-seat
 * viewing cannot change what a unit may do.
 */
export function getMovementBlockerReason(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: { visibilityState?: VisibilityState } = {},
): MovementBlockerReason | null {
  const unit = state.units[unitId];
  if (!unit) return null;

  const resolution = resolveUnitMoveIntent(state, unitId, to, {
    actor: 'player',
    civId: unit.owner,
  });

  if (!resolution.ok) {
    if (resolution.reason === 'missing-unit') return null;
    return redactMovementRejectionForViewer(
      { code: resolution.reason, message: resolution.message },
      options.visibilityState,
    );
  }

  const stop = findZoneOfControlStop(state, unit, resolution.command.path);
  const destination = resolution.command.to;
  if (stop && hexKey(stop) !== hexKey(destination)) {
    return redactMovementRejectionForViewer(
      {
        code: 'zone-of-control',
        message: 'An enemy nearby would stop your unit before it reaches that tile.',
      },
      options.visibilityState,
    );
  }

  return null;
}

function normalizeOccupants(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
export function getMovementRange(
  unit: Unit,
  map: GameMap,
  unitPositions: Record<string, string | string[]>,
  unitOwners?: Record<string, string>,
  hostileOwners?: Set<string>,
  options: UnitMovementContext = {},
  blockingKeys?: ReadonlySet<string>,
): HexCoord[] {
  const reachable: HexCoord[] = [];
  const visited = new Map<string, number>();
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];

  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(current.coord, map.width)
      : hexNeighbors(current.coord);

    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = map.tiles[key];
      if (!tile || !isPassableForUnitInContext(unit, tile.terrain, options)) continue;

      const cost = getMovementStepCost(unit, map, current.coord, neighbor, options);
      const remaining = current.remaining - cost;

      // Forced march: if this is a direct neighbor of the start position and the unit
      // has ≥1 movement remaining, allow entry even when the tile cost exceeds remaining points.
      const isFromStartPosition = hexKey(current.coord) === hexKey(unit.position);
      const forcedMarch = isFromStartPosition && current.remaining >= 1 && remaining < 0;

      if (remaining < 0 && !forcedMarch) continue;

      const effectiveRemaining = forcedMarch ? 0 : remaining;

      const occupants = normalizeOccupants(unitPositions[key]).filter(id => id !== unit.id);
      if (occupants.length > 0) {
        const isNeutralOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          return Boolean(owner) && owner !== unit.owner
            && hostileOwners !== undefined && !hostileOwners.has(owner!);
        };
        const isHostileOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          if (!owner || owner === unit.owner) return false;
          return hostileOwners !== undefined ? hostileOwners.has(owner) : true;
        };

        if (occupants.some(isNeutralOccupant)) continue;

        if (occupants.some(isHostileOccupant)) {
          const prevRemaining = visited.get(key) ?? -1;
          if (effectiveRemaining > prevRemaining) {
            visited.set(key, effectiveRemaining);
            reachable.push(neighbor);
          }
          continue;
        }
      }

      // A blocking map entity (e.g. a foreign, unallied city -- see
      // `getBlockingMapEntityAt`/`getBlockingMapEntityKeys`) is only ever reachable (for
      // adjacent tap-to-assault highlighting) when the unit is ALREADY directly adjacent to
      // it before this action, exactly like how Zone of Control already restricts a hostile
      // unit's own tile to direct-adjacency-only. Without the `isFromStartPosition` gate this
      // would be "reachable" from arbitrarily far away, which is the #843 bug.
      if (blockingKeys?.has(key)) {
        if (isFromStartPosition) {
          const prevRemaining = visited.get(key) ?? -1;
          if (effectiveRemaining > prevRemaining) {
            visited.set(key, effectiveRemaining);
            reachable.push(neighbor);
          }
        }
        continue;
      }

      const prevRemaining = visited.get(key) ?? -1;
      if (effectiveRemaining > prevRemaining) {
        visited.set(key, effectiveRemaining);
        reachable.push(neighbor);
        if (effectiveRemaining > 0) {
          queue.push({ coord: neighbor, remaining: effectiveRemaining });
        }
      }
    }
  }

  return reachable;
}

export interface MovementRangeDetails {
  reachable: HexCoord[];
  zocLimited: HexCoord[];
}

export function getMovementRangeDetails(
  state: Readonly<GameState>,
  unitId: string,
): MovementRangeDetails {
  const unit = state.units[unitId];
  if (!unit) return { reachable: [], zocLimited: [] };
  const unitPositions: Record<string, string | string[]> = {};
  const unitOwners: Record<string, string> = {};
  for (const candidate of Object.values(state.units)) {
    const key = hexKey(candidate.position);
    const existing = unitPositions[key];
    unitPositions[key] = existing ? [...(Array.isArray(existing) ? existing : [existing]), candidate.id] : candidate.id;
    unitOwners[candidate.id] = candidate.owner;
  }
  const hostileOwners = new Set(Object.values(state.units)
    .filter(candidate => isHostileOwnerTo(state, unit.owner, candidate.owner))
    .map(candidate => candidate.owner));
  const reachable: HexCoord[] = [];
  const zocLimited: HexCoord[] = [];
  const visited = new Map<string, number>();
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];
  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = state.map.wrapsHorizontally
      ? getWrappedHexNeighbors(current.coord, state.map.width)
      : hexNeighbors(current.coord);
    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = state.map.tiles[key];
      if (!tile || !isPassableForUnitInContext(unit, tile.terrain, {
        completedTechs: state.civilizations[unit.owner]?.techState.completed ?? [],
      })) continue;
      const cost = getMovementStepCost(unit, state.map, current.coord, neighbor, {
        completedTechs: state.civilizations[unit.owner]?.techState.completed ?? [],
      });
      const remaining = current.remaining - cost;
      const fromStart = hexKey(current.coord) === startKey;
      const forcedMarch = fromStart && current.remaining >= 1 && remaining < 0;
      if (remaining < 0 && !forcedMarch) continue;
      const effectiveRemaining = forcedMarch ? 0 : remaining;
      const occupants = normalizeOccupants(unitPositions[key]).filter(id => id !== unit.id);
      const neutralOccupant = occupants.some(id => {
        const owner = unitOwners[id];
        return Boolean(owner) && owner !== unit.owner && !hostileOwners.has(owner);
      });
      if (neutralOccupant) continue;
      const hostileOccupant = occupants.some(id => {
        const owner = unitOwners[id];
        return Boolean(owner) && owner !== unit.owner && hostileOwners.has(owner);
      });
      const blockingEntity = getBlockingMapEntityAt(state, unit, neighbor);
      // A blocking map entity's own tile is only ever "reachable" (for tap-to-assault) when
      // the unit is ALREADY directly adjacent to it before this action -- never via a
      // multi-hop approach. This matches how Zone of Control already prevents a hostile
      // unit's own tile from being added except from direct adjacency (any multi-hop
      // approach must first cross a ZOC-limited tile one hex short, which is terminal and
      // never enqueued). Cities/camps radiate no ZOC of their own, so without this explicit
      // fromStart gate they would be "reachable" from arbitrarily far away whenever movement
      // points allowed -- exactly the #843 bug (a distant city looked tap-able, but tapping
      // it while not yet adjacent produced a confusing rejection instead of a move).
      //
      // #965: a pirate coastal-enclave has NO land tap-action (it is razed only by
      // a warship from the sea), so unlike a city/camp its anchor is never a
      // reachable tap target -- exclude it even from direct adjacency so the tap
      // falls through to the plain "assault it by sea" explanation.
      if (blockingEntity && (!fromStart || blockingEntity.reason === 'pirate-enclave')) continue;
      const zoc = !hostileOccupant && !blockingEntity && getZoneOfControlAt(state, unit, neighbor).limited;
      const terminal = hostileOccupant || Boolean(blockingEntity) || zoc;
      const previous = visited.get(key) ?? -1;
      if (effectiveRemaining <= previous) continue;
      visited.set(key, effectiveRemaining);
      reachable.push(neighbor);
      if (zoc) zocLimited.push(neighbor);
      if (!terminal && effectiveRemaining > 0) {
        queue.push({ coord: neighbor, remaining: effectiveRemaining });
      }
    }
  }
  return { reachable, zocLimited };
}
