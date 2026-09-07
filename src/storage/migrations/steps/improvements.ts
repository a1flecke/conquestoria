import type { GameState, ImprovementType } from '@/core/types';
import { IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';

/**
 * Additive validation for serialized tile improvements; safe at every schema
 * version, so it is compatibility normalization rather than a numbered step.
 */

/** Additive validation for serialized tile improvements; safe for every schema version. */
export function normalizeImprovementValues(state: GameState): GameState {
  const tiles = state.map?.tiles;
  if (!tiles) return state;
  let changed = false;
  const nextTiles = { ...tiles };
  for (const [key, tile] of Object.entries(tiles)) {
    const improvement = tile.improvement;
    const valid = typeof improvement === 'string' && improvement in IMPROVEMENT_BUILD_TURNS;
    const normalized = valid ? improvement as ImprovementType : 'none';
    const maxTurns = IMPROVEMENT_BUILD_TURNS[normalized];
    const turns = Number.isInteger(tile.improvementTurnsLeft) && tile.improvementTurnsLeft >= 0
      ? Math.min(tile.improvementTurnsLeft, maxTurns) : 0;
    if (normalized !== improvement || turns !== tile.improvementTurnsLeft) {
      nextTiles[key] = { ...tile, improvement: normalized, improvementTurnsLeft: turns };
      changed = true;
    }
  }
  return changed ? { ...state, map: { ...state.map, tiles: nextTiles } } : state;
}
