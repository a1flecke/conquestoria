import type { GameState } from '@/core/types';
import { resolveWorldPressureFlags } from './world-pressure-flags';

export function isCrisisPressureEligible(state: Pick<GameState, 'settings' | 'civilizations'>, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  if (civ.isHuman) return true;
  return resolveWorldPressureFlags(state.settings).aiPressure === 'full';
}

export function isPiratePressureEligible(state: Pick<GameState, 'settings' | 'civilizations'>, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  if (civ.isHuman) return true;
  return resolveWorldPressureFlags(state.settings).aiPressure !== 'off';
}

export function getCrisisEligibleCivIds(state: Pick<GameState, 'settings' | 'civilizations'>): string[] {
  return Object.values(state.civilizations)
    .filter(civ => !civ.isEliminated && civ.cities.length > 0 && isCrisisPressureEligible(state, civ.id))
    .map(civ => civ.id)
    .sort();
}
