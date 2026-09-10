# Issue #1075 CI Merge Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute inline: this repository explicitly forbids subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a correct, observable GitHub merge gate; improve CI only through bounded, evidence-based experiments while preserving every existing default test, hook, browser, build, and distribution guarantee.

**Architecture:** Keep test selection in the existing shell tier runner, but give it one real-Vitest manifest mode so both CI diagnostics and regression tests exercise the exact argument construction. Replace the monolithic CI test job with independently required fast/slow test lanes, one hooks execution, and a single `always()` aggregate that makes a checked, explicit decision from each child result. Browser reliability work is intentionally a separate track: retain artifacts first, then change product or fixture code only after evidence identifies a cause.

**Tech Stack:** GitHub Actions, GitHub branch protection, POSIX shell, Node/TypeScript, Vitest 4, Playwright 1.59, Yarn 4.

---

## Fixed contract and current facts

- Base every change on remote `main`; current planning base is `f137adbc`.
- The standard suite currently passes locally: 635 files, 11,012 passing assertions, 3 intentional skips.
- At issue audit time, `vite.config.ts` discovered beneath `tests/` while the tier runner handed `tests/...` strings to `--exclude`; the resulting fast/slow overlap is the defect addressed by Tasks 1–2.
- GitHub branch protection was read on 2026-09-10: it still requires contexts `build` and `test`, while the workflow job is named `web-build`. Re-read protection immediately before any setting mutation; do not remove enforcement as an intermediate state.
- Long-horizon tests remain explicit-run only. Default discovery must continue to exclude `e2e/**` and `simulation/long-horizon/**`; #1005/#1067 and #1007/#1073 are not work items in this plan.
- Do not proceed from Phase 1 to any timing experiment until selection and aggregate-gate proofs pass. Stop a validation/reproduction batch after two materially similar failures.

## Planned delivery slices

| Slice | Independently mergeable result | Not included |
|---|---|---|
| A | Correct tier selection, actual-discovery proof, manifests, and truthful local documentation | CI topology or performance claim |
| B | Required two-lane workflow plus a fail-closed aggregate and synchronized branch protection | Browser diagnosis/fix |
| C | Browser failure artifacts and trace retention | A speculative compact/vassalage product fix |
| D | Evidence-backed compact/vassalage fixes, if a reproducing cause exists | Retry/timeout workaround |
| E | At most the measured performance candidates allowed by #1075 | Open-ended CI tuning |

### Task 1: Make tier file selection testable through real Vitest

**Files:**
- Modify: `scripts/run-tests-by-tier.sh`
- Modify: `package.json`
- Create: `tests/scripts/test-tier-selection.test.ts`
- Modify: `tests/app/determinism-contract-meta.test.ts`
- Modify: `tests/scripts/ai-long-horizon-isolation.test.ts` only if its explicit gate-file inventory needs the new manifest command

- [ ] In `tests/scripts/test-tier-selection.test.ts`, first invoke a documented manifest script through the real installed Yarn/Vitest executable. Before runner support exists, assert its expected failure is the missing `--list-files` capability; do not claim that this first red run demonstrates duplicate membership.
- [ ] Add `--list-files` mode to `run-tests-by-tier.sh`. It must use the same mode parsing and same fast/slow argument builder as normal execution, but invoke `yarn vitest list --filesOnly` instead of `yarn vitest run`. Do not add a fake Yarn path, mock Vitest, or copy selection logic into the test. Add the package scripts exposing default, fast, and slow manifests through that runner; keep existing `test`, `test:fast`, and `test:slow` behavior unchanged.
- [ ] Re-run the real-discovery test after list support is added and confirm its red failure reports slow-file overlap. Only then normalize `--exclude` operands at the Vitest boundary: transform `tests/app/simulation-determinism.test.ts` into `app/simulation-determinism.test.ts`, because `test.dir` is `tests/`. Keep slow positional files and user-supplied positional focus filters root-relative (`tests/...`) so focused `yarn test:slow -- tests/foo.test.ts` behavior does not regress.
- [ ] Make the real-discovery test parse the package manifest scripts and assert all of the following against normalized repo-relative paths:
  - fast and slow have no overlapping file;
  - their union exactly equals default discovery;
  - every union member has exactly one membership;
  - each declared slow file is in slow and absent from fast;
  - this new ordinary `*.test.ts` file itself is in the union without changing an allow-list;
  - no `tests/e2e/**` or `tests/simulation/long-horizon/**` file appears in any default-tier manifest.
- [ ] Retain the existing deterministic-suite meta assertion, but make it read the canonical declared slow list rather than a duplicate/truncated documentation list.
- [ ] After the normalization implementation, run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/scripts/test-tier-selection.test.ts tests/app/determinism-contract-meta.test.ts tests/scripts/ai-long-horizon-isolation.test.ts
  ```

- [ ] Commit with a selection-only subject, for example `fix(ci): prove fast and slow Vitest selection`.

### Task 2: Preserve local safeguards and document the corrected split

**Files:**
- Modify: `.claude/rules/hooks-and-tooling.md`
- Modify: `tests/hooks/run-with-mise-worktree.test.sh` if the new package scripts require wrapper coverage

- [ ] Update the local fast/slow documentation to state the corrected relative-exclusion rule, list all current slow files by deriving them from the canonical script where practical, and remove the now-false statement that the old split is known-good. Preserve host lease, durable evidence, cache isolation, and long-horizon guidance exactly.
- [ ] Extend the wrapper smoke coverage if the new package scripts change the public command-runner contract. Keep the long-horizon isolation test’s prohibition intact.
- [ ] Run `bash scripts/run-with-mise.sh yarn test:hooks` and the Task 1 targeted Vitest command. Commit documentation/evidence work separately from topology changes.

### Task 3: Implement a fail-closed aggregate required gate

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Create: `scripts/verify-merge-gate.mjs`
- Create: `tests/scripts/verify-merge-gate.test.ts`
- Modify: `tests/hooks/verification-config.test.sh`
- Create: `scripts/ci-record-phase-timing.mjs`
- Create: `scripts/collect-ci-experiment.mjs`

- [ ] Split the current `test` job into `test-fast` and `test-slow`, both on standard GitHub-hosted Ubuntu runners. Each lane installs locked dependencies and runs only its corrected Vitest selection; neither calls `verify:push` or a test-plus-build wrapper. Before the fast lane runs tests, emit its `fast` and `default` real-Vitest manifests; before the slow lane runs tests, emit its `slow` manifest. Upload those deterministic files as bounded-retention artifacts with `if: always()`, including a failed/cancelled test result.
- [ ] Run hook smoke tests exactly once in a dedicated `hooks` job (or in `test-fast` only if measurements show no critical-path cost). Do not duplicate hooks in the slow lane.
- [ ] Keep `web-build` as the sole owner of `yarn build`, retain its same-commit Pages artifact, and preserve the existing web/Tauri distribution paths and desktop conditional build checks.
- [ ] Add `merge-gate` with `if: ${{ always() }}` and `needs` covering `web-build`, `test-fast`, `test-slow`, `hooks`, `web-smoke`, `security-analysis`, `desktop-change-check`, `tauri-frontend-build`, `tauri-macos-build`, and `pirate-audio-reproducibility`. Pass `toJSON(needs)`, `github.event_name`, `github.ref`, and `needs.desktop-change-check.outputs.desktop_changed` to `verify-merge-gate.mjs`. It must accept exactly `success` for mandatory children and reject missing, `failure`, `cancelled`, `timed_out`, `neutral`, `action_required`, and unjustified `skipped` results. Permit `tauri-macos-build: skipped` only when desktop inputs did not change on a PR or in a documented benchmark dispatch, and `pirate-audio-reproducibility: skipped` only outside a PR; permit a conditional job’s `success` when it did run. The aggregate itself must be red when a required child is absent or noncompliant.
- [ ] In `tests/scripts/verify-merge-gate.test.ts`, execute the real Node verifier with serialized `needs` fixtures and explicit event/ref/desktop inputs. Cover: all-required success; every mandatory failure class; cancellation; missing child; an unjustified skip; desktop false/true PR cases; and the non-PR pirate skip. Assert nonzero exit and a child-specific diagnostic for each reject.
- [ ] Change `deploy.needs` to `merge-gate` (or retain `web-build` plus `merge-gate` if the workflow makes that dependency clearer), and restrict its condition to a successful `push` on `main`, so a renamed-away `test` job cannot strand Pages deployment and a benchmark dispatch can never publish Pages. Preserve the existing same-commit Pages artifact and deploy only after aggregate success.
- [ ] Add `ci-record-phase-timing.mjs` as a command wrapper that writes one JSON record containing phase name, commit, start/end epoch, exit status, and elapsed milliseconds. Use it around each test lane, hooks, and web build; upload the records with the manifest artifacts. Add `collect-ci-experiment.mjs` to query each recorded workflow run/jobs and emit a ledger row with trigger-to-start queue delay, aggregate wall time, job durations, artifact URLs, and summed runner minutes. Unit-test both scripts with fixed process/API fixtures.
- [ ] Extend `verification-config.test.sh` to confirm the aggregate’s exact `always()` condition, children, test-only lanes, one hook execution, manifest/timing artifact uploads, and the updated Pages dependency.
- [ ] First run a PR containing `merge-gate`; query its actual check run and verify its exact name and `github-actions` app ID. Re-read branch protection, then atomically PATCH only required-status-check settings to replace stale `build`/`test` with that verified `{ context, app_id }` pair while retaining strict mode. Verify the response and PR Checks tab; do not remove protection as an intermediate state or guess the check context.
- [ ] Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/scripts/verify-merge-gate.test.ts
  bash scripts/run-with-mise.sh yarn test:hooks
  ```

- [ ] Commit workflow code and its tests. Do not claim a performance improvement yet.

### Task 4: Run and decide the first genuine two-lane experiment

**Files:**
- Modify: `docs/superpowers/plans/2026-09-10-issue-1075-ci-merge-gate.md` only to tick completed steps/status after merge
- Update: GitHub issue #1075 experiment ledger

- [ ] Add a `workflow_dispatch` trigger for an explicit benchmark run on a selected fixed ref. Preserve normal PR/main behavior; do not permit manual dispatch to deploy Pages, and make the desktop-change check report a documented non-applicable value for benchmark dispatches so the aggregate can accept the resulting macOS skip. Update every PR/main-only validation job condition intentionally rather than accidentally skipping it on dispatch.
- [ ] Freeze product source, lockfile, runner image, worker settings, manifests, and workflow variables. Create one baseline revision with corrected selection proof but monolithic test execution, then one candidate revision differing only in the two-lane topology and removal of test-job rebuild work. Dispatch each attempt against that exact ref; do not use failed-job-only reruns as samples.
- [ ] Alternate three fresh, complete dispatches for each fixed revision. Run `collect-ci-experiment.mjs` after each attempt and attach its ledger row to #1075. Record commit/tree IDs, workflow start/completion, trigger-to-start queue delay, phase timings, child results, manifest and timing artifacts, and summed runner minutes. Record Pages-ready time only from the normal post-merge `push` to `main`, labelled as a main-release observation rather than a PR benchmark.
- [ ] Reject the candidate unless its median required-gate improvement is at least `max(20 seconds, 10% of baseline median)`, or it reaches the final target without a median regression. Treat a failed workflow, duplicated/missing manifest member, hidden retry, or aggregate false-success as a rejection regardless of elapsed time.
- [ ] If it passes the three-run screen, extend to six fresh complete attempts per revision. Accept only if the same median rule holds, candidate worst case is no more than 5% above baseline worst case, and candidate median runner minutes are no more than 50% above baseline.
- [ ] Update the issue ledger with every attempt, including failures and diagnostic-only reruns. If rejected, retain Tasks 1–3 correctness changes, report the measured critical lane, and count this as experiment one; do not launch a new topology automatically.

### Task 5: Retain Playwright failure evidence before changing browser behavior

**Files:**
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `tests/platform/playwright-config.test.ts`
- Modify: `tests/hooks/verification-config.test.sh`

- [ ] Change Playwright tracing from `on-first-retry` to `retain-on-failure`, so ordinary first-attempt failures produce trace material even when retries are zero. Configure an HTML reporter with a stable `playwright-report` output folder and `open: 'never'`, while preserving the test-results output folder. Do not add browser retries.
- [ ] After `yarn test:web-smoke`, add a failure-only artifact upload step that retains Playwright result directories, attached diagnostic JSON, trace archives, screenshots, and HTML report when present. Set a bounded retention period and `if-no-files-found: warn`; the test failure must remain red if uploading is unavailable.
- [ ] Extend the config test to assert first-attempt failure tracing. Extend workflow static coverage to require the failure-only artifact step, expected paths, and bounded retention.
- [ ] Add a temporary, deliberately failing browser fixture only in a protected diagnostic branch/PR to verify the artifact is downloadable and the `web-smoke` check is red; remove that fixture before merging. Link the artifact and run to #1075.
- [ ] Run the platform test and hook suite locally, then merge the retention-only slice independently.

### Task 6: Diagnose and fix compact-panel and vassalage failures only from captured evidence

**Files:**
- Investigate: `tests/e2e/issue-496-compacts.spec.ts`, `tests/e2e/issue-910-vassalage.spec.ts`, their helpers, and the concrete source module named by DOM readiness/browser-error/trace evidence
- Test: the same affected E2E spec plus its mirrored unit/integration test if source changes

- [ ] Use retained traces, `diplomacy-panel-diagnostic.json`, console/page errors, DOM snapshots, and readiness markers to write a concise reproduction record for each failure class. Keep compact reopen and vassalage interaction as distinct hypotheses.
- [ ] Reproduce each affected test with the CI worker setting using `--repeat-each=10`; stop after two materially similar failures, preserving attachments and reporting the cause or remaining unknown.
- [ ] Only after a causal hypothesis exists, write a focused regression that captures the observed readiness/DOM synchronization defect. Run it red, make the minimal product or fixture synchronization change, and run it green. Do not use forced clicks, blanket waits, retries, or global timeout increases as a substitute.
- [ ] Repeat the affected scenario ten times at the existing CI worker setting with zero unexpected failures, then run the complete browser suite. If a browser dependency install failure is separately observed, compare an official Playwright image matching the installed package version in an isolated workflow change; validate Node/Yarn compatibility and every browser test before adopting it.
- [ ] Record reproductions, attachments, repeat counts, and conclusions in #1075. Merge compact and vassalage changes separately unless evidence demonstrates one shared root cause.

### Task 7: Apply only further measured interventions, within the global cap

**Files:**
- Modify only the workflow/script/test files directly implicated by measured critical-path evidence
- Modify: this plan and the #1075 ledger after each completed/rejected experiment

- [ ] After a rejected corrected split, choose exactly one next candidate: distribute the measured slowest lane (maximum four total test runners); move hooks only if measured overlap saves at least 20 seconds; remove one profiled, repeated deterministic simulation setup while preserving isolation; or compare one worker/pool setting at the installed Vitest version.
- [ ] For a sharding candidate, generate one validated manifest and repeat Task 1’s exact disjoint-union checks across all shards. Never shard merely because the superseded plan prescribed it.
- [ ] Use the Task 4 baseline/candidate protocol for every candidate. Stop the optimization program after two consecutive rejected experiments or four total performance experiments, whichever arrives first.
- [ ] If the final candidate meets the target, require six fresh complete green attempts with required-gate median at most 5m30s and worst time at most 7m. If the cap is reached without that result, keep accepted correctness work, publish achieved time/cost/critical phase, and leave #1075 open with the explicit decision: accept the ceiling, fund a scoped hot-spot optimization, or change coverage policy.

### Task 8: Final verification and handoff

**Files:**
- Modify: this plan’s completed phase checkboxes and status annotations in the same PR that completes each phase
- Update: GitHub issue #1075 ledger/comment

- [ ] For every changed `src/` file, run `scripts/check-src-rule-violations.sh` and its mirrored tests. This plan expects CI/scripts/docs changes, but preserve this rule if a browser diagnosis reaches source.
- [ ] For workflow/script/hook changes, run `bash scripts/run-with-mise.sh yarn test:hooks`, all targeted Vitest tests, then `bash scripts/run-with-mise.sh yarn build`. When distribution paths are touched, also run the Tauri checks required by repository policy.
- [ ] Before a PR/push, run `bash scripts/run-with-mise.sh yarn test:durable` followed by `bash scripts/run-with-mise.sh yarn test:durable:status`, and inspect both `git diff --stat origin/main...HEAD` and the full committed/uncommitted diff.
- [ ] Confirm the web build still uses `/conquestoria/`, the Tauri build uses relative paths, manifest artifacts prove exactly-once default coverage, and the live protected branch requires the verified aggregate.
- [ ] Update the issue ledger with final references, selected manifests, measured outcomes, failure evidence, and the acceptance/rejection decision. Do not characterize a partial sample, a failed-job-only rerun, or a single green workflow as confirmation.
