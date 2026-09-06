import type { GameState, MinorCivState } from '@/core/types';
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


/** Starting either a voluntary or forced war permanently ends the current quest promise. */
export function endMinorCivQuestForWar(minor: MinorCivState, majorCivId: string, turn: number): { minor: MinorCivState; brokenChainId?: string } {
  const chainStatusByCiv = { ...minor.chainStatusByCiv };
  const status = chainStatusByCiv[majorCivId];
  let brokenChainId: string | undefined;
  if (status?.status === 'allied') {
    chainStatusByCiv[majorCivId] = { chainId: status.chainId, status: 'broken', statusTurn: turn, earnedTurn: status.earnedTurn };
    brokenChainId = status.chainId;
  } else if (status?.status === 'pending') {
    delete chainStatusByCiv[majorCivId];
  }
  const activeQuests = { ...minor.activeQuests };
  delete activeQuests[majorCivId];
  return { minor: { ...minor, chainStatusByCiv, activeQuests,
    questCooldownUntilByCiv: { ...minor.questCooldownUntilByCiv, [majorCivId]: turn + 3 },
  }, ...(brokenChainId ? { brokenChainId } : {}) };
}
