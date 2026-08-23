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
 * penalties clear only once `FIELD_RECOVERY_OWNER_TURNS` consecutive
 * supplied owner-turns without attacking have actually elapsed (contract
 * §8) — the transition is gated on the real counter rather than assumed,
 * so a future balance change to `FIELD_RECOVERY_OWNER_TURNS` is honored
 * instead of silently ignored (an earlier draft always cleared to `'full'`
 * the moment `isSupplied` was true, which only *looked* correct because
 * the constant happens to currently be 1).
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
  if (suppliedTurnsSinceRecovery >= FIELD_RECOVERY_OWNER_TURNS) {
    return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
  }
  // Deterioration stops immediately (contract §8: "stops immediately") —
  // freeze the current stage/penalty and the hostile counter rather than
  // continuing to worsen, but don't clear the stage until the field-
  // recovery threshold above is actually met.
  return { state: current.state, hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery };
}
