# Worktree-Safe Local Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle hook checks with an exact-ref, timeout-bounded, worktree-safe verification path shared by Git hooks, Claude tooling, and CI.

**Architecture:** A canonical verifier owns the test/build sequence and a small Node watchdog owns process deadlines. Git hooks focus on Git semantics, while `run-with-mise.sh` owns tool and linked-worktree routing without leaking or deleting caller Git state.

**Tech Stack:** POSIX shell, Node.js 24, mise, Yarn 4.13.0, Vitest 4, Git linked worktrees, GitHub Actions.

---

### Task 1: Make Git hook tests behavioral

**Files:**
- Create: `tests/hooks/git-pre-commit.test.sh`
- Modify: `tests/hooks/git-pre-push.test.sh`

- [ ] **Step 1: Write failing pre-commit tests**

Create a temporary repository and alternate index. Stage `alternate.txt` only in the alternate index, invoke the real hook with `GIT_INDEX_FILE`, and assert the stub guardrail sees `alternate.txt`. Replace the stub with one that exits 23 and assert the hook returns 23.

- [ ] **Step 2: Write failing pre-push tests**

Feed real four-field pre-push records to the hook. Cover clean `HEAD`, dirty worktree, a non-HEAD branch SHA, tag-only input, and a verifier stub returning nonzero.

- [ ] **Step 3: Verify RED**

Run:

```bash
bash tests/hooks/git-pre-commit.test.sh
bash tests/hooks/git-pre-push.test.sh
```

Expected: alternate-index, dirty-tree, wrong-SHA, or failure-propagation assertions fail against the current hooks.

### Task 2: Separate commit and push responsibilities

**Files:**
- Modify: `.githooks/pre-commit`
- Modify: `.githooks/pre-push`
- Create: `scripts/verify-before-push.sh`

- [ ] **Step 1: Make pre-commit index-correct**

Remove Git-environment clearing and run only:

```sh
cd "$REPO_ROOT"
./scripts/pre-commit-guardrails.sh
```

- [ ] **Step 2: Make pre-push exact-ref aware**

Read stdin into a temporary file, inspect every `refs/heads/*` update, skip all-zero deletions and non-branch refs, require each pushed branch SHA to equal `git rev-parse HEAD`, and require `git status --porcelain --untracked-files=all` to be empty before verification.

- [ ] **Step 3: Add the canonical verifier**

Run the full test phase and production build phase through the timeout runner. Support `--no-mise` for CI/Yarn-script callers and environment overrides for test/build deadlines.

- [ ] **Step 4: Verify GREEN**

Run both hook tests and expect all scenarios to pass.

### Task 3: Make hook installation worktree-local

**Files:**
- Create: `scripts/setup-git-hooks.sh`
- Modify: `package.json`
- Create: `tests/hooks/setup-git-hooks.test.sh`

- [ ] **Step 1: Write the failing linked-worktree installer test**

Create a temporary main repository plus two linked worktrees. Run the installer in one linked worktree and assert only that worktree resolves `core.hooksPath` to `.githooks`.

- [ ] **Step 2: Verify RED**

Run:

```bash
bash tests/hooks/setup-git-hooks.test.sh
```

Expected: fail because the installer does not exist and the current package command writes shared configuration.

- [ ] **Step 3: Implement the installer**

Enable `extensions.worktreeConfig`, set `core.hooksPath` using `git config --worktree`, and print the configured worktree and path. Point `yarn setup:hooks` at this script.

- [ ] **Step 4: Verify GREEN**

Run the installer test and expect target-worktree isolation.

### Task 4: Harden mise and first-install routing

**Files:**
- Modify: `scripts/run-with-mise.sh`
- Modify: `tests/hooks/run-with-mise-worktree.test.sh`
- Modify: `mise.toml`
- Create: `tests/hooks/toolchain-pins.test.sh`

- [ ] **Step 1: Write failing functional routing tests**

Use a temporary linked-worktree repository and fake `mise` executable. Assert `yarn install` executes from the main worktree without `.pnp.cjs`, dependency-requiring commands fail with an install instruction, and `yarn setup:hooks` stays in the active worktree. Execute the real wrapper with synthetic `GIT_DIR` to prove discovery does not recurse.

- [ ] **Step 2: Verify RED**

Run the wrapper test and expect first-install or Git-environment scenarios to fail.

- [ ] **Step 3: Implement routing**

Use a subshell that unsets Git-local variables only for repository discovery. Route install before checking `.pnp.cjs`; issue an actionable failure for other commands; preserve active-worktree hook setup.

- [ ] **Step 4: Pin Yarn**

Set:

```toml
yarn = "4.13.0"
```

Add a test comparing that value with `package.json#packageManager`.

- [ ] **Step 5: Verify GREEN**

Run wrapper and toolchain tests.

### Task 5: Add deterministic deadlines

**Files:**
- Create: `scripts/run-with-timeout.mjs`
- Create: `tests/hooks/run-with-timeout.test.sh`
- Modify: `.github/workflows/deploy.yml`
- Modify: `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Write failing timeout-runner tests**

Assert a successful child exits 0, a child exiting 7 returns 7, and a sleeping child is terminated near the configured deadline with exit 124.

- [ ] **Step 2: Verify RED**

Run the timeout test and expect failure because the runner does not exist.

- [ ] **Step 3: Implement process-group timeout handling**

Spawn the child detached with inherited stdio. On deadline, send `SIGTERM` to its process group, then `SIGKILL` after a short grace period, and exit 124.

- [ ] **Step 4: Configure CI and Vitest scope**

Set `timeout-minutes: 15` on the GitHub test job. Give only the full-catalog tech selection test a 10-second timeout.

- [ ] **Step 5: Add repeat-selection UI coverage**

Click a second deep technology and assert the same map node objects remain, the first selection/path markers are removed where appropriate, the new inspector is visible, and selected edge widths update without stale values.

- [ ] **Step 6: Verify GREEN**

Run timeout tests and `tests/ui/tech-panel.test.ts`.

### Task 6: Consolidate Claude and CI entry points

**Files:**
- Modify: `.claude/hooks/require-green-before-push.sh`
- Modify: `tests/hooks/require-green-before-push.test.sh`
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write a failing Claude-hook delegation test**

Create a temporary project with a verifier stub. Assert verifier success allows the command, verifier failure returns hook exit 2, and the marker proves the canonical script ran.

- [ ] **Step 2: Replace duplicated verification**

Have the Claude hook resolve the project directory and invoke `scripts/verify-before-push.sh`, preserving its concise tail-on-failure reporting. Add `yarn verify:push` using `--no-mise`; make the GitHub test job invoke it.

- [ ] **Step 3: Verify GREEN**

Run:

```bash
bash scripts/run-with-mise.sh yarn test:hooks
```

Expected: all functional hook tests pass.

### Task 7: Final verification

**Files:** No production changes.

- [ ] **Step 1: Run targeted checks**

```bash
bash scripts/check-src-rule-violations.sh src/ui/tech-panel.ts
bash scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts
bash scripts/run-with-mise.sh yarn test:hooks
```

- [ ] **Step 2: Run release gates**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
```

- [ ] **Step 3: Inspect committed and uncommitted diffs**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check
```

- [ ] **Step 4: Install this worktree's hook, commit, and push**

```bash
bash scripts/setup-git-hooks.sh
git commit -m "fix(tooling): make push verification worktree-safe"
git push
```

The pre-push hook must independently complete the canonical verifier before Git sends the branch.
