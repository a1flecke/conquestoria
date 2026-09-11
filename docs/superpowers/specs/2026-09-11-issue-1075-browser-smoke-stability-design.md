# Issue #1075 browser-smoke fixture stability design

## Goal

Keep the full-campaign browser fixtures in `issue-496-compacts.spec.ts` and
`issue-447-water-recovery.spec.ts` reliable on GitHub-hosted runners without
changing application behavior, Playwright's global timeout, or worker count.

## Verified evidence

- Dispatch run `34653105105` used two Playwright workers and passed 12 of 14
  browser tests. Its `web-smoke` job failed only because the compact and water
  recovery desktop tests exhausted their fixed time budgets.
- The compact test's 15-second `campaign-ready` poll timed out, while its
  retained page snapshot already contained the Turn 40 campaign HUD. No
  browser-side application error was reported.
- The E2E runtime calls `enterSoloCampaign()` before it assigns
  `window.__CONQUESTORIA_E2E_DIAGNOSTICS__`. That call synchronously enters a
  full campaign through `startGame()` before returning its sprite-loading
  promise, so its initial mount can consume the poll's entire deadline.
- The water recovery trace reached its final post-move assertion after the
  campaign-entry flow, blocked-tile interaction, notification interaction, and
  screenshot had consumed nearly all of Playwright's 30-second whole-test
  budget. The runner canceled the test before its normal assertion wait could
  settle; it did not report a movement assertion failure.
- The existing vassalage E2E specs are the matching local precedent: their
  complete-campaign fixtures use `test.slow()` and a fixture-local 45-second
  readiness timeout. All three vassalage tests passed in the failed run.
- A local CI-style replay of the two affected specs passed 12/12 across three
  repetitions with two workers. The defect is timing-sensitive runner
  variability, not a deterministic player-state failure.

## Design

1. Mark every test in the two affected files as `test.slow()`. This gives only
   those full-campaign fixtures Playwright's 90-second per-test ceiling while
   preserving the default 30-second limit for the rest of the web-smoke suite.
2. Give the compact autosave helper the same explicit, fixture-local
   45-second readiness bound used by vassalage. Its two tests must retain the
   ordinary default assertion deadlines after the campaign has entered.
3. Attach an `e2e-startup-diagnostic.json` only if compact readiness fails. It
   must capture readiness labels, runtime errors, console errors, and page
   errors, because the existing panel diagnostic runs too late to explain a
   startup failure.
4. Do not serialize workers, change `playwright.config.ts`, retry tests, or
   alter the live campaign-entry/runtime implementation. Those approaches
   either impose a suite-wide cost or obscure the verified fixture-boundary
   condition.

## Test contract

- A passing fixture proceeds immediately once its real readiness or UI
  condition is satisfied; no deliberate delay is added.
- A genuine compact startup failure still fails within 45 seconds and leaves a
  bounded diagnostic artifact explaining its browser/runtime state.
- Water recovery continues proving the player-visible blocked-tile guidance,
  notification, audio cue, and return-to-land result; only its test budget
  changes.
- CI continues using its existing two-worker browser configuration.

## Consequences

Successful runs do not wait for the expanded ceilings. The worst-case failure
time is intentionally bounded per full-campaign fixture, rather than being
hidden by a global timeout or reduced suite concurrency. This repair is
limited to test infrastructure and does not change player-visible behavior.
