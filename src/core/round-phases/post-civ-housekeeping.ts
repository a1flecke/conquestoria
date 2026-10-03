import type { GameState } from '@/core/types';
import { pruneExpiredDiplomaticRequests } from '@/systems/diplomacy-requests';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Housekeeping after every civ has taken its turn: diplomatic requests and treaty proposals nobody answered expire
 * (once per round, not once per civ, #554), and the countdown on cities whose production is disabled ticks down.
 */
function runPostCivHousekeeping(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  // #554: expire stale peace requests / treaty proposals once per turn (not
  // once per civ) -- a proposal the recipient never opens the diplomacy panel
  // to act on should not persist forever.
  newState = pruneExpiredDiplomaticRequests(newState);

  for (const city of Object.values(newState.cities)) {
    if ((city.productionDisabledTurns ?? 0) > 0) {
      city.productionDisabledTurns = Math.max(0, (city.productionDisabledTurns ?? 0) - 1);
    }
  }
  return newState;
}

export const postCivHousekeepingPhase: RoundPhase = { id: 'post-civ-housekeeping', run: runPostCivHousekeeping };
