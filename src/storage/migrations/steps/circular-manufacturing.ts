import type { GameState } from '@/core/types';
import { CIRCULAR_MANUFACTURING_MATERIALS } from '@/systems/national-project-system';

/**
 * Schema 7 — persist only valid, actually-built Circular Manufacturing choices.
 */

/** Schema 7: persist only valid, actually-built Circular Manufacturing choices. */
export function migrateCircularManufacturingChoices(state: GameState): GameState {
  const nationalProjectChoices: NonNullable<GameState['nationalProjectChoices']> = {};
  for (const [key, value] of Object.entries(state.nationalProjectChoices ?? {})) {
    if (!state.builtNationalProjects?.[key]) continue;
    if (!CIRCULAR_MANUFACTURING_MATERIALS.includes(value as typeof CIRCULAR_MANUFACTURING_MATERIALS[number])) continue;
    nationalProjectChoices[key] = value as typeof CIRCULAR_MANUFACTURING_MATERIALS[number];
  }
  return { ...state, nationalProjectChoices };
}
