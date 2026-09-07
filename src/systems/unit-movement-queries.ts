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

/**
 * Movement queries (#1010). Read-only derived answers for a UI / AI consumer,
 * composed from the cost + legality + pathfinding modules: what tiles can a unit
 * reach this turn (`getMovementRange` / `getMovementRangeDetails`).
 *
 * Admission criterion: everything here mutates nothing and owns no rule of its
 * own. Anything that owns a movement rule belongs in the cost or legality
 * module instead.
 *
 * The player-facing "why is this tap illegal?" answer (`getMovementBlockerReason`)
 * lives in `unit-movement-explainer.ts` — it derives from `resolveUnitMoveIntent`
 * (`unit-movement-validation.ts`), whose deps would cycle back through the
 * `unit-system` barrel if it were re-exported there. The `MovementBlockerReason`
 * type stays here as the shared vocabulary and has no runtime deps.
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

// #1025 MR4: `getMovementBlockerReason` — the viewer-scoped projection of the resolver — moved
// to `unit-movement-explainer.ts`. It depends on `unit-movement-validation.ts`, whose deps
// (`unit-occupancy` → `air-operations-system` → the `unit-system` barrel) would form a cycle
// if it were re-exported through that barrel. The `MovementBlockerReason` type stays here
// because it is also the range/queries vocabulary and has no runtime deps.

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
