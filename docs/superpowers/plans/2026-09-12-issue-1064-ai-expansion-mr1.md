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

**A second, load-bearing piece, found during implementation (Task 9):** no passive
knowledge source in this game (fixed radius-2 city vision, culture-capped radius-3
territory) ever reaches `MIN_CITY_CENTER_DISTANCE` (4), so a civ that starts at peace with
no visible rival can never *discover* a legal site to feed the candidate generator above,
no matter how long the game runs. Task 9 closes this by administratively auto-exploring
idle combat units, reusing the existing player-facing auto-explore mechanism. Task 1-8
alone would satisfy every unit test and still fail the actual long-horizon acceptance
scenario — this was found only by driving the real round pipeline end to end and checking
the actual scenario, not by unit-testing each piece in isolation. See design §1.3/§2.5.

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
  long-horizon detector still fires, follow Task 12 — do not edit
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
  const ALL_TERRAIN = [
    'grassland', 'plains', 'desert', 'tundra', 'snow',
    'forest', 'hills', 'mountain', 'ocean', 'coast',
    'jungle', 'swamp', 'volcanic',
  ] as const satisfies readonly TerrainType[];

  // COMPILE-TIME exhaustiveness. A hardcoded array alone would silently keep
  // passing when a TerrainType is added; this makes `yarn build` fail until the
  // new terrain is listed and someone decides which side of the rule it is on.
  type UncoveredTerrain = Exclude<TerrainType, typeof ALL_TERRAIN[number]>;
  const _allTerrainCovered: UncoveredTerrain extends never ? true : never = true;
  void _allTerrainCovered;

  const BLOCKED: readonly TerrainType[] = ['ocean', 'coast', 'mountain'];

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

  it('re-opens a readiness demand only while the civilization owns no unit of that role', () => {
    // This MUST be built so a readiness demand is guaranteed to exist. A peaceful
    // fresh civ often produces no objective candidates at all, in which case
    // `choice.demands` is empty and a filter-then-assert test passes vacuously
    // while proving nothing.
    const state = createNewGame(undefined, 'demand-readiness-frontline', 'small');
    const civ = state.civilizations['ai-1'];
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    // Reveal the enemy capital so a capture candidate (frontline + capture) exists.
    const enemyCity = state.cities[state.civilizations.player.cities[0]!]!;
    for (const coord of mapHexesInRange(state.map, enemyCity.position, 2)) {
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }
    // Strip every combat unit so `frontline` is genuinely unowned.
    for (const unitId of [...civ.units]) {
      if (UNIT_DEFINITIONS[state.units[unitId]!.type].strength > 0) {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const readiness = (demands: ReturnType<typeof prepareMajorCivStrategicPlan>['forceDemands']) =>
      demands.find(entry =>
        entry.role === 'frontline' && entry.sourcePlanIds.includes('objective-readiness'));

    const before = readiness(prepareMajorCivStrategicPlan(state, civ.id).forceDemands);
    // Fails loudly rather than vacuously if the fixture produced no candidate.
    expect(before?.missing).toBe(1);

    const warrior = createUnit(
      'warrior', civ.id, state.cities[civ.cities[0]!]!.position, state.idCounters,
    );
    state.units[warrior.id] = warrior;
    civ.units.push(warrior.id);

    const after = readiness(prepareMajorCivStrategicPlan(state, civ.id).forceDemands);
    expect(after?.missing ?? 0).toBe(0);
  });
});
```

Add `WORKER_SOFT_CAP` to the existing import block from `@/ai/ai-prepared-turn`, and
`mapHexesInRange` from `@/systems/hex-utils` plus `UNIT_DEFINITIONS` from
`@/systems/unit-system` (`createUnit` and `hexKey` are already imported).

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

  it('makes the expand candidate eligible once a settler exists', () => {
    // Asserted on ELIGIBILITY, not on winning primaryPlan. Whether expand outranks a
    // resource candidate depends on map scoring, so asserting `primaryPlan.objective
    // === 'expand'` would be flaky, and wrapping the assertion in an `if` would make
    // it pass vacuously -- which proves nothing.
    const state = createNewGame(undefined, 'expand-assigns-settler', 'small');
    const civ = state.civilizations['ai-1'];
    const home = state.cities[civ.cities[0]!]!;

    const withoutSettler = prepareMajorCivStrategicPlan(state, civ.id).traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));
    expect(withoutSettler?.eligible).toBe(false);

    const settler = createUnit('settler', civ.id, home.position, state.idCounters);
    state.units[settler.id] = settler;
    civ.units.push(settler.id);

    const withSettler = prepareMajorCivStrategicPlan(state, civ.id).traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));
    expect(withSettler?.eligible).toBe(true);
  });

  it('emits exactly one expand candidate however many sites qualify', () => {
    const state = createNewGame(undefined, 'expand-single-candidate', 'small');
    const civ = state.civilizations['ai-1'];

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);
    const expandIds = (prepared.traces.find(entry => entry.decision === 'objective')
      ?.candidates ?? []).filter(candidate => candidate.id.startsWith('expand:'));

    // `toBe(1)`, never `toBeLessThanOrEqual(1)` -- the latter passes at zero and would
    // hide a generator that emits nothing at all.
    //
    // If this fails with 0, this seed's map has no legal site within
    // EXPANSION_SEARCH_RADIUS of the capital. Pick a different seed; do NOT relax the
    // assertion to `<= 1`.
    expect(expandIds).toHaveLength(1);
  });

  it('keeps the objective trace inside the 12-candidate ceiling under load', () => {
    // assertLegalChoices in the long-horizon fixture HARD THROWS above 12, and the
    // trace carries EVERY analysed candidate. At peace there are no capture
    // candidates at all, so a peaceful fixture would pass this trivially -- the civ
    // must be at war with everyone, with the whole map revealed, to create real load.
    const state = createNewGame(undefined, 'expand-trace-ceiling', 'small');
    const allCivIds = Object.keys(state.civilizations);
    for (const civ of Object.values(state.civilizations)) {
      civ.knownCivilizations = allCivIds.filter(id => id !== civ.id);
      civ.diplomacy.atWarWith = allCivIds.filter(id => id !== civ.id);
      for (const key of Object.keys(state.map.tiles)) civ.visibility.tiles[key] = 'visible';
    }

    for (const civId of allCivIds) {
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

Also add a deterministic assignment test to `tests/ai/ai-unit-assignment.test.ts`. That
file drives `assignUnitsToPortfolio` directly with hand-built inputs, so it does not
depend on map scoring at all:

```ts
it('#1064 fills a settlement slot with a settler', () => {
  const plan: AIStrategicPlan = {
    id: 'expand-plan',
    actorId: 'ai-1',
    objective: 'expand',
    target: { kind: 'region', id: 'settle:6,0', anchor: { q: 6, r: 0 } },
    theaterId: 'local:6,0',
    phase: 'mobilizing',
    reasonCodes: ['nearby-opportunity'],
    commitment: 0.25,
    createdTurn: 1,
    reconsiderAfterTurn: 4,
    expiresAfterTurn: 13,
    lastProgressTurn: 1,
    requiredRoles: { settlement: 1 },
    assignedUnitIds: [],
  };

  const result = assignUnitsToPortfolio({
    portfolio: { ...createEmptyMajorCivPortfolio(), primaryPlan: plan },
    units: [{
      id: 'settler-1',
      type: 'settler',
      health: 100,
      experience: 0,
      embarked: false,
      activeOtherDuty: false,
      travelTurnsByPlanId: { 'expand-plan': 3 },
    }],
    profile: { maxPrimaryForce: 6, retreatHealthPercent: 40 },
    defenseThreatScoreByPlanId: {},
    eliminationDefensePlanIds: [],
    onlyImmediateDefenderUnitIds: [],
    requiresEmbarkationByPlanId: {},
  });

  expect(result.assignmentsByPlanId['expand-plan']).toEqual(['settler-1']);
  expect(result.forceDemands.find(entry => entry.role === 'settlement')?.missing).toBe(0);
});
```

Match that file's existing import and fixture style rather than adding a new one.

- [ ] **Step 2: Run the tests and verify they fail**

Run:
```bash
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts -t "#1064 expand objective candidates"
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-unit-assignment.test.ts -t "#1064"
```

Expected: the `ai-prepared-turn` tests FAIL — no `settlement` demand exists, so the first
test's `demand` is `undefined`. The `ai-unit-assignment` test should **already PASS**:
`settlement` is in `ROLE_ORDER` and `roleFit('settler', 'settlement')` is 1, so assignment
already works. It is a regression pin, not new behaviour. If it fails, stop — the plan's
premise that assignment needs no change is wrong.

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

**If the 12-candidate ceiling test fails**, work through this in order — do **not** raise
the fixture's limit:

1. Confirm exactly one expand candidate is reaching the trace (the previous test). If
   more than one is, Step 4's filter is wrong.
2. If exactly one is and the total is still 13+, reduce `EXPANSION_SITE_SHORTLIST` to `1`
   so the resolver never sees more than one expand input, and re-run.
3. If it is still over with zero expand candidates in the trace, the cause is the
   pre-existing capture + resource count (each sliced to 8 independently,
   `ai-objective-scoring.ts:156`), not expansion. Stop and report
   `DESIGN ESCALATION REQUIRED`: the ceiling was already at its limit on `main`, and
   deciding whether to tighten the per-objective slice is a design call, not an
   implementation one.

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
    const anchor = distantLandTile(state, MIN_CITY_CENTER_DISTANCE);

    const plan: AIStrategicPlan = {
      id: 'expand-plan',
      actorId: civ.id,
      objective: 'expand',
      target: { kind: 'region', id: `settle:${hexKey(anchor)}`, anchor },
      theaterId: `local:${hexKey(anchor)}`,
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

    expect(nextPlanPhase(
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
    const anchor = distantLandTile(state, MIN_CITY_CENTER_DISTANCE);

    const plan: AIStrategicPlan = {
      id: 'capture-plan',
      actorId: civ.id,
      objective: 'capture',
      target: { kind: 'region', id: `raid:${hexKey(anchor)}`, anchor },
      theaterId: `local:${hexKey(anchor)}`,
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

    expect(nextPlanPhase(
      state, plan, [worker.id], [], buildMajorCivPerception(state, civ.id),
    )).toBe('mobilizing');
  });
});
```

`nextPlanPhase` is module-private. It is a **pure function** — same inputs, same phase,
no state mutation — so the right move is simply to export it under its own name. Do NOT
add a `…ForTest` wrapper: a test-only export in production code is a smell, and this
function needs no seam.

In `src/ai/ai-major-turn.ts`, change the declaration at line 720 to:

```ts
export function nextPlanPhase(
```

Leave the body and every existing call site alone.

(Longer term, `ai-major-turn.ts` is 984 lines and does both execution and phase
resolution; extracting the phase resolver and its helpers into `ai-plan-phase.ts` would
be the honest SRP split. That is a larger diff than this MR should carry — note it as a
follow-up, do not do it here.)

The tests import it plus the perception builder:

```ts
import { nextPlanPhase } from '@/ai/ai-major-turn';
import { buildMajorCivPerception } from '@/ai/ai-perception';
```

Also import `createNewGame`, `createUnit` and the `AIStrategicPlan` type in the test file
if they are not already there.

**Both plans must target a real map tile.** `targetStillValid` for a `region` target
checks that the tile exists (`ai-major-turn.ts:611`); an invented coordinate returns
`abandoned` and the test fails for the wrong reason. Derive it:

```ts
/** A real land tile at least `minDistance` from every city in the fixture. */
function distantLandTile(state: GameState, minDistance: number): HexCoord {
  const cities = Object.values(state.cities).map(city => city.position);
  const tile = Object.values(state.map.tiles).find(candidate =>
    isCityCenterTerrain(candidate.terrain)
    && cities.every(position =>
      cityDistance(candidate.coord, position, state.map) >= minDistance));
  if (!tile) throw new Error('fixture has no distant land tile');
  return tile.coord;
}
```

Import `isCityCenterTerrain`, `cityDistance` and `MIN_CITY_CENTER_DISTANCE` from
`@/systems/city-territory-system`, and `hexKey` from `@/systems/hex-utils` if it is not
already imported. Both tests above already call this helper — add it before running them.

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
    const anchor = distantLandTile(state, MIN_CITY_CENTER_DISTANCE);
    const plan = makePlan(
      { kind: 'region', id: `settle:${hexKey(anchor)}`, anchor },
      [settler.id],
      { objective: 'expand', requiredRoles: { settlement: 1 } },
    );

    const actions = rankUnitTacticalActions(context(state, plan), settler);
    const move = actions.find(entry => entry.action.kind === 'move');
    const path = findPath(settler.position, anchor, state.map, 'land', {
      unit: settler,
      completedTechs: state.civilizations[AI].techState.completed,
    });

    expect(path).not.toBeNull();
    expect(move).toBeDefined();
    expect(move!.action).toMatchObject({ kind: 'move', destination: path![1] });
  });

  it('prefers founding over moving when the tile is legal', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 0, r: 0 });
    // Stand the settler ON a legal site rather than assuming the origin is one.
    const site = distantLandTile(state, MIN_CITY_CENTER_DISTANCE);
    const settler = addUnit(state, 'settler-1', 'settler', AI, site);
    const plan = makePlan(
      { kind: 'region', id: `settle:${hexKey(site)}`, anchor: site },
      [settler.id],
      { objective: 'expand', requiredRoles: { settlement: 1 } },
    );

    expect(canFoundCityAt(state, site)).toBe(true);   // guards the premise

    const actions = rankUnitTacticalActions(context(state, plan), settler);

    expect(actions[0]?.action.kind).toBe('found-city');
    expect(actions.some(entry => entry.action.kind === 'move')).toBe(false);
  });

  it('emits nothing when the anchor is unreachable', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 0, r: 0 });
    const settler = addUnit(state, 'settler-1', 'settler', AI, { q: 0, r: 0 });
    const plan = makePlan(
      // Deliberately off-map: findPath returns null, so no action is legal.
      { kind: 'region', id: 'settle:999,999', anchor: { q: 999, r: 999 } },
      [settler.id],
      { objective: 'expand', requiredRoles: { settlement: 1 } },
    );

    expect(rankUnitTacticalActions(context(state, plan), settler)).toHaveLength(0);
  });
});
```

Coordinates are **derived from the fixture map**, never hardcoded: an invented
coordinate has no tile, so `findPath` returns `null` and the test fails for the wrong
reason. Add this helper next to the file's other helpers:

```ts
/** A real land tile at least `minDistance` from every city in the fixture. */
function distantLandTile(state: GameState, minDistance: number): HexCoord {
  const cities = Object.values(state.cities).map(city => city.position);
  const tile = Object.values(state.map.tiles).find(candidate =>
    isCityCenterTerrain(candidate.terrain)
    && cities.every(position =>
      cityDistance(candidate.coord, position, state.map) >= minDistance));
  if (!tile) throw new Error('fixture has no distant land tile');
  return tile.coord;
}
```

Imports this block needs, added to the existing blocks in that file: `findPath` from
`@/systems/unit-system`, and `canFoundCityAt`, `isCityCenterTerrain`, `cityDistance`,
`MIN_CITY_CENTER_DISTANCE` from `@/systems/city-territory-system`. `hexKey` is already
imported.

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

# Task 9: Idle-unit auto-explore

⚠ **This task closes a gap the original plan did not anticipate.** Integration
testing after Task 8 (a live 25-round determinism run through the real round
pipeline) found that no passive knowledge source in this game ever reaches
`MIN_CITY_CENTER_DISTANCE` — city vision is a fixed radius 2
(`fog-of-war.ts`'s `updateVisibility`), culture-matured territory caps at radius
3 (`getCulturalTerritoryRadius`), and the floor is 4. **Without a unit actively
exploring, the belief layer built in Task 1 has nothing to find, ever, for any
civ that starts at peace with no immediately visible rival.** See design
§1.3/§2.5 for the full evidence chain (empirical proof via
`lh-standard-small`, plus the quantitative table of every passive source).

The fix reuses the **existing, tested, player-facing** auto-explore mechanism
(`chooseAutoExploreMove` / `applyAutoExploreOrder` in
`auto-explore-system.ts`) from a **new administrative loop** in `basic-ai.ts` —
the same pattern that file already uses, with the identical justification
already written there in its own comments, for settler founding, catastrophe
restoration, worker road-building, and missionary dispatch: *"no
`AIStrategicPlan` [...] role covers this... [it] never reaches
`processMajorCivStrategicTurn`'s tactical dispatch."*

**Files:**
- Create: `src/ai/ai-exploration.ts`
- Test: `tests/ai/ai-exploration.test.ts` (create)
- Modify: `src/ai/basic-ai.ts` (add the administrative loop + import)
- Test: `tests/ai/basic-ai.test.ts`

**Interfaces:**
- Produces, consumed by the new admin loop:
  `getIdleExplorerUnitIds(civ: Civilization, units: Record<string, Unit>, preparedForTurn: PreparedMajorCivPlan): string[]`
  — a pure function, independently testable with hand-built fixtures, matching
  this codebase's existing pattern of putting small AI-decision helpers in
  dedicated modules (`road-network.ts`'s `chooseRoadBuilderUnit` is the direct
  precedent) rather than as anonymous inline filter chains.

## Step 1: Write the failing tests for `getIdleExplorerUnitIds`

Create `tests/ai/ai-exploration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getIdleExplorerUnitIds } from '@/ai/ai-exploration';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';
import { createEmptyMajorCivPortfolio } from '@/ai/ai-plan-portfolio';
import type { Civilization, PreparedMajorCivPlan, Unit } from '@/core/types';

const CIV_ID = 'ai-1';

function civ(unitIds: string[]): Civilization {
  return {
    id: CIV_ID,
    name: 'Test', color: '#ff0000', isHuman: false, civType: 'generic',
    cities: [], units: unitIds,
    techState: { completed: [], current: null, progress: 0 },
    gold: 0,
    visibility: { tiles: {} },
    score: 0,
    diplomacy: {
      relationships: {}, atWarWith: [], treatyRequestsSent: [], treatyRequestsReceived: [],
      vassalage: {
        overlord: null, vassals: [], protectionScore: 100,
        protectionTimers: [], peakCities: 0, peakMilitary: 0,
      },
    },
  } as unknown as Civilization;
}

function unit(id: string, type: Unit['type'], overrides: Partial<Unit> = {}): Unit {
  return {
    id, type, owner: CIV_ID, position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  } as unknown as Unit;
}

function prepared(overrides: Partial<{
  assignmentsByPlanId: Record<string, string[]>;
  recoveryUnitIds: string[];
  upgradeRoutesByUnitId: Record<string, { cityId: string; createdTurn: number }>;
}> = {}): PreparedMajorCivPlan {
  const portfolio = { ...createEmptyMajorCivPortfolio(), ...createEmptyMajorCivPlanPortfolio() };
  return {
    civId: CIV_ID,
    perception: {} as PreparedMajorCivPlan['perception'],
    portfolio: {
      ...portfolio,
      upgradeRoutesByUnitId: overrides.upgradeRoutesByUnitId ?? {},
    },
    assignments: {
      portfolio,
      assignmentsByPlanId: overrides.assignmentsByPlanId ?? {},
      recoveryUnitIds: overrides.recoveryUnitIds ?? [],
      forceDemands: [],
      rejectedByUnitId: {},
    },
    forceDemands: [],
    traces: [],
  };
}

describe('getIdleExplorerUnitIds', () => {
  it('includes an idle combat-capable unit with movement left', () => {
    const units = { warrior: unit('warrior', 'warrior') };
    const result = getIdleExplorerUnitIds(civ(['warrior']), units, prepared());
    expect(result).toEqual(['warrior']);
  });

  it('excludes a unit claimed by any plan this round', () => {
    const units = { warrior: unit('warrior', 'warrior') };
    const result = getIdleExplorerUnitIds(
      civ(['warrior']),
      units,
      prepared({ assignmentsByPlanId: { 'defend:city-1': ['warrior'] } }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a unit retreating to heal', () => {
    const units = { warrior: unit('warrior', 'warrior', { health: 20 }) };
    const result = getIdleExplorerUnitIds(
      civ(['warrior']),
      units,
      prepared({ recoveryUnitIds: ['warrior'] }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a unit mid-upgrade-route', () => {
    const units = { warrior: unit('warrior', 'warrior') };
    const result = getIdleExplorerUnitIds(
      civ(['warrior']),
      units,
      prepared({ upgradeRoutesByUnitId: { warrior: { cityId: 'city-1', createdTurn: 1 } } }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a non-combat unit', () => {
    // strength 0: settlers, workers, missionaries all have their own dedicated
    // administrative or plan-driven dispatch and must never be diverted here.
    const units = {
      settler: unit('settler', 'settler'),
      worker: unit('worker', 'worker'),
    };
    const result = getIdleExplorerUnitIds(civ(['settler', 'worker']), units, prepared());
    expect(result).toEqual([]);
  });

  it('excludes a unit that has already acted', () => {
    const units = { warrior: unit('warrior', 'warrior', { hasActed: true }) };
    const result = getIdleExplorerUnitIds(civ(['warrior']), units, prepared());
    expect(result).toEqual([]);
  });

  it('excludes a unit with no movement left', () => {
    const units = { warrior: unit('warrior', 'warrior', { movementPointsLeft: 0 }) };
    const result = getIdleExplorerUnitIds(civ(['warrior']), units, prepared());
    expect(result).toEqual([]);
  });

  it('returns multiple eligible units, one civ can send more than one to explore', () => {
    const units = {
      warrior: unit('warrior', 'warrior'),
      scout: unit('scout', 'scout'),
    };
    const result = getIdleExplorerUnitIds(civ(['warrior', 'scout']), units, prepared());
    expect(result.sort()).toEqual(['scout', 'warrior']);
  });
});
```

## Step 2: Run the tests and verify they fail

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-exploration.test.ts`

Expected: FAIL — cannot resolve `@/ai/ai-exploration`.

## Step 3: Write the implementation

Create `src/ai/ai-exploration.ts`:

```ts
/**
 * #1064 -- which of a civilization's own units are genuinely idle, this round,
 * for the purpose of administrative auto-explore.
 *
 * Pure and independently testable, matching this codebase's existing pattern of
 * putting small AI-decision helpers in a dedicated module (road-network.ts's
 * chooseRoadBuilderUnit is the direct precedent) rather than an inline filter
 * chain buried in basic-ai.ts.
 */
import type { Civilization, PreparedMajorCivPlan, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

/**
 * Combat-capable units (strength > 0) that no plan, health-driven recovery, or
 * upgrade route claims this round. Settlers/workers/missionaries (strength 0)
 * are excluded categorically -- they each already have their own dedicated
 * administrative or plan-driven dispatch elsewhere in basic-ai.ts and must
 * never be diverted into wandering.
 */
export function getIdleExplorerUnitIds(
  civ: Civilization,
  units: Record<string, Unit>,
  preparedForTurn: PreparedMajorCivPlan,
): string[] {
  const unavailable = new Set([
    ...Object.values(preparedForTurn.assignments.assignmentsByPlanId).flat(),
    ...preparedForTurn.assignments.recoveryUnitIds,
  ]);
  return civ.units.filter(unitId => {
    const unit = units[unitId];
    if (!unit || unit.hasActed || unit.movementPointsLeft <= 0) return false;
    if (UNIT_DEFINITIONS[unit.type].strength <= 0) return false;
    if (unavailable.has(unitId)) return false;
    if (unit.committedToRouteId) return false;
    if (preparedForTurn.portfolio.upgradeRoutesByUnitId[unitId]) return false;
    return true;
  });
}
```

## Step 4: Run the tests and verify they pass

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-exploration.test.ts`

Expected: PASS, all 8 tests.

## Step 5: Type-check

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

## Step 6: Commit the pure helper

```bash
git add src/ai/ai-exploration.ts tests/ai/ai-exploration.test.ts
git commit -m "feat(ai): add getIdleExplorerUnitIds, the auto-explore eligibility rule

Pure, independently testable -- matching road-network.ts's
chooseRoadBuilderUnit precedent for small AI-decision helpers. Not yet
wired to anything; the administrative loop that calls it is the next step.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Step 7: Write the failing integration test

Add to `tests/ai/basic-ai.test.ts`. This file already imports `processAITurn`,
`createNewGame`, `EventBus`, `foundCity`, `createUnit`.

```ts
describe('#1064 idle-unit auto-explore', () => {
  it('sends a genuinely idle combat unit to explore', () => {
    const state = createNewGame(undefined, 'explore-idle-warrior', 'small');
    const civ = state.civilizations['ai-1'];
    const warriorId = civ.units.find(id => state.units[id]?.type === 'warrior')!;
    const before = { ...state.units[warriorId] };
    const visibleBefore = Object.values(civ.visibility.tiles).filter(v => v === 'visible').length;

    const bus = new EventBus();
    const after = processAITurn(state, 'ai-1', bus);
    const warriorAfter = after.units[warriorId];

    // The warrior must have actually moved (or, on a fully-boxed fixture, at
    // least been considered) -- position OR automation changing proves the
    // loop ran, not just that the field was set and nothing happened.
    expect(warriorAfter?.automation?.mode).toBe('auto-explore');
    const civAfter = after.civilizations['ai-1'];
    const visibleAfter = Object.values(civAfter.visibility.tiles).filter(v => v === 'visible').length;
    expect(visibleAfter, 'exploring should reveal at least one new tile').toBeGreaterThan(visibleBefore);
    expect(warriorAfter?.position).not.toEqual(before.position);
  });
});
```

## Step 8: Run and verify it fails

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/basic-ai.test.ts -t "idle-unit auto-explore"`

Expected: FAIL — `warriorAfter?.automation?.mode` is `undefined`, and
`visibleAfter` equals `visibleBefore` (nothing moved).

## Step 9: Wire the administrative loop into `basic-ai.ts`

Add the import, alongside the other `@/systems/*` imports near the top of the
file (after the existing `unit-system` import on line 8):

```ts
import { applyAutoExploreOrder, chooseAutoExploreMove } from '@/systems/auto-explore-system';
import { getIdleExplorerUnitIds } from './ai-exploration';
```

`chooseAutoExploreMove` is imported for the eligibility check only (used to
decide whether to *set* automation before calling `applyAutoExploreOrder`);
you may find you do not need to call it directly if you set automation
unconditionally for every eligible unit and let `applyAutoExploreOrder` do the
rest -- if so, drop it from the import and say so in the commit, don't leave
an unused import.

In `src/ai/basic-ai.ts`, insert this block immediately before
`newState = processMajorCivStrategicTurn(` (the last administrative loop, right
after the transport-loading loop's closing brace):

```ts
  // #1064 (design §2.5): passive knowledge never reaches MIN_CITY_CENTER_DISTANCE
  // (city vision is a fixed radius 2; culture-matured territory caps at radius 3),
  // so an isolated civ's expand-site belief layer can never discover a legal site
  // without SOME unit actively exploring. Administrative for the same reason as
  // every loop above: no AIStrategicPlan claims a genuinely idle combat unit, so it
  // never reaches processMajorCivStrategicTurn's tactical dispatch. Reuses the exact
  // player-facing auto-explore mechanism (chooseAutoExploreMove / applyAutoExploreOrder)
  // -- same pathfinding, same isThreatenedByVisibleHostiles safety check, same
  // self-termination once nothing useful remains -- rather than a parallel
  // implementation. Placed LAST among the administrative loops: a unit is only
  // offered to exploration once every other administrative system has had first
  // refusal this round.
  for (const unitId of getIdleExplorerUnitIds(civ, newState.units, preparedForTurn)) {
    const current = newState.units[unitId];
    if (!current || current.hasActed) continue;
    if (current.automation?.mode !== 'auto-explore') {
      newState = {
        ...newState,
        units: {
          ...newState.units,
          [current.id]: {
            ...current,
            automation: { mode: 'auto-explore', startedTurn: newState.turn, lastTargets: [] },
          },
        },
      };
    }
    applyAutoExploreOrder(newState, unitId, { bus });
  }
  civ = newState.civilizations[civId];

  newState = processMajorCivStrategicTurn(
```

`applyAutoExploreOrder` mutates `newState.units` directly rather than
returning a new state — this is the **exact same calling convention** already
used in production by `turn-manager.ts`'s own player-facing automation loop
(`applyAutoExploreOrder(newState, unitId, { bus });` with no reassignment).
Do not wrap it in `newState = applyAutoExploreOrder(...)` — its return type is
`ExecuteUnitMoveResult | null`, not `GameState`.

**Do not confuse `preparedForTurn.assignments.recoveryUnitIds` (health-based
retreat, inside `AIUnitAssignmentResult`) with the file's own local
`recoveryUnitIds` variable (settler-elimination handling, declared near the
top of `processAITurnInternal`).** They are unrelated despite the shared name;
`getIdleExplorerUnitIds` only ever reads the first one, via `preparedForTurn`.

## Step 10: Run the integration test and verify it passes

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/basic-ai.test.ts -t "idle-unit auto-explore"`

Expected: PASS.

If `visibleAfter` is not greater than `visibleBefore`, check first whether the
warrior's starting position is already fully boxed in by impassable terrain on
this specific seed (rare, but possible) — try a different seed rather than
weakening the assertion. If `automation.mode` never gets set at all, re-check
the loop's placement is genuinely reached (no earlier `return` in
`processAITurnInternal` for this civ) and that `getIdleExplorerUnitIds` isn't
excluding the warrior for a reason you didn't expect — read its result
directly in a scratch check before assuming the wiring is wrong.

## Step 11: Run the full regression surface

This loop runs inside `basic-ai.ts` for **every** AI civ, every round — the
highest-blast-radius change in this task. Run broadly and read the output,
not just the pass/fail count:

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/ai/
bash scripts/run-with-mise.sh yarn test:ai-playability
```

**Expect exactly one known failure here, already root-caused during design
verification — fix it, do not work around it:**
`tests/ai/basic-ai.test.ts > processAITurn > does not bypass plan progression to
capture an exposed city` fails with an unexpected `unit:move` event for
`ai-attacker`.

This is a **pre-existing fixture bug**, not a defect in this task's loop, and it
predates #1064 entirely — it has always been latent, just never observable
before, because an unclaimed unit previously did nothing at all regardless of
why it was unclaimed. `makeAdjacentExposedCityState` reassigns
`state.civilizations['ai-1'].units = ['ai-attacker']` but never deletes
`createNewGame`'s original two units (`unit-3` settler, `unit-4` warrior) from
`state.units` itself — they simply stop being referenced by `civ.units`, while
still existing with `owner: 'ai-1'`. `getCivilizationLiveness` scans
`state.units` by **ownership**, not by `civ.units` membership, so it finds the
stray settler and reports `{ living: true, reason: 'settler' }`. This makes
`processAIResettlement` run against the *stray* settler (at its own original
spawn position, nowhere near the fixture's intended scenario), and — depending
on what that resettlement does — the civ's operational anchor for candidate
generation ends up wrong, so no real capture plan ever forms and
`ai-attacker` is genuinely unclaimed. Before this task, "genuinely unclaimed"
meant "does nothing"; now it means "explores" — which is why this specific
fixture defect only becomes visible now.

Verified directly (temporarily wiring this task's loop and running the
scenario by hand) that the fix is to make the fixture's `ai-1` state
internally consistent with what its own name claims — an established civ with
one attacking unit near an enemy city, not an accidental non-civ:

```ts
function makeAdjacentExposedCityState({ population }: { population: number }): GameState {
  const state = createNewGame(undefined, 'ai-city-capture', 'small');
  state.currentPlayer = 'ai-1';
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = -60;
  state.civilizations['ai-1'].diplomacy.relationships.player = -60;

  const template = Object.values(state.units).find(unit => unit.owner === 'ai-1' && unit.type === 'warrior');
  if (!template) {
    throw new Error('missing ai warrior fixture');
  }

  // #1064: delete the ORIGINAL stray units (createNewGame's default settler + warrior)
  // -- reassigning civ.units below does not remove them from state.units, and
  // getCivilizationLiveness scans state.units by OWNERSHIP, not civ.units membership.
  // Leaving them in place made this civ falsely "living, reason: settler", which
  // triggered processAIResettlement against the wrong (stray) unit and produced a
  // nonsensical operational anchor for candidate generation.
  for (const id of [...state.civilizations['ai-1'].units]) {
    delete state.units[id];
  }

  state.units['ai-attacker'] = {
    ...template,
    id: 'ai-attacker',
    owner: 'ai-1',
    position: { q: 0, r: 0 },
    movementPointsLeft: 2,
    hasMoved: false,
  };
  state.civilizations['ai-1'].units = ['ai-attacker'];

  // #1064: a real city, so the civ is genuinely "living" (reason: city) with a sensible
  // operational anchor -- matching what this fixture's own name already claimed. mkC()
  // matches this file's existing convention (used by city-player just below) -- its
  // auto-generated id is always overridden by an explicit id right after, so the
  // counter resetting to 1 every call never collides with the map's existing cities.
  state.cities['city-ai1'] = {
    ...foundCity('ai-1', { q: 0, r: 0 }, state.map, mkC()),
    id: 'city-ai1',
  };
  state.civilizations['ai-1'].cities = ['city-ai1'];

  state.cities['city-player'] = {
    ...foundCity('player', { q: 1, r: 0 }, state.map, mkC()),
    id: 'city-player',
    name: 'Memphis',
    owner: 'player',
    position: { q: 1, r: 0 },
    population,
    ownedTiles: [{ q: 1, r: 0 }],
  };
  state.civilizations.player.cities = ['city-player'];
  state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'player';

  // #1064: reveal the target properly -- perception requires actual visibility, and
  // this fixture never granted it, so no capture candidate could ever be generated at
  // all (a second, independent reason the pre-existing "no moves" assertion passed for
  // the wrong reason: no plan ever existed to progress in the first place).
  state.civilizations['ai-1'].knownCivilizations = ['player'];
  state.civilizations['ai-1'].visibility.tiles[hexKey({ q: 1, r: 0 })] = 'visible';
  state.civilizations['ai-1'].visibility.tiles[hexKey({ q: 0, r: 0 })] = 'visible';

  return state;
}
```

With this fix, a real capture plan forms (`primaryPlan.objective === 'capture'`,
targeting `city-player`), `ai-attacker` is genuinely assigned to it
(confirmed via `assignmentsByPlanId`), `getIdleExplorerUnitIds` correctly
excludes it, and the test's original assertions (`moves` empty, city still
owned by `player`) pass **for the reason the test's name actually claims** —
real plan-phase gating (`mobilizing` does not yet authorize an attack) —
rather than by the fixture's accident. Re-run
`bash scripts/run-with-mise.sh yarn vitest run tests/ai/basic-ai.test.ts` after
applying this fix and confirm the whole file passes.

**If any other test in the full run fails**, do not assume it is this same
bug. Diagnose each one on its own evidence — check specifically whether the
premise was "a completely static, unthreatened civ never moves" (which this
task deliberately changes) versus a genuine regression elsewhere.

## Step 12: Empirical proof the gap is closed

Run the actual scenario that surfaced this gap:

```bash
bash scripts/run-with-mise.sh yarn test:ai-long -- -t lh-standard-small
```

This runs exactly one test:
`campaign-matrix.test.ts > long-horizon campaign matrix > lh-standard-small
completes a deterministic campaign within the invariant battery`
(confirm with `yarn vitest list --config vitest.long-horizon.config.ts -t
lh-standard-small` first if you want to see the match before running it).

Read `.verification/ai-long-horizon/lh-standard-small.json` afterward:

```bash
cat .verification/ai-long-horizon/lh-standard-small.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for f in d['report']['findings']:
    print(f\"{f['civId']}: {f['code']} - {f['detail']}\")
print('perCiv cities:', [(c['civId'], c['cities']) for c in d['report']['perCiv']])
"
```

Expected: `expansion-frozen` should no longer appear for at least one AI civ
over the 300-round run (a civ founding zero additional cities in one specific
300-round sample is not itself proof of failure — city count growing at all,
even for just one civ, is the proof the mechanism works; Task 12's full
long-horizon acceptance pass is where every scenario gets checked and the
known-gap entries get retired). **Do not delete any `KNOWN_CAMPAIGN_GAPS`
entry in this task** — that is Task 12's job, after the full matrix runs.

If `expansion-frozen` still fires for every civ with zero exceptions, stop:
either the wiring is not actually reached in this scenario, or a further gap
exists. Do not proceed to Task 10 on an unverified assumption a second time —
that is exactly the mistake this task exists to correct.

## Step 13: Type-check

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

## Step 14: Commit

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat(ai): administratively auto-explore idle combat units (#1064)

Passive knowledge (fixed radius-2 city vision, culture-capped radius-3
territory) never reaches MIN_CITY_CENTER_DISTANCE (4), so an isolated civ's
expand-site belief layer could never discover a legal site without a unit
actively exploring -- and no AI wiring for that existed. Reuses the
player-facing chooseAutoExploreMove/applyAutoExploreOrder mechanism from a
new administrative loop, the same pattern basic-ai.ts already uses for
settler founding, worker roads, and missionary dispatch.

Verified against the actual long-horizon acceptance scenario
(lh-standard-small), not just unit tests -- expansion-frozen no longer fires
unconditionally for every AI civ.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Task 10: Determinism and save/reload continuity

The test goes in **`tests/app/simulation-determinism.test.ts`**, not in an AI test file.
That is where `freshGame`, `advance` and `saveAndReload` already live, and — critically —
`advance` drives a **complete** round through `runCompletedRound` (improvements → majors →
world `processTurn` → postprocess). Driving `processNonHumanMajorRound` alone and bumping
`state.turn` by hand would exercise planning but never run `processCity`, so no settler
would ever finish production and a test claiming to cover "a settler mid-walk" would in
fact cover nothing.

That file is in `SLOW_TEST_FILES` (`scripts/run-tests-by-local-tier.sh:28`), so it runs in
the intensive-simulations selection and exactly one CI shard. Keep the round count modest
— but **do not guess it**. Task 9 added exploration, which adds real rounds of walking
before a site can even be discovered; a round budget picked before that existed (an
earlier draft of this plan assumed 25 rounds total) is not a safe assumption anymore.

**Files:**
- Modify: `tests/app/simulation-determinism.test.ts`

- [ ] **Step 0: Derive a real round budget empirically, before writing the test**

Do not hardcode a guessed round count. Use the exact technique that found the exploration
gap in the first place: a throwaway scratch script, driven through the real
`runCompletedRound` pipeline, tracing when an `expand` plan and a founded second city
actually appear for the `'expansion-save-reload'`-style seed you intend to use. A minimal
version:

```ts
// scratch only -- do not commit
let state = createNewGame(undefined, 'expansion-save-reload', 'small');
for (let round = 1; round <= 150; round++) {
  state = advanceRound(state); // the same helper already in simulation-determinism.test.ts
  const civ = state.civilizations['ai-1'];
  const plan = state.opponentAI?.majorCivs['ai-1']?.primaryPlan;
  if (round % 10 === 0 || civ.cities.length > 1) {
    console.log(`round ${round}: plan=${plan?.objective ?? 'none'} cities=${civ.cities.length}`);
  }
  if (civ.cities.length > 1) break;
}
```

Run it (e.g. paste into a temporary `it()` in a scratch test file, run with
`--reporter=verbose`, then delete the scratch file — do not commit it). Read off: the
round an `expand` plan first appears, and the round a second city is actually founded.
Set `ROUNDS` in Step 1 below to comfortably exceed the second number, and set the
save-point `midpoint` used in the second test to comfortably exceed the first number
(so an expand plan is reliably in flight at the save point) while leaving real rounds
after the reload for the settler to keep progressing.

- [ ] **Step 1: Write the tests**

Append to `tests/app/simulation-determinism.test.ts`. Every helper and import it needs —
`freshGame`, `advance`, `saveAndReload`, `assertSimulationEquivalent` — is already in that
file. Replace the placeholder `ROUNDS` and `midpoint` values below with the numbers you
derived in Step 0.

```ts
describe('#1064 expansion determinism', () => {
  // Derived empirically in Step 0 against this exact seed -- do not guess these numbers.
  const ROUNDS = 60;      // comfortably past the round a second city is founded
  const MIDPOINT = 30;    // comfortably past the round an expand plan first appears

  it('reaches equivalent state from the same seed with expansion active', () => {
    const a = advance(freshGame('expansion-determinism'), ROUNDS);
    const b = advance(freshGame('expansion-determinism'), ROUNDS);

    assertSimulationEquivalent(a, b, '#1064: same seed, expansion active');
  });

  it('survives a save/reload boundary with an expand plan in flight', () => {
    const uninterrupted = advance(freshGame('expansion-save-reload'), ROUNDS);

    const midpoint = advance(freshGame('expansion-save-reload'), MIDPOINT);
    // Guard the premise: if no AI is actually pursuing expansion at the midpoint, this
    // test is not exercising what it claims and the round counts need revisiting.
    const expanding = Object.values(midpoint.opponentAI?.majorCivs ?? {})
      .some(portfolio => portfolio.primaryPlan?.objective === 'expand');
    expect(expanding, 'no expand plan in flight at the save point').toBe(true);

    const continued = advance(saveAndReload(midpoint), ROUNDS - MIDPOINT);

    assertSimulationEquivalent(continued, uninterrupted, '#1064: save/reload continuity');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/simulation-determinism.test.ts`

Expected: PASS, whole file.

Three failures are worth distinguishing:

- **`no expand plan in flight at the save point`** — the premise guard fired despite
  Step 0's measurement. Re-measure rather than blindly raising the number further; this
  usually means the seed's specific terrain took longer to explore than the scratch trace
  suggested, or exploration itself needs a second look. Do **not** delete the guard;
  without it the test proves nothing.
- **A test that exceeds a reasonable wall-clock budget** — exploration adds real walked
  rounds; if `ROUNDS` from Step 0 pushes this file's total runtime uncomfortably high,
  that is itself useful evidence for #1069 (later, separate arc), not a reason to shrink
  the round count below what Step 0 measured as necessary.
- **A divergence at `minorCivs.<id>.lastNotifiedStatusByCiv.<civ>`** — that is the
  pre-existing **#1065** bug, not yours. Confirm the reported path matches that shape
  exactly, then shorten the horizon so no minor-civ status notification fires, or skip
  that one assertion with a comment citing #1065. **Any other divergence path is yours**,
  and never add an exclusion to `assertSimulationEquivalent` to make it green.

- [ ] **Step 3: Commit**

```bash
git add tests/app/simulation-determinism.test.ts
git commit -m "test(ai): pin expansion determinism and save/reload continuity

Driven through runCompletedRound, so production and founding actually run --
processNonHumanMajorRound alone would never complete a settler, and the test
would claim coverage it did not have.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Task 11: Full local verification

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

# Task 12: Long-horizon acceptance and the known-gap ratchet

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

# Task 13: Document the contract

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
  which cities the civ knows about. `knownCityPositions` in `ai-prepared-turn.ts` MUST
  include **both** `perception.ownCities` and `perception.knownCities` — the latter is
  built only from *other* civs' cities, never the actor's own, and omitting the former
  let a site win one tile from the civ's own capital, permanently freezing the settler.
- **Site enumeration is radius-bounded** (`EXPANSION_SEARCH_RADIUS`). An unbounded scan is
  `O(known tiles x known cities)` per civ per round.
- **No passive knowledge source ever reaches `MIN_CITY_CENTER_DISTANCE`.** City vision is
  a fixed radius 2 (`updateVisibility`, `fog-of-war.ts`); culture-matured territory caps
  at radius 3 (`getCulturalTerritoryRadius`); both are permanently short of the legal
  floor of 4. An idle-unit administrative auto-explore loop in `basic-ai.ts`
  (`getIdleExplorerUnitIds` in `ai-exploration.ts`, reusing the player-facing
  `chooseAutoExploreMove`/`applyAutoExploreOrder`) is therefore load-bearing, not
  optional — without it, no civ that starts at peace with no visible rival can ever
  discover a legal expand site, for the entire game.
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

# Task 14: Mandatory inline review, then hand off

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

SFX is genuinely **N/A** — no audio changes. UI/panel/queue/derived-label surfaces are
also N/A — no new panel, no new UI text. **UX is not fully N/A as of Task 9**: idle
combat units now visibly wander the map every round instead of standing still forever.
Inspect specifically: does this look like intentional behaviour rather than a glitch to
a human watching a hot-seat opponent's turn (it should — it is the same visual the
player's own "auto-explore" toggle already produces, just AI-initiated); does an
exploring unit ever wander somewhere that reads as obviously suicidal to a 7-year-old
watching (it should not — `isThreatenedByVisibleHostiles` refuses danger, the same
check the player-facing feature relies on); does anything about it look like idle
oscillation/twitching round to round rather than purposeful movement (it should not —
`rankCandidate`'s recency penalty and frontier scoring bias toward genuinely new
ground). State plainly which of these you checked and what you saw, not just that the
dimension was "considered."

- [ ] **Step 2: Confirm the acceptance checklist**

- [ ] a one-city AI with no plan surfaces a legal settler candidate when expansion is viable
- [ ] no strategic plan does not eliminate all trainable unit candidates
- [ ] an idle combat unit with no plan auto-explores; a plan-claimed, recovering, or
      upgrade-route-committed unit is never diverted into exploring
- [ ] `getIdleExplorerUnitIds` is independently unit-tested (not just exercised via a
      full AI turn)
- [ ] the empirical `lh-standard-small` check in Task 9 showed `expansion-frozen`
      genuinely stop firing for at least one civ, not merely "the code compiles"
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
- A dedicated scout/recon production path. Any exploration *strategy* (toward rivals,
  toward resources) beyond the existing danger-avoidance check the player-facing
  auto-explore feature already performs.
- Any fix to civ-to-civ contact/diplomacy rates, even though the same root gap
  plausibly affects them (design §1.3). No diplomacy behaviour is asserted on here.
