import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { initializeLegacyOpponentChallenge } from '@/storage/save-manager';

describe('legacy opponent challenge migration', () => {
  it('initializes the selected challenge and exactly two grace rounds', () => {
    const legacy = createNewGame(undefined, 'legacy-challenge-grace', 'small');
    delete legacy.opponentChallenge;

    const migrated = initializeLegacyOpponentChallenge(legacy, 'explorer');

    expect(migrated.opponentChallenge).toBe('explorer');
    expect(migrated.pendingOpponentChallenge).toBeUndefined();
    expect(migrated.opponentAI?.migrationGraceRoundsRemaining).toBe(2);
  });

  it('preserves research, queues, units, cities, wars, resources, and save identity', () => {
    const legacy = createNewGame(undefined, 'legacy-challenge-content', 'small');
    delete legacy.opponentChallenge;
    legacy.civilizations.player.techState.completed = ['fire'];
    legacy.civilizations.player.techState.currentResearch = 'writing';
    legacy.civilizations.player.techState.researchProgress = 9;
    legacy.civilizations.player.techState.researchQueue = ['wheel'];
    legacy.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    const before = {
      gameId: legacy.gameId,
      gameTitle: legacy.gameTitle,
      tech: structuredClone(legacy.civilizations.player.techState),
      units: structuredClone(legacy.units),
      cities: structuredClone(legacy.cities),
      wars: [...legacy.civilizations.player.diplomacy.atWarWith],
      resources: Object.fromEntries(
        Object.entries(legacy.map.tiles).map(([key, tile]) => [key, tile.resource]),
      ),
    };

    const migrated = initializeLegacyOpponentChallenge(legacy, 'veteran');

    expect(migrated.gameId).toBe(before.gameId);
    expect(migrated.gameTitle).toBe(before.gameTitle);
    expect(migrated.civilizations.player.techState).toEqual(before.tech);
    expect(migrated.units).toEqual(before.units);
    expect(migrated.cities).toEqual(before.cities);
    expect(migrated.civilizations.player.diplomacy.atWarWith).toEqual(before.wars);
    expect(Object.fromEntries(
      Object.entries(migrated.map.tiles).map(([key, tile]) => [key, tile.resource]),
    )).toEqual(before.resources);
  });
});
