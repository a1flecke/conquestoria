// src/ui/notification-routes/crisis-routes.ts
// #1250: crises, event chains, the witness/ally interactions around them, and the met-civ-gated
// world-pressure fan-out. Each router states its own recipient rule in its comment.
import type { GameEvents, GameState } from '@/core/types';
import type { NotificationEntry } from '@/core/notification-log';
import { getCrisisFlavor, getCrisisDisplayName } from '@/systems/crisis-flavor-definitions';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';
import { getWitnessCivIds } from '@/systems/crisis-interaction-system';
import type { NotificationSink } from './notification-sink';

export function routeCrisisStarted(
  state: GameState,
  event: GameEvents['crisis:started'],
  sink: NotificationSink,
): void {
  const flavor = getCrisisFlavor(event.flavorId);
  if (!flavor) return;
  // Hunt's onset notification fires later, at spawn time (routeCrisisEscalated, stage
  // 'menacing') — the foe doesn't have a name yet when the crisis record is first
  // scheduled, so announcing here would either use a generic category name or duplicate
  // the real announcement a moment later.
  if (flavor.archetype === 'hunt') return;
  const cityId = event.cityIds[0];
  const city = cityId ? state.cities[cityId] : undefined;
  const name = getCrisisDisplayName(flavor, resolveCivilizationEra(state.civilizations[event.civId]?.techState?.completed ?? []));
  const message = flavor.advisorLine
    .replace('{name}', name)
    .replace('{city}', city?.name ?? 'a city');
  // #594 MR7: bespoke famine-onset stinger replaces the generic chime for this toast
  // only -- other archetypes (outbreak/catastrophe) keep the generic SFX.notification().
  sink(event.civId, message, 'warning', cityId && city ? {
    kind: 'map',
    coord: { ...city.position },
    label: name,
  } : undefined, undefined, flavor.archetype === 'famine' ? 'famine-onset' : undefined);
}

export function routeCrisisEscalated(
  state: GameState,
  event: GameEvents['crisis:escalated'],
  sink: NotificationSink,
): void {
  // civId/foeName come from the event, not re-read from state: this fires mid-turn,
  // in the same tick the foe first gets a name, and the caller's state snapshot may
  // predate that (see the GameEvents['crisis:escalated'] doc comment in core/types.ts).
  if (!event.civId || !event.foeName) return;
  const crisis = state.activeCrises?.[event.crisisId];
  const flavor = crisis ? getCrisisFlavor(crisis.flavorId) : undefined;
  // cityIds is set once at crisis creation and never changes afterward, so it's safe
  // to read from a possibly-stale snapshot even though foeName/civId are not.
  const city = crisis ? state.cities[crisis.cityIds[0]] : undefined;
  const target = city ? { kind: 'map' as const, coord: { ...city.position }, label: event.foeName } : undefined;

  if (event.stage === 'menacing' && flavor) {
    const message = flavor.advisorLine
      .replace('{name}', event.foeName)
      .replace('{city}', city?.name ?? 'a city');
    sink(event.civId, message, 'warning', target);
  } else if (event.stage === 'assaulting') {
    sink(
      event.civId,
      `${event.foeName} now assaults ${city?.name ?? 'your city'}! Slay it before it breaches the walls.`,
      'warning',
      target,
    );
  }
}

export function routeCrisisSpread(
  state: GameState,
  event: GameEvents['crisis:spread'],
  sink: NotificationSink,
): void {
  const crisis = state.activeCrises?.[event.crisisId];
  if (!crisis) return;
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor) return;
  const toCity = state.cities[event.toCityId];
  const name = getCrisisDisplayName(flavor, resolveCivilizationEra(state.civilizations[crisis.targetCivId]?.techState?.completed ?? []));
  sink(
    crisis.targetCivId,
    `${name} has spread to ${toCity?.name ?? 'another city'}!`,
    'warning',
    toCity ? { kind: 'map', coord: { ...toCity.position }, label: name } : undefined,
  );
}

export function routeCrisisContained(
  state: GameState,
  event: GameEvents['crisis:contained'],
  sink: NotificationSink,
): void {
  const crisis = state.activeCrises?.[event.crisisId];
  const flavor = crisis ? getCrisisFlavor(crisis.flavorId) : undefined;
  const name = flavor
    ? getCrisisDisplayName(flavor, resolveCivilizationEra(state.civilizations[event.civId]?.techState?.completed ?? []))
    : 'the outbreak';
  sink(
    event.civId,
    `Nationwide remedy funded against ${name} — ${event.cityCount} ${event.cityCount === 1 ? 'city' : 'cities'}, ${event.goldCost} gold.`,
    'success',
  );
}

export function routeCrisisResolved(
  state: GameState,
  event: GameEvents['crisis:resolved'],
  sink: NotificationSink,
): void {
  // Hunt's 'hunted' outcome gets its own two-sided messaging (killer civ + target civ,
  // using the foe's real name) rather than the generic per-outcome line below — both
  // foeName and killerCivId are carried on the event itself for the same
  // same-tick-freshness reason as crisis:escalated (see core/types.ts).
  if (event.outcome === 'hunted' && event.foeName) {
    const killerCivId = event.killerCivId ?? event.civId;
    sink(killerCivId, `The beast-slayer's feast begins! (+2 happiness, 5 turns)`, 'success');
    if (killerCivId !== event.civId) {
      sink(event.civId, `${event.foeName} has been slain by ${state.civilizations[killerCivId]?.name ?? 'another civilization'}.`, 'success');
    }
    return;
  }

  const outcomeMessage: Record<typeof event.outcome, string> = {
    contained: 'has been contained.',
    expired: 'has run its course.',
    hunted: 'has been slain.',
    recovered: 'recovery is complete.',
    abandoned: 'no longer threatens your empire.',
  };
  const type: NotificationEntry['type'] = event.outcome === 'abandoned' ? 'info' : 'success';
  const flavor = getCrisisFlavor(event.flavorId);
  // Naming the resolved crisis matters once a player can have 2-3 concurrent crises
  // (veteran cap) — a bare "A crisis..." message would be ambiguous about which one.
  const name = flavor ? getCrisisDisplayName(flavor, resolveCivilizationEra(state.civilizations[event.civId]?.techState?.completed ?? [])) : 'A crisis';
  // #594 MR7: bespoke famine-resolved stinger replaces the generic chime, but only for
  // genuinely positive resolutions (contained/recovered) -- a passive 'expired' or
  // 'abandoned' outcome keeps the generic chime, matching the pre-existing
  // MusicDirector.handleCrisisResolved outcome filter's spirit.
  const sfxCue = flavor?.archetype === 'famine' && (event.outcome === 'contained' || event.outcome === 'recovered')
    ? 'famine-resolved'
    : undefined;
  sink(event.civId, `${name} ${outcomeMessage[event.outcome]}`, type, undefined, undefined, sfxCue);
}

// #990 event chains. Always sinks to `event.civId` only — a chain has no
// public rule, so no other civ is ever a recipient (see
// event-chain-presentation.ts's header comment for the full viewer-safety
// rationale). No map target: the shipped chain (financial-panic) is
// empire-scoped, not tied to a visible tile.
const EVENT_CHAIN_DISPLAY_NAME: Record<GameEvents['eventchain:started']['kind'], string> = {
  'financial-panic': 'Financial Panic',
};

export function routeEventChainStarted(
  _state: GameState,
  event: GameEvents['eventchain:started'],
  sink: NotificationSink,
): void {
  const name = EVENT_CHAIN_DISPLAY_NAME[event.kind] ?? 'A situation';
  sink(event.civId, `${name}! The Council has a decision for you.`, 'warning');
}

const EVENT_CHAIN_OUTCOME_MESSAGE: Record<GameEvents['eventchain:resolved']['outcome'], string> = {
  resolved: 'has passed.',
  'city-lost': 'no longer applies — the city at its center changed hands.',
  'civ-eliminated': 'no longer applies.',
  invalid: 'no longer applies.',
};

export function routeEventChainResolved(
  _state: GameState,
  event: GameEvents['eventchain:resolved'],
  sink: NotificationSink,
): void {
  const name = EVENT_CHAIN_DISPLAY_NAME[event.kind] ?? 'The situation';
  const type: NotificationEntry['type'] = event.outcome === 'resolved' ? 'success' : 'info';
  sink(event.civId, `${name} ${EVENT_CHAIN_OUTCOME_MESSAGE[event.outcome]}`, type);
}

// Hunt-their-foe (#526 MR6 Task 6.2): "Rome slew the beast menacing Carthage!" to
// third-party viewers who know either civ (killer or target) -- deliberately broader
// than the witness-reputation set in crisis-interaction-system.ts, which requires
// knowing BOTH. Never sinks to the killer or target themselves: routeCrisisResolved's
// existing 'hunted' branch already tells them directly ("The beast-slayer's feast
// begins!" / "{foe} has been slain by {killer}") from the same crisis:resolved event
// that fires in the same tick -- sinking here too would double-notify both parties.
export function routeCrisisFoeHuntedByAlly(
  state: GameState,
  event: GameEvents['crisis:foe-hunted-by-ally'],
  sink: NotificationSink,
): void {
  const killerName = state.civilizations[event.killerCivId]?.name ?? 'A civilization';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a civilization';
  const foeName = event.foeName ?? 'their foe';
  const message = `${killerName} slew ${foeName} menacing ${targetName}!`;

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (civId === event.killerCivId || civId === event.targetCivId) continue;
    const known = civ.knownCivilizations ?? [];
    if (known.includes(event.killerCivId) || known.includes(event.targetCivId)) {
      sink(civId, message, 'success');
    }
  }
}

// Send aid (#526 MR6 Task 6.3): notifies the aided target civ directly, plus every
// witness (met BOTH actor and target -- same set applyInteractionReputation rewarded),
// per spec §Interactions: "Human witnesses receive a notification... when overt acts
// occur (aid sent...)". The actor gets immediate feedback from the panel itself.
export function routeCrisisAidSent(
  state: GameState,
  event: GameEvents['crisis:aid-sent'],
  sink: NotificationSink,
): void {
  const actorName = state.civilizations[event.actorCivId]?.name ?? 'A civilization';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a civilization';
  const message = `${actorName} sent aid to ${targetName}!`;

  sink(event.targetCivId, message, 'success');
  for (const witnessId of getWitnessCivIds(state, event.actorCivId, event.targetCivId)) {
    sink(witnessId, message, 'success');
  }
}

// Exploit weakness (#526 MR7 Task 7.1): the target already learns of the war itself via
// routeWarDeclared (bound to diplomacy:war-declared, which fires alongside this event) --
// this router adds the "opportunistic" framing specifically for witnesses (met BOTH actor
// and target), matching the reputation set applyOpportunisticWarPenaltyIfCrisisStruck used.
export function routeOpportunisticWar(
  state: GameState,
  event: GameEvents['diplomacy:opportunistic-war'],
  sink: NotificationSink,
): void {
  const actorName = state.civilizations[event.actorId]?.name ?? 'A civilization';
  const targetName = state.civilizations[event.targetCivId]?.name ?? 'a civilization';
  const message = `${actorName} declared war on ${targetName} while they were struggling with a crisis!`;

  for (const witnessId of getWitnessCivIds(state, event.actorId, event.targetCivId)) {
    sink(witnessId, message, 'warning');
  }
}

// Fans out to viewers who know the AI target civ (met-civ gate, spec §Visibility).
// AI-targeted crises only -- a human's own crisis already notifies its owner via
// routeCrisisStarted above. Fires on crisis:started only, never per spread/siege tick:
// that discipline is structural (crisis:spread events have no corresponding
// world-pressure router at all, so third-party viewers never see spread notifications).
export function routeWorldPressureCrisisStarted(
  state: GameState,
  event: GameEvents['crisis:started'],
  sink: NotificationSink,
): void {
  if (!resolveWorldPressureFlags(state.settings).aiPressureVisibility) return;
  const targetCiv = state.civilizations[event.civId];
  if (!targetCiv || targetCiv.isHuman) return;
  const flavor = getCrisisFlavor(event.flavorId);
  if (!flavor) return;

  const cityId = event.cityIds[0];
  const city = cityId ? state.cities[cityId] : undefined;
  const name = getCrisisDisplayName(flavor, resolveCivilizationEra(targetCiv.techState?.completed ?? []));
  const message = `${name} reported in ${city?.name ?? targetCiv.name}.`;
  const target = city ? { kind: 'map' as const, coord: { ...city.position }, label: name } : undefined;

  for (const [viewerId, viewer] of Object.entries(state.civilizations)) {
    if (viewerId === event.civId) continue;
    if (!(viewer.knownCivilizations ?? []).includes(event.civId)) continue;
    sink(viewerId, message, 'info', target);
  }
}

const WORLD_PRESSURE_OUTCOME_VERB: Record<GameEvents['crisis:resolved']['outcome'], string> = {
  contained: 'has contained',
  expired: 'has weathered',
  hunted: 'has fended off',
  recovered: 'has recovered from',
  abandoned: 'no longer faces',
};

// Fans out crisis:resolved the same way routeWorldPressureCrisisStarted does. See that
// function's doc comment for the met-civ gate and anti-spam rationale.
export function routeWorldPressureCrisisResolved(
  state: GameState,
  event: GameEvents['crisis:resolved'],
  sink: NotificationSink,
): void {
  if (!resolveWorldPressureFlags(state.settings).aiPressureVisibility) return;
  const targetCiv = state.civilizations[event.civId];
  if (!targetCiv || targetCiv.isHuman) return;
  const flavor = getCrisisFlavor(event.flavorId);
  const name = flavor ? getCrisisDisplayName(flavor, resolveCivilizationEra(targetCiv.techState?.completed ?? [])) : 'its crisis';
  const message = `${targetCiv.name} ${WORLD_PRESSURE_OUTCOME_VERB[event.outcome]} ${name}.`;

  for (const [viewerId, viewer] of Object.entries(state.civilizations)) {
    if (viewerId === event.civId) continue;
    if (!(viewer.knownCivilizations ?? []).includes(event.civId)) continue;
    sink(viewerId, message, 'success');
  }
}
