import type { GameState } from '@/core/types';
import { processCyberDrain } from '@/systems/cyber-warfare-system';
import { isAutonomyActivated, resolveNetworkPlansForVictimTurnEnd } from '@/systems/network-plan-system';
import type { CivTurn, CivIncome } from './types';
import type { RoundPhaseContext } from '../types';

/**
 * Gold taken from this civ before it is spent: cyber drain, then network exploits resolved at the victim's turn end.
 * What is taken is credited to the owners in `grossGoldByCiv`.
 */
export function settleCyberAndNetworkPlans(state: GameState, turn: CivTurn, income: CivIncome, context: RoundPhaseContext): GameState {
  let newState = state;
  const { civId } = turn;
  const { bus, grossGoldByCiv } = context;
  const { baseGoldByCityId } = income;

  // Cyber drain: enemy cyber_units adjacent to this civ's cities steal 2 gold/turn each
  // (blocked by Cyber Defense Center / Signals Hub); stolen gold is credited to the attacker.
  if (!isAutonomyActivated(newState, civId)) {
    const cyberDrainResult = processCyberDrain(newState, civId, income.totalGold);
    income.totalGold = cyberDrainResult.remainingGold;
    for (const [ownerCivId, amount] of Object.entries(cyberDrainResult.creditsByOwner)) {
      grossGoldByCiv[ownerCivId] = (grossGoldByCiv[ownerCivId] ?? 0) + amount;
    }
    for (const event of cyberDrainResult.events) {
      bus.emit('city:cyber-drained', { ...event, victimCivId: civId });
    }
  }
  const networkResult = resolveNetworkPlansForVictimTurnEnd(newState, civId, baseGoldByCityId);
  newState = networkResult.state;
  const transferred = Object.values(networkResult.creditsByOwner)
    .reduce((sum, amount) => sum + amount, 0);
  income.totalGold = Math.max(0, income.totalGold - transferred);
  for (const [ownerCivId, amount] of Object.entries(networkResult.creditsByOwner)) {
    grossGoldByCiv[ownerCivId] = (grossGoldByCiv[ownerCivId] ?? 0) + amount;
  }
  for (const event of networkResult.events) {
    const plan = Object.values(newState.autonomyByCiv ?? {})
      .map(autonomy => autonomy.plans[event.planId])
      .find(Boolean);
    if (!plan) continue;
    bus.emit('network:exploit-resolved', {
      planId: event.planId,
      cityId: event.cityId,
      ownerCivId: plan.ownerCivId,
      goldTransferred: event.goldTransferred,
      delayed: event.kind === 'exploit-delayed',
    });
  }
  return newState;
}
