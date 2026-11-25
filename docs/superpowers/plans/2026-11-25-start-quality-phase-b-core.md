# Start Quality — Phase B Core Implementation Plan (delivery steps 1–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project forbids subagents (`CLAUDE.md`): execute inline with superpowers:executing-plans.

**Goal:** One start-quality assessment and floor used by every major-civ and city-state placer, and one shared site
selection that treats separation as a constraint and samples near-best solutions — which fixes the reported Arctic
islet start.

**Architecture:** A pure leaf `start-quality.ts` scores a site from its own land and reports typed floor failures. A
pure `start-site-selection.ts` picks N sites under hard distance constraints, maximising the weakest start, then
draws one of the near-best solutions from a seeded stream. `findStartPositions`, `placeCivilizationStarts` and
`placeMinorCivs` consume them. A permanent outcome matrix enforces the result across every mode.

**Tech Stack:** TypeScript, Vitest, Yarn PnP via `./scripts/run-with-mise.sh` / `./scripts/dev.sh`.

**Spec:** `docs/superpowers/specs/2026-11-25-start-quality-and-homeland-choice-design.md` (sections B1, B2, B5, B7, B8).
Later plans cover B3/B4/B6 (delivery 3–4) and Phase C (delivery 5).

## Global Constraints

- Same seed ⇒ same starts. New randomness only from `createRng(seed + '-start-placement')` (map generation is seeded
  from the campaign seed string; never `Math.random()`, never `gameId`).
- Both creators (`createNewGame`, `createHotSeatGame`) go through the changed placers; the matrix covers both.
- Hard constraints: free-placed majors `≥ MIN_MAJOR_CIV_START_DISTANCE` (9) apart; any two major starts in any mode
  `≥ MIN_CITY_CENTER_DISTANCE` (4) apart.
- Floors (provisional, one table in `start-quality.ts`): major — land within 2 `≥ 8`, land food best-6 `≥ 6`, land
  production best-6 `≥ 3`, frozen share `< 0.5`, not in a geographic polar band, same-landmass expansion sites `≥ 2`;
  city-state — `≥ 6`, `≥ 5`, `≥ 2`, `< 0.5`, not polar, no expansion requirement.
- Floor acceptance: zero matrix violations; zero generated-map creation failures across matrix seeds; geographic
  capacity not below today's supported opponent counts on medium/large Earth and Old World. Tune numbers in the table,
  never special-case a map.
- Varied band (`0.15`) is the only band in this plan; the Start style setting comes in the next plan.
- The floor is never relaxed silently: generated maps throw `StartPlacementError` (retried by
  `generateMapWithStarts`), geographic maps return `insufficient-separated-sites`, city-states are skipped.
- Game creation on a large map adds under 1 s on the dev host (measure in Task 6/7).
- No save changes in this plan (placement is creation-only).
- Commands: `./scripts/dev.sh test <paths>`, `./scripts/dev.sh build`, `./scripts/dev.sh test-all`; commit timeout 30 000 ms.

## Review Focus

1. **Wrapping maps (Earth wraps):** distances and neighborhoods must wrap; a site at q=0 next to land at q=width−1
   counts that land. Pin in Task 2 and Task 5.
2. **Small maps with few good sites (New World small, single-continent small):** selection must return a typed failure
   or a capped count, never an islet. Pin in Task 7 (capacity) and the matrix.
3. **Single-continent `candidateHexes`:** sites outside the continent set must never be chosen. Pin in Task 6.
4. **Hot-seat creation:** the hot-seat creator gets the same floors and is deterministic (same config twice ⇒ same
   starts). Pin in Task 3 matrix.
5. **Historical mode with a mix of valid anchors and fallback civs:** fallbacks respect the 4-hex founding distance from
   anchors and the floor. Pin in Task 7.

---

### Task 1: Geographic latitude bands

**Files:**
- Create: `src/systems/geo-latitude.ts`
- Modify: `scripts/generate-earth-maps.ts` (import the bounds instead of its local literals at lines ~401–413)
- Test: `tests/systems/geo-latitude.test.ts`

**Interfaces:**
- Produces: `GEO_LATITUDE_BOUNDS: Record<GeographicMapScript, { latMin: number; latMax: number }>` (earth −80/80,
  old-world −40/70, new-world −60/75 — copied from the generator); `POLAR_LATITUDE_CUTOFF = 62`;
  `getPolarRowBand(script: GeographicMapScript, height: number): { topRows: number; bottomRows: number }` — rows whose
  centre latitude (`latMax - (r + 0.5) / height * (latMax - latMin)`, the generator's formula) has `|lat| > 62`.

- [ ] **Step 1: Write the failing test** — `getPolarRowBand('earth', 80)` gives equal top/bottom bands with
  `topRows === 8` (rows 0–7 have lat > 62); `getPolarRowBand('old-world', 80).bottomRows === 0` (min lat −40);
  `getPolarRowBand('earth', 80)` marks row 6 (the reported islet, q 46 r 6) polar; the generator script's bounds equal
  `GEO_LATITUDE_BOUNDS` (import both).
- [ ] **Step 2: Run** `./scripts/dev.sh test tests/systems/geo-latitude.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the leaf (types-only imports) and switch the generator to import it.
- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Commit** `feat(map): share geographic latitude bounds and polar row bands`.

### Task 2: `start-quality.ts` — assessment and floors

**Files:**
- Create: `src/systems/start-quality.ts`
- Test: `tests/systems/start-quality.test.ts`

**Interfaces:**
- Consumes: `createStartViabilityIndex` (`assess(coord).landmassTiles`, `countLandExpansionSites(coord)`),
  `TERRAIN_YIELDS`, wrap-aware hex range helpers, `PolarRowBand` shape from Task 1.
- Produces:
  ```ts
  export type StartFloorKind = 'major' | 'city-state';
  export type StartFloorFailure =
    | 'land-r2' | 'land-food' | 'land-production' | 'frozen' | 'polar-band' | 'expansion-room';
  export interface StartFloor { landR2: number; landFood6: number; landProduction6: number;
    maxFrozenShare: number; minExpansionSites: number; }
  export const START_FLOORS: Record<StartFloorKind, StartFloor>;   // values from Global Constraints
  export const START_SCORE_WEIGHTS: { food: number; production: number; expansionSite: number;
    expansionSiteCap: number; freshWater: number; resource: number; resourceCap: number; frozenPenalty: number };
  export interface StartSiteAssessment { coord: HexCoord; landmassTiles: number; expansionSites: number;
    landTilesR2: number; landFood6: number; landProduction6: number; frozenShare: number; polarBand: boolean;
    freshWater: boolean; coastal: boolean; resourceCount: number; score: number; }
  export interface StartQualityMap extends StartViabilityMap {
    tiles: Record<string, { coord: HexCoord; terrain: string; hasRiver?: boolean; resource?: string | null }>; }
  export interface StartQualityIndex {
    assess(coord: HexCoord): StartSiteAssessment;
    floorFailures(coord: HexCoord, kind: StartFloorKind): StartFloorFailure[];
    passesFloor(coord: HexCoord, kind: StartFloorKind): boolean;
  }
  export function createStartQualityIndex(map: StartQualityMap,
    options?: { polarRows?: { topRows: number; bottomRows: number } }): StartQualityIndex;
  ```
  Initial weights (tune later, keep in the table): food 1, production 1.5, expansionSite 1 capped at 6, freshWater 2,
  resource 0.5 capped at 4, frozenPenalty 6 (× frozenShare). Land = not `ocean`/`coast`; frozen = `tundra`/`snow`;
  best-6 picks land tiles within 2 (excluding the centre) by that yield alone; `freshWater` = river on the tile or a
  neighbour; memoise `assess` per tile index.

- [ ] **Step 1: Write the failing tests** (small hand-built maps plus the real Earth large map via `loadGeoMap`):
  - `islet`: Earth large, q 46 r 6 → `floorFailures(..,'major')` contains `'land-r2'`, `'expansion-room'`,
    `'polar-band'` (with `getPolarRowBand('earth', 80)`).
  - `coast-ringed site the old food floor accepted`: a one-land-tile island in coast → `isFertileStart` is true **and**
    `passesFloor('major')` is false.
  - `frozen`: ≥ half tundra land → `'frozen'`; `barren desert`: desert ring → `'land-food'` and `'land-production'`.
  - `city-state has no expansion requirement`: a 7-tile island with good land passes `'city-state'`, fails `'major'`
    with only `'expansion-room'`.
  - `good control`: a grassland/forest/hills/river site passes both kinds; its `score` exceeds the desert site's.
  - `wraps`: a site at q 0 counts land at q width−1 on a wrapping map, not on a non-wrapping one.
- [ ] **Step 2: Run** `./scripts/dev.sh test tests/systems/start-quality.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `createStartQualityIndex` in `src/systems/start-quality.ts`.
- [ ] **Step 4: Run** the test — expect PASS; also `./scripts/check-src-rule-violations.sh src/systems/start-quality.ts`.
- [ ] **Step 5: Commit** `feat(map): one start-quality assessment with typed floors`.

### Task 3: Outcome matrix as a two-way ratchet

**Files:**
- Create: `tests/systems/start-outcome-matrix.test.ts`, `tests/systems/start-outcome-known-violations.ts`
- Modify: `scripts/run-tests-by-local-tier.sh` (`SLOW_TEST_FILES`), `scripts/ci-test-shards.json` (assign to one shard)

**Interfaces:**
- Consumes: `createNewGame`, `createHotSeatGame`, `createStartQualityIndex`, `getPolarRowBand`, `preloadGeoMapData`.
- Produces: `KNOWN_START_VIOLATIONS: ReadonlyArray<{ config: string; owner: 'major' | 'city-state';
  failure: StartFloorFailure | 'capital-distance' }>` where `config` is `"<script>/<size>/<mode>"`.

- [ ] **Step 1: Write the matrix test.** Configs: procedural, balanced, single-continent × small/medium/large; earth,
  old-world, new-world × sizes × `balanced`/`historical`. Seeds: 8 per config (`matrix-<n>`), opponents = max for the
  size, civ `rome`. For each game: every major settler passes `'major'` (with the script's polar band on geographic
  maps), every city passes `'city-state'`, every pair of major starts `≥ 4` apart. Collect violations as
  `(config, owner, failure)` triples. Assert: every collected triple is in `KNOWN_START_VIOLATIONS` (new ⇒ fail, naming
  the seed and coord); every known entry still reproduces (stale ⇒ fail, "delete this entry"). Add hot-seat configs
  (`balanced/medium` and `earth/large/balanced`, 2 humans + 2 AI) checked against the same floors, plus a determinism
  check: creating the same hot-seat game twice yields identical settler coords.
- [ ] **Step 2: Run it** and fill `KNOWN_START_VIOLATIONS` with exactly the triples it reports today (expected to
  include earth/large/balanced major land-r2, the old/new-world historical fallbacks, city-state islets).
- [ ] **Step 3: Run** `./scripts/dev.sh test tests/systems/start-outcome-matrix.test.ts` — expect PASS; record runtime
  (target ≤ 3 min) in the file header.
- [ ] **Step 4: Register** the file in `SLOW_TEST_FILES` and one shard in `scripts/ci-test-shards.json`.
- [ ] **Step 5: Commit** `test(map): start outcome matrix as a two-way ratchet`.

### Task 4: City-state floor

**Files:**
- Modify: `src/systems/minor-civ-system.ts` (`findValidPosition`, ~lines 181–209; `placeMinorCivs` builds the index)
- Test: `tests/systems/minor-civ-system.test.ts` (new describe block), matrix ratchet entries removed

**Interfaces:**
- Consumes: `createStartQualityIndex(map, { polarRows })` from Task 2 (polar rows only when `state.mapScript` is
  geographic, via `getPolarRowBand`).
- Produces: `findValidPosition` returns the first separated candidate passing `'city-state'`, else `null` (the
  city-state is skipped). The old "first separated candidate of any kind" fallback is removed.

- [ ] **Step 1: Write the failing test** — a map whose only separated candidates are a one-tile island and one good
  site places the city-state on the good site; a map with only islets places none and leaves `minorCivs` empty without
  throwing; Earth small historical (seed `matrix-0`) places no city-state on a landmass ≤ 4 tiles.
- [ ] **Step 2: Run** `./scripts/dev.sh test tests/systems/minor-civ-system.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the floor check in `findValidPosition` (keep the walk over the existing shuffled order so
  the random stream is unchanged).
- [ ] **Step 4: Run** the test, then the matrix — delete the city-state entries it now reports stale; expect PASS.
- [ ] **Step 5: Commit** `fix(minor-civs): city-states use the start-quality floor and are skipped rather than stranded`.

### Task 5: `start-site-selection.ts` — the shared selection

**Files:**
- Create: `src/systems/start-site-selection.ts`
- Test: `tests/systems/start-site-selection.test.ts`

**Interfaces:**
- Consumes: `getStartPositionDistance`, `MIN_MAJOR_CIV_START_DISTANCE`, `MIN_CITY_CENTER_DISTANCE`.
- Produces:
  ```ts
  export interface ScoredSite { coord: HexCoord; score: number; }
  export const START_SELECTION = { passes: 64, candidateCap: 400, firstPickPool: 32, varietyBand: 0.15 } as const;
  export interface SiteSelectionInput {
    map: { width: number; wrapsHorizontally?: boolean };
    candidates: ScoredSite[];          // already floor-filtered
    count: number;                     // sites still to place
    fixed?: HexCoord[];                // anchors already placed
    minSeparation: number;             // between new sites, and new vs fixed in free placement
    minFromFixed: number;              // new vs fixed (MIN_CITY_CENTER_DISTANCE in historical fallback)
    band: number;                      // e.g. START_SELECTION.varietyBand
    rng: () => number;
  }
  export type SiteSelectionResult =
    | { ok: true; sites: ScoredSite[]; weakestScore: number }
    | { ok: false; maximumPlaced: number };
  export function selectStartSites(input: SiteSelectionInput): SiteSelectionResult;
  ```
  Algorithm (not determined by the signature):
  ```text
  pool = top candidateCap by score (ties by rng noise drawn once per candidate)
  repeat passes times:
    first = pool[floor(rng()^2 * min(firstPickPool, |pool|))]   // biased toward strong sites
    greedily add the highest (score + 0.05 * rng()) candidate satisfying both distance rules
    record solution if it reached count: (weakest score, total score)
  keep solutions with weakest >= bestWeakest * (1 - band); dedupe by site set; pick one with rng()
  none reached count -> { ok: false, maximumPlaced }
  ```

- [ ] **Step 1: Write the failing tests:**
  - `prefers quality over spread`: two clusters, a remote low-score islet-like site far from everything and a strong
    site 10 hexes from the first pick — with `count 2`, the strong site is chosen in every seed of 20.
  - `separation is a hard constraint`: no returned pair closer than `minSeparation`; `minFromFixed` honoured vs `fixed`.
  - `deterministic`: same input and same seeded rng ⇒ identical sites.
  - `varied`: across 20 seeds on a field of equal sites, at least 3 distinct site sets.
  - `typed failure`: impossible spacing ⇒ `{ ok: false, maximumPlaced }` with the right count.
  - `wraps`: sites at q 1 and q width−2 on a wrapping map are 3 apart (rejected at minSeparation 9).
- [ ] **Step 2: Run** `./scripts/dev.sh test tests/systems/start-site-selection.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `selectStartSites`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(map): shared start-site selection, separation as a constraint`.

### Task 6: Generated maps use the floor and the selection

**Files:**
- Modify: `src/systems/map-generator.ts` (`findStartPositions`, ~lines 455–585), `src/systems/balanced-map-generator.ts`
  (call site line 38), `src/core/game-state.ts` (`generateMapWithStarts` call sites)
- Test: `tests/systems/map-generator.test.ts`, `tests/systems/start-viability.test.ts` (#1692 blocks)

**Interfaces:**
- Consumes: Tasks 2 and 5.
- Produces: `findStartPositions(map, civTypeIds, mapScript, size, options: { seed: string; candidateHexes?: Set<string> }): HexCoord[]`
  — candidates are land tiles outside rows ≤ 3 / ≥ height−4, inside `candidateHexes` if given, passing `'major'`;
  selection with `minSeparation = getMinimumStartDistance(map)`, `band = START_SELECTION.varietyBand`,
  `rng = createRng(options.seed + '-start-placement')`; on failure throws `StartPlacementError(count, maximumPlaced, minDistance)`.
  The old greedy/fertility passes and the relaxed "any land" fallback are deleted. The unused geo-table pass stays only
  if a caller still needs it (none does today: remove it, and `GEO_START_TABLES` if then unused).

- [ ] **Step 1: Update tests first:** replace the #1692 greedy-specific expectations with floor expectations (every
  start passes `'major'`); add `respects candidateHexes` (single-continent: every start inside the set); add
  `same seed, same starts` and `different seeds can differ` for procedural medium.
- [ ] **Step 2: Run** `./scripts/dev.sh test tests/systems/map-generator.test.ts tests/systems/start-viability.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** and update the three call sites to pass `{ seed, candidateHexes }`.
- [ ] **Step 4: Run** those tests and the matrix — remove stale generated-map entries; confirm zero
  `GameCreationError` across matrix seeds; measure large-map creation time (log once, remove the log).
- [ ] **Step 5: Commit** `fix(map): generated starts use the start-quality floor and shared selection`.

### Task 7: Geographic maps use the floor and the selection; capacity caps

**Files:**
- Modify: `src/systems/start-placement-system.ts` (`collectCandidates`, `selectBalancedSites` → replaced,
  `placeHistorical` fallback), `src/ui/campaign-setup.ts` (~line 357), `src/ui/hotseat-setup.ts` (~lines 358, 411, 433)
- Create: `src/systems/geo-start-capacity.ts`, `src/systems/geo-data/start-capacity.json`
- Test: `tests/systems/start-placement-system.test.ts`, `tests/systems/geo-start-capacity.test.ts`, setup UI tests

**Interfaces:**
- Consumes: Tasks 1, 2, 5.
- Produces:
  - `placeCivilizationStarts` unchanged signature/result type. Balanced mode: candidates pass `'major'` with the script's
    polar band; `selectStartSites` with `minSeparation = MIN_MAJOR_CIV_START_DISTANCE`,
    `rng = createRng(seed + '-start-placement')`; then `assignBalancedSites` as today. Historical fallback: for civs
    whose anchor is invalid or missing, `selectStartSites` with `fixed` = placed anchors and
    `minFromFixed = MIN_CITY_CENTER_DISTANCE`.
  - `getGeographicStartCapacity(script: GeographicMapScript, size: 'small' | 'medium' | 'large'): number` reading the
    JSON; the JSON is rewritten by `UPDATE_GEO_START_CAPACITY=1 ./scripts/dev.sh test tests/systems/geo-start-capacity.test.ts`
    (largest count for which `selectStartSites` succeeds with `band: 1`, capped at `MAP_DIMENSIONS[size].maxPlayers`).
  - Setup: in balanced placement on a geographic script, max opponents = `min(maxPlayers, capacity) - 1` (solo) /
    total players `≤ capacity` (hot seat), with the note text "<Map> (<size>) fits up to N civilizations".

- [ ] **Step 1: Write the failing tests:**
  - `reported game`: `createNewGame({ civType: 'rome', seed: 'game-160716449', mapSize: 'large', opponentCount: 7,
    mapScript: 'earth', startPlacementMode: 'balanced' })` — every settler passes `'major'`; Rome not at 46,6.
  - `Zulu no longer fixed`: across seeds `matrix-0..7` the Zulu-assigned start is not always 45,55 (or Zulu's site set
    varies).
  - `historical fallback`: Old World small historical — every fallback start passes the floor and is ≥ 4 from every
    anchor.
  - `capacity`: recomputed capacity equals the JSON for every script × size; medium/large Earth and Old World capacity
    ≥ today's `maxPlayers` (5 / 8).
  - Setup: New World small offers no opponent count above its capacity and shows the note.
- [ ] **Step 2: Run** the tests — expect FAIL.
- [ ] **Step 3: Implement**, generate the capacity JSON.
- [ ] **Step 4: Run** tests and the matrix — remove stale geographic balanced entries (historical anchor entries
  stay until the anchor plan). If medium/large capacity drops below `maxPlayers`, tune `START_FLOORS` per the
  acceptance rule and record why in the table comment.
- [ ] **Step 5: Commit** `fix(map): geographic starts use the start-quality floor; setup caps civilizations at map capacity`.

### Task 8: Rules, fixtures, verification, delivery

**Files:**
- Modify: `.claude/rules/game-systems.md` ("Minimum viable start (#1453)", "Start fertility and placement retry (#1692)"),
  `tests/app/architecture/rules.ts` (only `map-generator.ts`, `start-placement-system.ts`, `minor-civ-system.ts` and
  tests import `start-site-selection.ts`), `docs/docs-lifecycle-manifest.json` (spec + plans as `active` under the
  owning issue), fixture/golden files that move.

- [ ] **Step 1:** Rewrite the two rules sections: `start-quality.ts` is the one definition, the outcome matrix its
  enforcer, the geographic placer now uses it; keep the retry text.
- [ ] **Step 2:** Add the architecture rule with a fixture proving it bites (`rules.test.ts`).
- [ ] **Step 3:** `./scripts/dev.sh test-all`; for each moved golden/fixture regenerate only through its documented
  env var (`UPDATE_1239_REFERENCE=1`, perf baselines, etc.) and list each with a one-line reason for the PR body.
- [ ] **Step 4:** `./scripts/dev.sh build` and `./scripts/dev.sh verify-impact`; satisfy every required item.
- [ ] **Step 5:** With the owner's OK, open the tracking issue, add the manifest entries, commit, `./scripts/sync-main.sh`,
  `./scripts/push-branch.sh`, PR via `./scripts/pr-body.sh` (body: what changed for players, regenerated fixtures,
  "Out of scope": anchors, start style, homeland choice).
