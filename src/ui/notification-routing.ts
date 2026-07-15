import type { CombatResult, CombatRewardNotification, GameEvents, GameState, ProductionDropReason, TreatyType } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { REVOLT_UNREST_TURNS, BREAKAWAY_REVOLT_TURNS, CONCESSION_IMMUNITY_TURNS, getCityAppeaseCost } from '@/systems/faction-system';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import { describeDroppedProductionItem } from '@/systems/city-system';
import type { NotificationCityAction, NotificationEntry } from '@/core/notification-log';
import { presentStrategicWarning } from '@/ui/strategic-warning-presentation';
import { getCrisisFlavor, getCrisisDisplayName } from '@/systems/crisis-flavor-definitions';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';

export type NotificationSink = (
  civId: string,
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
  cityActions?: NotificationCityAction[],
) => void;

type FactionTransitionEvent =
  | { type: 'faction:unrest-started'; cityId: string; owner: string }
  | { type: 'faction:revolt-started'; cityId: string; owner: string }
  | { type: 'faction:unrest-resolved'; cityId: string; owner: string }
  | { type: 'faction:breakaway-started'; cityId: string; oldOwner: string; breakawayId: string }
  | { type: 'faction:breakaway-established'; civId: string; originOwnerId: string }
  | { type: 'faction:critical-status'; cityId: string; owner: string; status: 'unrest' | 'revolt' | 'breakaway'; breakawayId?: string }
  | { type: 'faction:concession-made'; cityId: string; owner: string; concessionType: 'charter' };

type TerritoryTileFlippedRoutingEvent =
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

export function routeFactionTransition(
  state: GameState,
  event: FactionTransitionEvent,
  sink: NotificationSink,
): void {
  if (event.type === 'faction:unrest-started') {
    const city = state.cities[event.cityId];
    if (!city) return;
    const appeaseCost = getCityAppeaseCost(city);
    sink(
      event.owner,
      `${city.name} is slipping into unrest. Stabilize within ${REVOLT_UNREST_TURNS} turns or rebels will spawn. Options: garrison a military unit, spend ${appeaseCost}🪙 to appease, or build happiness improvements.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:revolt-started') {
    const city = state.cities[event.cityId];
    if (!city) return;
    sink(
      event.owner,
      `${city.name} is in open revolt! Rebels have spawned. Defeat them and reduce pressure to restore order. After ${BREAKAWAY_REVOLT_TURNS} turns of revolt the city may break away permanently.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:unrest-resolved') {
    const city = state.cities[event.cityId];
    sink(event.owner, `${city?.name ?? 'A city'} has stabilized.`, 'success');
    return;
  }

  if (event.type === 'faction:breakaway-started') {
    const city = state.cities[event.cityId];
    const breakaway = state.civilizations[event.breakawayId];
    const turnsLeft = breakaway?.breakaway
      ? Math.max(0, breakaway.breakaway.establishesOnTurn - state.turn)
      : 0;
    sink(
      event.oldOwner,
      `${city?.name ?? 'A city'} has broken away. Recapture or reabsorb it before it becomes established${turnsLeft > 0 ? ` in ${turnsLeft} turns` : ''}.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:critical-status') {
    const city = state.cities[event.cityId];
    if (event.status === 'unrest') {
      sink(event.owner, `${city?.name ?? 'A city'} remains in unrest. Stabilize it before revolt spreads.`, 'warning');
      return;
    }
    if (event.status === 'revolt') {
      sink(event.owner, `${city?.name ?? 'A city'} remains in open revolt. Defeat nearby rebels and reduce pressure.`, 'warning');
      return;
    }
    const breakaway = event.breakawayId ? state.civilizations[event.breakawayId] : undefined;
    const turnsLeft = breakaway?.breakaway
      ? Math.max(0, breakaway.breakaway.establishesOnTurn - state.turn)
      : 0;
    sink(
      event.owner,
      `${city?.name ?? 'A city'} is still in secession${turnsLeft > 0 ? ` (${turnsLeft} turns before establishment)` : ''}.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:concession-made') {
    const city = state.cities[event.cityId];
    sink(
      event.owner,
      `${city?.name ?? 'A city'} has been granted a charter — immune to unrest for ${CONCESSION_IMMUNITY_TURNS} turns.`,
      'success',
    );
    return;
  }

  const civ = state.civilizations[event.civId];
  const city = civ?.breakaway ? state.cities[civ.breakaway.originCityId] : undefined;
  sink(event.originOwnerId, `${city?.name ?? civ?.name ?? 'A breakaway state'} is now an established civilization.`, 'warning');
}

export function routeEconomyTreasuryStrain(
  state: GameState,
  event: GameEvents['economy:treasury-strain'],
  sink: NotificationSink,
): void {
  const civ = state.civilizations[event.civId];
  if (!civ) return;
  sink(event.civId, formatEconomyTreasuryStrainMessage(state, event), 'warning');
}

export function formatEconomyTreasuryStrainMessage(
  state: GameState,
  event: GameEvents['economy:treasury-strain'],
): string {
  const maintenanceNote = event.unpaidMaintenance > 0
    ? ` ${event.unpaidMaintenance} maintenance went unpaid.`
    : '';
  if (event.level === 'low') {
    return `Treasury strain (${event.netGoldPerTurn}/turn).${maintenanceNote} Rush buy is still available if you can afford it.`;
  }

  const unrestNote = state.era >= 3
    ? ' Unhappiness pressure is rising.'
    : '';
  const label = event.level === 'critical' ? 'Critical treasury strain' : 'Treasury strain is high';
  return `${label} (${event.netGoldPerTurn}/turn).${maintenanceNote} Rush buy is unavailable until the budget recovers.${unrestNote}`;
}

// Writes to both parties' logs from their own perspective.
// Shared between the war-declared notification and the diplomacy panel's
// "at war since" row (#554) -- one source of truth for the relationship-based
// reason string, so the two surfaces never drift.
export function describeWarReason(relationship: number): string {
  if (relationship <= -50) return 'deep hostility';
  if (relationship <= -20) return 'deteriorating relations';
  if (relationship < 0) return 'territorial disputes';
  return 'rising tensions';
}

// Shared between the treaty-proposed notification and the diplomacy panel's
// proposal buttons (#554) -- one source of truth for display names.
export const TREATY_LABELS: Record<TreatyType, string> = {
  non_aggression_pact: 'Non-Aggression Pact',
  trade_agreement: 'Trade Agreement',
  open_borders: 'Open Borders',
  alliance: 'Alliance',
  vassalage: 'Vassalage',
};

export function routeTreatyProposed(
  state: GameState,
  event: GameEvents['diplomacy:treaty-proposed'],
  sink: NotificationSink,
): void {
  const fromName = state.civilizations[event.fromCiv]?.name ?? 'Unknown';
  const label = TREATY_LABELS[event.treaty];
  sink(event.toCiv, `${fromName} proposes a ${label}. Review it in the Diplomacy panel.`, 'info');
}

export function routeWarDeclared(
  state: GameState,
  attackerId: string,
  defenderId: string,
  sink: NotificationSink,
): void {
  const attackerName = state.civilizations[attackerId]?.name ?? 'Unknown';
  const defenderName = state.civilizations[defenderId]?.name ?? 'Unknown';
  const rel = state.civilizations[defenderId]?.diplomacy?.relationships[attackerId] ?? 0;
  const reason = describeWarReason(rel);
  sink(defenderId, `${attackerName} has declared war! (Reason: ${reason})`, 'warning');
  sink(attackerId, `War has been declared on ${defenderName}!`, 'warning');
}

// Writes to both parties' logs.
export function routePeaceMade(
  state: GameState,
  civA: string,
  civB: string,
  sink: NotificationSink,
): void {
  const a = state.civilizations[civA]?.name ?? 'Unknown';
  const b = state.civilizations[civB]?.name ?? 'Unknown';
  sink(civA, `Peace with ${b}!`, 'success');
  sink(civB, `Peace with ${a}!`, 'success');
}

// Writes only to the recipient civ's log because the requester already
// gets direct action feedback from the initiating UI/AI path.
export function routePeaceRequested(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  sink: NotificationSink,
): void {
  const fromName = state.civilizations[fromCivId]?.name ?? 'Unknown';
  sink(toCivId, `${fromName} requests peace.`, 'info');
}

export function routeFirstContact(
  state: GameState,
  civA: string,
  civB: string,
  sink: NotificationSink,
): void {
  const aName = state.civilizations[civA]?.name ?? civA;
  const bName = state.civilizations[civB]?.name ?? civB;
  sink(civA, `You have encountered ${bName}.`, 'info');
  sink(civB, `You have encountered ${aName}.`, 'info');
}

export function routeDroppedProductionItem(
  state: GameState,
  event: { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason },
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const message = describeDroppedProductionItem(
    { itemId: event.itemId, itemKind: event.itemKind, reason: event.reason },
    city.name,
  );
  sink(city.owner, message, 'warning');
}

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

// Routes to the combatants' owners regardless of who is currently acting.
export function routeCombatResolved(
  state: GameState,
  result: CombatResult,
  sink: NotificationSink,
  facts?: Pick<
    GameEvents['combat:resolved'],
    'attackerOwnerId' | 'attackerType' | 'defenderOwnerId' | 'defenderType'
  >,
): void {
  const defender = state.units[result.defenderId];
  const attacker = state.units[result.attackerId];
  const defenderOwner = facts?.defenderOwnerId ?? defender?.owner;
  if (!defenderOwner) return;
  const attackerOwner = facts?.attackerOwnerId ?? attacker?.owner;
  const attackerLabel = attackerOwner === 'barbarian'
    ? 'Barbarians'
    : (state.civilizations[attackerOwner ?? '']?.name ?? attackerOwner ?? 'Unknown');
  const defenderTypeId = facts?.defenderType ?? defender?.type;
  if (!defenderTypeId) return;
  const defenderType = UNIT_DEFINITIONS[defenderTypeId]?.name ?? defenderTypeId;
  const exchangeSuffix = result.exchange ? `. ${result.exchange.label}.` : '';
  const msg = result.defenderSurvived
    ? `${defenderType} was attacked by ${attackerLabel} (${result.defenderDamage} damage taken)`
    : `${defenderType} was destroyed by ${attackerLabel}!`;
  sink(defenderOwner, `${msg}${exchangeSuffix}`, 'warning');

  if (!result.exchange || !attackerOwner || attackerOwner === 'barbarian') return;
  const attackerTypeId = facts?.attackerType ?? attacker?.type;
  if (!attackerTypeId) return;
  const attackerType = UNIT_DEFINITIONS[attackerTypeId]?.name ?? attackerTypeId;
  sink(attackerOwner, `${attackerType} attack: ${result.exchange.label}.`, 'info');
}

export function routeCombatRewardEarned(
  _state: GameState,
  reward: CombatRewardNotification,
  sink: NotificationSink,
): void {
  sink(reward.recipientCivId, reward.message, 'success');
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

// Routes a barbarian spawn to every civ whose visibility covers the spawn tile
// the first time that civ sees any raider from the camp. Returns the set of
// civ ids that received a notification so the caller can track dedup state.
export function routeBarbarianSpawned(
  state: GameState,
  unitPosition: { q: number; r: number },
  campId: string,
  alreadyNotifiedPerCiv: Map<string, Set<string>>,
  sink: NotificationSink,
  isVisible: (vis: unknown, pos: { q: number; r: number }) => boolean,
): void {
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const vis = civ?.visibility;
    if (!vis) continue;
    if (!isVisible(vis, unitPosition)) continue;
    const seen = alreadyNotifiedPerCiv.get(civId) ?? new Set<string>();
    if (seen.has(campId)) continue;
    seen.add(campId);
    alreadyNotifiedPerCiv.set(civId, seen);
    sink(civId, 'Barbarian raiders spotted!', 'warning', {
      kind: 'map',
      coord: { ...unitPosition },
      label: 'Barbarian raiders',
    });
  }
}

// Era advancement is a world event, not attributable to whoever currentPlayer
// happens to be at emit time (#551) -- deliver to every human civ via the
// delivery contract, which handles hot-seat queueing and solo toasting itself.
export function routeEraAdvanced(
  era: number,
  humanCivIds: string[],
  sink: NotificationSink,
): void {
  for (const civId of humanCivIds) {
    sink(civId, `The world has entered Era ${era}!`, 'success');
    if (era === 2) {
      sink(
        civId,
        `Era 2 begins — cities can now experience unrest. High pressure (overcrowding, distance from capital, unhappiness) will trigger it. Garrison units, spend gold to appease, or build happiness improvements to keep order.`,
        'info',
      );
    }
  }
}

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
  const name = getCrisisDisplayName(flavor, state.era);
  const message = flavor.advisorLine
    .replace('{name}', name)
    .replace('{city}', city?.name ?? 'a city');
  sink(event.civId, message, 'warning', cityId && city ? {
    kind: 'map',
    coord: { ...city.position },
    label: name,
  } : undefined);
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
  const name = getCrisisDisplayName(flavor, state.era);
  sink(
    crisis.targetCivId,
    `${name} has spread to ${toCity?.name ?? 'another city'}!`,
    'warning',
    toCity ? { kind: 'map', coord: { ...toCity.position }, label: name } : undefined,
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
  const name = flavor ? getCrisisDisplayName(flavor, state.era) : 'A crisis';
  sink(event.civId, `${name} ${outcomeMessage[event.outcome]}`, type);
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
  const name = getCrisisDisplayName(flavor, state.era);
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
  const name = flavor ? getCrisisDisplayName(flavor, state.era) : 'its crisis';
  const message = `${targetCiv.name} ${WORLD_PRESSURE_OUTCOME_VERB[event.outcome]} ${name}.`;

  for (const [viewerId, viewer] of Object.entries(state.civilizations)) {
    if (viewerId === event.civId) continue;
    if (!(viewer.knownCivilizations ?? []).includes(event.civId)) continue;
    sink(viewerId, message, 'success');
  }
}
