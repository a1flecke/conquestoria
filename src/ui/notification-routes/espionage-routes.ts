// src/ui/notification-routes/espionage-routes.ts
// #1250: espionage consequences and the exhaustive route table. Recipients come from
// getEspionageNotificationAudience (the espionage audience contract), never re-derived here.
import type { GameEvents, GameState, SpyMissionType } from '@/core/types';
import {
  getEspionageNotificationAudience,
  type EspionageNotificationEvent,
  type EspionageNotificationEventType,
} from '@/ui/espionage-notification-audience';
import type { NotificationSink } from './notification-sink';

// Sabotage relief (#526 MR7 Task 7.2): fires only when the covert sabotage is discovered
// -- notifies the target directly plus every witness, per spec §Interactions ("Human
// witnesses receive a notification when a covert act... is discovered"). Family-tone
// string matches the spec's own example verbatim.
export function routeSabotageReliefDiscovered(
  state: GameState,
  event: GameEvents['espionage:sabotage-relief-discovered'],
  sink: NotificationSink,
): void {
  const actorName = state.civilizations[event.actorCivId]?.name ?? 'A civilization';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a civilization';
  const message = `${actorName}'s spies were caught sabotaging ${targetName}'s relief!`;

  for (const { civId } of getEspionageNotificationAudience(state, { type: 'espionage:sabotage-relief-discovered', ...event })) {
    sink(civId, message, 'warning');
  }
}

// flip_loyalty (#524 MR2a review fix): the flip is already applied when this fires --
// processEspionageTurn owns the transferCapturedCityOwnership transition and emits the
// event only afterwards (#1201). Both sides must be told: the victim especially, since
// losing a city with zero in-game feedback (the original gap this router closes) is far
// worse than any other espionage consequence.
// intercept_courier (#442 MR1): mirrors routeSabotageReliefDiscovered's shape — the
// route is already gone when this fires (processEspionageTurn owns removeRouteById and
// emits afterwards, #1201), so both sides need telling: the victim especially, since a
// silently vanished trade route with zero feedback is exactly the "invisible
// consequence" pattern the brief warns against.
export function routeCourierIntercepted(
  state: GameState,
  event: GameEvents['espionage:courier-intercepted'],
  sink: NotificationSink,
): void {
  const fromCity = state.cities[event.fromCityId];
  const toCity = state.cities[event.toCityId];
  const routeLabel = fromCity && toCity ? `${fromCity.name} – ${toCity.name}` : 'a trade route';
  const actorName = state.civilizations[event.civId]?.name ?? 'A rival';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a rival';

  for (const { civId, role } of getEspionageNotificationAudience(state, { type: 'espionage:courier-intercepted', ...event })) {
    if (role === 'actor') {
      sink(civId, `Your spy intercepted a courier, severing ${targetName}'s ${routeLabel} trade route.`, 'success');
    } else {
      sink(civId, `${actorName}'s spies intercepted a courier, severing the ${routeLabel} trade route!`, 'warning');
    }
  }
}

// bribe_official (#442 MR1): same both-sides pattern — the victim needs to know their
// treasury dropped, and the exact amount, so a sudden gold loss doesn't read as a bug.
export function routeOfficialBribed(
  state: GameState,
  event: GameEvents['espionage:official-bribed'],
  sink: NotificationSink,
): void {
  const actorName = state.civilizations[event.civId]?.name ?? 'A rival';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a rival';

  for (const { civId, role } of getEspionageNotificationAudience(state, { type: 'espionage:official-bribed', ...event })) {
    if (role === 'actor') {
      sink(civId, `Your spy bribed an official in ${targetName}'s court, siphoning ${event.amount} gold into your treasury.`, 'success');
    } else {
      sink(civId, `${actorName}'s spies bribed an official and siphoned ${event.amount} gold from your treasury!`, 'warning');
    }
  }
}

// expose_scandal (#442 MR2): the first multilateral espionage notification — unlike every
// prior router (at most 2 parties), this tells the target AND every exposed partner
// individually, plus the acting civ. Each recipient gets a message scoped to what
// actually changed for them, not a shared broadcast string.
export function routeScandalExposed(
  state: GameState,
  event: GameEvents['espionage:scandal-exposed'],
  sink: NotificationSink,
): void {
  const actorName = state.civilizations[event.civId]?.name ?? 'A rival';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a rival';
  const partnerNames = event.partnerCivIds.map(id => state.civilizations[id]?.name ?? id);

  for (const { civId, role } of getEspionageNotificationAudience(state, { type: 'espionage:scandal-exposed', ...event })) {
    if (role === 'actor') {
      sink(civId, `Your spy exposed ${targetName}'s secret dealings with ${partnerNames.length} other ${partnerNames.length === 1 ? 'civilization' : 'civilizations'}.`, 'success');
    } else if (role === 'target') {
      sink(
        civId,
        `${actorName}'s spies exposed your secret dealings — ${partnerNames.join(', ')} now trust${partnerNames.length === 1 ? 's' : ''} you less.`,
        'warning',
      );
    } else {
      sink(civId, `${actorName}'s spies revealed ${targetName}'s secret dealings with you — your relationship has soured.`, 'warning');
    }
  }
}

// Post-#442 audit fix: monitor_troops/gather_intel/identify_resources/monitor_diplomacy
// resolve real intelligence but never told the player. Unlike every router above, this
// is a single-recipient, non-disruptive acknowledgement (attacker only — passive
// reconnaissance has no detection/attribution consequence today, so inventing a target
// notification here would be new target awareness the mission doesn't actually grant).
const INTEL_REPORT_LABELS: Partial<Record<SpyMissionType, string>> = {
  monitor_troops: 'troop reports',
  gather_intel: 'general intelligence',
  identify_resources: 'resource intelligence',
  monitor_diplomacy: 'diplomatic intelligence',
};

export function routeIntelReportAcquired(
  state: GameState,
  event: GameEvents['espionage:intel-report-acquired'],
  sink: NotificationSink,
): void {
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a rival';
  const label = INTEL_REPORT_LABELS[event.missionType] ?? 'intelligence';
  for (const { civId } of getEspionageNotificationAudience(state, { type: 'espionage:intel-report-acquired', ...event })) {
    sink(civId, `Your spy gathered ${label} on ${targetName}. View it in the Espionage panel.`, 'success');
  }
}

export function routeCityFlipped(
  state: GameState,
  event: GameEvents['espionage:city-flipped'],
  sink: NotificationSink,
): void {
  const cityName = state.cities[event.cityId]?.name ?? 'A city';
  const flipperName = state.civilizations[event.civId]?.name ?? 'a rival';
  const victimName = state.civilizations[event.victimCivId]?.name ?? 'a rival';

  for (const { civId, role } of getEspionageNotificationAudience(state, { type: 'espionage:city-flipped', ...event })) {
    if (role === 'actor') {
      sink(civId, `${cityName} defected to you after a propaganda campaign against ${victimName}!`, 'success');
    } else {
      sink(civId, `${cityName} defected to ${flipperName} after a propaganda campaign!`, 'warning');
    }
  }
}

/**
 * The exhaustive espionage notification route table (#1201). Typed over
 * `EspionageNotificationEventType`, so adding a new notification event without a route
 * (and therefore without an audience contract) is a compile error; the generic
 * meta-test drives each entry here and asserts its delivered recipients equal
 * `getEspionageNotificationAudience`'s.
 */
export const ESPIONAGE_NOTIFICATION_ROUTES: {
  [K in EspionageNotificationEventType]: (
    state: GameState,
    event: Omit<Extract<EspionageNotificationEvent, { type: K }>, 'type'>,
    sink: NotificationSink,
  ) => void;
} = {
  'espionage:sabotage-relief-discovered': routeSabotageReliefDiscovered,
  'espionage:city-flipped': routeCityFlipped,
  'espionage:courier-intercepted': routeCourierIntercepted,
  'espionage:official-bribed': routeOfficialBribed,
  'espionage:scandal-exposed': routeScandalExposed,
  'espionage:intel-report-acquired': routeIntelReportAcquired,
};
