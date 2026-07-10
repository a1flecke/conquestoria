import { describe, it, expect } from 'vitest';
import { seededLcg, weightedPick } from '@/systems/seeded-lcg';

describe('seededLcg', () => {
  it('is deterministic for the same seed', () => {
    const a = seededLcg(42); const b = seededLcg(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('returns values in [0, 1)', () => {
    const rng = seededLcg(7);
    for (let i = 0; i < 100; i++) { const v = rng(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('weightedPick', () => {
  it('always picks the only positively weighted item', () => {
    const rng = seededLcg(1);
    for (let i = 0; i < 20; i++) expect(weightedPick(['a', 'b'], [0, 1], rng)).toBe('b');
  });
  it('is deterministic', () => {
    expect(weightedPick(['a', 'b', 'c'], [1, 1, 1], seededLcg(5)))
      .toBe(weightedPick(['a', 'b', 'c'], [1, 1, 1], seededLcg(5)));
  });
});
