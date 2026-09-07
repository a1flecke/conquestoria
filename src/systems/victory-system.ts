import type { GameState } from '@/core/types';
import { isMajorCivOwner } from '@/core/owner-kind';
import { getCivilizationLiveness } from './civilization-liveness';

export function checkDominationVictory(state: GameState): string | null {
  const ids = Object.keys(state.civilizations).filter(isMajorCivOwner);
  if (ids.length < 2) return null;

  const living = ids.filter(civId => getCivilizationLiveness(state, civId).living);
  return living.length === 1 ? living[0] : null;
}
