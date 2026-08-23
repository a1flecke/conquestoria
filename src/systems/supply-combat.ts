import type { Unit, UnitLandSupplyStatus } from '@/core/types';

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
 * right now" — consumed both by the real heal-loop gate
 * (turn-manager.ts, this task) and by MR2's Rest-button disabled state, so
 * the two surfaces can never drift apart.
 */
export function getRestAvailability(status: UnitLandSupplyStatus | undefined): RestAvailability {
  if (status === undefined || status.state === 'full') return { canRest: true };
  return { canRest: false, reason: 'Cannot recover while unsupported — restore supply first.' };
}
