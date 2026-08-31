import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  getGeneralThreshold,
  generateGeneralCandidates,
  checkAndQueueGeneralCandidateChoice,
  spawnGeneralForCiv,
} from '@/systems/great-general-system';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

function makeState(seed: string) {
  return createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Invariance Test', seed });
}

/** Burn every authored general the civ could be offered, forcing the #888
 * generated-fallback path. */
function exhaustAuthored(state: ReturnType<typeof makeState>, civId = 'player') {
  state.civilizations[civId] = {
    ...state.civilizations[civId]!,
    generalHistory: GENERAL_DEFINITIONS.map((g, i) => ({
      unitId: `u${i}`, generalDefinitionId: g.id, spawnedTurn: 1, diedTurn: 2, outcome: 'died' as const,
    })),
  };
  return state;
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

describe('#888 — generated-fallback path preserves the MR3 invariants', () => {
  it('the generated candidate set is identical across difficulties (no opponentChallenge input)', () => {
    const base = exhaustAuthored(makeState('gen888-inv-diff'));
    const explorer = generateGeneralCandidates({ ...base, opponentChallenge: 'explorer' }, 'player', 5);
    const veteran = generateGeneralCandidates({ ...base, opponentChallenge: 'veteran' }, 'player', 5);
    expect(explorer.map(c => c.id)).toEqual(veteran.map(c => c.id));
    expect(explorer.map(c => c.name)).toEqual(veteran.map(c => c.name));
    expect(explorer.every(c => c.origin === 'generated')).toBe(true);
  });

  it('queueing after exhaustion persists the generated identities and stays scoped to the earning civ', () => {
    const state = exhaustAuthored(makeState('gen888-inv-privacy'));
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 99999, generalsEarned: 20 } };
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'round-end', 5);

    // pending choice is the player's only
    expect(result.pendingGeneralCandidateChoices!.every(c => c.civId === 'player')).toBe(true);
    // every offered id is now resolvable from the persisted registry
    const ids = result.pendingGeneralCandidateChoices![0]!.candidateDefinitionIds;
    expect(ids).toHaveLength(3);
    expect(ids.every(id => result.generatedGenerals?.[id]?.origin === 'generated')).toBe(true);
    // the AI civ's own registry view is untouched (no leakage of player identities into ai history/progress)
    expect(result.civilizations[aiId].generalHistory ?? []).toEqual([]);
    expect(result.civilizations[aiId].generalProgress).toBeUndefined();
  });

  it('a generated General can be spawned and recorded in history like an authored one', () => {
    const state = exhaustAuthored(makeState('gen888-inv-spawn'));
    const capital = { id: 'cap', owner: 'player', position: { q: 0, r: 0 } } as any;
    state.cities = { cap: capital };
    state.civilizations.player = { ...state.civilizations.player, cities: ['cap'], generalProgress: { points: 99999, generalsEarned: 20 } };

    const queued = checkAndQueueGeneralCandidateChoice(state, 'player', 'round-end', 5);
    const chosenId = queued.pendingGeneralCandidateChoices![0]!.candidateDefinitionIds[0]!;
    const spawned = spawnGeneralForCiv(queued, 'player', chosenId);

    const unit = Object.values(spawned.units).find(u => u.type === 'great_general');
    expect(unit?.generalDefinitionId).toBe(chosenId);
    expect(spawned.civilizations.player.generalHistory!.some(e => e.generalDefinitionId === chosenId)).toBe(true);
    // and its identity is still resolvable afterwards (registry carried through)
    expect(spawned.generatedGenerals?.[chosenId]?.name).toBeTruthy();
  });
});
