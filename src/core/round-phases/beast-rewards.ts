import type { GameState } from '@/core/types';
import { applyHoardChoice, getClaimedTrophyGoldPerTurn } from '@/systems/beast-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Beast hoards and trophies. A hoard choice pending for a civ other than the current player is resolved as gold
 * (the player at the controls decides their own); every living civ's per-turn trophy gold is credited into
 * `context.grossGoldByCiv` for the economy phase to settle.
 */
function runBeastRewards(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { grossGoldByCiv } = context;
  if (newState.beasts) {
    for (const pending of [...(newState.beasts.pendingHoardChoices ?? [])]) {
      if (pending.civId === newState.currentPlayer) continue;
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
