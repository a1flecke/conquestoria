# MR5 — Replace `findPath`'s O(V²) open-set with a deterministic binary heap

**Arc:** movement architecture `#1042 → #1025 → #1010`. MR1–MR4 merged
(`#1044`/`#1045`/`#1046`/`#1048`). This is the performance follow-up surfaced by the
post-arc inline review; track under `#1042` / `#1010`.

**Goal:** `findPath` (`src/systems/unit-pathfinding.ts`) currently selects the lowest-`f`
open node with a **linear scan of the whole open set every iteration** — O(V²) worst case.
Replace that scan with a binary min-heap ordered on the *exact* current tie-break, so every
route it returns is **byte-identical** to today's, then and after a save/reload.

**Non-goal:** any behaviour change. No new algorithm (stays A* with the admissible
`minStepCost × hexDistance` heuristic), no cost-model change, no rule change, no change to
`getMovementRangeDetails` / `getMovementRange` (their BFS is a different structure and out of
scope), no wall-clock or millisecond assertions.

---

## 1. What is actually O(V²) today

`findPath`'s main loop (`unit-pathfinding.ts:76–96`):

```ts
while (openSet.size > 0) {
  let currentKey = '';
  let lowestF = Infinity, lowestG = Infinity;
  for (const key of openSet) {                 // ← linear scan, every iteration
    const g = gScore.get(key) ?? Infinity;
    const f = g + minStepCost * heuristic(key);
    const better =
         f < lowestF - EPS
      || (Math.abs(f - lowestF) <= EPS && g > lowestG + EPS)
      || (Math.abs(f - lowestF) <= EPS && Math.abs(g - lowestG) <= EPS
          && (currentKey === '' || key < currentKey));
    if (better) { lowestF = f; lowestG = g; currentKey = key; }
  }
  // … expand currentKey …
}
```

The open set can hold O(V) nodes and the loop runs O(V) times ⇒ O(V²). The arc leans on this
harder than before: MR1 (`#1042`) made the per-iteration `better` test heavier (three compares
+ two `Math.abs`) and raised call frequency (AI missionary / worker / spy moves are now
cost-aware; `moveWarshipToward` and — until MR4 — `getMovementBlockerReason` route through
`findPath`). The arc's own rules deliberately deferred this ("do NOT add wall-clock budgets"),
so it was left for its own MR.

## 2. The selection order that must be preserved exactly

The linear scan imposes a **total order** on open nodes (`hexKey`s are unique):

1. **lower `f`** wins — `f = g + minStepCost × heuristic(node)`;
2. on an `f` tie, **higher `g`** wins (closer to the goal ⇒ fewer expansions);
3. on an `f` and `g` tie, the **lexicographically smaller `hexKey`** wins.

`EPS = 1e-9` guards the float compares. Every genuine cost in this model is a multiple of
`0.5` (step costs are integers or `0.5` on discounted roads; the heuristic is
`minStepCost ∈ {0.5, 1} × integer hex distance`), so two *distinct* `f` or `g` values always
differ by ≥ `0.5` ≫ `EPS`. The `EPS` band therefore never spans two distinct values — the only
"ties" it admits are exact float equality — so the order is transitive and well defined. The
heap keeps the identical `EPS`-tolerant comparator so it can never diverge from the incumbent,
even in a hypothetical future cost model with finer granularity.

## 3. Design — a generic binary min-heap + lazy deletion

### 3a. `src/systems/binary-heap.ts` (new leaf module)

A minimal array-backed binary min-heap, generic over the element type, ordered by an injected
comparator (`compare(a, b) < 0` ⇒ `a` pops first). No dependencies beyond `@/core/types`
(none needed in practice). Surface, and nothing more (YAGNI — one consumer today):

```ts
export class BinaryHeap<T> {
  constructor(compare: (a: T, b: T) => number);
  get size(): number;
  push(value: T): void;
  pop(): T | undefined;   // removes and returns the min; undefined when empty
}
```

- Standard `siftUp` on push, `siftDown` on pop (swap root with last, shrink, sift).
- **Determinism:** the comparator is a strict total order on `(f, g, key)`; `siftUp`/`siftDown`
  never consult insertion order or object identity, so the same push/pop sequence always
  yields the same pop order — in-process and across a save/reload (the heap holds no persisted
  state; `findPath` is a pure function of its arguments).
- No `peek`, no `decreaseKey`, no bulk `heapify`, no iterator — add them only when a second
  consumer needs them.
- **`BinaryHeap` being a `class` does not violate the repo's "no class instances" rule.** That
  rule is about `GameState` — it must stay a plain serializable object. A `BinaryHeap` is
  ephemeral algorithm scratch: constructed inside `findPath`, dropped when it returns, never
  placed on `GameState`, never serialized, never persisted. (A functions-over-a-plain-array
  form would work too; a class is chosen only to keep the comparator + array invariant
  encapsulated.)

Its own unit test (`tests/systems/binary-heap.test.ts`): pop returns ascending order for
random pushes; interleaved push/pop stays ordered; ties resolve by the comparator's later
keys, not insertion order; `pop()` on empty is `undefined`; a 5 000-element stress push then
drain is fully sorted.

### 3b. `findPath` rewrite (same file, same signature, same everything else)

Replace **only** the open-set structure and the min-selection. Keep verbatim: the early
`toTile` / `isPassableForParams` guards, `minStepCost` derivation, `EPS`, `parents` /
`gScore` / `closedSet` / `coords` maps, neighbour iteration, the
`tentativeG < (gScore.get(nKey) ?? Infinity) - EPS` relaxation gate, path reconstruction, and
`findPathToCity` (untouched — it just calls `findPath`).

```ts
interface OpenNode { key: string; g: number; f: number; }

const heap = new BinaryHeap<OpenNode>((a, b) => {
  if (a.f < b.f - EPS) return -1;
  if (b.f < a.f - EPS) return 1;
  if (a.g > b.g + EPS) return -1;   // higher g first, on an f tie
  if (b.g > a.g + EPS) return 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;   // lex hexKey, on an f+g tie
});

const hOf = (coord: HexCoord) => map.wrapsHorizontally
  ? wrappedHexDistance(coord, to, map.width)
  : hexDistance(coord, to);

gScore.set(startKey, 0);
coords.set(startKey, from);
heap.push({ key: startKey, g: 0, f: minStepCost * hOf(from) });

while (heap.size > 0) {
  const current = heap.pop()!;
  // In-loop order is load-bearing: pop → stale-g skip → closed skip → goal check → close → expand.
  //
  // (1) Stale-g skip. Lazy deletion: when a node's g improves, a fresh entry is pushed and the
  //     old one is left in the heap. A stale entry for a key always has strictly higher f than
  //     its replacement (h is fixed, g only decreases), so the fresh entry always pops first —
  //     this skip only ever discards an already-superseded entry.
  if (current.g > (gScore.get(current.key) ?? Infinity) + EPS) continue;
  // (2) Closed skip. Redundant given the strict-improvement relaxation gate below (every
  //     re-push strictly lowers g, so a second entry for a closed key is always caught by (1)),
  //     but kept as a locally-obvious "a closed node is never expanded twice" guard.
  if (closedSet.has(current.key)) continue;

  // (3) Goal check — strictly AFTER (1). Returning via a *stale* toKey entry could reconstruct
  //     a non-optimal `parents` chain; a fresh toKey pop is the global (f,g,key) minimum, which
  //     for a consistent heuristic means the goal is settled and `parents` is final.
  if (current.key === toKey) { /* reconstruct from `parents`, unchanged */ }

  closedSet.add(current.key);
  const currentCoord = coords.get(current.key)!;
  for (const neighbor of neighbors(currentCoord)) {
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
      heap.push({ key: nKey, g: tentativeG, f: tentativeG + minStepCost * hOf(neighbor) });
    }
  }
}
return null;
```

### 3c. Why the output is byte-identical

- **Same nodes considered.** Relaxation gate, neighbour order, `closedSet` skip, and the
  `toTile` guards are unchanged.
- **Same expansion order.** At every step the linear scan expands the open node with the
  globally-best `(f, g, key)` computed from the *current* `gScore`. The heap holds one "fresh"
  entry per open node (its `g` as of its last push) plus superseded stale entries. A stale
  entry for a node is always beaten by that node's fresh entry (strictly lower `f`), which is
  also in the heap — so `pop()` always returns a fresh entry, and that entry is the global
  `(f, g, key)` minimum: exactly the linear scan's pick. Stale entries are discarded on pop
  without expansion.
- **Same tie-break.** The comparator is the three-tier order from §2, `EPS` identical.
- **Same reconstruction.** `parents` is written by the unchanged relaxation gate, so the
  back-chain from `toKey` is identical.
- **A* never reopens** (consistent heuristic — see the module docblock), so lazy deletion
  never has to resurrect a closed node; the `closedSet.has` guard after pop is retained as
  defence in depth and matches the pre-loop `closedSet.has(nKey)` continue.

### 3d. Edge cases (all preserved)

| Case | Behaviour |
|---|---|
| `from === to` | first `pop()` is the start, `key === toKey` ⇒ returns `[from]` |
| destination tile missing / impassable | early `return null` before the heap is built (unchanged) |
| goal unreachable | heap drains, `return null` |
| wrapped map | heuristic uses `wrappedHexDistance`; `f` stored per entry at push, `h` is constant per node ⇒ correct |
| road-discount tech (`minStepCost = 0.5`) | comparator + `f` formula unchanged; heuristic still admissible & consistent |
| naval `findPathToCity` | calls `findPath(..., 'naval')`; uniform cost 1; unchanged |

## 4. Test strategy

The whole point is "no behaviour change", so the tests are equivalence pins, not new
behaviour:

1. **Reference oracle (new, `unit-pathfinding-cost.test.ts`).** Port the *pre-MR5*
   open-set-selection algorithm verbatim into the test as `referenceFindPath` (linear scan,
   same three-tier tie-break, same `EPS`). Assert `findPath` output
   `.toEqual(referenceFindPath(...))` over: the existing `roadDetourMap` battery, the
   wraparound map, and **a randomized battery** — N random maps built from the canonical
   `seededLcg(seed)` helper (`@/systems/seeded-lcg`) with fixed seed constants — never
   `Math.random()`, so a failure reproduces exactly — mixing terrain, roads, rivers,
   wrap on/off, and tech on/off, each with several start/goal pairs. This is the strongest
   guard: it pins "heap order == linear-scan order" directly.
   `referenceFindPath` and this assertion exist **only** to pin this refactor — if
   `findPath`'s selection order is ever deliberately changed, both are deleted together, not
   updated.
2. **Existing golden routes** (`unit-movement-characterization.test.ts` "#1010 golden —
   findPath exact routes", `unit-pathfinding-cost.test.ts` cases 1–12) must pass **unchanged**
   — no edits to their expectations. A diff there is a red flag, not a snapshot to update.
3. **Existing Dijkstra-equivalence property test** — extend its `cases` with one larger map
   (≈40–60 tiles, wandering road) so optimality is checked at a size where O(V²) vs O(V log V)
   actually diverges.
4. **`binary-heap.test.ts`** (new) — the heap in isolation (see §3a).
5. **Determinism / save-reload:** `unit-pathfinding-cost.test.ts` cases 9 & 11 already pin
   "identical query ⇒ identical path" and "JSON round-trip ⇒ identical path"; they cover the
   heap because `findPath` is pure. The **full slow tier** is the end-to-end guard that AI
   traces (which consume `findPath`) are unmoved — `run-tests-by-tier.sh slow` includes
   `ai-prepared-turn`, `basic-ai-worker-roads`, `turn-manager-beasts`, `determinism-guard`
   and `save-load-mass-discovery`, all of which exercise pathfinding. Run
   `yarn test:slow` **and** the full `yarn test` before the PR.
6. **Architecture boundary** (`architecture-boundaries.test.ts`): a standalone assertion —
   **not** folded into `MOVEMENT_MODULES` (that list is the `#1010` movement-decomposition
   boundary set; a generic heap is not part of that decomposition). Assert `unit-pathfinding`
   is allowed to import `binary-heap`, and that `binary-heap`'s own imports contain nothing
   under `@/systems`, `@/app`, `@/ui`, `@/renderer` (a pure leaf).

## 5. Files

| File | Change |
|---|---|
| `src/systems/binary-heap.ts` | **new** — `BinaryHeap<T>` (push / pop / size) |
| `src/systems/unit-pathfinding.ts` | rewrite `findPath`'s open-set to use `BinaryHeap`; docblock note; **no signature or behaviour change** |
| `tests/systems/binary-heap.test.ts` | **new** — heap unit tests |
| `tests/systems/unit-pathfinding-cost.test.ts` | add `mulberry32` + `referenceFindPath` oracle + randomized equivalence battery; extend Dijkstra cases with one larger map |
| `tests/app/architecture-boundaries.test.ts` | standalone `binary-heap` pure-leaf assertion (not in `MOVEMENT_MODULES`) |
| `.claude/rules/movement-actions.md` | one line: pathfinding's open-set is a `BinaryHeap`, output byte-identical, pinned by the oracle test |

No `GameState` shape change ⇒ no save migration, no `SAVE_VERSION` bump. Difficulty-invariant
(`findPath` takes no challenge input). No public API change ⇒ the ~20 `findPath` /
`findPathToCity` call sites are untouched.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Heap order subtly diverges from the linear scan on some map | the `referenceFindPath` oracle over a randomized battery is designed to catch exactly this; the golden routes and Dijkstra-equivalence tests are independent cross-checks |
| A non-transitive comparator makes heap order ill-defined | §2 — all costs are `0.5`-multiples, distinct values differ by ≥ `0.5` ≫ `EPS`, so the `EPS` band never spans two distinct values |
| Lazy-deletion stale entry gets expanded | the `current.g > gScore + EPS` skip runs before any expansion; §3c argues a fresh entry always pops first for a given key |
| AI determinism regression | byte-identical `findPath` ⇒ identical traces; full `yarn test:slow` (incl. `ai-prepared-turn`, `basic-ai-worker-roads`, `determinism-guard`, `turn-manager-beasts`) + full `yarn test` run before the PR |
