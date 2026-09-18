# #1088 — AI Military Operations Competence (Implementation Plan)

Companion to `docs/superpowers/specs/2026-09-18-issue-1088-military-operations-competence-design.md`
(read that first — it has the full reproduction, trace, and rationale this plan assumes).

**Base SHA to rebase onto:** latest `origin/main` at implementation time. Design was
written against `871f64aa515ffa677ba13b7923fcf6082f5806d8`; re-confirm the reproduction
still fails for the same reason before writing any fix (arc rule: "Confirm the chosen
reproduction still fails for the same reason").

## Scope boundary (do not exceed)

Fix **only** finding 1 from the design's §16 table: a `consolidating`-phase plan cannot
survive past the round it entered that phase. Do **not** touch:
- `objectiveCandidates()`'s `requiredRoles` for `capture` (finding 2/§6).
- `ai-tactics.ts`'s `rankCapture`/`rankAttacks`/bombardment sequencing (finding 3).
- `nextPlanPhase`'s `mobilizing → advancing` deadline gate (finding 4/§5).
- Anything under `#1086`/`#1087`/`#1089`/`#1090`.

If, during implementation, evidence emerges that finding 1 cannot be fixed without also
touching one of the above, STOP and escalate rather than silently broadening scope (see
"Escalation conditions" at the end of this plan).

## Expected files

| File | Change |
|---|---|
| `src/ai/ai-plan-portfolio.ts` | `currentPlanIsValid` gains a consolidating-and-still-owned exemption from the opportunity-candidate requirement; `selectPrimaryPlan` passes through the extra context needed to evaluate it, and must ALSO bypass its own switching-bonus score comparison for an exempted plan (a consolidating plan has no candidate score to compare, so the plain score-comparison branch always lost to any scored alternative — found during implementation, not anticipated by this plan's original sketch). |
| `src/ai/ai-prepared-turn.ts` | `prepareMajorCivStrategicPlan` populates the new `ownedCityIds` context field from `perception.ownCities` (already computed — zero new perception cost). |
| `src/ai/ai-round-scheduler.ts` | **Found during implementation, not in the original plan**: `revalidatePreparedPlan`'s `planTargetIsStale` has the identical bug at a second site — it runs after planning but before execution and independently treats "capture objective, city now owned" as always-stale, wiping the just-retained plan again. Needs the same `phase !== 'consolidating'` exemption. Without this, the design's §17 fix alone causes `domination-ai-campaign.test.ts` to stop winning within its round cap — confirmed by direct integration-test regression during implementation. |
| `tests/ai/ai-plan-portfolio.test.ts` | New `describe` block covering the fix (RED → GREEN) plus negative/boundary cases. |
| `tests/ai/ai-round-scheduler.test.ts` | New tests covering the second site: a consolidating plan against an owned target survives revalidation; a non-consolidating plan against an owned target is still correctly wiped (regression guard). |
| `tests/simulation/domination-ai-campaign.test.ts` | No code change expected, but re-run as an integration check (§ Verification) — it already exercises a real multi-capture campaign and should keep passing byte-for-byte on its determinism assertions. |
| `tests/simulation/long-horizon/known-campaign-gaps.ts` | Only touched if `yarn test:ai-long` surfaces a new named finding directly attributable to this change (unlikely per design §15) — do not touch speculatively. |

## Exact seam

`src/ai/ai-plan-portfolio.ts`:

- `currentPlanIsValid(plan, candidate, turn)` (currently 3 params) needs a fourth signal:
  whether `plan`'s target city is still owned by `context.actorId`. Do not import
  `GameState` into this file to compute it (it currently takes no state at all beyond
  plain values) — thread it in as a plain boolean computed by the caller instead, e.g.
  `currentPlanIsValid(current, currentCandidate, context.turn, isConsolidatingTargetOwned(context, current))`,
  where `isConsolidatingTargetOwned` is a small local helper:

  ```ts
  function isConsolidatingTargetOwned(
    context: AIPortfolioContext,
    plan: AIStrategicPlan,
  ): boolean {
    // AIPortfolioContext does not carry city ownership today -- check what it DOES
    // carry before adding a new field. If `cityThreats`/`candidates` don't expose it,
    // the cheapest option that avoids a new GameState import is adding a single
    // `ownedCityIds: ReadonlySet<string>` (or similar minimal projection) to
    // `AIPortfolioContext`, populated by prepareMajorCivStrategicPlan's caller
    // (`ai-prepared-turn.ts`) from `perception.ownCities` (ALREADY COMPUTED, not a
    // new read -- see ai-prepared-turn.ts's `perception` variable). Prefer this over
    // importing GameState into ai-plan-portfolio.ts, which currently has zero
    // GameState dependency and should stay that way (it's a pure planning-math
    // module, unit-tested without any fixture heavier than plain objects -- see the
    // existing test file's fixtures).
    return plan.target.kind === 'city' && context.ownedCityIds.has(plan.target.id);
  }
  ```

  Concretely: add `ownedCityIds: ReadonlySet<string>` to `AIPortfolioContext`
  (`ai-plan-portfolio.ts`'s existing interface), populate it in
  `prepareMajorCivStrategicPlan` (`ai-prepared-turn.ts`) from
  `new Set(perception.ownCities.map(c => c.id))` — `perception` is already built there
  before `refreshMajorCivPortfolio` is called, so this is a zero-cost addition, not a
  new perception build.

- `currentPlanIsValid`'s body: see design §17's sketch. Implement exactly that logic;
  do not add extra conditions beyond what's written there without a demonstrated need.

## Behavior contract

1. A `primaryPlan` in `phase === 'consolidating'` whose `target.kind === 'city'` and
   whose target city is still owned by `context.actorId` is **retained** as
   `primaryPlan` on the next `selectPrimaryPlan` call, even when no matching
   `AIPlanCandidate` exists in `context.candidates` for it.
2. All other existing `currentPlanIsValid` checks (loss-ratio cap, `expiresAfterTurn`,
   stalled-past-reconsideration) continue to apply to a retained consolidating plan.
3. A consolidating plan whose target city is **no longer owned** by the actor (lost to
   recapture) is **not** exempted — falls through to the ordinary candidate-matching
   path (which will correctly treat the city as capturable again if a fresh `capture`
   candidate exists for it, since `city.owner !== civId` is true again).
4. Once `nextPlanPhase` (unchanged, `ai-major-turn.ts`) transitions the retained plan to
   `'complete'` (its own existing 2-turn/no-counterattack rule), the **next**
   `selectPrimaryPlan` call no longer exempts it (phase is no longer `'consolidating'`)
   and it is replaced normally.
5. `assignUnitsToPortfolio`/tactical execution are **unchanged** — the fix's only
   effect is that the *same* plan object survives to be assigned to and executed
   against for more than one round.

## TDD order

### RED — focused reproduction of the exact failure

In `tests/ai/ai-plan-portfolio.test.ts`, add (near the existing `describe('major-
civilization plan portfolios', ...)` block, following its existing fixture-building
style — read the file's top ~70 lines first for the shared fixture helpers before
writing this):

```ts
it('retains a consolidating capture plan into a second round with no matching candidate (#1088)', () => {
  // Build a portfolio whose primaryPlan is phase: 'consolidating', objective:
  // 'capture', target: { kind: 'city', id: 'city-captured' } -- mirroring the real
  // shape nextPlanPhase produces the round a capture-city action lands.
  // Build a context whose `candidates` array has NO entry for that city (matching
  // objectiveCandidates()'s real behavior: a city you own never produces a capture
  // candidate) but DOES have a higher-scoring candidate for a different target
  // (e.g. a second capture opportunity), so the bug (pre-fix) picks the new one.
  // Assert: refreshMajorCivPortfolio(...).portfolio.primaryPlan?.id === the ORIGINAL
  // plan's id, phase still 'consolidating', target unchanged.
});
```

Run it (`yarn vitest run tests/ai/ai-plan-portfolio.test.ts`), confirm it fails **for
the reason described** (primaryPlan becomes the new candidate's plan, not the retained
one) — not for an unrelated fixture-construction error. This is the RED step.

### GREEN — minimum fix

Implement exactly the seam described above. Re-run the same test; confirm it passes.

### Negative / boundary / interruption / loss / difficulty / save coverage

Add each as its own `it(...)` in the same file (or `ai-major-turn.test.ts` where the
scenario needs `nextPlanPhase`/`processMajorCivStrategicTurn`, not just
`refreshMajorCivPortfolio` in isolation):

1. **Positive competence failure (pre-fix reproduction)** — the RED test above, kept as
   a permanent regression (post-fix it is GREEN and asserts the correct behavior).
2. **Healthy successful operation** — a plan that captures and then, with no rival
   candidate at all (`context.candidates = []`), still correctly reaches `'complete'`
   after `nextPlanPhase`'s 2-turn rule once `hasVisibleLocalCounterattack` is false.
   This exercises the previously-dead code path end-to-end for the first time — put
   this one in `ai-major-turn.test.ts` (it needs the real `nextPlanPhase` transition,
   not just portfolio retention) or as an integration-style test driving both files if
   `ai-plan-portfolio.test.ts`'s existing fixtures make that awkward.
3. **Missing required role** — not applicable to this specific fix (§ scope boundary:
   `requiredRoles` behavior for `capture` is unchanged) — skip, note why in a comment
   if a reviewer expects this row from the arc's generic checklist.
4. **Role becomes available later** — same as above, not applicable to this narrow fix;
   skip with the same justification.
5. **Unit loss during operation** — a consolidating plan whose assigned unit dies
   (city recaptured by a counterattack that kills the garrison) must fall through to
   the "no longer owned" branch (case 3 in the behavior contract above) rather than
   getting stuck retaining a plan for a city it no longer holds. Add this as an
   explicit test: `ownedCityIds` does NOT include the target city → plan not
   exempted → falls through to normal candidate matching.
6. **Assignment reclaimed or replaced correctly** — verify via
   `assignUnitsToPortfolio` (existing, unmodified function) that the retained
   consolidating plan still gets units assigned to it normally on the next round
   (no special-casing needed there — confirm by a targeted assertion, not a new
   production code path).
7. **Emergency defense interruption** — per design §8 and the arc's mandatory §10: an
   explicit test where (a) `ai-1` has a consolidating primary plan with 2 assigned
   tanks, (b) a `defensePlansByCityId` entry appears for a *different*, threatened
   city, (c) `assignUnitsToPortfolio` still lets the defense plan take a unit ahead of
   the consolidating primary plan (existing priority ordering, unmodified) — assert the
   consolidating plan is NOT corrupted (still retained, `assignedUnitIds` reflects only
   what's left) and the defense plan is funded. This is the arc's explicit mandatory
   test (§10 in the source prompt) — do not skip it.
8. **Target invalidation** — city recaptured by a THIRD party (not the original owner)
   mid-consolidation: still falls through correctly (case 3), same test shape as #5.
9. **Low/high urgency** — not a distinct axis for this fix (no urgency input exists in
   `currentPlanIsValid`); skip with justification, same as #3/#4.
10. **Difficulty boundary** — a test running the same consolidating-retention scenario
    under Explorer and Veteran (`opponentChallenge` on the state/context) and asserting
    IDENTICAL retention behavior (per design §10 — difficulty-invariant). This
    positively proves the "no structural incompetence gated by difficulty" contract.
11. **Personality parity** — two civs, same battlefield/challenge, different
    `PersonalityTraits`, identical consolidating-retention outcome. Per design §11.
12. **No hidden-information dependence** — the retention check only reads
    `plan.target`/`plan.phase` and `ownedCityIds` (derived from `perception.ownCities`,
    already-legal knowledge) — no new test needed beyond confirming
    `isConsolidatingTargetOwned` never reads anything outside `AIPortfolioContext`;
    a source-level check (grep) suffices, called out explicitly in the PR body rather
    than as a separate test.
13. **Deterministic repeated run** — run `refreshMajorCivPortfolio` twice with
    byte-identical inputs, assert byte-identical output (standard pattern already used
    elsewhere in this test file — e.g. the "uses deterministic plan IDs" test — mirror
    it).
14. **Save/reload during the affected phase** — extend
    `tests/simulation/domination-ai-campaign.test.ts`'s existing save/reload assertion
    (it already does a `SAVE_ROUND` reload) OR add a focused test in
    `tests/ai/ai-round-scheduler.test.ts`/`tests/storage/` confirming a state whose
    `primaryPlan.phase === 'consolidating'` round-trips through
    `serializeSaveFile`/`parseSaveFile`/`normalizeLoadedState` with the plan intact and
    behaves identically pre/post reload on the next `processNonHumanMajorRound` call.
    Prefer extending the existing domination campaign test's coverage over adding a new
    file if it fits naturally.
15. **Post-capture behavior** — this IS what the fix changes; covered by #2 and the
    integration re-run below.
16. **Solo/hot-seat** — `selectPrimaryPlan`/`currentPlanIsValid` have no `hotSeat` input
    (design §"Proper implementation" review finding); confirm by grep, not a new test,
    UNLESS the integration re-run of `domination-ai-campaign.test.ts` (hot-seat-capable
    fixture) shows a divergence — it should not.

## Integration re-verification

After the unit-level tests are green, re-run:

```
bash scripts/run-with-mise.sh yarn vitest run tests/simulation/domination-ai-campaign.test.ts
```

Regenerate the temporary trace fixture used to produce design §2's log (recipe: copy
`domination-ai-campaign.test.ts`'s `campaignStart()`/fixture helpers into a scratch test
file — do not commit it — replace the assertions with `console.log` of
`state.opponentAI.majorCivs['ai-1'].primaryPlan` each round for ~15 rounds, run via
`bash scripts/run-with-mise.sh yarn vitest run <scratch file> --reporter=verbose`,
delete the scratch file when done). Confirm the R5→R6 pattern from design §2 no longer
occurs: the plan targeting `city-5` should now persist through `consolidating` for at
least the 2-round completion window (unless a real counterattack is present in the
fixture, which it is not), and city-5 should show a nonzero `assignedUnitIds` count
through that window instead of zero.

## Targeted suites to run during iteration

```
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-plan-portfolio.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-major-turn.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-prepared-turn.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-unit-assignment.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-round-scheduler.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/simulation/domination-ai-campaign.test.ts
```

Do not run the full suite after every edit — reserve `yarn test`/`yarn test:durable`
for final verification (per `.claude/rules/hooks-and-tooling.md`).

## Long-horizon acceptance

1. Run a focused relevant scenario first, not the full matrix:
   ```
   bash scripts/run-with-mise.sh yarn vitest run tests/simulation/long-horizon/campaign-matrix.test.ts -t "lh-veteran-medium"
   ```
   (or the closest equivalent focused invocation the harness supports — check
   `scripts/run-ai-long-horizon.sh` for how to scope to one scenario before falling
   back to the full run).
2. Only after that proves the mechanism doesn't regress, run the full matrix:
   ```
   bash scripts/run-with-mise.sh yarn test:ai-long
   ```
3. Diff `.verification/ai-long-horizon/*.json` against a pre-fix baseline run on the
   same commit range. Per design §15, expect no new named finding directly caused by
   this change; if one appears, classify it per the arc's rules (caused regression /
   newly exposed pre-existing defect / healthy trajectory shift / detector semantics
   issue) before deciding whether it's in scope to fix here or must be filed separately.
   **Never weaken a detector to make this pass.**

## Performance acceptance

```
bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
bash scripts/run-with-mise.sh yarn perf:report
```

Per design §14, no budget move is expected (the fix removes a `find` call in the
retained-without-candidate branch and adds no new loop/path query/yield calculation).
If `algorithmic-budgets.test.ts` fails, that is a signal something unexpected happened
(e.g. the `ownedCityIds` set construction turned out not to be as cheap as assumed) —
investigate before regenerating the baseline; do not regenerate reflexively.

## Registry / source-rule / build / diff checks

```
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
git diff --check
bash scripts/check-src-rule-violations.sh   # if invoked standalone elsewhere in this repo's workflow; otherwise covered by the PostToolUse hook during edits
```

No `known-campaign-gaps.ts` change expected (design §15) — if `yarn test:ai-long`'s
`campaign-matrix.test.ts` ratchet fails because a *previously-registered* gap stops
reproducing (the "gap fixed, delete it" direction), that is expected and required:
delete the stale entry in the same PR per that file's own two-way-ratchet contract.

## MR scope boundary (restated)

One finding, one fix: `ai-plan-portfolio.ts`'s consolidating-retention gap. Do not
implement findings 2–4 from the design's §16 table in this MR. Do not rename any phase.
Do not touch `ai-tactics.ts`. If the RED test cannot be made to pass without also
touching `ai-major-turn.ts`'s `nextPlanPhase` or `ai-tactics.ts`, STOP — that means the
design's causal analysis was wrong somewhere, and Sol/the human needs to see why before
continuing, not have the fix silently grow to compensate.

## Explicit escalation conditions

Write `DESIGN ESCALATION REQUIRED` and stop implementing, rather than improvising a
fix, if any of the following turns out true once you're in the code:

1. `AIPortfolioContext` cannot cheaply carry `ownedCityIds` without importing
   `GameState` into `ai-plan-portfolio.ts` (the design assumed this is a one-line
   addition from already-computed `perception.ownCities`; if that's wrong, the module
   boundary assumption in design §17 needs human review).
2. The RED reproduction test does not actually fail pre-fix for the described reason
   (i.e., some other existing mechanism already prevents the R5→R6 pattern in a way
   the design's direct trace missed) — this would mean the trace evidence itself needs
   re-examination.
3. Retaining the consolidating plan causes `assignUnitsToPortfolio` or `nextPlanPhase`
   to behave unexpectedly in a way not predicted by design §4's phase-by-phase audit
   (e.g. the plan gets stuck in `consolidating` forever under normal conditions, not
   just under a persistent counterattack) — the audit in design §4 claims the existing
   completion rule is sufficient; if that's empirically false, the fix needs a
   different shape (e.g. an explicit max-consolidation-rounds cap) and that's a design
   decision, not an implementation detail.
4. The long-horizon matrix (§ above) exposes a genuinely new, broad competence
   regression (not just a stale-gap deletion) — classify per the arc rules before
   deciding whether it's a direct in-scope consequence worth fixing here or needs its
   own follow-up.
