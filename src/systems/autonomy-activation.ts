import type { GameState } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';

/** Autonomy begins with the first completed Era 13 technology, not a particular tech id. */
export function isAutonomyActivated(state: GameState, civId: string): boolean {
  const completed = state.civilizations[civId]?.techState?.completed ?? [];
  return completed.some(techId => TECH_TREE.find(tech => tech.id === techId)?.era === 13);
}
