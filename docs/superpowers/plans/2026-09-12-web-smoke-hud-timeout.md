# Web-Smoke HUD Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the fixture-heavy HUD visual regression test reliable on GitHub-hosted CI without weakening the suite-wide E2E timeout or adding retries.

**Architecture:** Scope a 45-second budget to the one test whose retained GitHub trace showed 16.6 seconds of fixture startup before its interaction assertions. The global 30-second Playwright timeout, two-worker execution, fixture contents, production behavior, and all other E2E tests remain unchanged.

**Tech Stack:** Playwright, TypeScript, GitHub Actions.

---

## Evidence and scope

- Candidate workflow `34701694504` failed only in `web-smoke`; all three Vitest shard jobs and the unchanged macOS build passed.
- The retained trace locates the timeout in `tests/e2e/issue-437-hud-alignment.spec.ts` after the test spent about 16.6 seconds activating the campaign fixture; the `Continue Campaign` click and subsequent HUD interactions consumed the 30-second test-wide budget.
- The candidate diff has no change to the web-smoke job, Playwright configuration, E2E files, or application code. Recent `main` history also contains unrelated 30-second web-smoke test timeouts, so this is a pre-existing CI reliability issue, not evidence against the shard split.
- Do not add a retry, change the global timeout, serialize the suite, modify the fixture, or change the shard allocation in this repair.

### Task 1: Give only the heavy HUD flow a bounded budget

**Files:**
- Modify: `tests/e2e/issue-437-hud-alignment.spec.ts:47-79`
- Test: `tests/e2e/issue-437-hud-alignment.spec.ts`

- [ ] **Step 1: Preserve the failing CI reproduction evidence**

Treat workflow `34701694504` as the red result. Its trace shows that the test exceeded Playwright's default 30,000 ms timeout while waiting for the second post-fixture interaction to settle; it does not show a failed HUD assertion or a product behavior regression.

- [ ] **Step 2: Add the explicit per-test budget at the start of the affected test**

Inside the existing `Tauri-sized HUD keeps every yield on one visual baseline` callback, before `page.setViewportSize`, add exactly:

```ts
  test.setTimeout(45_000);
```

Do not alter the 30,000 ms global `playwright.config.ts` timeout or either neighboring test. This leaves ordinary E2E failures fast while allowing this known fixture-intensive visual flow its documented 15-second startup headroom.

- [ ] **Step 3: Run the exact affected E2E test**

Run:

```bash
./scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-437-hud-alignment.spec.ts --grep "Tauri-sized HUD keeps every yield on one visual baseline"
```

Expected: the HUD visual baseline, row styling, gold disclosure toggle, and post-toggle baseline assertions pass; no retry is configured.

- [ ] **Step 4: Run the complete web-smoke suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke
```

Expected: all 14 browser tests pass with their existing two-worker configuration.

- [ ] **Step 5: Commit the isolated reliability repair**

```bash
git add tests/e2e/issue-437-hud-alignment.spec.ts docs/superpowers/plans/2026-09-12-web-smoke-hud-timeout.md
git commit -m "test(e2e): bound HUD fixture timeout"
```

### Task 2: Revalidate the PR candidate

**Files:**
- No repository changes unless CI evidence reveals a distinct defect.

- [ ] **Step 1: Run the required pre-push evidence on the final commit**

Run separately:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test:durable
./scripts/run-with-mise.sh yarn test:durable:status
git diff --check origin/main...HEAD
```

Expected: build exits zero, the durable status reports a pass for the current `HEAD`, and the diff check is clean.

- [ ] **Step 2: Push and validate the new initial PR workflow**

Push the existing branch, wait for the entire workflow, and confirm `web-smoke`, all three explicit shard jobs, their evidence artifacts, and `merge-gate` complete green. Preserve any failure and do not rerun an unchanged workflow.

## Plan self-review

- Scope: one per-test timeout in the existing E2E file; no production, CI-topology, retry, or global configuration changes.
- Evidence: the exact GitHub trace and historical main failures establish a startup-budget timeout, not a failed HUD correctness assertion.
- Validation: starts with the exact test, then covers the full web smoke suite, build, durable suite, and a full GitHub workflow.
