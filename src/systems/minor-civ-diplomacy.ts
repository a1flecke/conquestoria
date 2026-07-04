import type { GameState } from '@/core/types';
import { isAlwaysHostilePair } from '@/core/owner-kind';

export function isMinorCivAtWar(
  state: Readonly<Pick<GameState, 'civilizations' | 'minorCivs'>>,
  majorCivId: string,
  minorCivId: string,
): boolean {
  const majorCiv = state.civilizations[majorCivId];
  const minorCiv = state.minorCivs[minorCivId];
  return Boolean(
    majorCiv?.diplomacy.atWarWith.includes(minorCivId)
    || minorCiv?.diplomacy.atWarWith.includes(majorCivId),
  );
}

export function isMinorCivHostileToOwner(
  state: Readonly<Pick<GameState, 'civilizations' | 'minorCivs'>>,
  minorCivId: string,
  ownerId: string,
): boolean {
  if (minorCivId === ownerId) return false;
  if (isAlwaysHostilePair(minorCivId, ownerId)) return true;
  if (state.civilizations[ownerId] && isMinorCivAtWar(state, ownerId, minorCivId)) {
    return true;
  }

  const minor = state.minorCivs[minorCivId];
  if (!minor) return false;
  return Object.entries(minor.chainStatusByCiv ?? {}).some(([allyId, status]) =>
    status.status === 'allied'
    && state.civilizations[allyId]?.diplomacy.atWarWith.includes(ownerId));
}
