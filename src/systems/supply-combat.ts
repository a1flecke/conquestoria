import type { Unit, UnitLandSupplyStatus } from '@/core/types';
import { canHeal } from './unit-healing';

export const OVEREXTENDED_COMBAT_MULTIPLIER = 0.9; // contract §29: -10%, data-driven

export interface LandSupplyCombatPenalty {
  multiplier: number;
  label?: string;
}

/** Mirrors resolveFortificationDefense's { multiplier, label? } shape (fortification-system.ts) so combat-context.ts wires both identically. */
export function resolveLandSupplyCombatPenalty(unit: Pick<Unit, 'landSupply'>): LandSupplyCombatPenalty {
  const state = unit.landSupply?.state;
  if (state !== 'degraded' && state !== 'severe') return { multiplier: 1 };
  return { multiplier: OVEREXTENDED_COMBAT_MULTIPLIER, label: `Overextended -${Math.round((1 - OVEREXTENDED_COMBAT_MULTIPLIER) * 100)}%` };
}

export interface RestAvailability {
  canRest: boolean;
  reason?: string;
}

/**
 * Single source of truth for "can this unit heal by any passive/Rest means
 * right now" — consumed by the real heal-loop gate (`unit-recovery.ts`, the
 * per-civ round phase) and by the Rest action's legality
 * (`getRestActionAvailability` below: panel button state and the executor),
 * so the surfaces can never drift apart.
 */
export function getRestAvailability(status: UnitLandSupplyStatus | undefined): RestAvailability {
  if (status === undefined || status.state === 'full') return { canRest: true };
  return { canRest: false, reason: 'Cannot recover while unsupported — restore supply first.' };
}

export interface RestActionAvailability {
  available: boolean;
  /** #544 "Rest UX" copy for the disable-and-explain case; undefined for the plain hide cases. */
  reason?: string;
}

/**
 * The one legality definition for the player-facing Rest action (#1025 action
 * contract). The unit panel's Rest button and `restAction`'s executor both ask
 * this, so the UI can never promise "+15 HP next turn" that the round-end heal
 * loop will then deny: `healCivUnits` gates every heal (Rest, passive, city and
 * territory) on the same `getRestAvailability` supply fact.
 *
 * `reason` is set only for the supply denial — the #544 spec's "disable Rest,
 * explain why" case, rendered as a disabled button with the explanation beside
 * it. The plain hide cases (full health, already moved/acted, no movement
 * left) stay unexplained, exactly as the panel rendered them before.
 */
export function getRestActionAvailability(
  unit: Pick<Unit, 'health' | 'hasMoved' | 'hasActed' | 'movementPointsLeft' | 'landSupply'>,
): RestActionAvailability {
  if (!canHeal(unit) || unit.hasMoved || unit.hasActed || unit.movementPointsLeft <= 0) {
    return { available: false };
  }
  const rest = getRestAvailability(unit.landSupply);
  return rest.canRest ? { available: true } : { available: false, reason: rest.reason };
}
