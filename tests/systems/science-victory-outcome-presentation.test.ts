import { describe, expect, it } from 'vitest';
import { projectScienceVictoryOutcome } from '@/systems/science-victory-presentation';
import { recordCivilizationContact } from '@/systems/discovery-system';
import { makeLivenessGame } from './helpers/civilization-liveness-fixture';

describe('projectScienceVictoryOutcome (#986)', () => {
  it('shows the winner\'s own empire name when the viewer won', () => {
    const state = makeLivenessGame();
    state.gameOver = true;
    state.winner = 'player';
    state.gameOverReason = 'science';
    state.civilizations.player.name = 'Rome';

    expect(projectScienceVictoryOutcome(state, 'player')).toMatchObject({
      sharedResult: false,
      winnerName: 'Rome',
      outcome: 'victory',
    });
  });

  it('redacts the winner\'s identity for a viewer who has not met them', () => {
    const state = makeLivenessGame();
    state.gameOver = true;
    state.winner = 'ai-1';
    state.gameOverReason = 'science';
    state.civilizations['ai-1'].name = 'Hidden Rival';

    expect(projectScienceVictoryOutcome(state, 'player')).toMatchObject({
      sharedResult: false,
      winnerName: 'A civilization you have not yet met',
      outcome: 'defeat',
    });
  });

  it('names the winner for a viewer who has met them', () => {
    const state = makeLivenessGame();
    recordCivilizationContact(state, 'player', 'ai-1');
    state.gameOver = true;
    state.winner = 'ai-1';
    state.gameOverReason = 'science';
    state.civilizations['ai-1'].name = 'Carthage';

    expect(projectScienceVictoryOutcome(state, 'player')).toMatchObject({
      sharedResult: false,
      winnerName: 'Carthage',
      outcome: 'defeat',
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
    state.gameOverReason = 'science';

    expect(projectScienceVictoryOutcome(state, null)).toEqual(expect.objectContaining({
      sharedResult: true,
      winnerName: 'Bob achieved a Science Victory.',
      standings: ['Alice: Not winner', 'Bob: Winner'],
    }));
  });
});
