# #1123 — Engagement Order / Support-Before-Capture (Implementation Plan)

See design doc: `docs/superpowers/specs/2026-09-22-issue-1123-engagement-order-design.md`.

**Base SHA:** `3667930f4acafaa77bc91a392443fe35ab2a7cdb`.

## Files/functions touched

- `src/ai/ai-tactics.ts` — extract `canCaptureCityNow` (new, factored verbatim out of
  `rankCapture`'s existing legality checks); `rankCapture` calls it; `rankAttacks`'s
  city-target branch gates `rankBombardment` on it. No other production file changes.
- `tests/ai/ai-tactics.test.ts` — new `describe('#1123 engagement order: capture vs
  self-bombardment', ...)` block, 8 tests.

## TDD order (actually followed)

1. Empirically traced the real mixed-force pipeline with a scratch `it.only` test
   (`rankUnitTacticalActions`/`chooseTacticalSequence` on a siege+capture fixture
   against a contested/#1122-shape city) — found the self-bombardment defect, not the
   issue's original "exposes itself too early" hypothesis. Confirmed the minimal
   single-unit reproduction (no siege unit needed) is the sharper form of the bug.
2. Wrote the 8 permanent regression tests against **unmodified `main`** — the first
   (lone-unit self-bombardment) is RED, all others already passed on `main` (they are
   controls proving the *surrounding* behavior stays correct, not new failures).
3. Applied the `canCaptureCityNow` extraction + `rankAttacks` gate.
4. Re-ran the same block — all 8 pass (GREEN), plus zero regressions across the rest of
   `ai-tactics.test.ts` (87/87) and the wider AI/city suites.

## Test cases

All in `tests/ai/ai-tactics.test.ts`, `describe('#1123 engagement order: capture vs
self-bombardment', ...)`. Fixture: `contestedCity(state)` — a population-20,
no-buildings, ungarrisoned hostile city (the #1122 "contested" shape; no defending unit
needed to produce moderate odds).

1. **RED — a lone capture-capable unit at moderate odds captures rather than
   self-bombarding.** Single `swordsman` adjacent to a contested city, no other unit
   assigned. Pre-fix: `bombard-city` (416) outranks `capture-city` (224); `hold` is
   third. Post-fix: `bombard-city` is absent from the candidate list entirely;
   `chooseUnitTacticalAction` returns `capture-city`.
2. **Control — does not delay an already-favorable capture even with support nearby
   (healthy opportunistic capture).** Population-1 city, siege unit present.
   `chooseTacticalSequence`'s first action is `capture-city` — an easy capture is never
   deferred just because support exists.
3. **The mixed-force integration case — a genuine support unit bombards first, then the
   capture unit captures the same turn with improved odds.** Siege (`catapult`) +
   capture (`swordsman`) both assigned to a contested target.
   `chooseTacticalSequence` returns exactly `[bombard-city(siege), capture-city(captor)]`
   in that order. The odds improvement is verified against the *real* result of
   `resolveUnitCityBombardment` (not an approximated HP delta) — `capture-city`'s score
   against the actually-bombarded city is strictly greater than against the pre-bombard
   city.
4. **Control — a unit that cannot itself capture (pure siege) still bombards normally
   with no capture-capable teammate assigned.** Proves genuine siege-only support (no
   possible follow-up at all) is completely unaffected by the gate — `canCaptureCityNow`
   is false for a non-capture-role unit regardless of anything else.
5. **Control — does not suppress bombardment of a different hostile city the unit
   cannot yet capture.** A unit adjacent to (and able to capture) the plan's target also
   has a second, unrelated hostile city in attack range it is *not* adjacent to.
   Bombardment of that second city remains offered — the suppression is scoped per
   `(unit, city)` pair, not a blanket "capture-capable units never bombard."
6. **Difficulty invariance.** Same fixture at `explorer`/`standard`/`veteran` — identical
   suppression at every tier (no challenge-profile read in the changed code).
7. **Determinism.** `chooseTacticalSequence` called twice on the identical state/plan —
   identical action array both times.
8. **Save/reload round trip.** `JSON.parse(JSON.stringify(...))` of both state and plan,
   then `chooseTacticalSequence` — identical result to the pre-round-trip call.

## Verification commands

```bash
scripts/check-src-rule-violations.sh src/ai/ai-tactics.ts
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts tests/ai/ai-bombardment.test.ts tests/ai/ai-unit-assignment.test.ts tests/ai/ai-major-turn.test.ts tests/systems/city-siege-system.test.ts tests/systems/city-bombardment-system.test.ts tests/systems/city-interaction.test.ts
bash scripts/run-with-mise.sh yarn test --run tests/simulation/ai-playability.test.ts
bash scripts/run-with-mise.sh yarn test --run tests/perf/algorithmic-budgets.test.ts
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:ai-playability:durable
bash scripts/run-with-mise.sh yarn test:ai-playability:durable:status
bash scripts/run-with-mise.sh yarn test:ai-long:durable
bash scripts/run-with-mise.sh yarn test:ai-long:durable:status
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

If `yarn test:ai-long:durable`'s wrapper stalls (a documented host-contention condition,
see `.claude/rules/hooks-and-tooling.md`'s "#1133 MR7" section and #1124's own PR for the
identical precedent), fall back to running `LONG_HORIZON_SCENARIOS` individually via
`yarn vitest run --config vitest.long-horizon.config.ts -t <seed>` rather than looping
retries indefinitely.

## MR boundaries

In scope: the `canCaptureCityNow` extraction and its one new call site in `rankAttacks`,
its regression tests, this design/plan doc pair. Out of scope (see design doc §12): any
#1122 force-sizing/production change, any #1124 readiness/deadline change,
`rankBombardment`'s `bestGain` calculation, human-executed combat/city-interaction paths,
a new `AIStrategicPlan` field, and #1133 tooling.
