# Issue #917 Research Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-city research calibration with one canonical, monotonic, all-era research system that keeps tall, standard, wide, solo, AI, and hot-seat games fun and makes every future authored era fail loudly until it has pacing data.

**Architecture:** Keep explicit `Tech.cost` data and the existing pacing bands. Add a pure ranked-city coordination policy, a canonical civilization research-output calculator, and a research-only pacing model; then launch the new policy and all Era 1–13 costs atomically with save migration, UI truth, AI parity, and regression coverage. Turn processing remains the mutation orchestrator, `tech-system.ts` remains the sole progress authority, and presentation consumes serializable breakdowns rather than reimplementing formulas.

**Tech Stack:** TypeScript, Vitest, deterministic game fixtures, DOM-based UI tests, event bus, versioned save migrations, Yarn through `scripts/run-with-mise.sh`.

**Design source:** `docs/superpowers/specs/2026-08-30-issue-917-research-pacing-design.md`

**Repository execution guardrail:** Although the standard skill header names subagent-driven execution, this repository forbids subagents without explicit approval in the implementation conversation. Default to `superpowers:executing-plans` inline unless that approval is given then.

---

## Delivery Contract

| MR | Purpose | Player-visible? | Safe merge boundary |
|---|---|---:|---|
| MR1 | Canonical recurring science and progress integrity | Corrected HUD/ETA truth only | No cost or coordination change |
| MR2 | All-era deterministic balance laboratory | No | Tooling/profile data only |
| MR3 | Coordination + all-era costs + migration + UI + AI | Yes | Atomic; never split |
| MR4 | Bounded queue overflow and completion polish | Yes | Independent after MR3 is stable |

MR3 must not merge a cost-only, coordination-only, migration-only, AI-only, or UI-only subset. Any partial MR must follow `.claude/rules/incremental-mr-completion.md`, name omitted tasks, and prove no player-visible dead end.

## File Responsibility Map

### Create

- `src/systems/research-coordination-system.ts` — pure ranked-city contribution math and policy constants only.
- `src/systems/research-output-system.ts` — gather recurring civilization research contributions and return one canonical breakdown.
- `src/systems/research-pacing-model.ts` — research-only bands, scenario cost recommendation, and validation; no runtime mutation.
- `src/ui/research-breakdown.ts` — render the canonical breakdown with progressive disclosure and no gameplay math.
- `tests/systems/research-coordination-system.test.ts` — example and property/invariant tests.
- `tests/systems/research-output-system.test.ts` — contributor ordering, projection/authoritative parity, and marginal gain.
- `tests/systems/helpers/research-pacing-scenarios.ts` — deterministic tall/standard/wide/#917 scenario data.
- `tests/systems/research-pacing-scenarios.test.ts` — all-era scenario and future-era coverage.
- `tests/ui/research-breakdown.test.ts` — accessible visible breakdown behavior.
- `src/storage/research-cost-migration-v24.ts` — the single production-owned pre-retune cost map reserved for the next free migration and consumed by its future migration/tests.
- `tests/storage/save-migrations-v24.test.ts` — one-time percentage-preserving cost migration.
- `scripts/report-research-pacing.ts` — deterministic Markdown/JSON all-era report.
- `tests/scripts/research-pacing-report.test.ts` — report schema and deterministic-output tests.

### Modify

- `src/core/turn-manager.ts` — supply authoritative per-city science, consume final canonical science, and emit completion once.
- `src/systems/tech-system.ts` — enforce canonical progress, then add queued overflow in MR4.
- `src/systems/tech-progression.ts` — simulate queue ETAs with active progress, order, and the one-completion floor.
- `src/systems/pacing-model.ts` — compatibility re-exports for extracted research helpers; production API remains.
- `src/systems/pacing-audit.ts` — consume scenario-aware research rows.
- `src/systems/era-pacing-profiles.ts` — retain production data and remove research consumers after extraction.
- `src/systems/tech-definitions-*.ts` — one atomic all-era cost retune.
- `src/app/controllers/hud-controller.ts` — display canonical final research and open breakdown.
- `src/app/controllers/turn-flow-controller.ts` — use canonical rate for required-choice and ETA flows.
- `src/ui/tech-panel.ts` — canonical current/queue ETAs and breakdown affordance.
- `src/ai/ai-research.ts` — canonical net rate for target timing.
- `src/ai/ai-production.ts` — marginal net value for science-producing choices.
- `src/storage/save-migrations.ts` — schema 24 migration and legacy cost map, after verifying schema 23 remains allocated on the MR3 base.
- `src/audio/audio-system.ts` — no new cue; verify viewer-scoped exactly-once completion routing.
- `scripts/check-src-rule-violations.sh` — prohibit direct `researchProgress` assignment/increment outside allowed modules/migration.
- `package.json` — add `research:pacing-report` command.
- `.claude/rules/game-balance.md` — replace single-city target language with scenario and future-era rules.
- `docs/superpowers/plans/2026-08-30-issue-917-research-pacing.md` — update phase status in every completing MR.

## Cross-MR Invariants

- No runtime reader calculates civilization research by summing city science independently.
- No source mutates `researchProgress` outside `tech-system.ts` or the explicitly whitelisted schema migration.
- Humans and AI use identical research arithmetic on Explorer, Standard, and Veteran.
- Adding a non-negative city or increasing a city's science cannot reduce final research.
- Tech costs never vary dynamically after selection.
- All player-visible rates and ETAs come from canonical helpers.
- An authored tech era with no explicit scenario/profile fails tests; it never inherits Era 13 silently.
- The cost retune has one schema migration that preserves active completion percentage.
- `tech:completed` and its existing SFX occur exactly once per real completion and never on migration.

---

## MR1 — Canonical Truth Without Balance Changes ✅ merged (#933)

MR1 landed in PR #933. It established canonical recurring science/output and completion truth without activating coordination or retuning costs; the remaining MR2–MR4 work stays governed by the atomic launch boundary above.

### Task 1: Characterize every recurring research contributor

**Files:**

- Create: `tests/systems/research-output-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Read: `src/core/turn-manager.ts`, `src/systems/city-work-system.ts`, `src/systems/tech-yield-system.ts`

- [ ] **Step 1: Write a fixture that names every recurring contributor**

```ts
const expectedRows = [
  'city:capital',
  'city:second',
  'legendary-wonder-civ',
  'national-project-civ',
  'empire-flat-tech',
  'alliance-civ',
  'temporary-research-penalty',
];
```

Build one civilization with two cities and one isolated value for each row. Assert the live turn's progress delta equals the manually enumerated legacy total. Add separate negative fixtures showing absent wonders, projects, alliances, and penalties produce no row.

- [ ] **Step 2: Run the characterization and verify it fails because no canonical breakdown exists**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/research-output-system.test.ts tests/core/turn-manager.test.ts
```

Expected: FAIL on the missing `calculateCivResearchOutput` export; existing turn-manager tests remain green.

- [ ] **Step 3: Record the issue #917 golden input**

Add a fixture containing exactly:

```ts
const ISSUE_917_CITY_SCIENCE = [9, 8, 8, 8, 7, 5, 5, 4, 1, 1, 1, 1];
expect(ISSUE_917_CITY_SCIENCE.reduce((sum, value) => sum + value, 0)).toBe(58);
```

The literal values sum to 58 (not 65); at this MR's legacy identity policy, assert final science remains 58. The value changes to 24 only in MR3.

- [ ] **Step 4: Commit the characterization**

```bash
git add tests/systems/research-output-system.test.ts tests/core/turn-manager.test.ts
git commit -m "test(research): characterize recurring science sources"
```

### Task 2: Add the pure coordination policy without activating it

**Files:**

- Create: `src/systems/research-coordination-system.ts`
- Create: `tests/systems/research-coordination-system.test.ts`

- [ ] **Step 1: Write failing formula and invariant tests**

Define the public shape in the test:

```ts
interface ResearchCityContribution {
  cityId: string;
  science: number;
}

interface ResearchCoordinationPolicy {
  decayExponent: number;
  minimumWeight: number;
}
```

Assert:

```ts
expect(calculateCoordinatedCityScience(issue917, DIMINISHING_RESEARCH_POLICY).final).toBe(24);
expect(getResearchCityWeight(1, DIMINISHING_RESEARCH_POLICY)).toBe(1);
expect(getResearchCityWeight(12, DIMINISHING_RESEARCH_POLICY)).toBeCloseTo(0.15, 8);
```

Use deterministic generated arrays to prove permutation invariance, adding a city is non-decreasing, increasing one city is non-decreasing, malformed values clamp to zero, and no intermediate rounding occurs.

- [ ] **Step 2: Run and observe the missing-module failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/research-coordination-system.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure module**

```ts
export const FULL_CONTRIBUTION_RESEARCH_POLICY: ResearchCoordinationPolicy = {
  decayExponent: 0,
  minimumWeight: 1,
};

export const DIMINISHING_RESEARCH_POLICY: ResearchCoordinationPolicy = {
  decayExponent: 0.85,
  minimumWeight: 0.15,
};

export function getResearchCityWeight(rank: number, policy: ResearchCoordinationPolicy): number {
  if (!Number.isInteger(rank) || rank < 1) throw new RangeError('Research city rank must be a positive integer.');
  return Math.max(policy.minimumWeight, rank ** -policy.decayExponent);
}
```

Sort by descending science then city ID, retain unrounded row contributions, sum once, and return both `unroundedTotal` and `final: Math.floor(unroundedTotal)`.

- [ ] **Step 4: Run tests and source checks**

```bash
scripts/check-src-rule-violations.sh src/systems/research-coordination-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/research-coordination-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/research-coordination-system.ts tests/systems/research-coordination-system.test.ts
git commit -m "feat(research): add monotonic coordination policy"
```

### Task 3: Add the canonical civilization research breakdown

**Files:**

- Create: `src/systems/research-output-system.ts`
- Modify: `tests/systems/research-output-system.test.ts`

- [ ] **Step 1: Expand the failing test around the final public API**

```ts
const breakdown = calculateCivResearchOutput(state, 'player', {
  authoritativeCityScience: { capital: 9, second: 4 },
  policy: FULL_CONTRIBUTION_RESEARCH_POLICY,
});

expect(breakdown).toMatchObject({
  grossCityScience: 13,
  coordinatedCityScience: 13,
  finalScience: 13,
});
expect(breakdown.rows.map(row => row.kind)).toEqual([
  'city-gross', 'coordination', 'empire-bonus', 'temporary-penalty', 'final',
]);
```

The row sequence above is for a fixture with both a non-zero empire bonus and a non-zero temporary penalty. Always render `city-gross`, `coordination`, and `final`; render bonus and penalty rows only when they are non-zero, with negative fixtures proving absent contributors do not create misleading zero rows. Test authoritative input and projected input separately. Add a city that converts idle production to science and a fixture covering city-scoped wonder, resource, network, lowest-city, unrest/occupation/crisis, and percentage modifiers; assert projected, authoritative, and live-turn final science agree under the identity policy. Assert the helper does not mutate `state`, city focus, worked tiles, or `TechState`.

- [ ] **Step 2: Run and verify the API tests fail**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/research-output-system.test.ts
```

Expected: FAIL on missing implementation.

- [ ] **Step 3: Implement canonical gathering and ordering**

```ts
export interface ResearchOutputBreakdown {
  civId: string;
  cityContributions: ResearchCityContributionRow[];
  grossCityScience: number;
  coordinatedCityScience: number;
  empireBonusScience: number;
  penaltyMultiplier: number;
  finalScience: number;
  rows: ResearchOutputDisplayRow[];
}
```

Use authoritative per-city **turn contributions** when provided; each value must include both the already-calculated city science and that city's `idleScienceBonus`. Otherwise derive each city through a shared projected-research-city helper. It may reuse `calculateProjectedCityYields`, but must also apply every science modifier that live turn processing applies: active-route/base-yield context, city wonder yields, resources, network and lowest-city bonuses, unrest/occupation/crisis multipliers, empire technology percentages, and idle production conversion. Add civilization-wide wonder, national-project, empire-flat-tech, and alliance values after coordination. Apply temporary research penalty last and floor once. Default to `FULL_CONTRIBUTION_RESEARCH_POLICY` until MR3.

- [ ] **Step 4: Implement marginal-value calculation through the same API**

```ts
export function getMarginalCivResearchGain(
  state: GameState,
  civId: string,
  cityId: string,
  additionalScience: number,
): number {
  const before = calculateCivResearchOutput(state, civId).finalScience;
  const after = calculateCivResearchOutput(state, civId, { projectedCityScienceBonus: { [cityId]: additionalScience } }).finalScience;
  return Math.max(0, after - before);
}
```

- [ ] **Step 5: Run focused validation**

```bash
scripts/check-src-rule-violations.sh src/systems/research-output-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/research-output-system.test.ts tests/systems/research-coordination-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/research-output-system.ts tests/systems/research-output-system.test.ts
git commit -m "feat(research): centralize civilization output"
```

### Task 4: Wire canonical truth to turn processing, UI projections, and AI

**Files:**

- Modify: `src/core/turn-manager.ts`
- Modify: `src/app/controllers/hud-controller.ts`
- Modify: `src/app/controllers/turn-flow-controller.ts`
- Modify: `src/ui/tech-panel.ts`
- Modify: `src/ai/ai-research.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/app/controllers/hud-controller.test.ts`
- Modify: `tests/app/controllers/turn-flow-controller.test.ts`
- Modify: `tests/ui/tech-panel.test.ts`
- Modify: `tests/ai/ai-research.test.ts`

- [ ] **Step 1: Write failing parity tests**

For the same state, assert:

```ts
expect(turnProgressDelta).toBe(breakdown.finalScience);
expect(renderedHud).toContain(`+${breakdown.finalScience}`);
expect(activeEta).toBe(Math.ceil(remainingCost / breakdown.finalScience));
expect(aiProjectedScience).toBe(breakdown.finalScience);
```

Include a combined wonder + project + flat-tech + alliance + misinformation fixture, because the old presentation paths omitted these contributors.

- [ ] **Step 2: Run the five mirrored suites and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/turn-manager.test.ts tests/app/controllers/hud-controller.test.ts tests/app/controllers/turn-flow-controller.test.ts tests/ui/tech-panel.test.ts tests/ai/ai-research.test.ts
```

Expected: FAIL where old callers still sum projected city yields.

- [ ] **Step 3: Wire turn-manager authoritative values**

Collect `yields.science + result.idleScienceBonus` by city ID during the city loop, then call `calculateCivResearchOutput` once. Delete the local wonder/project/flat/alliance/penalty research arithmetic after parity is proven; retain unrelated gold logic. Add a regression proving an idle-science city remains contribution-identical before and after this refactor.

- [ ] **Step 4: Replace presentation and AI sums**

HUD, turn-flow choice checks, tech panel, and AI research call `calculateCivResearchOutput(state, civId)` and consume `finalScience`. They must not inspect internal rows unless rendering the breakdown in MR3.

- [ ] **Step 5: Run rule checks and focused suites**

```bash
scripts/check-src-rule-violations.sh src/core/turn-manager.ts src/app/controllers/hud-controller.ts src/app/controllers/turn-flow-controller.ts src/ui/tech-panel.ts src/ai/ai-research.ts
./scripts/run-with-mise.sh yarn test --run tests/core/turn-manager.test.ts tests/app/controllers/hud-controller.test.ts tests/app/controllers/turn-flow-controller.test.ts tests/ui/tech-panel.test.ts tests/ai/ai-research.test.ts
```

Expected: PASS with no pacing change under the identity policy.

- [ ] **Step 6: Commit**

```bash
git add src/core/turn-manager.ts src/app/controllers/hud-controller.ts src/app/controllers/turn-flow-controller.ts src/ui/tech-panel.ts src/ai/ai-research.ts tests/core/turn-manager.test.ts tests/app/controllers/hud-controller.test.ts tests/app/controllers/turn-flow-controller.test.ts tests/ui/tech-panel.test.ts tests/ai/ai-research.test.ts
git commit -m "refactor(research): share live output truth"
```

### Task 5: Restore canonical progress mutations and prevent recurrence

**Files:**

- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/tech-system.ts`
- Modify: `scripts/check-src-rule-violations.sh`
- Modify: `tests/systems/tech-system.test.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/hooks/check-src-edit.test.sh`

- [ ] **Step 1: Add exact regressions for the reintroduced #39 bug**

Assert legendary-wonder instant research and interrogation `tech_hint` rewards complete a technology through `applyResearchBonus`; assert progress never remains `>= effectiveCost` with the tech still active.

- [ ] **Step 2: Add a source guard that fails on direct progress mutation**

The check must reject assignments or increments matching `researchProgress:`/`researchProgress +=` in `src/**`, except the constructor/return logic in `src/systems/tech-system.ts` and the versioned save migration file. Add positive and negative shell fixtures.

- [ ] **Step 3: Run tests and confirm both current callers fail**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-system.test.ts tests/systems/legendary-wonder-system.test.ts tests/core/turn-manager.test.ts
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: FAIL on the two direct mutations and guard fixtures.

- [ ] **Step 4: Route rewards through `applyResearchBonus`**

Preserve one-completion semantics and propagate the returned state. Emit completion only where the owning orchestration layer has the event bus; do not add audio calls to gameplay systems.

- [ ] **Step 5: Re-run and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-system.ts src/core/turn-manager.ts src/systems/tech-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-system.test.ts tests/systems/legendary-wonder-system.test.ts tests/core/turn-manager.test.ts
./scripts/run-with-mise.sh yarn test:hooks
git add src/systems/legendary-wonder-system.ts src/core/turn-manager.ts src/systems/tech-system.ts scripts/check-src-rule-violations.sh tests/systems/tech-system.test.ts tests/systems/legendary-wonder-system.test.ts tests/core/turn-manager.test.ts tests/hooks/check-src-edit.test.sh
git commit -m "fix(research): enforce canonical progress updates"
```

### Task 6: Complete MR1 verification and update plan status

**Files:**

- Modify: `docs/superpowers/plans/2026-08-30-issue-917-research-pacing.md`

- [ ] **Step 1: Run build and PR verification separately**

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn verify:pr
./scripts/run-with-mise.sh yarn verify:pr:status
```

Expected: build passes; status proves the durable suite passed for current HEAD and working tree.

- [ ] **Step 2: Inspect complete diffs**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
```

- [ ] **Step 3: Mark MR1 `✅ merged` with the real merged PR number only in the PR that actually merges it**

Do not mark later MRs complete. Commit the status update in the same MR.

---

## MR2 — All-Era Balance Laboratory ✅ merged (#936)

MR2 has isolated research calibration, added deterministic tall/standard/wide and #917
feedback scenarios, report tooling, useful-lifetime/future-era gates, and proposed-only
cost/migration data. Its review also confirms 12 seeded solo openings on every map size and
that the laboratory is viewer-independent in hot-seat games. It deliberately does not activate
coordination, `Tech.cost` changes, schema migration, UI, AI, audio, or save behavior; those
remain the MR3 atomic launch.

### Task 7: Separate research pacing from production pacing

**Files:**

- Create: `src/systems/research-pacing-model.ts`
- Modify: `src/systems/pacing-model.ts`
- Modify: `src/systems/pacing-audit.ts`
- Modify: `tests/systems/pacing-model.test.ts`
- Modify: `tests/systems/pacing-audit.test.ts`

- [x] **Step 1: Write compatibility and missing-era tests**

Assert every existing research export returns identical values through the old and new modules before scenario changes. Add a new failing test proving an authored Era 14 tech without an Era 14 research scenario throws `Missing research pacing scenario for authored era 14`.

- [x] **Step 2: Run and observe missing module/failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts
```

- [x] **Step 3: Move only research responsibilities**

Move `ResearchOutputProfile`, research turn windows, metadata cost multiplier, recommended tech cost, and research profile validation. Keep production helpers in `pacing-model.ts` and re-export research functions for compatibility.

- [x] **Step 4: Remove silent authored-era fallback**

Catalog validation must require an explicit research scenario/profile for every `TECH_TREE` era. Open-ended non-authored frontier display may retain a separately named UI fallback that is never consumed by cost recommendation or audit.

- [x] **Step 5: Validate and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/research-pacing-model.ts src/systems/pacing-model.ts src/systems/pacing-audit.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts
git add src/systems/research-pacing-model.ts src/systems/pacing-model.ts src/systems/pacing-audit.ts tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts
git commit -m "refactor(pacing): isolate research calibration"
```

### Task 8: Build deterministic tall, standard, wide, and #917 scenarios

**Files:**

- Create: `tests/systems/helpers/research-pacing-scenarios.ts`
- Create: `tests/systems/research-pacing-scenarios.test.ts`
- Modify: `tests/systems/helpers/pacing-production-budget.ts`
- Modify: `tests/systems/helpers/pacing-reference-economy.ts`

- [x] **Step 1: Define explicit Era 1–13 scenario data**

```ts
export const RESEARCH_SCENARIOS = {
  tall: {
    cityCounts: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5],
    infrastructureShare: 0.7,
  },
  standard: {
    cityCounts: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
    infrastructureShare: 0.6,
  },
  wide: {
    cityCounts: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26],
    infrastructureShare: 0.5,
  },
} as const;
```

Index `0` is Era 1. Keep the #917 scenario separate with its exact twelve city yields, turn 117, personal Era 2, gross 58, and coordinated 24; do not pretend it is the standard Era-2 cohort.

- [x] **Step 2: Write failing scenario invariants**

For every era and scenario, assert deterministic city count, valid completed-tech frontier, no future-era building leakage, gross/net totals, standard median in-band feasibility, tall maximum feasibility, wide floors, and adjacent-era continuity.

- [x] **Step 3: Replace the one-way diagnostic timeline with feedback simulation**

The research timeline must advance using that scenario's canonical net science rather than `completionistSciencePerTurn`. City production continues to use deterministic infrastructure budgets. A scenario's research arrival changes which buildings can exist later in the same scenario.

- [x] **Step 4: Run scenario tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/research-pacing-scenarios.test.ts tests/systems/pacing-production-budget.test.ts tests/systems/pacing-reference-economy.test.ts
```

Expected: PASS with snapshot values reviewed in the test diff; no snapshot update may be accepted without the corresponding report rationale.

- [x] **Step 5: Add infrastructure sensitivity and seeded map-size sampling**

For the standard cohort, run 50%, 60%, and 70% infrastructure shares and assert no acceptance result depends on only the 60% point. Separately run at least 12 deterministic seeds for each of `small`, `medium`, and `large`; assert average and p90 ETAs satisfy the scenario gates. Print failing seeds in the assertion message. Keep the exact synthetic fixtures as the fast diagnostic layer and the seeded sample as the balance-regression layer.

- [x] **Step 6: Commit**

```bash
git add tests/systems/helpers/research-pacing-scenarios.ts tests/systems/research-pacing-scenarios.test.ts tests/systems/helpers/pacing-production-budget.ts tests/systems/helpers/pacing-reference-economy.ts tests/systems/pacing-production-budget.test.ts tests/systems/pacing-reference-economy.test.ts
git commit -m "test(pacing): simulate multi-city research feedback"
```

### Task 9: Add the deterministic all-era report and cost algorithm

**Files:**

- Create: `scripts/report-research-pacing.ts`
- Create: `tests/scripts/research-pacing-report.test.ts`
- Modify: `package.json`
- Modify: `src/systems/research-pacing-model.ts`
- Modify: `tests/systems/pacing-audit.test.ts`

- [x] **Step 1: Specify the deterministic recommendation formula in tests**

For non-opening techs:

```ts
base = roundReadable(standardNetScience * midpoint(targetWindow) * metadataMultiplier);
wideMinimum = wideNetScience * (band === 'power-spike' || band === 'marquee' ? 2 : 1) + 1;
tallMaximum = tallNetScience * Math.ceil(1.5 * targetWindow.max);
recommended = roundReadable(clamp(base, wideMinimum, tallMaximum));
```

If `wideMinimum > tallMaximum`, fail with an actionable infeasible-policy error naming era, band, and both bounds. Opening structural exceptions continue to use their explicit one-city profiles.

- [x] **Step 2: Add report schema tests**

The JSON report must contain `era`, `band`, scenario gross/net values, cost percentiles, ETA percentiles, one-turn count, adjacent-era ratio, and useful-lifetime warnings. The Markdown render must be byte-for-byte deterministic for the same tree.

- [x] **Step 3: Implement script and package command**

```json
"research:pacing-report": "tsx scripts/report-research-pacing.ts"
```

Default output is Markdown to stdout. `--json` emits machine-readable JSON. The script is read-only and exits nonzero on any acceptance failure.

- [x] **Step 4: Run report and audit**

```bash
./scripts/run-with-mise.sh yarn research:pacing-report
./scripts/run-with-mise.sh yarn research:pacing-report --json
./scripts/run-with-mise.sh yarn test --run tests/scripts/research-pacing-report.test.ts tests/systems/pacing-audit.test.ts
```

Expected before cost activation: report exits nonzero and lists current Era 1–13 violations, including #917, Era 8/9 one-turn collapse, and the Era 9→10 discontinuity. Capture the report in the MR description; do not weaken gates to make legacy data pass.

- [x] **Step 5: Commit**

```bash
git add scripts/report-research-pacing.ts tests/scripts/research-pacing-report.test.ts package.json src/systems/research-pacing-model.ts tests/systems/pacing-audit.test.ts
git commit -m "feat(pacing): report all-era research health"
```

### Task 10: Add unit-useful-lifetime and future-era gates

**Files:**

- Modify: `src/systems/research-pacing-model.ts`
- Modify: `tests/systems/pacing-audit.test.ts`
- Modify: `tests/systems/research-pacing-scenarios.test.ts`
- Modify: `.claude/rules/game-balance.md`

- [x] **Step 1: Write failing explicit-upgrade-chain lifetime tests**

Derive trainable units and successors from typed `upgradesTo`; never infer by shared technology. For standard scenarios, compare the successor frontier arrival with representative build/travel time. Assert ordinary units have at least two build windows and marquee units at least three or one build plus representative travel.

- [x] **Step 2: Add negative and terminal tests**

Prove a terminal unit with `terminalReason` is excluded, a domain-transition exception requires typed metadata, and unrelated same-era units are not treated as successors.

- [x] **Step 3: Add the future-era author checklist to game-balance rules**

Require a new era to add scenario city counts, infrastructure assumptions, aggregate output pins, cost audit, continuity report, useful-lifetime report, and migration analysis if existing costs change.

- [x] **Step 4: Run and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-audit.test.ts tests/systems/research-pacing-scenarios.test.ts
git add src/systems/research-pacing-model.ts tests/systems/pacing-audit.test.ts tests/systems/research-pacing-scenarios.test.ts .claude/rules/game-balance.md
git commit -m "test(pacing): guard unlock usefulness and future eras"
```

### Task 11: Prepare, but do not activate, the all-era cost and migration data

**Files:**

- Create: `src/storage/research-cost-migration-v24.ts` (schema 23 is already allocated on the rebased base)
- Create: `tests/fixtures/research-cost-retune-v24.ts`
- Modify: `tests/scripts/research-pacing-report.test.ts`
- Modify: `docs/superpowers/plans/2026-08-30-issue-917-research-pacing.md`

- [x] **Step 1: Generate the deterministic recommendation table**

Export `PRE_V24_TECH_COST_BY_ID` from `src/storage/research-cost-migration-v24.ts` using current `origin/main` values. Tests import that production-owned map; they do not duplicate it. Export `RECOMMENDED_TECH_COST_BY_ID` from the test fixture using the exact Task 9 formula. Assert both maps contain every changed ID exactly once and unchanged IDs are omitted from the migration delta.

- [x] **Step 2: Review all Era 1–13 output**

The MR description must include, per era: old/new median cost, standard median ETA, tall p90 ETA, wide minimum ETA, one-turn current-frontier count, and adjacent-era ratio. The generated table is not activated in source definitions in MR2.

- [x] **Step 3: Make the report pass against proposed costs**

Add `--proposed-costs` to the report. Legacy mode must still expose current failures; proposed mode must satisfy every design gate.

- [x] **Step 4: Commit data and MR2 status**

```bash
git add src/storage/research-cost-migration-v24.ts tests/fixtures/research-cost-retune-v24.ts tests/scripts/research-pacing-report.test.ts docs/superpowers/plans/2026-08-30-issue-917-research-pacing.md
git commit -m "test(pacing): pin all-era research retune"
```

---

## MR3 — Atomic All-Era Launch ✅ merged (#941)

### Task 12: Write the schema-24 migration before changing costs

**Files:**

- Modify: `src/storage/save-migrations.ts`
- Read: `src/storage/research-cost-migration-v24.ts`
- Create: `tests/storage/save-migrations-v24.test.ts`
- Modify: `tests/storage/save-migrations.test.ts`

- [x] **Step 0: Verify the schema allocation is still free**

Confirm `CURRENT_SAVE_SCHEMA_VERSION` is still 23 on the freshly rebased MR3 base. If it has advanced, stop before editing, allocate the next free version, rename the migration data/test files consistently, and update this plan plus the design document in the same commit. Never overwrite or renumber a merged migration.

- [x] **Step 1: Write failing 0%, 50%, 99%, complete, malformed, discount, and idempotence tests**

For each changed active tech:

```ts
const fraction = Math.min(1, Math.max(0, oldProgress / oldEffectiveCost));
expectedProgress = fraction < 1
  ? Math.min(newEffectiveCost - 1, Math.round(fraction * newEffectiveCost))
  : newEffectiveCost;
```

Test that displayed completion percentage changes by at most one percentage point and unfinished research never completes only because of rounding. Also test Cloud Computing's old/new 15% effective-cost discount, empty current research, unknown IDs, queue preservation, already-current saves, and future-schema rejection.

- [x] **Step 2: Add the schema-24 migration**

Increment `CURRENT_SAVE_SCHEMA_VERSION` from 23 to 24. Import the reviewed old-cost delta from `src/storage/research-cost-migration-v24.ts`; production must not import tests. Normalize an already-complete legacy active tech and advance its queue without event/audio emission.

- [x] **Step 3: Run storage tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations-v24.test.ts tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS before source cost changes because tests supply explicit old/new tables.

- [x] **Step 4: Commit with the MR3 atomic launch**

```bash
git add src/storage/research-cost-migration-v24.ts src/storage/save-migrations.ts tests/storage/save-migrations-v24.test.ts tests/storage/save-migrations.test.ts
git commit -m "feat(storage): preserve research progress through retune"
```

### Task 13: Activate all Era 1–13 costs and diminishing coordination together

**Files:**

- Modify: `src/systems/tech-definitions-eras1-4.ts`
- Modify: `src/systems/tech-definitions-eras5-7.ts`
- Modify: `src/systems/tech-definitions-eras8.ts`
- Modify: `src/systems/tech-definitions-eras9.ts`
- Modify: `src/systems/tech-definitions-eras10.ts`
- Modify: `src/systems/tech-definitions-eras11.ts`
- Modify: `src/systems/tech-definitions-eras12.ts`
- Modify: `src/systems/tech-definitions-eras13.ts`
- Modify: `src/systems/research-output-system.ts`
- Modify: `tests/integration/pacing-simulation.test.ts`
- Modify: `tests/systems/research-pacing-scenarios.test.ts`

- [x] **Step 1: Change the default runtime policy**

`calculateCivResearchOutput` defaults to `DIMINISHING_RESEARCH_POLICY`. No gameplay caller passes a policy override. Full-contribution policy remains available only to migration/report characterization tests.

- [x] **Step 2: Apply the generated cost table mechanically**

Update every changed `Tech.cost` to its pinned proposed value. Do not change IDs, prerequisites, bands, unlocks, descriptions, or effects in this task.

- [x] **Step 3: Flip the #917 fixture expectation**

```ts
expect(breakdown.grossCityScience).toBe(58);
expect(breakdown.coordinatedCityScience).toBe(24);
const expectedEtas = Object.fromEntries(
  ['pictographs', 'sacred-sites', 'shamanism', 'sabotage', 'iron-forging',
    'engineering', 'trade-routes', 'astronomy', 'siege-warfare', 'tactics',
    'banking', 'scientific-method']
    .map(id => [id, Math.ceil(RECOMMENDED_TECH_COST_BY_ID[id] / breakdown.finalScience)]),
);
expect(selectedEtas).toEqual(expectedEtas);
expect(Object.values(selectedEtas).every(turns => turns === 1)).toBe(false);
```

Calculate every exact ETA from the pinned new cost map; do not hardcode values copied from the old screenshot.

- [x] **Step 4: Run all pacing and progression suites**

```bash
scripts/check-src-rule-violations.sh src/systems/tech-definitions-eras1-4.ts src/systems/tech-definitions-eras5-7.ts src/systems/tech-definitions-eras8.ts src/systems/tech-definitions-eras9.ts src/systems/tech-definitions-eras10.ts src/systems/tech-definitions-eras11.ts src/systems/tech-definitions-eras12.ts src/systems/tech-definitions-eras13.ts src/systems/research-output-system.ts
./scripts/run-with-mise.sh yarn research:pacing-report --proposed-costs
./scripts/run-with-mise.sh yarn test --run tests/integration/pacing-simulation.test.ts tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts tests/systems/research-pacing-scenarios.test.ts tests/systems/tech-system.test.ts tests/systems/tech-progression.test.ts
```

Expected: report and tests pass across Eras 1–13, including Bronze Working and #917.

- [x] **Step 5: Commit the atomic data/policy activation**

```bash
git add src/systems/tech-definitions-eras1-4.ts src/systems/tech-definitions-eras5-7.ts src/systems/tech-definitions-eras8.ts src/systems/tech-definitions-eras9.ts src/systems/tech-definitions-eras10.ts src/systems/tech-definitions-eras11.ts src/systems/tech-definitions-eras12.ts src/systems/tech-definitions-eras13.ts src/systems/research-output-system.ts tests/integration/pacing-simulation.test.ts tests/systems/research-pacing-scenarios.test.ts
git commit -m "fix(research): rebalance every authored era"
```

### Task 14: Add the accessible research breakdown and canonical queue UI

**Files:**

- Create: `src/ui/research-breakdown.ts`
- Create: `tests/ui/research-breakdown.test.ts`
- Modify: `src/app/controllers/hud-controller.ts`
- Modify: `src/ui/tech-panel.ts`
- Modify: `src/systems/tech-progression.ts`
- Modify: `tests/app/controllers/hud-controller.test.ts`
- Modify: `tests/ui/tech-panel.test.ts`
- Modify: `tests/systems/tech-progression.test.ts`

#### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| HUD shows final `+24` | Activate science item | Breakdown opens with Cities `+58`, Research network `-34`, bonuses/penalties, Final `+24` |
| Breakdown is open | Change city focus and rerender | Every row and final value refresh from fresh state |
| Queue A, B, C is visible | Move C up | Queue becomes A, C, B and every cumulative ETA updates |
| Queue has A, B | Remove A | B becomes first queued item and ETA/order refreshes immediately |
| Hot-seat handoff completes | Open breakdown | Only the new current player's data appears |

#### Misleading UI Risks

- Never display gross as spendable research.
- Never describe the research-network difference as a fixed percentage.
- Never show decimals or exponent language on player surfaces.
- Never derive queued ETA as independent `ceil(cost / science)` rows.
- Never expose a hidden hot-seat player's breakdown.
- Keep every actionable technology reachable through `Complete catalog`.

#### Interaction Replay Checklist

- open, close, reopen;
- add first and second queue items;
- reorder both directions;
- remove first and later items;
- repeat-click after immutable commits;
- change focus and rerender;
- switch hot-seat viewer and reopen;
- save, load, and reopen.

- [x] **Step 1: Write failing rendered-experience tests**

Assert exact visible row labels, whole numbers, explanatory copy, 44px control size, keyboard activation, focus restoration, accessible dialog/name, and immediate fresh-state rerender.

- [x] **Step 2: Write queue timing tests before changing UI**

Create `simulateResearchQueueTiming` using active progress, effective costs, final science, ordered queue, and the one-completion-per-turn floor. MR3 still discards overflow; MR4 changes the simulation and production semantics together.

- [x] **Step 3: Implement the renderer and controller wiring**

The UI receives `ResearchOutputBreakdown`; it contains no yield or coordination formulas. The HUD item is a button with an accessible label, not a span with an attached click handler.

- [x] **Step 4: Run UI and timing tests**

```bash
scripts/check-src-rule-violations.sh src/ui/research-breakdown.ts src/app/controllers/hud-controller.ts src/ui/tech-panel.ts src/systems/tech-progression.ts
./scripts/run-with-mise.sh yarn test --run tests/ui/research-breakdown.test.ts tests/app/controllers/hud-controller.test.ts tests/ui/tech-panel.test.ts tests/systems/tech-progression.test.ts
```

- [x] **Step 5: Commit in the MR3 atomic launch**

```bash
git add src/ui/research-breakdown.ts tests/ui/research-breakdown.test.ts src/app/controllers/hud-controller.ts src/ui/tech-panel.ts src/systems/tech-progression.ts tests/app/controllers/hud-controller.test.ts tests/ui/tech-panel.test.ts tests/systems/tech-progression.test.ts
git commit -m "feat(ui): explain canonical research pacing"
```

### Task 15: Make computer players value net research without hidden bonuses

**Files:**

- Modify: `src/ai/ai-research.ts`
- Modify: `src/ai/ai-production.ts`
- Modify: `tests/ai/ai-research.test.ts`
- Modify: `tests/ai/ai-production.test.ts`
- Modify: `tests/core/opponent-challenge.test.ts`

- [x] **Step 1: Write failing marginal-value and difficulty-symmetry tests**

Assert a library in the strongest science city receives a larger research-value component than the same raw library in a low-ranked marginal city, while both remain non-negative. For identical state, Explorer/Standard/Veteran must return identical output and ETA.

- [x] **Step 2: Preserve existing difficulty behavior**

AI candidate breadth, stable tie-breaking, and seeded mistakes continue through existing challenge logic. Do not add `researchMultiplier`, `techCostMultiplier`, or challenge branches to research systems.

- [x] **Step 3: Implement marginal net scoring**

Replace raw `(yields.science ?? 0) * 1.25` valuation with `getMarginalCivResearchGain` multiplied by the existing strategic science weight. Research target scoring consumes canonical queue timing.

- [x] **Step 4: Run AI suites and commit in the MR3 atomic launch**

```bash
scripts/check-src-rule-violations.sh src/ai/ai-research.ts src/ai/ai-production.ts
./scripts/run-with-mise.sh yarn test --run tests/ai/ai-research.test.ts tests/ai/ai-production.test.ts tests/core/opponent-challenge.test.ts
git add src/ai/ai-research.ts src/ai/ai-production.ts tests/ai/ai-research.test.ts tests/ai/ai-production.test.ts tests/core/opponent-challenge.test.ts
git commit -m "feat(ai): plan against net research value"
```

### Task 16: Prove solo, hot-seat, save, and SFX integration

**Files:**

- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/core/hotseat-outcome.test.ts`
- Modify: `tests/ui/tech-panel.test.ts`
- Modify: `tests/audio/audio-system.integration.test.ts`
- Modify: `src/audio/audio-system.ts` only if the test exposes a routing defect

- [x] **Step 1: Add two-human owner-turn parity**

Give both players different city science, bonuses, penalties, queues, and personal difficulty. Process each owner turn and assert only that owner advances by their canonical final science.

- [x] **Step 2: Add viewer-isolation tests**

After handoff, HUD, breakdown, and tech panel must contain the new player values and none of the previous player's tech IDs, bonus labels, penalty values, or queue entries.

- [x] **Step 3: Add exactly-once SFX tests**

Normal human completion plays once; AI/hidden hot-seat completion plays zero for the current viewer; migration plays zero. Do not add a coordination/open-panel sound.

- [x] **Step 4: Run integration suites**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/turn-manager.test.ts tests/core/hotseat-outcome.test.ts tests/app/controllers/hud-controller.test.ts tests/ui/tech-panel.test.ts tests/audio/audio-system.integration.test.ts tests/storage/save-migrations-v24.test.ts
```

- [x] **Step 5: Commit in the MR3 atomic launch**

```bash
git add tests/core/turn-manager.test.ts tests/core/hotseat-outcome.test.ts tests/ui/tech-panel.test.ts tests/audio/audio-system.integration.test.ts src/audio/audio-system.ts
git commit -m "test(research): prove multiplayer and audio parity"
```

### Task 17: Complete MR3 launch verification

**Files:**

- Modify: `docs/superpowers/plans/2026-08-30-issue-917-research-pacing.md`

- [x] **Step 1: Run source checks for every changed source file**

```bash
scripts/check-src-rule-violations.sh src/core/turn-manager.ts src/systems/research-coordination-system.ts src/systems/research-output-system.ts src/systems/research-pacing-model.ts src/systems/tech-system.ts src/systems/tech-progression.ts src/app/controllers/hud-controller.ts src/app/controllers/turn-flow-controller.ts src/ui/research-breakdown.ts src/ui/tech-panel.ts src/ai/ai-research.ts src/ai/ai-production.ts src/storage/save-migrations.ts src/audio/audio-system.ts
```

- [x] **Step 2: Run focused domains**

```bash
./scripts/run-with-mise.sh yarn research:pacing-report
./scripts/run-with-mise.sh yarn test --run tests/systems/research-coordination-system.test.ts tests/systems/research-output-system.test.ts tests/systems/research-pacing-scenarios.test.ts tests/integration/pacing-simulation.test.ts tests/systems/tech-system.test.ts tests/systems/tech-progression.test.ts tests/ui/research-breakdown.test.ts tests/ui/tech-panel.test.ts tests/ai/ai-research.test.ts tests/ai/ai-production.test.ts tests/storage/save-migrations-v24.test.ts tests/audio/audio-system.integration.test.ts
```

- [x] **Step 3: Run build and durable proof separately**

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn verify:pr
./scripts/run-with-mise.sh yarn verify:pr:status
./scripts/run-with-mise.sh yarn test:web-smoke
./scripts/run-with-mise.sh yarn build:tauri
```

- [x] **Step 4: Perform browser interaction replay**

On a deterministic #917 fixture and a two-player hot-seat fixture, replay the Task 14 checklist with mouse, keyboard, and narrow/mobile viewport. Capture screenshots of closed and expanded HUD plus reordered queue for the PR.

- [x] **Step 5: Confirm dual-release asset paths**

Inspect build output/config evidence that the web build still uses `/conquestoria/` and the Tauri frontend uses relative asset paths. Research behavior, save migration, UI, and audio routing must remain shared; no Tauri-specific branch is permitted.

- [x] **Step 6: Inspect committed and uncommitted diffs**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
```

- [x] **Step 7: Mark MR3 status honestly and commit**

Use `✅ merged` with the real merged PR number only when the full atomic launch merged. Never mark it complete for a partial branch.

---

## MR4 — Overflow and Completion Polish 🟡 verified and committed locally; awaiting review and merge

### Task 18: Carry overflow to one queued successor

**Files:**

- Modify: `src/systems/tech-system.ts`
- Modify: `tests/systems/tech-system.test.ts`

- [x] **Step 1: Write failing overflow contract tests**

Cover no completion, exact completion, completion with queued successor and overflow, completion without queue (overflow discarded), discounted effective costs, and overflow larger than the successor cost. Even when carried progress exceeds the successor cost, only the first technology completes in this invocation.

- [x] **Step 2: Extend `ResearchResult`**

```ts
export interface ResearchResult {
  state: TechState;
  completedTech: string | null;
  carriedProgress: number;
}
```

On completion, set the queued successor active and its progress to `newProgress - effectiveCost`; without a queued successor, set progress and carried value to zero.

- [x] **Step 3: Run and commit**

```bash
scripts/check-src-rule-violations.sh src/systems/tech-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-system.test.ts
git add src/systems/tech-system.ts tests/systems/tech-system.test.ts
git commit -m "feat(research): preserve queued overflow"
```

### Task 19: Make queue timing and completion presentation match overflow

**Files:**

- Modify: `src/systems/tech-progression.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ui/tech-panel.ts`
- Modify: `tests/systems/tech-progression.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/ui/tech-panel.test.ts`
- Modify: `tests/audio/audio-system.integration.test.ts`

- [x] **Step 1: Write a discrete queue simulation**

Each simulated owner turn adds final science, permits at most one completion, carries overflow only to an existing successor, and records the first turn each item completes. Reorder/remove tests must recalculate immediately.

- [x] **Step 2: Wire state and exactly-once event behavior**

Turn manager commits returned state and emits one completion event for `completedTech`. Carried successor progress is visible immediately; it does not emit a second event until a later owner turn actually completes it.

- [x] **Step 3: Run interaction and SFX suites**

```bash
scripts/check-src-rule-violations.sh src/systems/tech-progression.ts src/core/turn-manager.ts src/ui/tech-panel.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-progression.test.ts tests/core/turn-manager.test.ts tests/ui/tech-panel.test.ts tests/audio/audio-system.integration.test.ts
```

- [x] **Step 4: Commit**

```bash
git add src/systems/tech-progression.ts src/core/turn-manager.ts src/ui/tech-panel.ts tests/systems/tech-progression.test.ts tests/core/turn-manager.test.ts tests/ui/tech-panel.test.ts tests/audio/audio-system.integration.test.ts
git commit -m "fix(research): align queue ETA with overflow"
```

### Task 20: Re-audit campaign throughput and finish

**Files:**

- Modify: `tests/systems/research-pacing-scenarios.test.ts`
- Modify: `docs/superpowers/plans/2026-08-30-issue-917-research-pacing.md`

- [x] **Step 1: Run the all-era report with overflow simulation enabled**

```bash
./scripts/run-with-mise.sh yarn research:pacing-report
```

Expected: current-frontier wide floors remain satisfied, era continuity remains within 50%, and no era returns to full one-turn collapse.

- [x] **Step 2: Run the manual playability matrix**

Exercise young/new-player recommended path, tall science, balanced economy, peaceful wide, conquest wide, naval/trade emphasis, science specialization, completionist backfill, Explorer/Standard/Veteran AI, solo, and two-to-four-player hot-seat across small/medium/large maps. Record turn ranges and any misleading labels in the PR description.

Use three comprehension checks for the age-range UX without collecting age or personal data: a player can identify the final rate, explain in plain language why gross differs from final, and predict that adding or improving a city cannot slow research. The default surface must remain understandable without opening details; the expanded surface must satisfy expert inspection.

- [x] **Step 3: Run final verification**

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn verify:pr
./scripts/run-with-mise.sh yarn verify:pr:status
./scripts/run-with-mise.sh yarn test:web-smoke
./scripts/run-with-mise.sh yarn build:tauri
```

- [x] **Step 4: Review all diffs and mark MR4 complete only after merge**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
```

## Inline Review Record

This review was performed after the complete roadmap was drafted. Findings were corrected in the plan rather than deferred to implementation.

| Dimension | Review finding | Correction now present in this plan |
|---|---|---|
| Balance across all eras | A single deterministic standard empire could recreate the original single-profile blind spot. | Tall/standard/wide/#917 scenarios, 50/60/70% infrastructure sensitivity, 12 seeds on every map size, adjacent-era continuity, and a report that fails on violations. |
| Gameplay pacing | Slowing research in isolation could still leave unlocks obsolete before players use them. | Explicit unit build/travel useful-lifetime audit derived only from typed `upgradesTo` chains. Production and global game speed remain unchanged. |
| Fun | A hard cap would make science buildings feel worthless; a city tax could make expansion feel bad. | Every positive science increase is monotonic, every city has positive unrounded weight, strongest hubs retain full value, and wide empires remain faster with diminishing returns. |
| New mechanic | A rank/exponent rule would be opaque and cognitively expensive if exposed directly. | Automatic strongest-hub ordering, no manual slots, whole-number UI, plain-language explanation, and progressive disclosure; exponent terminology never appears in play. |
| Player ages 7–43 | One expert-oriented breakdown would not guarantee novice readability. | Default shows only final rate/ETA; details satisfy experts. Manual comprehension checks require identifying final rate, explaining gross versus final, and predicting that cities never slow research without collecting age data. |
| Play styles | Initial matrix emphasized tall/wide science and underrepresented balanced, naval, trade, and non-science openings. | Final playability matrix includes balanced economy, naval/trade, science specialization, peaceful expansion, conquest, and completionist backfill. |
| Difficulty modes | Scaling output by Explorer/Standard/Veteran would create hidden cheats and hot-seat asymmetry. | Difficulty-invariant costs/output tests; existing challenge system continues to change AI choice quality and world pressure only. Pending difficulty changes cannot change research arithmetic. |
| Computer players | Raw building science would make AI overvalue low-impact marginal cities under coordination. | `getMarginalCivResearchGain` feeds AI production scoring; AI research uses canonical queue timing; all difficulties share the same rules. |
| UI | Old HUD and panel paths omitted bonuses/penalties, and independent ETA division lies about queues. | One serializable breakdown feeds HUD/panel; discrete queue simulation covers active progress, order, floor, and later overflow. |
| UX/accessibility | A clickable span, color-only negative values, stale DOM, or sub-44px controls would regress usability. | Button semantics, accessible naming, visible focus, text signs/labels, 44px targets, immutable-state replay tests, keyboard and narrow-screen browser replay. |
| UI truth and cognitive load (review finding) | MR1’s negative-row requirement contradicted its later fixed row list, risking a detail view filled with zero-value bonuses and penalties or tests with ambiguous expectations. | Summary rows (`city-gross`, `coordination`, `final`) are always present; optional empire-bonus and temporary-penalty rows render only when non-zero. Positive and negative rendered-data tests define both cases before MR3 exposes the breakdown UI. |
| Architecture | Turn manager, UI, and AI each owning formulas violated SRP and invited drift. | Pure coordination module, one output aggregator, research-only pacing model, progress authority in `tech-system.ts`, UI renderer with no gameplay math, and turn manager as orchestration only. |
| Completion parity (review finding) | Wonder rewards, interrogation bonuses, and stolen technologies could complete research without applying the normal-turn Gene Therapy or obsolescence consequences. | `applyResearchCompletionConsequences` now provides the shared post-completion path; each acquisition source emits one `tech:completed` event and invokes that same state/event consequence helper. |
| Save normalization (review finding) | Legacy-load recovery constructed a partial `TechState` outside the canonical factory, making new defaults easy to omit and undermining the progress-ownership invariant. | Recovery now uses `createTechState`; the direct-progress source guard blocks real assignments/increments but deliberately permits read-only intelligence snapshots. |
| Live-output parity (review finding) | The proposed authoritative handoff named only `yields.science`, but the live turn also adds `idleScienceBonus`; the existing projected helper also omits several turn-only science modifiers. Either omission would make MR1 change science behavior or keep HUD/ETA dishonest. | Canonical output now accepts full per-city turn contributions (`yields.science + idleScienceBonus`) and owns a shared projected-research-city helper. MR1 parity coverage includes idle science, city wonder/resource/network/lowest-city bonuses, multipliers, and tech percentages against the real turn loop. |
| Scenario data integrity (review finding) | The literal #917 fixture listed twelve values that sum to 58, while the plan and design claimed 65. That would make the golden test, future pacing report, and player-facing example disagree with the actual input. | Keep the supplied distribution and use its verified gross 58 everywhere; the existing diminishing-policy result remains 24, so the illustrated research-network difference is -34. |
| SOLID/extensibility | Runtime costs or era-specific branches would violate open/closed design and make future eras fragile. | Typed policies/scenarios, explicit authored data, compatibility re-exports, generic cost algorithm, and loud missing-era failure instead of Era-13 fallback. |
| Data integrity | Draft duplicated old-cost maps between tests and migration code. | One production-owned `src/storage/research-cost-migration-v24.ts`; tests import it, production never imports tests. |
| SFX | Bonus/overflow completion could double-fire the existing cue; a new passive sound would be noisy. | Exactly-once viewer-scoped completion event/SFX tests and explicit no-sound rules for coordination, panel opening, migration, AI, and hidden hot-seat owners. No new asset. |
| Saved games | Absolute progress plus larger costs would erase player investment; draft `floor` could visibly lower completion. | One atomic schema migration preserves rounded percentage within one point, caps unfinished work below completion, handles discounts/malformed 100%, and is idempotent. |
| Automated testing | Exact synthetic fixtures alone did not satisfy statistical balance guidance. | Property tests plus deterministic fixtures plus seeded averages/p90 across all map sizes; failure messages name era, band, scenario, and seed. |
| Regression protection | Retuning all costs could break the original too-slow Bronze Working fix or recreate the Era 9→10 cliff. | Opening baseline/invested contracts remain hard gates; normalized adjacent-era median may not move more than 50% without typed exception. |
| Solo play | Canonicalization could change ordinary one-human turn ordering or event delivery. | Authoritative-turn parity tests and normal/bonus completion tests run through the real solo turn loop. |
| Hot-seat play | Cached HUD/panel state or audio could leak the previous human's private research. | Two-human owner-turn parity, handoff/reopen tests, viewer-negative assertions, and zero hidden-player SFX; manual matrix extends to four humans. |
| Dual release | Storage/UI changes validated only in web output could break the shared Tauri release. | Web build/smoke plus Tauri frontend build and explicit `/conquestoria/` versus relative-asset confirmation; no platform fork. |
| Proper implementation | Splitting costs, coordination, migration, AI, or UI into separate releases would create dishonest intermediate states. | MR1 and MR2 are behavior-safe foundations; MR3 is explicitly atomic; MR4 overflow follows only after the new campaign curve is proven. TDD, focused checks, durable verification, diff review, and phase-status updates are specified per MR. |

## Completion Evidence Required on Every MR

- exact base `origin/main` SHA;
- focused test commands and pass counts;
- build result when TypeScript changes;
- durable verification/status for push or PR;
- pacing report before/after for MR2–MR4;
- changed-source rule-check command;
- committed and uncommitted diff review;
- explicit checks not run and why;
- plan status updated in the same phase-completing PR.
