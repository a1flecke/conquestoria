import type { CombatResult, GameState } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import type { NotificationEntry } from '@/ui/notification-log';

export type NotificationType = NotificationEntry['type'];
export type NotificationSink = (civId: string, message: string, type: NotificationType) => void;

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
  sink(attackerId, `You declared war on ${defenderName}.`, 'warning');
}

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

type LegendaryWonderRoutingEvent =
  | { type: 'wonder:legendary-ready'; civId: string; cityId: string; wonderId: string }
  | { type: 'wonder:legendary-completed'; civId: string; cityId: string; wonderId: string }
  | { type: 'wonder:legendary-lost'; civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number }
  | { type: 'wonder:legendary-race-revealed'; observerId: string; civId: string; cityId: string; wonderId: string };

export function routeLegendaryWonder(
  state: GameState,
  event: LegendaryWonderRoutingEvent,
  sink: NotificationSink,
): void {
  const target = event.type === 'wonder:legendary-race-revealed' ? event.observerId : event.civId;
  const notification = getLegendaryWonderNotification(state, target, event);
  if (notification) sink(target, notification.message, notification.type);
}
