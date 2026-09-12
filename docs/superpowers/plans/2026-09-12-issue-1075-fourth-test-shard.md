# Issue #1075 Fourth Test Shard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Issue #1075's current critical CI test shard by splitting only `test-suite-shard-b` into measured B and D assignments while preserving complete, exact-once merge coverage.

**Architecture:** `scripts/ci-test-shards.json` remains the one checked-in default-suite assignment contract. Keep current A and C assignments byte-for-byte identical; use the retained successful GitHub Actions Vitest JSON reporter from B to apply the existing constrained allocator only to B's files, yielding B and new D. The workflow exposes four stable, explicit jobs and the merge gate fails closed unless all four succeed.

**Tech Stack:** GitHub Actions, Node.js ESM scripts, Yarn, Vitest JSON reporter, shell workflow-contract tests.

**Status:** 🟡 Tasks 1–4 are complete locally at rebased commit `3b6f38bbd51856acb0b84876b269f8f4ebc1743a`. Direct A execution completed without a recoverable exit status and is therefore inconclusive; all four manifest commands, focused contracts, production build, and durable full-suite status passed. GitHub candidate measurement has not started.

---

## Fixed experiment contract

- Base commit: `b68a9561a3f79ccc2ebed43fb3cbab3ed4aca3df` (`origin/main` after PR #1079's rebase merge).
- Retained source evidence: successful `test-suite-shard-b` reporter artifact from workflow run `34704662037`, attempt 4, at pre-rebase PR head `cf5ae947bf28afbc091452ce43af068288a97f6e`. Its 322 B paths exactly equal the post-rebase base assignment above; the generated manifest records the current base commit.
- Baseline measurement: three successful post-#1079 full workflow attempts; required-gate median `5m35s`, worst `5m39s`. B was critical in each (`5m22s`, `5m31s`, `5m26s`); A was `4m27s`, `4m21s`, `3m42s`; C was `3m14s`, `3m08s`, `3m04s`.
- Single changed variable: B's 322 measured files become B plus D. A and C must be exact retained assignments. The web build, browser smoke, hooks, security, desktop, macOS, worker/isolation settings, test bodies, and retry policy are unchanged.
- Do not divide by file count, derive timings from a local run, omit a test, or raise a timeout. The allocator's duration-aware LPT split is the only balancing mechanism.
- Candidate acceptance: an initial complete green PR workflow followed by three fresh, sequential whole-workflow attempts. Record required-gate wall time, job durations, queue time, and positive runner seconds. Stop on a failed attempt; never use a failed-job-only rerun.
- Success threshold: required-gate median at or below `5m30s`, no coverage or reliability regression, and median positive runner seconds no more than 50% above the pre-shard baseline.

## File responsibility map

| File | Responsibility |
| --- | --- |
| `scripts/run-ci-test-shard.mjs` | Validates and launches the named checked-in CI shard. |
| `package.json` | Exposes stable B/D runner and manifest commands, plus four-way allocation defaults. |
| `scripts/ci-test-shards.json` | Stores per-file timings and the exact four-way default-suite assignment. |
| `.github/workflows/deploy.yml` | Runs the explicit D job and includes it in the aggregate dependency graph. |
| `scripts/verify-merge-gate.mjs` | Rejects missing, skipped, or unsuccessful D results. |
| `tests/scripts/ci-test-shard-selection.test.ts` | Proves live discovery is sorted, disjoint, exhaustive, and launchable across A/B/C/D. |
| `tests/scripts/ci-test-shard-allocation.test.ts` | Proves constrained allocation retains A/C and splits only B into B/D. |
| `tests/scripts/verify-merge-gate.test.ts` | Proves the aggregate rejects every non-success D result. |
| `tests/hooks/verification-config.test.sh` | Checks workflow D symmetry and its fail-closed aggregate dependency. |
| `.claude/rules/hooks-and-tooling.md`, `AGENTS.md`, `CLAUDE.md` | Tell future contributors how to place tests and regenerate four-way CI assignments safely. |

### Task 1: Make D a first-class checked-in shard

**Files:**
- Modify: `tests/scripts/ci-test-shard-selection.test.ts`
- Modify: `scripts/run-ci-test-shard.mjs`
- Modify: `package.json`

- [x] **Step 1: Write the failing D selection contract**

Add `const SHARD_D = 'test-suite-shard-d'`. In the checked-in selection test, read `manifest.shards[SHARD_D]`, call `listShard(SHARD_D)`, require a nonempty sorted `tests/` list, include D in the duplicate-size and exact-union assertions, and compare the runner output to D. Add D as an empty assignment to the stale-manifest fixture so the fixture continues to test stale discovery rather than a missing key.

- [x] **Step 2: Prove the contract is red before production changes**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts
```

Expected: FAIL because the current runner reports `unknown CI shard: test-suite-shard-d` and the three-way manifest lacks D.

- [x] **Step 3: Implement the minimal four-shard command contract**

In `scripts/run-ci-test-shard.mjs`, make the ordered `SHARDS` list exactly:

```js
const SHARDS = [
  'test-suite-shard-a',
  'test-suite-shard-b',
  'test-suite-shard-c',
  'test-suite-shard-d',
];
```

In `package.json`, add `test:ci:shard-d` and `test:manifest:ci:shard-d` matching the existing A/B/C wrappers, and change `test:ci-shards:allocate` to pass all four explicit shard names. Do not change A/B/C command strings.

- [x] **Step 4: Prove the runner contract passes after the generated manifest exists**

After Task 2 writes D, run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts
```

Expected: PASS; all four runner invocations list the exact arrays stored in the manifest and their union equals live default discovery.

- [x] **Step 5: Commit the runner contract with its manifest**

```bash
git add scripts/run-ci-test-shard.mjs package.json scripts/ci-test-shards.json tests/scripts/ci-test-shard-selection.test.ts
git commit -m "feat(ci): support a fourth measured test shard"
```

### Task 2: Generate the B/D-only measured manifest

**Files:**
- Modify: `tests/scripts/ci-test-shard-allocation.test.ts`
- Modify: `scripts/ci-test-shards.json`

- [x] **Step 1: Add constrained allocation coverage**

Add a fixture to `tests/scripts/ci-test-shard-allocation.test.ts` with fixed A and C assignments and B-only timing entries. Invoke the allocator with:

```text
--shard-names test-suite-shard-a,test-suite-shard-b,test-suite-shard-c,test-suite-shard-d
--fixed-shard-manifest <fixture>
--fixed-shards test-suite-shard-a,test-suite-shard-c
```

Assert A and C exactly equal their source arrays, B/D are sorted and nonempty, B/D contain only former B files, and all four arrays have no duplicate and exhaustive coverage. Assert timing source and source commit are copied exactly into the output.

- [x] **Step 2: Run the constrained allocator test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-allocation.test.ts
```

Expected: PASS. The current allocator already supports multiple retained assignments; this regression test protects that prerequisite rather than adding a second allocator implementation.

- [x] **Step 3: Download and normalize only successful B reporter evidence**

Download the `test-suite-shard-b-evidence` artifact from run `34704662037`, attempt 4 into a new `/private/tmp/` directory. Extract `vitest-results/test-suite-shard-b.json`, then run:

```bash
./scripts/run-with-mise.sh yarn node scripts/collect-vitest-file-timings.mjs \
  --input /private/tmp/<artifact>/vitest-results/test-suite-shard-b.json \
  --output /private/tmp/<artifact>/b-timings.json \
  --repo-root . \
  --reporter-repo-root /home/runner/work/conquestoria/conquestoria
```

Reject the input if the reporter is unsuccessful or if either its retained B manifest or normalized reporter paths is not precisely B's current assignment. Record its pre-rebase PR-head SHA (`cf5ae947bf28afbc091452ce43af068288a97f6e`) as provenance and use the current base SHA (`b68a9561a3f79ccc2ebed43fb3cbab3ed4aca3df`) in the generated manifest; a rebase merge intentionally changes the commit ID without changing this verified assignment.

- [x] **Step 4: Generate the manifest with A/C retained**

Run the existing allocator with the artifact's exact `test-manifests/default.txt`, normalized B timing file, current manifest as the fixed manifest, fixed A/C names, and explicit four shard names:

```bash
./scripts/run-with-mise.sh yarn node scripts/allocate-ci-test-shards.mjs \
  --default-manifest /private/tmp/<artifact>/test-manifests/default.txt \
  --timings /private/tmp/<artifact>/b-timings.json \
  --output scripts/ci-test-shards.json \
  --shard-names test-suite-shard-a,test-suite-shard-b,test-suite-shard-c,test-suite-shard-d \
  --fixed-shard-manifest scripts/ci-test-shards.json \
  --fixed-shards test-suite-shard-a,test-suite-shard-c \
  --timing-source github-actions-vitest-json-run-34704662037-attempt-4 \
  --source-commit b68a9561a3f79ccc2ebed43fb3cbab3ed4aca3df
```

Compare the pre-generation A/C arrays to the generated A/C arrays byte-for-byte. Reject any change. Confirm the resulting weighted B/D estimates are nearly equal and every reporter path is assigned exactly once.

- [x] **Step 5: Run exact selection proof**

Run:

```bash
./scripts/run-with-mise.sh yarn test:manifest:ci:shard-a
./scripts/run-with-mise.sh yarn test:manifest:ci:shard-b
./scripts/run-with-mise.sh yarn test:manifest:ci:shard-c
./scripts/run-with-mise.sh yarn test:manifest:ci:shard-d
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts tests/scripts/ci-test-shard-allocation.test.ts
```

Expected: PASS. Each list contains only its stored sorted assignment; A/C remain unchanged and all four assignments cover the current default suite once.

### Task 3: Add the explicit D workflow job and fail-closed gate

**Files:**
- Modify: `tests/scripts/verify-merge-gate.test.ts`
- Modify: `tests/hooks/verification-config.test.sh`
- Modify: `scripts/verify-merge-gate.mjs`
- Modify: `.github/workflows/deploy.yml`

- [x] **Step 1: Write failing D gate and workflow assertions**

Add `test-suite-shard-d` to the successful needs fixture and `REQUIRED_JOBS`. Add a parameterized D non-success test asserting its name and status appear in stderr. In the shell contract, extract D from the workflow and assert its 15-minute timeout, D manifest command, D direct runner with `--report-json`, phase timing file, reporter artifact, no build/local-verifier/hooks duplication, and D entry in `merge-gate.needs`.

- [x] **Step 2: Prove the D workflow contract is red**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/verify-merge-gate.test.ts
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: FAIL because production gate/workflow definitions omit D.

- [x] **Step 3: Implement the explicit D job and dependency**

Copy C's workflow job into a standalone `test-suite-shard-d` job. Substitute only D's command, manifest filename, reporter filename, timing phase/file, and artifact name; retain checkout, setup, timeout, evidence retention, and direct execution shape. Add D to `merge-gate.needs`. Add D to `REQUIRED_JOBS` in `scripts/verify-merge-gate.mjs`. Do not replace explicit jobs with a matrix, alter worker configuration, or weaken an existing required result.

- [x] **Step 4: Run workflow contract tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/verify-merge-gate.test.ts
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: PASS. A missing, skipped, cancelled, or failed D result causes `merge-gate` to reject the workflow.

- [x] **Step 5: Commit the workflow gate**

```bash
git add .github/workflows/deploy.yml scripts/verify-merge-gate.mjs tests/scripts/verify-merge-gate.test.ts tests/hooks/verification-config.test.sh
git commit -m "ci: require the fourth measured test shard"
```

### Task 4: Preserve future test-placement and measurement guardrails

**Files:**
- Modify: `.claude/rules/hooks-and-tooling.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-09-12-issue-1075-fourth-test-shard.md`

- [x] **Step 1: Update the documented four-shard contract**

Replace the remaining three-shard command and merge-gate references with A/B/C/D. Require contributors who add, remove, or rename a default-discovered Vitest test to choose placement by test domain, run `yarn test:profile:default`, regenerate with the explicit four-name command, run the selection test, and commit the manifest. Preserve the rule that local tiers are independent of CI assignments.

State the constrained critical-shard rule precisely: retain every noncritical assignment byte-for-byte, normalize successful reporter JSON for only the critical shard, pass all retained shard names to `--fixed-shards`, and split the remaining files only among the critical shard and its new companion. For this topology, A/C are fixed and B/D are the only allocatable names.

- [ ] **Step 2: Run local direct shard commands once**

Run separately:

```bash
./scripts/run-with-mise.sh yarn test:ci:shard-a
./scripts/run-with-mise.sh yarn test:ci:shard-b
./scripts/run-with-mise.sh yarn test:ci:shard-c
./scripts/run-with-mise.sh yarn test:ci:shard-d
```

Expected: each exits zero. Together, the four execution commands cover the complete default suite exactly once.

- [x] **Step 3: Run final bounded verification and inspect both deltas**

Run separately:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test:durable
./scripts/run-with-mise.sh yarn test:durable:status
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

Expected: build and durable status pass for the current commit and working tree; no whitespace errors; committed and uncommitted source/configuration deltas are reviewed.

- [x] **Step 4: Update this plan honestly and commit guidance**

Tick only verified completed steps. Before the PR is created, keep Task 5 unchecked; after a merge, add `✅ merged (#PR)` status without claiming measurements that have not run. Commit:

```bash
git add .claude/rules/hooks-and-tooling.md AGENTS.md CLAUDE.md docs/superpowers/plans/2026-09-12-issue-1075-fourth-test-shard.md
git commit -m "docs(ci): document four-shard test placement"
```

### Task 5: Measure the candidate in GitHub Actions

**Files:**
- No repository changes

- [ ] **Step 1: Create a non-merged PR**

Push the branch and open a PR linked to #1075. State the 5m35s / 5m39s baseline, B's three measured durations, the retained B reporter source, exact fixed A/C invariant, unchanged macOS scope, and the single B-to-B/D changed variable.

- [ ] **Step 2: Verify one initial complete green workflow**

Confirm every required job including `test-suite-shard-d` and `merge-gate` completes green, and inspect D's retained manifest, reporter, and timing artifacts. On any failure, preserve artifacts and investigate the cause; do not rerun a failed job unchanged.

- [ ] **Step 3: Collect three fresh sequential full-workflow attempts**

After the initial workflow is green, use whole-workflow reruns only. Wait for each complete result before starting the next. Record per attempt: first job start, merge-gate completion, each shard timing, queue time, positive job seconds, and URL.

- [ ] **Step 4: Compare to the predeclared baseline and decide**

Calculate candidate median and worst required-gate wall time and median runner seconds. Accept only if the fixed threshold, exact-coverage checks, reliability condition, and 50% runner-minute guardrail hold. Otherwise leave the PR unmerged, state which condition failed, and propose the next isolated hypothesis rather than changing this experiment during measurement.

## Plan self-review

- **Coverage:** Task 1 makes D launchable; Task 2 supplies timing-informed exact ownership and the A/C retention proof; Task 3 makes D a stable, fail-closed required job; Task 4 documents future placement and verifies local behavior; Task 5 measures one changed variable with defined pass/fail thresholds.
- **No placeholders:** The reporter path, exact source run/attempt/commit, allocation flags, job names, test files, verification commands, and decision thresholds are concrete. `/private/tmp/<artifact>` is deliberately a newly-created temporary directory, not a repository artifact path.
- **Consistency:** The same stable names A/B/C/D are used by the runner, manifest, package scripts, workflow, gate, tests, docs, and measurements. The allocator fixes A/C and allocates B/D in every relevant task.
