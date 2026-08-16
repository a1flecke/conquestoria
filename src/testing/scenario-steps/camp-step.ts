import type { BarbarianCamp, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { ScenarioError, type CampStep } from '@/testing/scenario-types';

export function applyCampStep(state: GameState, step: CampStep): GameState {
  const key = hexKey(step.position);
  if (!state.map.tiles[key]) throw new ScenarioError(`Invalid coordinate ${key} in camp step`);

  if (!step.unsafe) {
    const occupantUnit = Object.values(state.units).find(unit => hexKey(unit.position) === key);
    const occupantCamp = Object.values(state.barbarianCamps ?? {}).find(camp => hexKey(camp.position) === key);
    if (occupantUnit || occupantCamp) {
      throw new ScenarioError(`Tile ${key} already occupied (pass unsafe: true to override)`);
    }
  }

  const id = `scenario-camp-${state.idCounters.nextCampId++}`;
  // No canonical constructor exists for an exact-position camp -- spawnBarbarianCamp
  // only picks a random distance-constrained tile. BarbarianCamp is a flat data
  // record with no derived fields, so a direct literal is the correct level here
  // (same justification as the terrain step).
  const camp: BarbarianCamp = {
    id,
    position: { ...step.position },
    strength: 1,
    spawnCooldown: 99, // inert for the scenario's lifetime; scenarios don't advance turns
    ...step.overrides,
  };

  return { ...state, barbarianCamps: { ...(state.barbarianCamps ?? {}), [id]: camp } };
}
