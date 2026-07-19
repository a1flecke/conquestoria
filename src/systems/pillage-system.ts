import type { GameState, HexTile, ImprovementType } from '@/core/types';
import { IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';

/** Deliberately flat, non-era-scaled — matches calculateDefeatReward's baseGold
 * convention (combat-reward-system.ts). Subject to the pacing-audit gate, not
 * fixed by this file; update this single constant to retune, never add a
 * second per-improvement gold table. */
export const GOLD_PER_PILLAGE_BUILD_TURN = 3;

export function getPillageGoldReward(improvement: ImprovementType): number {
  return Math.round(IMPROVEMENT_BUILD_TURNS[improvement] * GOLD_PER_PILLAGE_BUILD_TURN);
}

/** A tile can be pillaged only if it is not currently owned by the pillaging
 * unit's own civ (covers enemy, unclaimed/null, and barbarian-owned tiles
 * uniformly) and has a finished improvement and/or a road. */
export function canPillageTile(tile: HexTile | undefined, unitOwner: string): boolean {
  if (!tile) return false;
  if (tile.owner === unitOwner) return false;
  const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
  return hasFinishedImprovement || Boolean(tile.hasRoad);
}

export type PillageBlockerReason =
  | 'missing-unit'
  | 'no-strength'
  | 'already-acted'
  | 'own-tile'
  | 'nothing-to-pillage';

export interface PillageResult {
  ok: boolean;
  state: GameState;
  reason?: PillageBlockerReason;
  goldAwarded?: number;
  improvementPillaged?: ImprovementType | null;
  roadPillaged?: boolean;
}

/** Burns whatever is on the pillaging unit's tile (finished improvement
 * and/or road) in one action: gold reward, +25 heal (capped at 100), and the
 * unit's action is fully consumed. War declaration (an act-of-war
 * consequence) is the caller's responsibility — this is a pure state
 * transition, reused identically by the player UI, AI civs, and barbarians. */
export function applyPillageToState(state: GameState, unitId: string): PillageResult {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, state, reason: 'missing-unit' };
  if (UNIT_DEFINITIONS[unit.type].strength <= 0) return { ok: false, state, reason: 'no-strength' };
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted' };

  const tileKey = hexKey(unit.position);
  const tile = state.map.tiles[tileKey];
  if (!tile || tile.owner === unit.owner) return { ok: false, state, reason: 'own-tile' };

  const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
  const hasRoad = Boolean(tile.hasRoad);
  if (!hasFinishedImprovement && !hasRoad) return { ok: false, state, reason: 'nothing-to-pillage' };

  const goldAwarded = hasFinishedImprovement ? getPillageGoldReward(tile.improvement) : 0;
  const improvementPillaged = hasFinishedImprovement ? tile.improvement : null;

  const nextTile: HexTile = {
    ...tile,
    improvement: hasFinishedImprovement ? 'none' : tile.improvement,
    improvementTurnsLeft: hasFinishedImprovement ? 0 : tile.improvementTurnsLeft,
    hasRoad: false,
  };

  const civ = state.civilizations[unit.owner];
  const civilizations = civ
    ? { ...state.civilizations, [unit.owner]: { ...civ, gold: civ.gold + goldAwarded } }
    : state.civilizations;

  const units = {
    ...state.units,
    [unitId]: {
      ...unit,
      health: Math.min(100, unit.health + 25),
      hasActed: true,
      movementPointsLeft: 0,
    },
  };

  const nextState: GameState = {
    ...state,
    map: { ...state.map, tiles: { ...state.map.tiles, [tileKey]: nextTile } },
    civilizations,
    units,
  };

  return { ok: true, state: nextState, goldAwarded, improvementPillaged, roadPillaged: hasRoad };
}
