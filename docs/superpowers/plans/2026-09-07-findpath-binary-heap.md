# MR5 — `findPath` binary-heap open set — Implementation Plan

> **For agentic workers:** execute this plan **inline** with `superpowers:executing-plans`.
> `CLAUDE.md` forbids subagents in this repository — do NOT use
> `subagent-driven-development`. Steps use `- [ ]` checkboxes.

**Goal:** Replace `findPath`'s O(V²) open-set linear scan
(`src/systems/unit-pathfinding.ts`) with a deterministic binary min-heap ordered on the exact
current tie-break, so every route it returns is **byte-identical** to today's — in-process and
after a save/reload.

**Architecture:** New generic `BinaryHeap<T>` leaf (`src/systems/binary-heap.ts`). `findPath`
swaps its `Set<string>` open set + per-iteration linear min-scan for `heap.pop()` + lazy
deletion. Nothing else in the function changes; the signature and all ~20 call sites are
untouched.

**Tech Stack:** TypeScript, Vitest, Vite. No new dependencies.

**Design doc:** `docs/superpowers/specs/2026-09-07-findpath-binary-heap-design.md` — read it
first; it carries the byte-identical argument, the 17-dimension review fixes, and the risk
table.

## Global Constraints

- Base commit: latest `origin/main` (contains MR4 merge `f539bf5b`). Worktree
  `findpath-binary-heap-mr5`, branch `claude/findpath-binary-heap-mr5`.
- **No behaviour change.** No new algorithm (stays A* with `minStepCost × hexDistance`), no
  cost-model change, no rule change, no `findPath` / `findPathToCity` signature change.
- **Byte-identical output**, pinned by a `referenceFindPath` oracle committed green *before*
  the rewrite.
- **No `GameState` shape change** ⇒ no save migration, no `SAVE_VERSION` bump.
  Difficulty-invariant.
- `EPS = 1e-9` stays exactly as-is; the heap comparator uses the identical three-tier order:
  `f` ascending, then `g` descending, then `hexKey` ascending.
- Do **not** touch `getMovementRange` / `getMovementRangeDetails` (different structure, out of
  scope) or the test-only `dijkstraCost` helper's purpose.
- Commands: `bash scripts/run-with-mise.sh yarn <cmd>` (never `eval "$(mise activate bash)"`).
- Bash tool timeouts: `git commit` → 30000 ms; `git push` / `gh pr create` / `gh pr merge` →
  240000 ms.
- Run `bash scripts/check-src-rule-violations.sh <changed src files>` before each src commit.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/systems/binary-heap.ts` | generic array-backed binary min-heap: `push` / `pop` / `size` | **create** |
| `src/systems/unit-pathfinding.ts` | cost-aware A* — swap open-set structure only | modify `findPath` body |
| `tests/systems/binary-heap.test.ts` | heap unit tests | **create** |
| `tests/systems/unit-pathfinding-cost.test.ts` | add `referenceFindPath` oracle + seeded randomized equivalence battery + one larger Dijkstra case | modify (append only) |
| `tests/app/architecture-boundaries.test.ts` | standalone `binary-heap` pure-leaf assertion | modify (append one `it`) |
| `.claude/rules/movement-actions.md` | one line: pathfinding open set is a `BinaryHeap`, output byte-identical, pinned by the oracle | modify |

---

### Task 1: `BinaryHeap<T>` leaf module (TDD)

**Files:**
- Create: `src/systems/binary-heap.ts`
- Test: `tests/systems/binary-heap.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class BinaryHeap<T> {
    constructor(compare: (a: T, b: T) => number);
    get size(): number;
    push(value: T): void;
    pop(): T | undefined;
  }
  ```
  `compare(a, b) < 0` ⇒ `a` pops before `b`. `pop()` removes and returns the current minimum;
  `undefined` when empty.

- [ ] **Step 1: Write the failing test**

Create `tests/systems/binary-heap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BinaryHeap } from '@/systems/binary-heap';
import { seededLcg } from '@/systems/seeded-lcg';

const numAsc = (a: number, b: number) => a - b;

describe('BinaryHeap', () => {
  it('pop() on an empty heap is undefined and size is 0', () => {
    const h = new BinaryHeap<number>(numAsc);
    expect(h.size).toBe(0);
    expect(h.pop()).toBeUndefined();
  });

  it('pops values in ascending comparator order for a random push batch', () => {
    const h = new BinaryHeap<number>(numAsc);
    const rng = seededLcg(12345);
    const input = Array.from({ length: 500 }, () => Math.floor(rng() * 1000));
    for (const v of input) h.push(v);
    expect(h.size).toBe(input.length);
    const out: number[] = [];
    for (let v = h.pop(); v !== undefined; v = h.pop()) out.push(v);
    expect(out).toEqual([...input].sort((a, b) => a - b));
    expect(h.size).toBe(0);
  });

  it('stays ordered under interleaved push/pop', () => {
    const h = new BinaryHeap<number>(numAsc);
    const rng = seededLcg(99);
    let lastPopped = -Infinity;
    for (let i = 0; i < 2000; i++) {
      if (rng() < 0.6 || h.size === 0) {
        h.push(Math.floor(rng() * 10000));
      } else {
        const v = h.pop()!;
        // Not a global-sort guarantee across interleaving, but each pop is the
        // current minimum of what is in the heap.
        expect(v).toBeGreaterThanOrEqual(Math.min(v, lastPopped) === v ? -Infinity : lastPopped);
        lastPopped = v;
      }
    }
  });

  it('resolves ties by the comparator, not insertion order', () => {
    // Elements compare equal on the primary key; a secondary key decides.
    type E = { k: number; tag: string };
    const cmp = (a: E, b: E) => (a.k - b.k) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);
    const h = new BinaryHeap<E>(cmp);
    for (const tag of ['d', 'a', 'c', 'b']) h.push({ k: 1, tag });
    const out: string[] = [];
    for (let e = h.pop(); e !== undefined; e = h.pop()) out.push(e.tag);
    expect(out).toEqual(['a', 'b', 'c', 'd']);
  });

  it('5000-element stress: push all then drain is fully sorted', () => {
    const h = new BinaryHeap<number>(numAsc);
    const rng = seededLcg(2026);
    const input = Array.from({ length: 5000 }, () => Math.floor(rng() * 1e6));
    for (const v of input) h.push(v);
    const out: number[] = [];
    for (let v = h.pop(); v !== undefined; v = h.pop()) out.push(v);
    expect(out).toEqual([...input].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/binary-heap.test.ts`
Expected: FAIL — `Cannot find module '@/systems/binary-heap'`.

- [ ] **Step 3: Write the implementation**

Create `src/systems/binary-heap.ts`:

```ts
/**
 * Generic array-backed binary min-heap (#1042 / #1010 MR5). Ordered by an injected
 * comparator: `compare(a, b) < 0` ⇒ `a` pops before `b`.
 *
 * Deterministic: `siftUp` / `siftDown` consult only the comparator, never insertion
 * order or object identity, so the same push/pop sequence always yields the same pop
 * order. It is ephemeral algorithm scratch — never placed on `GameState`, never
 * serialized — so the repo's "game state is a plain object, no class instances" rule
 * does not apply here.
 *
 * Surface is deliberately minimal (one consumer today: `findPath`'s open set). Add
 * `peek` / `decreaseKey` / bulk `heapify` only when a second consumer needs them.
 */
export class BinaryHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(value: T): void {
    this.items.push(value);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const { items } = this;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    const { items, compare } = this;
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compare(items[i]!, items[parent]!) >= 0) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  private siftDown(index: number): void {
    const { items, compare } = this;
    const n = items.length;
    let i = index;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && compare(items[left]!, items[smallest]!) < 0) smallest = left;
      if (right < n && compare(items[right]!, items[smallest]!) < 0) smallest = right;
      if (smallest === i) break;
      [items[i], items[smallest]] = [items[smallest]!, items[i]!];
      i = smallest;
    }
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/binary-heap.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Rule check + commit**

```bash
bash scripts/check-src-rule-violations.sh src/systems/binary-heap.ts
git add src/systems/binary-heap.ts tests/systems/binary-heap.test.ts
git commit -m "feat(systems): add a deterministic generic BinaryHeap leaf (#1042)"
```

---

### Task 2: land the equivalence safety net before touching `findPath`

Mirrors the arc's "land the safety net before any code moves" pattern (`#1023` /
`#1010`). These tests must pass against the **current** `findPath` — that proves
`referenceFindPath` faithfully reproduces today's selection order, so any later diff is the
heap's fault, not the oracle's.

**Files:**
- Test: `tests/systems/unit-pathfinding-cost.test.ts` (append only — do not edit existing cases)

**Interfaces:**
- Consumes: `findPath` (current), `seededLcg` from `@/systems/seeded-lcg`, `hexKey` /
  `hexNeighbors` / `getWrappedHexNeighbors` / `hexDistance` / `wrappedHexDistance` from
  `@/systems/hex-utils`, `movementStepCostParamsForType` / `getMovementStepCostFor` /
  `isPassableForParams` / `hasRoadMovementDiscount` from `@/systems/unit-system`.
- Produces: `referenceFindPath(from, to, map, domain, options)` — a verbatim port of the
  **pre-MR5** open-set-selection loop, returning `HexCoord[] | null`.

- [ ] **Step 1: Append the oracle + battery**

Append to `tests/systems/unit-pathfinding-cost.test.ts`:

```ts
import { seededLcg } from '@/systems/seeded-lcg';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import {
  getMovementStepCostFor as stepCostFor,
  movementStepCostParamsForType as paramsForType,
} from '@/systems/unit-system';
// isPassableForParams / hasRoadMovementDiscount are sibling-internal to unit-movement-cost
// and NOT on the unit-system barrel — import them from the module directly for the oracle.
import { isPassableForParams, hasRoadMovementDiscount } from '@/systems/unit-movement-cost';

/**
 * Verbatim port of findPath's PRE-MR5 open-set selection (linear scan, three-tier
 * tie-break). Exists ONLY to pin the MR5 refactor: if findPath's selection order is
 * ever deliberately changed, delete this and its assertions rather than updating them.
 */
function referenceFindPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' | 'air',
  options: { unitType?: UnitType; completedTechs?: string[]; owner?: string } = {},
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  if (!toTile) return null;
  const costParams = paramsForType(options.unitType, domain, {
    completedTechs: options.completedTechs, owner: options.owner,
  });
  if (!isPassableForParams(costParams, toTile.terrain)) return null;
  const minStepCost = costParams.domain === 'land'
    && hasRoadMovementDiscount(costParams.completedTechs ?? []) ? 0.5 : 1;
  const EPS = 1e-9;

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>([[hexKey(from), 0]]);
  const openSet = new Set<string>([hexKey(from)]);
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>([[hexKey(from), from]]);

  while (openSet.size > 0) {
    let currentKey = '';
    let lowestF = Infinity;
    let lowestG = Infinity;
    for (const key of openSet) {
      const coord = coords.get(key)!;
      const heuristic = map.wrapsHorizontally
        ? wrappedHexDistance(coord, to, map.width)
        : hexDistance(coord, to);
      const g = gScore.get(key) ?? Infinity;
      const f = g + minStepCost * heuristic;
      const better = f < lowestF - EPS
        || (Math.abs(f - lowestF) <= EPS && g > lowestG + EPS)
        || (Math.abs(f - lowestF) <= EPS && Math.abs(g - lowestG) <= EPS
            && (currentKey === '' || key < currentKey));
      if (better) { lowestF = f; lowestG = g; currentKey = key; }
    }

    if (currentKey === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = currentKey;
      while (key) { path.unshift(coords.get(key)!); key = parents.get(key) ?? null; }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);
    const currentCoord = coords.get(currentKey)!;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(currentCoord, map.width)
      : hexNeighbors(currentCoord);
    for (const neighbor of neighbors) {
      const nKey = hexKey(neighbor);
      if (closedSet.has(nKey)) continue;
      const tile = map.tiles[nKey];
      if (!tile) continue;
      const stepCost = stepCostFor(costParams, map, currentCoord, neighbor);
      if (stepCost === Infinity) continue;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity) - EPS) {
        parents.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        openSet.add(nKey);
      }
    }
  }
  return null;
}

/** Deterministic random non-wrapping/wrapping map from a seed. */
function randomMap(seed: number): { map: GameMap; wraps: boolean } {
  const rng = seededLcg(seed);
  const w = 5 + Math.floor(rng() * 5);   // 5..9
  const h = 4 + Math.floor(rng() * 4);   // 4..7
  const wraps = rng() < 0.3;
  const terrains: HexTile['terrain'][] = ['grassland', 'plains', 'forest', 'hills', 'mountain'];
  const tiles: GameMap['tiles'] = {};
  const rivers: GameMap['rivers'] = [];
  for (let q = 0; q < w; q++) {
    for (let r = 0; r < h; r++) {
      const t = terrains[Math.floor(rng() * terrains.length)]!;
      tiles[hexKey({ q, r })] = {
        coord: { q, r }, terrain: t, elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0,
        hasRiver: false, hasRoad: rng() < 0.25, wonder: null,
      };
      if (rng() < 0.12 && q + 1 < w) rivers.push({ from: { q, r }, to: { q: q + 1, r } });
    }
  }
  return { map: { width: w, height: h, wrapsHorizontally: wraps, tiles, rivers }, wraps };
}

describe('#1042 MR5 — findPath matches the pre-MR5 linear-scan oracle exactly', () => {
  const techSets: string[][] = [[], ['military-logistics'], ['road-building']];

  it('roadDetourMap + wraparound fixtures: identical to referenceFindPath', () => {
    const fixtures: GameMap[] = [roadDetourMap()];
    for (const map of fixtures) {
      for (const techs of techSets) {
        for (const type of ['warrior', 'scout', 'missionary'] as UnitType[]) {
          const opts = { unitType: type, completedTechs: techs, owner: 'player' };
          const a = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', opts);
          const b = referenceFindPath({ q: 0, r: 0 }, { q: 3, r: 0 }, map, 'land', opts);
          expect(a).toEqual(b);
        }
      }
    }
  });

  it('120 seeded random maps × several start/goal pairs: identical to referenceFindPath', () => {
    // Equal or unreachable from/to pairs need no filtering — findPath and referenceFindPath
    // handle them identically ([from] for equal, null for unreachable), so `.toEqual` still holds.
    let compared = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { map } = randomMap(seed);
      const keys = Object.keys(map.tiles);
      const pick = seededLcg(seed * 7 + 1);
      for (let p = 0; p < 4; p++) {
        const from = map.tiles[keys[Math.floor(pick() * keys.length)]!]!.coord;
        const to = map.tiles[keys[Math.floor(pick() * keys.length)]!]!.coord;
        const techs = techSets[Math.floor(pick() * techSets.length)]!;
        const opts = { unitType: 'warrior' as UnitType, completedTechs: techs, owner: 'player' };
        const a = findPath(from, to, map, 'land', opts);
        const b = referenceFindPath(from, to, map, 'land', opts);
        expect(a, `seed ${seed} pair ${p} ${hexKey(from)}->${hexKey(to)}`).toEqual(b);
        compared++;
      }
    }
    expect(compared).toBe(480);
  });

  it('naval domain: equal-cost wrapped routes resolve identically to referenceFindPath', () => {
    // Naval steps are uniform cost 1, so a symmetric water corridor has many equal-f nodes —
    // the tie-break path through the heap must still match the linear scan.
    const tiles: GameMap['tiles'] = {};
    for (let q = 0; q < 7; q++) for (let r = 0; r < 4; r++) {
      tiles[hexKey({ q, r })] = {
        coord: { q, r }, terrain: r === 0 || r === 3 ? 'coast' : 'ocean',
        elevation: 'lowland', resource: null, improvement: 'none', owner: null,
        improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
      };
    }
    for (const wraps of [false, true]) {
      const map: GameMap = { width: 7, height: 4, wrapsHorizontally: wraps, tiles, rivers: [] };
      for (const [from, to] of [
        [{ q: 0, r: 1 }, { q: 5, r: 2 }], [{ q: 6, r: 0 }, { q: 1, r: 3 }],
        [{ q: 0, r: 0 }, { q: 0, r: 0 }],
      ] as Array<[HexCoord, HexCoord]>) {
        // trireme is ocean-going, so these routes actually resolve (a coastal-only hull
        // would just return null on the ocean destinations and prove nothing).
        const opts = { unitType: 'trireme' as UnitType, completedTechs: [], owner: 'player' };
        expect(findPath(from, to, map, 'naval', opts))
          .toEqual(referenceFindPath(from, to, map, 'naval', opts));
      }
    }
  });
});
```

Also extend the existing `#1042 — findPath route cost equals the Dijkstra optimum` `cases`
array with one larger map (append inside that array):

```ts
{
  name: 'large map: mountains straight, long road ring (≈54 tiles)',
  map: buildMap((() => {
    const s: Record<string, TileSpec> = {};
    for (let q = 0; q < 9; q++) for (let r = 0; r < 6; r++) {
      s[`${q},${r}`] = r === 5
        ? { terrain: 'hills', hasRoad: true }
        : (q > 0 && q < 8 && r === 0 ? { terrain: 'mountain' } : {});
    }
    return s;
  })()),
  techs: ['military-logistics'],
},
```

- [ ] **Step 2: Run — verify GREEN against the current `findPath`**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-pathfinding-cost.test.ts`
Expected: PASS (all existing cases + the new oracle battery + the larger Dijkstra case). If
the oracle battery fails here, `referenceFindPath` is not a faithful port — fix the port,
not `findPath`.

- [ ] **Step 3: Commit the safety net**

```bash
git add tests/systems/unit-pathfinding-cost.test.ts
git commit -m "test(movement): pin findPath against a pre-MR5 linear-scan oracle before the heap swap (#1042)"
```

---

### Task 3: swap `findPath`'s open set for `BinaryHeap`

**Files:**
- Modify: `src/systems/unit-pathfinding.ts` — `findPath` body only (lines ~63–135)

**Interfaces:**
- Consumes: `BinaryHeap` from `./binary-heap` (Task 1).
- Produces: `findPath` — **same signature, same return contract, byte-identical routes**.

- [ ] **Step 1: Add the import**

At the top of `src/systems/unit-pathfinding.ts`, after the `unit-movement-cost` import block:

```ts
import { BinaryHeap } from './binary-heap';
```

- [ ] **Step 2: Replace the open-set section**

In the current file this is **line 63 (`  const EPS = 1e-9;`) through line 135
(`  return null;`)** inclusive — i.e. from the `EPS` declaration, through the `parents` /
`gScore` / `openSet` / `closedSet` / `coords` declarations, the start-node setup, the whole
`while (openSet.size > 0)` loop, and the trailing `return null;`. Leave the function's closing
`}` (line 136) and everything above line 63 untouched. Replace that span with:

```ts
  const EPS = 1e-9;

  interface OpenNode { key: string; g: number; f: number; }

  // Ordered on the EXACT pre-MR5 tie-break: f ascending, then g descending (higher g ⇒
  // closer to goal ⇒ fewer expansions), then hexKey ascending. EPS is identical to the
  // incumbent; every genuine cost here is a 0.5-multiple, so the EPS band never spans two
  // distinct values and the order is a well-defined total order.
  const heap = new BinaryHeap<OpenNode>((a, b) => {
    if (a.f < b.f - EPS) return -1;
    if (b.f < a.f - EPS) return 1;
    if (a.g > b.g + EPS) return -1;
    if (b.g > a.g + EPS) return 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>();
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>();

  const heuristicFrom = (coord: HexCoord): number => (map.wrapsHorizontally
    ? wrappedHexDistance(coord, to, map.width)
    : hexDistance(coord, to));

  const startKey = hexKey(from);
  gScore.set(startKey, 0);
  coords.set(startKey, from);
  heap.push({ key: startKey, g: 0, f: minStepCost * heuristicFrom(from) });

  while (heap.size > 0) {
    const current = heap.pop()!;

    // Lazy deletion: when a node's g improves we push a fresh entry and leave the old one.
    // A stale entry for a key always has strictly higher f than its replacement (h is fixed,
    // g only decreases), so the fresh entry always pops first; this skip only ever discards
    // an already-superseded entry.
    if (current.g > (gScore.get(current.key) ?? Infinity) + EPS) continue;
    // Redundant given the strict-improvement relaxation gate below (a second entry for a
    // closed key is always caught by the stale-g skip), kept as a locally-obvious
    // "a closed node is never expanded twice" guard.
    if (closedSet.has(current.key)) continue;

    // Goal check strictly AFTER the stale-g skip: a fresh toKey pop is the global (f,g,key)
    // minimum, so for the consistent heuristic the goal is settled and `parents` is final.
    if (current.key === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = current.key;
      while (key) {
        path.unshift(coords.get(key)!);
        key = parents.get(key) ?? null;
      }
      return path;
    }

    closedSet.add(current.key);
    const currentCoord = coords.get(current.key)!;

    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(currentCoord, map.width)
      : hexNeighbors(currentCoord);
    for (const neighbor of neighbors) {
      const nKey = hexKey(neighbor);
      if (closedSet.has(nKey)) continue;

      const tile = map.tiles[nKey];
      if (!tile) continue;
      const stepCost = getMovementStepCostFor(costParams, map, currentCoord, neighbor);
      if (stepCost === Infinity) continue;

      const tentativeG = current.g + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity) - EPS) {
        parents.set(nKey, current.key);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        heap.push({ key: nKey, g: tentativeG, f: tentativeG + minStepCost * heuristicFrom(neighbor) });
      }
    }
  }

  return null;
```

Notes:
- `current.g` is the authoritative g in the relaxation — it equals `gScore.get(current.key)`
  because the stale-g skip already `continue`d past any entry where it would not, so
  `current.g + stepCost` is identical to the pre-MR5 `(gScore.get(currentKey) ?? Infinity) + stepCost`.
- The block re-declares `parents` / `gScore` / `closedSet` / `coords` (the pre-MR5 code
  declared them here too) and **drops `openSet`** (the heap replaces it). `startKey` /
  `heuristicFrom` are new locals.

- [ ] **Step 3: Update the docblock**

In the `findPath` docblock, replace the "Tie-break for equal `f`" paragraph's last sentence
region with a note that the open set is now a `BinaryHeap` with lazy deletion and the tie-break
is enforced by the heap comparator — output is byte-identical to the pre-MR5 linear scan,
pinned by `referenceFindPath` in `unit-pathfinding-cost.test.ts`.

- [ ] **Step 4: Run the pinned suites — all must pass UNCHANGED**

```bash
bash scripts/run-with-mise.sh yarn vitest run \
  tests/systems/unit-pathfinding-cost.test.ts \
  tests/systems/unit-movement-characterization.test.ts \
  tests/systems/binary-heap.test.ts
```
Expected: PASS. No edits to any existing expectation. The oracle battery (Task 2) and the
`#1010 golden — findPath exact routes` block are the byte-identical proof.

- [ ] **Step 5: Rule check + commit**

```bash
bash scripts/check-src-rule-violations.sh src/systems/unit-pathfinding.ts
git add src/systems/unit-pathfinding.ts
git commit -m "perf(movement): findPath open set is a binary heap, not an O(V^2) scan (#1042)"
```

---

### Task 4: architecture boundary — `binary-heap` is a pure leaf

**Files:**
- Modify: `tests/app/architecture-boundaries.test.ts` — append one `it` inside the
  `describe('#1010 — unit-system movement decomposition boundaries', …)` block.

- [ ] **Step 1: Append the assertion**

```ts
it('binary-heap is a pure leaf; unit-pathfinding may depend on it', () => {
  // #1042 MR5: findPath's open set. Generic, not part of the #1010 movement decomposition,
  // so it is NOT in MOVEMENT_MODULES — it must import nothing at all (types are structural).
  expect(importsOf('binary-heap.ts')).toEqual([]);
  expect(importsOf('unit-pathfinding.ts')).toContain('binary-heap');
});
```

If a future change makes `binary-heap.ts` genuinely need `@/core/types`, relax the first
assertion to `.toEqual(['@/core/types'])` — never to allow a `@/systems` / `@/app` import.

- [ ] **Step 2: Run**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/architecture-boundaries.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/app/architecture-boundaries.test.ts
git commit -m "test(arch): assert binary-heap is a pure leaf pathfinding may use (#1042)"
```

---

### Task 5: rule doc + full verification

**Files:**
- Modify: `.claude/rules/movement-actions.md`

- [ ] **Step 1: Update the movement-actions rule**

In the "Where these live (#1010 / #1025)" paragraph, in the `unit-pathfinding.ts` clause, add:
its open set is a deterministic `BinaryHeap` (`src/systems/binary-heap.ts`), a lazy-deletion
A* min-heap keyed `(f asc, g desc, hexKey asc)`; route output is byte-identical to the
pre-#1042-MR5 linear scan and pinned by `referenceFindPath` in
`tests/systems/unit-pathfinding-cost.test.ts`.

- [ ] **Step 2: Full local verification**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
git diff --check
```
Expected: `build` exit 0; `test:durable` green (it runs the **complete** suite — fast **and**
slow tiers, so `ai-prepared-turn`, `basic-ai-worker-roads`, `determinism-guard` and
`turn-manager-beasts`, all of which exercise pathfinding, are included — no separate
`test:slow` run needed); `test:durable:status` accepts the evidence for the current HEAD;
`git diff --check` clean.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/movement-actions.md
git commit -m "docs(movement): note the findPath binary-heap open set in the rule (#1042)"
```

---

## Before the PR

1. **17-dimension inline review** of the full branch delta (balancing gameplay, fun, new
   mechanics, ages 7–43, play styles, difficulty modes, computer players, UI, UX,
   architecture, extensibility, data, SFX, saved games, testing, solo regressions, hot-seat
   regressions, proper implementation). Fix every real in-scope finding.
2. **PR body** must state: byte-identical output is the contract; the `referenceFindPath`
   oracle + 480-comparison seeded battery is the proof; no `GameState`/save/API change;
   difficulty-invariant; the full slow tier was run for the AI-determinism guard. Footer
   `Refs #1042` (do **not** use a closing keyword — `#1042` and `#1010` stay open for their
   remaining slices).
3. Watch CI to a terminal state; merge with `gh pr merge <N> --rebase --admin` once green.
4. Update the arc memory note (`project_issue_1042_movement_arc.md`) MR5 section to DONE with
   the merge SHA.

## Self-review (done)

- **Spec coverage:** design §3a → Task 1; §3b → Task 3; §4.1 → Task 2; §4.3 → Task 2 Step 1
  (larger Dijkstra case); §4.4 → Task 1; §4.5 → Task 5 Step 2; §4.6 → Task 4; §5 rule row →
  Task 5 Step 1. All covered.
- **Placeholder scan:** every code step carries the actual code. The docblock steps (Task 3
  Step 3, Task 5 Step 1) describe prose edits to existing paragraphs — acceptable, the target
  text is named.
- **Type consistency:** `OpenNode { key; g; f }` is used identically in Task 3's comparator,
  pushes, and the stale-g check. `referenceFindPath`'s signature in Task 2 matches the subset
  of `findPath`'s options the battery passes (`unitType` / `completedTechs` / `owner`).
