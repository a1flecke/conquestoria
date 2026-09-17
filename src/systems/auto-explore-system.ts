import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, hexDistance, hexNeighbors, getWrappedHexNeighbors } from '@/systems/hex-utils';
import { isThreatenedByVisibleHostiles } from '@/systems/movement-safety';
import { buildUnitOccupancy, getStackRelationship } from '@/systems/unit-occupancy';
import {
  getMovementCost,
  getMovementCostForUnitInContext,
  getMovementRange,
  getBlockingMapEntityKeys,
} from '@/systems/unit-system';
import { executeUnitMove, type ExecuteUnitMoveResult } from '@/systems/unit-movement-system';

export interface AutoExploreOrder {
  unitId: string;
  to: HexCoord;
  reason: string;
}

/**
 * Bounds `findNearestUnexploredTile`'s search to within `maxDistance` of `anchor`.
 * Only ever supplied by the AI's administrative idle-explorer caller
 * (`ai-exploration.ts`'s `computeAdministrativeExploreLeash`) -- the player's own
 * auto-explore button always calls this module unleashed, exactly as before #1066.
 * See that module for why a leash exists at all.
 */
export interface AutoExploreLeash {
  anchor: HexCoord;
  maxDistance: number;
}

function canAutoExploreEnter(state: GameState, unitId: string, coord: HexCoord): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  const occupancy = buildUnitOccupancy(state.units);
  return !getStackRelationship(occupancy, unit, coord).hasHostileBlocker;
}

function countUnexploredNeighbors(state: GameState, viewerId: string, coord: HexCoord): number {
  const viewer = state.civilizations[viewerId];
  if (!viewer) {
    return 0;
  }

  const neighbors = state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(coord, state.map.width)
    : hexNeighbors(coord);

  return neighbors.reduce((count, neighbor) => {
    if (!state.map.tiles[hexKey(neighbor)]) {
      return count;
    }
    return count + (getVisibility(viewer.visibility, neighbor) === 'unexplored' ? 1 : 0);
  }, 0);
}

/**
 * #1066: a small local pocket of already-`fog`/`visible` tiles with no frontier signal
 * anywhere inside it (e.g. a city's own initial vision radius) can permanently trap a
 * unit in a position cycle -- `rankCandidate`'s only prior anti-cycling signal,
 * `recencyPenalty`, only remembers the last 4 destinations, so a cycle of period 5 or
 * more always looks "fresh" again by the time it recurs. Widening that memory does NOT
 * fix the underlying class of bug -- it only produces a proportionally larger cycle
 * (empirically confirmed against a reproducing fixture at window sizes 4, 8, and 12; see
 * `docs/superpowers/specs/2026-09-17-issue-1066-auto-explore-recency-trap-design.md`
 * Section 7.1), because a purely memory-based signal has no way to prefer a direction
 * that leads toward genuinely new territory over one that simply hasn't been visited
 * *recently*.
 *
 * `findNearestUnexploredTile` gives the chooser real multi-hop lookahead instead: a
 * bounded BFS, over already-known passable terrain only, for the nearest tile this civ
 * has never seen. `EXPLORE_TARGET_SEARCH_RADIUS` only needs to comfortably exceed any
 * locally-enclosed already-explored pocket a hex map can realistically produce (a
 * categorically easier property than "large enough to prevent any cycle", which no
 * finite recency window can guarantee) -- bounded, not a full-map scan.
 */
export const EXPLORE_TARGET_SEARCH_RADIUS = 16;

function findNearestUnexploredTile(state: GameState, unitId: string, leash?: AutoExploreLeash): HexCoord | null {
  const unit = state.units[unitId];
  const viewer = state.civilizations[unit?.owner ?? ''];
  if (!unit || !viewer) return null;

  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const isPassable = (coord: HexCoord): boolean => {
    const tile = state.map.tiles[hexKey(coord)];
    return tile !== undefined
      && Number.isFinite(getMovementCostForUnitInContext(unit, tile.terrain, { completedTechs }));
  };
  const neighborsOf = (coord: HexCoord): HexCoord[] => state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(coord, state.map.width)
    : hexNeighbors(coord);

  const visited = new Set([hexKey(unit.position)]);
  let frontier: HexCoord[] = [unit.position];
  for (let step = 0; step < EXPLORE_TARGET_SEARCH_RADIUS && frontier.length > 0; step++) {
    const next: HexCoord[] = [];
    for (const current of frontier) {
      for (const neighbor of neighborsOf(current)) {
        const key = hexKey(neighbor);
        if (visited.has(key) || !state.map.tiles[key]) continue;
        visited.add(key);
        if (getVisibility(viewer.visibility, neighbor) === 'unexplored') {
          if (leash && hexDistance(neighbor, leash.anchor) > leash.maxDistance) continue;
          if (isPassable(neighbor)) return neighbor;
          // An unexplored but impassable tile (e.g. ocean) reveals no walkable
          // destination -- keep searching without expanding through it.
          continue;
        }
        if (isPassable(neighbor)) next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

function rankCandidate(
  state: GameState,
  unitId: string,
  coord: HexCoord,
  exploreTarget: HexCoord | null,
): { score: number; reason: string } | null {
  const unit = state.units[unitId];
  const viewer = state.civilizations[unit.owner];
  if (!unit || !viewer) {
    return null;
  }

  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || getMovementCost(tile.terrain) > unit.movementPointsLeft || !canAutoExploreEnter(state, unitId, coord)) {
    return null;
  }

  if (isThreatenedByVisibleHostiles(state, unit.owner, coord)) {
    return null;
  }

  const visibility = getVisibility(viewer.visibility, coord);
  const visibilityScore = visibility === 'unexplored' ? 200 : visibility === 'fog' ? 100 : 0;
  const frontierScore = countUnexploredNeighbors(state, unit.owner, coord) * 10;
  const recencyPenalty = unit.automation?.mode === 'auto-explore' && unit.automation.lastTargets.includes(hexKey(coord)) ? 500 : 0;
  const tieBreaker = (coord.r * 100) + coord.q;
  // Dominates recencyPenalty/tieBreaker whenever a real target is known, so the chooser
  // commits toward it instead of oscillating among locally-tied, already-seen tiles;
  // contributes nothing when no target was found within the bounded search.
  const targetScore = exploreTarget ? -hexDistance(coord, exploreTarget) * 1000 : 0;

  return {
    score: visibilityScore + frontierScore + targetScore - recencyPenalty - tieBreaker,
    reason: visibility === 'unexplored' ? 'unexplored safe tile' : 'safe frontier tile',
  };
}

export function chooseAutoExploreMove(state: GameState, unitId: string, leash?: AutoExploreLeash): AutoExploreOrder | null {
  const unit = state.units[unitId];
  if (!unit?.automation || unit.automation.mode !== 'auto-explore') {
    return null;
  }

  const occupancy = buildUnitOccupancy(state.units);
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const blockingKeys = getBlockingMapEntityKeys(state, unit);
  const exploreTarget = findNearestUnexploredTile(state, unitId, leash);
  const best = getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId, undefined, { completedTechs }, blockingKeys)
    // A blocking entity's own tile (e.g. an undefended foreign city) stays in the reachable
    // set for consistency with the rest of the movement system (see getBlockingMapEntityAt),
    // but auto-explore must never nominate it as an ordinary move destination -- entering it
    // requires the explicit assault action, which auto-explore does not perform (#843).
    .filter(coord => !blockingKeys.has(hexKey(coord)))
    .map(coord => ({ coord, rank: rankCandidate(state, unitId, coord, exploreTarget) }))
    .filter((entry): entry is { coord: HexCoord; rank: { score: number; reason: string } } => entry.rank !== null)
    .sort((a, b) => b.rank.score - a.rank.score)[0];

  if (!best) {
    return null;
  }

  return {
    unitId,
    to: best.coord,
    reason: best.rank.reason,
  };
}

export function applyAutoExploreOrder(
  state: GameState,
  unitId: string,
  options: { bus?: EventBus; leash?: AutoExploreLeash } = {},
): ExecuteUnitMoveResult | null {
  const unit = state.units[unitId];
  if (!unit?.automation || unit.automation.mode !== 'auto-explore') {
    return null;
  }

  const order = chooseAutoExploreMove(state, unitId, options.leash);
  if (!order) {
    const { automation: _automation, ...unitWithoutAutomation } = state.units[unitId];
    state.units = {
      ...state.units,
      [unitId]: unitWithoutAutomation,
    };
    return null;
  }

  const result = executeUnitMove(state, unitId, order.to, {
    actor: 'automation',
    civId: unit.owner,
    bus: options.bus,
  });
  if (!result.ok) {
    return result;
  }
  const movedUnit = state.units[unitId];
  if (movedUnit) {
    state.units = {
      ...state.units,
      [unitId]: {
        ...movedUnit,
        automation: {
          mode: 'auto-explore',
          startedTurn: unit.automation.startedTurn,
          lastTargets: [...unit.automation.lastTargets, hexKey(order.to)].slice(-4),
        },
      },
    };
  }
  return result;
}
