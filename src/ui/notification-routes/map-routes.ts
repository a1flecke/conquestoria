// src/ui/notification-routes/map-routes.ts
// #1250: notifications about the map itself — a border shift and a barbarian raider sighting. Both are
// delivered by tile visibility, never by who happens to be the active player.
import type { GameEvents, GameState, UnitType } from '@/core/types';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import type { NotificationSink } from './notification-sink';
import { getNotificationTargetsForEvent, type TerritoryTileFlippedRoutingEvent } from './notification-audience';

export function getTerritoryTileFlippedMessage(event: GameEvents['territory:tile-flipped']): string {
  if (event.constructionCancelled) {
    return 'Border shifted; in-progress construction was cancelled.';
  }
  if (event.improvement !== 'none') {
    return `Border shifted; ${getImprovementDisplayName(event.improvement)} transferred.`;
  }
  return 'Border shifted.';
}

export function routeTerritoryTileFlipped(
  state: GameState,
  event: TerritoryTileFlippedRoutingEvent,
  sink: NotificationSink,
): void {
  const message = getTerritoryTileFlippedMessage(event);
  for (const civId of getNotificationTargetsForEvent(state, event)) {
    sink(civId, message, event.constructionCancelled ? 'warning' : 'info', {
      kind: 'map',
      coord: { ...event.coord },
      label: 'Border shifted',
    });
  }
}

// Routes a barbarian spawn to every civ whose visibility covers the spawn tile
// the first time that civ sees any raider from the camp. Returns the set of
// civ ids that received a notification so the caller can track dedup state.
export function routeBarbarianSpawned(
  state: GameState,
  unitPosition: { q: number; r: number },
  campId: string,
  unitType: UnitType | undefined,
  alreadyNotifiedPerCiv: Map<string, Set<string>>,
  sink: NotificationSink,
  isVisible: (vis: unknown, pos: { q: number; r: number }) => boolean,
): void {
  const unitName = unitType ? UNIT_DEFINITIONS[unitType]?.name ?? 'raiders' : 'raiders';
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const vis = civ?.visibility;
    if (!vis) continue;
    if (!isVisible(vis, unitPosition)) continue;
    const seen = alreadyNotifiedPerCiv.get(civId) ?? new Set<string>();
    if (seen.has(campId)) continue;
    seen.add(campId);
    alreadyNotifiedPerCiv.set(civId, seen);
    sink(civId, `Barbarian ${unitName} spotted!`, 'warning', {
      kind: 'map',
      coord: { ...unitPosition },
      label: `Barbarian ${unitName}`,
    });
  }
}
