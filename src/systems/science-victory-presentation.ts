// #986: the sole projection for the Science Victory outcome screen -- the direct
// analog of domination-presentation.ts's projectDominationOutcome, but much
// simpler (no vassal/standings complexity: exactly one winner, full stop). Never
// reads state.worldRaces directly for the winner's identity; state.winner is
// already the authoritative field finalizeScienceVictory (victory-system.ts) set.
import type { GameState } from '@/core/types';
import { hasMetCivilization } from '@/systems/discovery-system';

export interface ScienceVictoryOutcomePresentation {
  sharedResult: boolean;
  winnerName: string;
  outcome: 'victory' | 'defeat';
  summary: string;
  standings: string[];
}

const RULE_SUMMARY = 'A Science Victory is won by completing humanity\'s first interstellar colony mission.';

export function projectScienceVictoryOutcome(
  state: GameState,
  viewerId: string | null,
): ScienceVictoryOutcomePresentation {
  const winnerId = state.winner;

  if (state.hotSeat) {
    const humans = state.hotSeat.players.filter(player => player.isHuman);
    const winner = humans.find(player => player.slotId === winnerId);
    return {
      sharedResult: true,
      winnerName: winner ? `${winner.name} achieved a Science Victory.` : 'A rival empire achieved a Science Victory.',
      outcome: winner ? 'victory' : 'defeat',
      summary: RULE_SUMMARY,
      standings: humans.map(player => `${player.name}: ${player.slotId === winnerId ? 'Winner' : 'Not winner'}`),
    };
  }

  const observerId = viewerId ?? state.currentPlayer;
  const won = winnerId === observerId;
  const winnerName = won
    ? state.civilizations[observerId]?.name ?? 'Your empire'
    : winnerId && hasMetCivilization(state, observerId, winnerId)
      ? state.civilizations[winnerId]?.name ?? 'A rival empire'
      : 'A civilization you have not yet met';
  return {
    sharedResult: false,
    winnerName,
    outcome: won ? 'victory' : 'defeat',
    summary: won
      ? 'Your empire completed humanity\'s first interstellar colony mission.'
      : `${winnerName} completed humanity's first interstellar colony mission.`,
    standings: [],
  };
}
