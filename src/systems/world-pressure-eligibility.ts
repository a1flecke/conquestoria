import type { GameState } from '@/core/types';
import { getCivilizationLiveness } from './civilization-liveness';
import { resolveWorldPressureFlags } from './world-pressure-flags';

type WorldPressureState = Pick<GameState, 'settings' | 'civilizations' | 'cities' | 'units'>;

export function isCrisisPressureEligible(state: WorldPressureState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ || !getCivilizationLiveness(state, civId).living) return false;
  if (civ.isHuman) return true;
  return resolveWorldPressureFlags(state.settings).aiPressure === 'full';
}

export function isPiratePressureEligible(state: WorldPressureState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ || !getCivilizationLiveness(state, civId).living) return false;
  if (civ.isHuman) return true;
  return resolveWorldPressureFlags(state.settings).aiPressure !== 'off';
}

export function getCrisisEligibleCivIds(state: WorldPressureState): string[] {
  return Object.values(state.civilizations)
    .filter(civ => getCivilizationLiveness(state, civ.id).reason === 'city'
      && isCrisisPressureEligible(state, civ.id))
    .map(civ => civ.id)
    .sort();
}
