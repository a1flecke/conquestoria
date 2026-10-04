import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = new Map<string, unknown>();

vi.mock('@/storage/db', () => ({
  dbGet: vi.fn(async (key: string) => dbState.get(key)),
  dbPut: vi.fn(async (key: string, value: unknown) => { dbState.set(key, value); }),
  dbDelete: vi.fn(async (key: string) => { dbState.delete(key); }),
  dbGetAllKeys: vi.fn(async () => Array.from(dbState.keys())),
}));

import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { loadGame, saveGame } from '@/storage/save-manager';
import {
  getAssessmentChangesForViewer,
  readAssessmentDigest,
  recordAssessmentDigest,
} from '@/systems/assessment-history';
import { hexKey } from '@/systems/hex-utils';
import { AI_A, HUMAN_A, HUMAN_B } from '../helpers/viewer-knowledge-fixtures';
import { twoCityWorld } from '../helpers/assessment-fixtures';

function starveSecondCity(state: GameState): void {
  state.cities['city-b-second'].population = 6;
  for (const coord of state.cities['city-b-second'].ownedTiles) state.map.tiles[hexKey(coord)].terrain = 'desert';
}

describe('assessment digest persistence and timing (#1238)', () => {
  beforeEach(() => dbState.clear());

  it('has no section on the first turn: no digest means no history, and nothing is invented', () => {
    const state = twoCityWorld(true);

    expect(state.assessmentDigestByCiv).toBeUndefined();
    expect(getAssessmentChangesForViewer(state, HUMAN_A)).toEqual([]);
  });

  it('shows what changed after the baseline was recorded, not before', () => {
    const state = twoCityWorld(false);
    const recorded = recordAssessmentDigest(state, HUMAN_A);
    expect(getAssessmentChangesForViewer(recorded, HUMAN_A)).toEqual([]);

    starveSecondCity(recorded);

    const changes = getAssessmentChangesForViewer(recorded, HUMAN_A);
    expect(changes.map(change => change.kind)).toEqual(['new']);
    expect(changes[0].title).toContain('SECOND');
  });

  it('opening the Council (reading) never advances the baseline, so changes survive repeated looks', () => {
    const recorded = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);
    starveSecondCity(recorded);
    const before = JSON.stringify(recorded.assessmentDigestByCiv);

    const first = getAssessmentChangesForViewer(recorded, HUMAN_A);
    const second = getAssessmentChangesForViewer(recorded, HUMAN_A);

    expect(second).toEqual(first);
    expect(first).not.toEqual([]);
    expect(JSON.stringify(recorded.assessmentDigestByCiv)).toBe(before);
  });

  it('advancing the baseline at end of turn clears changes the player has now lived through', () => {
    const recorded = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);
    starveSecondCity(recorded);
    expect(getAssessmentChangesForViewer(recorded, HUMAN_A)).not.toEqual([]);

    const nextTurn = recordAssessmentDigest(recorded, HUMAN_A);

    expect(getAssessmentChangesForViewer(nextTurn, HUMAN_A)).toEqual([]);
  });

  it('does not mutate the state it was given', () => {
    const state = twoCityWorld(true);
    const snapshot = JSON.stringify(state);

    const next = recordAssessmentDigest(state, HUMAN_A);

    expect(JSON.stringify(state)).toBe(snapshot);
    expect(next).not.toBe(state);
  });

  it('round-trips the digest through the real save and load path', async () => {
    const recorded = recordAssessmentDigest(twoCityWorld(false), HUMAN_A);

    await saveGame('slot-digest', 'Digest', recorded);
    const loaded = await loadGame('slot-digest') as GameState;

    // The baseline survives serialization and load normalization untouched...
    expect(loaded.assessmentDigestByCiv).toEqual(recorded.assessmentDigestByCiv);
    expect(readAssessmentDigest(loaded, HUMAN_A)).toEqual(recorded.assessmentDigestByCiv?.[HUMAN_A]);
    // ...and a change made after loading is reported against it.
    starveSecondCity(loaded);
    const changes = getAssessmentChangesForViewer(loaded, HUMAN_A);
    expect(changes.some(change => change.kind === 'new' && change.title.includes('SECOND'))).toBe(true);
  });

  it('an old save without the field loads, hides the section, processes a turn unchanged, and gains history after one end of turn', async () => {
    const old = createNewGame('egypt', 'digest-old-save');
    expect('assessmentDigestByCiv' in old).toBe(false);

    await saveGame('slot-old', 'Old', old);
    const loaded = await loadGame('slot-old') as GameState;
    expect(loaded.assessmentDigestByCiv).toBeUndefined();
    expect(getAssessmentChangesForViewer(loaded, loaded.currentPlayer)).toEqual([]);

    const afterRound = processTurn(loaded, new EventBus());
    // The round never writes a digest: only a human ending their own turn does.
    expect(afterRound.assessmentDigestByCiv).toBeUndefined();

    const afterEndTurn = recordAssessmentDigest(afterRound, afterRound.currentPlayer);
    expect(readAssessmentDigest(afterEndTurn, afterEndTurn.currentPlayer)).toBeDefined();
  });

  it('hot seat: each seat has its own baseline and one seat never reads another\'s', () => {
    const state = twoCityWorld(false);
    const aliceRecorded = recordAssessmentDigest(state, HUMAN_A);
    starveSecondCity(aliceRecorded);

    expect(readAssessmentDigest(aliceRecorded, HUMAN_B)).toBeUndefined();
    expect(getAssessmentChangesForViewer(aliceRecorded, HUMAN_B)).toEqual([]);
    expect(getAssessmentChangesForViewer(aliceRecorded, HUMAN_A)).not.toEqual([]);

    // Writing Bob's baseline touches only Bob's key.
    const bobRecorded = recordAssessmentDigest(aliceRecorded, HUMAN_B);
    expect(bobRecorded.assessmentDigestByCiv?.[HUMAN_A]).toEqual(aliceRecorded.assessmentDigestByCiv?.[HUMAN_A]);
  });

  it('records nothing for an AI civ: the AI never reads this, so it gets no digest', () => {
    const state = twoCityWorld(true);

    expect(recordAssessmentDigest(state, AI_A)).toBe(state);
  });

  it('records nothing for an eliminated civ', () => {
    const state = twoCityWorld(true);
    state.civilizations[HUMAN_A].isEliminated = true;

    expect(recordAssessmentDigest(state, HUMAN_A)).toBe(state);
  });

  describe('a malformed digest is treated as no history, never an error', () => {
    const cases: Array<[string, unknown]> = [
      ['not an object', 'garbage'],
      ['null', null],
      ['an array', []],
      ['missing arrays', { turn: 1 }],
      ['non-numeric turn', { turn: 'x', constraints: [], victory: [] }],
      ['negative turn', { turn: -3, constraints: [], victory: [] }],
      ['a turn that has not happened yet', { turn: 9999, constraints: [], victory: [] }],
      ['an unknown constraint kind', { turn: 1, constraints: [{ kind: 'weather', bucket: 'low' }], victory: [] }],
      ['an unknown bucket', { turn: 1, constraints: [{ kind: 'food', bucket: 'extreme' }], victory: [] }],
      ['a non-string focus city', { turn: 1, constraints: [{ kind: 'food', bucket: 'low', focusCityId: 4 }], victory: [] }],
      ['an unknown victory stage', { turn: 1, constraints: [], victory: [{ id: 'domination', stage: 'won' }] }],
      ['a non-object entry', { turn: 1, constraints: [7], victory: [] }],
    ];

    for (const [label, raw] of cases) {
      it(label, () => {
        const state = twoCityWorld(true);
        state.assessmentDigestByCiv = { [HUMAN_A]: raw as never };

        expect(readAssessmentDigest(state, HUMAN_A)).toBeUndefined();
        expect(getAssessmentChangesForViewer(state, HUMAN_A)).toEqual([]);
      });
    }

    it('and the next end of turn repairs it with a good digest', () => {
      const state = twoCityWorld(true);
      state.assessmentDigestByCiv = { [HUMAN_A]: 'garbage' as never };

      const repaired = recordAssessmentDigest(state, HUMAN_A);

      expect(readAssessmentDigest(repaired, HUMAN_A)).toBeDefined();
    });
  });
});
