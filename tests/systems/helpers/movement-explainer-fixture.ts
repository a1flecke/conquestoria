import type { GameMap, GameState, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-system';

/**
 * Wraps a bare `Unit` + `GameMap` in the minimal `GameState` that
 * `getMovementBlockerReason` needs after #1025 MR4 changed its signature. Every tile is
 * `visible` to the unit's owner unless `visibility` overrides it, so migrated tests keep
 * their original (unredacted) expectations.
 */
export function explainerState(
  unit: Unit,
  map: GameMap,
  options: { completedTechs?: string[]; extraUnits?: Unit[] } = {},
): GameState {
  const units: Record<string, Unit> = { [unit.id]: unit };
  for (const extra of options.extraUnits ?? []) units[extra.id] = extra;
  const owners = Array.from(new Set(Object.values(units).map(u => u.owner)));
  const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(k => [k, 'visible' as const])) };
  return {
    turn: 1, era: 1, gameId: 'explainer-fixture', currentPlayer: unit.owner,
    gameOver: false, winner: null, map, units, cities: {}, barbarianCamps: {}, tribalVillages: {},
    civilizations: Object.fromEntries(owners.map(owner => [owner, {
      id: owner, name: owner, color: '#4a90d9', isHuman: owner === unit.owner, civType: 'generic',
      cities: [], units: Object.values(units).filter(u => u.owner === owner).map(u => u.id),
      techState: {
        completed: owner === unit.owner ? (options.completedTechs ?? []) : [],
        currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {},
      },
      gold: 0, visibility, knownCivilizations: [], score: 0,
      diplomacy: createDiplomacyState(owners, owner),
    }])),
  } as unknown as GameState;
}

// Explicit re-export path helper so the exact hexKey string form stays consistent
// with production (`q,r`, no spaces).
export { hexKey };
