import { describe, expect, it } from 'vitest';
import {
  createSimulationRng,
  type SimulationDomainKey,
} from '@/systems/simulation-rng';
import { createNewGame } from '@/core/game-state';

function draw(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng());
}

describe('#1021 — createSimulationRng', () => {
  it('returns a deterministic stream: repeated calls advance, not repeat', () => {
    const state = { gameId: 'game-1', turn: 5 };
    const rng = createSimulationRng(state, { domain: 'test-domain', actorId: 'unit-1' });
    const first = rng();
    const second = rng();
    expect(first).not.toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });

  it('same state + same domain key => the same sequence', () => {
    const state = { gameId: 'game-1', turn: 5 };
    const key: SimulationDomainKey = { domain: 'crisis-spawn', eventId: 'crisis-3', targetId: 'city-9' };
    const seqA = draw(createSimulationRng(state, key), 5);
    const seqB = draw(createSimulationRng(state, key), 5);
    expect(seqA).toEqual(seqB);
  });

  it('different gameId => a divergent sequence for an otherwise identical key', () => {
    const key: SimulationDomainKey = { domain: 'village-visit', actorId: 'unit-1', targetId: 'village-0' };
    const seqA = draw(createSimulationRng({ gameId: 'game-1', turn: 5 }, key), 5);
    const seqB = draw(createSimulationRng({ gameId: 'game-2', turn: 5 }, key), 5);
    expect(seqA).not.toEqual(seqB);
  });

  it('different domain => an independently-derived stream for the same actor/turn', () => {
    const state = { gameId: 'game-1', turn: 5 };
    const seqA = draw(createSimulationRng(state, { domain: 'crisis-spawn', actorId: 'civ-1' }), 5);
    const seqB = draw(createSimulationRng(state, { domain: 'threat-pressure-spawn', actorId: 'civ-1' }), 5);
    expect(seqA).not.toEqual(seqB);
  });

  it('different full actor ids => independently-derived streams (the tribal-village/#983 regression shape)', () => {
    const state = { gameId: 'game-1', turn: 5 };
    // Every normal unit id in this codebase starts with 'u' -- charCodeAt(0)
    // truncation collapsed exactly this pair onto the same seed (#983).
    const seqA = draw(createSimulationRng(state, { domain: 'village-visit', actorId: 'unit-1', targetId: 'village-0' }), 5);
    const seqB = draw(createSimulationRng(state, { domain: 'village-visit', actorId: 'unit-42', targetId: 'village-0' }), 5);
    expect(seqA).not.toEqual(seqB);
  });

  it('different target ids => independently-derived streams for the same actor', () => {
    const state = { gameId: 'game-1', turn: 5 };
    const seqA = draw(createSimulationRng(state, { domain: 'village-visit', actorId: 'unit-1', targetId: 'village-0' }), 5);
    const seqB = draw(createSimulationRng(state, { domain: 'village-visit', actorId: 'unit-1', targetId: 'village-9' }), 5);
    expect(seqA).not.toEqual(seqB);
  });

  it('an ordinal differentiates otherwise-identical repeated draws in one turn', () => {
    const state = { gameId: 'game-1', turn: 5 };
    const first = draw(createSimulationRng(state, { domain: 'crisis-effect', eventId: 'crisis-1', ordinal: 0 }), 3);
    const second = draw(createSimulationRng(state, { domain: 'crisis-effect', eventId: 'crisis-1', ordinal: 1 }), 3);
    expect(first).not.toEqual(second);
  });

  it('drawing from another domain does not perturb this domain\'s stream (domain-stream stability)', () => {
    const state = { gameId: 'game-1', turn: 5 };
    const key: SimulationDomainKey = { domain: 'religion-founding', actorId: 'civ-1' };

    const untouched = draw(createSimulationRng(state, key), 3);

    // Constructing and fully draining an unrelated domain's stream first must
    // not change what this domain's own factory call produces -- each call
    // to createSimulationRng is an independent stream, not a shared cursor.
    const other = createSimulationRng(state, { domain: 'threat-pressure-response', actorId: 'civ-1' });
    for (let i = 0; i < 50; i++) other();
    const afterInterference = draw(createSimulationRng(state, key), 3);

    expect(afterInterference).toEqual(untouched);
  });

  it('always includes gameId even when the caller forgets a fallback', () => {
    // A caller with no explicit gameId (a legacy/incomplete state) must still
    // get *a* deterministic value -- the factory owns the fallback, not the caller.
    const rng = createSimulationRng({ gameId: undefined, turn: 1 }, { domain: 'x', actorId: 'y' });
    expect(typeof rng()).toBe('number');
  });

  it('type level: a bare number cannot be passed as the domain key', () => {
    const state = { gameId: 'game-1', turn: 1 };
    // @ts-expect-error a bare integer seed is exactly the ambiguity this API removes
    createSimulationRng(state, 42);
  });

  it('type level: a domain with no identity field at all is rejected', () => {
    const state = { gameId: 'game-1', turn: 1 };
    // @ts-expect-error `{ domain }` alone is the "seed = f(turn) alone" shape that caused #983
    createSimulationRng(state, { domain: 'no-identity' });
  });

  it('type level: a key missing `domain` entirely is rejected', () => {
    const state = { gameId: 'game-1', turn: 1 };
    // @ts-expect-error every domain key must name its subsystem
    createSimulationRng(state, { actorId: 'unit-1' });
  });

  it('an ordinal alone satisfies the at-least-one-identity requirement', () => {
    const state = { gameId: 'game-1', turn: 1 };
    const rng = createSimulationRng(state, { domain: 'x', ordinal: 0 });
    expect(typeof rng()).toBe('number');
  });
});

describe('#1021 — real GameState integration', () => {
  it('createNewGame states with different seeds diverge for a realistic domain key', () => {
    const a = createNewGame(undefined, 'rng-seed-a', 'small');
    const b = createNewGame(undefined, 'rng-seed-b', 'small');
    expect(a.gameId).not.toBe(b.gameId);

    const key: SimulationDomainKey = { domain: 'village-visit', actorId: 'unit-1', targetId: 'village-0' };
    const seqA = draw(createSimulationRng(a, key), 5);
    const seqB = draw(createSimulationRng(b, key), 5);
    expect(seqA).not.toEqual(seqB);
  });

  it('two createNewGame calls with the identical explicit seed reproduce the same stream', () => {
    const a = createNewGame(undefined, 'rng-seed-same', 'small');
    const b = createNewGame(undefined, 'rng-seed-same', 'small');
    expect(a.gameId).toBe(b.gameId);

    const key: SimulationDomainKey = { domain: 'crisis-spawn', eventId: 'crisis-1', targetId: 'city-1' };
    expect(draw(createSimulationRng(a, key), 5)).toEqual(draw(createSimulationRng(b, key), 5));
  });

  it('does not read or mutate any field of state beyond gameId/turn', () => {
    const state = createNewGame(undefined, 'rng-purity-check', 'small');
    const before = JSON.stringify(state);
    createSimulationRng(state, { domain: 'x', actorId: 'y' })();
    expect(JSON.stringify(state)).toBe(before);
  });
});
