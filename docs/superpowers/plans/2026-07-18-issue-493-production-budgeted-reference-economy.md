# Issue #493 Production-budgeted Reference Economy Implementation Plan

> **For Sonnet 4.5 agentic workers:** REQUIRED SUB-SKILL: Use \`superpowers:executing-plans\` and execute this plan inline, task by task. Do **not** dispatch subagents: this repository's \`CLAUDE.md\` and \`AGENTS.md\` prohibit delegation. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add a deterministic, production-time-bounded, mixed-maturity \`representative\` economy diagnostic while preserving the existing single-city \`bounded\`/\`maximal\` snapshots and the maximal era 10-13 research target.

**Architecture:** A new test-helper module owns the canonical personal-era research route, production-budget building simulation, and city cohorts. The existing reference-economy helper remains the neutral map/yield-aggregation boundary and exposes a multi-city result. All work is test tooling and balance documentation; no \`src/**\`, runtime UI, audio, AI behavior, save data, solo flow, or hot-seat flow changes are authorized.

**Tech Stack:** TypeScript, Vitest, existing pacing/tech/city/yield systems.

---

## Constraints

- Work only in \`/Users/aaronfleckenstein/development/github/conquestoria/.worktrees/issue-493-reference-economy-design\`.
- Preserve \`ReferenceEconomyProfile = 'bounded' | 'maximal'\`, \`getReferenceEconomyOutput\`, all existing exact legacy snapshots, and the \`maximal\` era 10-13 target assertion.
- Use \`getEraAdvancementTechs\`, \`getEraAdvancementFraction\`, \`hasReachedEraThreshold\`, and \`resolveCivilizationEra\` for representative progression. Do not duplicate their arithmetic.
- Use \`calculateCityYields\`, \`getEmpireTechPercents\`, \`applyEmpireTechPercents\`, and \`getEmpireFlatTechYields\` for yield truth. Apply percentage effects per city and flat yields once per empire.
- Use deterministic ID tie-breakers and \`EPSILON = 1e-9\`. Never use \`Math.random()\`.
- Do not retune tech costs, advancement fractions, \`ERA_PACING_PROFILES\`, or \`BAND_WINDOWS\`. Stop for approval if any change outside the files below appears necessary.
- Keep the model test-only: it must not consume \`GameState\`, \`currentPlayer\`, difficulty, AI personality, save, UI, notification, or SFX data.

## File map

| File | Responsibility |
|---|---|
| Create \`tests/systems/helpers/pacing-production-budget.ts\` | Research route, cohorts, candidates/scoring, per-turn construction, accounting. |
| Modify \`tests/systems/helpers/pacing-reference-economy.ts\` | Legacy fixture unchanged; neutral city construction and multi-city aggregation. |
| Create \`tests/systems/pacing-production-budget.test.ts\` | Route, candidate, production, error, and determinism tests. |
| Modify \`tests/systems/pacing-reference-economy.test.ts\` | Representative totals/averages, scope, sensitivity, and legacy isolation. |
| Modify \`.claude/rules/game-balance.md\` | Three-profile policy and regression workflow. |

## Task 1: Build the canonical research timeline

**Files:**

- Create: \`tests/systems/helpers/pacing-production-budget.ts\`
- Create: \`tests/systems/pacing-production-budget.test.ts\`

- [ ] **Step 1: Write the failing route tests**

\`\`\`ts
import { describe, expect, it } from 'vitest';
import { TECH_TREE, hasReachedEraThreshold, resolveCivilizationEra } from '@/systems/tech-definitions';
import {
  buildRepresentativeResearchTimeline,
  getRequiredAdvancementCount,
} from './helpers/pacing-production-budget';

describe('representative research timeline', () => {
  it('uses canonical rounded-up advancement counts', () => {
    for (let era = 2; era <= 13; era++) {
      const qualifying = TECH_TREE.filter(tech => tech.era === era && tech.countsForEraAdvancement !== false);
      expect(getRequiredAdvancementCount(era)).toBeGreaterThanOrEqual(1);
      expect(getRequiredAdvancementCount(era)).toBeLessThanOrEqual(qualifying.length);
    }
  });

  it('reaches each requested personal era through a prerequisite-closed route', () => {
    for (let era = 1; era <= 13; era++) {
      const timeline = buildRepresentativeResearchTimeline(era);
      expect(resolveCivilizationEra(timeline.completedTechIds)).toBe(era);
      if (era >= 2) expect(hasReachedEraThreshold(timeline.completedTechIds, era)).toBe(true);
      for (const techId of timeline.completedTechIds) {
        const tech = TECH_TREE.find(candidate => candidate.id === techId)!;
        expect(tech.prerequisites.every(id => timeline.completedTechIds.includes(id))).toBe(true);
      }
    }
  });

  it('records positive ETAs in strictly increasing completion-turn order', () => {
    const entries = buildRepresentativeResearchTimeline(10).entries;
    for (let index = 1; index < entries.length; index++) {
      expect(entries[index].eta).toBeGreaterThan(0);
      expect(entries[index].completionTurn).toBeGreaterThan(entries[index - 1].completionTurn);
    }
  });
});
\`\`\`

- [ ] **Step 2: Verify the test fails**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts
\`\`\`

Expected: FAIL because the helper module and exports do not exist.

- [ ] **Step 3: Add the route types and implementation**

Create public types:

\`\`\`ts
export interface ResearchTimelineEntry {
  techId: string;
  era: number;
  eta: number;
  completionTurn: number;
}
export interface RepresentativeResearchTimeline {
  targetEra: number;
  entries: ResearchTimelineEntry[];
  completedTechIds: string[];
  arrivalTurnByEra: ReadonlyMap<number, number>;
}
\`\`\`

Implement \`getRequiredAdvancementCount(era)\` as:

\`\`\`ts
const qualifying = getEraAdvancementTechs(era);
if (qualifying.length === 0) throw new Error(\`Era \${era} has no advancement technologies\`);
return Math.ceil(qualifying.length * getEraAdvancementFraction(era));
\`\`\`

Implement \`buildRepresentativeResearchTimeline(targetEra)\` with this exact algorithm:

1. Reject non-integer eras below 1; call \`requireEraPacingProfile(targetEra)\` to reject missing authored eras.
2. Start with empty \`completedTechIds\`, \`turn = 0\`, and \`arrivalTurnByEra = new Map([[1, 0]])\`.
3. For each target transition era 2 through \`targetEra\`, repeatedly consider incomplete qualifying technologies from \`getEraAdvancementTechs(era)\`.
4. Recursively collect each candidate's missing prerequisite closure. Detect a repeated ID in the active recursion stack and throw \`Technology prerequisite cycle at <id>\`.
5. Sort candidates by closure-cost sum, candidate cost, then ASCII ID. Research the first candidate's missing closure in prerequisite-topological order.
6. For each researched technology, calculate \`eta = Math.ceil(tech.cost / getResearchOutputProfileForTech(tech).outputPerTurn)\`, add it to \`turn\`, record the entry, then stop the closure immediately if \`hasReachedEraThreshold\` is true.
7. After the threshold, require \`resolveCivilizationEra(completedTechIds) === era\`; record the arrival turn.

Do not select unrelated technologies, and do not call the legacy strictly-prior-era \`completedTechsForEra\` helper.

- [ ] **Step 4: Run the focused test**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add tests/systems/helpers/pacing-production-budget.ts tests/systems/pacing-production-budget.test.ts
git commit -m "test(pacing): add representative research timeline"
\`\`\`

## Task 2: Add cohorts, neutral candidates, and deterministic scoring

**Files:**

- Modify: \`tests/systems/helpers/pacing-production-budget.ts\`
- Modify: \`tests/systems/pacing-production-budget.test.ts\`

- [ ] **Step 1: Write failing selection tests**

\`\`\`ts
import { BUILDINGS } from '@/systems/city-system';
import {
  getMissingRepresentativeBuildingClosure,
  getEligibleRepresentativeBuildings,
  getRepresentativeCohorts,
  selectRepresentativeBuilding,
} from './helpers/pacing-production-budget';

describe('representative building selection', () => {
  it('adds cohorts only at documented founding eras', () => {
    expect(getRepresentativeCohorts(1).map(cohort => cohort.id)).toEqual(['capital']);
    expect(getRepresentativeCohorts(3).map(cohort => cohort.id)).toEqual(['capital', 'expansion-1']);
    expect(getRepresentativeCohorts(9).map(cohort => cohort.id)).toEqual([
      'capital', 'expansion-1', 'expansion-2', 'expansion-3', 'frontier',
    ]);
  });

  it('excludes non-neutral candidates', () => {
    const candidates = getEligibleRepresentativeBuildings({ completedTechs: TECH_TREE.map(tech => tech.id), completedBuildings: [] });
    const ids = candidates.map(candidate => candidate.id);
    for (const building of Object.values(BUILDINGS)) {
      if (building.nationalProject || building.uniquePerEmpire || building.coastalRequired || building.resourceRequired?.length) {
        expect(ids).not.toContain(building.id);
      }
    }
  });

  it('returns the first missing prerequisite and is deterministic', () => {
    const terminal = Object.values(BUILDINGS).find(building =>
      (building.requiresBuildings?.length ?? 0) > 0
      && !building.nationalProject
      && !building.uniquePerEmpire
      && !building.coastalRequired
      && !(building.resourceRequired?.length))!;
    const input = { completedTechs: TECH_TREE.map(tech => tech.id), completedBuildings: [] as string[] };
    const closure = getMissingRepresentativeBuildingClosure(terminal, input);
    expect(closure[0]).toBe(terminal.requiresBuildings![0]);
    expect(selectRepresentativeBuilding(input)).toEqual(selectRepresentativeBuilding(input));
  });
});
\`\`\`

- [ ] **Step 2: Verify the test fails**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts
\`\`\`

Expected: FAIL because cohort/candidate/scoring exports do not exist.

- [ ] **Step 3: Implement data and eligibility**

Add these constants exactly:

\`\`\`ts
export const REPRESENTATIVE_COHORTS = [
  { id: 'capital', foundedEra: 1 },
  { id: 'expansion-1', foundedEra: 3 },
  { id: 'expansion-2', foundedEra: 5 },
  { id: 'expansion-3', foundedEra: 7 },
  { id: 'frontier', foundedEra: 9 },
] as const;

export const REPRESENTATIVE_CATEGORY_ORDER = [
  'food', 'production', 'science', 'economy', 'culture', 'military', 'espionage',
] as const;

export const REPRESENTATIVE_YIELD_WEIGHTS = {
  food: 1, production: 1.25, gold: 1.5, science: 1.25, happiness: 1.5,
} as const;
\`\`\`

\`getEligibleRepresentativeBuildings\` must filter \`BUILDINGS\` by all of these rules: not national-project, not \`uniquePerEmpire\`, not coastal-only, no resource requirement, not already complete, required technology complete, and no completed \`obsoletedByTech\`. Return ID-sorted candidates.

Export \`getMissingRepresentativeBuildingClosure(terminal, input)\`, which returns missing IDs in prerequisite-topological order. For each terminal candidate, form that closure. Exclude a closure if any required building fails the same neutral filters or needs a missing technology. Compute direct value as:

\`\`\`ts
building.yields.food
+ building.yields.production * 1.25
+ building.yields.gold * 1.5
+ building.yields.science * 1.25
+ (building.happiness ?? 0) * 1.5
\`\`\`

Choose in two phases:

1. A positive-value closure whose terminal category is missing from the city, ordered by closure efficiency, closure cost, then category order and terminal ID.
2. Otherwise, any positive-value closure ordered by the same efficiency/cost/ID rules.

Return the first missing prerequisite in topological order. If there is no prerequisite missing, return the terminal. Never import AI production code.

- [ ] **Step 4: Add negative and coverage tests**

Add tests that prove a candidate becomes unavailable when its technology is absent or its obsolete technology is complete. Add a synthetic test input where two same-cost terminal closures have different IDs and assert the lower ID wins. Add a test where the only positive-value path has a prerequisite and assert the prerequisite is returned first.

- [ ] **Step 5: Run and commit**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts
\`\`\`

Expected: PASS.

\`\`\`bash
git add tests/systems/helpers/pacing-production-budget.ts tests/systems/pacing-production-budget.test.ts
git commit -m "test(pacing): model representative building choices"
\`\`\`

## Task 3: Simulate maturity-aware production and accounting

**Files:**

- Modify: \`tests/systems/helpers/pacing-production-budget.ts\`
- Modify: \`tests/systems/helpers/pacing-reference-economy.ts\`
- Modify: \`tests/systems/pacing-production-budget.test.ts\`

- [ ] **Step 1: Write failing city-simulation tests**

\`\`\`ts
import { simulateRepresentativeCity } from './helpers/pacing-production-budget';

describe('representative production budget', () => {
  it('gives a frontier city no pre-founding production', () => {
    const result = simulateRepresentativeCity({
      cohort: { id: 'frontier', foundedEra: 9 },
      targetEra: 9,
      timeline: buildRepresentativeResearchTimeline(9),
      infrastructureShare: 0.6,
    });
    expect(result.actualProductionEarned).toBe(0);
    expect(result.completedBuildings).toEqual([]);
  });

  it('accounts for every allocated production point once', () => {
    const result = simulateRepresentativeCity({
      cohort: { id: 'capital', foundedEra: 1 },
      targetEra: 10,
      timeline: buildRepresentativeResearchTimeline(10),
      infrastructureShare: 0.6,
    });
    const accounted = result.completedBuildingCost + result.activeBuildingProgress
      + result.discardedObsoleteProgress + result.unspentInfrastructureProduction;
    expect(Math.abs(accounted - result.infrastructureProductionAllocated)).toBeLessThanOrEqual(1e-9);
    expect(result.activeBuildingCount).toBeLessThanOrEqual(1);
  });
});
\`\`\`

- [ ] **Step 2: Verify the test fails**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts
\`\`\`

Expected: FAIL because \`simulateRepresentativeCity\` does not exist.

- [ ] **Step 3: Implement neutral city construction and simulation**

In \`pacing-reference-economy.ts\`, extract a reusable neutral map/city constructor from the existing fixture. It must preserve the current 8×8 no-resource/no-river terrain pattern and derive population as:

\`\`\`ts
const population = Math.min(12, 2 + Math.floor(completedBuildings.length / 4));
const maturity = resolveCityMaturity(population, completedTechs);
\`\`\`

Inject that constructor into \`simulateRepresentativeCity\` to avoid an import cycle.

Make the simulator return an internal, testable extension of the public aggregation result:

\`\`\`ts
export interface SimulatedRepresentativeCity extends RepresentativeCityOutput {
  completedBuildingCost: number;
  activeBuildingProgress: number;
  activeBuildingCount: 0 | 1;
  population: number;
}
\`\`\`

When \`getRepresentativeEmpireOutput\` builds its public \`cities\` array in Task 4, it may expose the shared \`RepresentativeCityOutput\` fields only; the accounting-only fields remain available to Task 3 unit tests through \`simulateRepresentativeCity\`.

For each global turn from the cohort's founding arrival turn through (but excluding) the target era's arrival turn:

\`\`\`ts
const completedTechs = timeline.entries
  .filter(entry => entry.completionTurn <= turn)
  .map(entry => entry.techId);
const city = makeNeutralReferenceCity({ completedBuildings, completedTechs, cohortId });
const base = calculateCityYields(city, map, undefined, completedTechs, {});
const withPercents = applyEmpireTechPercents(base, getEmpireTechPercents(completedTechs));
const personalEra = resolveCivilizationEra(completedTechs);
const cappedProduction = Math.min(withPercents.production, getProductionOutputProfileForEra(personalEra));
const allocation = cappedProduction * infrastructureShare;
spendAllocationAcrossBuildings(allocation);
\`\`\`

\`spendAllocationAcrossBuildings\` must finish the active item, immediately choose another item for same-turn overflow, retain no more than one partial item, cancel an obsolete active item and record its progress in \`discardedObsoleteProgress\`, and record remaining allocation as \`unspentInfrastructureProduction\` when no candidate exists. Do not add empire-flat yields to a local city queue.

Reject shares other than 0.5, 0.6, and 0.7 with \`Unsupported infrastructure share\`; reject invalid target eras with \`Unsupported representative era\`.

- [ ] **Step 4: Add determinism and relative-maturity tests**

Assert repeated identical inputs deep-equal. At era 10, assert the capital's earned production is greater than the frontier's and the frontier population is not greater than the capital's. Do not assert a particular named maturity tier.

- [ ] **Step 5: Run and commit**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts
\`\`\`

Expected: PASS.

\`\`\`bash
git add tests/systems/helpers/pacing-production-budget.ts tests/systems/helpers/pacing-reference-economy.ts tests/systems/pacing-production-budget.test.ts
git commit -m "test(pacing): simulate production-bounded city cohorts"
\`\`\`

## Task 4: Aggregate the representative empire and pin results

**Files:**

- Modify: \`tests/systems/helpers/pacing-reference-economy.ts\`
- Modify: \`tests/systems/pacing-reference-economy.test.ts\`

- [ ] **Step 1: Write failing aggregation tests**

\`\`\`ts
import { getEmpireFlatTechYields } from '@/systems/tech-yield-system';
import { getReferenceEconomyOutput, getRepresentativeEmpireOutput } from './helpers/pacing-reference-economy';

describe('representative multi-city reference economy', () => {
  it('uses the documented 1/3/5/7/9 cohort count', () => {
    expect(getRepresentativeEmpireOutput(1).cityCount).toBe(1);
    expect(getRepresentativeEmpireOutput(3).cityCount).toBe(2);
    expect(getRepresentativeEmpireOutput(5).cityCount).toBe(3);
    expect(getRepresentativeEmpireOutput(7).cityCount).toBe(4);
    expect(getRepresentativeEmpireOutput(9).cityCount).toBe(5);
  });

  it('applies empire-flat yields once after city aggregation', () => {
    const output = getRepresentativeEmpireOutput(10);
    const cityTotals = output.cities.reduce((total, city) => ({
      science: total.science + city.yieldsBeforeEmpireFlat.science,
      production: total.production + city.yieldsBeforeEmpireFlat.production,
    }), { science: 0, production: 0 });
    const flat = getEmpireFlatTechYields(output.completedTechs);
    expect(output.total).toEqual({
      science: Math.round(cityTotals.science + flat.science),
      production: Math.round(cityTotals.production + flat.production),
    });
  });

  it('keeps maximal as the era 10-13 target while representative is diagnostic', () => {
    for (const era of [10, 11, 12, 13]) {
      expect(Math.abs(getResearchOutputProfileForEra(era).outputPerTurn - getReferenceEconomyOutput(era, 'maximal').science)).toBeLessThanOrEqual(3);
    }
  });
});
\`\`\`

- [ ] **Step 2: Verify the test fails**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-reference-economy.test.ts
\`\`\`

Expected: FAIL because \`getRepresentativeEmpireOutput\` does not exist.

- [ ] **Step 3: Implement correctly scoped aggregation**

Return an object containing \`era\`, \`infrastructureShare\`, \`completedTechs\`, \`cityCount\`, \`cities\`, \`total\`, and \`averagePerCity\`. Simulate all cohorts whose \`foundedEra <= era\`; sum unrounded per-city science/production; add \`getEmpireFlatTechYields(timeline.completedTechIds)\` exactly once; round totals with \`Math.round\`; calculate averages from the unrounded total with \`Number(value.toFixed(2))\`.

- [ ] **Step 4: Add canonical and sensitivity pins**

After the first passing aggregation run, record the actual 60% outputs for all eras 1 through 13 in a literal \`Record<number, { science: number; production: number; averageScience: number; averageProduction: number }>\`. The committed test must contain all 13 values and no generated snapshot or empty table.

Add relational tests that 50%, 60%, and 70% each stay within accounting bounds and that total allocated infrastructure production is strictly ordered. Assert at era 9+ that at least two city maturity values are present. Keep all existing bounded/maximal tables byte-for-byte unchanged.

- [ ] **Step 5: Run and commit**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts tests/systems/pacing-reference-economy.test.ts
\`\`\`

Expected: PASS.

\`\`\`bash
git add tests/systems/helpers/pacing-production-budget.ts tests/systems/helpers/pacing-reference-economy.ts tests/systems/pacing-production-budget.test.ts tests/systems/pacing-reference-economy.test.ts
git commit -m "test(pacing): add representative empire reference fixture"
\`\`\`

## Task 5: Document policy and verify full pacing behavior

**Files:**

- Modify: \`.claude/rules/game-balance.md\`

- [ ] **Step 1: Update Pacing Regression Prevention**

Replace the current two-profile description with policy that explicitly says:

- \`bounded\` and \`maximal\` retain their MR13 legacy strictly-prior-era-tech single-city convention.
- \`representative\` is a test-only one-to-five-city diagnostic using the live personal-era resolver, 1/3/5/7/9 cohorts, raw building costs, and 50/60/70 shares.
- Representative totals and averages are diagnostics, not a direct substitute for a single-city output.
- \`maximal\` remains the era 10-13 research target.
- Changing route selection, cohorts, shares, scoring weights, or aggregation scope requires a written 60% snapshot justification and a full-catalog outlier run.

Do not add player-facing UI, SFX, difficulty, AI, save, solo, or hot-seat work; those systems intentionally remain unchanged.

- [ ] **Step 2: Run focused pacing tests**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-reference-economy.test.ts tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts
\`\`\`

Expected: PASS with no full-catalog outliers.

- [ ] **Step 3: Commit the policy**

\`\`\`bash
git add .claude/rules/game-balance.md tests/systems/pacing-reference-economy.test.ts
git commit -m "docs(balance): document representative pacing profile"
\`\`\`

## Task 6: Final verification and handoff

- [ ] **Step 1: Confirm scope before full verification**

Run:

\`\`\`bash
git diff --name-only origin/main...HEAD
git diff --check origin/main...HEAD
\`\`\`

Expected: the implementation changes only the files in this plan. If any \`src/**\` file appears, stop and request scope approval.

- [ ] **Step 2: Run narrow verification**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts tests/systems/pacing-reference-economy.test.ts tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts
\`\`\`

Expected: PASS.

- [ ] **Step 3: Run required repository verification**

Run:

\`\`\`bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
\`\`\`

Expected: both exit 0.

- [ ] **Step 4: Review committed and uncommitted diffs**

Run:

\`\`\`bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
git status --short --branch
\`\`\`

Expected: the working tree is clean; legacy profile values and maximal targeting are unchanged; no runtime files were modified.

- [ ] **Step 5: Handoff**

Report the measured canonical 60% snapshots, the rationale for keeping them diagnostic, fresh test/build results, and the explicit non-changes: runtime UI, SFX, saves, AI behavior, solo flow, and hot-seat flow. Do not push, create a pull request, or merge unless separately asked.
