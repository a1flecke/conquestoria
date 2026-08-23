import type { LandSupplyState, UnitLandSupplyStatus } from '@/core/types';
import type { LandSupplyTerritoryClass } from './supply-territory';

export type { UnitLandSupplyStatus, LandSupplyState };

export const OVEREXTENSION_STAGE_TURNS = {
  graceEndsAfter: 2,   // turns 1-2 grace
  degradedEndsAfter: 4, // turns 3-4 degraded, 5+ severe
} as const;

function stageForHostileTurns(turns: number): LandSupplyState {
  if (turns <= OVEREXTENSION_STAGE_TURNS.graceEndsAfter) return 'grace';
  if (turns <= OVEREXTENSION_STAGE_TURNS.degradedEndsAfter) return 'degraded';
  return 'severe';
}

/**
 * Extensibility seam, not implemented now: MR4's Great General passive
 * command stabilization (contract §16) "pauses degradation" for nearby
 * units without making them Full Supply — a third input this function
 * doesn't accept yet. It will gain a `stabilizedByGeneral: boolean`
 * parameter in MR4 (defaulting to `false` so MR1-MR3 callers are
 * unaffected).
 */
export function advanceOverextensionStage(
  current: UnitLandSupplyStatus,
  territoryClass: LandSupplyTerritoryClass,
  isSupplied: boolean,
): UnitLandSupplyStatus {
  if (isSupplied) {
    return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: current.suppliedTurnsSinceRecovery };
  }
  if (territoryClass !== 'hostile') {
    return { state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
  }
  const hostileUnsupportedTurns = current.hostileUnsupportedTurns + 1;
  return { state: stageForHostileTurns(hostileUnsupportedTurns), hostileUnsupportedTurns, suppliedTurnsSinceRecovery: 0 };
}

export const FIELD_RECOVERY_OWNER_TURNS = 1;

/**
 * Called only when `isSupplied` is true (caller: `resolveLandSupplyForCiv`)
 * — `advanceOverextensionStage` already handles the "still not supplied"
 * branch. Physically occupying a base tile clears immediately; otherwise
 * penalties clear only after `FIELD_RECOVERY_OWNER_TURNS` consecutive
 * supplied owner-turns without attacking (contract §8).
 */
export function resolveSupplyRecoveryForUnit(
  current: UnitLandSupplyStatus,
  isSupplied: boolean,
  justEnteredBaseTile: boolean,
  attackedThisTurn: boolean,
): UnitLandSupplyStatus {
  if (!isSupplied) return current;
  if (justEnteredBaseTile) {
    return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
  }
  const suppliedTurnsSinceRecovery = attackedThisTurn ? 0 : current.suppliedTurnsSinceRecovery + 1;
  return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery };
}
