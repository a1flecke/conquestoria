import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { settleTributeForCiv } from '@/systems/diplomacy-tribute';
import { processVassalageTribute } from '@/systems/diplomacy-vassal-rules';
import { getFederalismRemittanceLoss } from '@/systems/faction-federalism';
import type { CivTurn, CivIncome } from './types';

/**
 * Outpost upkeep, vassal tribute and the federal remittance come off the income, and what remains is credited to
 * the civ in `grossGoldByCiv`.
 */
export function settleUpkeepAndRemittances(state: GameState, turn: CivTurn, income: CivIncome, grossGoldByCiv: Record<string, number>, bus?: EventBus): void {
  const { civId, civ } = turn;

  // Resource outpost upkeep: 2 gold/turn per completed outpost owned by this civ
  const outpostUpkeep = Object.values(state.map.tiles).filter(
    tile =>
      tile.improvement === 'resource_outpost' &&
      tile.improvementTurnsLeft === 0 &&
      tile.owner === civId,
  ).length * 2;
  income.totalGold -= outpostUpkeep;

  // Vassalage tribute (25% of gold income flows to overlord)
  if (civ.diplomacy?.vassalage.overlord) {
    const tribute = processVassalageTribute(income.totalGold);
    income.totalGold -= tribute.tributeAmount;
    const overlordId = civ.diplomacy.vassalage.overlord;
    if (state.civilizations[overlordId]) {
      grossGoldByCiv[overlordId] = (grossGoldByCiv[overlordId] ?? 0) + tribute.tributeAmount;
    }
  }

  // #1334: standalone tribute. The payer's own copy pays (capped at its treasury, never debt) and a contract that is no
  // longer live is removed from both civs. Written back in place: the rest of this civ's turn holds `turn.civ`.
  const standaloneTribute = settleTributeForCiv(state, civId, bus);
  for (const [id, updated] of Object.entries(standaloneTribute.state.civilizations)) {
    if (updated.diplomacy !== state.civilizations[id].diplomacy) state.civilizations[id].diplomacy = updated.diplomacy;
  }
  for (const [id, delta] of Object.entries(standaloneTribute.goldDeltaByCiv)) {
    grossGoldByCiv[id] = (grossGoldByCiv[id] ?? 0) + delta;
  }

  // #927 Rung 6: Federal Autonomy remittance loss — applied at this
  // canonical revenue-aggregation point, once per civ per turn.
  if (civ.federalismEnabled) {
    income.totalGold -= getFederalismRemittanceLoss(income.totalGold);
  }
  grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + income.totalGold;
}
