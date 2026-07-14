import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import {
  applyPendingChallengeForCiv,
  applyPendingOpponentChallenge,
  getChallengeProfileForCiv,
  isOpponentChallenge,
  OPPONENT_CHALLENGE_PROFILES,
  resolveChallengeForCiv,
  resolveOpponentChallenge,
  resolvePressureSeverityForCiv,
  setPendingChallengeForCiv,
  setPendingOpponentChallenge,
} from '@/core/opponent-challenge';

function stateWith(civChallenge: string | undefined, gameChallenge: string | undefined): GameState {
  return {
    opponentChallenge: gameChallenge,
    civilizations: { c1: { id: 'c1', isHuman: true, challenge: civChallenge } },
  } as unknown as GameState;
}

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

describe('per-civ challenge resolution', () => {
  it('prefers civ.challenge over game-wide', () => {
    expect(resolveChallengeForCiv(stateWith('explorer', 'veteran'), 'c1')).toBe('explorer');
  });
  it('falls back to game-wide, then standard', () => {
    expect(resolveChallengeForCiv(stateWith(undefined, 'veteran'), 'c1')).toBe('veteran');
    expect(resolveChallengeForCiv(stateWith(undefined, undefined), 'c1')).toBe('standard');
  });
  it('ignores invalid values', () => {
    expect(resolveChallengeForCiv(stateWith('bogus', undefined), 'c1')).toBe('standard');
  });
});

describe('resolvePressureSeverityForCiv', () => {
  it('returns the personal challenge for humans', () => {
    const state = { opponentChallenge: 'veteran', civilizations: {
      h1: { isHuman: true, challenge: 'explorer' },
    } } as any;
    expect(resolvePressureSeverityForCiv(state, 'h1')).toBe('explorer');
  });
  it('returns standard for AI even at veteran opponentChallenge (inversion trap)', () => {
    const state = { opponentChallenge: 'veteran', civilizations: {
      'ai-1': { isHuman: false },
    } } as any;
    expect(resolvePressureSeverityForCiv(state, 'ai-1')).toBe('standard');
    // Contrast: resolveChallengeForCiv would return 'veteran' here — that is
    // the inversion trap this function exists to avoid. See spec §severity.
  });
});

describe('crisis profile knobs', () => {
  it('carries spec values', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer).toMatchObject({
      crisisCooldownTurns: 12, crisisGraceMaxEra: 2, crisisGraceMinTurns: 30, crisisSeverityMultiplier: 0.5 });
    expect(OPPONENT_CHALLENGE_PROFILES.standard).toMatchObject({
      crisisCooldownTurns: 8, crisisGraceMaxEra: 1, crisisGraceMinTurns: 20, crisisSeverityMultiplier: 1.0 });
    expect(OPPONENT_CHALLENGE_PROFILES.veteran).toMatchObject({
      crisisCooldownTurns: 5, crisisGraceMaxEra: 1, crisisGraceMinTurns: 10, crisisSeverityMultiplier: 1.3 });
  });

  it('getChallengeProfileForCiv resolves the per-civ profile', () => {
    expect(getChallengeProfileForCiv(stateWith('veteran', 'explorer'), 'c1').crisisCooldownTurns).toBe(5);
  });
});

describe('city siege destruction era knob (#522)', () => {
  it('carries spec values: easier difficulties tolerate destruction until a later era', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer.citySiegeDestructionEra).toBe(3);
    expect(OPPONENT_CHALLENGE_PROFILES.standard.citySiegeDestructionEra).toBe(2);
    expect(OPPONENT_CHALLENGE_PROFILES.veteran.citySiegeDestructionEra).toBe(1);
  });

  it('getChallengeProfileForCiv resolves the per-civ destruction era threshold', () => {
    expect(getChallengeProfileForCiv(stateWith('explorer', 'veteran'), 'c1').citySiegeDestructionEra).toBe(3);
  });
});

describe('per-civ pending challenge', () => {
  it('setPendingChallengeForCiv stages a change without touching other civs', () => {
    const state = stateWith('standard', undefined);
    const staged = setPendingChallengeForCiv(state, 'c1', 'veteran');
    expect(staged.civilizations.c1.challenge).toBe('standard');
    expect(staged.civilizations.c1.pendingChallenge).toBe('veteran');
  });

  it('setPendingChallengeForCiv cancels a pending change that matches the active value', () => {
    const state = stateWith('standard', undefined);
    (state.civilizations.c1 as { pendingChallenge?: string }).pendingChallenge = 'veteran';
    const cancelled = setPendingChallengeForCiv(state, 'c1', 'standard');
    expect(cancelled.civilizations.c1.pendingChallenge).toBeUndefined();
  });

  it("applyPendingChallengeForCiv applies civId's own pending value once", () => {
    const state = stateWith('standard', undefined);
    (state.civilizations.c1 as { pendingChallenge?: string }).pendingChallenge = 'veteran';
    const applied = applyPendingChallengeForCiv(state, 'c1');
    expect(applied.civilizations.c1.challenge).toBe('veteran');
    expect(applied.civilizations.c1.pendingChallenge).toBeUndefined();
    expect(applyPendingChallengeForCiv(applied, 'c1')).toBe(applied);
  });

  it('applyPendingChallengeForCiv is a no-op for a civ with no pending value', () => {
    const state = stateWith('standard', undefined);
    expect(applyPendingChallengeForCiv(state, 'c1')).toBe(state);
  });
});
