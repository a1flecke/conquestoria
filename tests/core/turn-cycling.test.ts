import { describe, it, expect } from 'vitest';
import {
  getHumanPlayers,
  getAIPlayers,
  getNextPlayer,
  isRoundComplete,
  getActiveHumanPlayers,
  getNextActiveHumanPlayerId,
  isActiveHumanRoundComplete,
} from '@/core/turn-cycling';
import type { HotSeatConfig } from '@/core/types';
import { createHotSeatGame } from '@/core/game-state';

const config: HotSeatConfig = {
  playerCount: 3,
  mapSize: 'medium',
  players: [
    { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
    { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
    { name: 'AI Rome', slotId: 'ai-1', civType: 'greece', isHuman: false },
  ],
};

describe('turn-cycling', () => {
  describe('getHumanPlayers', () => {
    it('returns only human players in order', () => {
      const humans = getHumanPlayers(config);
      expect(humans).toHaveLength(2);
      expect(humans[0].slotId).toBe('player-1');
      expect(humans[1].slotId).toBe('player-2');
    });
  });

  describe('getAIPlayers', () => {
    it('returns only AI players', () => {
      const ais = getAIPlayers(config);
      expect(ais).toHaveLength(1);
      expect(ais[0].slotId).toBe('ai-1');
    });
  });

  describe('getNextPlayer', () => {
    it('returns next human player', () => {
      expect(getNextPlayer(config, 'player-1')).toBe('player-2');
    });

    it('wraps to first human after last human', () => {
      expect(getNextPlayer(config, 'player-2')).toBe('player-1');
    });

    it('returns first human for unknown current', () => {
      expect(getNextPlayer(config, 'ai-1')).toBe('player-1');
    });
  });

  describe('isRoundComplete', () => {
    it('returns true when last human player ends turn', () => {
      expect(isRoundComplete(config, 'player-2')).toBe(true);
    });

    it('returns false for non-last human player', () => {
      expect(isRoundComplete(config, 'player-1')).toBe(false);
    });
  });

  describe('state-aware hot-seat turns', () => {
    function state() {
      return createHotSeatGame({
        playerCount: 3,
        mapSize: 'medium',
        players: [
          { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
          { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
          { name: 'Cara', slotId: 'player-3', civType: 'england', isHuman: true },
          { name: 'AI', slotId: 'ai-1', civType: 'greece', isHuman: false },
        ],
      }, 'state-aware-turns');
    }

    it('keeps zero-city pre-founding humans active', () => {
      const game = state();
      expect(Object.values(game.civilizations).every(civ => civ.cities.length === 0)).toBe(true);
      expect(getActiveHumanPlayers(game).map(player => player.slotId))
        .toEqual(['player-1', 'player-2', 'player-3']);
    });

    it('skips eliminated humans while preserving configured order', () => {
      const game = state();
      game.civilizations['player-2'].isEliminated = true;

      expect(getNextActiveHumanPlayerId(game, 'player-1')).toBe('player-3');
      expect(getNextActiveHumanPlayerId(game, 'player-3')).toBe('player-1');
    });

    it('completes the round when every later configured human is eliminated', () => {
      const game = state();
      game.civilizations['player-2'].isEliminated = true;
      game.civilizations['player-3'].isEliminated = true;

      expect(isActiveHumanRoundComplete(game, 'player-1')).toBe(true);
    });

    it('returns null when no active humans remain', () => {
      const game = state();
      for (const player of game.hotSeat!.players.filter(player => player.isHuman)) {
        game.civilizations[player.slotId].isEliminated = true;
      }

      expect(getNextActiveHumanPlayerId(game, 'player-1')).toBeNull();
    });
  });
});
