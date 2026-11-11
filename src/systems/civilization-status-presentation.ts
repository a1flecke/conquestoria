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
  // Shown both before the first city of a new game and after losing the last one, so the copy must be true of
  // either (#1692 C1): it used to tell a turn-1 player to "rebuild".
  if (verdict.reason === 'settler') {
    return { kind: 'rebuild', message: 'You have no city. Select a Settler and choose Found City to settle one.' };
  }
  if (verdict.reason === 'no-survival-assets') {
    return { kind: 'defeated', message: 'Your civilization has no cities or surviving settlers. Its remaining units have stood down.' };
  }
  if (verdict.reason === 'eliminated') {
    return { kind: 'defeated', message: 'This civilization has been eliminated.' };
  }
  return null;
}
