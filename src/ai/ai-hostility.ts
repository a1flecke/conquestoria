import { classifyOwner, isAlwaysHostilePair } from '@/core/owner-kind';
import type { GameState } from '@/core/types';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';

export function isAIHostileOwner(
  state: Readonly<GameState>,
  actorId: string,
  ownerId: string,
): boolean {
  if (ownerId === actorId) return false;
  const ownerKind = classifyOwner(ownerId);
  if (ownerKind === 'beast') {
    return state.settings?.aiContestsBeasts === true;
  }
  if (ownerKind === 'pirate') {
    const faction = state.pirates?.factions[ownerId];
    if (
      faction?.contract?.employerId === actorId
      || (faction?.tributeByCiv[actorId]?.protectedUntilRound ?? 0)
        > state.turn
    ) {
      return false;
    }
    return true;
  }
  if (ownerKind === 'minor') {
    return isMinorCivAtWar(state, actorId, ownerId);
  }
  if (isAlwaysHostilePair(actorId, ownerId)) return true;
  return state.civilizations[actorId]?.diplomacy.atWarWith
    .includes(ownerId) ?? false;
}
