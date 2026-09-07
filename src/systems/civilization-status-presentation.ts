import type { GameState } from '@/core/types';
import { getCivilizationLiveness } from './civilization-liveness';

export interface CivilizationStatusPresentation {
  kind: 'rebuild' | 'defeated';
  message: string;
}

export function getCivilizationStatusForViewer(
  state: GameState,
  viewerId: string,
): CivilizationStatusPresentation | null {
  const verdict = getCivilizationLiveness(state, viewerId);
  if (verdict.reason === 'settler') {
    return { kind: 'rebuild', message: 'Your civilization is still in play. Found a city with a settler to rebuild.' };
  }
  if (verdict.reason === 'no-survival-assets') {
    return { kind: 'defeated', message: 'Your civilization has no cities or surviving settlers. Its remaining units have stood down.' };
  }
  if (verdict.reason === 'eliminated') {
    return { kind: 'defeated', message: 'This civilization has been eliminated.' };
  }
  return null;
}
