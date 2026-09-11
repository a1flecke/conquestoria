# Issue #1075 Browser-Smoke Fixture Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two verified full-campaign browser fixtures resilient to bounded GitHub-runner startup variance without changing product behavior or global Playwright configuration.

**Architecture:** Keep test budgeting at the fixture boundary. The compact file will own its startup diagnostic because it is its only consumer; both compact and water tests will opt into Playwright's per-test `slow` multiplier. The compact readiness poll alone will receive the 45-second bound that matches the existing vassalage precedent.

**Tech Stack:** TypeScript, Playwright, Vite E2E server, GitHub Actions retained artifacts.

---

## Scope and non-goals

- In scope: `tests/e2e/issue-496-compacts.spec.ts`,
  `tests/e2e/issue-447-water-recovery.spec.ts`, this plan, and the paired
  design record.
- Out of scope: gameplay, campaign-entry controllers, render-loop behavior,
  `playwright.config.ts`, Playwright worker count, retries, and all global
  timeout values.
- The CI evidence proves a timing-sensitive fixture boundary, not a
  deterministic player-visible defect. Do not optimize application rendering
  or serialize CI workers as part of this repair.

## File structure

- Modify `tests/e2e/issue-496-compacts.spec.ts`: own a failure-only compact
  startup diagnostic, use a 45-second campaign-readiness bound, and mark its
  two complete-campaign tests slow.
- Modify `tests/e2e/issue-447-water-recovery.spec.ts`: mark its two
  complete-campaign tests slow; retain every existing player-visible recovery
  assertion.
- Modify `docs/superpowers/specs/2026-09-11-issue-1075-browser-smoke-stability-design.md`:
  record implementation and CI evidence once available.
- Modify `docs/superpowers/plans/2026-09-11-issue-1075-browser-smoke-stability.md`:
  check completed steps and mark each landed task honestly in the same PR.

## Why this is the smallest correct change

The compact fixture has an explicit 15-second readiness assertion nested in a
30-second default test. Its retained trace proves the game HUD was already
rendered at failure, and the E2E runtime publishes diagnostics only after the
synchronous `startGame()` portion of entry returns. A fixture-local 45-second
condition bound therefore measures the real campaign-entry condition without
relaxing other tests.

The water test drives the same full-campaign entry through the visible Continue
flow. Its retained trace reached the final player-visible recovery assertion
only after the default test ceiling had nearly elapsed. `test.slow()` expands
only that test's total budget to 90 seconds; it does not delay a successful
test or change individual locator/expect deadlines.

The vassalage E2E file already establishes both choices. A prior CI-only
one-worker change was reverted because it did not resolve the individual
startup deadline. That makes worker serialization a measurable regression,
not an alternative solution.

### Task 1: Bound and diagnose compact autosave startup — 🟡 implemented; CI pending

**Files:**
- Modify: `tests/e2e/issue-496-compacts.spec.ts:1-95`

- [x] **Step 1: Add an isolated startup-diagnostic shape and error recorder.**

  Add `ConsoleMessage` and `TestInfo` to the Playwright type imports. Above
  `fixture()`, define the fixture-local timeout and helpers:

  ```ts
  const CAMPAIGN_READY_TIMEOUT_MS = 45_000;

  interface StartupDiagnostic {
    readiness: readonly string[];
    runtimeErrors: readonly string[];
    consoleErrors: readonly string[];
    pageErrors: readonly string[];
  }

  function captureBrowserErrors(page: Page): {
    consoleErrors: string[];
    pageErrors: string[];
  } {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    return { consoleErrors, pageErrors };
  }

  async function attachStartupDiagnostic(
    page: Page,
    testInfo: TestInfo,
    browserErrors: { consoleErrors: string[]; pageErrors: string[] },
  ): Promise<void> {
    const diagnostic: StartupDiagnostic = {
      readiness: await page.evaluate(() => window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness() ?? []),
      runtimeErrors: await page.evaluate(() => window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.errors() ?? []),
      consoleErrors: browserErrors.consoleErrors,
      pageErrors: browserErrors.pageErrors,
    };
    await testInfo.attach('e2e-startup-diagnostic.json', {
      body: JSON.stringify(diagnostic, null, 2),
      contentType: 'application/json',
    });
  }
  ```

  Do not move this helper into a shared module: it has one consumer and is
  intentionally coupled to this fixture's failure artifact.

- [x] **Step 2: Change the compact setup contract, preserving ordinary UI assertions.**

  Replace `enterAutosave(page)` with an `enterAutosave(page, testInfo,
  browserErrors)` helper. Keep `installAutosave()` and `page.goto()` unchanged,
  wrap only the existing readiness poll in `try`/`catch`, and use the explicit
  bound:

  ```ts
  async function enterAutosave(
    page: Page,
    testInfo: TestInfo,
    browserErrors: { consoleErrors: string[]; pageErrors: string[] },
  ): Promise<void> {
    const state = fixture();
    await installAutosave(page, state);
    await page.goto('/?e2e=autosave');
    try {
      await expect.poll(
        () => page.evaluate(() => (
          window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness().includes('campaign-ready') ?? false
        )),
        {
          timeout: CAMPAIGN_READY_TIMEOUT_MS,
          message: 'expected the compact fixture to reach campaign-ready',
        },
      ).toBe(true);
    } catch (error) {
      await attachStartupDiagnostic(page, testInfo, browserErrors);
      throw error;
    }
  }
  ```

  The `catch` must not include fixture creation, navigation, panel clicks, or
  compact assertions. This preserves their original failure attribution.

- [x] **Step 3: Make both compact tests explicitly full-campaign tests.**

  Change each compact test signature to receive `testInfo`, call `test.slow()`
  as its first statement, capture browser errors before `enterAutosave()`, and
  pass those values to the helper:

  ```ts
  test('opens, keyboard-toggles, and reopens the safe compact disclosure on desktop', async ({ page }, testInfo) => {
    test.slow();
    const browserErrors = captureBrowserErrors(page);
    await enterAutosave(page, testInfo, browserErrors);
    // existing player-visible compact assertions remain unchanged
  });
  ```

  Apply the same pattern to the 390px test. Do not alter the existing
  five-second panel/locator expectations: they are post-entry UI contracts,
  not startup waits.

- [x] **Step 4: Run the compact regression under CI-style contention.**

  Run:

  ```bash
  CI=1 ./scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-496-compacts.spec.ts --repeat-each=3 --workers=2
  ```

  Expected: 6 passed. If a readiness failure occurs, inspect its retained
  `e2e-startup-diagnostic.json`; do not increase the bound further without
  evidence that the diagnostic reports a valid campaign entry and no runtime
  error after 45 seconds.

- [x] **Step 5: Commit the compact stabilization.**

  ```bash
  git add tests/e2e/issue-496-compacts.spec.ts
  git commit -m "test: bound compact campaign startup"
  ```

  Result: 6/6 passed under `--repeat-each=3 --workers=2` in 22.7 seconds;
  committed as `e69fa3e6`.

### Task 2: Bound the water-recovery fixture as a whole campaign test — 🟡 implemented; CI pending

**Files:**
- Modify: `tests/e2e/issue-447-water-recovery.spec.ts:78-133`

- [x] **Step 1: Add `test.slow()` to both water-recovery tests.**

  Add `test.slow()` as the first statement in each test:

  ```ts
  test('saved water unit stays selected after a blocked tap and can return ashore', async ({ page }, testInfo) => {
    test.slow();
    await installFixture(page);
    // retain the current Continue flow, blocked-tile, audio, screenshot, and return-to-land assertions
  });
  ```

  ```ts
  test('recovery guidance remains legible and contained on mobile', async ({ page }, testInfo) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    // retain the current fixture and visible layout assertions
  });
  ```

  Do not replace the player-visible assertions with a state-only assertion and
  do not add a manual wait. The test must still fail if recovery guidance,
  sound feedback, or the return-to-land render is wrong.

- [x] **Step 2: Run the water-recovery regression under CI-style contention.**

  Run:

  ```bash
  CI=1 ./scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-447-water-recovery.spec.ts --repeat-each=3 --workers=2
  ```

  Expected: 6 passed. If a real recovery assertion fails before 90 seconds,
  treat it as a product/test-contract defect and return to root-cause analysis;
  do not add retry behavior.

- [x] **Step 3: Commit the water fixture budget.**

  ```bash
  git add tests/e2e/issue-447-water-recovery.spec.ts
  git commit -m "test: bound water recovery campaign fixture"
  ```

  Result: 6/6 passed under `--repeat-each=3 --workers=2` in 25.0 seconds;
  committed as `e3db008b`.

### Task 3: Verify the integrated browser gate and synchronize records — 🟡 local verification complete; CI pending

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-issue-1075-browser-smoke-stability-design.md`
- Modify: `docs/superpowers/plans/2026-09-11-issue-1075-browser-smoke-stability.md`

- [x] **Step 1: Run the two-fixture contention replay.**

  Run:

  ```bash
  CI=1 ./scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-447-water-recovery.spec.ts tests/e2e/issue-496-compacts.spec.ts --repeat-each=3 --workers=2
  ```

  Expected: 12 passed. This is the smallest integrated reproduction of the
  failed run's two-worker contention while exercising all four affected tests.

- [x] **Step 2: Run the full browser-smoke suite.**

  Run:

  ```bash
  CI=1 ./scripts/run-with-mise.sh yarn test:web-smoke
  ```

  Expected: all current browser tests pass. A pass is required before a CI
  dispatch; failure artifacts remain the source of truth for a new diagnosis.

- [x] **Step 3: Type-check the test changes.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn build
  ```

  Expected: the TypeScript build and web bundle both complete successfully.

- [x] **Step 4: Record exact results and commit the documentation.**

  Update the design with the commands, timestamps, and outcomes actually
  observed. Check the completed steps in this plan and add a concise evidence
  note beneath each task. Before creating a PR, identify the tasks as
  implemented with CI pending; once the PR number is known and all required
  checks have passed, make the final PR commit update each completed task
  header to `✅ merged (#PR)` before the authorized merge. Do not report that
  status to the user until the merge has actually completed.

  ```bash
  git add docs/superpowers/specs/2026-09-11-issue-1075-browser-smoke-stability-design.md docs/superpowers/plans/2026-09-11-issue-1075-browser-smoke-stability.md
  git commit -m "docs: record browser smoke stability evidence"
  ```

  Result: combined fixture replay passed 12/12 in 36.8 seconds; full browser
  smoke passed 14/14 in 41.4 seconds; the production build passed. The
  documentation evidence commit follows this update.

### Task 4: Run required branch verification before publishing

**Files:**
- Verify only; no file changes.

- [ ] **Step 1: Inspect the complete branch delta.**

  Run:

  ```bash
  git diff --check
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD
  git status --short
  ```

  Expected: only the two E2E specs and their design/plan records differ from
  `origin/main`; the working tree is clean after the documentation commit.

- [ ] **Step 2: Create durable pre-push evidence.**

  Run these commands separately:

  ```bash
  ./scripts/run-with-mise.sh yarn build
  ./scripts/run-with-mise.sh yarn test:durable
  ./scripts/run-with-mise.sh yarn test:durable:status
  ```

  Expected: durable status accepts the current `HEAD` and working tree; the
  build succeeds. If durable output is incomplete, use the status command as
  authoritative before inspecting processes.

- [ ] **Step 3: Push only after all required evidence is green.**

  ```bash
  git push -u origin codex/issue-1075-browser-smoke-stability
  ```

  Verify the remote branch ref equals local `HEAD` if push output is
  incomplete.

### Task 5: Require a real GitHub Actions web-smoke result

**Files:**
- Verify only; no file changes unless a failure supplies new root-cause evidence.

- [ ] **Step 1: Create the PR after the remote ref is confirmed.**

  Run:

  ```bash
  gh pr create --base main --head codex/issue-1075-browser-smoke-stability --title "test: stabilize browser smoke campaign fixtures (#1075)" --body $'Closes #1075\n\n## Summary\n\n- Gives only full-campaign compact and water-recovery E2E fixtures bounded per-test startup time.\n- Retains the two-worker web-smoke configuration and all player-visible assertions.\n- Adds compact startup diagnostics only when its campaign-readiness condition fails.\n\n## Verification\n\n- CI-style two-worker repeated fixture replays.\n- Full local browser-smoke suite, build, and durable test evidence.'
  ```

  Expected: GitHub returns one PR URL for this branch. Do not merge it in this
  task; a merge remains subject to the user's separate authorization.

- [ ] **Step 2: Wait for the PR's actual web-smoke gate.**

  Run:

  ```bash
  gh pr checks --watch
  ```

  Expected: `web-smoke`, `merge-gate`, and the other required checks pass. The
  PR's `web-smoke` result—not a local timeout increase—is the first valid CI
  proof that this repair handles GitHub-hosted runner variance.

- [ ] **Step 3: Handle a CI failure by evidence, not by retry.**

  If `web-smoke` fails, download or inspect the retained Playwright artifact
  from that exact run. If the compact startup diagnostic reports runtime or
  browser errors, trace that source instead of widening the bound. If water
  recovery reports a product assertion failure within its 90-second budget,
  diagnose that interaction. Do not dispatch benchmark sample three until this
  PR gate is green.

## Plan self-review

- **Problem coverage:** Task 1 addresses the compact file's 15-second nested
  readiness ceiling and missing failure evidence. Task 2 addresses both water
  tests' shared complete-campaign 30-second ceiling. Task 3 proves the exact
  two-worker combination that failed in CI and then the full gate. Task 4
  satisfies repository pre-push verification.
- **SRP and scope:** Diagnostics remain in the one compact fixture that needs
  them; the plan adds no cross-file abstraction or product-code dependency.
  Worker count, retries, global configuration, and production campaign entry
  are explicit non-goals.
- **Reasoning checks:** The approach follows the passing vassalage precedent,
  preserves condition-based waits, and does not treat a timeout increase as
  proof of product correctness. A post-45-second failure still creates
  actionable diagnostic evidence.
- **Test strategy:** Each affected spec is repeated under two-worker CI-style
  contention; the pair is then replayed together, followed by full
  `test:web-smoke`, the repository's durable suite/build proof, and a real PR
  web-smoke gate. The plan retains, rather than weakens, the visible recovery
  and compact assertions.
- **Placeholder/type scan:** All files, APIs, timeout values, commands,
  expected outcomes, and commit boundaries are concrete. The diagnostic type
  and function signatures match the existing `window.__CONQUESTORIA_E2E_DIAGNOSTICS__`
  API (`readiness()` and `errors()`).
