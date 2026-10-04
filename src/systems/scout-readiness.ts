// #1237: one answer to "which of this civ's units can go scouting right now?". The Council's
// Scout card is offered only when this finds a unit, and the card's dispatch re-asks the same
// function, so the card can never be offered for a scout the controller would then refuse.
import type { GameState } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

export function findReadyScoutUnitId(state: GameState, civId: string): string | undefined {
  const civ = state.civilizations[civId];
  return civ?.units.find(unitId => {
    const unit = state.units[unitId];
    if (!unit || unit.hasActed || unit.movementPointsLeft <= 0) return false;
    if (unit.automation?.mode === 'auto-explore') return false;
    if (UNIT_DEFINITIONS[unit.type].strength <= 0) return false;
    return true;
  });
}
