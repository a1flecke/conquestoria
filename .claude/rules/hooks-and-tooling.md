---
paths:
  - ".claude/**"
  - "tests/hooks/**"
---

# Hooks And Tooling

## PreToolUse / PostToolUse hooks read JSON from stdin
- Claude Code hooks do NOT receive `CLAUDE_TOOL_INPUT` or any other env var holding the tool input.
- Tool input arrives as JSON on stdin. Parse it with `jq`:
  - `jq -r '.tool_name'` for the tool name
  - `jq -r '.tool_input.file_path // empty'` for Write/Edit/Read paths
  - `jq -r '.tool_input.command // empty'` for Bash commands
- Read stdin exactly once into a variable, then query that variable with `jq`:
  ```bash
  INPUT=$(cat)
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  ```
- Source: https://code.claude.com/docs/en/hooks

## Hook exit codes
- `0` — success; Claude proceeds. stdout JSON may adjust behavior (e.g. `permissionDecision`).
- `2` — behavior depends on hook event:
  - **PreToolUse**: blocks the tool call. stderr is returned to Claude as the reason.
  - **PostToolUse**: non-blocking (the tool already ran). stderr feeds back to Claude as feedback in the same turn — this is the intended pattern for `check-src-edit.sh`.
- Any other code — non-blocking error; Claude proceeds, stderr surfaces in the transcript.

## Every new hook script needs a smoke test
- When you add a hook script under `.claude/hooks/`, add a matching smoke test under `tests/hooks/<name>.test.sh` that:
  1. pipes a representative blocking input as JSON via stdin and asserts exit code 2,
  2. pipes a representative passing input and asserts exit code 0,
  3. is wired into `yarn test` (or a top-level `bash tests/hooks/run.sh` invoked by CI/lint).
- Without a smoke test, a non-functional hook (e.g. wrong env var, wrong jq path) will silently no-op forever and erode trust in the safety system.

## Hook authorship checklist (apply before merging any new hook)
- [ ] Reads stdin via `cat` exactly once
- [ ] Uses `jq -r '.tool_input.<field> // empty'` for every field it queries
- [ ] Returns exit 2 on the deny path with a clear stderr message
- [ ] Has matching `tests/hooks/<name>.test.sh` covering pass and block paths
- [ ] Registered in `.claude/settings.json` under the correct `matcher` for the tool it cares about

## Pre-push gate: what it runs and how long it takes

`require-green-before-push.sh` fires only for `git push`, `gh pr create`, and `gh pr merge` — not for `git commit`. It delegates to `scripts/verify-before-push.sh`, which runs `yarn test`, then `yarn build` — **sequentially**, not in parallel (each `run_phase` call blocks before the next line runs).

- **Local gate** (the real `.githooks/pre-push` hook, and this Claude Code hook): both call `verify-before-push.sh --fast`, which runs `yarn test:fast` — the fast tier only, see "Fast/slow test split" below.
- **CI** (`yarn verify:push`, the `test` job in `.github/workflows/deploy.yml`, a required branch-protection status check on `main`): calls `verify-before-push.sh --no-mise` with no `--fast`, so it always runs the full `yarn test` (fast + slow tiers) as the actual merge gate, on isolated hardware.

**Set Bash tool timeout to match the command, not the hook:**
- `git commit` — **30 000 ms**. No hook runs tests; the commit itself takes < 1s.
- `git push` / `gh pr create` / `gh pr merge` — allow **240 000 ms** for the local `--fast` gate. The fast suite plus build has been measured at about 174 seconds on this shared workstation; a 120-second tool window can interrupt its detached timeout child and leave Vitest workers behind. If you've just changed a slow-tier file and want to also verify it locally first (`yarn test:slow` or a targeted `yarn vitest run <file>`), do that as its own step before pushing — see #608 investigation notes above for observed durations up to ~600s worst case.
- A 360 000 ms timeout on `git commit` papers over the wrong symptom. Match the timeout to what the command actually does.

## Concurrent local verification

Routine `yarn test`, `test:fast`, `test:slow`, `build`, and `build:tauri` --
run directly by a developer or agent, not through the orchestrators below --
stay fully concurrent across linked worktrees. Do not add a lock around
those: it turns unrelated agents into a queue and does not make a test suite
safer.

When an agent needs a durable complete-suite result, use `yarn test:durable`.
It writes only under the active worktree's ignored `.verification/` directory,
cleans stale completed artifacts before starting, and refuses to overwrite a
live run in that same worktree. Read it with `yarn test:durable:status`; a
passing result is valid only when its recorded commit and working-tree state
match the current worktree. Different worktrees keep independent durable
evidence and must never share an artifact directory.

If the durable command's terminal stream is incomplete, first run
`yarn test:durable:status`. Its completed result is authoritative even if the
streamed output ended early. Inspect the process tree only when that command
reports an active run; never report a completed durable run as still running
solely because the terminal stream was truncated.

### Host verification lease (#892)

`yarn test:durable`, `scripts/verify-before-push.sh`'s test+build phases, and
`scripts/verify-pr.sh`'s build step are the three *suite-scale* verification
entrypoints in this repo -- each spawns a full Vitest worker pool (or a full
`tsc`+Vite production build). Two of those overlapping on one machine across
different worktrees can starve each other's workers: the incident that
motivated this section was a "Timeout waiting for worker to respond" pool
crash on one worktree while another worktree's durable run was mid-flight,
which the durable runner then filed as a plain `product-test` failure because
nothing inspected the log (see "Durable failure classification" below).

`scripts/host-verification-lease.sh` (a sourceable library) and
`scripts/run-under-host-lease.sh` (its `<label> -- <command>` CLI wrapper)
provide ONE host-wide mutual-exclusion slot, implemented as an atomic `mkdir`
lease under `<git-common-dir>/conquestoria-verification-lease` -- shared by
every linked worktree of one clone (same host, by construction), and never
shared across an unrelated clone or user. This is deliberately narrower than
"a repository-wide verification lock": it does not touch `.verification/`,
does not touch Vite/Vitest caches, and does not gate the routine commands
listed above -- only the three orchestrators do:

- `run-durable-test-suite.sh` acquires it around the test command it runs,
  after its own worktree-local `.lock` (see "Lock order" below).
- `verify-before-push.sh` acquires it around its test-phase-then-build-phase
  sequence (both under one acquisition -- there is nothing else in that
  script worth releasing the slot in between for).
- `verify-pr.sh` acquires it, separately, around its own `yarn build` call
  (its `yarn test:durable` call already acquires it again internally, so
  this is two short sequential acquisitions rather than one held across
  both, to avoid a process ever waiting on a lease it already holds).
- Focused Vitest runs, watch mode, and CI (`CI` is checked and treated as an
  immediate no-op) never acquire it.

A waiting process reports the holder's pid, command label, worktree, and
elapsed wait time every ~15s (not every second) until it can acquire, and is
cleanly cancellable via SIGINT/SIGTERM without disturbing whichever process
still legitimately holds the lease. Stale-lease recovery defends against a
creator that crashed between `mkdir` and writing its metadata (short grace),
PID reuse (a live pid whose recorded process-start marker no longer matches
what `ps -o lstart=` reports for that pid now), and a lease whose liveness
cannot be verified at all such as a hostname mismatch (long grace -- this
lease root is chosen to be same-host-only, so this should not trigger in
practice, but it exists so a corrupt lease cannot block development
forever). See `tests/hooks/host-verification-lease.test.sh` for the full
concurrency contract (acquire/wait/release, cancellation, all stale-recovery
cases, and multi-worktree coordination through one injected lease root).

### Lock order

Two independent locking layers exist for local verification, and there is
exactly one caller that acquires both:

1. **Worktree-local durable lock** (`.verification/<scope>-suite.lock`,
   `mkdir`-based) -- prevents two durable runs from racing in the *same*
   worktree. Owned entirely by `run-durable-test-suite.sh`.
2. **Host-wide verification lease** (above) -- prevents two suite-scale
   verification runs from racing across *different* worktrees on the same
   machine.

`run-durable-test-suite.sh` acquires (1) first, then (2) around the actual
test invocation, and releases in the reverse order (its `trap on_exit EXIT`
always fires after the host lease's own `trap hvl_release EXIT` has already
run, since the host lease is acquired and released entirely within the
`"$@"` invocation nested inside the worktree lock's critical section). No
other script in this repo acquires both locks, so there is no ordering
inversion to guard against between callers -- `verify-before-push.sh` and
`verify-pr.sh` only ever acquire (2).

### Durable failure classification (#892)

`run-test-suite.sh`'s `full` mode captures Vitest's combined stdout/stderr
(still streamed live via `tee`, so interactive `yarn test` is unchanged) and
classifies a non-zero exit before writing `DURABLE_FAILURE_KIND_FILE`,
instead of assuming every non-zero exit is a product-test failure:

- `Failed Tests <N>` in the log (Vitest's own reporter banner, only printed
  when it actually collected failing assertions) -> `product-test`. This
  check runs first and wins even if a pool error also appears in the same
  log -- a real product failure must never be hidden by an unrelated runner
  hiccup that happened alongside it.
- Otherwise, `[vitest-pool-runner]:` (the tagged prefix Vitest 4's own
  worker-pool runner uses for its internal errors, including "Timeout
  waiting for worker to respond" -- verified against the installed
  `vitest` package's `chunks/cli-api.*.js`), `Worker exited unexpectedly`,
  or Node's own `FATAL ERROR` out-of-memory banner -> `runner-infrastructure`.
- Anything else (an unrecognized crash shape) -> `product-test`, the same
  safe default the classifier had before this existed. `if exit != 0 =>
  infrastructure` is exactly the naive heuristic this replaces, not a
  fallback to reach for: an unrecognized failure must never be classified
  away as infrastructure.

`read-durable-test-result.sh` includes the recorded `failure_kind` in its
failure message when one was recorded. See
`tests/hooks/run-test-suite-classification.test.sh` for the fixture-driven
positive/negative cases (including the "mixed output" precedence case) plus
one real Vitest invocation that keeps the fixture text honest against the
actually-installed Vitest version.

Vitest's worker limit applies to one process, not the whole machine. The config
uses 25% of the available CPU locally, leaving capacity for four simultaneous
worktree runs; CI uses 100% on isolated hardware. Override a one-off run with
Vitest's supported `VITEST_MAX_WORKERS` environment variable. Run the mirrored
targeted test first; reserve the complete suite for final verification.

## Worktree command-runner contract

`scripts/run-with-mise.sh` executes all project behavior from the active
worktree: its `package.json`, generated PnP map, scripts, Vite/Vitest
configuration, sources, hooks, and output paths. A PnP map is generated from a
specific lockfile, so never borrow another checkout's `.pnp.cjs` or re-execute
another checkout's wrapper. Yarn's own download cache may be shared safely.

Do not manually duplicate a package script in the wrapper; put multi-step
package behavior in one active project script instead. `yarn install` also runs
from the active worktree so it produces that worktree's PnP map. Keep focused
test filters root-relative (`tests/foo.test.ts`) and cover this contract in
`tests/hooks/run-with-mise-worktree.test.sh` whenever the adapter changes.

## Fast/slow test split (#608)

`scripts/run-tests-by-tier.sh` splits the suite into two tiers, to keep the local push gate fast without losing coverage at merge time:

- `yarn test:fast` (`run-tests-by-tier.sh fast`) — excludes the `SLOW_TEST_FILES` list defined in that script (currently: `ai-prepared-turn`, `basic-ai-worker-roads`, `determinism-guard`, `turn-manager-beasts`, `save-load-mass-discovery`, `tech-panel`, `pacing-production-budget`, `pacing-reference-economy`, `start-placement-system`, `world-pressure-fairness`). This is what the local pre-push hook and the Claude Code push-gate hook actually run.
- `yarn test:slow` (`run-tests-by-tier.sh slow`) — runs ONLY those files, for a developer working directly on one of those systems.
- `yarn test` (full, unchanged) — always runs everything. This is what CI's required `test` status check runs; it is never given `--fast`, so slow-tier regressions still block merge, just not every local push.

**When adding a new heavy multi-city/era/seed simulation test:** add its path to `SLOW_TEST_FILES` in `scripts/run-tests-by-tier.sh`, in addition to giving it an explicit headroom-sized timeout (see below) — the two are complementary: the timeout stops it from spuriously failing under contention, the tier split stops it from adding wall-clock/CPU cost to every local push-gate run in the first place.

## Vitest cache config

Vite and Vitest caches are writable state, so they stay in the active
worktree's ignored `.vite/` directory. The wrapper exports a test cache path
for each worktree; the Vite config uses separate test and non-test cache
subdirectories. Do not redirect a linked worktree to another worktree's cache.

Cache reuse does not remove esbuild's TypeScript transform cost. That cost is
proportional to suite size and worker count and is inherent to each run.

## Heavy simulation tests need an explicit, headroom-sized timeout (#608)

This dev machine routinely runs several Claude Code worktree agents in parallel (verified: 200+
worktree directories exist; a live agent was directly observed running the same test files
concurrently during the #608 investigation), each invoking `yarn test` independently and each
defaulting to vitest's own multi-worker sizing. That oversubscribes the machine's CPU whenever
2-3 agents' test runs overlap, and it is not something a single repo-side config change can fully
eliminate (`vite.config.ts`'s local 25% worker budget caps one process but
cannot stop several manually overridden processes from adding up).

Most of this suite is fine regardless, because most tests are cheap unit tests that finish in
milliseconds even under contention. The failure mode is specific to a growing minority of tests
that simulate real work — multi-city, multi-era, or multi-seed economic/AI projections
(`pacing-reference-economy.test.ts`, `pacing-production-budget.test.ts`,
`world-pressure-fairness.test.ts` are the current examples) — left on vitest's implicit 5s
default. Only ~20 of the ~410 test files in this repo set an explicit timeout; everything else
inherits that default, which assumes a quiet, uncontended machine and a cheap unit test. A new
simulation-style test that forgets to override it will pass in isolation and then intermittently
fail the moment a second agent's test run overlaps it — indistinguishable from a real regression
until someone re-runs it alone.

**When adding a test that simulates multiple cities/eras/seeds, builds a full timeline, or
otherwise does real computational work rather than asserting against a small fixture:**

- [ ] Set an explicit `it(name, fn, timeoutMs)` (or `{ timeout }` options object) — never rely on
      the 5s default for this class of test.
- [ ] Measure the test's actual duration under realistic local contention (run it while at least
      one other `yarn test`/`vitest` process is active elsewhere), not just a solo run — a solo
      timing will understate the real worst case.
- [ ] Size the timeout at roughly 2x the worst observed duration, not the solo duration. This
      repo's existing widened timeouts follow that ratio (e.g. `world-pressure-fairness.test.ts`
      observed 462.7s under heavy contention → set to 600s; `pacing-reference-economy.test.ts`'s
      four tests observed 11-42s → set to 45s/60s/75s/150s respectively).
- [ ] Leave a one-line comment at the timeout citing the observed duration and referencing #608,
      so a future reader doesn't "fix" the number back down to something that looks tighter but
      reintroduces the flake.
- [ ] Do not just raise the global vitest default instead of setting per-test timeouts — that
      would mask a real hang in an actual cheap unit test for the other ~390 files.

## Worktree setup: trust mise before the first push

Every new worktree has its own `mise.toml`. The `run-with-mise-worktree.test.sh` smoke test will fail with `mise ERROR Config files ... are not trusted` until you run:

```bash
mise trust /path/to/worktree/mise.toml
```

Run this immediately after creating a worktree, before the first push attempt. The `EnterWorktree` tool does not do this automatically.
