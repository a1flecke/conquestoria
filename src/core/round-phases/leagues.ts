import type { GameState } from '@/core/types';
import { checkLeagueDissolution } from '@/systems/diplomacy-leagues';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Defensive leagues whose members have gone to war with each other dissolve, announcing `diplomacy:league-
 * dissolved` for each.
 */
function runLeagues(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // --- League dissolution check ---
  if (newState.defensiveLeagues) {
    const warPairs: Array<{ civA: string; civB: string }> = [];
    for (const civ of Object.values(newState.civilizations)) {
      for (const enemyId of civ.diplomacy?.atWarWith ?? []) {
        warPairs.push({ civA: civ.id, civB: enemyId });
      }
    }
    const dissolved = newState.defensiveLeagues.filter(l => {
      for (const pair of warPairs) {
        if (l.members.includes(pair.civA) && l.members.includes(pair.civB)) return true;
      }
      return false;
    });
    for (const league of dissolved) {
      bus.emit('diplomacy:league-dissolved', { leagueId: league.id, reason: 'members_at_war' });
    }
    newState.defensiveLeagues = checkLeagueDissolution(newState.defensiveLeagues, warPairs);
  }
  return newState;
}

export const leaguesPhase: RoundPhase = { id: 'leagues', run: runLeagues };
