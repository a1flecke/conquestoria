# #1066 Amphibious Objective Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A major AI civ boxed onto a landmass with no all-land route to any known target, but with a viable one-hop sea crossing to it, can form and execute a real strategic plan (`capture` / `secure-resource` / `expand`) instead of permanently getting zero eligible candidates.

**Architecture:** Reuse the existing `tile.regionKey` landmass partition (already computed once at map generation by `landmass-tagger.ts`) as the HPA*-style cluster abstraction. Add one new pure function, `findRegionCrossings`, that does a single per-turn multi-source BFS from a civ's own coastal tiles across naval-passable terrain to find the shortest crossing into every other reachable landmass. Thread that result into `resolveObjectiveTravelCandidates` so a land-domain candidate whose direct path fails gets a composed `land → embark → sail → disembark → land` travel-time estimate and a `requiredRoles.transport` demand, instead of `Infinity`. No changes to movement execution — `ai-tactics.ts`'s existing (but currently unreachable) transport-loading logic already handles the rest. One follow-on fix in `ai-production.ts` so a transport-only demand actually gets built.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-issue-1066-amphibious-objective-routing-design.md` — read this first for the full rationale and industry background (HPA*). This plan implements it exactly; if anything here seems to contradict that spec, the spec wins and this plan has a bug.

## Global Constraints

- No new `Math.random()` — this uses only deterministic BFS/A*, no RNG needed.
- No new persisted `GameState`/`GameMap` field — everything is derived from already-persisted `tile.terrain`/`tile.regionKey`. No save migration.
- Difficulty-invariant — this is a reachability/legality fix, not a challenge-tuned behavior. Nothing here reads `OpponentChallenge`.
- `assertLegalChoices` (`tests/simulation/ai-playability-fixture.ts`) hard-throws above 12 trace candidates per actor — this work does not add new candidates, only changes the `travelTurns`/`requiredRoles` of existing ones, so this bound is unaffected.
- Follow `.claude/rules/game-systems.md`'s Immutable Turn Processing rule for any code touching `GameState` in `src/` (not applicable to the new pure `ai-amphibious-routing.ts` module, which never touches `GameState` — it takes a `GameMap` only).

---

## File Structure

- **Create** `src/ai/ai-amphibious-routing.ts` — the new `findRegionCrossings` BFS and its `RegionCrossing` type. Pure function of `GameMap`, no `GameState` dependency (mirrors `ai-expansion-sites.ts`'s own "deliberately `GameState`-free" convention for the belief layer).
- **Create** `tests/ai/ai-amphibious-routing.test.ts` — unit tests for `findRegionCrossings` in isolation.
- **Modify** `src/ai/ai-objective-scoring.ts` — `resolveObjectiveTravelCandidates` gains a `crossings` parameter and a fallback branch.
- **Modify** `tests/ai/ai-objective-scoring.test.ts` — update the one existing call site whose positional arguments shift, add new fallback tests.
- **Modify** `src/ai/ai-prepared-turn.ts` — `objectiveCandidates` computes `findRegionCrossings` once per call and threads it through.
- **Modify** `tests/ai/ai-prepared-turn.test.ts` — one new integration test proving the wiring.
- **Modify** `src/ai/ai-production.ts` — broaden the `cargoDemand` gate.
- **Modify** `tests/ai/ai-production.test.ts` — update the one existing test whose expectation flips, add a negative case.
- **Modify** `tests/simulation/long-horizon/known-campaign-gaps.ts` — delete the `expansion-frozen`/`lh-late-era-medium` entry once the scenario re-run confirms it no longer reproduces (Task 5).

---

### Task 1: `findRegionCrossings` — the region-crossing BFS

**Files:**
- Create: `src/ai/ai-amphibious-routing.ts`
- Test: `tests/ai/ai-amphibious-routing.test.ts`

**Interfaces:**
- Produces: `export interface RegionCrossing { targetRegionKey: string; embarkTile: HexCoord; disembarkTile: HexCoord; navalDistance: number; }` and `export function findRegionCrossings(map: GameMap, originRegionKeys: ReadonlySet<string>): Map<string, RegionCrossing>`. Task 3 calls this with the civ's own operational-anchor regions; Task 2 consumes its `Map<string, RegionCrossing>` return value.

- [ ] **Step 1: Write the failing tests**

Create `tests/ai/ai-amphibious-routing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameMap, HexCoord, TerrainType } from '@/core/types';
import { findRegionCrossings } from '@/ai/ai-amphibious-routing';
import { hexKey } from '@/systems/hex-utils';

/** A flat map. Only the tiles listed exist -- matches ai-expansion-sites.test.ts's `knownMap` convention. */
function testMap(
  tiles: Array<{ q: number; r: number; terrain: TerrainType; regionKey?: string }>,
): GameMap {
  return {
    width: 40,
    height: 40,
    wrapsHorizontally: false,
    rivers: [],
    tiles: Object.fromEntries(tiles.map(t => [
      hexKey({ q: t.q, r: t.r }),
      {
        coord: { q: t.q, r: t.r },
        terrain: t.terrain,
        elevation: 0,
        resource: null,
        improvement: null,
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
        regionKey: t.regionKey,
      },
    ])),
  } as GameMap;
}

describe('findRegionCrossings', () => {
  it('finds a one-hop sea crossing with the correct embark/disembark tiles and distance', () => {
    // origin (0,0) -- coast(1,0) -- coast(2,0) -- target(3,0)
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'coast' },
      { q: 3, r: 0, terrain: 'grassland', regionKey: 'target' },
    ]);

    const result = findRegionCrossings(map, new Set(['origin']));

    expect(result.get('target')).toEqual({
      targetRegionKey: 'target',
      embarkTile: { q: 0, r: 0 },
      disembarkTile: { q: 3, r: 0 },
      navalDistance: 2,
    });
  });

  it('returns an empty map when originRegionKeys is empty', () => {
    const map = testMap([{ q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' }]);
    expect(findRegionCrossings(map, new Set())).toEqual(new Map());
  });

  it('never records a crossing back into one of the origin regions', () => {
    // Two tiles of the SAME region separated only by coast -- there is no
    // "other" region here, so no crossing should ever be recorded.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'grassland', regionKey: 'origin' },
    ]);

    expect(findRegionCrossings(map, new Set(['origin']))).toEqual(new Map());
  });

  it('does not find a region beyond one hop', () => {
    // origin -- one coast tile -- nothing else exists, so 'target' (which
    // would need a second hop) is simply absent from the known map.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
    ]);

    expect(findRegionCrossings(map, new Set(['origin'])).has('target')).toBe(false);
  });

  it('picks the shortest of two available crossings to the same target region', () => {
    // A short crossing directly east (distance 1) and a longer one via the
    // south-east corridor (distance 3) into the SAME target region -- the
    // short one must win.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'grassland', regionKey: 'target' },
      { q: 0, r: 1, terrain: 'coast' },
      { q: -1, r: 2, terrain: 'coast' },
      { q: -2, r: 3, terrain: 'coast' },
      { q: -3, r: 4, terrain: 'grassland', regionKey: 'target' },
    ]);

    const result = findRegionCrossings(map, new Set(['origin']));
    expect(result.get('target')?.navalDistance).toBe(1);
    expect(result.get('target')?.disembarkTile).toEqual({ q: 2, r: 0 });
  });

  it('ignores a tile with no regionKey as neither an origin nor a valid target', () => {
    // A ocean/coast expanse with an untagged land tile (regionKey undefined,
    // e.g. a pre-#1004 save not yet normalized) must not be recorded as a
    // reachable "target region" -- there is no key to record it under.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'grassland' }, // no regionKey
    ]);

    expect(findRegionCrossings(map, new Set(['origin']))).toEqual(new Map());
  });

  it('is deterministic regardless of object key insertion order', () => {
    const tilesA = [
      { q: 0, r: 0, terrain: 'grassland' as TerrainType, regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' as TerrainType },
      { q: 2, r: 0, terrain: 'grassland' as TerrainType, regionKey: 'target' },
    ];
    const tilesB = [...tilesA].reverse();

    const resultA = findRegionCrossings(testMap(tilesA), new Set(['origin']));
    const resultB = findRegionCrossings(testMap(tilesB), new Set(['origin']));

    expect(resultA).toEqual(resultB);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-amphibious-routing.test.ts`
Expected: FAIL — `Cannot find module '@/ai/ai-amphibious-routing'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/ai/ai-amphibious-routing.ts`:

```ts
/**
 * #1066 -- see docs/superpowers/specs/2026-09-13-issue-1066-amphibious-objective-routing-design.md
 * for the full design rationale (this is an application of Hierarchical
 * Pathfinding A*'s cluster/portal abstraction, reusing this codebase's
 * existing `tile.regionKey` landmass partition as the cluster layer).
 */
import type { GameMap, HexCoord } from '@/core/types';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { getMovementCostForUnit } from '@/systems/unit-movement-cost';

export interface RegionCrossing {
  targetRegionKey: string;
  /** Tile on the origin's own landmass where the unit would embark. */
  embarkTile: HexCoord;
  /** Tile on the target's landmass where the unit would disembark. */
  disembarkTile: HexCoord;
  /** Naval-domain tile distance from embarkTile's adjacent water to disembarkTile's adjacent water. */
  navalDistance: number;
}

function isNavalPassable(terrain: string): boolean {
  return getMovementCostForUnit(terrain, 'naval') !== Infinity;
}

function neighborsOf(map: GameMap, coord: HexCoord): HexCoord[] {
  return map.wrapsHorizontally ? getWrappedHexNeighbors(coord, map.width) : hexNeighbors(coord);
}

interface QueueEntry {
  coord: HexCoord;
  embarkTile: HexCoord;
  distance: number;
}

/**
 * From every coastal tile belonging to `originRegionKeys`, BFS outward across
 * naval-passable tiles only, recording the FIRST (shortest) crossing into
 * each OTHER region encountered. Deterministic: seeds and frontier
 * expansions are both processed in `hexKey` sort order, so the result never
 * depends on `map.tiles`' object key iteration order.
 */
export function findRegionCrossings(
  map: GameMap,
  originRegionKeys: ReadonlySet<string>,
): Map<string, RegionCrossing> {
  const crossings = new Map<string, RegionCrossing>();
  if (originRegionKeys.size === 0) return crossings;

  const visited = new Set<string>();
  const queue: QueueEntry[] = [];

  const seedKeys = Object.keys(map.tiles)
    .filter(key => {
      const regionKey = map.tiles[key]!.regionKey;
      return regionKey !== undefined && originRegionKeys.has(regionKey);
    })
    .sort();

  for (const key of seedKeys) {
    const landCoord = map.tiles[key]!.coord;
    const waterNeighbors = neighborsOf(map, landCoord)
      .filter(neighbor => {
        const neighborTile = map.tiles[hexKey(neighbor)];
        return neighborTile !== undefined && isNavalPassable(neighborTile.terrain);
      })
      .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
    for (const water of waterNeighbors) {
      const waterKey = hexKey(water);
      if (visited.has(waterKey)) continue;
      visited.add(waterKey);
      queue.push({ coord: water, embarkTile: landCoord, distance: 1 });
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head]!;
    head += 1;

    const neighbors = neighborsOf(map, current.coord)
      .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
    for (const neighbor of neighbors) {
      const neighborKey = hexKey(neighbor);
      const neighborTile = map.tiles[neighborKey];
      if (!neighborTile) continue;

      if (isNavalPassable(neighborTile.terrain)) {
        if (visited.has(neighborKey)) continue;
        visited.add(neighborKey);
        queue.push({ coord: neighbor, embarkTile: current.embarkTile, distance: current.distance + 1 });
        continue;
      }

      const targetRegionKey = neighborTile.regionKey;
      if (!targetRegionKey || originRegionKeys.has(targetRegionKey)) continue;
      if (crossings.has(targetRegionKey)) continue;

      crossings.set(targetRegionKey, {
        targetRegionKey,
        embarkTile: current.embarkTile,
        disembarkTile: neighbor,
        navalDistance: current.distance,
      });
    }
  }

  return crossings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-amphibious-routing.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-amphibious-routing.ts tests/ai/ai-amphibious-routing.test.ts
git commit -m "feat(ai): add findRegionCrossings for amphibious objective reachability (#1066)"
```

---

### Task 2: `resolveObjectiveTravelCandidates` amphibious fallback

**Files:**
- Modify: `src/ai/ai-objective-scoring.ts`
- Modify: `tests/ai/ai-objective-scoring.test.ts`

**Interfaces:**
- Consumes: `RegionCrossing`, `findRegionCrossings` from Task 1 (`@/ai/ai-amphibious-routing`) — only the `RegionCrossing` type is needed here; `findRegionCrossings` itself is called by Task 3, not this file.
- Produces: `resolveObjectiveTravelCandidates`'s new signature `resolveObjectiveTravelCandidates(map: GameMap, candidates: readonly AIObjectiveTravelCandidate[], crossings: ReadonlyMap<string, RegionCrossing> = new Map(), pathfinder: typeof findPath = findPath): AIObjectiveCandidate[]`. Task 3 calls this with a real `crossings` map; existing callers (`ai-prepared-turn.ts`'s pre-#1066 call site, updated in Task 3) and tests must pass `crossings` positionally before `pathfinder`.

- [ ] **Step 1: Write the failing tests**

In `tests/ai/ai-objective-scoring.test.ts`, first update the ONE existing call site whose positional arguments now shift (this test currently passes 3 args: `map, inputs, customPathfinder` — the 3rd argument now binds to the new `crossings` parameter instead of `pathfinder`, so it must be updated or it will silently break):

Find this existing test (`'caps canonical path queries and caches duplicate travel requests for one pass'`):

```ts
    const resolved = resolveObjectiveTravelCandidates(map, inputs, (from, to) => {
      queries += 1;
      return [from, to];
    });
```

Replace with:

```ts
    const resolved = resolveObjectiveTravelCandidates(map, inputs, new Map(), (from, to) => {
      queries += 1;
      return [from, to];
    });
```

Then add these new tests to the same file (append inside the existing `describe('AI objective scoring', ...)` block, near the other `resolveObjectiveTravelCandidates` test):

```ts
  it('falls back to a composed sea route when the direct land path fails and a crossing exists', () => {
    const map = {
      width: 40, height: 20, wrapsHorizontally: false, rivers: [],
      tiles: {
        '3,0': { coord: { q: 3, r: 0 }, regionKey: 'target' },
      },
    } as unknown as GameMap;
    const crossings = new Map([
      ['target', {
        targetRegionKey: 'target',
        embarkTile: { q: 0, r: 0 },
        disembarkTile: { q: 2, r: 0 },
        navalDistance: 1,
      }],
    ]);
    const input: AIObjectiveTravelCandidate = {
      ...candidate('overseas', 0, 50),
      target: { kind: 'city', id: 'overseas', lastKnownPosition: { q: 3, r: 0 } },
      start: { q: 0, r: 0 },
      domain: 'land',
      movementPoints: 2,
      completedMovementTechHash: 'none',
    };
    const fakePathfinder = (from: HexCoord, to: HexCoord) => {
      // Direct land path always fails.
      if (hexKeyEq(from, { q: 0, r: 0 }) && hexKeyEq(to, { q: 3, r: 0 })) return null;
      // Zero-distance "path" (start === embark tile here) is a 1-tile path,
      // matching real pathfinder semantics: distance = path.length - 1.
      if (hexKeyEq(from, to)) return [to];
      // Every other queried leg is a single 1-tile step.
      return [from, to];
    };

    const [resolved] = resolveObjectiveTravelCandidates(map, [input], crossings, fakePathfinder);

    // land(0,0->embark 0,0)=0 turns (start IS the embark tile) + embark
    // overhead 1 + naval(1 tile / 2mp)=ceil(1/2)=1 turn +
    // land(disembark 2,0->3,0)=1 step/2mp=ceil(1/2)=1 turn = 3 total.
    expect(resolved.travelTurns).toBe(3);
    expect(resolved.requiredRoles).toEqual({ capture: 1, transport: 1 });
  });

  it('stays unreachable when the direct land path fails and no crossing is known', () => {
    const map = { width: 40, height: 20, wrapsHorizontally: false, rivers: [], tiles: {} } as unknown as GameMap;
    const input: AIObjectiveTravelCandidate = {
      ...candidate('stranded', 0, 50),
      start: { q: 0, r: 0 },
      domain: 'land',
      movementPoints: 2,
      completedMovementTechHash: 'none',
    };

    const [resolved] = resolveObjectiveTravelCandidates(map, [input], new Map(), () => null);

    expect(resolved.travelTurns).toBe(Number.POSITIVE_INFINITY);
    expect(resolved.requiredRoles).toEqual({ capture: 1 });
  });

  it('never applies the sea-crossing fallback to a naval-domain candidate', () => {
    const map = { width: 40, height: 20, wrapsHorizontally: false, rivers: [], tiles: {} } as unknown as GameMap;
    const crossings = new Map([
      ['target', {
        targetRegionKey: 'target',
        embarkTile: { q: 0, r: 0 },
        disembarkTile: { q: 2, r: 0 },
        navalDistance: 1,
      }],
    ]);
    const input: AIObjectiveTravelCandidate = {
      ...candidate('naval-target', 0, 50),
      start: { q: 0, r: 0 },
      domain: 'naval',
      movementPoints: 2,
      completedMovementTechHash: 'none',
    };

    const [resolved] = resolveObjectiveTravelCandidates(map, [input], crossings, () => null);

    expect(resolved.travelTurns).toBe(Number.POSITIVE_INFINITY);
    expect(resolved.requiredRoles).toEqual({ capture: 1 });
  });
```

Add these two small helpers near the top of the test file, alongside the existing `candidate()` helper:

```ts
import type { GameMap, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

function hexKeyEq(a: HexCoord, b: HexCoord): boolean {
  return hexKey(a) === hexKey(b);
}
```

(If `GameMap`/`HexCoord` or `hexKey` are already imported in this file for another reason, merge into the existing import statements instead of duplicating.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-objective-scoring.test.ts`
Expected: FAIL — the updated call site fails to compile/run against the current 3-parameter signature (a `Map` is not assignable to a pathfinder function type), and the three new tests fail because `resolveObjectiveTravelCandidates` doesn't yet accept a `crossings` argument.

- [ ] **Step 3: Write the implementation**

In `src/ai/ai-objective-scoring.ts`, add the import at the top:

```ts
import type { RegionCrossing } from './ai-amphibious-routing';
```

Replace the entire `resolveObjectiveTravelCandidates` function body with:

```ts
/** #1066: a land-domain candidate embarks for one whole turn regardless of
 * remaining movement points -- verified against `loadUnitOntoTransport`
 * (`transport-system.ts`), which unconditionally sets `movementPointsLeft: 0,
 * hasMoved: true, hasActed: true` on the loading unit. Disembarking needs no
 * matching overhead: `canUnloadUnitFromTransport` only requires ordinary
 * unused movement, and the unit's step onto the destination land tile is
 * already counted by the final land leg's own pathfind. */
const AMPHIBIOUS_EMBARK_OVERHEAD_TURNS = 1;

export function resolveObjectiveTravelCandidates(
  map: GameMap,
  candidates: readonly AIObjectiveTravelCandidate[],
  crossings: ReadonlyMap<string, RegionCrossing> = new Map(),
  pathfinder: typeof findPath = findPath,
): AIObjectiveCandidate[] {
  const perObjective = new Map<AIStrategicObjective, AIObjectiveTravelCandidate[]>();
  for (const candidate of candidates) {
    const group = perObjective.get(candidate.objective) ?? [];
    group.push(candidate);
    perObjective.set(candidate.objective, group);
  }

  const approximate = [...perObjective.values()]
    .flatMap(group => group
      .sort((left, right) => {
        const distanceDelta = getObjectiveApproximateDistance(
          map,
          left.start,
          targetPosition(left.target),
        ) - getObjectiveApproximateDistance(map, right.start, targetPosition(right.target));
        return distanceDelta || targetStableKey(left.target).localeCompare(targetStableKey(right.target));
      })
      .slice(0, 8))
    .sort((left, right) => {
      const distanceDelta = getObjectiveApproximateDistance(
        map,
        left.start,
        targetPosition(left.target),
      ) - getObjectiveApproximateDistance(map, right.start, targetPosition(right.target));
      return distanceDelta || candidateId({ ...left, travelTurns: 0 })
        .localeCompare(candidateId({ ...right, travelTurns: 0 }));
    })
    .slice(0, 24);

  const pathLengthByKey = new Map<string, number | null>();
  const pathLength = (
    from: HexCoord,
    to: HexCoord,
    domain: 'land' | 'naval' | 'air',
    techHash: string,
  ): number | null => {
    const cacheKey = [domain, hexKey(from), hexKey(to), techHash].join(':');
    if (!pathLengthByKey.has(cacheKey)) {
      const path = pathfinder(from, to, map, domain);
      pathLengthByKey.set(cacheKey, path ? Math.max(0, path.length - 1) : null);
    }
    return pathLengthByKey.get(cacheKey)!;
  };

  return approximate.map(candidate => {
    const destination = targetPosition(candidate.target);
    const movementPoints = Math.max(1, Math.floor(candidate.movementPoints));
    const directLength = pathLength(
      candidate.start,
      destination,
      candidate.domain,
      candidate.completedMovementTechHash,
    );

    const {
      start: _start,
      domain: _domain,
      movementPoints: _movementPoints,
      completedMovementTechHash: _completedMovementTechHash,
      ...objective
    } = candidate;

    if (directLength !== null) {
      return {
        ...objective,
        travelTurns: Math.ceil(directLength / movementPoints),
      };
    }

    // #1066: a land-domain candidate with no direct path may still be
    // reachable by sea. `crossings` is empty for a same-region failure
    // (findRegionCrossings never records a crossing back into an origin
    // region), so this only ever fires for a genuine water gap.
    if (candidate.domain === 'land') {
      const targetRegionKey = map.tiles[hexKey(destination)]?.regionKey;
      const crossing = targetRegionKey ? crossings.get(targetRegionKey) : undefined;
      if (crossing) {
        const toEmbark = pathLength(candidate.start, crossing.embarkTile, 'land', candidate.completedMovementTechHash);
        const fromDisembark = pathLength(crossing.disembarkTile, destination, 'land', candidate.completedMovementTechHash);
        if (toEmbark !== null && fromDisembark !== null) {
          const landTurns = Math.ceil(toEmbark / movementPoints) + Math.ceil(fromDisembark / movementPoints);
          const navalTurns = Math.ceil(crossing.navalDistance / movementPoints);
          return {
            ...objective,
            travelTurns: landTurns + AMPHIBIOUS_EMBARK_OVERHEAD_TURNS + navalTurns,
            requiredRoles: { ...objective.requiredRoles, transport: 1 },
          };
        }
      }
    }

    return {
      ...objective,
      travelTurns: Number.POSITIVE_INFINITY,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-objective-scoring.test.ts`
Expected: PASS — all tests in the file green, including the pre-existing ones (confirms zero behavior change for the direct-path case).

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-objective-scoring.ts tests/ai/ai-objective-scoring.test.ts
git commit -m "feat(ai): compose an amphibious travel estimate when direct land pathing fails (#1066)"
```

---

### Task 3: Wire `findRegionCrossings` into `objectiveCandidates`

**Files:**
- Modify: `src/ai/ai-prepared-turn.ts`
- Modify: `tests/ai/ai-prepared-turn.test.ts`

**Interfaces:**
- Consumes: `findRegionCrossings` (Task 1), the updated `resolveObjectiveTravelCandidates` signature (Task 2).
- Produces: no new exported symbol — this task only changes `objectiveCandidates`'s internal behavior, observable through the existing exported `prepareMajorCivStrategicPlan`.

- [ ] **Step 1: Write the failing test**

In `tests/ai/ai-prepared-turn.test.ts`, update the import line that currently reads:

```ts
import { getWrappedHexNeighbors, hexDistance, hexKey, mapHexesInRange } from '@/systems/hex-utils';
```

to:

```ts
import { getWrappedHexNeighbors, hexDistance, hexKey, hexRing, mapHexesInRange } from '@/systems/hex-utils';
```

and the import line that currently reads:

```ts
import type { GameState } from '@/core/types';
```

to:

```ts
import type { GameState, HexCoord, TerrainType } from '@/core/types';
```

Then add this test inside the existing `describe('#1064 expand objective candidates', ...)` block (it belongs there — same objective type, same file, and #1064's own comment already documents `getKnownExpansionSites` as landmass-agnostic, which is exactly the gap this test targets):

```ts
  it('makes an otherwise-unreachable expand candidate eligible once a sea crossing exists (#1066)', () => {
    function setTerrain(coord: HexCoord, terrain: TerrainType, regionKey: string | undefined) {
      const key = hexKey(coord);
      const existing = state.map.tiles[key];
      state.map.tiles[key] = {
        coord,
        terrain,
        elevation: existing?.elevation ?? 0,
        resource: existing?.resource ?? null,
        improvement: existing?.improvement ?? null,
        owner: existing?.owner ?? null,
        improvementTurnsLeft: existing?.improvementTurnsLeft ?? 0,
        hasRiver: existing?.hasRiver ?? false,
        wonder: existing?.wonder ?? null,
        regionKey,
      };
    }

    const state = createNewGame(undefined, 'amphibious-expand-eligible', 'small');
    const civ = state.civilizations['ai-1'];
    const home = foundCity(civ.id, { q: 15, r: 15 }, state.map, state.idCounters);
    state.cities[home.id] = home;
    civ.cities.push(home.id);

    // Seal the city off with a ring of open water at radius 2 -- any path
    // from inside to outside must cross this ring, so whatever terrain the
    // real generated map happens to have elsewhere cannot accidentally
    // provide a land route around it.
    for (const coord of hexRing(home.position, 2)) {
      setTerrain(coord, 'coast', undefined);
    }

    // A legal, positively-scored expansion site on a distinct landmass,
    // hexDistance 6 away (within EXPANSION_SEARCH_RADIUS=8, past
    // MIN_CITY_CENTER_DISTANCE=4), reachable only by sea.
    const targetCenter = { q: home.position.q + 6, r: home.position.r };
    for (const coord of mapHexesInRange(state.map, targetCenter, 2)) {
      setTerrain(coord, 'grassland', 'test-target-region');
    }

    civ.visibility.tiles = {};
    for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS)) {
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);
    const expandCandidate = prepared.traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));

    // Pre-#1066: this candidate never even appears in the trace -- the
    // land-only travel resolver marks it Infinity/unreachable and
    // `bestExpand` in `objectiveCandidates` filters it out entirely before
    // it's ever added to the candidate list. Post-#1066: it's present AND
    // eligible.
    expect(expandCandidate).toBeDefined();
    expect(expandCandidate?.eligible).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts -t "makes an otherwise-unreachable expand candidate eligible"`
Expected: FAIL — `expandCandidate` is `undefined` (no wiring yet).

- [ ] **Step 3: Write the implementation**

In `src/ai/ai-prepared-turn.ts`, add the import (alongside the existing `./ai-expansion-sites` import group):

```ts
import { findRegionCrossings } from './ai-amphibious-routing';
```

Find the end of `objectiveCandidates` where `travelInputs` is built and `resolveObjectiveTravelCandidates` is called:

```ts
  const travelInputs: AIObjectiveTravelCandidate[] = candidates.map(candidate => {
    const { travelTurns: _travelTurns, ...withoutTravel } = candidate;
    return {
      ...withoutTravel,
      start: { ...startByCandidate.get(candidate)! },
      domain: 'land',
      movementPoints: 2,
      completedMovementTechHash: [...actor.techState.completed].sort().join(','),
    };
  });
  const resolved = resolveObjectiveTravelCandidates(knownMap, travelInputs);
```

Replace with:

```ts
  const travelInputs: AIObjectiveTravelCandidate[] = candidates.map(candidate => {
    const { travelTurns: _travelTurns, ...withoutTravel } = candidate;
    return {
      ...withoutTravel,
      start: { ...startByCandidate.get(candidate)! },
      domain: 'land',
      movementPoints: 2,
      completedMovementTechHash: [...actor.techState.completed].sort().join(','),
    };
  });
  // #1066: one BFS per civ per turn, reused by every candidate below that
  // needs a sea-crossing fallback -- see
  // docs/superpowers/specs/2026-09-13-issue-1066-amphibious-objective-routing-design.md.
  const originRegionKeys = new Set(
    operationalAnchors
      .map(anchor => knownMap.tiles[hexKey(anchor)]?.regionKey)
      .filter((key): key is string => key !== undefined),
  );
  const crossings = findRegionCrossings(knownMap, originRegionKeys);
  const resolved = resolveObjectiveTravelCandidates(knownMap, travelInputs, crossings);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts`
Expected: PASS — the new test and every pre-existing test in the file (confirms the same-region case, which is everything the existing suite already covers, is byte-identical to before).

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-prepared-turn.ts tests/ai/ai-prepared-turn.test.ts
git commit -m "feat(ai): wire amphibious region-crossing reachability into objectiveCandidates (#1066)"
```

---

### Task 4: Let a transport-only demand actually get built

**Files:**
- Modify: `src/ai/ai-production.ts`
- Modify: `tests/ai/ai-production.test.ts`

**Interfaces:**
- Consumes: nothing new — reads the same `AIForceDemand[]` shape `objectiveCandidates`/`refreshMajorCivPortfolio` already produce, now including a `transport`-role entry when Task 3's fallback fires.
- Produces: no new exported symbol.

- [ ] **Step 1: Write the failing test**

In `tests/ai/ai-production.test.ts`, replace the existing test:

```ts
  it('requires cargo demand for transport and keeps transport pairing coherent', () => {
    const state = setupState(['galleys']);
    makeCoastal(state);

    const transportOnly = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('transport')],
      expansionist,
    );
    const paired = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('transport'), demand('capture')],
      expansionist,
    );

    expect(transportOnly.map(candidate => candidate.itemId)).not.toContain('transport');
    expect(paired.map(candidate => candidate.itemId)).toContain('transport');
  });
```

with:

```ts
  it('builds a transport for an explicit transport demand alone (#1066 amphibious routing)', () => {
    const state = setupState(['galleys']);
    makeCoastal(state);

    const transportOnly = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('transport')],
      expansionist,
    );
    const paired = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('transport'), demand('capture')],
      expansionist,
    );
    const unrelatedDemandOnly = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('worker')],
      expansionist,
    );

    expect(transportOnly.map(candidate => candidate.itemId)).toContain('transport');
    expect(paired.map(candidate => candidate.itemId)).toContain('transport');
    expect(unrelatedDemandOnly.map(candidate => candidate.itemId)).not.toContain('transport');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts -t "builds a transport for an explicit transport demand alone"`
Expected: FAIL — `transportOnly` does not contain `'transport'` yet.

- [ ] **Step 3: Write the implementation**

In `src/ai/ai-production.ts`, find:

```ts
  const cargoDemand = demands.some(entry =>
    entry.missing > 0 && COMBAT_CARGO_ROLES.has(entry.role));
```

Replace with:

```ts
  // #1066: a transport can be justified two ways -- an existing combat-cargo
  // demand (the original "ferry my army overseas" case), or an explicit
  // `transport` demand on its own (the amphibious-objective-routing case,
  // where `resolveObjectiveTravelCandidates` seeds `requiredRoles.transport`
  // directly for a civilian/settler crossing with no combat unit involved).
  const cargoDemand = demands.some(entry =>
    entry.missing > 0 && (COMBAT_CARGO_ROLES.has(entry.role) || entry.role === 'transport'));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts`
Expected: PASS — the whole file green.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-production.ts tests/ai/ai-production.test.ts
git commit -m "fix(ai): let a standalone transport demand justify building one (#1066)"
```

---

### Task 5: Verify against the real long-horizon scenario and retire the known-gap entry

**Files:**
- Modify: `tests/simulation/long-horizon/known-campaign-gaps.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task is verification plus a registry deletion, gated on that verification's outcome.

- [ ] **Step 1: Run the full suite once for a fast correctness check before the slow scenario run**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — 0 failures. This is the ordinary fast suite (not the long-horizon one), confirming nothing from Tasks 1-4 broke anything else before spending ~4 minutes on the scenario re-run.

- [ ] **Step 2: Re-run the specific long-horizon scenario this bug was found in**

Run: `bash scripts/run-with-mise.sh yarn test:ai-long -- -t lh-late-era-medium`
Expected: PASS. Read `.verification/ai-long-horizon/lh-late-era-medium.json`'s `report.findings` array afterward:

```bash
cat .verification/ai-long-horizon/lh-late-era-medium.json | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['report']['findings'], indent=2))"
```

**If `expansion-frozen` no longer appears in `findings`:** the fix worked end-to-end. Proceed to Step 3.

**If `expansion-frozen` still appears:** do not proceed. This means either (a) the specific civ that reproduced this in the original investigation (`ai-3`) is on a landmass this fix's one-hop crossing genuinely cannot reach (a >1-hop archipelago — an explicit non-goal, expected, not a bug in this work) and `known-campaign-gaps.ts`'s entry should be **updated** (not deleted) with a note explaining the residual shape, or (b) there's a real bug in Tasks 1-4. Distinguish by re-running the Task 1-3 diagnostic pattern used in the original investigation (instrument `findRegionCrossings`'s return value for the still-frozen civ via a temporary `console.log` in a throwaway test, same technique as the original root-cause investigation) before concluding which.

- [ ] **Step 3: If confirmed fixed, delete the retired entry**

In `tests/simulation/long-horizon/known-campaign-gaps.ts`, remove this entry from `KNOWN_CAMPAIGN_GAPS`:

```ts
  {
    code: 'expansion-frozen',
    issue: '#1066',
    why: 'Believed to share unit-count-runaway\'s root cause: the affected civs never '
      + 'form a single plan for the whole 250-round campaign, and #1064\'s exploration '
      + 'loop cannot make prepareMajorCivStrategicPlan itself produce a plan -- it only '
      + 'feeds the belief layer once a plan exists. Not caused by #1064 (see file header).',
    scenarios: ['lh-late-era-medium'],
  },
```

Also update the `tech-frozen` entry (currently pointing at `#1066` after #1093's closure) to note the fix landed — change its `why` to note this PR resolved the shared root cause, or delete it too if the `tech-frozen` finding also no longer reproduces in the same scenario run from Step 2 (check `report.findings` for `tech-frozen` too, not just `expansion-frozen`).

- [ ] **Step 4: Run the long-horizon suite's own ratchet test to confirm the registry edit is consistent**

Run: `bash scripts/run-with-mise.sh yarn test:ai-long`
Expected: PASS — this runs the FULL matrix (~20 minutes) and its `afterAll` ratchet check, confirming no other scenario still expects the deleted entry and no new unregistered finding appeared.

- [ ] **Step 5: Commit**

```bash
git add tests/simulation/long-horizon/known-campaign-gaps.ts
git commit -m "test(ai): retire expansion-frozen known-gap entry, fixed by amphibious routing (#1066)"
```

---

### Task 6: Perf baseline, final verification, and push

**Files:**
- Modify: `tests/perf/baselines/algorithmic-baseline.json` (regenerated, not hand-edited)

- [ ] **Step 1: Regenerate the algorithmic performance baseline**

Run: `bash scripts/run-with-mise.sh env UPDATE_PERF_BASELINE=1 yarn vitest run tests/perf/algorithmic-budgets.test.ts`
Expected: completes and rewrites `tests/perf/baselines/algorithmic-baseline.json`.

- [ ] **Step 2: Inspect the diff and justify every changed number**

Run: `git diff tests/perf/baselines/algorithmic-baseline.json`

Expected: any changed `aiRound`-related budget moves up modestly (Task 3 adds one BFS call per civ-turn only when at least one candidate's direct land path has already failed — the common case, a civ with an all-land route to everything, pays zero new cost). If a number decreased or an unrelated budget changed, stop and investigate before proceeding — per `.claude/rules/performance-budgets.md`, a dropped budget is not automatically good and needs cross-checking against `yarn test:ai-long`, not silent acceptance.

- [ ] **Step 3: Run the full regular test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — 0 failures.

- [ ] **Step 4: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — 0 type errors.

- [ ] **Step 5: Commit the perf baseline**

```bash
git add tests/perf/baselines/algorithmic-baseline.json
git commit -m "perf: regenerate algorithmic baseline for amphibious routing's new per-turn BFS (#1066)"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin worktree-issue-1066-zero-plan-civs
gh pr create --repo a1flecke/conquestoria --title "fix(ai): amphibious objective routing for water-locked civs (#1066)" --body "$(cat <<'EOF'
## Pre-PR inline code review

- Balancing, fun, mechanics, ages, play styles, difficulty: no new AI capability beyond reachability -- an amphibious plan still goes through the exact same expectedLossRatio/distance/personality scoring as every other candidate; difficulty tiers are untouched (no OpponentChallenge read anywhere in this change).
- AI: the strategic layer now proposes a plan across a one-hop water gap when one exists; execution is unchanged (ai-tactics.ts's transport-loading branch already existed and was simply unreachable).
- UI, UX, SFX, saves: no UI, renderer, audio, storage, schema, migration, or serialized-state files change -- everything here derives from already-persisted tile.terrain/regionKey.
- Regressions: existing ai-objective-scoring.test.ts/ai-prepared-turn.test.ts/ai-production.test.ts suites all still pass unmodified for the same-region (common) case; three new tests pin the new fallback, the negative (no-crossing) case, and the naval-domain no-op case respectively.

## Summary

Fixes #1066: an AI civ boxed onto a landmass with no all-land route to any known target got zero eligible strategic-plan candidates forever, because `objectiveCandidates`'s travel-time resolver hardcoded land-domain pathfinding. Also resolves the root cause behind the now-closed #1093 (`tech-frozen`), which was a downstream symptom of this same defect.

Reuses the existing `tile.regionKey` landmass partition (Hierarchical Pathfinding A*'s cluster abstraction, already load-bearing elsewhere in this codebase) plus one new per-turn BFS to find sea crossings cheaply, so a land-domain candidate whose direct path fails gets a composed multi-leg travel estimate and a `transport` role demand instead of `Infinity`. `ai-tactics.ts`'s existing transport-loading logic already handles execution -- it was just never reachable. One follow-on fix lets a standalone transport demand actually get built.

Full design: `docs/superpowers/specs/2026-09-13-issue-1066-amphibious-objective-routing-design.md`.

## Test plan

- [x] `yarn test`
- [x] `yarn build`
- [x] `yarn test:ai-long -- -t lh-late-era-medium` -- `expansion-frozen` no longer reproduces
- [x] `yarn test:ai-long` (full matrix) -- ratchet passes with the retired known-gap entry
- [x] `UPDATE_PERF_BASELINE=1` regenerated with justification above

Closes #1066
EOF
)"
```

---

## Self-Review Notes (for the plan author, not a task to execute)

- **Spec coverage:** Goal 1 (Tasks 1-3), Goal 1's production dependency (Task 4), Goal 3's cheap/bounded/deterministic requirement (Task 1's determinism test + Task 6's perf accounting), Goal 4 difficulty-invariance (no challenge reads anywhere, called out in Global Constraints), scope limits from Non-goals (single-hop only -- `findRegionCrossings` structurally cannot find a 2-hop route; no persisted data -- confirmed in Global Constraints) are all covered. The landlocked-civ follow-up issue from the spec's Non-goals is NOT a task here (correctly out of scope) — file it separately, not as part of this plan.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `RegionCrossing` (Task 1) is the exact type threaded through `resolveObjectiveTravelCandidates`'s new `crossings` parameter (Task 2) and `findRegionCrossings`'s call site (Task 3) — same field names (`targetRegionKey`, `embarkTile`, `disembarkTile`, `navalDistance`) used consistently in all three tasks' code and tests.
