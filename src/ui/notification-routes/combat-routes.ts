// src/ui/notification-routes/combat-routes.ts
// #1250: combat results and rewards, routed to the combatants' owners regardless of who is acting. The
// modifier-fact projection redacts what the recipient has not earned.
import type { CombatModifierFact, CombatResult, CombatRewardNotification, GameEvents, GameState } from '@/core/types';
import type { CombatNotificationDetails } from '@/core/notification-log';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import type { NotificationSink } from './notification-sink';

function projectCombatFacts(
  result: CombatResult,
  recipient: 'attacker' | 'defender',
): CombatNotificationDetails | undefined {
  const facts = result.modifierFacts;
  if (!facts) return undefined;
  const own = recipient === 'attacker' ? facts.attacker : facts.defender;
  const rival = recipient === 'attacker' ? facts.defender : facts.attacker;
  const project = (fact: CombatModifierFact, ownFact: boolean) => ({
    label: ownFact || fact.sourceVisibility === 'public' ? fact.label : 'Unknown advantage',
    operation: fact.operation,
    value: fact.value,
    outcome: fact.outcome,
    redacted: !ownFact && fact.sourceVisibility !== 'public',
  });
  const projected = [...own.map(fact => project(fact, true)), ...rival.map(fact => project(fact, false))];
  return projected.length > 0 ? { facts: projected } : undefined;
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
  const splashSuffix = result.splashHits?.length
    ? ` Rocket saturation damaged ${result.splashHits.length} nearby visible enemy unit${result.splashHits.length === 1 ? '' : 's'}.`
    : '';
  const msg = result.defenderSurvived
    ? `${defenderType} was attacked by ${attackerLabel} (${result.defenderDamage} damage taken)`
    : `${defenderType} was destroyed by ${attackerLabel}!`;
  const combatDetails = projectCombatFacts(result, 'defender');
  if (combatDetails) {
    sink(defenderOwner, `${msg}${exchangeSuffix}${splashSuffix}`, 'warning', undefined, undefined, undefined, combatDetails);
  } else {
    sink(defenderOwner, `${msg}${exchangeSuffix}${splashSuffix}`, 'warning');
  }

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
