import type { GameState } from '@/core/types';
import { applyHoardChoice, chooseAiHoardChoice, getClaimedTrophyGoldPerTurn, getHoardChoicePreview } from '@/systems/beast-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Beast hoards and trophies. An AI civ's pending hoard choice is resolved by `chooseAiHoardChoice`; a human decides their own,
 * whoever's turn it is (a unit can slay a beast while defending, outside its owner's turn, and the choice waits
 * for that human's next turn). Every living civ's per-turn trophy gold is credited into
 * `context.grossGoldByCiv` for the economy phase to settle.
 */
function runBeastRewards(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { grossGoldByCiv } = context;
  if (newState.beasts) {
    // A pending choice is only valid while it names a slain lair. A choice can go stale (a temporary hunt lair is
    // removed by crisis cleanup, a lair is claimed) so it is discarded, never previewed or paid.
    const hasSlainLair = (lairId: string): boolean =>
      newState.beasts?.lairs[lairId]?.status === 'slain';
    for (const pending of [...(newState.beasts.pendingHoardChoices ?? [])]) {
      if (!hasSlainLair(pending.lairId) || newState.civilizations[pending.civId]?.isHuman) continue;
      const choice = chooseAiHoardChoice(getHoardChoicePreview(newState, pending.lairId, pending.civId));
      newState = applyHoardChoice(newState, pending.lairId, pending.civId, choice);
    }
    const beasts = newState.beasts;
    const pendingChoices = beasts?.pendingHoardChoices;
    if (beasts && pendingChoices) {
      const validChoices = pendingChoices.filter(pending => hasSlainLair(pending.lairId));
      if (validChoices.length !== pendingChoices.length) {
        newState = { ...newState, beasts: { ...beasts, pendingHoardChoices: validChoices } };
      }
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
