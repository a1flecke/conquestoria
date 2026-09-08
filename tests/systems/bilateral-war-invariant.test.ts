import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import {
  declareMajorWar,
  makeMajorPeace,
  acceptVassalage,
  isAtWar,
} from '@/systems/diplomacy-system';
import { applyDiplomacyStep } from '@/testing/scenario-steps/diplomacy-step';
import { normalizeBilateralWar } from '@/storage/migrations/steps/bilateral-war';
import { normalizeLoadedState } from '@/storage/save-manager';
import { assertBilateralWar } from '../helpers/save-state-invariants';

// #995 — for every pair of MAJOR civs A and B: A.atWarWith ∋ B ⟺ B.atWarWith ∋ A;
// no duplicates; peace clears both; save normalisation cannot yield a one-sided war.
// The invariant is owned here; `assertBilateralWar` (tests/helpers/save-state-invariants.ts)
// is the shared validator, also run by the save-compat matrix and the AI-playability fixture.

function newGame(seed: string, opponents = 3): GameState {
  return createNewGame({
    civType: 'generic', seed, mapSize: 'large', opponentCount: opponents, gameTitle: 'bilateral-war',
  });
}

function majorIds(state: GameState, n: number): string[] {
  const ids = Object.keys(state.civilizations);
  if (ids.length < n) throw new Error(`need >=${n} major civs, got ${ids.length}`);
  return ids.slice(0, n);
}

describe('#995 assertBilateralWar validator', () => {
  function twoCivStateAtWar(): GameState {
    const state = newGame('995-validator');
    const [a, b] = majorIds(state, 2);
    return declareMajorWar(state, a, b, new EventBus());
  }

  it('passes on a well-formed bilateral war', () => {
    expect(() => assertBilateralWar(twoCivStateAtWar())).not.toThrow();
  });

  it('catches a one-sided war', () => {
    const state = twoCivStateAtWar();
    const [a, b] = majorIds(state, 2);
    state.civilizations[b].diplomacy.atWarWith = []; // drop the reciprocal side
    expect(() => assertBilateralWar(state)).toThrow(/one-sided war: .*\b/);
  });

  it('catches a duplicate entry', () => {
    const state = twoCivStateAtWar();
    const [a, b] = majorIds(state, 2);
    state.civilizations[a].diplomacy.atWarWith = [b, b];
    expect(() => assertBilateralWar(state)).toThrow(/duplicate entry/);
  });

  it('catches a self-directed war', () => {
    const state = newGame('995-self');
    const [a] = majorIds(state, 1);
    state.civilizations[a].diplomacy.atWarWith = [a];
    expect(() => assertBilateralWar(state)).toThrow(/at war with itself/);
  });

  it('catches a war with an unknown major civ id', () => {
    const state = newGame('995-unknown');
    const [a] = majorIds(state, 1);
    state.civilizations[a].diplomacy.atWarWith = ['ai-ghost'];
    expect(() => assertBilateralWar(state)).toThrow(/unknown major civ/);
  });
});

describe('#995 every war-state mutation path stays bilateral', () => {
  it('declareMajorWar writes both sides and dedupes a repeat declaration', () => {
    const state = newGame('995-declare');
    const [a, b] = majorIds(state, 2);
    let next = declareMajorWar(state, a, b, new EventBus());
    expect(isAtWar(next.civilizations[a].diplomacy, b)).toBe(true);
    expect(isAtWar(next.civilizations[b].diplomacy, a)).toBe(true);
    next = declareMajorWar(next, a, b, new EventBus()); // repeat
    expect(next.civilizations[a].diplomacy.atWarWith.filter(id => id === b)).toHaveLength(1);
    expect(() => assertBilateralWar(next)).not.toThrow();
  });

  it('makeMajorPeace clears both sides; repeated peace is a safe no-op', () => {
    const state = newGame('995-peace');
    const [a, b] = majorIds(state, 2);
    let next = declareMajorWar(state, a, b, new EventBus());
    next = makeMajorPeace(next, a, b);
    expect(isAtWar(next.civilizations[a].diplomacy, b)).toBe(false);
    expect(isAtWar(next.civilizations[b].diplomacy, a)).toBe(false);
    expect(makeMajorPeace(next, a, b)).toBe(next); // idempotent
    expect(() => assertBilateralWar(next)).not.toThrow();
  });

  it('a scenario diplomacy step (war then peace) is bilateral', () => {
    const state = newGame('995-scenario');
    const [a, b] = majorIds(state, 2);
    let next = applyDiplomacyStep(state, { kind: 'diplomacy', civA: a, civB: b, status: 'war' });
    expect(isAtWar(next.civilizations[a].diplomacy, b)).toBe(true);
    expect(isAtWar(next.civilizations[b].diplomacy, a)).toBe(true);
    next = applyDiplomacyStep(next, { kind: 'diplomacy', civA: a, civB: b, status: 'peace' });
    expect(() => assertBilateralWar(next)).not.toThrow();
    expect(next.civilizations[a].diplomacy.atWarWith).not.toContain(b);
  });

  it('vassal auto-war onto an overlord\'s enemy stays bilateral on every pair', () => {
    const state = newGame('995-vassal');
    const [overlordId, vassalId, enemyId] = majorIds(state, 3);
    // overlord already at war with enemy
    let next = declareMajorWar(state, overlordId, enemyId, new EventBus());
    // form vassalage overlord<-vassal, then propagate consequences
    const { vassalState, overlordState } = acceptVassalage(
      next.civilizations[vassalId].diplomacy,
      next.civilizations[overlordId].diplomacy,
      vassalId, overlordId, next.turn,
    );
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        [vassalId]: { ...next.civilizations[vassalId], diplomacy: vassalState },
        [overlordId]: { ...next.civilizations[overlordId], diplomacy: overlordState },
      },
    };
    // declareMajorWar runs applyVassalageWarConsequences; re-declare a no-op war to trigger it,
    // or call the exported consequence path via another declare on the overlord.
    next = declareMajorWar(next, overlordId, enemyId, new EventBus());
    expect(() => assertBilateralWar(next)).not.toThrow();
  });

  it('a deterministic multi-civ action sequence keeps the invariant after every step', () => {
    let state = newGame('995-sequence');
    const [a, b, c] = majorIds(state, 3);
    const bus = new EventBus();
    const steps: Array<(s: GameState) => GameState> = [
      s => declareMajorWar(s, a, b, bus),
      s => declareMajorWar(s, a, c, bus),
      s => declareMajorWar(s, b, c, bus),
      s => makeMajorPeace(s, a, b),
      s => declareMajorWar(s, a, b, bus),
      s => makeMajorPeace(s, b, c),
      s => makeMajorPeace(s, a, c),
      s => makeMajorPeace(s, a, b),
    ];
    for (const [i, step] of steps.entries()) {
      state = step(state);
      expect(() => assertBilateralWar(state), `after step ${i}`).not.toThrow();
    }
    // fully at peace again
    for (const id of [a, b, c]) {
      expect(state.civilizations[id].diplomacy.atWarWith).toEqual([]);
    }
  });
});

describe('#995 save normalisation cannot yield a one-sided major war', () => {
  it('normalizeBilateralWar drops orphan / dupe / self entries and passes the validator', () => {
    const state = newGame('995-repair');
    const [a, b, c] = majorIds(state, 3);
    state.civilizations[a].diplomacy.atWarWith = [b, b, a, 'ai-ghost']; // dupe + self + dangling
    state.civilizations[b].diplomacy.atWarWith = [];                    // orphaned a→b
    state.civilizations[c].diplomacy.atWarWith = [a];                   // orphaned c→a

    const repaired = normalizeBilateralWar(state);

    expect(repaired.civilizations[a].diplomacy.atWarWith).toEqual([]);
    expect(repaired.civilizations[c].diplomacy.atWarWith).toEqual([]);
    expect(() => assertBilateralWar(repaired)).not.toThrow();
  });

  it('a legitimate mc- (city-state) war id survives the repair', () => {
    const state = newGame('995-repair-mc');
    const [a] = majorIds(state, 1);
    const mcId = Object.keys(state.minorCivs)[0];
    state.civilizations[a].diplomacy.atWarWith = [mcId, mcId]; // dupe of a legit minor-civ war
    const repaired = normalizeBilateralWar(state);
    expect(repaired.civilizations[a].diplomacy.atWarWith).toEqual([mcId]);
  });

  it('a one-sided war in a persisted save is gone after normalizeLoadedState', () => {
    const state = newGame('995-save-load');
    const [a, b] = majorIds(state, 2);
    state.civilizations[a].diplomacy.atWarWith = [b];
    state.civilizations[b].diplomacy.atWarWith = []; // one-sided on disk
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)) as GameState);
    expect(() => assertBilateralWar(loaded)).not.toThrow();
    expect(loaded.civilizations[a].diplomacy.atWarWith).toEqual([]);
  });
});
