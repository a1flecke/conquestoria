# Issues #1301/#1309 Input Reliability Implementation Plan

**Goal:** Remove timer-dependent UI activation, make turn advancement single-flight, repair touch
cancellation/timing, harden the related E2E interactions, and preserve the lessons as agent policy.

**Architecture:** Native button `click` owns cross-input activation. `TurnFlowController` owns the one
in-flight turn mutation. UI busy state mirrors (but does not enforce) that promise. Shared Playwright
helpers express semantic outcomes and live coordinate hit testing. `TouchHandler` uses event timestamps
and a distinct cancellation path.

**Tech stack:** TypeScript, DOM APIs, Vitest/jsdom, Playwright, repository hook/rule checks.

---

### Task 1: Pin the primary-action regression and pending-state contract

**Files:**
- Modify: `tests/ui/primary-action-bar.test.ts`
- Modify: `src/ui/primary-action-bar.ts`

1. Add failing tests for two independent click activations without a timer reset and for touchend plus
   native click producing only one callback.
2. Add a failing async End Turn test proving disabled state, `aria-busy`, `Ending…`, duplicate
   suppression, and restoration.
3. Run `./scripts/dev.sh test tests/ui/primary-action-bar.test.ts` and confirm the failures describe
   the timer gate and missing busy state.
4. Remove the paired `touchend` listener and timer boolean, add `touch-action: manipulation`, and make
   the End Turn definition awaitable with visible busy state.
5. Re-run the focused test to green.

### Task 2: Make turn advancement canonical single-flight

**Files:**
- Modify: `tests/app/controllers/turn-flow-controller.test.ts`
- Modify: `src/app/controllers/turn-flow-controller.ts`

1. Add a deferred-autosave regression proving concurrent callers receive the same promise and one
   round executes, then prove a later call starts after settlement.
2. Run the mirrored test and confirm RED.
3. Split the existing body into one internal execution and a non-async single-flight wrapper whose
   stored promise is cleared in `finally`.
4. Re-run the controller test to green.

### Task 3: Make touch classification event-owned

**Files:**
- Modify: `tests/input/touch-handler-pinch.test.ts`
- Modify: `src/input/touch-handler.ts`

1. Add event-fixture helpers and failing regressions for processing-delayed short taps and canceled
   touches.
2. Run the mirrored touch test and confirm RED.
3. Store `touchstart.timeStamp`, classify with `touchend.timeStamp`, and route `touchcancel` to a
   non-action cleanup handler.
4. Re-run the touch test to green.

### Task 4: Replace raw browser clicks with semantic helpers

**Files:**
- Create: `tests/e2e/helpers/primary-action-bar.ts`
- Create: `tests/e2e/helpers/canvas-interaction.ts`
- Modify: `tests/e2e/issue-496-compacts.spec.ts`
- Modify: `tests/e2e/issue-910-vassalage.spec.ts`
- Modify: `tests/e2e/issue-1237-council-assessment.spec.ts`
- Modify: `tests/e2e/issue-1238-since-last-turn.spec.ts`
- Modify: `tests/e2e/issue-1244-playtest-recorder.spec.ts`
- Modify: `tests/e2e/issue-365-map-presentation.spec.ts`
- Modify: `tests/e2e/issue-447-water-recovery.spec.ts`

1. Extract a primary-panel opener that clicks only while the destination panel is absent and retries
   against panel visibility.
2. Change recorder End Turn retries to require warning, required-choice, or new-turn progress after
   every request; never treat `.click()` resolution as success.
3. Add a shared hex click helper that verifies the live hit target, dismisses only blocking
   notifications through the UI, waits for exact-node detachment, and re-resolves coordinates.
4. Migrate the affected Council, Diplomacy, crowded-map, and water-recovery specs.
5. Run the narrow Playwright specs supported by the existing web-smoke/browser task; if no focused
   dispatcher exists, rely on build plus the configured browser smoke command and report that scope.

### Task 5: Add durable agent guardrails

**Files:**
- Create: `.claude/rules/input-reliability.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

1. Record the native semantic event rule, canonical single-flight ownership, truthful busy UI,
   event-time/cancel touch rules, semantic Playwright postconditions, and coordinate hit-target rule.
2. Add the new rule to the canonical rule index and file-routing guidance.
3. Run `./scripts/dev.sh hooks` to prove policy parity and hook behavior.

### Task 6: Verify, archive the delivered plan, and publish

**Files:**
- Modify: `docs/docs-lifecycle-manifest.json`
- Delete after delivery: this plan and its paired design spec

1. Run source rule checks for every changed `src/` file.
2. Run all mirrored focused Vitest files together, then build and web smoke.
3. Inspect `git diff --check`, the full `origin/main...HEAD` diff, and the uncommitted diff.
4. Delete the delivered plan/spec and classify them under `deleted` in the lifecycle manifest; run
   `./scripts/dev.sh docs-lifecycle` and `./scripts/dev.sh hooks`.
5. Commit, run `./scripts/dev.sh verify-impact`, `./scripts/dev.sh verify-pr`, and
   `./scripts/dev.sh verify-pr-status` on the exact clean commit.
6. Rebase onto the latest `origin/main`, repeat any invalidated focused/build verification, publish
   with `./scripts/push-branch.sh`, create the PR with the repository PR-body helper, and inspect its
   checks. The PR closes #1301 and #1309 and references the #1227 lookalike fix.

