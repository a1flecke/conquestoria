import type { Civilization, GameState } from '@/core/types';

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

const MANHATTAN_PROJECT_BASE_CAPACITY = 1;

/**
 * Every building that contributes to the shared arsenal capacity ceiling.
 * Add a new capacity source by appending a row here -- never by adding
 * another `if (city.buildings.includes(...))` branch to the resolver below.
 */
const ARSENAL_CAPACITY_SOURCES: ReadonlyArray<{ buildingId: string; capacity: number }> = [
  { buildingId: 'nuclear_arsenal', capacity: 2 },
  { buildingId: 'missile_silo', capacity: 1 },
];

/**
 * Shared empire-wide warhead capacity ceiling (#545 spec §1). Zero until
 * Manhattan Project is complete -- capacity-granting buildings are inert
 * without it, proven by the "0 with buildings present but no Manhattan
 * Project" test above. Computed live from current buildings every call;
 * never stored on GameState, so there is nothing to invalidate when a
 * building is lost or the superweapons setting (MR7) is toggled.
 */
export function getStrategicArsenalCapacity(state: GameState, civId: string): number {
  if (!hasManhattanProject(state, civId)) return 0;

  const civ = state.civilizations[civId];
  if (!civ) return 0;

  let capacity = MANHATTAN_PROJECT_BASE_CAPACITY;
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    for (const source of ARSENAL_CAPACITY_SOURCES) {
      if (city.buildings.includes(source.buildingId)) capacity += source.capacity;
    }
  }
  return capacity;
}

/**
 * The one canonical read of a civ's warhead count. Legacy saves (and any
 * civ that has never produced a warhead) have no strategicArsenal field --
 * absent means zero, never undefined-propagates to a caller.
 */
export function getStrategicArsenal(civ: Civilization): number {
  return civ.strategicArsenal ?? 0;
}

/**
 * Completion side-effect for the `warhead` production item (turn-manager.ts calls
 * this when result.completedBuilding === 'warhead', mirroring the existing
 * sacred_council/circular_manufacturing_network completion-hook precedent at that
 * same call site). Immutable per .claude/rules/game-systems.md; a no-op for an
 * unknown civ id rather than throwing, matching this file's other defensive reads.
 */
export function addWarheadToArsenal(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, strategicArsenal: getStrategicArsenal(civ) + 1 },
    },
  };
}
