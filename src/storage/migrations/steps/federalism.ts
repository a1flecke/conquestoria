import type { GameState } from '@/core/types';

/**
 * Schema 25 (#927 Rung 6) — Federal Autonomy added `federalismEnabled` /
 * `federalismChangedTurn` to `Civilization`.
 *
 * CORRUPTION REPAIR, not a real versioning step: both fields are optional and
 * absent already means "centralized" everywhere they are read, so this is a
 * no-op for every save the game itself wrote. It exists purely to scrub a
 * malformed hand-edited value (wrong type, or a non-integer / negative
 * `federalismChangedTurn`) rather than let it silently corrupt the lock-turn
 * arithmetic. No toggle event or revenue mutation fires on load.
 */
export function repairFederalismFields(state: GameState): GameState {
  return {
    ...state,
    civilizations: Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => {
      const enabled = typeof civ.federalismEnabled === 'boolean' ? civ.federalismEnabled : undefined;
      const changedTurn = Number.isInteger(civ.federalismChangedTurn) && (civ.federalismChangedTurn as number) >= 0
        ? civ.federalismChangedTurn : undefined;
      if (enabled === civ.federalismEnabled && changedTurn === civ.federalismChangedTurn) return [civId, civ];
      return [civId, { ...civ, federalismEnabled: enabled, federalismChangedTurn: changedTurn }];
    })),
  };
}
