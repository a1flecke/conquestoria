# Web-smoke diplomacy readiness diagnostic design

## Goal

Make the intermittent Playwright failure in `tests/e2e/issue-496-compacts.spec.ts`
actionable without increasing normal CI duration or masking a real application
defect. The test currently reports only that the compact summary is missing after
the Diplomacy panel is closed and reopened.

## Evidence and scope

- The CI test-lane split and `web-smoke` run in separate GitHub-hosted jobs,
  therefore they do not share runner CPU or memory.
- The same compact spec passes repeatedly in local CI-style runs, including two
  Playwright workers.
- Pre-existing web-smoke failures also report missing Diplomacy controls.

This change is limited to the compact E2E spec and its diagnostics. It does not
change application rules, Playwright worker count, or global timeouts.

## Design

1. After selecting the close control, explicitly prove that `#diplomacy-panel`
   is detached before clicking the persistent `Diplo` HUD control again. This
   makes the tested lifecycle explicit and prevents a click from racing an
   incomplete close transition.
2. When an expected compact summary is absent, attach a failure-only JSON
   snapshot containing:
   - whether the Diplomacy panel exists;
   - its compact-detail and summary counts/text;
   - its visible text (bounded to avoid oversized artifacts);
   - the E2E readiness labels; and
   - browser console errors and page errors observed since fixture load.
3. Keep the existing five-second assertion deadline. The helper must not add an
   unconditional wait; successful runs continue immediately once the expected
   DOM is present.

## Test contract

- The reopened panel must contain exactly the expected `About this compact`
  summary after its prior panel has detached.
- A failed assertion must produce the diagnostic attachment, allowing CI to
  distinguish a failed reopen, missing presentation data, delayed DOM render,
  or browser-side exception.
- The compact spec remains valid under two Playwright workers.

## Consequences

The passing-path time impact is negligible: the new detached-state assertion
resolves synchronously after the existing close handler removes the panel, and
diagnostic serialization runs only on a failure. If diagnostics identify a
product defect, a later MR will fix that source condition rather than hiding it
behind a longer timeout.
