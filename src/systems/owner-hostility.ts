import type { GameState } from '@/core/types';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import { isMinorCivHostileToOwner } from '@/systems/minor-civ-diplomacy';

export function isHostileOwnerTo(
  state: Readonly<GameState>,
  actorId: string,
  otherOwnerId: string,
): boolean {
  if (actorId === otherOwnerId) return false;
  if (isAlwaysHostilePair(actorId, otherOwnerId)) return true;
  if (actorId.startsWith('mc-')) {
    return isMinorCivHostileToOwner(state, actorId, otherOwnerId);
  }
  if (otherOwnerId.startsWith('mc-')) {
    return isMinorCivHostileToOwner(state, otherOwnerId, actorId);
  }
  return state.civilizations[actorId]?.diplomacy?.atWarWith
    .includes(otherOwnerId) ?? false;
}
