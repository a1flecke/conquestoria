import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  getGeneralThreshold,
  generateGeneralCandidates,
  checkAndQueueGeneralCandidateChoice,
  spawnGeneralForCiv,
} from '@/systems/great-general-system';

function makeState(seed: string) {
  return createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Invariance Test', seed });
}

describe('#544 MR3 — difficulty invariance', () => {
  it('getGeneralThreshold has no difficulty parameter at all -- nothing to vary in the first place', () => {
    expect(getGeneralThreshold.length).toBe(1);
  });

  it('candidate generation produces identical results regardless of opponentChallenge', () => {
    const state = makeState('gen-invariance-1');
    const explorer = generateGeneralCandidates({ ...state, opponentChallenge: 'explorer' }, 'player', 5).map(c => c.id);
    const veteran = generateGeneralCandidates({ ...state, opponentChallenge: 'veteran' }, 'player', 5).map(c => c.id);
    expect(explorer).toEqual(veteran);
  });

  it('threshold-crossing detection produces identical results regardless of opponentChallenge', () => {
    const state = makeState('gen-invariance-2');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };
    const explorer = checkAndQueueGeneralCandidateChoice({ ...state, opponentChallenge: 'explorer' }, 'player', 'x', 5);
    const veteran = checkAndQueueGeneralCandidateChoice({ ...state, opponentChallenge: 'veteran' }, 'player', 'x', 5);
    expect(explorer.pendingGeneralCandidateChoices).toEqual(veteran.pendingGeneralCandidateChoices);
  });
});

describe('#544 MR3 — hot-seat privacy', () => {
  it('a pending candidate choice for one civ is never surfaced or resolvable for another civ', () => {
    const state = makeState('gen-privacy-1');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };
    const withPending = checkAndQueueGeneralCandidateChoice(state, 'player', 'test', 1);
    const aiId = Object.keys(withPending.civilizations).find(id => id !== 'player')!;

    expect(withPending.pendingGeneralCandidateChoices!.every(choice => choice.civId === 'player')).toBe(true);
    expect(withPending.pendingGeneralCandidateChoices!.some(choice => choice.civId === aiId)).toBe(false);
  });

  it('spawning a General for one civ never touches another civ\'s pending choice, progress, or history', () => {
    const state = makeState('gen-privacy-2');
    const capital = { id: 'capital-1', owner: 'player', position: { q: 0, r: 0 } } as any;
    state.cities = { 'capital-1': capital };
    state.civilizations.player = { ...state.civilizations.player, cities: ['capital-1'] };
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.pendingGeneralCandidateChoices = [
      { civId: 'player', candidateDefinitionIds: ['gen_caesar'], triggerEventLabel: 'a' },
      { civId: aiId, candidateDefinitionIds: ['gen_ramesses'], triggerEventLabel: 'b' },
    ];
    state.civilizations[aiId] = { ...state.civilizations[aiId], generalProgress: { points: 42, generalsEarned: 0 } };

    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');

    expect(result.pendingGeneralCandidateChoices).toEqual([
      { civId: aiId, candidateDefinitionIds: ['gen_ramesses'], triggerEventLabel: 'b' },
    ]);
    expect(result.civilizations[aiId].generalProgress).toEqual({ points: 42, generalsEarned: 0 });
    expect(result.civilizations[aiId].generalHistory ?? []).toEqual([]);
  });
});
