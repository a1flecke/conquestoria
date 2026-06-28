import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  applyPendingOpponentChallenge,
  isOpponentChallenge,
  OPPONENT_CHALLENGE_PROFILES,
  resolveOpponentChallenge,
  setPendingOpponentChallenge,
} from '@/core/opponent-challenge';

describe('opponent challenge', () => {
  it('recognizes only supported campaign challenge values', () => {
    expect(isOpponentChallenge('explorer')).toBe(true);
    expect(isOpponentChallenge('standard')).toBe(true);
    expect(isOpponentChallenge('veteran')).toBe(true);
    expect(isOpponentChallenge('hard')).toBe(false);
    expect(isOpponentChallenge(undefined)).toBe(false);
  });

  it('resolves absent or malformed legacy values without writing a default', () => {
    const legacy = createNewGame(undefined, 'challenge-resolve');
    delete legacy.opponentChallenge;

    expect(resolveOpponentChallenge(legacy)).toBe('standard');
    expect(legacy.opponentChallenge).toBeUndefined();
    expect(resolveOpponentChallenge({ opponentChallenge: 'invalid' as never })).toBe('standard');
  });

  it('applies a pending challenge once at the round boundary', () => {
    const state = createNewGame({
      civType: 'rome',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Challenge',
      opponentChallenge: 'veteran',
      seed: 'pending-challenge',
    });
    const pending = setPendingOpponentChallenge(state, 'explorer');
    const applied = applyPendingOpponentChallenge(pending);

    expect(pending.opponentChallenge).toBe('veteran');
    expect(pending.pendingOpponentChallenge).toBe('explorer');
    expect(applied.opponentChallenge).toBe('explorer');
    expect(applied.pendingOpponentChallenge).toBeUndefined();
    expect(applyPendingOpponentChallenge(applied)).toBe(applied);
  });

  it('selecting the active challenge cancels an existing pending change', () => {
    const state = createNewGame({
      civType: 'rome',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Challenge',
      opponentChallenge: 'standard',
      seed: 'cancel-pending-challenge',
    });
    state.pendingOpponentChallenge = 'veteran';

    const cancelled = setPendingOpponentChallenge(state, 'standard');

    expect(cancelled.opponentChallenge).toBe('standard');
    expect(cancelled.pendingOpponentChallenge).toBeUndefined();
  });

  it('drops malformed pending values instead of making them active', () => {
    const state = createNewGame(undefined, 'malformed-pending');
    state.pendingOpponentChallenge = 'impossible' as never;

    const normalized = applyPendingOpponentChallenge(state);

    expect(normalized.opponentChallenge).toBe('standard');
    expect(normalized.pendingOpponentChallenge).toBeUndefined();
  });

  it('changes behavior parameters without combat or economy bonuses', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer.maxPrimaryForce)
      .toBeLessThan(OPPONENT_CHALLENGE_PROFILES.veteran.maxPrimaryForce);
    expect(OPPONENT_CHALLENGE_PROFILES.explorer.seededSuboptimalChance)
      .toBeGreaterThan(OPPONENT_CHALLENGE_PROFILES.veteran.seededSuboptimalChance);
    for (const profile of Object.values(OPPONENT_CHALLENGE_PROFILES)) {
      expect(profile).not.toHaveProperty('combatBonus');
      expect(profile).not.toHaveProperty('productionBonus');
      expect(profile).not.toHaveProperty('researchBonus');
      expect(profile).not.toHaveProperty('visionBonus');
    }
  });
});
