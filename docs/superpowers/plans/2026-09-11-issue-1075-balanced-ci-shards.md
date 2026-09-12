# Balanced CI Test Shards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading, unbalanced `test-fast` / `test-slow` CI jobs with two named, duration-balanced full-suite shards, while preserving a clearly named local regular/intensive-simulations split and enforcing future-test routing.

**Architecture:** Local and CI selection serve different purposes. A local tier runner keeps expensive simulations out of the pre-push gate. A checked-in CI shard manifest assigns every Vitest-default test file to exactly one of two duration-balanced jobs. Small Node utilities own profiling-result parsing, deterministic allocation, and CI-shard execution; workflow YAML only invokes those utilities and publishes their evidence.

**Tech Stack:** Node.js ESM utility scripts, Vitest JSON reporter, GitHub Actions, shell scripts, TypeScript/Vitest, shell hook tests.

---

## Scope and fixed decisions

- Do not use Vitest `--shard`: it balances file counts, whereas the measured problem is runtime imbalance. The project-owned allocator uses per-file timing weights and a deterministic longest-processing-time greedy split.
- Retain two explicit GitHub Actions jobs rather than a matrix. A matrix's default `fail-fast` behavior can cancel the peer shard and make diagnostic evidence incomplete.
- Keep the existing 15-minute shard timeout, worker configuration, default `yarn test` scope, browser jobs, and coverage policy unchanged.
- The #365 map-presentation browser-test timeout is not part of this change. Do not mask it by increasing browser timeouts or weakening browser checks.
- Replace `fast`/`slow` in user-facing commands, hooks, workflow names, artifact names, and policy prose. Internal historical issue references may remain where necessary.
- New default-discovered Vitest tests must be assigned to one CI shard in the checked-in manifest. The validation command must fail on a missing, duplicate, stale, or non-default assignment.

## Task 1: Rename the local split around its actual purpose

**Files:**
- Modify: `package.json`
- Rename: `scripts/run-tests-by-tier.sh` to `scripts/run-tests-by-local-tier.sh`
- Modify: `scripts/run-test-suite.sh`
- Modify: `scripts/verify-before-push.sh`
- Modify: `.githooks/pre-push`
- Modify: `.claude/hooks/require-green-before-push.sh`
- Modify: `vite.config.ts`
- Rename: `tests/scripts/test-tier-selection.test.ts` to `tests/scripts/local-test-tier-selection.test.ts`
- Modify: `tests/app/determinism-contract-meta.test.ts`
- Modify: `tests/scripts/perf-isolation.test.ts`
- Modify: `tests/scripts/ai-long-horizon-isolation.test.ts`
- Modify: `tests/storage/save-compat-matrix.test.ts`
- Modify: `scripts/run-perf-report.sh`
- Modify: `scripts/run-ai-long-horizon.sh`
- Modify: `tests/hooks/git-pre-push.test.sh`
- Modify: `tests/hooks/require-green-before-push.test.sh`
- Modify: `tests/hooks/verify-before-push.test.sh`
- Modify: `tests/hooks/run-with-mise-worktree.test.sh`

- [ ] **Step 1: Write failing focused expectations for the semantic local interface.**

  Update the renamed tier-selection test to name the two selections `regular` and `intensive-simulations`. It must retain its real-Vitest-discovery proof that the selections are disjoint and exhaustive, and prove a supplied focused intensive path does not union with all intensive tests. Update hook fixtures to expect `--regular` and `test:regular` instead of `--fast` and `test:fast`.

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/local-test-tier-selection.test.ts tests/hooks/verify-before-push.test.sh tests/hooks/git-pre-push.test.sh tests/hooks/require-green-before-push.test.sh`

  Expected: failures because the old commands and flag are still wired.

- [ ] **Step 2: Rename commands, runner modes, and pre-push flag without changing the test sets.**

  In `package.json`, replace the public scripts with:

  ```json
  "test:regular": "sh scripts/run-test-suite.sh regular",
  "test:intensive-simulations": "sh scripts/run-test-suite.sh intensive-simulations",
  "test:manifest:regular": "sh scripts/run-tests-by-local-tier.sh regular --list-files",
  "test:manifest:intensive-simulations": "sh scripts/run-tests-by-local-tier.sh intensive-simulations --list-files"
  ```

  Rename the shell runner and its modes. Preserve `SLOW_TEST_FILES` only if changing that variable would obscure the established fixture list; expose its purpose in comments as the intensive-simulations local list. Change the verifier option to `--regular` and bind it to `TEST_YARN_SCRIPT=test:regular`; update both real pre-push callers to use that option. Keep a full verifier invocation (without `--regular`) running `yarn test`.

  Update comments and isolation-contract tests so `test:regular` and `test:intensive-simulations` are the only local tier terms. The moved selection regression must remain in the intensive list.

- [ ] **Step 3: Run local-tier and hook regressions.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/local-test-tier-selection.test.ts tests/app/determinism-contract-meta.test.ts tests/scripts/perf-isolation.test.ts tests/scripts/ai-long-horizon-isolation.test.ts tests/storage/save-compat-matrix.test.ts`

  Run: `./scripts/run-with-mise.sh yarn test:hooks`

  Expected: all pass; `yarn test:manifest:regular` plus `yarn test:manifest:intensive-simulations` yields exactly the default manifest, with no overlap.

- [ ] **Step 4: Commit the local semantic rename.**

  ```bash
  git add package.json vite.config.ts scripts .githooks .claude/hooks tests
  git commit -m "refactor(ci): name local test tiers by purpose"
  ```

## Task 2: Add deterministic timing ingestion and shard allocation

**Files:**
- Create: `scripts/collect-vitest-file-timings.mjs`
- Create: `scripts/allocate-ci-test-shards.mjs`
- Create: `tests/scripts/ci-test-shard-allocation.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing parser/allocation tests using a minimal JSON-reporter fixture.**

  The fixture must use the installed Vitest JSON reporter shape: `testResults[]` records with `name`, `startTime`, and `endTime`. Cover a valid root-relative result, an absolute path rooted in the repository, a missing/non-finite timing, duplicate normalized paths, and a failed test result. The allocator tests must prove all of the following:

  - equal weights use lexical order as the tie breaker;
  - it chooses the currently lower-total shard, choosing `test-suite-shard-a` on an equal-total tie;
  - it rejects timing records that do not exactly cover the supplied default manifest;
  - output shards are disjoint and their union equals the default manifest.

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-allocation.test.ts`

  Expected: fails because neither utility exists.

- [ ] **Step 2: Implement the narrow JSON parser.**

  `collect-vitest-file-timings.mjs` accepts `--input <vitest-json> --output <timings-json> --repo-root <path>`. It must parse only successful test runs, normalize every `testResults[].name` to a root-relative POSIX path, require finite `startTime`/`endTime` with `endTime >= startTime`, reject duplicates, and write:

  ```json
  {
    "schemaVersion": 1,
    "files": {
      "tests/example.test.ts": 1250
    }
  }
  ```

  This utility deliberately owns reporter-schema validation so workflow and allocation code do not parse untrusted reporter JSON independently.

- [ ] **Step 3: Implement deterministic longest-processing-time allocation.**

  `allocate-ci-test-shards.mjs` accepts `--default-manifest <path> --timings <path> --output <path>`. Read the default manifest as one root-relative file per line; require exact set equality with `timings.files`; sort entries by descending milliseconds and then lexical path; append each entry to the lower accumulated total, assigning ties to `test-suite-shard-a`. Sort each emitted list lexically for readable, stable reviews. Emit both provenance and sufficient weights to reproduce the allocation:

  ```json
  {
    "schemaVersion": 1,
    "source": { "commit": "<git SHA>", "timingSource": "vitest-json" },
    "files": { "tests/example.test.ts": 1250 },
    "shards": {
      "test-suite-shard-a": ["tests/example.test.ts"],
      "test-suite-shard-b": []
    }
  }
  ```

  Read the commit with `git rev-parse HEAD`; fail rather than silently omitting provenance if Git cannot supply it. Add `test:profile:default` to run Vitest with both terminal and JSON reporters, and `test:ci-shards:allocate` to invoke the allocation utility with its generated profile and manifest paths. These are intentional maintenance commands, not routine CI steps.

- [ ] **Step 4: Run parser/allocation tests and inspect a generated tiny fixture.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-allocation.test.ts`

  Expected: pass. Confirm the checked test fixture makes the allocation input/output relationship reviewable without a live CI run.

- [ ] **Step 5: Commit the deterministic allocation tools.**

  ```bash
  git add package.json scripts/collect-vitest-file-timings.mjs scripts/allocate-ci-test-shards.mjs tests/scripts/ci-test-shard-allocation.test.ts
  git commit -m "feat(ci): add deterministic duration-based shard allocator"
  ```

## Task 3: Generate and enforce the checked-in CI shard contract

**Files:**
- Create: `scripts/ci-test-shards.json`
- Create: `scripts/run-ci-test-shard.mjs`
- Create: `tests/scripts/ci-test-shard-selection.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing shard-contract tests.**

  Test real Vitest default discovery, the checked-in manifest, and the runner's `--list-files` mode. Require that both named CI shard lists are nonempty; no file appears twice; their union exactly equals default discovery; every file is root-relative; and a manifest entry that is stale or an unassigned newly discovered test produces a diagnostic error. Include a runner test proving an unknown shard name is rejected before attempting Vitest.

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts`

  Expected: fails until the checked-in manifest and runner exist.

- [ ] **Step 2: Implement the single-purpose CI shard runner.**

  `run-ci-test-shard.mjs` accepts `--shard test-suite-shard-a|test-suite-shard-b`, `--list-files`, and optional `--report-json <path>`. It reads and validates `scripts/ci-test-shards.json`; `--list-files` prints only the chosen root-relative manifest paths. Otherwise it launches exactly one command of this form:

  ```text
  yarn vitest run <listed files> --reporter=default --reporter=json --outputFile.json=<report-json>
  ```

  Without `--report-json`, omit the JSON-reporter arguments for useful local diagnosis. Propagate the child status. Do not put test-selection logic in workflow YAML.

  Add package scripts `test:ci:shard-a`, `test:ci:shard-b`, `test:manifest:ci:shard-a`, and `test:manifest:ci:shard-b` that invoke this runner with the explicit job names. The two CI scripts must be independent of the local regular/intensive classification.

- [ ] **Step 3: Produce the initial authoritative profile and checked-in allocation.**

  Run the profiling command once on the current branch, parse its reporter output, and allocate from the real `yarn test:manifest` result. Check in only `scripts/ci-test-shards.json`, including the per-file measurements and its source commit. Do not check in transient raw reporter output.

  Run: `./scripts/run-with-mise.sh yarn test:profile:default`

  Run: `node scripts/collect-vitest-file-timings.mjs --input .verification/ci-shard-profile/vitest.json --output .verification/ci-shard-profile/timings.json --repo-root .`

  Run: `./scripts/run-with-mise.sh yarn test:ci-shards:allocate`

  Expected: the two computed totals are materially closer than the old 624-regular/17-intensive split, and all default-discovered tests are assigned once.

- [ ] **Step 4: Run the contract tests and both shard commands.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts tests/scripts/ci-test-shard-allocation.test.ts`

  Run separately: `./scripts/run-with-mise.sh yarn test:ci:shard-a`

  Run separately: `./scripts/run-with-mise.sh yarn test:ci:shard-b`

  Expected: both commands pass and leave JSON results only when explicitly requested.

- [ ] **Step 5: Commit the shard contract.**

  ```bash
  git add package.json scripts/ci-test-shards.json scripts/run-ci-test-shard.mjs tests/scripts/ci-test-shard-selection.test.ts
  git commit -m "feat(ci): assign full suite to balanced named shards"
  ```

## Task 4: Wire GitHub Actions and merge gating to the new evidence

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/verify-merge-gate.mjs`
- Modify: `tests/scripts/verify-merge-gate.test.ts`
- Modify: `tests/scripts/ci-experiment-tools.test.ts`
- Modify: `tests/hooks/verification-config.test.sh`

- [ ] **Step 1: Update merge-gate and workflow-contract tests first.**

  Replace `test-fast`/`test-slow` fixtures and expected required jobs with `test-suite-shard-a`/`test-suite-shard-b`. Add assertions that each job:

  - retains `timeout-minutes: 15`;
  - writes its actual static manifest with `test:manifest:ci:shard-a` or `test:manifest:ci:shard-b`;
  - runs the matching `test:ci:shard-*` command through `ci-record-phase-timing.mjs`;
  - passes a distinct JSON-reporter output path;
  - uploads its manifest, phase timing, and reporter JSON artifact;
  - is a direct `merge-gate` dependency and fails closed on any non-success result.

  Update experiment-tool fixtures to use the new job names, proving downstream timing collection keeps recognizing them.

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/verify-merge-gate.test.ts tests/scripts/ci-experiment-tools.test.ts`

  Run: `./scripts/run-with-mise.sh yarn test:hooks`

  Expected: failures until workflow and gate are changed.

- [ ] **Step 2: Replace the workflow jobs with explicit balanced-shard jobs.**

  In `.github/workflows/deploy.yml`, replace `test-fast` and `test-slow` with `test-suite-shard-a` and `test-suite-shard-b`. Each remains an explicit job with the existing setup and 15-minute timeout. Use only the package commands described above; do not embed static paths or selection conditions in YAML. Use artifact names that match the job and retain failure upload behavior. Change `merge-gate.needs` to list both exact job IDs; update `scripts/verify-merge-gate.mjs` to require the same list.

- [ ] **Step 3: Run CI-contract and gate tests.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/verify-merge-gate.test.ts tests/scripts/ci-experiment-tools.test.ts`

  Run: `./scripts/run-with-mise.sh yarn test:hooks`

  Expected: all pass; the tests prove both shard results block merge on failure and artifacts expose per-file timing data for the next rebalance.

- [ ] **Step 4: Commit workflow and gate wiring.**

  ```bash
  git add .github/workflows/deploy.yml scripts/verify-merge-gate.mjs tests/scripts/verify-merge-gate.test.ts tests/scripts/ci-experiment-tools.test.ts tests/hooks/verification-config.test.sh
  git commit -m "ci: gate merges on balanced full-suite shards"
  ```

## Task 5: Publish agent routing rules and perform repository verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.claude/rules/hooks-and-tooling.md`
- Modify: `.claude/rules/performance-budgets.md`
- Modify: `.claude/rules/ai-simulation.md`
- Modify: `.claude/rules/game-systems.md`

- [ ] **Step 1: Add concise, enforced future-test placement guidance.**

  In `AGENTS.md`, add a concise agent obligation: before adding a default Vitest test, update `scripts/ci-test-shards.json` through the allocator workflow and run the shard-contract regression; classify an expensive multi-city/era/seed test in the local intensive-simulations list; do not place browser tests in a Vitest shard.

  In `.claude/rules/hooks-and-tooling.md`, make the canonical routing table explicit:

  | Test kind | Location | Local selection | CI selection |
  | --- | --- | --- | --- |
  | Production unit/system/UI test | Mirrored `tests/<domain>/` path | regular unless expensive | exactly one balanced CI shard |
  | Multi-city/era/seed or long-horizon simulation | Mirrored domain path; `tests/simulation/long-horizon/` only when intentionally excluded from default Vitest | intensive-simulations | exactly one balanced CI shard if default-discovered |
  | Browser test | `tests/e2e/` | browser command | existing browser job, never Vitest shard |
  | Tooling script | `tests/scripts/` | regular unless expensive | exactly one balanced CI shard |
  | Hook or workflow contract | `tests/hooks/` | `yarn test:hooks` plus relevant targeted test | hook job and exactly one default Vitest shard when discovered |

  Explain that local classification and CI assignment are independent, enumerate the required profile/allocate/contract workflow for additions and intentional removals, and require a focused regression before production changes. Update all old-term policy prose consistently.

- [ ] **Step 2: Verify docs and policy references mechanically.**

  Run: `rg -n "test:fast|test:slow|--fast|run-tests-by-tier|manifest:fast|manifest:slow|test-fast|test-slow" AGENTS.md CLAUDE.md .claude .githooks scripts tests package.json vite.config.ts .github/workflows/deploy.yml`

  Expected: no obsolete user-facing reference remains; any retained historical issue label is deliberate and documented.

- [ ] **Step 3: Run source-policy and focused regression checks.**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/scripts/local-test-tier-selection.test.ts tests/scripts/ci-test-shard-allocation.test.ts tests/scripts/ci-test-shard-selection.test.ts tests/scripts/verify-merge-gate.test.ts tests/scripts/ci-experiment-tools.test.ts`

  Run: `./scripts/run-with-mise.sh yarn test:hooks`

  Run: `git diff --check`

  Expected: all pass with no whitespace errors.

- [ ] **Step 4: Run pre-PR verification separately and inspect all diffs.**

  Run: `./scripts/run-with-mise.sh yarn build`

  Run: `./scripts/run-with-mise.sh yarn test:durable`

  Run: `./scripts/run-with-mise.sh yarn test:durable:status`

  Run: `git diff --stat origin/main...HEAD`

  Run: `git diff --stat`

  Run: `git diff origin/main...HEAD`

  Expected: build passes; durable status proves the current `HEAD` and working tree passed; reviewed diff contains only the planned CI, test, tooling, and documentation changes.

- [ ] **Step 5: Commit policy/guardrails and create the pull request.**

  ```bash
  git add AGENTS.md CLAUDE.md .claude/rules
  git commit -m "docs(ci): guide future balanced shard assignments"
  git push -u origin codex/issue-1075-ci-balanced-shards
  ```

  Create a PR that links #1075, explains that the local semantic split is separate from CI balancing, lists build/durable/focused verification, and explicitly states that the known #365 browser timeout is outside this PR.

## Post-merge measurement acceptance criteria

- After the independent #365 browser timeout repair has merged, dispatch the workflow three times sequentially from the PR head. Do not launch another run until the previous one has terminal status.
- Record queue time, per-shard phase duration, job duration, total wall time, and runner time with `scripts/collect-ci-experiment.mjs`.
- Consider the balance objective met only if the median absolute per-shard phase-duration spread across the three runs is at most 15%, both shards are green, the merge gate is green, and no check has been skipped or weakened.
- If the target is missed, use the uploaded reporter JSON artifacts to refresh the checked-in timings and re-run deterministic allocation. Do not respond by splitting on file count, raising timeouts, or relaxing tests.
