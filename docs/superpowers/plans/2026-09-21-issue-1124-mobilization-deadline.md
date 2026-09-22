# #1124 — Mobilization Deadline Semantics (Implementation Plan)

See design doc: `docs/superpowers/specs/2026-09-21-issue-1124-mobilization-deadline-design.md`.

**Base SHA:** `7ba691d59761315d085b4ec1331cda2123cf661e`.

## Files/functions touched

- `src/ai/ai-major-turn.ts` — `nextPlanPhase`'s `deadlineReached` computation (one
  comparison operator, `>=` → `>`). No other production file changes.
- `tests/ai/ai-major-turn.test.ts` — new `describe('#1124 mobilization deadline
  semantics', ...)` block, calling `nextPlanPhase` directly (matching the existing
  `#1064 non-offensive plan phase` block's pattern).

## TDD order

1. Write every test below against **current** `main` first (RED where noted).
2. Apply the one-line fix.
3. Re-run the same block — all cases pass (GREEN).
4. Run the full required regression matrix (below).

## Test cases

All construct an `AIStrategicPlan` with `phase: 'mobilizing'`,
`requiredRoles: { frontline: 2, capture: 1 }` (the #1122 contested/hardened shape — the
smallest shape where `hasRequiredRoles` and the post-deadline floor diverge), and call
`nextPlanPhase(state, plan, assignedUnitIds, [], perception)` directly. `state.turn` and
`plan.createdTurn` are set explicitly per case; `state.opponentChallenge` is set per case.
One assigned unit is a `warrior` (roles `['frontline','capture']` — satisfies
`hasCaptureOrFrontline` and contributes 1 toward both `frontline` and `capture`, but not
the full `frontline: 2`).

1. **RED — veteran, 0 elapsed rounds, under-strength force.**
   `state.turn = 20`, `plan.createdTurn = 20`, `opponentChallenge: 'veteran'`,
   `assignedUnitIds: [warrior]`. Before the fix: `nextPlanPhase(...) === 'advancing'`
   (bug — deadline reached with zero elapsed rounds). After the fix: expect
   `'mobilizing'`.
2. **Control — veteran, 1 elapsed round (the new effective grace), same under-strength
   force.** `state.turn = 21`, `createdTurn = 20`. Expect `'advancing'` both before and
   after the fix under the new semantics (`1 > 0`) — proves the bounded relaxation still
   fires, just one round later than the zero-round bug allowed.
3. **Control — veteran, fully-ready force, 0 elapsed rounds.** Two warriors assigned
   (`frontline` available = 2, satisfies `requiredRoles` outright). Expect `'advancing'`
   regardless of the fix — an already-ready plan must never be artificially delayed.
4. **Control — explorer, 2 elapsed rounds (old deadline boundary), under-strength force.**
   `state.turn = 22`, `createdTurn = 20`, `opponentChallenge: 'explorer'`. Before the fix:
   `'advancing'` (`2 >= 2`). After the fix: `'mobilizing'` (`2 > 2` is false) — explorer's
   effective grace shifts from 2 to 3 rounds; this case documents the shift explicitly
   rather than leaving it as an incidental side effect.
5. **Control — explorer, 3 elapsed rounds (new boundary), same force.** `state.turn = 23`.
   Expect `'advancing'` after the fix (`3 > 2`).
6. **Control — standard, 1 elapsed round (old boundary) vs. 2 (new boundary).** Mirrors
   cases 4-5 at standard's values (`mobilizationRounds: 1`).
7. **Control — zero-capability force never advances regardless of deadline.** Only a
   `worker` assigned (no frontline/capture role) to a `capture` plan, veteran,
   `createdTurn = turn - 50` (deadline trivially reached at any operator). Expect
   `'mobilizing'` both before and after the fix — `hasCaptureOrFrontline`'s floor is
   untouched and this MR must not weaken it.
8. **Control — `expand` objective is exempt from the `hasCaptureOrFrontline` floor,
   unaffected by this fix.** Reuses the existing `#1064` pattern (a settler-only plan
   advances via the `objective === 'expand'` branch) at 0 elapsed rounds, veteran — proves
   the fix does not accidentally tighten the already-correct `expand` exemption.
9. **Determinism / save-reload round trip.** Take case 1's plan and state, run
   `nextPlanPhase` once, then run it again on a `JSON.parse(JSON.stringify(...))` round
   trip of both `state` (the relevant fields) and `plan` — assert identical result. Proves
   the fix introduces no new state-dependent nondeterminism (the function is pure and
   reads only already-persisted fields, so this is expected to pass trivially, but pins
   it).
10. **Standard/hot-seat note (no dedicated test):** `nextPlanPhase` has no `hotSeat`- or
    `currentPlayer`-dependent branch before or after this change — confirmed by reading
    the full function (§8 of the design doc). No new test is needed to prove the absence
    of behavior that doesn't exist; this mirrors #1088's own precedent for the same
    function.

## Verification commands

```bash
scripts/check-src-rule-violations.sh src/ai/ai-major-turn.ts
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-major-turn.test.ts
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-plan-portfolio.test.ts tests/ai/ai-unit-assignment.test.ts tests/ai/ai-round-scheduler.test.ts tests/ai/ai-prepared-turn.test.ts
bash scripts/run-with-mise.sh yarn test --run tests/simulation/ai-playability.test.ts
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:ai-playability:durable
bash scripts/run-with-mise.sh yarn test:ai-playability:durable:status
bash scripts/run-with-mise.sh yarn test:ai-long:durable
bash scripts/run-with-mise.sh yarn test:ai-long:durable:status
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

If any durable command's terminal stream is interrupted, check `:status` before assuming
failure or re-running — per `.claude/rules/hooks-and-tooling.md`.

## MR boundaries

In scope: the one-line `nextPlanPhase` comparison fix, its direct regression tests, this
design/plan doc pair. Out of scope (see design doc §12): any `OPPONENT_CHALLENGE_PROFILES`
value, `hasRequiredRoles`/`hasCaptureOrFrontline`/#1122's role contract, `supportRoles`,
#1123's tactical ordering, combat odds, #1133 tooling, any new `AIStrategicPlan` field.
