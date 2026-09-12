# Issue #1075 Third Test Shard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the full default Vitest suite exactly once across three explicit, CI-timing-informed shards while retaining the merge gate and its complete-coverage proof.

**Architecture:** Preserve `test-suite-shard-b` exactly as measured. Use the retained GitHub JSON reporter data for the observed critical `test-suite-shard-a` to allocate only its files between `test-suite-shard-a` and new `test-suite-shard-c`; the manifest remains the single checked-in assignment contract. The workflow runs three symmetrical test jobs, uploads each job's discovery, timing, and reporter evidence, and `merge-gate` fails closed unless every applicable child succeeds.

**Tech Stack:** GitHub Actions, Node.js ESM scripts, Yarn, Vitest, shell workflow-contract tests.

---

## Fixed experiment contract

- Base commit: `fe813b56bd5e2cfc9289e353fafe89e2ed24b710`.
- Baseline: three complete green attempts, required-gate median `6m29s`, worst `6m33s`; Shard A was critical in all attempts (`6m22s`, `6m14s`, `6m00s`).
- The candidate changes only default-suite test topology. It neither removes nor retries tests, changes worker/isolation settings, changes browser coverage, nor changes the macOS job.
- Candidate acceptance measurement: three fresh, sequential full workflow attempts; never count a failed-job-only rerun. Record required-gate wall time, each shard duration, queue time, and total runner minutes.
- If any candidate attempt fails, preserve its evidence and stop rather than rerunning it unchanged.

### Task 1: Generalize the manifest and runner contract to three shards

**Files:**
- Modify: `scripts/allocate-ci-test-shards.mjs`
- Modify: `scripts/run-ci-test-shard.mjs`
- Modify: `package.json`
- Modify: `tests/scripts/ci-test-shard-allocation.test.ts`
- Modify: `tests/scripts/ci-test-shard-selection.test.ts`

- [ ] **Step 1: Write failing tests for a fixed B and two balanced A children**

Add fixture coverage that supplies `test-suite-shard-b` as a fixed assignment and A-file timings, then asserts that the allocator emits sorted, disjoint `test-suite-shard-a`, `test-suite-shard-b`, and `test-suite-shard-c` arrays whose union is the supplied manifest. Assert the fixture keeps B byte-for-byte unchanged and uses deterministic lexical tie-breaking between A and C.

- [ ] **Step 2: Run the focused allocation and selection tests to verify the new three-shard assertions fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-allocation.test.ts tests/scripts/ci-test-shard-selection.test.ts
```

Expected: FAIL because the current allocator and runner only recognize A and B.

- [ ] **Step 3: Implement the minimal explicit three-shard contract**

Define one shared ordered shard-name list (`test-suite-shard-a`, `test-suite-shard-b`, `test-suite-shard-c`). Extend manifest validation and CLI usage to require all three assignments. Extend allocation with a constrained mode that verifies fixed B coverage, removes B files from the weighted input, and applies LPT allocation only between A and C. Add package scripts for C execution and C manifest listing; preserve A/B script semantics.

- [ ] **Step 4: Run the focused contract tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-allocation.test.ts tests/scripts/ci-test-shard-selection.test.ts tests/scripts/ci-test-shard-profile-mode.test.ts
```

Expected: PASS, including real default-discovery exact-once coverage across all three assignments.

- [ ] **Step 5: Commit the runner contract**

```bash
git add scripts/allocate-ci-test-shards.mjs scripts/run-ci-test-shard.mjs package.json tests/scripts/ci-test-shard-allocation.test.ts tests/scripts/ci-test-shard-selection.test.ts tests/scripts/ci-test-shard-profile-mode.test.ts
git commit -m "feat(ci): support a third balanced test shard"
```

### Task 2: Generate the constrained assignment from retained CI evidence

**Files:**
- Modify: `scripts/ci-test-shards.json`
- Test: `tests/scripts/ci-test-shard-selection.test.ts`

- [ ] **Step 1: Download the retained Shard A evidence artifact from workflow run `34686364246` attempt 3**

Download only `test-suite-shard-a-evidence` into a temporary directory outside the repository, identify its `artifacts/vitest-results/test-suite-shard-a.json`, and reject the artifact if it is not a successful reporter result or its paths do not match the checked-in A assignment.

- [ ] **Step 2: Produce a constrained three-shard manifest**

Use exact default discovery and the retained CI reporter duration for every current A file. Retain every current B file unchanged. Allocate the former A file set only over A and C, then write the checked-in manifest with the measured source revision and a source label that identifies GitHub CI reporter evidence.

- [ ] **Step 3: Prove exact default-suite membership before executing tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test:manifest:ci:shard-a
./scripts/run-with-mise.sh yarn test:manifest:ci:shard-b
./scripts/run-with-mise.sh yarn test:manifest:ci:shard-c
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts
```

Expected: each manifest prints only its own sorted files; the selection test proves the three-way union equals live default discovery with no overlap.

- [ ] **Step 4: Commit the CI-derived manifest**

```bash
git add scripts/ci-test-shards.json tests/scripts/ci-test-shard-selection.test.ts
git commit -m "chore(ci): split the measured critical test shard"
```

### Task 3: Run three test jobs and keep the aggregate fail-closed

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/verify-merge-gate.mjs`
- Modify: `tests/scripts/verify-merge-gate.test.ts`
- Modify: `tests/hooks/verification-config.test.sh`

- [ ] **Step 1: Write failing workflow and gate contract assertions for C**

Add a successful `test-suite-shard-c` result to the merge-gate fixture and add a parameterized non-success case that expects the verifier to name C. Add shell assertions that C has the same 15-minute bound, exact manifest capture, direct package script invocation with JSON reporter, phase timing, retained evidence, and aggregate dependency as A/B.

- [ ] **Step 2: Run the focused tests to verify the new C assertions fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/verify-merge-gate.test.ts
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: FAIL because the current workflow and verifier do not declare C.

- [ ] **Step 3: Add the explicit C job and aggregate dependency**

Copy the A/B job shape for `test-suite-shard-c`, substituting only C-specific package script, manifest filename, phase key, JSON result filename, and evidence artifact name. Add C to `merge-gate.needs` and the verifier's mandatory jobs. Do not use a matrix: the separate job name remains stable for branch protection, artifacts, and diagnostics.

- [ ] **Step 4: Run focused workflow contracts**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/verify-merge-gate.test.ts
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: PASS; the aggregate rejects missing, skipped, cancelled, and failed C results.

- [ ] **Step 5: Commit the workflow gate**

```bash
git add .github/workflows/deploy.yml scripts/verify-merge-gate.mjs tests/scripts/verify-merge-gate.test.ts tests/hooks/verification-config.test.sh
git commit -m "ci: require the third balanced test shard"
```

### Task 4: Preserve future-maintainer guidance and verify the candidate

**Files:**
- Modify: `.claude/rules/hooks-and-tooling.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-09-12-issue-1075-third-test-shard.md`

- [ ] **Step 1: Update CI-sharding guidance**

Replace two-shard references with three explicit shards. State that a measured slow shard may be subdivided only with retained CI reporter data; do not rebalance by file count or local-only timings. Preserve the rule that new default-discovered tests must be assigned exactly once and the rule that local tiers are independent from CI topology.

- [ ] **Step 2: Run all three final local shard commands**

Run separately:

```bash
./scripts/run-with-mise.sh yarn test:ci:shard-a
./scripts/run-with-mise.sh yarn test:ci:shard-b
./scripts/run-with-mise.sh yarn test:ci:shard-c
```

Expected: every command passes; together they execute the complete default suite exactly once.

- [ ] **Step 3: Run final required verification**

Run separately:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test:durable
./scripts/run-with-mise.sh yarn test:durable:status
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --stat
```

Expected: build and durable suite pass for the current worktree/HEAD; both committed and uncommitted diffs are inspected before PR creation.

- [ ] **Step 4: Mark the plan status and commit the guidance**

Mark completed checkboxes and add an honest candidate-status note with the PR number once known. Commit the plan and documentation updates:

```bash
git add .claude/rules/hooks-and-tooling.md AGENTS.md CLAUDE.md docs/superpowers/plans/2026-09-12-issue-1075-third-test-shard.md
git commit -m "docs(ci): document three-shard measurement rules"
```

### Task 5: Measure the candidate in GitHub Actions

**Files:**
- No repository changes

- [ ] **Step 1: Create a PR without merging**

Push the branch and create a PR that links #1075, includes the fixed baseline (`6m29s` median / `6m33s` worst), lists retained coverage and unchanged macOS scope, and states the candidate’s single changed variable: splitting measured A into A+C.

- [ ] **Step 2: Verify the initial PR workflow**

Confirm that all three explicit test jobs, their artifacts, and `merge-gate` complete green. Treat any failure as evidence, not a rerun opportunity.

- [ ] **Step 3: Run three fresh sequential candidate attempts**

After the initial full attempt, use whole-workflow reruns only (`gh run rerun <run-id>`; never `--failed`). Start each only after the preceding attempt is complete. Record all attempt URLs and phase durations.

- [ ] **Step 4: Compare and decide**

Compute candidate median/worst required-gate time and total runner minutes. Accept only if median reaches `<=5m30s` without a regression in reliability or coverage and runner-minute increase is within the issue’s 50% guardrail. Otherwise record the rejection and stop this experiment before proposing another topology change.
