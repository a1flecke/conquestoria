import { describe, expect, it } from 'vitest';
import { solveMinCostAssignment } from '@/systems/min-cost-assignment';
import { createRng } from '@/systems/map-generator';

function bruteForceMinimum(cost: number[][]): number {
  const n = cost.length;
  let best = Infinity;
  const used = new Array<boolean>(n).fill(false);
  const visit = (row: number, total: number) => {
    if (row === n) { best = Math.min(best, total); return; }
    for (let column = 0; column < n; column++) {
      if (used[column]) continue;
      used[column] = true;
      visit(row + 1, total + cost[row][column]);
      used[column] = false;
    }
  };
  visit(0, 0);
  return best;
}

describe('solveMinCostAssignment', () => {
  it('finds the cheapest assignment, matching an exhaustive search on random matrices', () => {
    const rng = createRng('assignment');
    for (let trial = 0; trial < 60; trial++) {
      const n = 1 + (trial % 7);
      const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.round((rng() * 20 - 5) * 100) / 100));
      const columnOf = solveMinCostAssignment(cost);
      expect(new Set(columnOf).size).toBe(n);
      const total = columnOf.reduce((sum, column, row) => sum + cost[row][column], 0);
      expect(total).toBeCloseTo(bruteForceMinimum(cost), 9);
    }
  });

  it('keeps the diagonal when it is already the cheapest', () => {
    expect(solveMinCostAssignment([[0, 1, 1], [1, 0, 1], [1, 1, 0]])).toEqual([0, 1, 2]);
  });

  it('handles an empty matrix and refuses a ragged one', () => {
    expect(solveMinCostAssignment([])).toEqual([]);
    expect(() => solveMinCostAssignment([[1, 2], [3]])).toThrow();
  });
});
