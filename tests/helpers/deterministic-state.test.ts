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

  // A non-plain object (Map/Set/Date/class instance) has no own enumerable
  // string keys, so a naive record walk sees `Object.keys(...) === []` on both
  // sides and reports two totally different Maps as EQUAL. That is the worst
  // possible failure mode for a guard helper, and GameState is contractually
  // plain + JSON-serializable (see CLAUDE.md "All game state is a single
  // serializable plain object"), so encountering one is itself a bug worth
  // surfacing loudly rather than silently passing.
  describe('rejects non-plain objects instead of silently comparing them equal', () => {
    it('throws for Maps with different contents rather than reporting them equal', () => {
      expect(() => firstSimulationDivergence(
        { registry: new Map([['a', 1]]) },
        { registry: new Map([['b', 2]]) },
      )).toThrow(/"registry".*is a Map, which is not JSON-serializable/s);
    });

    it('throws for Sets with different contents', () => {
      expect(() => firstSimulationDivergence(
        { seen: new Set(['x']) },
        { seen: new Set(['y']) },
      )).toThrow(/"seen".*is a Set, which is not JSON-serializable/s);
    });

    it('throws for Dates', () => {
      expect(() => firstSimulationDivergence(
        { at: new Date(0) },
        { at: new Date(1) },
      )).toThrow(/"at".*is a Date, which is not JSON-serializable/s);
    });

    it('a class instance is flattened by structuredClone, so it still compares by value', () => {
      // structuredClone drops the prototype (unlike Map/Set/Date, which it
      // preserves), so a class instance arrives here as a plain object and is
      // compared field-by-field rather than rejected. Pinned so nobody
      // "tightens" the guard into rejecting a case that is already safe.
      class Thing { constructor(public n: number) {} }
      expect(firstSimulationDivergence({ t: new Thing(1) }, { t: new Thing(2) })).toBe('t.n');
      expect(firstSimulationDivergence({ t: new Thing(1) }, { t: new Thing(1) })).toBeNull();
    });

    it('names the path so the author can find the offending field', () => {
      expect(() => firstSimulationDivergence(
        { deeply: { nested: { bad: new Set([1]) } } },
        { deeply: { nested: { bad: new Set([2]) } } },
      )).toThrow(/deeply\.nested\.bad/);
    });

    it('still accepts null, arrays, and objects with a null prototype', () => {
      expect(firstSimulationDivergence({ a: null }, { a: null })).toBeNull();
      expect(firstSimulationDivergence({ a: [1, 2] }, { a: [1, 2] })).toBeNull();
      const bare = Object.assign(Object.create(null), { x: 1 });
      const bareToo = Object.assign(Object.create(null), { x: 1 });
      expect(firstSimulationDivergence({ a: bare }, { a: bareToo })).toBeNull();
    });
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
