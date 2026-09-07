import { describe, it, expect } from 'vitest';
import {
  SIMULATION_EQUIVALENCE_EXCLUSIONS,
  stripForSimulationEquivalence,
  firstSimulationDivergence,
  assertSimulationEquivalent,
} from './deterministic-state';

// #1004 Contract helper meta-tests. These are cheap and stay in the fast tier;
// the heavy whole-simulation trajectory tests that USE the helper live in
// tests/app/simulation-determinism.test.ts (slow tier).

describe('#1004 deterministic-state helper — exclusion list', () => {
  it('excludes exactly the two documented per-persistence identity/metadata fields and nothing else', () => {
    // Guard against "strip another field to make a test green". Every entry
    // here must have a written justification in deterministic-state.ts.
    expect([...SIMULATION_EQUIVALENCE_EXCLUSIONS].sort()).toEqual([
      'playthroughId',
      'saveSchemaVersion',
    ]);
  });

  it('strips only the excluded top-level keys and leaves every other field intact', () => {
    const base = {
      turn: 4,
      gameId: 'game-1',
      playthroughId: 'playthrough-1-1699999999999',
      saveSchemaVersion: 28,
      cities: { 'city-1': { population: 3 } },
    };

    const stripped = stripForSimulationEquivalence(base);

    expect(stripped).toEqual({
      turn: 4,
      gameId: 'game-1',
      cities: { 'city-1': { population: 3 } },
    });
  });

  it('does not mutate the input state', () => {
    const base = { turn: 1, playthroughId: 'p', saveSchemaVersion: 28 };
    stripForSimulationEquivalence(base);
    expect(base.playthroughId).toBe('p');
    expect(base.saveSchemaVersion).toBe(28);
  });
});

describe('#1004 firstSimulationDivergence', () => {
  it('returns null when states are equal apart from excluded fields', () => {
    const a = { turn: 1, playthroughId: 'x', saveSchemaVersion: 1, units: { 'unit-1': { hp: 10 } } };
    const b = { turn: 1, playthroughId: 'y', saveSchemaVersion: 28, units: { 'unit-1': { hp: 10 } } };
    expect(firstSimulationDivergence(a, b)).toBeNull();
  });

  it('points at the dotted path of the first differing leaf', () => {
    const a = { turn: 1, units: { 'unit-1': { hp: 10 } } };
    const b = { turn: 1, units: { 'unit-1': { hp: 7 } } };
    expect(firstSimulationDivergence(a, b)).toBe('units.unit-1.hp');
  });

  it('reports an array length mismatch before walking elements', () => {
    expect(firstSimulationDivergence({ q: [1, 2, 3] }, { q: [1, 2] })).toBe('q.length');
  });

  it('reports a differing array element by index', () => {
    expect(firstSimulationDivergence({ q: [1, 2, 3] }, { q: [1, 9, 3] })).toBe('q.1');
  });

  it('reports a key present on exactly one side', () => {
    expect(firstSimulationDivergence({ a: 1 }, { a: 1, b: 2 })).toBe('b');
    expect(firstSimulationDivergence({ a: 1, b: 2 }, { a: 1 })).toBe('b');
  });

  it('distinguishes null from an object at the same path', () => {
    expect(firstSimulationDivergence({ a: null }, { a: {} })).toBe('a');
  });

  it('treats an undefined-valued key as absent (JSON.stringify drops it on the real save path)', () => {
    expect(firstSimulationDivergence({ a: 1, b: undefined }, { a: 1 })).toBeNull();
    expect(firstSimulationDivergence({ nested: { x: undefined } }, { nested: {} })).toBeNull();
    // ...but a real value difference is still caught.
    expect(firstSimulationDivergence({ a: 1, b: undefined }, { a: 1, b: 2 })).toBe('b');
  });
});

describe('#1004 assertSimulationEquivalent', () => {
  it('does not throw for simulation-equivalent states', () => {
    expect(() =>
      assertSimulationEquivalent(
        { turn: 1, playthroughId: 'a', saveSchemaVersion: 1 },
        { turn: 1, playthroughId: 'b', saveSchemaVersion: 28 },
      ),
    ).not.toThrow();
  });

  it('throws an error naming the divergent path and both values', () => {
    expect(() => assertSimulationEquivalent({ turn: 1 }, { turn: 2 })).toThrow(/turn/);
  });

  it('includes the caller-supplied label in the failure message', () => {
    expect(() =>
      assertSimulationEquivalent({ turn: 1 }, { turn: 2 }, 'save/reload continuity'),
    ).toThrow(/save\/reload continuity/);
  });
});
