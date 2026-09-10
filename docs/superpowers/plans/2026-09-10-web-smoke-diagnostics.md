# Web-smoke Diplomacy Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the intermittent reopened-Diplomacy-panel failure into an actionable CI artifact without slowing successful web-smoke runs.

**Architecture:** Keep the application unchanged. The affected Playwright spec will establish the panel-close lifecycle before reopening it, and wrap the existing compact assertion in a failure-only diagnostic helper. That helper snapshots the rendered panel, E2E readiness labels, and browser errors at the failed boundary, so a later source fix can target a verified cause rather than extend a timeout.

**Tech Stack:** TypeScript, Playwright, Vite E2E server, GitHub Actions artifacts.

---

## File structure

- Modify `tests/e2e/issue-496-compacts.spec.ts`: retain the existing compact contract; add close/reopen synchronization and failure-only diagnostic capture.
- Modify `docs/superpowers/specs/2026-09-10-web-smoke-diagnostics-design.md`: mark the diagnostic slice implemented after its MR is merged.
- Modify `docs/superpowers/plans/2026-09-10-web-smoke-diagnostics.md`: mark Task 1 complete and record the CI evidence/decision after the diagnostic MR runs.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Diplomacy panel shows a compact disclosure | Player closes the panel | The existing panel is removed from the DOM. |
| Diplomacy panel is absent | Player selects `Diplo` | A fresh Diplomacy panel appears and includes `About this compact`. |

The test is not adding player UI. It proves the existing close/reopen interaction remains visibly correct.

## Misleading UI Risks

- Treating the five-second Playwright timeout as the defect would hide whether the panel failed to reopen, the compact presentation was absent, or a browser error interrupted rendering.
- Increasing the timeout would make failed CI runs slower without proving the player-visible contract.
- The diagnostic must report the current DOM and readiness state only after failure; a passing run must not wait for a fixed delay or emit large artifacts.

## Interaction Replay Checklist

- Open Diplomacy from a campaign-ready autosave.
- Assert the compact summary and hidden detail state.
- Toggle the native disclosure open and closed with the keyboard.
- Close the panel and assert it has detached.
- Reopen Diplomacy from the unchanged HUD control.
- Assert the compact summary on the fresh panel.
- On a failed final assertion, inspect the attachment to determine whether the panel, compact presentation, readiness state, or browser runtime failed.

### Task 1: Capture the exact failed close/reopen boundary

**Files:**
- Modify: `tests/e2e/issue-496-compacts.spec.ts:1-61`
- Modify: `docs/superpowers/specs/2026-09-10-web-smoke-diagnostics-design.md`
- Modify: `docs/superpowers/plans/2026-09-10-web-smoke-diagnostics.md`

- [x] **Step 1: Preserve the existing red evidence.**

  Record the two failed GitHub Actions attempts for run `34414888696` before changing the spec. Both fail at line 50 after the panel is closed and reopened, with no compact summary found. This is the existing failing behavior that the diagnostic change must make distinguishable.

- [x] **Step 2: Add failure-only browser diagnostics to the spec.**

  Extend the Playwright imports and add the following support code above `fixture()`:

  ```ts
  import { expect, test, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';

  interface DiplomacyPanelDiagnostic {
    readiness: readonly string[];
    panelExists: boolean;
    panelText: string;
    compactDetailCount: number;
    compactSummaryTexts: string[];
    consoleErrors: string[];
    pageErrors: string[];
  }

  function captureBrowserErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    return { consoleErrors, pageErrors };
  }

  async function attachDiplomacyPanelDiagnostic(
    page: Page,
    testInfo: TestInfo,
    browserErrors: { consoleErrors: string[]; pageErrors: string[] },
  ): Promise<void> {
    const rendered = await page.evaluate(() => {
      const panel = document.querySelector('#diplomacy-panel');
      const summaries = [...document.querySelectorAll('#diplomacy-panel details.minor-civ-compact-details summary')]
        .map(summary => summary.textContent ?? '');
      return {
        readiness: window.__CONQUESTORIA_E2E_DIAGNOSTICS__?.readiness() ?? [],
        panelExists: panel !== null,
        panelText: (panel?.textContent ?? '').slice(0, 4_000),
        compactDetailCount: panel?.querySelectorAll('details.minor-civ-compact-details').length ?? 0,
        compactSummaryTexts: summaries,
      };
    });
    const diagnostic: DiplomacyPanelDiagnostic = {
      ...rendered,
      consoleErrors: browserErrors.consoleErrors,
      pageErrors: browserErrors.pageErrors,
    };
    await testInfo.attach('diplomacy-panel-diagnostic.json', {
      body: JSON.stringify(diagnostic, null, 2),
      contentType: 'application/json',
    });
  }

  async function expectCompactSummary(
    page: Page,
    testInfo: TestInfo,
    browserErrors: { consoleErrors: string[]; pageErrors: string[] },
  ): Promise<void> {
    try {
      await expect(page.locator('#diplomacy-panel details.minor-civ-compact-details summary'))
        .toHaveText('About this compact');
    } catch (error) {
      await attachDiplomacyPanelDiagnostic(page, testInfo, browserErrors);
      throw error;
    }
  }
  ```

  The helper catches only the existing compact-summary assertion. It must not catch or retry navigation, click, fixture, or readiness failures.

- [x] **Step 3: Make the interaction test use the lifecycle and diagnostic contract.**

  Change the first test signature to receive `testInfo`, create the browser-error capture before `enterAutosave`, and replace both direct summary assertions with `expectCompactSummary`. After clicking `#diplo-close`, add:

  ```ts
  await expect(panel).toHaveCount(0);
  ```

  The reopen sequence must remain:

  ```ts
  await page.getByRole('button', { name: 'Diplo', exact: true }).click();
  await expectCompactSummary(page, testInfo, browserErrors);
  ```

  Do not change Playwright’s global `expect.timeout`, its worker count, or the five-second compact assertion deadline.

- [x] **Step 4: Run the focused concurrent regression.**

  Run:

  ```bash
  CI=1 bash scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-496-compacts.spec.ts --repeat-each=5 --workers=2
  ```

  Expected: 10 passing tests. If the original failure recurs, the failed Playwright result must contain `diplomacy-panel-diagnostic.json`; inspect its `panelExists`, `compactDetailCount`, `readiness`, and error arrays before making any source change.

  Result: 10/10 passed on 2026-09-10 with `--workers=2`.

- [x] **Step 5: Run the complete browser smoke suite.**

  Run:

  ```bash
  CI=1 bash scripts/run-with-mise.sh yarn test:web-smoke
  ```

  Expected: all current E2E tests pass. If a compact failure recurs, retain its attachment as the root-cause evidence; do not increase a timeout or reduce workers.

  Result: 14/14 passed on 2026-09-10.

- [x] **Step 6: Sync the documentation and commit the diagnostic MR.**

  Update the design and this plan to record the focused/full-suite outcomes and, after merge, mark Task 1 as `✅ merged (#PR)`. Commit only the test and documentation changes:

  ```bash
  git add tests/e2e/issue-496-compacts.spec.ts docs/superpowers/specs/2026-09-10-web-smoke-diagnostics-design.md docs/superpowers/plans/2026-09-10-web-smoke-diagnostics.md
  git commit -m "test: diagnose flaky compact panel reopen"
  ```

  Result: documentation records the local evidence. The merge status and CI
  decision remain pending a diagnostic PR run.

## CI decision matrix

| Diagnostic evidence | Verified cause | Follow-up scope |
|---|---|---|
| `panelExists: false` | The HUD action did not create the panel | Trace the HUD/router click path in a new TDD MR. |
| Panel exists; `compactDetailCount: 0`; readiness is campaign-ready | The panel is rendering state without a compact presentation | Trace the session state and `getMinorCivLeaguePresentationForPlayer` in a new TDD MR. |
| Panel exists; compact appears after the existing deadline; no runtime error | Rendering is delayed | Find the blocking lifecycle work before changing any wait; do not raise a global timeout. |
| Browser console/page errors exist | Browser runtime exception | Fix the originating exception in a new TDD MR. |

## Plan self-review

- **Spec coverage:** Task 1 implements close/reopen synchronization, bounded DOM/readiness/error diagnostics, keeps the five-second deadline, and verifies two-worker behavior. The decision matrix prevents an unsupported source fix.
- **Placeholder scan:** No deferred implementation placeholders are present; every planned edit and verification command is explicit.
- **Type consistency:** `captureBrowserErrors`, `attachDiplomacyPanelDiagnostic`, and `expectCompactSummary` use the same error-recorder shape. `DiplomacyPanelDiagnostic` matches the attachment fields.
