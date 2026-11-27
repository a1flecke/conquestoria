/**
 * Minimum-cost assignment of n rows to n columns (the Hungarian algorithm, O(n^3)). Deterministic: the same matrix
 * always gives the same assignment, so callers can feed it seeded costs. Returns `columnOf[row]`.
 */
export function solveMinCostAssignment(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  for (const row of cost) {
    if (row.length !== n) throw new Error('solveMinCostAssignment needs a square matrix');
  }
  // 1-indexed potentials and matching, as in the classic formulation; column 0 is the virtual start.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const rowOfColumn = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let row = 1; row <= n; row++) {
    rowOfColumn[0] = row;
    let column0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[column0] = true;
      const row0 = rowOfColumn[column0];
      let delta = Infinity;
      let column1 = 0;
      for (let column = 1; column <= n; column++) {
        if (used[column]) continue;
        const reduced = cost[row0 - 1][column - 1] - u[row0] - v[column];
        if (reduced < minv[column]) {
          minv[column] = reduced;
          way[column] = column0;
        }
        if (minv[column] < delta) {
          delta = minv[column];
          column1 = column;
        }
      }
      for (let column = 0; column <= n; column++) {
        if (used[column]) {
          u[rowOfColumn[column]] += delta;
          v[column] -= delta;
        } else {
          minv[column] -= delta;
        }
      }
      column0 = column1;
    } while (rowOfColumn[column0] !== 0);
    do {
      const column1 = way[column0];
      rowOfColumn[column0] = rowOfColumn[column1];
      column0 = column1;
    } while (column0 !== 0);
  }
  const columnOf = new Array<number>(n).fill(-1);
  for (let column = 1; column <= n; column++) {
    if (rowOfColumn[column] > 0) columnOf[rowOfColumn[column] - 1] = column - 1;
  }
  return columnOf;
}
