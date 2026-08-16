import type { GameState, Unit } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { hexKey } from '@/systems/hex-utils';
import { ScenarioError, type UnitStep } from '@/testing/scenario-types';

export function applyUnitStep(state: GameState, step: UnitStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in unit step`);

  const key = hexKey(step.position);
  if (!state.map.tiles[key]) throw new ScenarioError(`Invalid coordinate ${key} in unit step`);

  if (!step.unsafe) {
    const occupant = Object.values(state.units).find(unit => hexKey(unit.position) === key);
    if (occupant) {
      throw new ScenarioError(`Tile ${key} already occupied by unit "${occupant.id}" (pass unsafe: true to override)`);
    }
  }

  const civDef = resolveCivDefinition(state, civ.civType);
  const unit: Unit = { ...createUnit(step.type, step.civId, step.position, state.idCounters, civDef?.bonusEffect), ...step.overrides };

  return {
    ...state,
    units: { ...state.units, [unit.id]: unit },
    civilizations: {
      ...state.civilizations,
      [step.civId]: { ...civ, units: [...civ.units, unit.id] },
    },
  };
}
