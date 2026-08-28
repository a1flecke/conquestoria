import type { GameSettings, GameState } from '@/core/types';

/**
 * #545 MR7 spec §13. Legacy saves (field undefined) resolve to 'off' --
 * deliberately different from world-pressure-flags.ts's "undefined inherits
 * the live default" convention. New games set the field explicitly at
 * creation time (see createDefaultSettings and the hot-seat setup card), so
 * 'off' here is reached only by a save that predates this feature.
 */
export function resolveSuperweaponsFlag(settings: GameSettings | undefined): 'off' | 'on' {
  return settings?.superweapons ?? 'off';
}

/**
 * Single source of truth for "is the superweapons mechanic currently active."
 * Checked directly inside the handful of functions whose own contract is
 * already "is this available right now" (getArsenalStatus,
 * getEligibleStrategicLaunchPlatforms, hasArmsControlTreaty,
 * hasKnownStrategicCapability) -- never inside historical-fact functions
 * like hasManhattanProject or getStrategicArsenalCapacity, which must stay
 * honest regardless of this setting. See the MR7 design doc's SRP table for
 * the full reasoning.
 */
export function isSuperweaponsEnabled(state: GameState): boolean {
  return resolveSuperweaponsFlag(state.settings) === 'on';
}
