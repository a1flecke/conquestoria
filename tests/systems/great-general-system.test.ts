import { describe, expect, it } from 'vitest';
import {
  getGeneralThreshold,
  addGeneralProgress,
  hasCrossedGeneralThreshold,
  awardGeneralProgress,
  GENERAL_PROGRESS_AWARDS,
  generateGeneralCandidates,
  checkAndQueueGeneralCandidateChoice,
} from '@/systems/great-general-system';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { createNewGame } from '@/core/game-state';

describe('getGeneralThreshold', () => {
  it('the first General costs less than the second', () => {
    expect(getGeneralThreshold(0)).toBeLessThan(getGeneralThreshold(1));
  });

  it('every successive General still costs strictly more in total (always rising)', () => {
    for (let earned = 0; earned < 12; earned++) {
      expect(getGeneralThreshold(earned + 1)).toBeGreaterThan(getGeneralThreshold(earned));
    }
  });

  it('the marginal per-General increase shrinks over time (softened escalation), never flattening to zero', () => {
    const delta1 = getGeneralThreshold(1) - getGeneralThreshold(0);
    const delta5 = getGeneralThreshold(5) - getGeneralThreshold(4);
    const delta10 = getGeneralThreshold(10) - getGeneralThreshold(9);
    expect(delta5).toBeLessThan(delta1);
    expect(delta10).toBeLessThanOrEqual(delta5);
    expect(delta10).toBeGreaterThan(0);
  });

  it('has no difficulty parameter at all (difficulty-invariant by construction)', () => {
    expect(getGeneralThreshold.length).toBe(1);
  });
});

describe('addGeneralProgress', () => {
  it('starts from zero when no prior progress exists', () => {
    expect(addGeneralProgress(undefined, 10)).toEqual({ points: 10, generalsEarned: 0 });
  });

  it('accumulates onto existing progress without resetting generalsEarned', () => {
    expect(addGeneralProgress({ points: 5, generalsEarned: 1 }, 10)).toEqual({ points: 15, generalsEarned: 1 });
  });
});

describe('hasCrossedGeneralThreshold', () => {
  it('is false below the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold - 1, generalsEarned: 0 })).toBe(false);
  });

  it('is true at or above the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold, generalsEarned: 0 })).toBe(true);
  });

  it('uses the threshold for the NEXT General, not the first, once one has already been earned', () => {
    const firstThreshold = getGeneralThreshold(0);
    const secondThreshold = getGeneralThreshold(1);
    // enough points to have crossed the first threshold, but not the second
    const progress = { points: firstThreshold + 1, generalsEarned: 1 };
    expect(progress.points).toBeLessThan(secondThreshold);
    expect(hasCrossedGeneralThreshold(progress)).toBe(false);
  });
});

describe('awardGeneralProgress', () => {
  it('adds the given points onto existing (or absent) progress', () => {
    expect(awardGeneralProgress({ generalProgress: undefined }, GENERAL_PROGRESS_AWARDS.cityCapture)).toEqual({
      points: GENERAL_PROGRESS_AWARDS.cityCapture, generalsEarned: 0,
    });
  });

  it('accumulates onto an existing civ\'s progress', () => {
    expect(awardGeneralProgress({ generalProgress: { points: 10, generalsEarned: 0 } }, 5)).toEqual({
      points: 15, generalsEarned: 0,
    });
  });
});

describe('GENERAL_PROGRESS_AWARDS', () => {
  it('every named bonus award is a positive number smaller than the base threshold (no single bonus insta-earns a General)', () => {
    for (const value of Object.values(GENERAL_PROGRESS_AWARDS)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(getGeneralThreshold(0));
    }
  });
});

function makeGeneralsTestState(seed: string) {
  return createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed });
}

describe('generateGeneralCandidates', () => {
  it('returns 2-3 unique candidates', () => {
    const state = makeGeneralsTestState('gen-candidates-1');
    const candidates = generateGeneralCandidates(state, 'player', 1);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(new Set(candidates.map(c => c.id)).size).toBe(candidates.length);
  });

  it('is deterministic for the same seed', () => {
    const state = makeGeneralsTestState('gen-candidates-2');
    const first = generateGeneralCandidates(state, 'player', 42).map(c => c.id);
    const second = generateGeneralCandidates(state, 'player', 42).map(c => c.id);
    expect(first).toEqual(second);
  });

  it('never includes a General already in this civ\'s history (used-forever exclusion)', () => {
    const state = makeGeneralsTestState('gen-candidates-3');
    const romeCandidate = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: [{ unitId: 'gen1', generalDefinitionId: romeCandidate.id, spawnedTurn: 1, diedTurn: 3 }],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const candidates = generateGeneralCandidates(state, 'player', seed);
      expect(candidates.some(c => c.id === romeCandidate.id)).toBe(false);
    }
  });

  it('falls back to the universal pool when a civ\'s own roster is exhausted', () => {
    const state = makeGeneralsTestState('gen-candidates-4');
    const allRomeIds = GENERAL_DEFINITIONS.filter(g => g.civTypeEligibility.includes('rome')).map(g => g.id);
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: allRomeIds.map((id, i) => ({ unitId: `used${i}`, generalDefinitionId: id, spawnedTurn: 1, diedTurn: 2 })),
    };
    const candidates = generateGeneralCandidates(state, 'player', 7);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.every(c => c.civTypeEligibility.length === 0)).toBe(true);
  });

  it('weights candidates toward the civ\'s current era over many draws', () => {
    // Rome starts era 1; over many seeds, era-1-adjacent entries should be
    // drawn far more often than the era-8 universal-pool entry.
    const state = makeGeneralsTestState('gen-candidates-5');
    let era8Count = 0;
    let era1Count = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const candidates = generateGeneralCandidates(state, 'player', seed);
      for (const c of candidates) {
        if (c.era === 8) era8Count++;
        if (c.era === 1) era1Count++;
      }
    }
    expect(era1Count).toBeGreaterThan(era8Count);
  });
});

describe('checkAndQueueGeneralCandidateChoice', () => {
  it('queues a pending choice once points cross the next threshold', () => {
    const state = makeGeneralsTestState('gen-queue-1');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result.pendingGeneralCandidateChoices).toHaveLength(1);
    expect(result.pendingGeneralCandidateChoices![0]!.civId).toBe('player');
    expect(result.pendingGeneralCandidateChoices![0]!.candidateDefinitionIds.length).toBeGreaterThanOrEqual(2);
    expect(result.pendingGeneralCandidateChoices![0]!.triggerEventLabel).toBe('combat:xp');
  });

  it('does not queue below the threshold', () => {
    const state = makeGeneralsTestState('gen-queue-2');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 5, generalsEarned: 0 } };

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result.pendingGeneralCandidateChoices ?? []).toHaveLength(0);
  });

  it('does not queue a second pending choice for a civ that already has one queued', () => {
    const state = makeGeneralsTestState('gen-queue-3');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };
    state.pendingGeneralCandidateChoices = [{ civId: 'player', candidateDefinitionIds: ['x', 'y'], triggerEventLabel: 'earlier' }];

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result.pendingGeneralCandidateChoices).toHaveLength(1);
    expect(result.pendingGeneralCandidateChoices![0]!.triggerEventLabel).toBe('earlier');
  });

  it('does nothing when the civ has no progress at all', () => {
    const state = makeGeneralsTestState('gen-queue-4');

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result).toBe(state);
  });
});
