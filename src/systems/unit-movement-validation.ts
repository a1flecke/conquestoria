import type { GameState, HexCoord, UnitType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { canHullEnterOcean, getMovementCostForUnitInContext, getMovementStepCost } from '@/systems/unit-movement-cost';
import { getBlockingMapEntityAt, BLOCKING_MAP_ENTITY_MESSAGES, type UnitMovementBlockerCode, type BlockingMapEntity } from '@/systems/unit-movement-legality';
import { findPath } from '@/systems/unit-pathfinding';

/**
 * Movement validation (#1025 / #1010) — the ONE legality + cost answer for ordinary
 * unit movement. Deliberately **omniscient**: it sees the whole `GameState`, because it
 * is what the executor trusts. The viewer-scoped projection of these rejections lives in
 * `unit-movement-queries.ts` (`getMovementBlockerReason`), never here — see #1002.
 *
 * Extracted from `unit-movement-system.ts` so the explainer can depend on it without the
 * cycle `queries → unit-movement-system → unit-system(barrel) → queries`
 * (`moveUnitWithZoneOfControl` genuinely lives in `unit-system.ts`, so that edge cannot go).
 * `unit-movement-system.ts` re-exports everything here for its existing importers.
 */

export type ExecuteUnitMoveOptions =
  | {
      actor: 'player' | 'automation' | 'ai';
      civId: string;
      bus?: EventBus;
      foreignCityEntryId?: string;
    }
  | {
      actor: 'world';
      bus?: EventBus;
    };

declare const validatedUnitMoveBrand: unique symbol;

/**
 * An ordinary-movement command that has passed `resolveUnitMoveIntent` — the
 * canonical legality + cost check for the movement family (#1025). Only
 * `resolveUnitMoveIntent` can produce one (`validatedUnitMoveBrand` is an
 * un-nameable `unique symbol`, so no other module can construct this shape), and
 * `executeValidatedUnitMove` is the only executor that consumes one. A new
 * movement executor goes through this pair, never `moveUnitWithZoneOfControl`
 * directly — see `.claude/rules/movement-actions.md` and the `check-src-edit`
 * source rule that enforces it.
 */
export interface ValidatedUnitMove {
  readonly [validatedUnitMoveBrand]: true;
  readonly unitId: string;
  readonly from: HexCoord;
  readonly to: HexCoord;
  readonly path: HexCoord[];
  readonly cost: number;
  readonly options: ExecuteUnitMoveOptions;
}

/** The typed rejection shape shared by validation and execution. */
export type MovementRejection = {
  ok: false;
  from: HexCoord;
  to: HexCoord;
  path: HexCoord[];
  reason: UnitMovementBlockerCode | 'missing-unit';
  message: string;
  revealedTiles: [];
  discoveredWonders: [];
};

export type UnitMoveValidationResult =
  | { ok: true; from: HexCoord; to: HexCoord; path: HexCoord[]; cost: number }
  | MovementRejection;

/**
 * Either a `command` an executor can run, or a typed rejection carrying
 * player-facing `message` copy. Previews, AI and executors all consult this one
 * function rather than recomputing movement legality/cost independently.
 */
export type MoveResolution =
  | { ok: true; command: ValidatedUnitMove }
  | MovementRejection;

export function movementFailure(
  from: HexCoord,
  to: HexCoord,
  path: HexCoord[],
  reason: UnitMovementBlockerCode | 'missing-unit',
  message: string,
): MovementRejection {
  return {
    ok: false,
    from,
    to,
    path,
    reason,
    message,
    revealedTiles: [],
    discoveredWonders: [],
  };
}

export function getOwnerCompletedTechs(state: GameState, owner: string): string[] {
  return state.civilizations[owner]?.techState.completed ?? [];
}

export function getImpassableReason(
  unitType: UnitType,
  terrain: string,
): { reason: UnitMovementBlockerCode; message: string } {
  const domain = UNIT_DEFINITIONS[unitType]?.domain ?? 'land';
  if (domain === 'naval' && terrain === 'ocean' && !canHullEnterOcean(unitType)) {
    return {
      reason: 'requires-ocean-hull',
      message: "This ship can't survive the open sea — upgrade it to go further.",
    };
  }
  if (terrain === 'ocean' || terrain === 'coast') {
    return { reason: 'impassable-water', message: 'Land units cannot cross water yet.' };
  }
  return { reason: 'impassable-terrain', message: 'This terrain cannot be entered.' };
}

export function normalizeDestination(state: GameState, coord: HexCoord): HexCoord {
  if (!state.map.wrapsHorizontally) return { ...coord };
  return { ...coord, q: ((coord.q % state.map.width) + state.map.width) % state.map.width };
}

export function validateUnitMove(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: ExecuteUnitMoveOptions,
): UnitMoveValidationResult {
  const unit = state.units[unitId];
  if (!unit) return movementFailure(to, to, [to], 'missing-unit', 'Unit not found');

  const from = { ...unit.position };
  const target = normalizeDestination(state, to);
  if (unit.transportId) {
    return movementFailure(from, target, [from], 'occupied', 'Loaded units cannot move until they unload.');
  }

  const tile = state.map.tiles[hexKey(target)];
  if (!tile) return movementFailure(from, target, [from], 'unknown-tile', 'Too far away to spot.');

  const blockingEntity = getBlockingMapEntityAt(state, unit, target);
  if (
    blockingEntity
    && (options.actor === 'world' || options.foreignCityEntryId !== blockingEntity.entityId)
  ) {
    return movementFailure(
      from,
      target,
      [from, target],
      blockingEntity.reason,
      BLOCKING_MAP_ENTITY_MESSAGES[blockingEntity.reason],
    );
  }

  const completedTechs = getOwnerCompletedTechs(state, unit.owner);
  const targetCost = getMovementCostForUnitInContext(unit, tile.terrain, { completedTechs });
  if (targetCost === Infinity) {
    const blocker = getImpassableReason(unit.type, tile.terrain);
    return movementFailure(from, target, [from, target], blocker.reason, blocker.message);
  }

  const occupancy = buildUnitOccupancy(state.units);
  const occupants = getUnitIdsAtCoord(occupancy, target).filter(id => id !== unitId);
  const hasHostileOccupant = occupants.some(id => occupancy.ownersByUnitId[id] !== unit.owner);
  if (hasHostileOccupant) {
    return movementFailure(from, target, [from, target], 'occupied', 'An enemy unit is blocking the way.');
  }

  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const path = findPath(from, target, state.map, domain, { unit, completedTechs });
  if (!path) return movementFailure(from, target, [from], 'unreachable', 'No passable route to that tile.');
  const pathCrossesHostileOccupant = path.slice(1, -1).some(coord =>
    getUnitIdsAtCoord(occupancy, coord).some(id =>
      id !== unitId && occupancy.ownersByUnitId[id] !== unit.owner));
  if (pathCrossesHostileOccupant) {
    return movementFailure(
      from,
      target,
      path,
      'occupied',
      'An enemy unit is blocking the way.',
    );
  }
  let blockedPathEntity: BlockingMapEntity | undefined;
  for (const coord of path.slice(1)) {
    const entity = getBlockingMapEntityAt(state, unit, coord);
    if (!entity) continue;
    const isExplicitEntryToThisEntity = options.actor !== 'world'
      && options.foreignCityEntryId === entity.entityId
      && hexKey(coord) === hexKey(target);
    if (!isExplicitEntryToThisEntity) {
      blockedPathEntity = entity;
      break;
    }
  }
  if (blockedPathEntity) {
    return movementFailure(
      from,
      target,
      path,
      blockedPathEntity.reason,
      BLOCKING_MAP_ENTITY_MESSAGES[blockedPathEntity.reason],
    );
  }

  const visibility = options.actor === 'world'
    ? undefined
    : state.civilizations[options.civId]?.visibility;
  const isPlayerControlledMove = options.actor !== 'automation'
    && options.actor !== 'ai'
    && options.actor !== 'world';
  if (
    isPlayerControlledMove
    && visibility
    && path.length > 2
    && path.slice(1).some(coord => getVisibility(visibility, coord) === 'unexplored')
  ) {
    return movementFailure(from, target, path, 'unexplored', 'Move one step at a time into unexplored territory.');
  }

  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    cost += getMovementStepCost(unit, state.map, path[i - 1]!, path[i]!, { completedTechs });
  }

  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(from, target, state.map.width)
    : hexDistance(from, target);
  const forcedMarch = distance === 1 && unit.movementPointsLeft >= 1 && cost > unit.movementPointsLeft;
  if (!forcedMarch && cost > unit.movementPointsLeft) {
    return movementFailure(from, target, path, 'insufficient-movement', 'Not enough movement left this turn.');
  }

  return { ok: true, from, to: target, path, cost };
}

/**
 * Canonical movement resolver (#1025): validate a move intent and either hand
 * back a `ValidatedUnitMove` command or a typed rejection with player-facing
 * copy. This is the single source of truth the preview, the AI and the executor
 * share — nothing recomputes movement legality or cost on its own.
 */
export function resolveUnitMoveIntent(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: ExecuteUnitMoveOptions,
): MoveResolution {
  const validation = validateUnitMove(state, unitId, to, options);
  if (!validation.ok) return validation;
  return {
    ok: true,
    command: {
      unitId,
      from: validation.from,
      to: validation.to,
      path: validation.path,
      cost: validation.cost,
      options,
    } as ValidatedUnitMove,
  };
}
