import type { GameState } from '@/core/types';
import type { CivTurn, CivRoster } from './types';

/**
 * The civ's units and city positions as they stand after standing orders, for diplomacy drift and vision.
 */
export function snapshotCivRoster(state: GameState, turn: CivTurn): CivRoster {
  const { civ } = turn;

  // Get civ units for visibility and diplomacy
  const civUnits = civ.units
    .map(id => state.units[id])
    .filter((u): u is NonNullable<typeof u> => u !== undefined);
  const cityPositions = civ.cities
    .map(id => state.cities[id]?.position)
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  return { civUnits, cityPositions };
}
