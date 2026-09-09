import { describe, expect, it } from 'vitest';
import { projectDominationOutcome } from '@/systems/domination-presentation';
import { makeLivenessGame } from './helpers/civilization-liveness-fixture';

describe('Domination outcome projection', () => {
  it('keeps a solo defeat generic when the winner was not entitled to the viewer', () => {
    const state = makeLivenessGame();
    state.gameOver = true;
    state.winner = 'ai-1';
    state.gameOverReason = 'domination';
    state.civilizations['ai-1'].name = 'Hidden Rival';

    expect(projectDominationOutcome(state, 'player')).toMatchObject({
      sharedResult: false,
      winnerName: 'A rival empire',
      outcome: 'defeat',
      summary: 'Your empire remains independent, but a rival fulfilled the Domination rule.',
    });
  });

  it('uses configured human names only in a shared hot-seat result', () => {
    const state = makeLivenessGame();
    state.civilizations['ai-1'].isHuman = true;
    state.hotSeat = {
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player', civType: state.civilizations.player.civType, isHuman: true },
        { name: 'Bob', slotId: 'ai-1', civType: state.civilizations['ai-1'].civType, isHuman: true },
      ],
    };
    state.gameOver = true;
    state.winner = 'ai-1';
    state.gameOverReason = 'domination';
    state.civilizations.player.name = 'Outgoing Secret';
    state.civilizations['ai-1'].name = 'Winning Secret';

    expect(projectDominationOutcome(state, null)).toEqual(expect.objectContaining({
      sharedResult: true,
      winnerName: 'Bob won by Domination.',
      standings: ['Alice: Not winner', 'Bob: Winner'],
    }));
  });

  it('preserves the all-human-eliminated result as a defeat rather than a Domination outcome', () => {
    const state = makeLivenessGame();
    state.gameOver = true;
    state.winner = 'ai-1';
    state.gameOverReason = 'all-humans-eliminated';

    expect(projectDominationOutcome(state, 'player')).toEqual(expect.objectContaining({
      sharedResult: false,
      outcome: 'defeat',
      summary: 'No human civilizations remain.',
    }));
  });
});
