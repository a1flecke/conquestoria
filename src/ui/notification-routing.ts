import type { CombatResult, GameState } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
import type { NotificationEntry } from '@/ui/notification-log';

export type NotificationSink = (civId: string, message: string, type: NotificationEntry['type']) => void;

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

type LegendaryWonderRoutingEvent =
  | { type: 'wonder:legendary-ready'; civId: string; cityId: string; wonderId: string }
  | { type: 'wonder:legendary-completed'; civId: string; cityId: string; wonderId: string }
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
    sink(civId, 'Barbarian raiders spotted!', 'warning');
  }
}
