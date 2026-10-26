import type { GameState } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';

// The Era 13 ids, built once: the check below runs over every completed tech, and a catalogue `find` per tech made it quadratic.
let era13TechIds: ReadonlySet<string> | null = null;

/** Autonomy begins with the first completed Era 13 technology, not a particular tech id. */
export function isAutonomyActivated(state: GameState, civId: string): boolean {
  const completed = state.civilizations[civId]?.techState?.completed ?? [];
  const era13 = era13TechIds ?? (era13TechIds = new Set(TECH_TREE.filter(tech => tech.era === 13).map(tech => tech.id)));
  return completed.some(techId => era13.has(techId));
}
