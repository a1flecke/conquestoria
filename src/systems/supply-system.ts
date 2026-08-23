import type { GameState, UnitLandSupplyStatus } from '@/core/types';
import { hexKey } from './hex-utils';
import { unitParticipatesInLandSupply } from './supply-participation';
import { classifyLandSupplyTerritory } from './supply-territory';
import { getLandSupplySourceCoverage } from './supply-sources';
import { getNavalShoreSupplyAssignments } from './supply-naval';
import { advanceOverextensionStage, resolveSupplyRecoveryForUnit } from './supply-progression';

/**
 * Thin composition root — the only supply module `turn-manager.ts` imports
 * directly (#544 MR1). Immutable per `.claude/rules/game-systems.md`:
 * returns a new `GameState` with a spread-copied `units` map, never
 * writing a unit back into the caller's original state object.
 */
export function resolveLandSupplyForCiv(state: GameState, civId: string): GameState {
  const shoreAssignments = getNavalShoreSupplyAssignments(state, civId);
  let units = state.units;
  let changed = false;

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId || unit.transportId) continue;
    if (!unitParticipatesInLandSupply(unit)) continue;

    const tile = state.map.tiles[hexKey(unit.position)];
    const territoryClass = classifyLandSupplyTerritory(state, civId, tile?.owner ?? null);
    const coveredByLandSource = getLandSupplySourceCoverage(state, civId, unit.position);
    const isSupplied = coveredByLandSource || shoreAssignments.has(unit.id);

    const current: UnitLandSupplyStatus = unit.landSupply ?? { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
    const justEnteredBaseTile = tile?.owner === civId && (tile.improvement === 'fort' || Object.values(state.cities).some(city => city.owner === civId && hexKey(city.position) === hexKey(unit.position)));
    // Conservative proxy for MR1: true for any completed action, not only
    // attacking, so it can over-reset field-recovery progress but never
    // under-reset (never lets a unit recover early). See MR1 plan Task 10.
    const attackedThisTurn = unit.hasActed === true;

    const next = isSupplied
      ? resolveSupplyRecoveryForUnit(current, true, justEnteredBaseTile, attackedThisTurn)
      : advanceOverextensionStage(current, territoryClass, false);

    if (next !== current || unit.landSupply === undefined) {
      units = units === state.units ? { ...state.units } : units;
      units[unit.id] = { ...unit, landSupply: next };
      changed = true;
    }
  }

  return changed ? { ...state, units } : state;
}
