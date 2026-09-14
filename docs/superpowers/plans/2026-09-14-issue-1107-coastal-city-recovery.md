# Issue #1107 — AI Coastal City Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AI civ with zero coastal cities recover by biasing its existing single `expand` objective candidate toward a genuinely coastal site, and replace `lh-late-era-medium`'s degenerate 10-tile-landmass seed with a representative, genuinely-recoverable one, so the long-horizon acceptance test actually exercises the fix.

**Architecture:** Extract `isPositionCoastal` (the #386-safe primitive `isCityCoastal` already implements) and a new `civHasCoastalCity` helper into `city-system.ts`. Thread a `needsCoastalAccess` boolean into `getKnownExpansionSites` (`ai-expansion-sites.ts`) to apply a bounded score bonus to genuinely-coastal candidate sites, applied before the existing shortlist sort/slice. Wire `civHasCoastalCity` through `ai-prepared-turn.ts`'s existing `getKnownExpansionSites` call site. Add an optional `mapSeed` field to `LongHorizonScenario` so `lh-late-era-medium` keeps its stable label while its RNG seed changes to `lh-1107-search-0`.

**Tech Stack:** TypeScript, vitest, the existing `GameState`/`GameMap` immutable-state architecture.

**Full design:** [`docs/superpowers/specs/2026-09-14-issue-1107-coastal-city-recovery-design.md`](../specs/2026-09-14-issue-1107-coastal-city-recovery-design.md) — read it before starting; this plan implements it and does not repeat its rationale.

## Global Constraints

- Never widen `isCityCoastal`'s semantics — it must stay exactly `[city.position, ...hexNeighbors(city.position)]`, checking `ocean`/`coast` terrain only (#386).
- `isPositionCoastal`/`civHasCoastalCity` live in `src/systems/city-system.ts`, NOT `city-territory-system.ts` — putting them there would create a circular import (`city-territory-system.ts` already imports `BUILDINGS` from `city-system.ts`). See design doc's "Canonical architecture owner" section.
- The bonus in `getKnownExpansionSites` must be inserted BEFORE the existing `.sort().slice(0, limit)`, never after.
- Do not touch `#1108` (fully-landlocked civs), `trade-route-classification.ts`'s separate coastal check, or any of the other non-goals listed in the design doc.
- No new persisted save field, no `SAVE_VERSION` bump.
- Every commit ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Run `bash scripts/run-with-mise.sh yarn build` and `bash scripts/run-with-mise.sh yarn test` (both exit 0) before any push — `yarn test` does not type-check.

---

### Task 1: Extract `isPositionCoastal`, keep `isCityCoastal` as a wrapper

**Files:**
- Modify: `src/systems/city-system.ts:1981-1988` (the existing `isCityCoastal`)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Produces: `isPositionCoastal(position: HexCoord, map: GameMap): boolean` — exported from `city-system.ts`, usable by `ai-expansion-sites.ts`.
- `isCityCoastal(city: City, map: GameMap): boolean` keeps its existing signature and export — no caller anywhere else changes.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/city-system.test.ts` (co-locate near the existing `isCityCoastal` describe block):

```ts
import { isPositionCoastal } from '@/systems/city-system';

describe('isPositionCoastal', () => {
  it('returns true when the position itself is ocean/coast', () => {
    const map = buildTestMap({
      tiles: {
        '5,5': { coord: { q: 5, r: 5 }, terrain: 'coast' },
      },
    });
    expect(isPositionCoastal({ q: 5, r: 5 }, map)).toBe(true);
  });

  it('returns true when an immediate neighbor is ocean/coast', () => {
    const map = buildTestMap({
      tiles: {
        '5,5': { coord: { q: 5, r: 5 }, terrain: 'grassland' },
        '6,5': { coord: { q: 6, r: 5 }, terrain: 'ocean' },
      },
    });
    expect(isPositionCoastal({ q: 5, r: 5 }, map)).toBe(true);
  });

  it('returns false when only a distant (non-neighbor) tile is coastal (#386 contract)', () => {
    const map = buildTestMap({
      tiles: {
        '5,5': { coord: { q: 5, r: 5 }, terrain: 'grassland' },
        '9,5': { coord: { q: 9, r: 5 }, terrain: 'ocean' },
      },
    });
    expect(isPositionCoastal({ q: 5, r: 5 }, map)).toBe(false);
  });
});
```

Use this file's existing `buildTestMap`/fixture helper (grep the file for its current map-fixture builder name and adapt the calls above to match its actual signature before running — do not invent a helper name blind).

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "isPositionCoastal"`
Expected: FAIL — `isPositionCoastal` is not exported.

- [ ] **Step 3: Write the extraction**

In `src/systems/city-system.ts`, replace:

```ts
export function isCityCoastal(city: City, map: GameMap): boolean {
  const coordsToCheck = [city.position, ...hexNeighbors(city.position)];
  return coordsToCheck.some(coord => {
    const wrapped = map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : coord;
    const t = map.tiles[hexKey(wrapped)];
    return t?.terrain === 'ocean' || t?.terrain === 'coast';
  });
}
```

with:

```ts
export function isPositionCoastal(position: HexCoord, map: GameMap): boolean {
  const coordsToCheck = [position, ...hexNeighbors(position)];
  return coordsToCheck.some(coord => {
    const wrapped = map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : coord;
    const t = map.tiles[hexKey(wrapped)];
    return t?.terrain === 'ocean' || t?.terrain === 'coast';
  });
}

export function isCityCoastal(city: City, map: GameMap): boolean {
  return isPositionCoastal(city.position, map);
}
```

Confirm `HexCoord` is already imported in this file's `@/core/types` import (it is used elsewhere in `city-system.ts` already — grep to confirm before assuming).

- [ ] **Step 4: Run the new test, then the full existing `isCityCoastal` suite**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "isPositionCoastal"`
Expected: PASS (3/3)

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "isCityCoastal"`
Expected: PASS, byte-identical to pre-change behavior — this is the #386 regression gate. If anything here fails, STOP and re-check the extraction line-by-line against the original; do not proceed.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "$(cat <<'EOF'
refactor(city-system): extract isPositionCoastal primitive

isCityCoastal becomes a thin wrapper so #1107's expansion-site bonus
can reuse the exact #386-safe single-ring definition without
duplicating it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add `civHasCoastalCity`, refactor `ai-research.ts`'s `coastalEmpire` to use it

**Files:**
- Modify: `src/systems/city-system.ts` (add function, near `isCityCoastal`)
- Modify: `src/ai/ai-research.ts:368-370` (the `coastalEmpire` computation) and its import line (line 11, add `civHasCoastalCity` to the existing `isCityCoastal` import from `@/systems/city-system` — check the exact import path used at the top of the file first)
- Test: `tests/systems/city-system.test.ts`, `tests/ai/ai-research.test.ts`

**Interfaces:**
- Consumes: `isCityCoastal` (from Task 1, unchanged signature).
- Produces: `civHasCoastalCity(state: GameState, civId: string): boolean` — exported from `city-system.ts`. Task 4/5 depend on this exact name and signature.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/city-system.test.ts`:

```ts
import { civHasCoastalCity } from '@/systems/city-system';

describe('civHasCoastalCity', () => {
  it('returns false for an unknown civId', () => {
    const state = buildTestState({ civilizations: {}, cities: {} });
    expect(civHasCoastalCity(state, 'nope')).toBe(false);
  });

  it('returns false when the civ has cities but none are coastal', () => {
    const state = buildTestState({
      civilizations: { 'c1': { cities: ['city1'] } },
      cities: { city1: { position: { q: 5, r: 5 } } },
      map: buildTestMap({ tiles: { '5,5': { coord: { q: 5, r: 5 }, terrain: 'grassland' } } }),
    });
    expect(civHasCoastalCity(state, 'c1')).toBe(false);
  });

  it('returns true when at least one owned city is coastal', () => {
    const state = buildTestState({
      civilizations: { 'c1': { cities: ['city1', 'city2'] } },
      cities: {
        city1: { position: { q: 5, r: 5 } },
        city2: { position: { q: 9, r: 9 } },
      },
      map: buildTestMap({
        tiles: {
          '5,5': { coord: { q: 5, r: 5 }, terrain: 'grassland' },
          '9,9': { coord: { q: 9, r: 9 }, terrain: 'coast' },
        },
      }),
    });
    expect(civHasCoastalCity(state, 'c1')).toBe(true);
  });
});
```

Adapt fixture calls (`buildTestState`, `buildTestMap`) to whatever this test file's actual existing fixture helpers are named and shaped — grep the file first, do not assume.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "civHasCoastalCity"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

In `src/systems/city-system.ts`, immediately after `isCityCoastal`:

```ts
export function civHasCoastalCity(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  return civ.cities.some(cityId => {
    const city = state.cities[cityId];
    return city ? isCityCoastal(city, state.map) : false;
  });
}
```

Confirm `GameState` is already imported in this file (it is used pervasively elsewhere in `city-system.ts` — grep to confirm the exact import before assuming).

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "civHasCoastalCity"`
Expected: PASS (3/3)

- [ ] **Step 5: Refactor `ai-research.ts` to use it**

Read `src/ai/ai-research.ts:360-395` first to see the exact surrounding code (the summary's earlier read had this at lines 368-370; re-verify line numbers haven't drifted before editing). Replace:

```ts
  const coastalEmpire = civ.cities.some(cityId => {
    const city = state.cities[cityId];
    return city ? isCityCoastal(city, state.map) : false;
  });
```

with:

```ts
  const coastalEmpire = civHasCoastalCity(state, civ.id);
```

(Use whatever the civ identifier variable is actually called at that call site — `civ.id` is a guess to verify against the real code; it may already be a `civId` parameter in scope instead of `civ.id`.) Add `civHasCoastalCity` to the existing `isCityCoastal` import from `@/systems/city-system` at the top of the file.

- [ ] **Step 6: Run the full `ai-research.ts` suite**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-research.test.ts`
Expected: PASS, byte-identical to pre-change behavior — this is a pure refactor, not a behavior change. If anything fails, re-check the civ-identifier substitution in Step 5.

- [ ] **Step 7: Commit**

```bash
git add src/systems/city-system.ts src/ai/ai-research.ts tests/systems/city-system.test.ts
git commit -m "$(cat <<'EOF'
refactor: extract civHasCoastalCity, reuse in ai-research

ai-research.ts's inline coastalEmpire check becomes a call to a
shared city-system.ts helper so #1107's expansion-site bonus can
reuse the same civ-level coastal-capability signal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add `mapSeed` to `LongHorizonScenario`, point `lh-late-era-medium` at `lh-1107-search-0`

**Files:**
- Modify: `tests/simulation/long-horizon/campaign-report.ts:26-36` (the `LongHorizonScenario` interface)
- Modify: `tests/simulation/long-horizon/campaign-scenarios.ts:73-77` (the `lh-late-era-medium` row) and `:86-98` (`toCampaignOptions`)
- Modify: `tests/simulation/long-horizon/known-campaign-gaps.ts:118-127, 153-162` (the two `#1107` entries' `why` text — they currently describe `ai-3`'s specific 10-tile island, which no longer exists under the new seed)
- Test: none new — this task's correctness is verified by Task 6's integration test and the full matrix run in Task 7.

**Interfaces:**
- Produces: `LongHorizonScenario.mapSeed?: string` — when present, `toCampaignOptions` uses it as the RNG seed instead of `scenario.seed`; `scenario.seed` remains the stable label used everywhere else (artifact filename at `campaign-report.ts:165`, the gap registry's `scenarios` arrays, matrix test names).

- [ ] **Step 1: Add the field**

In `tests/simulation/long-horizon/campaign-report.ts`, in `LongHorizonScenario`:

```ts
export interface LongHorizonScenario {
  seed: string;
  /**
   * #1107 — when set, this is the literal RNG seed passed to map generation
   * instead of `seed`. `seed` stays the scenario's stable display/tracking
   * label (artifact filename, known-gap registry keys); `mapSeed` lets that
   * label survive a seed swap done to fix a degenerate map-generation outlier
   * (see docs/superpowers/specs/2026-09-14-issue-1107-coastal-city-recovery-design.md).
   */
  mapSeed?: string;
  challenge: string;
  mapSize: string;
  humanCount: number;
  aiCount: number;
  turns: number;
  personalities: readonly string[];
  lateEra: boolean;
  stopOnGameOver: boolean;
}
```

- [ ] **Step 2: Wire it into `toCampaignOptions`**

In `tests/simulation/long-horizon/campaign-scenarios.ts`, change:

```ts
  const base: AISimulationOptions = {
    seed: scenario.seed,
```

to:

```ts
  const base: AISimulationOptions = {
    seed: scenario.mapSeed ?? scenario.seed,
```

- [ ] **Step 3: Set `lh-late-era-medium`'s `mapSeed`**

Change:

```ts
  {
    seed: 'lh-late-era-medium', challenge: 'standard', mapSize: 'medium',
    humanCount: 1, aiCount: 3, turns: 250,
    personalities: ['aggressive', 'trader', 'diplomatic'], lateEra: true, stopOnGameOver: true,
  },
```

to:

```ts
  // #1107 -- mapSeed replaces the original literal seed, which produced a
  // 10-tile landmass for one AI civ (smaller than MIN_CITY_CENTER_DISTANCE,
  // mathematically un-recoverable) -- a genuine statistical outlier, not the
  // representative shape of the coastal-recovery bug class. lh-1107-search-0
  // reproduces the same "coastal territory, non-coastal city" shape on a
  // genuinely recoverable 43-tile landmass. seed stays the stable label.
  {
    seed: 'lh-late-era-medium', mapSeed: 'lh-1107-search-0',
    challenge: 'standard', mapSize: 'medium',
    humanCount: 1, aiCount: 3, turns: 250,
    personalities: ['aggressive', 'trader', 'diplomatic'], lateEra: true, stopOnGameOver: true,
  },
```

- [ ] **Step 4: Verify the seed actually threads through**

Run a throwaway check (do not commit this file):

```bash
cat > /tmp/zzz-1107-verify-mapseed.test.ts <<'EOF'
import { describe, it, expect } from 'vitest';
import { scenarioBySeed, runScenario } from '../tests/simulation/long-horizon/campaign-scenarios';

describe('#1107 mapSeed wiring', () => {
  it('lh-late-era-medium now uses the swapped landmass', () => {
    const scenario = scenarioBySeed('lh-late-era-medium');
    expect(scenario.mapSeed).toBe('lh-1107-search-0');
    const run = runScenario(scenario, { turns: 1 });
    // ai-1 should now have a 43-tile landmass, not ai-3's original 10-tile one --
    // spot-check by confirming ai-1's city is NOT isCityCoastal but a legal
    // second site exists somewhere on its landmass (full assertion happens in
    // Task 6's real integration test; this is a quick sanity check only).
    expect(run.finalState.civilizations['ai-1']).toBeDefined();
  });
});
EOF
bash scripts/run-with-mise.sh yarn vitest run /tmp/zzz-1107-verify-mapseed.test.ts
rm /tmp/zzz-1107-verify-mapseed.test.ts
```

Expected: PASS. If `mapSeed` isn't respected, re-check Step 2's edit landed on the right `base.seed` line (there may be more than one `seed:` occurrence in this file — confirm with `grep -n "seed:" tests/simulation/long-horizon/campaign-scenarios.ts` before assuming Step 2 hit the right one).

- [ ] **Step 5: Update the known-gap registry's stale `why` text**

Read the current full text of both `#1107` entries in `tests/simulation/long-horizon/known-campaign-gaps.ts` (lines ~118-127 and ~153-162) before editing — they currently describe `ai-3`'s specific 10-tile island and its "immediate 6-tile ring is entirely hills/mountain" shape, which no longer exists once `mapSeed` swaps the landmass. Do NOT delete these entries yet (that happens only after Task 7 confirms the fix actually resolves them against the new seed) — update their `why` prose to describe the new seed's civ (`ai-1`, not `ai-3`) and the general mechanism, and add a one-line note that the entry is expected to be deleted once Task 7's fix is verified against `lh-1107-search-0`. Also add a short dated addendum to the file's header comment block (the `F1`/`F2`/... numbered finding list) documenting the seed swap itself as its own finding, following the existing convention in that header.

- [ ] **Step 6: Run the existing continuity/matrix meta-tests (not the full long-horizon run — that's Task 7)**

Run: `bash scripts/run-with-mise.sh yarn test tests/simulation/long-horizon/campaign-report.test.ts`
Expected: PASS — confirms the interface change and artifact serialization (`seed: run.scenario.seed`, unaffected by `mapSeed`) still work.

- [ ] **Step 7: Commit**

```bash
git add tests/simulation/long-horizon/campaign-report.ts tests/simulation/long-horizon/campaign-scenarios.ts tests/simulation/long-horizon/known-campaign-gaps.ts
git commit -m "$(cat <<'EOF'
test(long-horizon): swap lh-late-era-medium's map seed via mapSeed

The original seed produced a 10-tile landmass for one AI civ --
smaller than MIN_CITY_CENTER_DISTANCE, mathematically unrecoverable,
and a confirmed statistical outlier (0/25 alternate seeds reproduced
it). lh-1107-search-0 reproduces the same "coastal territory,
non-coastal city" shape on a genuinely recoverable 43-tile landmass,
so the #1107 fix has something real to fix. The new mapSeed field
keeps the scenario's stable label/artifact filename unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Bias `getKnownExpansionSites` toward a genuinely coastal site

**Files:**
- Modify: `src/ai/ai-expansion-sites.ts:1-13` (imports), `:73-99` (the function itself)
- Test: `tests/ai/ai-expansion-sites.test.ts`

**Interfaces:**
- Consumes: `isPositionCoastal` (Task 1) from `@/systems/city-system`.
- Produces: `getKnownExpansionSites(knownMap, knownCityPositions, anchors, limit, needsCoastalAccess = false)` — Task 5 depends on this exact new 5th parameter, added at the end so every existing call site (other than the one Task 5 updates) keeps compiling if it exists elsewhere; grep for other call sites before assuming `ai-prepared-turn.ts` is the only one.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-expansion-sites.test.ts` (near the existing `getKnownExpansionSites` describe block — read the file first to match its existing map-fixture-building convention exactly, since this file already builds hand-crafted `GameMap` fixtures for other `getKnownExpansionSites` tests and you should reuse that same helper rather than inventing a new one):

```ts
describe('getKnownExpansionSites — #1107 coastal-access bonus', () => {
  it('does not change ranking when needsCoastalAccess is false (default)', () => {
    // Build a map with one strong-terrain inland site and one weaker-terrain
    // coastal site, far enough apart and from any knownCityPositions to both
    // be legal. Confirm the inland site still wins without the flag.
    const sites = getKnownExpansionSites(map, knownCityPositions, anchors, 3);
    expect(sites[0].anchor).toEqual(inlandSiteCoord);
  });

  it('promotes a genuinely coastal site into the shortlist when needsCoastalAccess is true', () => {
    const sitesWithout = getKnownExpansionSites(map, knownCityPositions, anchors, 3, false);
    expect(sitesWithout.some(s => hexKey(s.anchor) === hexKey(coastalSiteCoord))).toBe(false);

    const sitesWith = getKnownExpansionSites(map, knownCityPositions, anchors, 3, true);
    expect(sitesWith[0].anchor).toEqual(coastalSiteCoord);
  });

  it('a site that is coastal-eligible only via isPositionCoastal, not raw terrain score, still respects MIN_CITY_CENTER_DISTANCE legality', () => {
    // A genuinely coastal site placed too close to an existing city must
    // never appear even with needsCoastalAccess: true.
    const sites = getKnownExpansionSites(map, [tooCloseCoastalCity], anchors, 3, true);
    expect(sites.some(s => hexKey(s.anchor) === hexKey(tooCloseCoastalSiteCoord))).toBe(false);
  });
});
```

These are structural sketches — before running, replace `map`/`knownCityPositions`/`anchors`/`inlandSiteCoord`/`coastalSiteCoord`/`tooCloseCoastalCity`/`tooCloseCoastalSiteCoord` with concrete fixture data built the same way this test file's existing `getKnownExpansionSites` tests already do (read them first), sized so the terrain-score math is unambiguous (e.g. an all-grassland inland neighborhood vs. a half-ocean coastal one, so the raw score gap is obviously large enough to require the bonus to overcome it — this is also where you get real numbers for Task 4 Step 3's bonus-magnitude check).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-expansion-sites.test.ts -t "#1107 coastal-access bonus"`
Expected: FAIL — `needsCoastalAccess` parameter doesn't exist yet (TS will still run under vitest since vitest doesn't type-check, but the extra argument is simply ignored today, so the "promotes" test should fail on the assertion, not a compile error).

- [ ] **Step 3: Implement**

In `src/ai/ai-expansion-sites.ts`, add the import:

```ts
import { isPositionCoastal } from '@/systems/city-system';
```

Add the constant near the other exported constants (`EXPANSION_SEARCH_RADIUS` etc.):

```ts
/**
 * #1107 -- score bonus applied to a candidate site that would itself pass
 * isPositionCoastal, but ONLY when the requesting civ currently has zero
 * coastal cities (needsCoastalAccess). Sized to reliably overcome
 * evaluateExpansionTarget's ocean-tile penalty and typical terrain-score
 * spread for a radius-2 neighbourhood; confirmed against real candidate
 * scores from the lh-1107-search-0 scenario fixture in
 * tests/ai/ai-expansion-sites.test.ts before this value was finalized here
 * -- if you need to change it, re-measure against real data, don't guess.
 */
export const COASTAL_ACCESS_RECOVERY_BONUS = 40;
```

Change the function signature and scoring loop:

```ts
export function getKnownExpansionSites(
  knownMap: GameMap,
  knownCityPositions: readonly HexCoord[],
  anchors: readonly HexCoord[],
  limit: number,
  needsCoastalAccess = false,
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
    const baseScore = scoreNeighbourhood(knownMap, coord);
    const score = needsCoastalAccess && isPositionCoastal(coord, knownMap)
      ? baseScore + COASTAL_ACCESS_RECOVERY_BONUS
      : baseScore;
    sites.push({ anchor: { ...coord }, score });
  }

  return sites
    .sort((left, right) =>
      right.score - left.score
      || hexKey(left.anchor).localeCompare(hexKey(right.anchor)))
    .slice(0, limit);
}
```

Note the bonus is applied inside the same loop that builds `sites`, strictly before the `return sites.sort()...slice()` — this is the exact ordering the design doc requires.

- [ ] **Step 4: Run tests, verify pass, and confirm the bonus magnitude empirically**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-expansion-sites.test.ts`
Expected: PASS, full file.

If the "promotes a genuinely coastal site" test needed a bonus value different from `40` to pass with realistic fixture terrain (not an artificially extreme fixture), update `COASTAL_ACCESS_RECOVERY_BONUS` and its comment with the measured reasoning, per the design doc's Failure Modes section — do not leave `40` if the real data didn't actually require or justify it.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-expansion-sites.ts tests/ai/ai-expansion-sites.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): bias expansion-site scoring toward coastal recovery

getKnownExpansionSites now accepts needsCoastalAccess; when true (a
civ with zero coastal cities), a candidate site that would itself
pass isPositionCoastal gets a bounded score bonus, applied before
the existing shortlist sort/slice so a mediocre-terrain coastal site
can still make the top-3 cut. No effect when the civ already has
coastal access.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire `civHasCoastalCity` into `ai-prepared-turn.ts`'s expand candidate

**Files:**
- Modify: `src/ai/ai-prepared-turn.ts` (the `getKnownExpansionSites` call site, near line 374; its `city-system.ts` import line, near line 10)
- Test: `tests/ai/ai-prepared-turn.test.ts`

**Interfaces:**
- Consumes: `civHasCoastalCity` (Task 2), `getKnownExpansionSites`'s new 5th parameter (Task 4).

- [ ] **Step 1: Write the failing test**

Read `tests/ai/ai-prepared-turn.test.ts`'s existing expand-candidate tests first (there should be at least one exercising `objectiveCandidates`'s `expand` path from #1064) to match its fixture conventions exactly. Add a new test in the same style:

```ts
it('#1107 — proposes a genuinely coastal site when the civ has zero coastal cities and one is knowably reachable', () => {
  // Fixture: a civ with one non-coastal city, no coastal cities anywhere in
  // civ.cities, and a known map containing both an inland site with a higher
  // raw terrain score and a legal, genuinely coastal site within
  // EXPANSION_SEARCH_RADIUS. Assert objectiveCandidates()'s expand candidate's
  // target anchor is the coastal site, not the higher-raw-score inland one.
  const candidates = objectiveCandidates(state, civId, /* ...existing required args... */);
  const expandCandidate = candidates.find(c => c.id.startsWith('expand'));
  expect(expandCandidate?.target).toEqual(coastalSiteCoord);
});

it('#1107 — does not bias site selection when the civ already has a coastal city', () => {
  // Same map/site setup, but civ.cities includes a second, already-coastal city.
  // Assert the expand candidate targets the higher-raw-score inland site,
  // exactly as pre-#1107 behavior.
  const candidates = objectiveCandidates(state, civId, /* ...existing required args... */);
  const expandCandidate = candidates.find(c => c.id.startsWith('expand'));
  expect(expandCandidate?.target).toEqual(inlandSiteCoord);
});
```

Replace the placeholder comments and `/* ...existing required args... */` with the real `objectiveCandidates` call signature and fixture shape from this file's existing tests — do not guess the signature; read it first.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts -t "#1107"`
Expected: FAIL on the first test (site not yet biased); the second test may already pass (no bias applied) — that's fine, both must be written before the implementation step regardless, per TDD.

- [ ] **Step 3: Implement**

In `src/ai/ai-prepared-turn.ts`, add `civHasCoastalCity` to the existing import from `@/systems/city-system` (currently `import { getTrainableUnitsForCiv, TRAINABLE_UNITS } from '@/systems/city-system';` at line 10 — confirm this exact line before editing, it may have drifted).

At the `getKnownExpansionSites` call site (near line 374), read the surrounding ~15 lines first to find the civ id / state variables already in scope in that function, then add the new argument:

```ts
for (const site of getKnownExpansionSites(
  knownMap,
  knownCityPositions,
  operationalAnchors,
  EXPANSION_SITE_SHORTLIST,
  !civHasCoastalCity(state, civId),
)) {
```

(Use whatever the actual in-scope `state`/`civId` variable names are at that point in the function — confirm from the surrounding code, don't assume these exact names.)

- [ ] **Step 4: Run tests, verify pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts`
Expected: PASS, full file — including every pre-existing expand-candidate test unmodified (confirms no regression for civs that already have coastal access, since `civHasCoastalCity` is false for them and the bonus never fires).

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-prepared-turn.ts tests/ai/ai-prepared-turn.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): wire coastal-recovery bias into expand objective

objectiveCandidates now passes !civHasCoastalCity(state, civId) as
getKnownExpansionSites' needsCoastalAccess flag, so a civ with zero
coastal cities biases its single expand candidate toward a genuinely
coastal site when one is known and legally reachable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: End-to-end integration test against the real `lh-1107-search-0` map

**Files:**
- Test: `tests/ai/ai-prepared-turn.test.ts` or a new focused integration test file under `tests/ai/` (prefer adding to the existing file if it already has a pattern for loading a real generated map, per Task 3's Step 4 sanity check finding one) — decide based on what you find when reading the existing file's real-map integration tests, if any.

**Interfaces:**
- Consumes: everything from Tasks 1-5, plus `scenarioBySeed`/`initializeScenario`-style helpers already used elsewhere in this session's #1066 investigation (see Task 3, which already proved `runScenario(scenario, { turns: 1 })` works for a quick real-map check).

- [ ] **Step 1: Write the failing end-to-end test**

```ts
it('#1107 — ai-1 under lh-late-era-medium (post-mapSeed-swap) forms a real expand plan targeting a coastal site', () => {
  const scenario = scenarioBySeed('lh-late-era-medium');
  const run = runScenario(scenario, { turns: 1 });
  const state = run.finalState;
  const civ = state.civilizations['ai-1'];
  expect(civ).toBeDefined();
  expect(civHasCoastalCity(state, 'ai-1')).toBe(false); // fixture precondition
  const plan = /* however this codebase's existing tests read a civ's current strategic plan / objectiveCandidates output at round 1 */;
  const expandCandidate = plan.find(c => c.id.startsWith('expand'));
  expect(expandCandidate).toBeDefined();
  const targetTile = state.map.tiles[hexKey(expandCandidate.target)];
  expect(isPositionCoastal(expandCandidate.target, state.map)).toBe(true);
});
```

Fill in the actual plan-reading call by finding how existing tests in this repo (this session's own #1066 debug instrumentation used `vi.spyOn` against `prepareMajorCivStrategicPlan`/`objectiveCandidates` directly — see Task 3/earlier investigation) read a civ's live candidates; use the real, already-established pattern rather than inventing a new one.

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts -t "post-mapSeed-swap"`
Expected: FAIL before Task 4/5 land correctly, or if Task 3's seed swap didn't take — if this was already implemented in order, this step instead just confirms the integration wiring is exercised; if it unexpectedly passes with no code changes, that's a signal the earlier tasks' unit tests aren't actually being exercised end-to-end and needs investigation before proceeding.

- [ ] **Step 3: Confirm pass (no new implementation needed — this task is pure verification of Tasks 1-5 together against real data)**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts`
Expected: PASS, full file.

- [ ] **Step 4: Commit**

```bash
git add tests/ai/ai-prepared-turn.test.ts
git commit -m "$(cat <<'EOF'
test(ai): end-to-end coastal-recovery coverage against real map

Confirms ai-1 under the swapped lh-late-era-medium seed forms an
expand candidate targeting a genuinely coastal site, exercising
Tasks 1-5 together against real generated map data rather than only
synthetic fixtures.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full verification — build, full suite, long-horizon matrix, gap registry, perf budgets

- [ ] **Step 1: Build and full local suite**

```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0, no type errors.

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: exit 0, all files pass.

- [ ] **Step 2: Full long-horizon matrix**

```bash
bash scripts/run-with-mise.sh yarn test:ai-long
```
Expected: exit 0. Per `.claude/rules/ai-simulation.md`'s known-gap ratchet, this will fail loudly if either: (a) a genuinely new, unregistered finding appears anywhere in the matrix, or (b) a registered gap no longer reproduces and needs deleting. Given the `mapSeed` swap, expect the two `#1107` entries (`expansion-frozen`, `tech-frozen` for `lh-late-era-medium`) to need re-evaluation:
  - If `expansion-frozen` no longer reproduces for `ai-1` under `lh-1107-search-0` (the fix working as intended), delete that entry from `known-campaign-gaps.ts`.
  - Re-check `tech-frozen` independently — per the design doc's "Long-horizon acceptance" section, do not assume it auto-resolves; if the civ's economy genuinely recovers, delete it too, but if some other/different stall remains, do not claim #1107 complete for an unrelated reason — file a new focused finding instead.
  - Confirm no OTHER scenario in the matrix regressed (the bonus is civ/turn-scoped by `needsCoastalAccess`, so any regression elsewhere is a real bug, not expected fallout).

- [ ] **Step 3: Perf budgets**

```bash
bash scripts/run-with-mise.sh yarn test tests/perf/algorithmic-budgets.test.ts
```
Expected: PASS with no baseline change (per design doc's Performance section — `isPositionCoastal` reuses `getKnownExpansionSites`'s existing bounded loop, no new full-map scan). If it fails, investigate before regenerating the baseline — a genuine new cost here would be a design-review miss, not a rubber-stamp `UPDATE_PERF_BASELINE=1`.

- [ ] **Step 4: Save/determinism**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/simulation/long-horizon/campaign-continuity.test.ts
```
Expected: PASS — confirms determinism and save/reload equivalence are unaffected (no new persisted state, per design doc's Migration section).

- [ ] **Step 5: Durable full-suite record**

```bash
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```
Expected: both exit 0.

- [ ] **Step 6: Commit any gap-registry deletions from Step 2**

If Step 2 required deleting resolved entries from `known-campaign-gaps.ts`, commit that separately with an honest message naming exactly which entries were removed and why (cite the actual matrix run confirming non-reproduction), following this repo's existing convention for gap-registry updates.

---

## Self-review notes (already applied above, kept for Terra's awareness)

- Confirmed via import-graph grep that `isPositionCoastal`/`civHasCoastalCity` belong in `city-system.ts`, not `city-territory-system.ts` — the latter already imports `BUILDINGS` from the former, so reversing that direction would create a circular import. This correction was made during design finalization, not discovered mid-plan.
- Every task's "Interfaces: Produces" line matches the next task's "Interfaces: Consumes" line by exact name (`isPositionCoastal`, `civHasCoastalCity`, `getKnownExpansionSites(..., needsCoastalAccess)`).
- Task 4's bonus magnitude (`COASTAL_ACCESS_RECOVERY_BONUS = 40`) is explicitly flagged (both here and in the design doc's Failure Modes section) as a value Terra must confirm against real fixture data, not treat as pre-validated — this is deliberate, not an oversight.
- No task references a function, file, or type not already confirmed to exist in the real codebase via direct grep/read during design (see design doc's Caller Audit and this plan's own signature checks) — several placeholder call signatures (`objectiveCandidates(...)`, the plan-reading helper in Task 6) are explicitly marked "read the real signature first, don't guess" rather than fabricated, because the exact current call shape needs live verification at implementation time rather than being re-derived here from memory.

---

READY FOR TERRA IMPLEMENTATION

STOP HERE. Do not begin implementation. The human must change models before work continues.
