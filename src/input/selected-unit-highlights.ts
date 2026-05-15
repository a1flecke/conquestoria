import type { GameState, HexCoord } from '@/core/types';
import type { HexHighlight } from '@/renderer/render-loop';
import { getAttackTargets, type AttackTarget } from '@/systems/attack-targeting';
import { hexKey } from '@/systems/hex-utils';
import { buildUnitOccupancy } from '@/systems/unit-occupancy';
import { getMovementRange } from '@/systems/unit-system';

export interface SelectedUnitHighlightResult {
  movementRange: HexCoord[];
  attackTargets: AttackTarget[];
  highlights: HexHighlight[];
}

export function buildSelectedUnitHighlights(state: GameState, unitId: string): SelectedUnitHighlightResult {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== state.currentPlayer) {
    return { movementRange: [], attackTargets: [], highlights: [] };
  }

  const occupancy = buildUnitOccupancy(state.units);
  const movementRange = getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId);
  const attackTargets = getAttackTargets(state, unit, { viewerId: state.currentPlayer })
    .filter(target => target.result.targetType === 'unit');
  const attackKeys = new Set(attackTargets.map(target => hexKey(target.coord)));

  const moveHighlights = movementRange
    .filter(coord => !attackKeys.has(hexKey(coord)))
    .map(coord => ({ coord, type: 'move' as const }));

  const attackHighlights = attackTargets.map(target => ({ coord: target.coord, type: 'attack' as const }));

  return {
    movementRange,
    attackTargets,
    highlights: [...moveHighlights, ...attackHighlights],
  };
}
