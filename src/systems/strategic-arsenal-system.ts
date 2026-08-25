import type { GameState } from '@/core/types';

const MANHATTAN_PROJECT_ID = 'manhattan_project';

/**
 * Manhattan Project is a milestone national project (#545 -- see this
 * building's definition in city-system.ts) -- once built it never expires,
 * so "has it" is a thin, permanent query against builtNationalProjects, not
 * a separate persisted flag that could drift out of sync.
 */
export function hasManhattanProject(state: GameState, civId: string): boolean {
  return state.builtNationalProjects?.[`${civId}:${MANHATTAN_PROJECT_ID}`] !== undefined;
}
