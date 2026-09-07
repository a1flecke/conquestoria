import type { GameState, Unit } from '@/core/types';
import { isMajorCivOwner } from '@/core/owner-kind';

export type CivilizationLivenessState = Pick<GameState, 'civilizations' | 'cities' | 'units'>;

export type CivilizationLiveness =
  | { living: true; reason: 'city' | 'settler' }
  | { living: false; reason: 'not-major' | 'eliminated' | 'no-survival-assets' };

function isSurvivingSettler(state: CivilizationLivenessState, unit: Unit): boolean {
  if (unit.type !== 'settler' || !Number.isFinite(unit.health) || unit.health <= 0) {
    return false;
  }
  if (!unit.transportId) return true;

  const host = state.units[unit.transportId];
  return Boolean(
    host
      && host.id !== unit.id
      && !host.transportId
      && host.owner === unit.owner
      && Number.isFinite(host.health)
      && host.health > 0
      && host.cargoUnitIds?.includes(unit.id),
  );
}

export function getCivilizationLiveness(
  state: CivilizationLivenessState,
  civId: string,
): CivilizationLiveness {
  const civilization = state.civilizations[civId];
  if (!isMajorCivOwner(civId) || !civilization) {
    return { living: false, reason: 'not-major' };
  }
  if (civilization.isEliminated === true) {
    return { living: false, reason: 'eliminated' };
  }
  if (Object.values(state.cities ?? {}).some(city => city.owner === civId)) {
    return { living: true, reason: 'city' };
  }
  if (Object.values(state.units ?? {}).some(unit =>
    unit.owner === civId && isSurvivingSettler(state, unit))) {
    return { living: true, reason: 'settler' };
  }
  return { living: false, reason: 'no-survival-assets' };
}
