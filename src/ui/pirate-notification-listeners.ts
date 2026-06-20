import type { PirateNotificationReview } from '@/core/notification-log';
import type { GameState } from '@/core/types';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';

export type PirateReviewResolution =
  | { kind: 'active'; factionId: string }
  | { kind: 'history'; historyId: string };

export function markNotificationRead(state: GameState, viewerId: string, notificationId: string): GameState {
  const entries = state.notificationLog?.[viewerId];
  if (!entries?.some(entry => entry.id === notificationId && !entry.read)) return state;
  return {
    ...state,
    notificationLog: {
      ...state.notificationLog,
      [viewerId]: entries.map(entry => entry.id === notificationId ? { ...entry, read: true } : entry),
    },
  };
}

export function resolvePirateNotificationReview(
  state: GameState,
  viewerId: string,
  review: PirateNotificationReview,
): PirateReviewResolution | null {
  const presentation = getPirateWatersPresentation(state, viewerId);
  if (review.kind === 'pirate-faction') {
    return presentation.factions.some(faction => faction.factionId === review.factionId)
      ? { kind: 'active', factionId: review.factionId }
      : null;
  }
  return presentation.history.some(entry => entry.id === review.historyId)
    ? { kind: 'history', historyId: review.historyId }
    : null;
}
