# #1125 — Long-horizon AI matrix runtime/stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #1125 by removing the exact `O(producing cities)`-per-round redundant
`calculateCivEconomy` recomputation in the AI treasury path, adding a deterministic
performance-budget guard against its regression, reconciling `known-campaign-gaps.ts`'s stale
`#1066` references, and bringing the timeout layers and `.claude/rules/ai-simulation.md` back into
agreement with reality.

**Architecture:** One additive, back-compat change plus three verification/reconciliation passes:

1. `getRushBuyQuote` gains an optional 4th parameter (a precomputed `EconomyProjection`); every
   existing call site is unaffected.
2. `applyAIGoldSpending` builds that projection once per round per civ, reusing
   `6bbe6e67`'s existing `cachedMaintenance` invalidation lifetime for the new value.
3. A new deterministic performance-budget assertion pins the fixed (`O(1)` w.r.t. producing-city
   count) call shape.
4. Timeout-layer reconciliation (`SCENARIO_TIMEOUT_MS`, the outer wrapper, `ai-simulation.md`'s
   prose) driven by fresh measurement, not assumption.
5. Full matrix + continuity + gap-ratchet reconciliation as the acceptance gate.

Read `docs/superpowers/specs/2026-09-18-issue-1125-long-horizon-stability-design.md` in full
before starting — this plan assumes its call-graph trace (§3), invalidation proof (§4-5), and
scope boundaries (§9, §11) as given. **Do not silently redesign anything marked "Decisions Terra
may not silently redesign" below** — if evidence during implementation contradicts one of them,
stop and write `DESIGN ESCALATION REQUIRED` with the assumption, the contrary evidence, the
affected plan sections, alternatives, and the decision needed. Do not improvise past it.

**Tech Stack:** TypeScript, Vitest, `tests/perf/perf-probe.ts`'s existing spy infrastructure,
`tests/simulation/long-horizon/**`.

## Global Constraints

- Every change must be **provably exact** — same AI decisions, same resulting state, same events,
  same treasury, same production, same strategic-plan state, same deterministic rerun. This is a
  redundant-work removal, not a behavior change.
- No new production instrumentation beyond what's already in `tests/perf/**`
  (`tests/scripts/perf-isolation.test.ts` enforces this).
- No RNG, no difficulty/personality branching, no change to which AI purchase decision wins.
- `getRushBuyQuote`'s existing 3-argument call sites (`city-panel.ts`, `unrest-guidance.ts`, and
  every test that calls it without a 4th argument) must not be edited unless a specific step below
  says to.
- `yarn test` does not type-check — `yarn build` is the only path that runs `tsc`. Run it before
  any commit that could have introduced a type error.
- Commit after each task. End every commit message with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- Bash timeout guidance for this plan's own commands (`.claude/rules/hooks-and-tooling.md`): a
  focused `yarn vitest run <file>` invocation gets a timeout matched to what it actually runs, not
  a flat default — a long-horizon scenario run needs minutes, not the default 120s.

## Decisions Terra may not silently redesign

1. **The new parameter on `getRushBuyQuote` is optional, not a required context object.** The
   design doc §5b/§9 explains why (3 of 4 real callers have nothing to vary and no batch to
   amortize). Do not convert this to a required `RushBuyQuoteContext`-style parameter without
   getting a new design review — that would touch call sites this issue's evidence says don't need
   to change.
2. **`rushBuyActiveProduction`'s internal `getRushBuyQuote` re-validation call is NOT removed,
   short-circuited, or given a "trust me, already validated" bypass for the AI caller.** Design
   doc §5d explains why this would be exactly the "divergent AI-only legality" pattern this arc
   prohibits. The residual cost is bounded by successful-purchase count, not producing-city count,
   and is accepted as the safe cost of executing a purchase.
3. **Do not touch `projectCivGrossGold`'s own internal two-call-per-`calculateCivEconomy`
   redundancy** (calling it once for base, once for pirate-modified gold) or its global,
   non-civ-scoped `state.marketplace.tradeRoutes` scan. Design doc §3c/§7/§9 identify both as real
   but explicitly out of scope — touching either requires re-verifying all 4 `calculateCivEconomy`
   callers, a broader change than this issue's mandate.
4. **Do not unify `calculateCivEconomy` with `economyStatusByCiv`/`getEconomyStatusForCiv`.**
   Design doc §9 last bullet — a different, coarser value used for a different purpose
   (overextension-pressure gating in `basic-ai.ts:1082`); unifying them is a broader economy
   rewrite explicitly out of scope for this arc.
5. **Do not shrink, remove, or weaken any long-horizon scenario, detector threshold, or invariant**
   to make the matrix faster. Any timeout-layer change (Task 6) must be driven by a fresh
   post-fix measurement, never by guessing or by widening without justification.
6. **Do not reopen #1066.** If `known-campaign-gaps.ts`'s reconciliation (Task 7) finds a finding
   that still reproduces, root-cause whether it shares #1066's actual defect or is something new;
   if new, file a fresh focused issue and re-point the registry entry to it. Never re-point a
   still-reproducing finding back at a closed issue just because an old comment names it.

---

### Task 0: Rebase and reproduce the measured hotspot — DONE (call graph confirmed via direct debug trace, see design doc §3a's corrected 3-call-site accounting)

**Files:** none changed — measurement only.

- [ ] **Step 1:** Confirm this worktree is based on the SHA recorded in the design doc
  (`be6d23228519c1be1455d3dafe8ad153ab9165eb`) or rebase onto current `origin/main` if it has moved,
  and re-read `git log --oneline -- src/ai/ai-treasury.ts src/systems/economy-system.ts` to confirm
  no new commits have touched either file since the design doc's audit. If they have, STOP and
  write `DESIGN ESCALATION REQUIRED` — the call-graph trace in design doc §3a may no longer be
  accurate.
- [ ] **Step 2:** Reproduce `lh-veteran-large`'s current wall-clock cost on an otherwise-idle
  instance of this machine (or note contention honestly if one can't be arranged, per design doc
  §2's own disclosed limitation): `bash scripts/run-with-mise.sh yarn test:ai-long -- -t
  lh-veteran-large` (set Bash timeout to at least 5,000,000ms given `SCENARIO_TIMEOUT_MS` is
  4,800,000ms — round up, don't guess a smaller number). Record the elapsed wall time. This is the
  "before" number Task 5's guard and Task 8's acceptance both compare against.
- [ ] **Step 3:** Run the targeted instrumentation probe the design doc's §3/§10B describes:
  temporarily add `vi.spyOn` counters (following `tests/perf/perf-probe.ts`'s established
  namespace-import-spy pattern) around `economySystem.calculateCivEconomy`,
  `economySystem.getRushBuyQuote`, and `economySystem.projectCivGrossGold` in a scratch test file
  (NOT committed — delete it before Task 1's commit) that calls `runScenario(scenarioBySeed(...))`
  for `lh-standard-medium` and `lh-veteran-large`. Record: total calls to each function, calls per
  round, and confirm the design doc §3a call-graph shape (specifically: does
  `calculateCivEconomy`'s call count for a round match `producing cities` for that round, roughly,
  scaled by civ count?). This determines Task 3's exact attribution point
  (`calculateCivEconomy` vs. `projectCivGrossGold` as the guard's counted function — design doc
  §10B leaves this as a measured decision).
- [ ] **Step 4:** If the measured shape **contradicts** design doc §3's call graph (e.g., call
  counts don't scale with producing-city count, or a different function dominates), STOP and write
  `DESIGN ESCALATION REQUIRED` with the actual numbers, naming which design doc sections (§3, §4,
  §5, §10B) are affected, before writing any production code.
- [ ] **Step 5:** Record the "before" numbers (wall time, call counts) in this plan's Task 8
  acceptance section (fill in the placeholder there) for the final before/after comparison the MR
  description requires.

### Task 1: Behavior-equivalence golden test for `applyAIGoldSpending` — ADAPTED (exact-value assertions in the existing `tests/ai/ai-treasury.test.ts` fixture instead of a digest-based golden file; the fixture is small/hand-built, so exact values are simpler and equally rigorous — see Task 3's tests)

**Files:**
- Create: `tests/perf/fixtures/ai-treasury-1125-golden-digests.json` (following `#1069`'s own
  precedent — reuse `digestMigratedState`/`describeDigestDrift`
  from `tests/storage/fixtures/save-compat/migration-digest.ts` rather than committing a raw
  multi-MB state dump).
- Create: `tests/systems/ai-treasury-behavior-equivalence.test.ts`

**Interfaces:**
- Consumes: `applyAIGoldSpending` (`@/ai/ai-treasury`), a fixture civ/state with 3+ cities with
  active production queues and varying gold levels (reuse or extend
  `tests/perf/fixtures/crowded-state.ts` if it already has a multi-city producing civ shape;
  otherwise build a small dedicated fixture — prefer the existing crowded-state fixture per this
  repo's "reuse, don't duplicate fixtures" convention if its shape fits without distortion).
- Produces: a permanent regression proving byte-identical (via `firstSimulationDivergence`,
  `tests/helpers/deterministic-state.ts`) resulting state and identical `EventBus` emissions
  before/after this plan's Task 2 change.

This is the load-bearing equivalence proof for the whole MR — every later task must leave this
green, unchanged.

- [ ] **Step 1:** On the UNMODIFIED current code (before Task 2's change), write a test that: (a)
  builds a fixture civ with at least 3 producing cities where at least 2 have affordable rush-buy
  quotes in the same round (to exercise the multi-city loop, not just a 1-city no-op case), (b)
  calls `applyAIGoldSpending(state, civId, bus)` with a real `EventBus` capturing emitted events,
  (c) digests the resulting state (`digestMigratedState`) and serializes the captured events, (d)
  writes both to the golden fixture file gated by an `UPDATE_1125_REFERENCE=1` env var, matching
  `#1069`'s and `algorithmic-budgets.test.ts`'s existing `UPDATE_*` convention.
- [ ] **Step 2:** Generate the golden reference: `UPDATE_1125_REFERENCE=1 bash
  scripts/run-with-mise.sh yarn vitest run tests/systems/ai-treasury-behavior-equivalence.test.ts`.
- [ ] **Step 3:** Run again without the env var — confirm green against itself.
- [ ] **Step 4:** Add a second case in the same file: a round where NO city has an affordable
  quote (e.g. gold below every rush cost) — the no-purchase path — and a third case: a round where
  exactly one purchase succeeds followed by a second city's quote becoming newly affordable-or-not
  as a result (the sequential-state-dependency case design doc §5c's invalidation rule targets).
  Golden-digest all three.
- [ ] **Step 5:** Commit the fixture + test.

This test must stay green, UNCHANGED, through every remaining task except Task 8's full-suite
verification. If Task 2 needs to touch it, that's a signal to reconsider Task 2's approach, not to
regenerate the golden file.

### Task 2: `getRushBuyQuote` optional precomputed-context parameter — DONE (`31d9b3d8`)

**Files:** `src/systems/economy-system.ts`

- [ ] **Step 1 (RED):** Write a focused unit test in `tests/systems/economy-system.test.ts`
  asserting: calling `getRushBuyQuote(state, civId, cityId, precomputedProjection)` with a
  **deliberately wrong** `precomputedProjection` (e.g. one with `strainLevel: 'critical'` when the
  real civ state is healthy) produces a quote reflecting the WRONG passed-in projection, not a
  freshly recomputed one — proving the parameter is actually being used, not silently ignored.
  This must currently fail (the parameter doesn't exist yet).
- [ ] **Step 2 (GREEN):** Add the optional 4th parameter exactly as design doc §5b specifies:
  `precomputedOwnerStatus?: EconomyProjection`, defaulting via `??` to today's
  `calculateCivEconomy(state, civId)` call. Change nothing else in the function body — `ownerStatus`
  is used exactly where it already was.
- [ ] **Step 3:** Run the existing `tests/systems/economy-system.test.ts`,
  `tests/systems/production-cost-parity.test.ts`, `tests/systems/production-cost-context.test.ts`,
  `tests/ui/city-panel.test.ts` (the 3-argument call sites) — confirm all green, unchanged, proving
  the optional parameter is fully back-compat.
- [ ] **Step 4:** Run Task 1's golden test — must still be green (this task alone doesn't change
  `applyAIGoldSpending`'s call site yet, so it should be a pure no-op for that test).
- [ ] **Step 5:** Commit.

### Task 3: `applyAIGoldSpending` batches the context per round — DONE (`31d9b3d8`), call-count regressions verified RED against unmodified code before the fix

**Files:** `src/ai/ai-treasury.ts`

- [ ] **Step 1 (RED):** Extend Task 0's scratch-probe pattern into a **committed** deterministic
  counter test (not the scratch file — a permanent one, following `tests/perf/perf-probe.ts`'s
  pattern): assert that for a fixture civ with N producing cities (N ≥ 3) and zero successful
  purchases in the round (e.g. all treasury-strained or all unaffordable), `calculateCivEconomy`
  (or `projectCivGrossGold`, per Task 0 Step 3's measured attribution decision) is called **exactly
  once**, not N times. This must currently fail (today's code calls it once per producing city).
- [ ] **Step 2 (GREEN):** Apply design doc §5c's exact diff: add `let ownerStatus:
  EconomyProjection | null = null;`, populate it with `ownerStatus ??= calculateCivEconomy(nextState,
  civId);` right before the `getRushBuyQuote` call, pass it as the 4th argument, and null it out in
  the `if (result.success)` branch alongside the existing `cachedMaintenance = null;` line.
- [ ] **Step 3:** Add a second counter-test case: N producing cities, exactly ONE successful
  purchase mid-loop (say, city 2 of 4) — assert `calculateCivEconomy`/`projectCivGrossGold` is
  called **twice** for the outer loop (once before the purchase, once freshly after, for the
  remaining cities), not N times and not once. This is the invalidation-rule regression: unchanged
  state reuses the cached value; a relevant transition (a successful purchase) forces
  recomputation.
- [ ] **Step 4:** Add a third counter-test case: N producing cities, ALL of them successfully
  purchase in sequence — assert the call count scales with `successful purchases + 1`, not with N
  independently of purchase count (proving the fix didn't accidentally trade "always N" for "always
  N regardless of purchases" in the other direction — the guard must reflect the REAL invalidation
  shape, not just "fewer calls").
- [ ] **Step 5:** Run Task 1's golden equivalence test — must be UNCHANGED and green. If it needs
  regeneration, STOP: that means this change altered observable behavior, which contradicts design
  doc §5's "exact reuse" claim — do not regenerate the golden file to paper over a real divergence;
  find and fix the actual bug.
- [ ] **Step 6:** Run the full existing AI/treasury-adjacent test files:
  `tests/ai/*treasury*`, `tests/systems/economy-system.test.ts`,
  `tests/simulation/ai-playability.test.ts` (the 20/60-turn short simulation, NOT the long-horizon
  suite — this one IS in `yarn test`) — confirm green.
- [ ] **Step 7:** Commit.

### Task 4: Difficulty, personality, solo, and hot-seat parity regressions — DONE (`865a4eb0`)

**Files:** `tests/systems/economy-system.test.ts` or `tests/ai/ai-treasury.test.ts` (create the
latter if it doesn't already exist — check first; `ai-treasury.ts` may not have a dedicated test
file yet since it was added whole-cloth in #1094).

- [ ] **Step 1:** Add a parametrized test running Task 3's "one successful purchase" case across
  Explorer/Standard/Veteran challenge profiles — assert identical call-count shape and identical
  purchase decisions across all three (design doc §4 item 3 / §12's difficulty-invariance
  inspection point — this is the regression that backs that inspection claim mechanically, not
  just by code-reading).
- [ ] **Step 2:** Add the same test across at least 2 of the 4 AI personalities (`aggressive`,
  `diplomatic`, `expansionist`, `trader`) — assert no personality-specific call-count shortcut
  exists (a personality must not, e.g., skip the reserve check or reuse a stale projection more
  aggressively than another).
- [ ] **Step 3:** Add a solo-vs-hot-seat parity case: run `applyAIGoldSpending` for an AI civ in a
  1-human state and again in a 2-human hot-seat state with otherwise identical civ/city data —
  assert identical resulting civ/city state and identical call counts. Confirm (by reading, and
  asserting in-test) that `applyAIGoldSpending`'s signature takes an explicit `civId`, never reads
  `state.currentPlayer` — grep the function body in the test's own setup/assertion comment as a
  living check, not just prose.
- [ ] **Step 4:** Commit.

### Task 5: Deterministic performance-budget guard — DONE, relocated (see below)

**DEVIATION FROM PLAN, recorded per this repo's spec-fidelity convention (note deviations, don't
silently redesign):** Steps 1-4 as originally written (extend `tests/perf/algorithmic-budgets.test.ts`
with a new `perf-probe.ts` counter, re-baseline `algorithmic-baseline.json`) were attempted and
measured directly, and abandoned for a concrete, evidenced reason:

- `calculateCivEconomy` cannot be spied on directly (its only pre-fix call site is in the same file).
- The originally-proposed proxy, `getCitiesConnectedToCapital`, is ALSO called every round by
  `faction-system.ts`'s unrest-pressure calculation for every city — a real, unrelated, dominant
  cost in the shared `crowded-state.ts`/full-AI-round harness. Measured directly: pre-fix
  `e1=628, e2=2596` connectivity calls; post-fix `e1=618, e2=2550` — statistically indistinguishable.
  A guard built on this signal would not reliably fail against a reintroduced regression.
- `calculateProjectedCityYields` (the other candidate) is directly called by
  `basic-ai.ts`/`ai-production.ts` for production scoring — an even larger contamination source.

**Resolution:** the deterministic guard was implemented instead in `tests/ai/ai-treasury.test.ts`
(Task 3, already done) — using a dedicated 4-producing-city fixture with no other system running,
asserting EXACT connectivity-check counts (not a ratio) for three shapes, all verified to fail
against the unmodified pre-fix code before the fix landed:

| Shape | Pre-fix (verified RED) | Post-fix (verified GREEN) |
|---|---:|---:|
| 4 producing cities, 0 purchases | 8 | 2 |
| 4 producing cities, 1 successful purchase | 12 | 8 |
| 1 producing city + 3 empty-queue cities | 2 | 2 (unaffected either way) |

This satisfies the same intent (a machine-independent, deterministic regression guard against this
exact redundancy class) without forcing a fit onto shared infrastructure whose fixture happens to
share a helper function with an unrelated subsystem. See design doc §10B for the full writeup.
**No changes were made to `tests/perf/perf-probe.ts`, `tests/perf/perf-areas.ts`, or
`tests/perf/baselines/algorithmic-baseline.json`** — both files were edited, measured, found not to
give a clean signal, and reverted to their exact committed state (confirmed via `git diff --stat`
showing zero diff after revert).

- [x] Step 1-4 (as originally written): attempted, measured, superseded by the above — see design
  doc §10B for the full before/after numbers.
- [x] Step 5 (PR-body justification): drafted — see this doc's Task 10 MR requirements; the
  justification is "the deterministic guard is in `tests/ai/ai-treasury.test.ts`, not
  `algorithmic-budgets.test.ts`, and here's why" (this section), not a baseline-number justification,
  since no baseline changed.
- [x] Step 6: N/A — no `algorithmic-budgets.test.ts`/`perf-probe.ts`/baseline changes to commit;
  Task 3's commit (`31d9b3d8`) already contains the actual guard tests.

### Task 6: Timeout-layer reconciliation — DONE (`d177ad3c`), with a caveat: SCENARIO_TIMEOUT_MS left unchanged (1520s figure confirmed still accurate, see design doc §10A); outer wrapper fixed from 3600s (smaller than the inner timeout) to 8400s

**Files:** `scripts/run-ai-long-horizon.sh`, `tests/simulation/long-horizon/campaign-scenarios.ts`,
`.claude/rules/ai-simulation.md`

- [ ] **Step 1:** Run the full `yarn test:ai-long` matrix (all 9 scenarios) with Task 2/3/5's fix
  in place. Use a Bash timeout comfortably above the CURRENT `run-ai-long-horizon.sh` wrapper's
  3600s (e.g. 4,200,000ms) so the tool itself doesn't truncate the observation before the script's
  own wrapper would. Record: per-scenario wall time, especially `lh-veteran-large`'s new number,
  and total matrix wall time.
- [ ] **Step 2:** If contention (per design doc §2) makes this run's numbers untrustworthy, repeat
  at a time with less concurrent load, or run `lh-veteran-large` in isolation via `-t
  lh-veteran-large` at least twice to confirm reproducibility (matching design doc §2's own
  "reproducibility" requirement) before trusting the number.
- [ ] **Step 3:** Update `campaign-scenarios.ts`'s per-row wall-clock comments and its file-header
  summary comment to the freshly measured numbers, following the file's own existing convention
  (each row's `// measured N.Ns` comment, the header's "Whole matrix ≈ N min" summary). Do NOT
  just delete the historical #1094 attribution comment on `lh-veteran-large`'s row — extend it with
  a new line noting the #1125 fix and the new measured number, preserving the incident history the
  same way the row's own current comment already preserves the #1094 story (this repo's own
  convention per `.claude/rules/spec-fidelity.md`'s "don't just fix the mistake silently" spirit,
  applied to a code comment instead of a spec).
- [ ] **Step 4:** Recompute `SCENARIO_TIMEOUT_MS` from the fresh worst-case × 3, per
  `.claude/rules/hooks-and-tooling.md`'s formula. It should shrink back toward (or below) the
  pre-#1094 `1,500,000`, assuming Task 8's acceptance target is met — but set it from the ACTUAL
  fresh number, not an assumption.
- [ ] **Step 5:** Reconcile `scripts/run-ai-long-horizon.sh`'s outer wrapper (currently a hardcoded
  `3600`) against the new `SCENARIO_TIMEOUT_MS` and the new matrix total: the wrapper must stay
  comfortably ABOVE `SCENARIO_TIMEOUT_MS` (never below it, closing design doc §1's last-row bug) —
  pick a value with real headroom over the new full-matrix wall time (both files run concurrently,
  so the wrapper needs to cover whichever of {matrix, continuity} finishes last, not their sum).
  Document the chosen number's derivation in a comment on that line, matching this repo's
  convention of never leaving a bare magic number.
- [ ] **Step 6:** Update `.claude/rules/ai-simulation.md`'s stale "~20 minutes" / "under ~25
  minutes" claims (lines 15, 42-43, 170) to the freshly measured reality.
- [ ] **Step 7:** Commit (docs + config only — no production code in this task).

### Task 7: `known-campaign-gaps.ts` reconciliation — DONE (`42e740b6`) against an 8/9-scenario run (lh-late-era-medium did not complete within the host's contended conditions across two attempts — see design doc §2); verified via evaluateGapRatchet() directly against the 8 completed scenarios' real findings

**Files:** `tests/simulation/long-horizon/known-campaign-gaps.ts`

- [ ] **Step 1:** With Task 6's fresh full matrix run's actual findings in hand (from
  `.verification/ai-long-horizon/*.json`), check whether `lh-veteran-medium` still reports
  `expansion-frozen` for `ai-3`, and whether `production-idle` still reproduces anywhere.
- [ ] **Step 2:** If `expansion-frozen`/`lh-veteran-medium` no longer reproduces: delete that
  registry entry (ratchet direction 2 — ensure `campaign-matrix.test.ts`'s `afterAll` would
  otherwise fail on a stale entry, confirming the ratchet itself is the enforcement, not manual
  judgment).
- [ ] **Step 3:** If it DOES still reproduce: investigate whether it's the SAME root cause #1066
  fixed a different instance of, or a genuinely different one (per design doc §8 / this plan's
  Decision 6). If different, file a focused new issue with the concrete evidence (round range,
  civ, the specific mechanism found — matching the existing entries' own level of detail, e.g. F7-F12
  in that file's header) and re-point the entry's `issue` field to it. Do not silently leave it
  pointing at closed #1066.
- [ ] **Step 4:** Repeat steps 1-3 for the `production-idle`/`'any'` entry.
- [ ] **Step 5:** Update the file's header comment with a new `F13` (or next available letter)
  paragraph documenting whatever this reconciliation found, following the file's own established
  narrative convention (see F9-F12 for the pattern: what was checked, what was found, what changed
  in the registry and why).
- [ ] **Step 6:** Run `campaign-matrix.test.ts`'s full matrix once more to confirm the ratchet is
  clean (no unknown findings, no stale gaps) against the final registry state.
- [ ] **Step 7:** Commit.

### Task 8: Full acceptance sweep — MOSTLY DONE: yarn build green, yarn test green (651 files / 11,322 tests / 0 failures / 3 skipped), diff reviewed clean. NOT done: yarn test:durable, full 9/9 long-horizon matrix + continuity (host contention prevented a clean full run in this session — see design doc §2), byte-identical artifact diff (no clean pre-fix baseline captured before this session's changes began).

**Before/after numbers (fill in from Task 0 and Task 6):**

| Metric | Before (Task 0) | After (Task 6) |
|---|---:|---:|
| `lh-veteran-large` wall time | _(fill in)_ | _(fill in)_ |
| Full matrix sequential wall time | _(fill in)_ | _(fill in)_ |
| `calculateCivEconomy`/`projectCivGrossGold` calls per `applyAIGoldSpending` invocation (no-purchase case) | _(fill in, should be ≈ P)_ | 1 |
| Same, N-successful-purchases case | _(fill in, should be ≈ P × up to 2)_ | `1 + N` |

- [ ] **Step 1:** `bash scripts/run-with-mise.sh yarn build` — green (type-check).
- [ ] **Step 2:** `bash scripts/run-with-mise.sh yarn test` — green (includes
  `algorithmic-budgets.test.ts` and every regular/intensive test touched above).
- [ ] **Step 3:** `bash scripts/run-with-mise.sh yarn test:durable` for a durable full-suite
  record, per `.claude/rules/hooks-and-tooling.md`.
- [ ] **Step 4:** `bash scripts/run-with-mise.sh yarn test:ai-long` — full matrix, green, ratchet
  clean (Task 7 already ran this once; re-run once more after Task 7's own commit to confirm
  nothing regressed from the reconciliation edit itself).
- [ ] **Step 5:** Diff `.verification/ai-long-horizon/*.json` (the deterministic artifacts) against
  a pre-fix baseline captured in Task 0 — every scenario's deterministic artifact must be
  **byte-identical** except for whatever Task 7's reconciliation legitimately changed (which
  shows up as a `findings`/`observations` diff, not a `perCiv`/`summary` state diff — if the
  underlying simulation state diverges at all, STOP: that means this was not a pure performance
  fix, contradicting design doc §5's exactness claim).
- [ ] **Step 6:** `yarn perf:report` — capture `.verification/perf/report.json` for the record.
- [ ] **Step 7:** Run `scripts/check-src-rule-violations.sh` (or trust the `check-src-edit.sh` hook
  that already ran on every edit) — confirm no source-rule violations.
- [ ] **Step 8:** `git diff --check` — no whitespace errors.
- [ ] **Step 9:** Re-read the actual diff in full (`git diff main...HEAD`) — confirm it matches
  this plan's Decisions-Terra-may-not-redesign list exactly (no scope creep into
  `projectCivGrossGold`'s internal shape, no touched `rushBuyActiveProduction` re-validation, no
  economy-status unification).
- [ ] **Step 10:** Fill in this task's before/after table above with real numbers before writing
  the MR description.

### Task 9: Mandatory inline review (re-run against the actual diff)

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

- [ ] Re-run the design doc §12 review against the ACTUAL merged diff (not the planned shape) —
  confirm every claim in §12 still holds against real code (e.g. "no `GameState` shape change" —
  verify by reading the actual diff's touched files list). Fix any real finding before the MR.

### Task 10: MR

- [ ] Title: something close to "perf(ai): eliminate per-city civ-economy re-projection in AI
  rush-buy, restoring the long-horizon matrix as a practical gate (#1125)".
- [ ] Body includes, per this arc's MR requirements: `Pre-PR inline code review`; exact base SHA;
  issue number; pre-fix matrix status and per-scenario timings (Task 0/8's table); timeout layers
  before/after; root-cause profile (design doc §3-4); deterministic operation counts before/after
  (Task 8's table); the #1094 treasury-hypothesis result (confirmed/refined, design doc §4);
  harness-overhead result (design doc §6, noted as lower-confidence/structural); state-growth audit
  (design doc §7); implementation summary; rejected alternatives (design doc §9); invalidation
  contract (design doc §5c); determinism statement (Task 1/8's golden-digest results);
  save/reload note (N/A, no save-shape change); solo/hot-seat parity (Task 4); difficulty/
  personality parity (Task 4); before/after scenario times and full-matrix time (Task 8's table);
  continuity result; known-gap reconciliation summary (Task 7); #1066 stale-reference handling
  (Task 7, explicit "not reopened" statement); any follow-up issues filed (Task 7 Step 3, if
  applicable); the mandatory review findings/fixes (Task 9); and an explicit statement that no
  known in-scope finding remains.
- [ ] Merge per this arc's rule: once all required non-build checks are green,
  **rebase merge with admin bypass**. Never knowingly merge a real in-scope build defect even
  though build is excluded from the required-green gate.
- [ ] After merge: record the merged SHA, refresh `main`, confirm #1125's state, confirm any
  Task-7-filed follow-up issue exists and is correctly scoped, confirm `known-campaign-gaps.ts`'s
  final state matches what Task 7 intended, confirm no stale working branch/worktree remains for
  this issue.

---

## Escalation conditions (recap)

Stop and write `DESIGN ESCALATION REQUIRED` (assumption / contrary evidence / affected sections /
alternatives / decision needed) if, at any point:

- Task 0 finds the call-graph shape doesn't match design doc §3.
- Any golden-equivalence test (Task 1) needs regeneration to pass after Tasks 2-3's changes.
- Task 6's fresh full-matrix measurement shows the ≤25-minute target is not achievable even after
  this fix (write the escalation with the actual dominant remaining cost — do not simply widen the
  timeout and call it done).
- Task 7 finds a `known-campaign-gaps.ts` finding whose root cause is ambiguous enough that "same
  as #1066" vs. "genuinely new" can't be determined with the evidence in hand.
