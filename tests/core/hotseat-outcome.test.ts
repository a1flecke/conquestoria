import { describe, expect, it } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import { resolveHotSeatPostSimulation } from '@/core/hotseat-outcome';

function state() {
  return createHotSeatGame({
    playerCount: 2,
    mapSize: 'medium',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'england', isHuman: true },
      { name: 'Bob', slotId: 'player-2', civType: 'germany', isHuman: true },
      { name: 'AI Rome', slotId: 'ai-1', civType: 'rome', isHuman: false },
      { name: 'AI Greece', slotId: 'ai-2', civType: 'greece', isHuman: false },
    ],
  }, 'hotseat-outcome');
}

describe('post-simulation hot-seat outcome', () => {
  it('chooses the next human from authoritative post-simulation state', () => {
    const game = state();
    game.civilizations['player-2'].isEliminated = true;

    const result = resolveHotSeatPostSimulation(game, 'player-1');

    expect(result.nextHumanId).toBe('player-1');
    expect(result.state.currentPlayer).toBe('player-1');
  });

  it('persists defeat when no active humans remain', () => {
    const game = state();
    game.civilizations['player-1'].isEliminated = true;
    game.civilizations['player-2'].isEliminated = true;

    const result = resolveHotSeatPostSimulation(game, 'player-2');

    expect(result.nextHumanId).toBeNull();
    expect(result.state.gameOver).toBe(true);
    expect(result.state.winner).toBeNull();
    expect(result.state.gameOverReason).toBe('all-humans-eliminated');
  });

  it('preserves an already resolved domination winner before all-human defeat', () => {
    const game = state();
    game.civilizations['player-1'].isEliminated = true;
    game.civilizations['player-2'].isEliminated = true;
    game.gameOver = true;
    game.winner = 'ai-1';
    game.gameOverReason = 'domination';

    const result = resolveHotSeatPostSimulation(game, 'player-2');

    expect(result.nextHumanId).toBeNull();
    expect(result.state.winner).toBe('ai-1');
    expect(result.state.gameOverReason).toBe('domination');
  });

  it("applies the incoming human's own pendingChallenge, leaving the outgoing human untouched", () => {
    const game = state();
    game.civilizations['player-2'].pendingChallenge = 'veteran';
    game.civilizations['player-2'].challenge = 'standard';
    game.civilizations['player-1'].challenge = 'explorer';

    const result = resolveHotSeatPostSimulation(game, 'player-1');

    expect(result.nextHumanId).toBe('player-2');
    expect(result.state.civilizations['player-2'].challenge).toBe('veteran');
    expect(result.state.civilizations['player-2'].pendingChallenge).toBeUndefined();
    expect(result.state.civilizations['player-1'].challenge).toBe('explorer');
  });
});
