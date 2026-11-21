import type { GameState } from '@/core/types';
import { applyHoardChoice, getClaimedTrophyGoldPerTurn } from '@/systems/beast-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Beast hoards and trophies. An AI civ's pending hoard choice is resolved as gold; a human decides their own,
 * whoever's turn it is (a unit can slay a beast while defending, outside its owner's turn, and the choice waits
 * for that human's next turn). Every living civ's per-turn trophy gold is credited into
 * `context.grossGoldByCiv` for the economy phase to settle.
 */
function runBeastRewards(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { grossGoldByCiv } = context;
  if (newState.beasts) {
    for (const pending of [...(newState.beasts.pendingHoardChoices ?? [])]) {
      if (newState.civilizations[pending.civId]?.isHuman) continue;
      newState = applyHoardChoice(newState, pending.lairId, pending.civId, 'gold');
    }
    for (const civId of Object.keys(newState.civilizations)) {
      if (!getCivilizationLiveness(newState, civId).living) continue;
      const trophyGold = getClaimedTrophyGoldPerTurn(newState, civId);
      if (trophyGold > 0) grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + trophyGold;
    }
  }
  return newState;
}

export const beastRewardsPhase: RoundPhase = { id: 'beast-rewards', run: runBeastRewards };
