// src/ui/notification-routes/world-routes.ts
// #1250: world-scale events — era advance, legendary wonders, world races, strategic warnings. Public
// ones name no civ; ones that name a civ anonymise it for a viewer who has not met them.
import type { GameEvents, GameState } from '@/core/types';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import { presentStrategicWarning } from '@/ui/strategic-warning-presentation';
import type { WorldAge } from '@/systems/era-types';
import { hasMetCivilization } from '@/systems/discovery-system';
import { getWorldRaceDefinition } from '@/systems/world-race-definitions';
import type { NotificationSink } from './notification-sink';

export function routeStrategicWarning(
  event: GameEvents['ai:strategic-warning'],
  sink: NotificationSink,
): void {
  const presentation = presentStrategicWarning(event);
  sink(
    event.viewerId,
    presentation.message,
    presentation.type,
    presentation.target,
  );
}

type LegendaryWonderRoutingEvent =
  | { type: 'wonder:legendary-ready'; civId: string; cityId: string; wonderId: string }
  | { type: 'wonder:legendary-completed'; civId: string; cityId: string; wonderId: string; turnCompleted: number }
  | { type: 'wonder:legendary-lost'; civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number }
  | { type: 'wonder:legendary-race-revealed'; observerId: string; civId: string; cityId: string; wonderId: string }
  | { type: 'wonder:legendary-availability'; recipientCivId: string; wonderId: string; status: GameEvents['wonder:legendary-availability']['status']; cityActions: GameEvents['wonder:legendary-availability']['cityActions'] };

// Routes legendary-wonder events. `legendary-completed` fans out across all civs
// (class-2 global event; the helper redacts the builder's name for civs that have
// not met the builder). The other three events target a single civ per the helper
// contract: builder for ready/lost, observer for race-revealed.
export function routeLegendaryWonder(
  state: GameState,
  event: LegendaryWonderRoutingEvent,
  sink: NotificationSink,
): void {
  if (event.type === 'wonder:legendary-availability') {
    const wonderName = getLegendaryWonderNotificationName(event.wonderId);
    const message = event.status === 'buildable'
      ? `${wonderName} is ready to build.`
      : `${wonderName} is now ${event.status.replace(/_/g, ' ')}.`;
    sink(event.recipientCivId, message, event.status === 'buildable' ? 'info' : 'warning', undefined, event.cityActions);
    return;
  }
  if (event.type === 'wonder:legendary-completed') {
    for (const civId of Object.keys(state.civilizations)) {
      const notification = getLegendaryWonderNotification(state, civId, event);
      if (notification) sink(civId, notification.message, notification.type);
    }
    return;
  }
  const target = event.type === 'wonder:legendary-race-revealed' ? event.observerId : event.civId;
  const notification = getLegendaryWonderNotification(state, target, event);
  if (notification) sink(target, notification.message, notification.type);
}

function getLegendaryWonderNotificationName(wonderId: string): string {
  return wonderId.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

// Era advancement is a world event, not attributable to whoever currentPlayer
// happens to be at emit time (#551) -- deliver to every human civ via the
// delivery contract, which handles hot-seat queueing and solo toasting itself.
export function routeEraAdvanced(
  era: WorldAge,
  humanCivIds: string[],
  sink: NotificationSink,
): void {
  for (const civId of humanCivIds) {
    sink(civId, `The world has entered Era ${era}!`, 'success');
    if (era === 2) {
      sink(
        civId,
        // #919 MR3: at Era-2 onset no civ has a happiness building yet — name only the
        // levers that actually exist now, plus the real Era-2 answer (Magistracy → Courthouse).
        `Era 2 begins — cities can now feel unrest. Overcrowding, distance from your capital, and war all add pressure. Garrison units, spend gold to appease, trade for luxuries, or research Magistracy to build Courthouses.`,
        'info',
      );
    }
  }
}

// #992 world races. 'unlocked' and 'launch-begun' are genuinely public --
// they name no civ, so every civ gets the identical message regardless of
// contact/discovery. 'completed' follows the SAME fan-out-and-anonymize
// convention as legendary-wonder completion (see routeReligionFounded's own
// comment contrasting the two): everyone learns the race is over, but the
// winner's name is redacted for a viewer who hasn't met them.
export function routeWorldRaceUnlocked(
  state: GameState,
  event: GameEvents['worldrace:unlocked'],
  sink: NotificationSink,
): void {
  const name = getWorldRaceDefinition(event.kind).displayName;
  for (const civId of Object.keys(state.civilizations)) {
    sink(civId, `The ${name} race has become possible.`, 'info');
  }
}

export function routeWorldRaceLaunchBegun(
  state: GameState,
  event: GameEvents['worldrace:launch-begun'],
  sink: NotificationSink,
): void {
  const name = getWorldRaceDefinition(event.kind).displayName;
  for (const civId of Object.keys(state.civilizations)) {
    sink(civId, `A ${name} launch attempt has begun somewhere in the world.`, 'info');
  }
}

export function routeWorldRaceCompleted(
  state: GameState,
  event: GameEvents['worldrace:completed'],
  sink: NotificationSink,
): void {
  const name = getWorldRaceDefinition(event.kind).displayName;
  const winner = state.civilizations[event.winnerCivId];
  for (const civId of Object.keys(state.civilizations)) {
    const isWinner = civId === event.winnerCivId;
    const message = isWinner
      ? `Your empire has won the ${name} race!`
      : hasMetCivilization(state, civId, event.winnerCivId)
        ? `${winner?.name ?? 'A rival civilization'} has won the ${name} race.`
        : `A civilization you have not yet met has won the ${name} race.`;
    sink(civId, message, isWinner ? 'success' : 'info');
  }
}
