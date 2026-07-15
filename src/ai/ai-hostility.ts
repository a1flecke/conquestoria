import { classifyOwner } from '@/core/owner-kind';
import type { GameState } from '@/core/types';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

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
  return isHostileOwnerTo(state, actorId, ownerId);
}
