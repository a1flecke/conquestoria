import type { CombatResult, CombatRewardNotification, GameEvents, GameState } from '@/core/types';
import { collectEvent } from '@/core/hotseat-events';
import { hexKey } from '@/systems/hex-utils';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { REVOLT_UNREST_TURNS, BREAKAWAY_REVOLT_TURNS, getCityAppeaseCost } from '@/systems/faction-system';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import type { NotificationEntry } from '@/ui/notification-log';

export type NotificationSink = (
  civId: string,
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
) => void;

type FactionTransitionEvent =
  | { type: 'faction:unrest-started'; cityId: string; owner: string }
  | { type: 'faction:revolt-started'; cityId: string; owner: string }
  | { type: 'faction:unrest-resolved'; cityId: string; owner: string }
  | { type: 'faction:breakaway-started'; cityId: string; oldOwner: string; breakawayId: string }
  | { type: 'faction:breakaway-established'; civId: string; originOwnerId: string }
  | { type: 'faction:critical-status'; cityId: string; owner: string; status: 'unrest' | 'revolt' | 'breakaway'; breakawayId?: string };

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
export function routeWarDeclared(
  state: GameState,
  attackerId: string,
  defenderId: string,
  sink: NotificationSink,
): void {
  const attackerName = state.civilizations[attackerId]?.name ?? 'Unknown';
  const defenderName = state.civilizations[defenderId]?.name ?? 'Unknown';
  const rel = state.civilizations[defenderId]?.diplomacy?.relationships[attackerId] ?? 0;
  let reason = 'rising tensions';
  if (rel <= -50) reason = 'deep hostility';
  else if (rel <= -20) reason = 'deteriorating relations';
  else if (rel < 0) reason = 'territorial disputes';
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

export function queueFirstContactPendingEvents(
  state: GameState,
  civA: string,
  civB: string,
): void {
  state.pendingEvents ??= {};
  const aName = state.civilizations[civA]?.name ?? civA;
  const bName = state.civilizations[civB]?.name ?? civB;
  collectEvent(state.pendingEvents, civA, { type: 'first-contact', message: `Encountered ${bName}.`, turn: state.turn });
  collectEvent(state.pendingEvents, civB, { type: 'first-contact', message: `Encountered ${aName}.`, turn: state.turn });
}

// Routes to the defender's owner regardless of who is currently acting.
export function routeCombatResolved(
  state: GameState,
  result: CombatResult,
  sink: NotificationSink,
): void {
  const defender = state.units[result.defenderId];
  if (!defender) return;
  const attacker = state.units[result.attackerId];
  const attackerOwner = attacker?.owner ?? 'Unknown';
  const attackerLabel = attackerOwner === 'barbarian'
    ? 'Barbarians'
    : (state.civilizations[attackerOwner]?.name ?? attackerOwner);
  const defenderType = UNIT_DEFINITIONS[defender.type]?.name ?? defender.type;
  const msg = result.defenderSurvived
    ? `${defenderType} was attacked by ${attackerLabel} (${result.defenderDamage} damage taken)`
    : `${defenderType} was destroyed by ${attackerLabel}!`;
  sink(defender.owner, msg, 'warning');
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
  | { type: 'wonder:legendary-race-revealed'; observerId: string; civId: string; cityId: string; wonderId: string };

// Routes legendary-wonder events. `legendary-completed` fans out across all civs
// (class-2 global event; the helper redacts the builder's name for civs that have
// not met the builder). The other three events target a single civ per the helper
// contract: builder for ready/lost, observer for race-revealed.
export function routeLegendaryWonder(
  state: GameState,
  event: LegendaryWonderRoutingEvent,
  sink: NotificationSink,
): void {
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

export function routeEraAdvanced(
  era: number,
  civId: string,
  civName: string,
  toastSink: (message: string, type: NotificationEntry['type']) => void,
  factionSink: NotificationSink,
): void {
  toastSink(`${civName} has entered Era ${era}!`, 'success');
  if (era === 2) {
    factionSink(
      civId,
      `Era 2 begins — cities can now experience unrest. High pressure (overcrowding, distance from capital, unhappiness) will trigger it. Garrison units, spend gold to appease, or build happiness improvements to keep order.`,
      'info',
    );
  }
}
