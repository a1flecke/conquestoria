# #1122 Capture Force Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a capture plan request a small, evidence-based critical force and an explicitly optional, possible support unit when the AI visibly observes a defended target, while preserving the 1+1 undefended minimum.

**Architecture:** Capture candidate generation derives a bounded force shape from observer-safe city and local-unit facts. Critical roles continue through existing readiness semantics; optional support roles flow only through assignment and production. The plan persists optional support roles with a load-safe default and refreshes them whenever a target is legitimately observed again.

**Tech Stack:** TypeScript, Vitest, existing AI portfolio/assignment/production pipeline, serializable `GameState` saves.

---

**Base and collision gate:** Before Task 1, fetch `origin/main`, confirm #1122 is open, inspect open PRs and source-file overlap, compare the long-horizon/runtime branch state, and rebase this branch if its work has landed. If an active change touches the same production files, stop and report the collision. Re-run this gate before Sol acceptance.

**Scope:** Only #1122. Do not edit `nextPlanPhase`, deadline thresholds, capture action ordering, `scripts/run-ai-long-horizon.sh`, generic timeout/scenario/profiling policy, or `known-campaign-gaps.ts` unless latest-main long-horizon output proves a direct stale entry.

### Task 1: Establish the real-pipeline RED fixture

**Files:**
- Modify: `tests/ai/ai-prepared-turn.test.ts`
- Modify: `tests/ai/ai-major-turn.test.ts`
- Test: `tests/ai/ai-production.test.ts`

- [ ] **Step 1: Add a shared, compact defended-capture fixture in `ai-prepared-turn.test.ts`.**

  Build a legal at-war AI/human state with the target city visible to `ai-1`, one visible garrison on its tile, `walls` + `star_fort`, HP at least 60, two AI capture/frontline units, and at least one city-bombard-capable unit that the AI can legally train. Assert all setup facts before invoking planning; never seed a hidden enemy unit into the input used for the positive case.

  ```ts
  const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');
  const plan = prepared.portfolio.primaryPlan;
  expect(plan).toMatchObject({ objective: 'capture', target: { kind: 'city', id: target.id } });
  expect(plan?.requiredRoles).toEqual({ frontline: 1, capture: 1 }); // RED on main
  expect(prepared.assignments.forceDemands.every(d => d.missing === 0)).toBe(true);
  ```

- [ ] **Step 2: Drive the prepared plan through the real executor and prove the failure.**

  Use `processMajorCivStrategicTurn` with the prepared portfolio, then assert target ownership remains human and the attempted attacker either died or has acted with lower health. Keep a test-local `CaptureRoundTrace` object whose fields are the actual plan roles, support roles, assigned units/roles, force demands, queue, phase, city HP/walls, visible garrison ids, bombardment candidate availability, and capture action outcome. Assert those fields rather than logging them. This makes the trace deterministic and prevents a scoring-helper-only regression.

- [ ] **Step 3: Run the RED tests.**

  Run:
  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-prepared-turn.test.ts tests/ai/ai-major-turn.test.ts
  ```
  Expected: the new defended-capture expectation fails specifically because the current plan is `{ frontline: 1, capture: 1 }`; do not continue if it fails for fixture legality, unrelated target selection, or tactical randomness.

- [ ] **Step 4: Add the healthy undefended control beside the RED case.**

  Use the same pipeline with no visible garrison, no walls/fort, and an exposed city. Assert exact `{ frontline: 1, capture: 1 }`, absent/empty optional support, no new support demand, and capture without a new waiting condition.

- [ ] **Step 5: Profile default-test placement before adding further tests.**

  Follow `.claude/rules/hooks-and-tooling.md`’s CI table for every added default-discovered test: run `yarn test:profile:default`, then the explicit four-name `yarn test:ci-shards:allocate` command with retained shard names, and `tests/scripts/ci-test-shard-selection.test.ts`. Keep every unrelated assignment byte-for-byte.

### Task 2: Define and persist critical versus optional role maps

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/opponent-ai-state.ts`
- Modify: `src/ai/ai-objective-scoring.ts`
- Modify: `src/ai/ai-plan-portfolio.ts`
- Test: `tests/ai/ai-plan-portfolio.test.ts`
- Test: `tests/core/opponent-ai-state.test.ts`

- [ ] **Step 1: Write failing normalization and refresh tests.**

  Cover an old plan with no `supportRoles`, malformed role/count values, a valid `{ siege: 1 }`, plan cloning, and retained-plan refresh from support `{}` to `{ siege: 1 }` and back to `{}`. Assert optional slots never appear in `requiredRoles` and that a stale field never survives a fresh matching candidate.

- [ ] **Step 2: Add an optional plan field and strict normalizer.**

  In `AIStrategicPlan`, add:
  ```ts
  supportRoles?: Partial<Record<AIStrategicRole, number>>;
  ```
  In `normalizePlan`, reuse the exact valid-role, positive-integer, and `MAX_PLAN_ROLE_REQUIREMENT` rules used for `requiredRoles`; omit the property when the normalized map has no entries. The normalizer must accept absent legacy data. Do not make the field required or add a schema migration.

- [ ] **Step 3: Thread the field through candidate and portfolio types.**

  Add optional `supportRoles` to `AIObjectiveCandidate`, `AIObjectiveChoice.plan`, and `AIPlanCandidate`. Copy it in objective-choice output, `planCandidates`, `createPlan`, and the retained-plan return branch. Keep `missingRoles()` and `choice.demands` reading only `requiredRoles`.

- [ ] **Step 4: Run the focused tests.**

  Run:
  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-plan-portfolio.test.ts tests/core/opponent-ai-state.test.ts
  ```
  Expected: support maps survive valid normalization and retained-plan refresh; legacy plans behave as explicit-empty support maps.

### Task 3: Derive bounded, observer-safe capture force shapes

**Files:**
- Modify: `src/ai/ai-perception.ts` only if a minimal typed visible-city projection is required
- Modify: `src/ai/ai-prepared-turn.ts`
- Modify: `src/ai/ai-objective-scoring.ts` only for type propagation
- Test: `tests/ai/ai-prepared-turn.test.ts`
- Test: `tests/ai/ai-perception.test.ts` if a perception type/projection changes

- [ ] **Step 1: Write tests for the full force matrix.**

  Add cases that call the real preparation path and assert:

  ```ts
  expect(undefended.requiredRoles).toEqual({ frontline: 1, capture: 1 });
  expect(undefended.supportRoles ?? {}).toEqual({});
  expect(garrisoned.requiredRoles).toEqual({ frontline: 2, capture: 1 });
  expect(hardened.supportRoles).toEqual({ siege: 1 }); // ranged only when siege is impossible
  ```

  Add negative cases: a hidden defender must yield the same force shape as no defender; a remembered current target must retain its prior legal force shape; visible HP below the named threshold must not request support solely for walls; unavailable siege and ranged must leave support empty; once an eligible support unit becomes trainable while the target remains visible, support is requested.

- [ ] **Step 2: Implement a local capture-force helper.**

  In `ai-prepared-turn.ts`, create a helper returning `{ requiredRoles, supportRoles? }`. Build one `Map<city-tile-key, visible hostile perceived units>` before the city loop. A helper may read live city HP/buildings only when that exact city is visible; otherwise it returns the current matching plan’s cloned maps or the 1+1 baseline. Cap hard roles at two frontline plus one capture and support at one slot.

- [ ] **Step 3: Make support availability legal and cheap.**

  Move the existing `getTrainableUnitsForCiv` calculation before capture-candidate construction and pass its unit types to the helper. Choose `siege` if a trainable unit has a city-bombard-capable profile, otherwise `ranged`, otherwise no support. Do not run city-specific production, pathfinding, or combat odds inside the candidate loop.

- [ ] **Step 4: Run candidate/perception tests.**

  Run:
  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-prepared-turn.test.ts tests/ai/ai-perception.test.ts
  ```
  Expected: the new matrix is green; existing visible-vs-unseen strength tests remain green, proving no omniscient reserve use.

### Task 4: Assign and produce optional support without changing readiness

**Files:**
- Modify: `src/ai/ai-unit-assignment.ts`
- Modify: `src/ai/ai-production.ts` only if an existing residual-demand assumption rejects support slots
- Test: `tests/ai/ai-unit-assignment.test.ts`
- Test: `tests/ai/ai-production.test.ts`
- Test: `tests/ai/ai-major-turn.test.ts`

- [ ] **Step 1: Write assignment tests before implementation.**

  Verify critical role slots are filled first, an optional siege/ranged slot receives a distinct legal unit if available, and its missing count is emitted when absent. Verify the same support deficit feeds an existing production candidate, while no impossible catalog role is demanded. Verify emergency defense still selects ahead of the primary capture plan and a detached/lost support reopens only its support demand.

- [ ] **Step 2: Implement support-slot allocation.**

  Extend the plan-slot builder to append `plan.supportRoles ?? {}` after critical slots, using the existing role order, capacity, recovery, embarked, and active-duty filters. Preserve one-unit/one-slot behavior. Aggregate missing optional slots into the existing `AIForceDemand` records so production needs no parallel queue system.

- [ ] **Step 3: Prove #1124 is untouched.**

  In `ai-major-turn.test.ts`, create a mobilizing capture plan with its critical roles assigned and a missing optional support role. Assert `nextPlanPhase()` advances under the same condition it used before this branch. Separately assert a missing critical role continues to take the current deadline path unchanged. These tests document the boundary; they do not alter `ai-major-turn.ts`.

- [ ] **Step 4: Run the focused suites.**

  Run:
  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-unit-assignment.test.ts tests/ai/ai-production.test.ts tests/ai/ai-major-turn.test.ts
  ```
  Expected: support produces/assigns when possible, remains optional to readiness, and emergency defense priority is preserved.

### Task 5: Prove retained refresh, loss, ownership, deterministic save/reload, and seats

**Files:**
- Modify: `tests/ai/ai-prepared-turn.test.ts`
- Modify: `tests/ai/ai-plan-portfolio.test.ts`
- Modify: `tests/simulation/domination-ai-campaign.test.ts` only if its fixture can host the defended case without weakening it
- Test: `tests/app/simulation-determinism.test.ts` or the existing save/reload test selected by the fixture

- [ ] **Step 1: Add retained-plan and ownership tests.**

  With a matching visible candidate, strengthen then weaken the target and assert the same plan id refreshes both maps; when the city becomes owned by the AI, normal consolidation behavior from #1088 remains; when ownership changes away, no stale support demand remains.

- [ ] **Step 2: Add replacement-demand tests.**

  Remove one assigned frontline after mobilization and assert the next preparation emits missing frontline demand. Independently remove optional support and assert only its support demand reopens. Do not assert a new phase transition here.

- [ ] **Step 3: Add deterministic save/reload and hot-seat tests.**

  Save and normalize while a capture plan is mobilizing with optional support; continue one identical non-human major round from uninterrupted and loaded state and compare via `assertSimulationEquivalent`. Repeat preparation twice from byte-identical state and compare portfolio, demands, and traces. In a two-human-seat fixture, put a defender outside the AI’s visibility and assert neither plan map changes, proving private hot-seat state cannot leak into AI demand.

- [ ] **Step 4: Run the relevant suites.**

  Run:
  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-prepared-turn.test.ts tests/ai/ai-plan-portfolio.test.ts tests/simulation/domination-ai-campaign.test.ts tests/app/simulation-determinism.test.ts
  ```

### Task 6: Review, source checks, performance, and durable acceptance

**Files:**
- Review only: all changed source/tests/docs and generated verification evidence

- [ ] **Step 1: Run source-rule checks and focused performance guard.**

  Run:
  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/core/opponent-ai-state.ts src/ai/ai-objective-scoring.ts src/ai/ai-prepared-turn.ts src/ai/ai-plan-portfolio.ts src/ai/ai-unit-assignment.ts src/ai/ai-production.ts
  bash scripts/run-with-mise.sh yarn test --run tests/perf/algorithmic-budgets.test.ts
  ```
  Expected: no new rule violation; AI-round path/city-yield/clone budgets remain at their current baseline. Do not regenerate a budget merely because it fails.

- [ ] **Step 2: Run current-main long-horizon acceptance exactly as defined.**

  First identify the latest workflow after the final main refresh. Run its focused relevant scenario, then its complete long-horizon command. Do not edit long-horizon scripts, counts, timeouts, generic runtime profiling, or gap registry unless the evidence proves a direct stale entry. Classify every changed campaign observation.

- [ ] **Step 3: Run build and durable suite separately.**

  Run:
  ```bash
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  git diff --check
  git diff --stat origin/main...HEAD
  git diff --stat
  ```
  Inspect the complete committed and uncommitted diff when either stat includes source. Treat an incomplete streamed result as incomplete until durable status proves the current worktree/HEAD passed.

- [ ] **Step 4: Perform the implementation review and fix findings.**

  **perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.**

  Inspect actual code, traces, and tests for each dimension. In particular, reject hidden city/unit reads, demand growth above the documented cap, a support request without a legal producer, multi-role double counting, retained-plan role staleness, accidental deadline changes, support-driven hard waits, loss demand that never reaches a queue, and any hot-seat/save divergence. Fix every real in-scope finding and rerun affected verification.

## Pre-MR review checklist

Before opening the single #1122 MR, repeat the final-main refresh/rebase gate, all affected verification, and this review sentence exactly:

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.**

The MR description must include `Pre-MR inline code review`, the final base SHA, defended/undefended reproduction, first causal root, chosen/rejected designs, perception/difficulty/personality boundaries, save/determinism/hot-seat evidence, performance and long-horizon evidence, every review finding/fix, and a statement that there is no known in-scope defect. Do not begin #1124 until this MR is merged or explicitly abandoned with evidence.

## Escalation conditions

Write `DESIGN ESCALATION REQUIRED` and stop if the RED fixture cannot prove the documented force-demand failure through the real pipeline; if observer-safe city defense facts cannot be projected without an omniscient read; if one optional support map cannot remain additive and load-safe; if support allocation requires a deadline/action-order change; or if the latest long-horizon run demonstrates a broad direct regression that cannot be narrowed to this issue.
