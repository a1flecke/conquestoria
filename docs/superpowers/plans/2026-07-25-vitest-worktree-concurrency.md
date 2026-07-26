# Vitest Worktree Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace broad local verification serialization with worktree-local caches and a bounded Vitest worker policy.

**Architecture:** `vite.config.ts` owns the active-worktree cache and worker policy. `scripts/run-with-mise.sh` remains a worktree routing wrapper but stops taking a global lock for routine commands. Shell hook tests assert the observable routing contract.

**Tech Stack:** TypeScript, Vite 8, Vitest 4, POSIX shell, Bash hook tests.

---

### Task 1: Capture the desired routing contract

**Files:**
- Modify: `tests/hooks/run-with-mise-worktree.test.sh`
- Test: `tests/hooks/run-with-mise-worktree.test.sh`

- [x] **Step 1: Write the failing test**

Keep a fake legacy lock as a tripwire, then assert that a linked `yarn build`
runs through `mise` without invoking it. Add an assertion that the wrapper
exports `CONQUESTORIA_VITEST_CACHE_DIR` pointing at `$linked/.vite/vitest`.

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/hooks/run-with-mise-worktree.test.sh`

Expected: FAIL because the current wrapper invokes the shared lock and does
not export a worktree-local cache override.

- [x] **Step 3: Implement minimal wrapper behavior**

Remove the routine-command lock case from `scripts/run-with-mise.sh`. Export
`CONQUESTORIA_VITEST_CACHE_DIR` from `CURRENT_ROOT` before routing commands.

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/hooks/run-with-mise-worktree.test.sh`

Expected: PASS.

### Task 2: Make cache and worker policy explicit

**Files:**
- Modify: `vite.config.ts`
- Modify: `.gitignore`
- Test: `tests/hooks/verification-config.test.sh`

- [x] **Step 1: Write the failing test**

Add assertions that `vite.config.ts` reads `VITEST_MAX_WORKERS`, defaults to
`'25%'` locally and `'100%'` in CI, and uses `CONQUESTORIA_VITEST_CACHE_DIR`
with a `.vite/vitest` fallback. Assert `.vite/` is ignored.

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/hooks/verification-config.test.sh`

Expected: FAIL because the current configuration hard-codes four workers and
uses `node_modules/.vite/vitest`.

- [x] **Step 3: Implement minimal configuration**

Use `process.env.VITEST_MAX_WORKERS ?? (process.env.CI ? '100%' : '25%')` for
`test.maxWorkers`. Set top-level `cacheDir` to a worktree-local `.vite/vite`
or `.vite/vitest` path selected from `process.env.VITEST` and the wrapper
override. Add `.vite/` to `.gitignore`. Set `test.dir` to `tests` while keeping
the e2e exclusion.

- [x] **Step 4: Run test to verify it passes**

Run: `bash tests/hooks/verification-config.test.sh`

Expected: PASS.

### Task 3: Align verifier documentation and regressions

**Files:**
- Modify: `.claude/rules/hooks-and-tooling.md`
- Modify: `tests/hooks/verification-lock.test.sh`
- Modify: `tests/hooks/verify-before-push.test.sh`

- [x] **Step 1: Write the failing test**

Remove the verifier's lock fixture so the existing test fails while the
canonical verifier still attempts to execute it.

- [x] **Step 2: Run tests to verify failure**

Run: `bash tests/hooks/verify-before-push.test.sh`

Expected: FAIL because the current verifier invokes `with-verification-lock.sh`.

- [x] **Step 3: Implement minimal removal**

Remove the lock invocation from `scripts/verify-before-push.sh`. Retire the
obsolete lock script and its test if no caller remains. Document targeted local
tests, the per-process worker budget, worktree-local caches, and CI's full
suite as the merge gate.

- [x] **Step 4: Run regression tests**

Run: `bash tests/hooks/run.sh`

Expected: PASS.

### Task 4: Verify and publish

**Files:**
- Verify: all changed files

- [x] **Step 1: Run source and hook checks**

Run: `git diff --check && bash tests/hooks/run.sh`

Expected: no diff errors and all hook tests pass.

- [x] **Step 2: Run product verification**

Run: `bash scripts/run-with-mise.sh yarn build` then
`bash scripts/run-with-mise.sh yarn test`.

Expected: both commands pass.

- [x] **Step 3: Inspect final review delta**

Run: `git diff --stat origin/main...HEAD && git diff --stat && git diff origin/main...HEAD`.

Expected: only tooling, configuration, tests, and documentation change.

- [ ] **Step 4: Commit and publish**

Run: `git add <changed files> && git commit -m "fix(tooling): bound concurrent vitest worktrees"`.

Push the branch, open a replacement draft MR, and close draft #745 only after
the replacement MR exists.
