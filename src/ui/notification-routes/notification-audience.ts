// src/ui/notification-routes/notification-audience.ts
// #1250: THE audience authority for events whose recipients are derived from state rather than carried on
// the event (today: territory tile flips). Domain routers ask this module who may be told; none of them
// re-derives an audience. A leaf below every router.
import type { GameEvents, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

export type TerritoryTileFlippedRoutingEvent =
  GameEvents['territory:tile-flipped'] & { type: 'territory:tile-flipped' };

type NotificationRoutingEvent = TerritoryTileFlippedRoutingEvent;

export function getNotificationTargetsForEvent(
  state: GameState,
  event: NotificationRoutingEvent,
): string[] {
  if (event.type !== 'territory:tile-flipped') return [];

  const key = hexKey(event.coord);
  const targets = new Set<string>();
  if (state.civilizations[event.previousOwner]) targets.add(event.previousOwner);
  if (state.civilizations[event.newOwner]) targets.add(event.newOwner);
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const visibility = civ.visibility?.tiles?.[key];
    if (visibility === 'visible' || visibility === 'fog') {
      targets.add(civId);
    }
  }
  return [...targets];
}
