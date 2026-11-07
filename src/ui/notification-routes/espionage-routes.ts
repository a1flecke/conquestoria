// src/ui/notification-routes/espionage-routes.ts
// #1250: espionage consequences and the exhaustive route table. Recipients come from
// getEspionageNotificationAudience (the espionage audience contract), never re-derived here.
import type { GameEvents, GameState, SpyMissionType } from '@/core/types';
import {
  getEspionageNotificationAudience,
  type EspionageNotificationEvent,
  type EspionageNotificationEventType,
} from '@/ui/espionage-notification-audience';
import { TECH_TREE } from '@/systems/tech-definitions';
import { getOperationAttribution } from '@/systems/espionage-presentation';
import { getRushBuyQuote } from '@/systems/economy-system';
import type { OperationEffect } from '@/core/types/espionage-incident';
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

// Hostile operations (#419): the attacker is told it worked, with the real effect; the victim is told what happened and, when the
// effect has one, the counter they already hold. The victim learns WHO only as far as getOperationAttribution says they have
// earned (confirmed: named; suspected or unknown: "a hostile operator"). The actor id on the event is omniscient and is never
// printed unfiltered.
function describeOperationEffect(effect: OperationEffect, cityName: string): { actor: string; target: string } {
  switch (effect.kind) {
    case 'production-lockout':
      return {
        actor: `${cityName} cannot build for ${effect.turns} turns.`,
        target: `${cityName} cannot build for ${effect.turns} turns.`,
      };
    case 'research-penalty':
      return {
        actor: `Their research is cut by ${effect.percent}% for ${effect.turns} turns.`,
        target: `Your research is cut by ${effect.percent}% for ${effect.turns} turns.`,
      };
    case 'progress-lost':
      return {
        actor: `${cityName} lost ${effect.amount} production progress.`,
        target: `${cityName} lost ${effect.amount} production progress.`,
      };
    case 'tech-stolen': {
      const name = TECH_TREE.find(tech => tech.id === effect.techId)?.name ?? 'a technology';
      return { actor: `You learned ${name}.`, target: `They copied ${name}.` };
    }
    case 'unrest-injected':
      return {
        actor: `${cityName} is unsettled.`,
        target: `${cityName} is more unsettled (+${effect.amount} unrest pressure).`,
      };
  }
}

/**
 * The counter the victim already has, with its live price, for a production lockout. Rush-buy is quoted by the one canonical
 * `getRushBuyQuote`, so the alert can never disagree with the Buy button; a refusal is passed through as its own message.
 */
function getLockoutCounterHint(
  state: GameState,
  event: GameEvents['espionage:operation-landed'],
): string | null {
  if (event.effect.kind !== 'production-lockout' || !event.cityId) return null;
  const city = state.cities[event.cityId];
  if (!city || city.owner !== event.targetCivId || !city.productionQueue?.length) return null;
  const quote = getRushBuyQuote(state, event.targetCivId, event.cityId);
  if (quote.available) return `You can break the lock now by rush-buying the current item for ${quote.cost} gold.`;
  return quote.message ? `Rush-buy is not available: ${quote.message}` : null;
}

export function routeOperationLanded(
  state: GameState,
  event: GameEvents['espionage:operation-landed'],
  sink: NotificationSink,
): void {
  const cityName = (event.cityId ? state.cities[event.cityId]?.name : undefined) ?? 'A city';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a rival';
  const text = describeOperationEffect(event.effect, cityName);
  for (const { civId, role } of getEspionageNotificationAudience(state, { type: 'espionage:operation-landed', ...event })) {
    if (role === 'actor') {
      sink(civId, `Operation succeeded against ${targetName}. ${text.actor}`, 'success');
      continue;
    }
    const attribution = getOperationAttribution(state, civId, event);
    const who = attribution === 'confirmed'
      ? `${state.civilizations[event.civId]?.name ?? 'A rival'} (caught red-handed)`
      : attribution === 'suspected' ? 'A hostile operator (your counter-spy suspects a rival)' : 'A hostile operator';
    const hint = getLockoutCounterHint(state, event);
    sink(civId, `${who} struck. ${text.target}${hint ? ` ${hint}` : ''}`, 'warning');
  }
}

// Caught in the Act (#419 PR 2). Reveal: delivered to the victim only, after the evidence exists. The actor is named
// here because the victim has just earned confirmation (the incident is only traced when attribution is 'confirmed').
export function routeIncidentTraced(
  state: GameState,
  event: GameEvents['espionage:incident-traced'],
  sink: NotificationSink,
): void {
  const actorName = state.civilizations[event.actorCivId]?.name ?? 'A rival';
  const cityName = (event.cityId ? state.cities[event.cityId]?.name : undefined) ?? 'your empire';
  for (const { civId } of getEspionageNotificationAudience(state, { type: 'espionage:incident-traced', ...event })) {
    sink(civId, `Your agents traced the attack on ${cityName} to ${actorName}. Open Espionage and Go public while the story is fresh.`, 'warning');
  }
}

// Go public: the victim names the culprit. The partners hear it too -- it is public by definition.
export function routeWentPublic(
  state: GameState,
  event: GameEvents['espionage:went-public'],
  sink: NotificationSink,
): void {
  const victimName = state.civilizations[event.civId]?.name ?? 'A civilization';
  const culpritName = state.civilizations[event.culpritCivId]?.name ?? 'a rival';
  for (const { civId, role } of getEspionageNotificationAudience(state, { type: 'espionage:went-public', ...event })) {
    if (role === 'actor') sink(civId, `You told the world ${culpritName} was behind the attack. ${event.partnerCivIds.length} of their partners now trust them less.`, 'success');
    else if (role === 'target') sink(civId, `${victimName} has gone public: your hostile operation is exposed and your partners trust you less.`, 'warning');
    else sink(civId, `${victimName} revealed that ${culpritName} ran a hostile operation against them -- your relationship with ${culpritName} has soured.`, 'warning');
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
  'espionage:operation-landed': routeOperationLanded,
  'espionage:incident-traced': routeIncidentTraced,
  'espionage:went-public': routeWentPublic,
};
