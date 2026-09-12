# #1064 AI Baseline Expansion — MR1 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This project forbids subagents** (`CLAUDE.md` → Agent Policy): do NOT use
> `superpowers:subagent-driven-development`, do NOT spawn Agent tool calls. Execute
> every task inline in one session.

**Goal:** Make AI major civilizations expand — build settlers, walk them to a site, and
found cities — so they stop sitting at one city with an idle queue and a growing pile of
unspent gold.

**Architecture:** Expansion becomes a real `expand` strategic-plan objective with a
`region` target. Every piece it needs already exists in the type system (`'expand'`,
`kind: 'region'`, `settlement` in the role-assignment order, the `found-city` tactical
action and its executor). The only missing piece is a candidate generator. Once an
`expand` candidate exists, the existing bootstrap does the rest: with no settler the
candidate is ineligible but still reports `settlement` as a missing role, which becomes a
force demand, which makes the settler buildable; with a settler the candidate becomes a
plan, the settler is assigned to it, and tactics walks it to the site.

**Tech Stack:** TypeScript, Vitest, Vite. No new dependencies.

**Design:** `docs/superpowers/specs/2026-09-12-issue-1064-1066-1069-ai-viability-arc-design.md`
**Arc plan (MR2 #1066, MR3 #1069):** `docs/superpowers/plans/2026-09-12-issue-1064-1066-1069-ai-viability-arc.md`
This plan covers **MR1 only**. MR2 and MR3 start from refreshed `main` after MR1 merges.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Worktree.** All work happens in a git worktree, never `main`. After creating it run
  `./scripts/setup-git-hooks.sh`, verify `git config --worktree --get core.hooksPath`
  prints `.githooks`, and run `mise trust <worktree-path>/mise.toml` before the first push.
- **Commands.** Always `bash scripts/run-with-mise.sh yarn <cmd>`. Never
  `eval "$(mise activate bash)"`.
- **Bash tool timeouts.** `git commit` → 30000. `git push` / `gh pr create` → 240000.
  A single vitest file → 300000. `yarn build` / `yarn test` / `yarn test:ai-long` → 600000.
- **`yarn test` does not type-check.** `yarn build` is the only command that runs `tsc`.
  Before any push, run both and confirm each exits 0.
- **No `Math.random()`** anywhere in `src/`. No hand-rolled LCG. Source rule enforced by
  `.claude/hooks/check-src-edit.sh` on every edit under `src/`.
- **No `SAVE_VERSION` bump, no migration, no new persisted `GameState` field.** Nothing in
  this MR changes the persisted shape.
- **No `state.currentPlayer`** in any code you write. This is authoritative AI simulation;
  it is civ-scoped, not viewer-scoped.
- **`src/ai/ai-expansion-sites.ts` must never import `GameState`.** It receives an
  already-fog-bounded `GameMap`. This is what makes AI information safety structural
  rather than a review convention.
- **Never weaken a test detector or widen a threshold** to make a run green. If a
  long-horizon detector still fires, follow Task 11 — do not edit
  `DEFAULT_CAMPAIGN_ANALYSIS_CONFIG`.
- **Commit after every task.** End every commit message with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Decisions you may NOT change

1. Expansion is an `expand` plan objective with a `region` target. Do not substitute an
   administrative settler loop, a production fallback outside the demand model, or a
   `[0]`-selection bypass in `ai-production.ts`.
2. `applyAIProduction` keeps selecting `candidates[0]` regardless of score sign. The score
   is a ranking, not a veto. Do not add a negative-score idle branch.
3. `objectiveCandidates()` emits **exactly one** `expand` candidate. Do not emit the
   shortlist; it exists only as a reachability fallback.
4. Every incremental demand goes through the one shared seed helper (Task 2). Do not
   hand-roll `desired`/`assigned` arithmetic per role.
5. Site selection reads only the fog-bounded `knownMap` and `perception`. No `state.map`
   full-tile scan, no `state.cities` read.
6. The belief layer imports `MIN_CITY_CENTER_DISTANCE`, `cityDistance`, `mapHexesInRange`
   and `isCityCenterTerrain`. Do not re-derive any of them — especially not a
   non-wrap-aware distance.

If repository evidence contradicts this plan, stop and report
`DESIGN ESCALATION REQUIRED` with the assumption, the evidence, and the alternatives. Do
not silently redesign around it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/systems/city-territory-system.ts` | The canonical founding rule. Gains one pure export (`isCityCenterTerrain`), loses one private duplicate. |
| `src/ai/ai-resettlement.ts` | Cityless-civ rebuild. Loses its local copy of the terrain predicate. |
| `src/ai/ai-expansion-sites.ts` **(new)** | Where, in this civ's *belief*, could a city stand and how good is it? Pure; no `GameState`. |
| `src/ai/ai-prepared-turn.ts` | Turn belief into objective candidates and force demands. Gains `expandCandidates()` and the shared incremental-demand seed helper. |
| `src/ai/ai-major-turn.ts` | Execute ranked actions, advance plan phase. One gate becomes objective-aware. |
| `src/ai/ai-tactics.ts` | Rank a unit's legal actions for its plan. Settlers gain a move-toward-target branch. |
| `src/ai/ai-production.ts` | Choose what an idle city builds. One `O(n log n)` comparator becomes a precomputed map. |
| `tests/simulation/long-horizon/known-campaign-gaps.ts` | The ratchet. Three entries removed. |
| `.claude/rules/ai-simulation.md` | Documents the new expansion contract. |

---

# Task 0: Extract the shared founding-terrain predicate

The predicate `terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain'` is
already copy-pasted in five places. Task 1 needs it; adding a sixth copy would guarantee
drift the first time a `TerrainType` is added. This lands first so Task 1 has one thing
to import.

Collapse only the two that mean *"a city centre may stand here"*. Leave
`src/systems/barbarian-system.ts:222` and `src/systems/rogue-elephant-host-system.ts:81,158`
alone — those mean *"a land actor may spawn here"*, a different concept that merely
coincides today.

**Files:**
- Modify: `src/systems/city-territory-system.ts:1` (imports), `:481-484`
- Modify: `src/ai/ai-resettlement.ts:1-12` (imports), `:16-18`, `:30`
- Test: `tests/systems/city-territory-system.test.ts`

**Interfaces:**
- Produces: `isCityCenterTerrain(terrain: TerrainType): boolean` from
  `@/systems/city-territory-system`. Task 1 consumes it.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/city-territory-system.test.ts`. Add `isCityCenterTerrain` to the
existing import block from `@/systems/city-territory-system`, and add
`import type { TerrainType } from '@/core/types';` at the top.

```ts
describe('isCityCenterTerrain', () => {
  // Enumerated exhaustively on purpose: a newly added TerrainType fails this test
  // until someone decides which side of the founding rule it belongs on.
  const ALL_TERRAIN: TerrainType[] = [
    'grassland', 'plains', 'desert', 'tundra', 'snow',
    'forest', 'hills', 'mountain', 'ocean', 'coast',
    'jungle', 'swamp', 'volcanic',
  ];
  const BLOCKED: TerrainType[] = ['ocean', 'coast', 'mountain'];

  it.each(ALL_TERRAIN)('classifies %s', terrain => {
    expect(isCityCenterTerrain(terrain)).toBe(!BLOCKED.includes(terrain));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-territory-system.test.ts -t "isCityCenterTerrain"`

Expected: FAIL — `isCityCenterTerrain is not a function` (or a TS/import resolution error).

- [ ] **Step 3: Add the export and collapse the first duplicate**

In `src/systems/city-territory-system.ts`, add `TerrainType` to the existing type import
on line 1:

```ts
import type { City, GameEvents, GameMap, GameState, HexCoord, TerrainType, TerritoryFrontierState } from '@/core/types';
```

Then replace lines 481-484 entirely:

```ts
/**
 * May a city centre stand on this terrain? The single definition of that rule.
 * Imported by the AI's fog-bounded expansion-site belief layer
 * (`src/ai/ai-expansion-sites.ts`) so belief and legality cannot drift apart.
 */
export function isCityCenterTerrain(terrain: TerrainType): boolean {
  return terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain';
}

function isValidCityCenterTerrain(state: GameState, position: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(canonicalizeCityCoord(position, state.map))];
  return Boolean(tile && isCityCenterTerrain(tile.terrain));
}
```

- [ ] **Step 4: Collapse the second duplicate**

In `src/ai/ai-resettlement.ts`, change the import on line 4 from:

```ts
import { canFoundCityAt } from '@/systems/city-territory-system';
```

to:

```ts
import { canFoundCityAt, isCityCenterTerrain } from '@/systems/city-territory-system';
```

Delete lines 16-18 (the whole `isFoundingTerrain` function):

```ts
function isFoundingTerrain(terrain: string): boolean {
  return terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain';
}
```

In `visibleFoundingSites`, change the single call site from `isFoundingTerrain(tile.terrain)`
to `isCityCenterTerrain(tile.terrain)`:

```ts
    .filter(tile => isCityCenterTerrain(tile.terrain) && !sameCoord(tile.coord, settler.position))
```

- [ ] **Step 5: Run the tests and verify they pass**

Run:
```bash
bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-territory-system.test.ts tests/ai/ai-resettlement.test.ts
```

Expected: PASS, both files. `ai-resettlement.test.ts` passing unchanged is the proof the
swap is behaviour-neutral.

- [ ] **Step 6: Type-check**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/systems/city-territory-system.ts src/ai/ai-resettlement.ts tests/systems/city-territory-system.test.ts
git commit -m "refactor(city): extract isCityCenterTerrain as the one founding-terrain rule

The predicate was copy-pasted in five places. The AI expansion-site
belief layer needs it, and a sixth copy would drift the first time a
TerrainType is added. Collapses the two copies that mean 'a city centre
may stand here'; leaves the spawn-terrain copies alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 1: Fog-bounded expansion-site belief layer

**Files:**
- Create: `src/ai/ai-expansion-sites.ts`
- Test: `tests/ai/ai-expansion-sites.test.ts` (create)

**Interfaces:**
- Consumes: `isCityCenterTerrain`, `MIN_CITY_CENTER_DISTANCE`, `cityDistance` from
  `@/systems/city-territory-system`; `mapHexesInRange`, `hexKey` from
  `@/systems/hex-utils`; `evaluateExpansionTarget` from `./ai-strategy`.
- Produces, consumed by Tasks 3 and 4:
  - `interface AIExpansionSite { anchor: HexCoord; score: number }`
  - `getKnownExpansionSites(knownMap: GameMap, knownCityPositions: readonly HexCoord[], anchors: readonly HexCoord[], limit: number): AIExpansionSite[]`
  - `getExpansionCitySoftCap(expansionDrive: number): number`
  - `EXPANSION_SEARCH_RADIUS`, `EXPANSION_SITE_SHORTLIST`,
    `EXPANSION_CITY_SOFT_CAP_BASE`, `EXPANSION_NEIGHBOURHOOD_RADIUS`

- [ ] **Step 1: Write the failing tests**

Create `tests/ai/ai-expansion-sites.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameMap, HexCoord, TerrainType } from '@/core/types';
import {
  EXPANSION_SEARCH_RADIUS,
  getExpansionCitySoftCap,
  getKnownExpansionSites,
} from '@/ai/ai-expansion-sites';
import { hexKey } from '@/systems/hex-utils';

/** A flat known map. Only the tiles listed exist — absence models fog. */
function knownMap(
  tiles: Array<{ q: number; r: number; terrain: TerrainType }>,
  options: { wrapsHorizontally?: boolean; width?: number } = {},
): GameMap {
  return {
    width: options.width ?? 40,
    height: 40,
    wrapsHorizontally: options.wrapsHorizontally ?? false,
    tiles: Object.fromEntries(tiles.map(tile => [
      hexKey({ q: tile.q, r: tile.r }),
      {
        coord: { q: tile.q, r: tile.r },
        terrain: tile.terrain,
        elevation: 0,
        resource: null,
        improvement: null,
        owner: null,
        hasRiver: false,
      },
    ])),
  } as unknown as GameMap;
}

/** A square-ish patch of one terrain, centred on (cq, cr). */
function patch(cq: number, cr: number, radius: number, terrain: TerrainType) {
  const out: Array<{ q: number; r: number; terrain: TerrainType }> = [];
  for (let q = cq - radius; q <= cq + radius; q++) {
    for (let r = cr - radius; r <= cr + radius; r++) out.push({ q, r, terrain });
  }
  return out;
}

const ORIGIN: HexCoord = { q: 0, r: 0 };

describe('getKnownExpansionSites', () => {
  it('returns a legal site outside MIN_CITY_CENTER_DISTANCE of every known city', () => {
    const map = knownMap(patch(0, 0, 8, 'grassland'));
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 5);

    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(Math.abs(site.anchor.q) + Math.abs(site.anchor.r)).toBeGreaterThan(0);
    }
  });

  it('orders by score descending, then hexKey ascending', () => {
    const map = knownMap([
      ...patch(0, 0, 8, 'desert'),
      ...patch(6, 0, 2, 'grassland'),
    ]);
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 10);

    for (let i = 1; i < sites.length; i++) {
      const previous = sites[i - 1]!;
      const current = sites[i]!;
      if (previous.score === current.score) {
        expect(hexKey(previous.anchor) < hexKey(current.anchor)).toBe(true);
      } else {
        expect(previous.score).toBeGreaterThan(current.score);
      }
    }
  });

  it('respects the limit', () => {
    const map = knownMap(patch(0, 0, 8, 'grassland'));
    expect(getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 3)).toHaveLength(3);
  });

  it('prefers a grassland neighbourhood over a desert one', () => {
    const map = knownMap([
      ...patch(0, 0, 8, 'desert'),
      ...patch(5, 0, 2, 'grassland'),
    ]);
    const best = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 1)[0]!;
    const tile = map.tiles[hexKey(best.anchor)]!;

    expect(tile.terrain).toBe('grassland');
  });

  it('rejects a seam-adjacent site too close to a known city ACROSS the wrap', () => {
    // Width 10. A known city at q=1 and a candidate at q=9 are 2 apart across the
    // seam, well inside MIN_CITY_CENTER_DISTANCE=4 -- but 8 apart if you (wrongly)
    // use hexDistance. This test fails if cityDistance is not used.
    const map = knownMap(
      Array.from({ length: 10 }, (_, q) => ({ q, r: 0, terrain: 'grassland' as TerrainType })),
      { wrapsHorizontally: true, width: 10 },
    );
    const sites = getKnownExpansionSites(map, [{ q: 1, r: 0 }], [{ q: 1, r: 0 }], 20);

    expect(sites.map(site => site.anchor.q)).not.toContain(9);
  });

  it('never returns a tile failing the city-centre terrain rule', () => {
    const map = knownMap([
      ...patch(0, 0, 8, 'ocean'),
      ...patch(0, 0, 0, 'grassland'),
      { q: 6, r: 0, terrain: 'mountain' },
      { q: 6, r: 1, terrain: 'coast' },
    ]);
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 20);

    for (const site of sites) {
      expect(['ocean', 'coast', 'mountain']).not.toContain(map.tiles[hexKey(site.anchor)]!.terrain);
    }
  });

  it('never returns a tile within MIN_CITY_CENTER_DISTANCE of a known city', () => {
    const map = knownMap(patch(0, 0, 8, 'grassland'));
    const sites = getKnownExpansionSites(map, [ORIGIN, { q: 6, r: 0 }], [ORIGIN], 50);

    for (const site of sites) {
      expect(hexKey(site.anchor)).not.toBe(hexKey({ q: 6, r: 0 }));
      expect(hexKey(site.anchor)).not.toBe(hexKey({ q: 5, r: 0 }));
    }
  });

  it('never returns a tile absent from the known map, however good it would be', () => {
    // The perfect site at (6,0) is simply not in tiles -- the civ has not seen it.
    const map = knownMap([...patch(0, 0, 8, 'desert')].filter(t => !(t.q === 6 && t.r === 0)));
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 50);

    expect(sites.map(site => hexKey(site.anchor))).not.toContain(hexKey({ q: 6, r: 0 }));
  });

  it('never returns a tile beyond EXPANSION_SEARCH_RADIUS of every anchor', () => {
    const map = knownMap(patch(0, 0, EXPANSION_SEARCH_RADIUS + 6, 'grassland'));
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 500);

    for (const site of sites) {
      const ring = Math.max(
        Math.abs(site.anchor.q),
        Math.abs(site.anchor.r),
        Math.abs(site.anchor.q + site.anchor.r),
      );
      expect(ring).toBeLessThanOrEqual(EXPANSION_SEARCH_RADIUS);
    }
  });

  it('returns [] when there is no anchor', () => {
    expect(getKnownExpansionSites(knownMap(patch(0, 0, 8, 'grassland')), [], [], 5)).toEqual([]);
  });

  it('returns [] when no legal site exists', () => {
    const map = knownMap(patch(0, 0, 8, 'ocean'));
    expect(getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 5)).toEqual([]);
  });
});

describe('getExpansionCitySoftCap', () => {
  it('returns 2 at expansionDrive 0 and 6 at 1', () => {
    expect(getExpansionCitySoftCap(0)).toBe(2);
    expect(getExpansionCitySoftCap(1)).toBe(6);
  });

  it('is monotonic in expansionDrive', () => {
    const caps = [0, 0.25, 0.5, 0.75, 1].map(getExpansionCitySoftCap);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]!).toBeGreaterThanOrEqual(caps[i - 1]!);
    }
  });
});

describe('module purity', () => {
  it('never references GameState', () => {
    // Purity is the contract, not a convention: a pure function over an
    // already-fog-bounded map cannot leak hidden information, because the
    // omniscient state is not in scope to read.
    const source = readFileSync('src/ai/ai-expansion-sites.ts', 'utf8');
    expect(source).not.toContain('GameState');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-expansion-sites.test.ts`

Expected: FAIL — cannot resolve `@/ai/ai-expansion-sites`.

- [ ] **Step 3: Write the implementation**

Create `src/ai/ai-expansion-sites.ts`:

```ts
/**
 * #1064 -- where, in this civilization's BELIEF, could a city stand?
 *
 * This module is deliberately `GameState`-free. It receives a map that has ALREADY
 * been fog-bounded by `buildKnownPathMap`, so it is structurally incapable of reading
 * hidden information -- AI information safety by construction rather than by review
 * vigilance. Legality is still validated by the canonical helpers at execution time
 * (`canFoundCityAt` in the tactics ranking, `foundCityInState` in the executor); a
 * belief that turns out wrong costs a wasted walk, never an illegal city.
 *
 * It shares the real founding rule's own pieces -- `isCityCenterTerrain`,
 * `MIN_CITY_CENTER_DISTANCE`, the wrap-aware `cityDistance` -- so belief and legality
 * differ in exactly one dimension: which cities the civ knows about.
 */
import type { GameMap, HexCoord } from '@/core/types';
import {
  MIN_CITY_CENTER_DISTANCE,
  cityDistance,
  isCityCenterTerrain,
} from '@/systems/city-territory-system';
import { hexKey, mapHexesInRange } from '@/systems/hex-utils';
import { evaluateExpansionTarget } from './ai-strategy';

/**
 * How far from an operational anchor a site may sit. This is a COST bound, not a
 * flavour knob: an unbounded scan is O(known tiles x known cities) per civ per round,
 * which would add a new super-linear cost inside the arc that exists to remove one.
 * A settler moves 2/turn, so 8 is roughly a four-turn walk.
 */
export const EXPANSION_SEARCH_RADIUS = 8;

/** Sites handed to the travel resolver. Only the best REACHABLE one is ever emitted. */
export const EXPANSION_SITE_SHORTLIST = 3;

/** Tiles around a site whose terrain is scored. */
export const EXPANSION_NEIGHBOURHOOD_RADIUS = 2;

export const EXPANSION_CITY_SOFT_CAP_BASE = 2;

export interface AIExpansionSite {
  anchor: HexCoord;
  /** `evaluateExpansionTarget` over the site's KNOWN neighbourhood. */
  score: number;
}

/**
 * Owned-city count at or above which no expand candidate is produced. Range 2..6.
 * This is the ONLY place `expansionDrive` gates WHETHER a civ expands; everywhere
 * else it only weights HOW MUCH. It caps new settling, not empire size -- conquest
 * is unaffected.
 */
export function getExpansionCitySoftCap(expansionDrive: number): number {
  return EXPANSION_CITY_SOFT_CAP_BASE + Math.round(expansionDrive * 4);
}

function scoreNeighbourhood(knownMap: GameMap, centre: HexCoord): number {
  const terrainCounts: Record<string, number> = {};
  for (const coord of mapHexesInRange(knownMap, centre, EXPANSION_NEIGHBOURHOOD_RADIUS)) {
    const tile = knownMap.tiles[hexKey(coord)];
    if (!tile) continue;
    terrainCounts[tile.terrain] = (terrainCounts[tile.terrain] ?? 0) + 1;
  }
  return evaluateExpansionTarget(centre, terrainCounts);
}

/**
 * Sites this civilization believes a city could stand on, best first then `hexKey`
 * ascending (a total order, so the result is deterministic).
 *
 * `knownMap` MUST already be fog-bounded -- this performs no visibility filtering of
 * its own.
 */
export function getKnownExpansionSites(
  knownMap: GameMap,
  knownCityPositions: readonly HexCoord[],
  anchors: readonly HexCoord[],
  limit: number,
): AIExpansionSite[] {
  if (anchors.length === 0 || limit <= 0) return [];

  const considered = new Map<string, HexCoord>();
  for (const anchor of anchors) {
    for (const coord of mapHexesInRange(knownMap, anchor, EXPANSION_SEARCH_RADIUS)) {
      const key = hexKey(coord);
      if (considered.has(key) || !knownMap.tiles[key]) continue;
      considered.set(key, knownMap.tiles[key]!.coord);
    }
  }

  const sites: AIExpansionSite[] = [];
  for (const [key, coord] of considered) {
    const tile = knownMap.tiles[key]!;
    if (!isCityCenterTerrain(tile.terrain)) continue;
    const tooClose = knownCityPositions.some(city =>
      cityDistance(coord, city, knownMap) < MIN_CITY_CENTER_DISTANCE);
    if (tooClose) continue;
    sites.push({ anchor: { ...coord }, score: scoreNeighbourhood(knownMap, coord) });
  }

  return sites
    .sort((left, right) =>
      right.score - left.score
      || hexKey(left.anchor).localeCompare(hexKey(right.anchor)))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-expansion-sites.test.ts`

Expected: PASS, all tests.

If the wrap test fails, you used `hexDistance` somewhere instead of `cityDistance` /
`mapHexesInRange`. If the purity test fails, you imported or named `GameState`.

- [ ] **Step 5: Type-check**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ai-expansion-sites.ts tests/ai/ai-expansion-sites.test.ts
git commit -m "feat(ai): add fog-bounded expansion-site belief layer

Pure, GameState-free site enumeration and scoring for #1064. Shares the
canonical founding predicates (isCityCenterTerrain, MIN_CITY_CENTER_DISTANCE,
wrap-aware cityDistance) so belief and legality differ only in which cities
the civ knows about. Radius-bounded so enumeration is not O(tiles x cities).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 2: The shared incremental-demand seed helper

Force demands that mean *"I would like one more of role R, up to a cap"* currently do
their own arithmetic. `choice.demands` gets it wrong: it merges `desired: 1, assigned: 0`
every turn, and `residualDemands` only discounts units already **queued**, never units
that **exist** — so a persistent readiness role produces one unit per turn forever. Three
callers want this shape; writing the arithmetic three times is how they drift apart.

**Files:**
- Modify: `src/ai/ai-prepared-turn.ts` (add the helper next to `mergePreparedForceDemands`)
- Test: `tests/ai/ai-prepared-turn.test.ts`

**Interfaces:**
- Produces, consumed by Task 3:
  `incrementalDemandSeed(role: AIForceDemand['role'], sourceId: string, priority: number, owned: number, cap: number): PreparedForceDemandSeed[]`
  Exported so the test can reach it.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-prepared-turn.test.ts`. Add `incrementalDemandSeed` to the existing
import block from `@/ai/ai-prepared-turn`.

```ts
describe('incrementalDemandSeed', () => {
  it('asks for one when the civilization owns none', () => {
    expect(incrementalDemandSeed('worker', 'worker-infrastructure', 40, 0, 4))
      .toEqual([{
        role: 'worker',
        sourceId: 'worker-infrastructure',
        priority: 40,
        desired: 1,
        assigned: 0,
      }]);
  });

  it('asks for exactly one MORE, never the whole gap', () => {
    expect(incrementalDemandSeed('worker', 'worker-infrastructure', 40, 1, 4))
      .toEqual([{
        role: 'worker',
        sourceId: 'worker-infrastructure',
        priority: 40,
        desired: 2,
        assigned: 1,
      }]);
  });

  it('is satisfied at the cap', () => {
    const [seed] = incrementalDemandSeed('settlement', 'objective-readiness', 90, 1, 1);
    expect(seed).toMatchObject({ desired: 1, assigned: 1 });
  });

  it('returns nothing when already over cap, never a negative shortfall', () => {
    expect(incrementalDemandSeed('worker', 'worker-infrastructure', 40, 3, 2)).toEqual([]);
  });

  it('always merges to a missing of 0 or 1, for every owned/cap pair', () => {
    for (let owned = 0; owned <= 6; owned++) {
      for (let cap = 0; cap <= 6; cap++) {
        const merged = mergePreparedForceDemands(
          [],
          incrementalDemandSeed('worker', 'worker-infrastructure', 40, owned, cap),
        );
        const missing = merged.find(entry => entry.role === 'worker')?.missing ?? 0;
        expect(missing, `owned=${owned} cap=${cap}`).toBeGreaterThanOrEqual(0);
        expect(missing, `owned=${owned} cap=${cap}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts -t "incrementalDemandSeed"`

Expected: FAIL — `incrementalDemandSeed is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/ai/ai-prepared-turn.ts`, add immediately **after** the `mergePreparedForceDemands`
function:

```ts
/**
 * #1064 -- an INCREMENTAL demand: "one more R, up to `cap`".
 *
 * `desired = min(owned + 1, cap)` and `assigned = owned`, so the merged `missing` is
 * structurally 0 or 1. A standing force can never be requested in a single round, and
 * a demand can never outrun the units that satisfy it -- which is exactly the failure
 * that made a persistent readiness role produce one unit per turn forever.
 *
 * Returns [] at or over the cap so callers stay declarative.
 */
export function incrementalDemandSeed(
  role: AIForceDemand['role'],
  sourceId: string,
  priority: number,
  owned: number,
  cap: number,
): PreparedForceDemandSeed[] {
  const held = Math.max(0, Math.floor(owned));
  const ceiling = Math.max(0, Math.floor(cap));
  if (held >= ceiling) return [];
  return [{ role, sourceId, priority, desired: Math.min(held + 1, ceiling), assigned: held }];
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts`

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-prepared-turn.ts tests/ai/ai-prepared-turn.test.ts
git commit -m "feat(ai): add the incremental force-demand seed helper

desired = min(owned+1, cap), assigned = owned, so missing is structurally
0 or 1. One definition for every 'one more of R' demand, instead of the
arithmetic being rewritten per call site.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 3: Bound readiness demands and add the worker demand

⚠ **Highest-regression-risk task in this MR.** It damps standing `frontline` /
`capture` / `resource-expedition` readiness demands as well as fixing the settler path.
Step 6 exists to catch that; **read** its output rather than just checking it passes.

Workers ship here because they have the production gap but **not** the execution gap —
`src/ai/basic-ai.ts:700` already tasks idle workers with roads and improvements — and
because expansion alone does not clear `production-idle` / `gold-hoard` for a developed
civ that has built everything.

**Files:**
- Modify: `src/ai/ai-prepared-turn.ts:470-474` (hoist `availableRoles`), `:579-599` (seeds)
- Test: `tests/ai/ai-prepared-turn.test.ts`

**Interfaces:**
- Consumes: `incrementalDemandSeed` (Task 2).
- Produces: `WORKER_SOFT_CAP` from `@/ai/ai-prepared-turn`. It lives beside its only
  consumer, not in the expansion-site module — it is a force-composition cap, not a
  geography concept.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-prepared-turn.test.ts`:

```ts
describe('#1064 bounded force demands', () => {
  it('demands one worker when a two-city civilization owns none', () => {
    const state = createNewGame(undefined, 'demand-worker-none', 'small');
    const civ = state.civilizations['ai-1'];
    for (const unitId of [...civ.units]) {
      if (state.units[unitId]?.type === 'worker') {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'worker');

    expect(demand).toMatchObject({ missing: 1, priority: 40 });
  });

  it('stops demanding workers once the city-count cap is met', () => {
    const state = createNewGame(undefined, 'demand-worker-capped', 'small');
    const civ = state.civilizations['ai-1'];
    const home = state.cities[civ.cities[0]!]!;
    // One city -> cap 1. Give it one worker.
    const existing = civ.units.filter(id => state.units[id]?.type === 'worker');
    for (const extra of existing.slice(1)) {
      delete state.units[extra];
      civ.units = civ.units.filter(id => id !== extra);
    }
    if (existing.length === 0) {
      const worker = createUnit('worker', civ.id, home.position, state.idCounters);
      state.units[worker.id] = worker;
      civ.units.push(worker.id);
    }

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'worker');

    expect(demand?.missing ?? 0).toBe(0);
  });

  it('never demands more workers than WORKER_SOFT_CAP however many cities it holds', () => {
    const state = createNewGame(undefined, 'demand-worker-softcap', 'small');
    const civ = state.civilizations['ai-1'];
    addSpacedCities(state, civ.id, WORKER_SOFT_CAP + 3);

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'worker');

    expect(civ.cities.length).toBeGreaterThan(WORKER_SOFT_CAP);
    expect(demand?.desired ?? 0).toBeLessThanOrEqual(WORKER_SOFT_CAP);
  });

  it('satisfies an objective-readiness demand once the civilization owns one such unit', () => {
    const state = createNewGame(undefined, 'demand-readiness-owned', 'small');
    const civ = state.civilizations['ai-1'];
    const home = state.cities[civ.cities[0]!]!;
    const scout = createUnit('scout', civ.id, home.position, state.idCounters);
    state.units[scout.id] = scout;
    civ.units.push(scout.id);

    const readiness = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .filter(entry => entry.sourcePlanIds.includes('objective-readiness'));

    // Every readiness demand is a bootstrap ("I own zero of R"), so owning one
    // satisfies it. It must never re-open every turn.
    for (const demand of readiness) {
      expect(demand.missing).toBeLessThanOrEqual(1);
    }
    expect(readiness.every(demand => demand.desired <= demand.assigned + 1)).toBe(true);
  });
});
```

Add `WORKER_SOFT_CAP` to the existing import block from `@/ai/ai-prepared-turn`.

Both this test and the soft-cap test in Task 4 need extra cities. Add this helper once,
near the top of `tests/ai/ai-prepared-turn.test.ts`, and reuse it — cities must sit on
**real map tiles** at a legal spacing, or downstream yield and perception code sees a
city whose tile does not exist:

```ts
/** Found `count` extra cities for `civId` on real, legally spaced land tiles. */
function addSpacedCities(state: GameState, civId: string, count: number): void {
  const civ = state.civilizations[civId]!;
  const taken = Object.values(state.cities).map(city => city.position);
  for (const tile of Object.values(state.map.tiles)) {
    if (civ.cities.length >= count + 1) break;
    if (!isCityCenterTerrain(tile.terrain)) continue;
    if (taken.some(position => cityDistance(tile.coord, position, state.map) < MIN_CITY_CENTER_DISTANCE)) continue;
    const city = foundCity(civId, tile.coord, state.map, state.idCounters);
    state.cities[city.id] = city;
    civ.cities.push(city.id);
    taken.push(tile.coord);
  }
}
```

Imports it needs: `foundCity` from `@/systems/city-system` (already imported in that
file), and `isCityCenterTerrain`, `cityDistance`, `MIN_CITY_CENTER_DISTANCE` from
`@/systems/city-territory-system`.


- [ ] **Step 2: Run the tests and verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts -t "#1064 bounded force demands"`

Expected: FAIL — no `worker` demand exists yet, so `demand` is `undefined`.

- [ ] **Step 3: Hoist `availableRoles` and the personality**

In `src/ai/ai-prepared-turn.ts`, inside `prepareMajorCivStrategicPlan`, replace the
`doctrine` block (around line 455) with:

```ts
  const personality = resolveCivDefinition(state, civ.civType)?.personality ?? {
    traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5,
  };
  const doctrine = evaluateDominationDoctrine({
    knowledge,
    ownCityCount: perception.ownCities.length,
    personality,
    challenge: resolveOpponentChallenge(state),
  });
```

Then replace the `choice` block (around line 470) with:

```ts
  const availableRoles = availableRoleCounts(perception);
  const choice = choosePrimaryObjective({
    actorId: civId,
    turn: state.turn,
    candidates,
    availableRoles,
  });
```

Add the worker cap next to `incrementalDemandSeed` (exported so the test can read it):

```ts
/** Most workers an empire will ever ask for, regardless of city count. */
export const WORKER_SOFT_CAP = 4;
```

- [ ] **Step 4: Rewire the seeds**

Replace the first entry of the `mergePreparedForceDemands` array (around line 581) and
append the worker seed. The whole call becomes:

```ts
  const forceDemands = mergePreparedForceDemands(
    assignments.forceDemands,
    [
      // #1064: a readiness demand means "I own ZERO units of role R, so I cannot even
      // consider this objective". Owning one satisfies it. Before this it re-seeded
      // desired:1/assigned:0 every turn, and residualDemands only discounts QUEUED
      // units -- so a persistent readiness role produced one unit per turn forever.
      ...choice.demands.flatMap(role => incrementalDemandSeed(
        role,
        'objective-readiness',
        90,
        Math.min(availableRoles[role] ?? 0, 1),
        1,
      )),
      // #1064: workers have the production gap but not the execution gap -- basic-ai's
      // idle-worker loop already tasks them. Bounded by city count so a wide empire
      // does not turn into a worker farm.
      ...incrementalDemandSeed(
        'worker',
        'worker-infrastructure',
        40,
        perception.ownUnits.filter(unit =>
          !unit.transportId && getAIStrategicRoles(unit.type).includes('worker')).length,
        Math.min(perception.ownCities.length, WORKER_SOFT_CAP),
      ),
      ...(counterplay ? [{
        ...counterplay.forceDemand,
        desired: 1,
      }] : []),
      ...portfolioResult.unplannedDefenseCityIds.map(cityId => ({
        role: 'frontline' as const,
        sourceId: `defense-overflow:${cityId}`,
        priority: 600,
      })),
      ...observedArmorDemand(state, perception, getPreparedAssignmentProfile(state)),
      ...observedAirDefenseDemand(state, perception),
    ],
  );
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts`

Expected: PASS, whole file.

- [ ] **Step 6: Run the regression surface and READ the output**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts tests/ai/ai-domination.test.ts tests/ai/ai-unit-assignment.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/simulation/domination-ai-campaign.test.ts
bash scripts/run-with-mise.sh yarn test:ai-playability
```

Expected: PASS, all.

If a test fails because the AI now builds **fewer** military units, that is a real
finding, not a number to update. Design §2.5 names the escalation: scoping `cap = 1` to
`settlement` and `worker` only, leaving combat readiness unbounded. Take that as an
explicit escalation to the human — do not make it quietly.

- [ ] **Step 7: Type-check**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/ai/ai-prepared-turn.ts tests/ai/ai-prepared-turn.test.ts
git commit -m "fix(ai): bound readiness demands and add a bounded worker demand

An objective-readiness seed re-merged desired:1/assigned:0 every turn and
residualDemands only discounts QUEUED units, so a persistent readiness role
produced one unit per turn forever. Both readiness and the new worker demand
now route through incrementalDemandSeed, so missing is always 0 or 1.

Workers ship here because they have the production gap but not the execution
gap, and because expansion alone does not clear production-idle for a civ
that has already built everything.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 4: Emit the `expand` objective candidate

This is the core of #1064. With no settler, the candidate is ineligible but still reports
`settlement` as a missing role — which Task 3's readiness seed turns into a demand, which
makes the settler buildable. With a settler, the candidate becomes a real plan.

**Files:**
- Modify: `src/ai/ai-prepared-turn.ts:218-330` (`objectiveCandidates`), `:469` (call site)
- Test: `tests/ai/ai-prepared-turn.test.ts`

**Interfaces:**
- Consumes: `getKnownExpansionSites`, `getExpansionCitySoftCap`,
  `EXPANSION_SITE_SHORTLIST` (Task 1); `incrementalDemandSeed` via Task 3's readiness path.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-prepared-turn.test.ts`:

```ts
describe('#1064 expand objective candidates', () => {
  it('demands a settler when a one-city civilization has nowhere to put one yet', () => {
    const state = createNewGame(undefined, 'expand-demand-settler', 'small');
    const civ = state.civilizations['ai-1'];
    for (const unitId of [...civ.units]) {
      if (state.units[unitId]?.type === 'settler') {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'settlement');

    expect(demand).toMatchObject({ missing: 1, priority: 90 });
    expect(demand?.sourcePlanIds).toContain('objective-readiness');
  });

  it('stops demanding a settler once one is alive', () => {
    const state = createNewGame(undefined, 'expand-settler-alive', 'small');
    const civ = state.civilizations['ai-1'];
    const home = state.cities[civ.cities[0]!]!;
    const settler = createUnit('settler', civ.id, home.position, state.idCounters);
    state.units[settler.id] = settler;
    civ.units.push(settler.id);

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'settlement');

    expect(demand?.missing ?? 0).toBe(0);
  });

  it('assigns a living settler to the expand plan', () => {
    const state = createNewGame(undefined, 'expand-assigns-settler', 'small');
    const civ = state.civilizations['ai-1'];
    const home = state.cities[civ.cities[0]!]!;
    const settler = createUnit('settler', civ.id, home.position, state.idCounters);
    state.units[settler.id] = settler;
    civ.units.push(settler.id);

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);
    const plan = prepared.portfolio.primaryPlan;

    if (plan?.objective === 'expand') {
      expect(prepared.assignments.assignmentsByPlanId[plan.id]).toContain(settler.id);
      expect(plan.requiredRoles).toMatchObject({ settlement: 1 });
      expect(plan.target.kind).toBe('region');
    }
  });

  it('emits at most one expand candidate however many sites qualify', () => {
    const state = createNewGame(undefined, 'expand-single-candidate', 'small');
    const civ = state.civilizations['ai-1'];

    const trace = prepareMajorCivStrategicPlan(state, civ.id).traces
      .find(entry => entry.decision === 'objective');
    const expandIds = (trace?.candidates ?? []).filter(candidate =>
      candidate.id.startsWith('expand:'));

    expect(expandIds.length).toBeLessThanOrEqual(1);
  });

  it('keeps the objective trace inside the 12-candidate ceiling', () => {
    // assertLegalChoices in the long-horizon fixture HARD THROWS above 12.
    const state = createNewGame(undefined, 'expand-trace-ceiling', 'small');
    for (const civ of Object.values(state.civilizations)) {
      civ.knownCivilizations = Object.keys(state.civilizations).filter(id => id !== civ.id);
      for (const key of Object.keys(state.map.tiles)) civ.visibility.tiles[key] = 'visible';
    }

    for (const civId of Object.keys(state.civilizations)) {
      if (state.civilizations[civId]!.isHuman) continue;
      const trace = prepareMajorCivStrategicPlan(state, civId).traces
        .find(entry => entry.decision === 'objective');
      expect(trace?.candidates.length ?? 0, civId).toBeLessThanOrEqual(12);
    }
  });

  it('produces no expand candidate at the expansion soft cap', () => {
    const state = createNewGame(undefined, 'expand-soft-cap', 'small');
    const civ = state.civilizations['ai-1'];
    const settler = createUnit(
      'settler', civ.id, state.cities[civ.cities[0]!]!.position, state.idCounters,
    );
    state.units[settler.id] = settler;
    civ.units.push(settler.id);
    // Past any soft cap (the maximum is 6), on real, legally spaced tiles.
    // `addSpacedCities` is the helper added to this same file in Task 3 Step 1.
    addSpacedCities(state, civ.id, 8);

    const trace = prepareMajorCivStrategicPlan(state, civ.id).traces
      .find(entry => entry.decision === 'objective');

    expect((trace?.candidates ?? []).some(c => c.id.startsWith('expand:'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts -t "#1064 expand objective candidates"`

Expected: FAIL — no `settlement` demand exists, so the first test's `demand` is `undefined`.

- [ ] **Step 3: Add the parameter and the generator**

In `src/ai/ai-prepared-turn.ts`, add `PersonalityTraits` to the type import from
`@/core/types` at the top of the file:

```ts
import type {
  AIStrategicPlan,
  GameMap,
  GameState,
  MajorCivPlanPortfolio,
  PersonalityTraits,
} from '@/core/types';
```

Add the expansion-sites import beside the other `./ai-*` imports:

```ts
import {
  EXPANSION_SITE_SHORTLIST,
  getExpansionCitySoftCap,
  getKnownExpansionSites,
} from './ai-expansion-sites';
```

Change the `objectiveCandidates` signature (line 218) to take the personality:

```ts
function objectiveCandidates(
  state: Readonly<GameState>,
  civId: string,
  perception: MajorCivPerception,
  knownMap: GameMap,
  doctrine: DominationDoctrine,
  knowledge: ReturnType<typeof buildDominationKnowledge>,
  personality: PersonalityTraits,
): AIObjectiveCandidate[] {
```

Insert this block **immediately before** `const travelInputs: AIObjectiveTravelCandidate[] = ...`
(i.e. right after the `knownResources` loop ends, around line 318):

```ts
  // #1064: expansion is a real objective, not an administrative side-channel. With no
  // settler this candidate is ineligible (missingRoles) but still reports `settlement`,
  // which becomes an objective-readiness demand and makes the settler buildable. With a
  // settler it becomes a plan and the settler is assigned to it.
  if (perception.ownCities.length < getExpansionCitySoftCap(personality.expansionDrive)) {
    const knownCityPositions = perception.knownCities
      .flatMap(city => city.position ? [city.position] : []);
    for (const site of getKnownExpansionSites(
      knownMap,
      knownCityPositions,
      operationalAnchors,
      EXPANSION_SITE_SHORTLIST,
    )) {
      const anchor = nearestAnchor(site.anchor);
      const travelTurns = Math.ceil(distance(state, anchor, site.anchor) / 2);
      const candidate: AIObjectiveCandidate = {
        objective: 'expand',
        target: {
          kind: 'region',
          id: `settle:${hexKey(site.anchor)}`,
          anchor: { ...site.anchor },
        },
        theaterId: `local:${site.anchor.q},${site.anchor.r}`,
        travelTurns,
        strategicValue: Math.max(0, Math.min(100, site.score * (0.5 + personality.expansionDrive))),
        expectedLossRatio: 0,
        supplyDistance: travelTurns,
        // Expansion is LOCAL activity. It must never earn scoreObjectiveCandidate's
        // +35 distant-reason bonus.
        explicitDistantReasons: [],
        requiredRoles: { settlement: 1 },
      };
      candidates.push(candidate);
      startByCandidate.set(candidate, anchor);
    }
  }
```

- [ ] **Step 4: Keep exactly one expand candidate**

Replace the final `return resolveObjectiveTravelCandidates(knownMap, travelInputs);` of
`objectiveCandidates` with:

```ts
  const resolved = resolveObjectiveTravelCandidates(knownMap, travelInputs);
  // Exactly ONE expand candidate reaches the caller, so the decision trace grows by at
  // most 1 unconditionally -- assertLegalChoices hard-throws above 12 candidates. The
  // shortlist exists only so an unreachable best site falls back to a reachable one.
  // One is also the semantically correct number: a civ has one primaryPlan and, by the
  // incremental settlement demand, at most one settler.
  const bestExpand = resolved
    .filter(candidate =>
      candidate.objective === 'expand' && Number.isFinite(candidate.travelTurns))
    .sort((left, right) =>
      scoreObjectiveCandidate(right) - scoreObjectiveCandidate(left)
      || targetStableKey(left.target).localeCompare(targetStableKey(right.target)))[0];
  return [
    ...resolved.filter(candidate => candidate.objective !== 'expand'),
    ...(bestExpand ? [bestExpand] : []),
  ];
}
```

- [ ] **Step 5: Update the call site**

At line 469, pass the personality hoisted in Task 3:

```ts
  const candidates = objectiveCandidates(state, civId, perception, knownMap, doctrine, knowledge, personality);
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts tests/ai/ai-objective-scoring.test.ts tests/ai/ai-plan-portfolio.test.ts`

Expected: PASS, all three files.

- [ ] **Step 7: Type-check**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/ai/ai-prepared-turn.ts tests/ai/ai-prepared-turn.test.ts
git commit -m "feat(ai): emit an expand objective candidate so civs can settle (#1064)

objectiveCandidates now produces exactly one expand candidate targeting the
best REACHABLE known site. With no settler it is ineligible but still reports
settlement as a missing role, which becomes a readiness demand and makes the
settler buildable; with a settler it becomes a real plan and the settler is
assigned to it.

Exactly one candidate is emitted so the objective trace grows by at most 1 --
assertLegalChoices hard-throws above 12.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 5: Make the plan-phase gate objective-aware

`nextPlanPhase` gates `mobilizing → advancing` on `hasCaptureOrFrontline`. A settler is
neither, so a settle plan would sit in `mobilizing` for its whole life. That is not fatal
— `preparingOffense` is false for `expand`, so the settler is still dispatched — but it
permanently distorts `plan-stuck` and `maxNoProgressRounds`, which are exactly the
long-horizon signals this MR is judged on.

**Files:**
- Modify: `src/ai/ai-major-turn.ts:750-757`
- Test: `tests/ai/ai-major-turn.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/ai/ai-major-turn.test.ts`, following the file's existing fixture style:

```ts
describe('#1064 non-offensive plan phase', () => {
  it('advances an expand plan to advancing without a capture or frontline unit', () => {
    const state = createNewGame(undefined, 'phase-expand-advances', 'small');
    const civ = state.civilizations['ai-1'];
    const home = state.cities[civ.cities[0]!]!;
    const settler = createUnit('settler', civ.id, home.position, state.idCounters);
    state.units[settler.id] = settler;
    civ.units.push(settler.id);
    state.turn = 30;

    const plan: AIStrategicPlan = {
      id: 'expand-plan',
      actorId: civ.id,
      objective: 'expand',
      target: { kind: 'region', id: 'settle:6,0', anchor: { q: 6, r: 0 } },
      theaterId: 'local:6,0',
      phase: 'mobilizing',
      reasonCodes: ['nearby-opportunity'],
      commitment: 0.25,
      createdTurn: 20,
      reconsiderAfterTurn: 23,
      expiresAfterTurn: 32,
      lastProgressTurn: 29,
      requiredRoles: { settlement: 1 },
      assignedUnitIds: [settler.id],
    };

    expect(resolveNextPlanPhaseForTest(
      state, plan, [settler.id], [], buildMajorCivPerception(state, civ.id),
    )).toBe('advancing');
  });

  it('still requires a capture or frontline unit for an offensive plan', () => {
    const state = createNewGame(undefined, 'phase-capture-gated', 'small');
    const civ = state.civilizations['ai-1'];
    const home = state.cities[civ.cities[0]!]!;
    const worker = createUnit('worker', civ.id, home.position, state.idCounters);
    state.units[worker.id] = worker;
    civ.units.push(worker.id);
    state.turn = 30;

    const plan: AIStrategicPlan = {
      id: 'capture-plan',
      actorId: civ.id,
      objective: 'capture',
      target: { kind: 'region', id: 'raid:6,0', anchor: { q: 6, r: 0 } },
      theaterId: 'local:6,0',
      phase: 'mobilizing',
      reasonCodes: ['continue-active-war'],
      commitment: 0.5,
      createdTurn: 20,
      reconsiderAfterTurn: 23,
      expiresAfterTurn: 32,
      lastProgressTurn: 29,
      requiredRoles: { frontline: 1 },
      assignedUnitIds: [worker.id],
    };

    expect(resolveNextPlanPhaseForTest(
      state, plan, [worker.id], [], buildMajorCivPerception(state, civ.id),
    )).toBe('mobilizing');
  });
});
```

`nextPlanPhase` is module-private and has no other public entry point. Export a thin test
seam next to it in `src/ai/ai-major-turn.ts`. It takes the perception as a parameter —
`ai-major-turn.ts` imports `MajorCivPerception` as a **type only** (line 60), and a test
seam must not drag a new runtime import into production code:

```ts
/** #1064 test seam: `nextPlanPhase` is private and has no other public entry point. */
export function resolveNextPlanPhaseForTest(
  after: GameState,
  plan: AIStrategicPlan,
  assignedUnitIds: readonly string[],
  actions: readonly AITacticalAction[],
  perception: MajorCivPerception,
): AIStrategicPlan['phase'] {
  return nextPlanPhase(after, plan, assignedUnitIds, actions, perception);
}
```

In the test file, build the perception yourself and pass it:

```ts
import { buildMajorCivPerception } from '@/ai/ai-perception';
import { resolveNextPlanPhaseForTest } from '@/ai/ai-major-turn';
```

so both calls become, for example:

```ts
resolveNextPlanPhaseForTest(
  state, plan, [settler.id], [], buildMajorCivPerception(state, civ.id),
)
```

Also import `createNewGame`, `createUnit` and the `AIStrategicPlan` type in the test file
if they are not already there.

- [ ] **Step 2: Run the tests and verify the first one fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-major-turn.test.ts -t "#1064 non-offensive plan phase"`

Expected: the `expand` test FAILS with `expected 'mobilizing' to be 'advancing'`. The
`capture` test already passes — it is the regression pin.

- [ ] **Step 3: Make the gate objective-aware**

In `src/ai/ai-major-turn.ts`, replace the condition at lines 750-757 with:

```ts
    if (
      migrationGrace === 0
      // #1064: capture/frontline is an OFFENSIVE readiness requirement. A settle plan
      // carries a settler and nothing else, and would otherwise sit in `mobilizing`
      // for its whole life, permanently distorting plan-stuck / maxNoProgressRounds.
      && (!isOffensivePlan(plan) || hasCaptureOrFrontline(after, assignedUnitIds))
      && (hasRequiredRoles(after, plan, assignedUnitIds) || deadlineReached)
    ) {
      return 'advancing';
    }
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-major-turn.test.ts`

Expected: PASS, whole file.

- [ ] **Step 5: Type-check**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ai-major-turn.ts tests/ai/ai-major-turn.test.ts
git commit -m "fix(ai): gate capture/frontline readiness on offensive plans only

A settle plan carries a settler and nothing else, so the capture/frontline
conjunct wedged it in mobilizing for its whole life, permanently distorting
plan-stuck and maxNoProgressRounds. Offensive plans keep the requirement.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 6: Walk the settler to its site

Today a settler emits `found-city` only where it already stands and otherwise returns
`[]`. Since `MIN_CITY_CENTER_DISTANCE` is 4, a settler trained in a city can **never**
found where it spawns — so without this task, settlers accumulate and never build
anything.

**Files:**
- Modify: `src/ai/ai-tactics.ts:751-755`
- Test: `tests/ai/ai-tactics.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-tactics.test.ts`. That file already defines `AI`, `makeState`,
`addUnit`, `addCity`, `makePlan` and `context` at module scope — reuse them, do not add a
second fixture style. `rankUnitTacticalActions` is already imported there.

```ts
describe('#1064 settler movement', () => {
  it('moves toward the region anchor when it cannot found where it stands', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 0, r: 0 });            // founding here is now illegal
    const settler = addUnit(state, 'settler-1', 'settler', AI, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'settle:6,0', anchor: { q: 6, r: 0 } },
      [settler.id],
      { objective: 'expand', requiredRoles: { settlement: 1 } },
    );

    const actions = rankUnitTacticalActions(context(state, plan), settler);
    const move = actions.find(entry => entry.action.kind === 'move');
    const path = findPath(settler.position, { q: 6, r: 0 }, state.map, 'land', {
      unit: settler,
      completedTechs: state.civilizations[AI].techState.completed,
    });

    expect(move).toBeDefined();
    expect(move!.action).toMatchObject({ kind: 'move', destination: path![1] });
  });

  it('prefers founding over moving when the tile is legal', () => {
    const state = makeState();
    const settler = addUnit(state, 'settler-1', 'settler', AI, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'settle:6,0', anchor: { q: 6, r: 0 } },
      [settler.id],
      { objective: 'expand', requiredRoles: { settlement: 1 } },
    );

    const actions = rankUnitTacticalActions(context(state, plan), settler);

    expect(actions[0]?.action.kind).toBe('found-city');
    expect(actions.some(entry => entry.action.kind === 'move')).toBe(false);
  });

  it('emits nothing when the anchor is unreachable', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 0, r: 0 });
    const settler = addUnit(state, 'settler-1', 'settler', AI, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'settle:999,999', anchor: { q: 999, r: 999 } },
      [settler.id],
      { objective: 'expand', requiredRoles: { settlement: 1 } },
    );

    expect(rankUnitTacticalActions(context(state, plan), settler)).toHaveLength(0);
  });
});
```

Add `findPath` to the existing `@/systems/unit-system` import in that file if it is not
already there.

**Before running:** confirm the second test's assumption holds for `makeState`'s map —
the settler must be standing somewhere `canFoundCityAt` returns `true`. If `makeState`
places a city at or near the origin, move the settler to a tile at least
`MIN_CITY_CENTER_DISTANCE` (4) away from every city in that fixture and adjust the plan
anchor to match. Do not weaken the assertion to accommodate the fixture.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts -t "#1064 settler movement"`

Expected: the move test FAILS — `move` is `undefined`, because the settler branch returns
`[]` when it cannot found.

- [ ] **Step 3: Add the move branch**

In `src/ai/ai-tactics.ts`, replace lines 751-755 with:

```ts
  if (unit.type === 'settler' && !unit.hasActed && unit.movementPointsLeft > 0) {
    // Legality still wins over belief: canFoundCityAt is the canonical rule, so a site
    // the civ merely BELIEVED legal is refused here rather than founded.
    if (canFoundCityAt(context.state, unit.position)) {
      return [ranked({ kind: 'found-city', unitId: unit.id, destination: unit.position }, 650)];
    }
    // #1064: MIN_CITY_CENTER_DISTANCE is 4, so a settler trained in a city can never
    // found where it spawns. Without this step it would idle forever.
    const completedTechs = context.state.civilizations[context.actorId]?.techState.completed ?? [];
    const path = findPath(
      unit.position,
      targetPosition(context.plan),
      context.state.map,
      'land',
      { unit, completedTechs },
    );
    return path && path.length > 1
      ? [ranked({ kind: 'move', unitId: unit.id, destination: path[1]! }, 645)]
      : [];
  }
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts`

Expected: PASS, whole file.

- [ ] **Step 5: Pin plan stability while the settler walks**

A settler's walk takes several turns, and the expand candidate is re-derived every turn.
Two near-equal sites could swap rank and make the settler oscillate. Three existing
mechanisms already prevent that and this MR relies on them rather than adding a fourth:
`selectPrimaryPlan`'s `switchingBonus = 10 + 20 x commitment`
(`src/ai/ai-plan-portfolio.ts:168`), the `hexKey`-ascending tie-break, and anchors being
the civ's own **cities** rather than its units (so a walking settler does not move the
scoring frame under itself).

Add to `tests/ai/ai-plan-portfolio.test.ts`, following that file's existing
`refreshMajorCivPortfolio` fixture style:

```ts
describe('#1064 settle-plan stability', () => {
  // Named to avoid shadowing this file's module-level `candidate` helper, which
  // builds a capture candidate.
  const settlePlan = (anchor: { q: number; r: number }, createdTurn: number) => ({
    id: `ai-plan:ai-1:expand:region:settle:${anchor.q},${anchor.r}:${createdTurn}`,
    actorId: 'ai-1',
    objective: 'expand' as const,
    target: { kind: 'region' as const, id: `settle:${anchor.q},${anchor.r}`, anchor },
    theaterId: `local:${anchor.q},${anchor.r}`,
    phase: 'advancing' as const,
    reasonCodes: ['nearby-opportunity' as const],
    commitment: 0.25,
    createdTurn,
    reconsiderAfterTurn: createdTurn + 3,
    expiresAfterTurn: createdTurn + 12,
    lastProgressTurn: createdTurn + 2,
    requiredRoles: { settlement: 1 },
    assignedUnitIds: ['settler-1'],
  });

  const expandCandidate = (anchor: { q: number; r: number }, score: number) => ({
    objective: 'expand' as const,
    target: { kind: 'region' as const, id: `settle:${anchor.q},${anchor.r}`, anchor },
    theaterId: `local:${anchor.q},${anchor.r}`,
    score,
    reasonCodes: ['nearby-opportunity' as const],
    requiredRoles: { settlement: 1 },
    commitment: 0.25,
    targetValid: true,
    reasonValid: true,
    expectedLossRatio: 0,
    progress: false,
  });

  it('keeps the incumbent site when a rival site is only marginally better', () => {
    const current = settlePlan({ q: 6, r: 0 }, 10);
    const result = refreshMajorCivPortfolio({
      actorId: 'ai-1',
      turn: 12,
      actorEliminated: false,
      portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: current },
      // +5 is well inside switchingBonus (10 + 20 * 0.25 = 15).
      candidates: [expandCandidate({ q: 6, r: 0 }, 40), expandCandidate({ q: 9, r: 3 }, 45)],
      cityThreats: [],
      modernization: {
        bestTrainableStrength: 10, deployedStrength: 10, actorEra: 1, globalEra: 1,
        knownRivalMaxStrength: 0, obsoleteUnitShare: 0, treasuryCanAct: true,
      },
    });

    expect(result.portfolio.primaryPlan?.target).toMatchObject({ id: 'settle:6,0' });
  });

  it('drops the plan when its site stops qualifying', () => {
    // Someone founded nearby, so the site no longer produces a candidate. Note
    // targetStillValid alone does NOT catch this -- for a region target it only checks
    // that the tile exists -- so the candidate-driven path is what does the work.
    const current = settlePlan({ q: 6, r: 0 }, 10);
    const result = refreshMajorCivPortfolio({
      actorId: 'ai-1',
      turn: 12,
      actorEliminated: false,
      portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: current },
      candidates: [expandCandidate({ q: 12, r: 4 }, 30)],
      cityThreats: [],
      modernization: {
        bestTrainableStrength: 10, deployedStrength: 10, actorEra: 1, globalEra: 1,
        knownRivalMaxStrength: 0, obsoleteUnitShare: 0, treasuryCanAct: true,
      },
    });

    expect(result.portfolio.primaryPlan?.target).toMatchObject({ id: 'settle:12,4' });
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-plan-portfolio.test.ts`

Expected: PASS. These need no production change — they pin behaviour the existing
portfolio logic already provides, so that a later tuning edit cannot silently remove it.
If either fails, stop: the settler will oscillate or thrash in the long-horizon run, and
that is a design problem, not a test to adjust.

- [ ] **Step 6: Type-check**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ai/ai-tactics.ts tests/ai/ai-tactics.test.ts tests/ai/ai-plan-portfolio.test.ts
git commit -m "feat(ai): walk a settler to its expand plan's site

MIN_CITY_CENTER_DISTANCE is 4, so a settler trained in a city can never
found where it spawns; the settler branch previously returned [] in that
case and the unit idled forever. It now steps along the canonical path
toward the plan's region anchor and founds on arrival.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 7: Stop regenerating production candidates inside a sort comparator

`applyAIProduction`'s `idleCities.sort()` comparator calls `generateWithResidual` **twice
per comparison** — `O(n log n)` full candidate generations per civ per round, each of
which calls `calculateProjectedCityYields`. This MR adds a candidate class, so leaving it
would multiply the cost.

The refactor is provably order-identical: the comparator already reads `state` (not
`nextState`), and `residual` is still pristine at sort time — it is only mutated inside
the loop that follows.

**Files:**
- Modify: `src/ai/ai-production.ts:733-760`
- Test: `tests/ai/ai-production.test.ts`

- [ ] **Step 1: Write the pinning tests**

Add to `tests/ai/ai-production.test.ts`. Write these against **current** behaviour first.

```ts
describe('#1064 production selection invariants', () => {
  it('enqueues the top-ranked item even when every candidate scores negative', () => {
    // The score is a RANKING, not a veto. A one-city AI with low production
    // legitimately has all-negative candidates, and idling is strictly worse --
    // idling is the production-idle finding this work exists to remove.
    const state = createNewGame(undefined, 'production-negative-scores', 'small');
    const civ = state.civilizations['ai-1'];
    const city = state.cities[civ.cities[0]!]!;
    city.productionQueue = [];

    const next = applyAIProduction(state, civ.id, [], aggressive);

    expect(next.cities[city.id]!.productionQueue.length).toBeGreaterThan(0);
  });

  it('queues at most one settler empire-wide per round', () => {
    const state = createNewGame(undefined, 'production-one-settler', 'small');
    const civ = state.civilizations['ai-1'];
    // Real, legally spaced tiles: a city whose map tile does not exist breaks the
    // yield projection every production candidate is priced against.
    const taken = Object.values(state.cities).map(city => city.position);
    for (const tile of Object.values(state.map.tiles)) {
      if (civ.cities.length >= 4) break;
      if (!isCityCenterTerrain(tile.terrain)) continue;
      if (taken.some(p => cityDistance(tile.coord, p, state.map) < MIN_CITY_CENTER_DISTANCE)) continue;
      const city = foundCity(civ.id, tile.coord, state.map, state.idCounters);
      state.cities[city.id] = city;
      civ.cities.push(city.id);
      taken.push(tile.coord);
    }
    for (const cityId of civ.cities) state.cities[cityId]!.productionQueue = [];

    const next = applyAIProduction(state, civ.id, [{
      role: 'settlement', desired: 1, assigned: 0, missing: 1,
      priority: 90, sourcePlanIds: ['objective-readiness'],
    }], aggressive);
    const settlers = civ.cities
      .filter(cityId => next.cities[cityId]?.productionQueue[0] === 'settler');

    expect(settlers).toHaveLength(1);
  });
});
```

`aggressive` is the personality fixture already defined at
`tests/ai/ai-production.test.ts:34`; reuse it rather than defining another. Add
`foundCity` from `@/systems/city-system` and `isCityCenterTerrain`, `cityDistance`,
`MIN_CITY_CENTER_DISTANCE` from `@/systems/city-territory-system` to that file's
imports.

- [ ] **Step 2: Run the tests and verify they pass on unmodified code**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts -t "#1064 production selection invariants"`

Expected: PASS. These pin behaviour that must survive the refactor. If either fails now,
stop — the premise of this task is wrong; report it.

- [ ] **Step 3: Commit the pins before refactoring**

```bash
git add tests/ai/ai-production.test.ts
git commit -m "test(ai): pin production-selection invariants before refactor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hoist the comparator's work**

In `src/ai/ai-production.ts`, replace the `idleCities` block inside `applyAIProduction`
(lines ~737-757) with:

```ts
  const idle = civ.cities
    .map(cityId => state.cities[cityId])
    .filter(city => city?.owner === civId && city.productionQueue.length === 0);
  // The comparator used to call generateWithResidual TWICE per comparison -- O(n log n)
  // full candidate generations per civ per round, each one costing a city-yield
  // projection. Precomputing is provably order-identical: the comparator already read
  // `state` (not `nextState`), and `residual` is still pristine here because it is only
  // mutated inside the enqueue loop below.
  const bestByCityId = new Map(idle.map(city => [
    city.id,
    generateWithResidual(state, civId, city.id, residual, personality)[0],
  ]));
  const idleCities = [...idle].sort((left, right) => {
    const leftEmergency = residual.some(entry =>
      entry.missing > 0 && isEmergencyDemand(entry, left.id)) ? 1 : 0;
    const rightEmergency = residual.some(entry =>
      entry.missing > 0 && isEmergencyDemand(entry, right.id)) ? 1 : 0;
    if (leftEmergency !== rightEmergency) return rightEmergency - leftEmergency;
    const leftEta = bestByCityId.get(left.id)?.productionTurns ?? Number.POSITIVE_INFINITY;
    const rightEta = bestByCityId.get(right.id)?.productionTurns ?? Number.POSITIVE_INFINITY;
    return leftEta - rightEta || left.id.localeCompare(right.id);
  });
```

Leave the `for (const city of idleCities)` loop below **completely unchanged** — it must
keep calling `generateWithResidual(nextState, …)` fresh, because `residual` and
`nextState` both change as it runs.

- [ ] **Step 5: Run the tests and verify they still pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts`

Expected: PASS, whole file — identical results, fewer calls.

- [ ] **Step 6: Type-check**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ai/ai-production.ts
git commit -m "perf(ai): precompute idle-city production ETAs instead of sorting on them

The comparator called generateWithResidual twice per comparison, so an
n-city civ paid O(n log n) full candidate generations per round, each one
a city-yield projection. Order is provably unchanged: the comparator already
read \`state\`, and residual is pristine until the enqueue loop.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 8: Personality and difficulty guarantees

**Files:**
- Test: `tests/ai/ai-personality.test.ts`, `tests/ai/ai-prepared-turn.test.ts`

No production code changes. These lock the behaviour contract so a later tuning change
cannot quietly make every personality identical or make difficulty change legality.

- [ ] **Step 1: Write the tests**

Add to `tests/ai/ai-personality.test.ts`:

```ts
describe('#1064 expansion weighting', () => {
  it('weights settlement higher for an expansionist than an aggressor', () => {
    // Pin the ORDERING, never an absolute number -- the constant is tuning.
    const expansionist = {
      traits: ['expansionist'], warLikelihood: 0.3, diplomacyFocus: 0.5, expansionDrive: 0.9,
    } as const;
    const aggressor = {
      traits: ['aggressive'], warLikelihood: 0.9, diplomacyFocus: 0.2, expansionDrive: 0.2,
    } as const;

    expect(weightProductionRoles(expansionist, ['settlement']))
      .toBeGreaterThan(weightProductionRoles(aggressor, ['settlement']));
  });
});
```

Add to `tests/ai/ai-prepared-turn.test.ts`:

```ts
describe('#1064 difficulty invariance', () => {
  it.each(['explorer', 'standard', 'veteran'] as const)(
    'produces the same expand legality on %s',
    challenge => {
      const state = createNewGame(undefined, 'expand-difficulty-invariant', 'small');
      state.opponentChallenge = challenge;
      const civ = state.civilizations['ai-1'];

      const trace = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective');
      const expandIds = (trace?.candidates ?? [])
        .filter(candidate => candidate.id.startsWith('expand:'))
        .map(candidate => candidate.id);

      // Core legality is difficulty-invariant. Challenge profiles tune scores and
      // timing (maxPrimaryForce, mobilizationRounds), never what is legal.
      expect(expandIds).toEqual(
        (prepareMajorCivStrategicPlan(
          { ...state, opponentChallenge: 'standard' },
          civ.id,
        ).traces.find(entry => entry.decision === 'objective')?.candidates ?? [])
          .filter(candidate => candidate.id.startsWith('expand:'))
          .map(candidate => candidate.id),
      );
    },
  );
});
```

- [ ] **Step 2: Run them and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-personality.test.ts tests/ai/ai-prepared-turn.test.ts`

Expected: PASS. If the personality test fails, `weightProductionRoles`'s `settlement`
term is not reaching production — go back to Task 4.

- [ ] **Step 3: Commit**

```bash
git add tests/ai/ai-personality.test.ts tests/ai/ai-prepared-turn.test.ts
git commit -m "test(ai): pin expansion personality ordering and difficulty invariance

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 9: Determinism and save/reload continuity

**Files:**
- Test: `tests/ai/ai-round-scheduler.test.ts`

- [ ] **Step 1: Write the tests**

Add to `tests/ai/ai-round-scheduler.test.ts`:

```ts
describe('#1064 expansion determinism', () => {
  /**
   * The real load path a save file goes through: serialize, parse, then the same
   * normalizeLoadedState every DB / autosave / file import load calls. Deliberately
   * NOT structuredClone -- the JSON boundary is part of what determinism must survive.
   * `parseSaveFile` returns a discriminated union, so the status must be narrowed.
   * (This mirrors `saveAndReload` in tests/app/simulation-determinism.test.ts:120.)
   */
  function saveAndReload(state: GameState): GameState {
    const parsed = parseSaveFile(serializeSaveFile(state));
    if (parsed.status !== 'success') {
      throw new Error(`save file did not round-trip: ${parsed.message}`);
    }
    return normalizeLoadedState(parsed.state);
  }

  function runRounds(seed: string, rounds: number): GameState {
    let state = createNewGame(undefined, seed, 'small');
    for (let i = 0; i < rounds; i++) {
      state = processNonHumanMajorRound(state, new EventBus()).state;
      state = { ...state, turn: state.turn + 1 };
    }
    return state;
  }

  it('reaches the same state and traces from the same seed', () => {
    const left = runRounds('expansion-determinism', 6);
    const right = runRounds('expansion-determinism', 6);

    assertSimulationEquivalent(left, right);
  });

  it('is simulation-equivalent across a save/reload boundary with a plan in flight', () => {
    let uninterrupted = createNewGame(undefined, 'expansion-save-reload', 'small');
    for (let i = 0; i < 8; i++) {
      uninterrupted = processNonHumanMajorRound(uninterrupted, new EventBus()).state;
      uninterrupted = { ...uninterrupted, turn: uninterrupted.turn + 1 };
    }

    let reloaded = createNewGame(undefined, 'expansion-save-reload', 'small');
    for (let i = 0; i < 4; i++) {
      reloaded = processNonHumanMajorRound(reloaded, new EventBus()).state;
      reloaded = { ...reloaded, turn: reloaded.turn + 1 };
    }
    reloaded = saveAndReload(reloaded);
    for (let i = 0; i < 4; i++) {
      reloaded = processNonHumanMajorRound(reloaded, new EventBus()).state;
      reloaded = { ...reloaded, turn: reloaded.turn + 1 };
    }

    assertSimulationEquivalent(uninterrupted, reloaded);
  });
});
```

Imports for this block — `EventBus`, `createNewGame` and `processNonHumanMajorRound` are
already in that file:

```ts
import type { GameState } from '@/core/types';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
```

(`tests/ai/ai-round-scheduler.test.ts` already imports a sibling test helper with a
relative path — `'../systems/helpers/civilization-liveness-fixture'` — so match that
style rather than inventing an alias.)

**Never** hand-roll a `JSON.stringify(a) === JSON.stringify(b)` comparison, and never add
an exclusion to `assertSimulationEquivalent` to make this green — a divergence on any
other field is a real bug.

- [ ] **Step 2: Run them and verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-round-scheduler.test.ts`

Expected: PASS.

If the save/reload test reports a divergence at
`minorCivs.<id>.lastNotifiedStatusByCiv.<civ>`, that is the **pre-existing** #1065 bug,
not yours. Confirm the path matches that pattern exactly, then either skip that assertion
with a comment citing #1065 or shorten the horizon so no minor-civ notification fires.
Any other divergence path is yours to fix.

- [ ] **Step 3: Commit**

```bash
git add tests/ai/ai-round-scheduler.test.ts
git commit -m "test(ai): pin expansion determinism and save/reload continuity

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 10: Full local verification

- [ ] **Step 1: Type-check and run the whole suite**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
```

Expected: both exit 0.

- [ ] **Step 2: Run the AI playability regressions**

Run: `bash scripts/run-with-mise.sh yarn test:ai-playability`

Expected: exit 0.

- [ ] **Step 3: Run the algorithmic perf budgets**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts`

Expected: PASS.

If an `aiRound` budget is now exceeded, that is **expected and legitimate** — this MR
makes the AI do real planning and real production where it previously did almost nothing.
Regenerate and justify:

```bash
UPDATE_PERF_BASELINE=1 bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
```

Then put a one-line justification **per changed number** in the PR body, per
`.claude/rules/performance-budgets.md`. **Do not re-baseline a shape ratio for a size
change** — a ratio jump is a bug or an explicit reviewed decision, never a number to bump.
MR3 (#1069) owns bringing these numbers back down.

- [ ] **Step 4: Commit any baseline regeneration**

```bash
git add tests/perf/baselines/algorithmic-baseline.json
git commit -m "chore(perf): re-baseline aiRound budgets for real AI planning

The prior numbers were measured against an AI that never expanded and
barely built units. Per-number justification is in the PR body.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Skip this step entirely if no baseline changed.

---

# Task 11: Long-horizon acceptance and the known-gap ratchet

The register is a **two-way ratchet**: a gap that no longer reproduces **fails the run**
until its entry is deleted. That is how this MR proves it worked.

**Files:**
- Modify: `tests/simulation/long-horizon/known-campaign-gaps.ts`

- [ ] **Step 1: Get a fast signal from one scenario**

Run: `bash scripts/run-with-mise.sh yarn test:ai-long -- -t lh-standard-small`

Then read the artifact:

```bash
cat .verification/ai-long-horizon/lh-standard-small.json | python3 -m json.tool | head -80
```

Expected in `perCiv`: AI civs with **more than 1 city**. Expected in `findings`: no
`expansion-frozen`, no `production-idle`, no `gold-hoard`. Expected per-round:
`activePlanCount` greater than 0.

If AI civs are still at one city, stop and diagnose — do not proceed to the full matrix.

- [ ] **Step 2: Run the full matrix**

Run: `bash scripts/run-with-mise.sh yarn test:ai-long`

This takes roughly 20 minutes. Run it in the background.

Expected: it **FAILS** with a stale-gap message naming `expansion-frozen`,
`gold-hoard` and `production-idle`. That failure is the success signal — it is direction
(2) of the ratchet telling you to delete the entries.

- [ ] **Step 3: Delete the three entries**

In `tests/simulation/long-horizon/known-campaign-gaps.ts`, delete these three objects from
`KNOWN_CAMPAIGN_GAPS`, leaving the `unit-count-runaway` entry (that is MR2's):

```ts
  {
    code: 'expansion-frozen',
    issue: '#1064',
    ...
  },
  {
    code: 'gold-hoard',
    issue: '#1064',
    ...
  },
  {
    code: 'production-idle',
    issue: '#1064',
    ...
  },
```

Also delete the **F1 paragraph** from the file header doc comment (the block beginning
`* F1 (found by the #1005 design probes, confirmed across the full 9-scenario` and ending
before `* (A \`population-frozen\` detector was prototyped`). Leave the F3 and F2
paragraphs intact.

- [ ] **Step 4: Re-run the matrix and confirm green**

Run: `bash scripts/run-with-mise.sh yarn test:ai-long`

Expected: PASS.

- [ ] **Step 5: If `production-idle` or `gold-hoard` STILL reproduces**

Do **not** raise the expansion soft cap. Do **not** weaken `productionIdleRounds` or any
other detector threshold. Instead:

1. Record which civs idle, at what city count, in what era, and what they had left to
   build.
2. If the residual cause is "every available building is already built", file a
   follow-up issue for late-game production sinks (wonders, national projects, a
   maintenance-bounded standing force).
3. **Re-point** the `production-idle` entry to that new issue rather than deleting it:

```ts
  {
    code: 'production-idle',
    issue: '#<new issue>',
    why: 'Expansion and workers are fixed (#1064); the residual idle is a developed '
      + 'civ at its expansion and worker caps with every available building built.',
    scenarios: 'any',
  },
```

4. Say so plainly in the PR body. Deleting an entry the evidence does not support is the
   one outcome this step exists to prevent.

- [ ] **Step 6: Capture the evidence for the PR body**

Record per-civ end `cities`, `units`, `gold` and `activePlanCount` for at least
`lh-standard-small`, `lh-standard-large` and `lh-hotseat-medium`, before and after.

- [ ] **Step 7: Commit**

```bash
git add tests/simulation/long-horizon/known-campaign-gaps.ts
git commit -m "test(ai): retire the #1064 known-gap entries

expansion-frozen, gold-hoard and production-idle no longer reproduce on the
long-horizon matrix. The ratchet fails until they are deleted, so this is the
proof the fix landed, not bookkeeping.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 12: Document the contract

**Files:**
- Modify: `.claude/rules/ai-simulation.md`

- [ ] **Step 1: Add the section**

Append to `.claude/rules/ai-simulation.md`, after the "The known-gap ratchet" section:

```markdown
## AI expansion (#1064)

Expansion is a real strategic-plan objective, not an administrative side-channel.

- `objectiveCandidates()` (`src/ai/ai-prepared-turn.ts`) emits an `expand` candidate with
  `requiredRoles: { settlement: 1 }` and a `region` target. With no settler the candidate
  is ineligible but still reports `settlement` via `missingRoles`, which becomes an
  `objective-readiness` demand and makes the settler buildable. With a settler it becomes
  a plan, the settler is assigned to it, and `ai-tactics.ts` walks it to the anchor.
- **Exactly one** expand candidate is emitted per turn. `assertLegalChoices` in
  `tests/simulation/ai-playability-fixture.ts` hard-throws above 12 trace candidates, so
  this bound is structural, not a tuning choice. The shortlist inside
  `getKnownExpansionSites` exists only so an unreachable best site falls back to a
  reachable one.
- **Belief vs legality.** `src/ai/ai-expansion-sites.ts` answers "as far as this civ
  knows, could a city stand here?" and must never import `GameState` — it receives an
  already-fog-bounded map, so information safety is structural rather than a convention.
  Legality is validated at execution time by `canFoundCityAt` and `foundCityInState`. The
  belief layer imports `isCityCenterTerrain`, `MIN_CITY_CENTER_DISTANCE` and the
  wrap-aware `cityDistance` from `city-territory-system.ts` so the two can differ only in
  which cities the civ knows about.
- **Site enumeration is radius-bounded** (`EXPANSION_SEARCH_RADIUS`). An unbounded scan is
  `O(known tiles x known cities)` per civ per round.
- **The incremental-demand rule.** Any demand meaning "one more of role R, up to a cap"
  goes through `incrementalDemandSeed`: `desired = min(owned + 1, cap)`,
  `assigned = owned`, so `missing` is structurally 0 or 1. Never hand-roll this — the bug
  it replaces (`desired: 1, assigned: 0` re-seeded every turn) produced one unit per turn
  forever. Priorities: defense 500-1000 > observed threats 180 > objective-readiness and
  settlement 90 > worker infrastructure 40.
- `expansionDrive` gates *whether* a civ expands in exactly one place —
  `getExpansionCitySoftCap`, a 2-to-6 city soft cap on new settling (not on empire size;
  conquest is unaffected). Everywhere else it only weights *how much*.
- `weightProductionRoles`'s `settlement` term is live as of #1064. It was dead before.
- **Difficulty invariance.** Challenge profiles tune scores and timing
  (`maxPrimaryForce`, `mobilizationRounds`), never expansion legality or site selection.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/ai-simulation.md
git commit -m "docs(ai): document the expansion contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 13: Mandatory inline review, then hand off

- [ ] **Step 1: Perform the review**

Read the complete diff (`git diff main...HEAD`) and perform this review **verbatim**:

> perform an INLINE review across these dimensions about balancing gameplay, fun, new
> mechanics, different player ages (7-43), different play styles, the built in
> difficulty modes, how computer players will use it, ui, ux, architecture,
> extensibility, data, sfx, updating saved games, proper testing, regressions solo
> play, and hot seat plays, and proper implementation.

Inspect the actual code, tests, AI and save behaviour — do not restate a checklist. For
every real finding: classify severity, fix it, add regression coverage, rerun the
affected tests, and repeat the affected part of the review. Where a dimension yields
nothing, state what you inspected and why it is acceptable.

UI, UX and SFX are genuinely **N/A** here — this MR ships no player-visible surface, no
panel, no derived label, no queue, and no audio. Say that explicitly with the reason
rather than silently omitting those dimensions.

- [ ] **Step 2: Confirm the acceptance checklist**

- [ ] a one-city AI with no plan surfaces a legal settler candidate when expansion is viable
- [ ] no strategic plan does not eliminate all trainable unit candidates
- [ ] a civ at its soft cap does not spam settlers; at most one settler is queued
      empire-wide per round
- [ ] worker / settlement / military behaviour is bounded, with the priority ordering
      (defense > expansion > infrastructure) pinned by test
- [ ] negative-scoring selection does not force nonsense production (pinned)
- [ ] exactly one `expand` candidate is emitted; the objective trace stays ≤ 12
- [ ] site belief is wrap-aware and shares the canonical founding predicates
- [ ] `ai-expansion-sites.ts` imports no `GameState` (asserted, not assumed)
- [ ] site enumeration is radius-bounded
- [ ] personality ordering preserved; Explorer/Standard/Veteran share core legality
- [ ] determinism and save/reload continuity pinned
- [ ] solo and hot-seat long-horizon scenarios valid
- [ ] existing Domination AI tests valid
- [ ] three known-gap entries deleted, or `production-idle` re-pointed with the residual
      cause filed — never silently deleted
- [ ] `yarn build` and `yarn test` both exit 0
- [ ] zero known in-scope findings

- [ ] **Step 3: Stop and hand off**

Report to the human:

```
READY FOR IMPLEMENTATION REVIEW
```

Include: the root cause, the chosen behaviour, why this is **not** a strategic-planner
rewrite, before/after long-horizon evidence, which ratchet entries were removed (or
re-pointed and why), determinism/save/hot-seat evidence, and any perf baseline changes
with a per-number justification.

**Do not create the PR** unless this session's workflow explicitly assigns PR creation to
you. If it does, the PR description must contain the heading `Pre-MR inline code review`.

---

# What is NOT in this MR

- Any #1066 production cap or late-era spawn investigation. MR2, from refreshed `main`.
- Any #1069 caching layer or perf optimization beyond Task 7's comparator hoist. MR3.
- Worker **task** selection — `basic-ai.ts`'s existing loop decides what workers do.
- Richer site valuation (resources, rivers, coastal, chokepoints). Follow-up issue.
- Any `SAVE_VERSION` bump, migration, or new persisted field.
