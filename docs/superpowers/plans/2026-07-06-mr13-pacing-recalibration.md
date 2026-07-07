# MR13 — Pacing Recalibration Implementation Plan

> **For agentic workers:** This plan is executed **inline in this session, without subagent dispatch** — this repo's `CLAUDE.md` bans subagents/parallel agents. Use `superpowers:executing-plans` conventions (batch execution, checkpoint after each task) but do not use `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the pacing tooling's three structural blind spots (era ≥5 band collapse, era-9 output clamp, no full-catalog CI gate) surfaced by issue #481/MR6 review, then fix whatever outliers the corrected tooling reveals.

**Architecture:** All changes are in `src/systems/pacing-model.ts` (band resolution + output baselines), a new `tests/systems/helpers/pacing-reference-economy.ts` fixture module (derives era output from the real yield pipeline instead of guessing), `tests/systems/pacing-audit.test.ts` (new full-catalog gate), and `.claude/rules/game-balance.md` (process rule for future MRs). No production gameplay code changes — this is entirely tooling/tests plus tech-cost tuning if Part E finds outliers.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- No `Math.random()` — N/A here (no runtime randomness introduced).
- `yarn build` and `yarn test` must both exit 0 before push/PR (pre-push hook enforces).
- Combat/military strength curves are explicitly out of scope (MR9's domain).
- Do not rewrite `BAND_WINDOWS` turn-window targets — only what feeds into band/output resolution.
- Do not hand-author `pacing` metadata on individual tech definitions — Part A must be a generic heuristic.
- Any Part E cost fix must keep `tests/systems/national-project-balance.test.ts` and `tests/systems/wonder-definitions.test.ts` green (no yield-ceiling changes needed here since we're only touching tech `cost`, not yields).

---

## Task 1: Era-relative pacing bands (Part A / fixes F1)

**Files:**
- Modify: `src/systems/pacing-model.ts:265-295` (`resolveTechPacingBand`)
- Test: `tests/systems/pacing-model.test.ts` (create if it doesn't exist — check first with `ls tests/systems/pacing-model.test.ts`)

**Interfaces:**
- Produces: `resolveEraRelativeCostBand(tech: Tech, techs: Tech[]): PacingBand` — exported from `pacing-model.ts`, callable by `resolveTechPacingBand` and by tests directly.
- Consumes: `Tech` and `TECH_TREE` (existing), no changes to their shape.

- [ ] **Step 1: Check for an existing pacing-model test file**

Run: `ls tests/systems/pacing-model.test.ts 2>&1 || echo "MISSING"`

If it exists, add the new `describe` block to it. If missing, create it with the import header:

```ts
import { describe, expect, it } from 'vitest';
import { resolveTechPacingBand, resolveEraRelativeCostBand } from '@/systems/pacing-model';
import { TECH_TREE } from '@/systems/tech-definitions';

describe('era-relative pacing bands', () => {
  it('does not collapse every era-5+ tech into marquee (F1 regression)', () => {
    const eraGte5 = TECH_TREE.filter(t => t.era >= 5);
    const bands = new Set(eraGte5.map(t => resolveTechPacingBand(t)));
    expect(bands.size).toBeGreaterThan(1);
  });

  it('lands a cheap flat-bonus tech and a unit-unlock tech in the same era in different bands', () => {
    // trade-post-network: era 5, no unit unlock, cheap-ish flat/percent bonus tech.
    const cheapFlat = TECH_TREE.find(t => t.id === 'trade-post-network');
    // grenadiers: era 6 unit unlock — pick any era>=5 tech with unlocksUnits.length > 0.
    const unitUnlock = TECH_TREE.find(t => t.era >= 5 && (t.unlocksUnits?.length ?? 0) > 0);
    expect(cheapFlat).toBeDefined();
    expect(unitUnlock).toBeDefined();
    expect(resolveTechPacingBand(cheapFlat!)).not.toBe(resolveTechPacingBand(unitUnlock!));
  });

  it('resolveEraRelativeCostBand computes cost percentile within the tech\'s own era, not absolute thresholds', () => {
    // A cheap era-12 tech must not be forced into a high band just because era-12 costs
    // are all numerically larger than era-1 costs.
    const era12Techs = TECH_TREE.filter(t => t.era === 12);
    const cheapestEra12 = era12Techs.reduce((min, t) => (t.cost < min.cost ? t : min));
    expect(['core', 'starter']).toContain(resolveEraRelativeCostBand(cheapestEra12, TECH_TREE));
  });
});
```

**Note:** verify `trade-post-network` actually exists and matches "no unit unlock, cheap-ish" — run `grep -n "trade-post-network" src/systems/tech-definitions-eras5-7.ts` before relying on the id; if it doesn't exist or unlocks a unit, pick a different era-5 flat-bonus tech id from that grep and use it instead (e.g. `grep -n "era: 5" src/systems/tech-definitions-eras5-7.ts | grep -v unlocksUnits | head -3`).

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-model.test.ts`
Expected: FAIL — `resolveEraRelativeCostBand` is not exported yet, and `bands.size` is currently `1` for era≥5 (the F1 bug).

- [ ] **Step 3: Implement `resolveEraRelativeCostBand` and rewire `resolveTechPacingBand`**

Replace `src/systems/pacing-model.ts:265-295` (the whole `resolveTechPacingBand` function) with:

```ts
/**
 * Cost percentile of `tech` within all techs of its own era. Used so a "cheap" tech in a
 * late era (where absolute costs are much higher than early eras) still resolves to a low
 * band, instead of every era-5+ tech being forced upward by absolute-cost thresholds tuned
 * for eras 1-4.
 */
export function resolveEraRelativeCostBand(tech: Tech, techs: Tech[] = TECH_TREE): PacingBand {
  const eraPeers = techs.filter(candidate => candidate.era === tech.era);
  const sortedCosts = eraPeers.map(candidate => candidate.cost).sort((a, b) => a - b);
  const rank = sortedCosts.filter(cost => cost <= tech.cost).length;
  const percentile = eraPeers.length > 0 ? rank / eraPeers.length : 1;
  const prereqCount = tech.prerequisites.length;

  const unlocksUnit = (tech.unlocksUnits?.length ?? 0) > 0;
  const unlocksChainedBuilding = (tech.unlocksBuildings ?? []).some(buildingId => {
    // A building that itself gates further buildings (a "chain root") reads as power-spike;
    // callers only have the building id here, so this checks the building catalog lazily
    // via a dynamic require to avoid a circular import with city-system.ts at module load time.
    return buildingChainsFrom(buildingId);
  });

  if (tech.countsForEraAdvancement === false || unlocksUnit) {
    return 'marquee';
  }
  if (prereqCount >= 2 && percentile >= 0.85) {
    return 'marquee';
  }
  if (unlocksChainedBuilding || (prereqCount >= 2 && percentile >= 0.6)) {
    return 'power-spike';
  }
  if (prereqCount >= 2 || percentile >= 0.6) {
    return 'specialist';
  }
  if (percentile >= 0.35) {
    return 'infrastructure';
  }
  if (percentile >= 0.15) {
    return 'core';
  }
  return 'starter';
}

let chainedBuildingIdsCache: Set<string> | null = null;

function buildingChainsFrom(buildingId: string): boolean {
  if (!chainedBuildingIdsCache) {
    // Lazy require avoids a load-time circular import: city-system.ts does not import
    // pacing-model.ts, but pacing-model.ts is imported by pacing-audit.ts which some
    // city-system-adjacent modules touch indirectly during test setup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BUILDINGS } = require('@/systems/city-system') as typeof import('@/systems/city-system');
    chainedBuildingIdsCache = new Set(
      Object.values(BUILDINGS)
        .filter(building => (building.requiresBuildings?.length ?? 0) > 0)
        .flatMap(building => building.requiresBuildings ?? []),
    );
  }
  return chainedBuildingIdsCache.has(buildingId);
}

export function resolveTechPacingBand(tech: Tech): PacingBand {
  if (tech.pacing) {
    return tech.pacing.band;
  }

  if (tech.era === 1 && tech.prerequisites.length === 0 && tech.cost <= 25) {
    return 'starter';
  }

  if (tech.era <= 4) {
    // Preserve the existing, already-tuned era 1-4 heuristic exactly as-is.
    if (tech.prerequisites.length >= 2 && tech.cost >= 90) {
      return 'power-spike';
    }
    if (tech.prerequisites.length >= 2 || tech.cost >= 80) {
      return 'specialist';
    }
    if (tech.era >= 4 && tech.cost >= 70) {
      return 'power-spike';
    }
    if (tech.cost >= 55) {
      return 'infrastructure';
    }
    return 'core';
  }

  return resolveEraRelativeCostBand(tech, TECH_TREE);
}
```

Verify the `require` approach compiles under this project's `tsconfig`/vitest setup by checking whether `require` is already used anywhere in `src/`:

Run: `grep -rn "= require(" src/ | head -3`

If nothing comes back (ESM-only, no CJS `require` in `src/`), replace the lazy-require trick with a plain top-of-file `import { BUILDINGS } from '@/systems/city-system';` instead — check first with `grep -n "^import.*city-system" src/systems/pacing-model.ts` to confirm no existing circular-import problem (pacing-model.ts is not currently imported by city-system.ts, so a direct import is almost certainly safe; only keep the lazy-require if the plain import produces a build error).

- [ ] **Step 4: Run tests to verify Task 1's tests pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts`
Expected: PASS. (Existing `pacing-audit.test.ts` assertions for era 1-4 techs like `bronze-working` must remain unchanged since Task 1 preserves the era≤4 branch verbatim.)

- [ ] **Step 5: Commit**

```bash
git add src/systems/pacing-model.ts tests/systems/pacing-model.test.ts
git commit -m "fix(pacing): era-relative cost bands for era 5+ techs (F1)"
```

---

## Task 2: Extend research output baselines through era 12, remove the era-9 clamp (Part B step 1 / fixes F2)

**Files:**
- Modify: `src/systems/pacing-model.ts:63-93` (`RESEARCH_OUTPUT_BY_ERA`, `normalizeEra`)
- Test: `tests/systems/pacing-model.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RESEARCH_OUTPUT_BY_ERA` now has keys `1..12`; `normalizeEra` caps at 12, not 9. `getResearchOutputProfileForEra(10|11|12)` returns real, distinct entries.

- [ ] **Step 1: Write the failing test**

Append to `tests/systems/pacing-model.test.ts`:

```ts
import { getResearchOutputProfileForEra } from '@/systems/pacing-model';

describe('research output baseline through era 12 (F2)', () => {
  it('returns distinct, increasing output for eras 10, 11, and 12 instead of clamping to era 9', () => {
    const era9 = getResearchOutputProfileForEra(9);
    const era10 = getResearchOutputProfileForEra(10);
    const era11 = getResearchOutputProfileForEra(11);
    const era12 = getResearchOutputProfileForEra(12);

    expect(era10.outputPerTurn).toBeGreaterThan(era9.outputPerTurn);
    expect(era11.outputPerTurn).toBeGreaterThan(era10.outputPerTurn);
    expect(era12.outputPerTurn).toBeGreaterThan(era11.outputPerTurn);
    expect(new Set([era9.name, era10.name, era11.name, era12.name]).size).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-model.test.ts -t "F2"`
Expected: FAIL — era 10/11/12 currently equal era 9's `25`/`'era-9-established'` because of the `Math.min(9, ...)` clamp.

- [ ] **Step 3: Implement the fix**

In `src/systems/pacing-model.ts`, change the `ResearchOutputProfile['name']` union (around line 48-59) to add three more names:

```ts
export interface ResearchOutputProfile {
  name:
    | 'opening-baseline'
    | 'opening-science-invested'
    | 'era-2-established'
    | 'era-3-established'
    | 'era-4-established'
    | 'era-5-established'
    | 'era-6-established'
    | 'era-7-established'
    | 'era-8-established'
    | 'era-9-established'
    | 'era-10-established'
    | 'era-11-established'
    | 'era-12-established';
  outputPerTurn: number;
}
```

Placeholder values below are intentionally provisional — Task 3 (Part B step 2/3, the reference-economy fixture) computes the real numbers from the actual yield pipeline and this task's placeholders get overwritten there with a code comment citing the fixture test. Set:

```ts
const RESEARCH_OUTPUT_BY_ERA: Record<number, ResearchOutputProfile> = {
  1: { name: 'opening-baseline', outputPerTurn: 1 },
  2: { name: 'era-2-established', outputPerTurn: 4 },
  3: { name: 'era-3-established', outputPerTurn: 7 },
  4: { name: 'era-4-established', outputPerTurn: 10 },
  5: { name: 'era-5-established', outputPerTurn: 13 },
  6: { name: 'era-6-established', outputPerTurn: 16 },
  7: { name: 'era-7-established', outputPerTurn: 19 },
  8: { name: 'era-8-established', outputPerTurn: 22 },
  9: { name: 'era-9-established', outputPerTurn: 25 },
  10: { name: 'era-10-established', outputPerTurn: 28 },
  11: { name: 'era-11-established', outputPerTurn: 31 },
  12: { name: 'era-12-established', outputPerTurn: 34 },
};
```

Change `normalizeEra` (currently `Math.min(9, normalized)`) to:

```ts
function normalizeEra(era: number): number {
  const numericEra = Number.isFinite(era) ? era : 1;
  const normalized = Math.max(1, Math.floor(numericEra));
  return Math.min(12, normalized);
}
```

Also update `PRODUCTION_OUTPUT_BY_ERA` — it already has 12 entries (lines 14-27), no change needed there; confirm with `grep -n "PRODUCTION_OUTPUT_BY_ERA" -A14 src/systems/pacing-model.ts` that it's already complete (it is, per the file read during planning).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/pacing-model.ts tests/systems/pacing-model.test.ts
git commit -m "fix(pacing): extend research output baseline through era 12 (F2)"
```

---

## Task 3: Reference-economy fixture + snapshot pin (Part B steps 2-4, Part C / fixes F3)

**Files:**
- Create: `tests/systems/helpers/pacing-reference-economy.ts`
- Create: `tests/systems/pacing-reference-economy.test.ts`
- Modify: `src/systems/pacing-model.ts` (update the era-10/11/12 — and any other era whose pinned value differs — `outputPerTurn` constants with the fixture-derived numbers once Step 3 below reports them, plus a comment)

**Interfaces:**
- Consumes: `calculateCityYields(city, map, bonusEffect, completedTechs, techYieldContext)` from `@/systems/resource-system`; `getEmpireTechPercents`, `applyEmpireTechPercents`, `getEmpireFlatTechYields` from `@/systems/tech-yield-system`; `TECH_TREE` from `@/systems/tech-definitions`; `BUILDINGS` from `@/systems/city-system`.
- Produces: `getReferenceEconomyOutput(era: number): { science: number; production: number }` and `buildReferenceEconomyCity(era: number): { city: City; map: GameMap; completedTechs: string[] }`, both exported from the new fixture module, consumed by Task 3's test and reusable by Task 4/5.

- [ ] **Step 1: Write the fixture module**

Create `tests/systems/helpers/pacing-reference-economy.ts`:

```ts
import type { City, GameMap, HexCoord, ResourceYield } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS } from '@/systems/city-system';
import { calculateCityYields } from '@/systems/resource-system';
import { getEmpireTechPercents, applyEmpireTechPercents, getEmpireFlatTechYields } from '@/systems/tech-yield-system';

/**
 * Methodology (documented per the MR13/#481 spec's "state who/what justifies the loadout"
 * requirement): a "competent" empire at era N is modeled as having completed every tech from
 * every era strictly before N, and none of era N's own techs yet — this matches what
 * RESEARCH_OUTPUT_BY_ERA conceptually represents: the output a civ has *on arrival* at era N,
 * before that era's own techs compound further. Buildings present are every non-national-project
 * building whose techRequired is in that completed-tech set (and whose requiresBuildings chain
 * is satisfied), which is a direct, non-guessed consequence of the tech list rather than a
 * hand-picked "realistic" building set — this replaces F3's hand-picked constants with a
 * derivation from the actual game-content graph.
 *
 * Deliberately excluded from the pin (documented, not an oversight): trade routes, legendary
 * wonders, luxury resources, and multi-city empire effects. These are per-city/per-route/
 * per-wonder bonuses that a single-city reference fixture cannot represent without inventing
 * numbers; the pin is a conservative single-city floor, not a ceiling.
 */

const REFERENCE_MAP_SIZE = 8;

function completedTechsForEra(era: number): string[] {
  return TECH_TREE.filter(tech => tech.era < era).map(tech => tech.id);
}

function eligibleBuildingIds(completedTechs: string[]): string[] {
  const techSet = new Set(completedTechs);
  const built = new Set<string>();
  let added = true;
  // Fixed-point loop so multi-link requiresBuildings chains resolve regardless of object order.
  while (added) {
    added = false;
    for (const building of Object.values(BUILDINGS)) {
      if (built.has(building.id) || building.nationalProject || building.coastalRequired) continue;
      if (building.techRequired && !techSet.has(building.techRequired)) continue;
      const prereqsMet = (building.requiresBuildings ?? []).every(id => built.has(id));
      if (!prereqsMet) continue;
      built.add(building.id);
      added = true;
    }
  }
  return [...built];
}

function makeReferenceMap(): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < REFERENCE_MAP_SIZE; q++) {
    for (let r = 0; r < REFERENCE_MAP_SIZE; r++) {
      const key = `${q},${r}`;
      // Alternate plains/grassland/hills so a population-N city has a believable mixed worked
      // radius; no resources or rivers to keep the pin resource-RNG-free.
      const terrain = q % 3 === 0 ? 'hills' : q % 3 === 1 ? 'grassland' : 'plains';
      tiles[key] = {
        coord: { q, r },
        terrain: terrain as GameMap['tiles'][string]['terrain'],
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: 'reference-civ',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }
  return { width: REFERENCE_MAP_SIZE, height: REFERENCE_MAP_SIZE, tiles, wrapsHorizontally: false, rivers: [] };
}

export function buildReferenceEconomyCity(era: number): { city: City; map: GameMap; completedTechs: string[] } {
  const completedTechs = completedTechsForEra(era);
  const buildings = eligibleBuildingIds(completedTechs);
  const position: HexCoord = { q: 4, r: 4 };
  // Population grows with available infrastructure, capped to the map's worked-tile radius.
  const population = Math.min(12, 2 + Math.floor(buildings.length / 4));
  const workedTiles: HexCoord[] = [position];
  for (let i = 0; i < population && workedTiles.length <= population; i++) {
    const q = 3 + (i % 4);
    const r = 3 + Math.floor(i / 4);
    if (q === position.q && r === position.r) continue;
    workedTiles.push({ q, r });
  }

  const city: City = {
    id: 'reference-city',
    name: 'Reference City',
    owner: 'reference-civ',
    position,
    population,
    food: 0,
    foodNeeded: 9999,
    buildings,
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: workedTiles,
    workedTiles,
    focus: 'balanced',
    maturity: 'outpost',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  };

  return { city, map: makeReferenceMap(), completedTechs };
}

export function getReferenceEconomyOutput(era: number): Pick<ResourceYield, 'science' | 'production'> {
  const { city, map, completedTechs } = buildReferenceEconomyCity(era);
  const baseYields = calculateCityYields(city, map, undefined, completedTechs, {});
  const percents = getEmpireTechPercents(completedTechs);
  const withPercents = applyEmpireTechPercents(baseYields, percents);
  const flat = getEmpireFlatTechYields(completedTechs);

  return {
    science: Math.round(withPercents.science + flat.science),
    production: Math.round(withPercents.production + flat.production),
  };
}
```

Check the exact `GameMap['tiles'][string]` field shape and `TERRAIN types` before relying on the literal above — run:

Run: `grep -n "interface GameMap\|tiles:" src/core/types.ts | head -5` and `grep -n "export type Terrain" src/core/types.ts`

Adjust field names in `makeTile`-equivalent above to match exactly (the shape used mirrors `tests/systems/helpers/legendary-wonder-fixture.ts`'s `makeTile`, which is a verified-working pattern in this codebase — reuse its exact field list if it differs from what's drafted here).

- [ ] **Step 2: Write the pin test with a script-derived value, not a guess**

Create `tests/systems/pacing-reference-economy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getReferenceEconomyOutput } from './helpers/pacing-reference-economy';
import { getResearchOutputProfileForEra } from '@/systems/pacing-model';

describe('pacing reference economy (Part C exact-value pin)', () => {
  // These numbers are captured from a real run of getReferenceEconomyOutput at each era —
  // see Step 3 of Task 3 in docs/superpowers/plans/2026-07-06-mr13-pacing-recalibration.md
  // for how they were derived. If a future MR adds a new tech-yield bonus and this test
  // fails, that is Part C working as designed (see game-balance.md's Pacing Regression
  // Prevention section): update BOTH this expectation and the matching
  // RESEARCH_OUTPUT_BY_ERA entry in pacing-model.ts together, with a one-line justification.
  const expectedScienceByEra: Record<number, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0,
  };

  it.each(Object.entries(expectedScienceByEra))('era %s reference economy produces the pinned science output', (era, expected) => {
    const output = getReferenceEconomyOutput(Number(era));
    expect(output.science).toBe(expected);
  });

  it('reference economy science output increases monotonically with era', () => {
    const outputs = Array.from({ length: 12 }, (_, i) => getReferenceEconomyOutput(i + 1).science);
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
    }
  });

  it('RESEARCH_OUTPUT_BY_ERA baseline is derived from (not just cross-checked against) the reference economy', () => {
    for (let era = 1; era <= 12; era++) {
      const profile = getResearchOutputProfileForEra(era);
      const reference = getReferenceEconomyOutput(era);
      // Allow the hand-copied constant to sit within +/-3 of the live fixture: the constant
      // is a cheap runtime lookup (see pacing-model.ts comment) intentionally not recomputed
      // on every render, so small fixture drift before a manual re-sync is expected, not a bug.
      expect(Math.abs(profile.outputPerTurn - reference.science)).toBeLessThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 3: Run once to capture the real numbers, then fill them in**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-reference-economy.test.ts -t "pinned" 2>&1 | grep -A2 "Expected\|Received"`

This first run fails on purpose (the `expectedScienceByEra` placeholders are all `0`). Read the `Received` values vitest prints for each era from the failure output, then replace the `0`s in `expectedScienceByEra` with those real numbers. This is the "capture from a real run" step referenced in the test's own comment — do not hand-guess these values.

After filling in the real values, re-run the "increases monotonically" and "derived from" assertions. If the third assertion (`+/-3` of `RESEARCH_OUTPUT_BY_ERA`) fails for any era, update that era's `outputPerTurn` in `src/systems/pacing-model.ts` (Task 2's table) to the fixture-derived value and add a one-line comment: `// derived from tests/systems/pacing-reference-economy.test.ts, see Task 3`.

- [ ] **Step 4: Run full suite to verify green**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-reference-economy.test.ts tests/systems/pacing-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/systems/helpers/pacing-reference-economy.ts tests/systems/pacing-reference-economy.test.ts src/systems/pacing-model.ts
git commit -m "feat(pacing): reference-economy fixture grounds era output baselines (F3, Part C)"
```

---

## Task 4: Full-catalog CI outlier gate (Part D / fixes F4)

**Files:**
- Modify: `tests/systems/pacing-audit.test.ts` (append)

**Interfaces:**
- Consumes: `buildPacingAudit()` from `@/systems/pacing-audit` (existing, unchanged signature).
- Produces: nothing new exported; adds a test.

- [ ] **Step 1: Write the failing test**

Append to `tests/systems/pacing-audit.test.ts`:

```ts
describe('full-catalog pacing outlier gate (Part D)', () => {
  it('has no pacing outliers across the full tech/building/unit catalog', () => {
    const outliers = buildPacingAudit()
      .filter(row => row.outlier)
      .map(row => `${row.contentType}:${row.id} era ${row.era} — ${row.estimatedTurns}/${row.target.min}-${row.target.max} turns (${row.outlierReason})`);

    expect(outliers).toEqual([]);
  });
});
```

Per `.claude/rules/strategy-game-mechanics.md`'s statistical-sampling rule: `buildPacingAudit()` is fully deterministic (no RNG — it's pure catalog math against fixed cost/output tables), so a single call is not flaky and sampling across seeded variants is unnecessary here. Note this in a one-line comment above the `it`:

```ts
// buildPacingAudit() is deterministic (no RNG) — a single call suffices; sampling would
// only be needed if per-play RNG affected estimatedTurns, which it does not.
```

- [ ] **Step 2: Run to see the real outlier list**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts -t "full tech/building/unit catalog"`

Expected: This will almost certainly FAIL and print a list of offending ids — this list IS Task 5's input, not a bug in this test. Copy the printed `outliers` array into your notes before moving to Task 5; do not try to make this pass by loosening the assertion.

- [ ] **Step 3: Commit the test itself now (even though it's red)**

```bash
git add tests/systems/pacing-audit.test.ts
git commit -m "test(pacing): full-catalog outlier CI gate (Part D, currently red pending Task 5)"
```

Note: normally a plan wouldn't commit a red test, but Part D's spec explicitly wants "before/after outlier count in the PR description" — committing it red here, then green after Task 5, makes that count reconstructable from git history. Task 5 finishes by re-running this exact test.

---

## Task 5: Fix the outliers the corrected gate reveals (Part E)

**Files:**
- Modify: whichever of `src/systems/tech-definitions-eras{1-4,5-7,8,9,10,11,12}.ts`, `src/systems/city-system.ts` (`BUILDINGS`/`TRAINABLE_UNITS` cost fields) the audit flags — exact files are only known after Task 4 Step 2's run.

**Interfaces:**
- Consumes: the `outliers` list from Task 4.
- Produces: no interface change — only `cost`/`productionCost` numeric field edits on existing catalog entries.

- [ ] **Step 1: Record the before count**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts -t "full tech/building/unit catalog" 2>&1 | tee /tmp/mr13-outliers-before.txt`

Count the entries in the printed `outliers` array — this is the "before" number for the PR description.

- [ ] **Step 2: Fix each outlier by adjusting cost, not target window**

For each flagged row, per the spec's Part E instruction ("fix only techs/buildings/units that land outside their now-correct target window... do not preemptively rewrite costs the corrected audit says are fine"):

- If `outlierReason` is `'Slower than target window'`: reduce that entity's `cost` (tech) or `productionCost` (building/unit) toward `row.recommendedCost`, rounding to a clean multiple of 5 (10 if below 20) matching `roundRecommendedTechCost`'s convention in `pacing-model.ts:198-201`.
- If `'Faster than target window'`: increase toward `row.recommendedCost` the same way.
- Locate the exact definition with `grep -rn "id: '<id>'" src/systems/tech-definitions*.ts` (tech) or `grep -n "^\s*<id>:" src/systems/city-system.ts` (building/unit), then edit only the numeric cost field — do not touch `unlocks`, `pacing`, or any other field (per `.claude/rules/content-description-honesty.md`, don't touch description text in this MR unless it's already wrong, which is out of scope here).

- [ ] **Step 3: Re-run after each batch of ~10 fixes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts -t "full tech/building/unit catalog"`

Repeat Steps 2-3 until the outliers array is empty. Also re-run `tests/systems/pacing-audit.test.ts` in full each time (not just the new test) — earlier tests in that file pin exact values (e.g. `bronze-working`'s cost) that a Part E cost edit must not silently break; if one of those old exact-value tests breaks because you edited an entity it pins, that's a signal you edited the wrong id or need to update that pinned expectation deliberately (not silently).

- [ ] **Step 4: Run the balance-ceiling tests to confirm no collateral damage**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts tests/systems/wonder-definitions.test.ts tests/systems/pacing-audit.test.ts tests/systems/pacing-model.test.ts tests/systems/pacing-reference-economy.test.ts`
Expected: PASS, all green.

- [ ] **Step 5: Commit with before/after counts in the message**

```bash
git add src/systems/tech-definitions-eras1-4.ts src/systems/tech-definitions-eras5-7.ts src/systems/tech-definitions-eras8.ts src/systems/tech-definitions-eras9.ts src/systems/tech-definitions-eras10.ts src/systems/tech-definitions-eras11.ts src/systems/tech-definitions-eras12.ts src/systems/city-system.ts
git commit -m "$(cat <<'EOF'
fix(pacing): retune full-catalog outliers found by Part D gate (Part E)

Before: <N> outliers across tech/building/unit catalog.
After: 0 outliers — tests/systems/pacing-audit.test.ts full-catalog gate is green.
EOF
)"
```

(Fill in `<N>` with Task 5 Step 1's real count — do not leave the placeholder in the actual commit message.)

- [ ] **Step 6: Re-run and amend Task 4's commit context**

The Task 4 commit is now stale (it described the test as "currently red"). Do not amend it (never amend without explicit user request) — this follow-up commit's message already documents the transition from red to green, which is sufficient; no further action needed.

---

## Task 6: Pacing Regression Prevention rule (Part F)

**Files:**
- Modify: `.claude/rules/game-balance.md` (append new section)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Append the new section**

Add to the end of `.claude/rules/game-balance.md`:

```markdown

## Pacing Regression Prevention

- Any MR that adds or activates a new economy-affecting bonus (tech yield, building
  yield, wonder yield, national-project yield) MUST re-run
  `tests/systems/pacing-audit.test.ts`'s full-catalog outlier gate before merging.
- If the change shifts a reference-economy era snapshot's output (see
  `tests/systems/pacing-reference-economy.test.ts`), the PR must include the updated
  snapshot numbers and a one-line justification, not just a passing test — this is the
  seam future MRs go through instead of silently drifting pacing the way MR4–6 did
  (see issue #481 for the incident this rule prevents).
```

- [ ] **Step 2: Verify no other file needs the same addition**

Run: `grep -rln "Pacing Regression Prevention" .claude/rules/ docs/`
Expected: exactly one hit (the file just edited) — confirms no duplicate rule doc exists elsewhere that also needs updating.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/game-balance.md
git commit -m "docs(rules): MR13 — pacing regression prevention section"
```

---

## Task 7: Final verification and PR

**Files:** none (verification + PR only).

- [ ] **Step 1: Full build + test**

Run: `bash scripts/run-with-mise.sh yarn build` (timeout 120000ms)
Run: `bash scripts/run-with-mise.sh yarn test` (timeout 120000ms)
Expected: both exit 0.

- [ ] **Step 2: Update the MR13 checkbox in the index issue and push**

```bash
git push -u origin HEAD
```

(timeout 120000ms — pre-push hook runs tsc + vitest)

- [ ] **Step 3: Open the PR with the proper closing keyword**

Per this issue's structure, MR13 is tracked as issue #481 (sub-issue of the #472 index — closing #481 does NOT close #472, since #472 is the umbrella index with its own separate MR14 still open). Use:

```bash
gh pr create --title "MR13 — Pacing recalibration: era-relative bands, era 1-12 baselines, full-catalog CI gate" --body "$(cat <<'EOF'
## Summary
- Fixes F1: era >=5 techs no longer collapse to a single `marquee` pacing band — `resolveEraRelativeCostBand` computes era-relative cost percentile instead of an absolute-threshold short-circuit.
- Fixes F2: `RESEARCH_OUTPUT_BY_ERA` now covers eras 1-12 (was silently clamped at era 9).
- Fixes F3: era output baselines are now derived from and pinned against a real reference-economy fixture (`tests/systems/helpers/pacing-reference-economy.ts`) that runs the actual yield pipeline, replacing hand-picked constants.
- Fixes F4: `pacing-audit.test.ts` now gates on the full catalog (all eras), not just opening-baseline. Before/after outlier counts: <fill in from Task 5>.
- Adds Pacing Regression Prevention section to `.claude/rules/game-balance.md`.

## Test plan
- [x] `yarn build`
- [x] `yarn test`
- [x] New regression tests for F1-F4 (see `tests/systems/pacing-model.test.ts`, `tests/systems/pacing-reference-economy.test.ts`, `tests/systems/pacing-audit.test.ts`)

Closes #481
EOF
)"
```

- [ ] **Step 4: Comment on the parent index issue #472**

```bash
gh issue comment 472 --repo a1flecke/conquestoria --body "MR13 (pacing recalibration) is up for review: <PR URL from Step 3>. Will check off the MR13 box once it merges."
```

---

## Self-review notes (from plan authoring, not a task)

- Spec coverage: Part A → Task 1. Part B (F2 extend, F3 ground) → Tasks 2-3. Part C (exact-value pin as regression gate) → Task 3. Part D (full-catalog CI gate) → Task 4. Part E (fix outliers) → Task 5. Part F (rule doc) → Task 6.
- The plan defers exact numeric fixture output and outlier-fix values to "run and read the real output" steps (Task 3 Step 3, Task 5) rather than guessing them up front — this is intentional per the spec's own F3 finding ("there is no way to know today whether a competent era-8 empire produces X or Y"); hand-guessing those numbers in the plan would repeat the exact mistake this MR fixes.
- `resolveEraRelativeCostBand`'s `require()` vs `import` choice is left as a build-time check (Task 1 Step 3) rather than assumed, per `.claude/rules/spec-fidelity.md`'s "verify current code state before implementing" guidance.

---

## Post-merge addendum: dual-profile fixture + follow-up issue

MR13 shipped and PR review (post-merge, same PR #492 thread) surfaced that the reference-economy
fixture's single-city model needed a real design decision, not a silent default:

- The fixture originally bounded a single city's building set to the last 4 eras
  (`BUILDING_ERA_WINDOW`) to avoid unbounded output growth. Reviewer feedback: a completionist
  player who builds every available building in every city is a real, common playstyle — not a
  corner case — and the bounded model undershoots real output for that playstyle, which would
  let it blow through late-game tech faster than the target pacing window.
- Resolved by adding a second `'maximal'` profile (every eligible building regardless of era)
  alongside `'bounded'`, and re-tuning `RESEARCH_OUTPUT_BY_ERA` for era 10-12 to target
  `'maximal'` — see `tests/systems/helpers/pacing-reference-economy.ts` and
  `.claude/rules/game-balance.md`'s Pacing Regression Prevention section for the full reasoning.
  Also added an era-over-era output growth-ratio guardrail (capped at 3x) so a future bug in
  building-eligibility logic fails loudly here instead of only surfacing once it cascades into
  hundreds of downstream tech-cost changes (which is what happened during this review).

**Follow-up filed:** [#493 — Pacing: multi-city aggregate + production-time-bounded reference
economy](https://github.com/a1flecke/conquestoria/issues/493). Both profiles above still model a
*single* city; #493 tracks two bigger improvements intentionally scoped out of MR13:
1. A multi-city aggregate fixture (average output across several cities of mixed maturity,
   closer to what a real empire actually looks like than either single-city extreme).
2. Production-time-bounded building accumulation (a city can only have built as many buildings
   as its cumulative production output over N turns allows, replacing the era-count window
   approximation with something grounded in actual production capacity).

Not started as part of this plan — tracked separately so it gets its own scoped implementation
plan when picked up.
