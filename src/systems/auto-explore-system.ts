import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, hexNeighbors, getWrappedHexNeighbors } from '@/systems/hex-utils';
import { isThreatenedByVisibleHostiles } from '@/systems/movement-safety';
import { buildUnitOccupancy, getStackRelationship } from '@/systems/unit-occupancy';
import { getMovementCost, getMovementRange } from '@/systems/unit-system';
import { executeUnitMove, type ExecuteUnitMoveResult } from '@/systems/unit-movement-system';

export interface AutoExploreOrder {
  unitId: string;
  to: HexCoord;
  reason: string;
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

function rankCandidate(state: GameState, unitId: string, coord: HexCoord): { score: number; reason: string } | null {
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
  const recencyPenalty = unit.automation?.lastTargets.includes(hexKey(coord)) ? 500 : 0;
  const tieBreaker = (coord.r * 100) + coord.q;

  return {
    score: visibilityScore + frontierScore - recencyPenalty - tieBreaker,
    reason: visibility === 'unexplored' ? 'unexplored safe tile' : 'safe frontier tile',
  };
}

export function chooseAutoExploreMove(state: GameState, unitId: string): AutoExploreOrder | null {
  const unit = state.units[unitId];
  if (!unit?.automation || unit.automation.mode !== 'auto-explore') {
    return null;
  }

  const occupancy = buildUnitOccupancy(state.units);
  const best = getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId)
    .map(coord => ({ coord, rank: rankCandidate(state, unitId, coord) }))
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
  options: { bus?: EventBus } = {},
): ExecuteUnitMoveResult | null {
  const unit = state.units[unitId];
  if (!unit?.automation || unit.automation.mode !== 'auto-explore') {
    return null;
  }

  const order = chooseAutoExploreMove(state, unitId);
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
