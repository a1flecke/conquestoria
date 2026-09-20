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

**Plain `git push` defers to the real `.githooks/pre-push` hook when it is wired (#1133).** Before invoking the verifier itself, the Claude hook checks whether this worktree's `core.hooksPath` resolves to `.githooks` and `.githooks/pre-push` is executable; if so it exits 0 immediately and lets the actual Git hook own verification, so a clean push doesn't pay for the regular test+build gate twice. This only applies to a literal `git push` — `gh pr create`/`gh pr merge` never trigger a git pre-push hook, so those always run the verifier here. If hooks aren't correctly wired (the `#608` worktree regression this repo already guards against), the Claude hook falls through to running `verify-before-push.sh --regular` itself, unchanged from before. Because that fallback path is still live, the hook's own `.claude/settings.json` `timeout` must stay at or above the `240s` budget below — it must never be shorter than the verification it is meant to govern.

- **Local gate** (the real `.githooks/pre-push` hook, and this Claude Code hook): both call `verify-before-push.sh --regular`, which runs `yarn test:regular` — the local regular selection only, see "Local selections and CI shards" below.
- **CI** (`yarn verify:push`, `test-suite-shard-a`, `test-suite-shard-b`, `test-suite-shard-c`, `test-suite-shard-d`, and `merge-gate` in `.github/workflows/deploy.yml`): runs the complete default Vitest suite exactly once across four explicit shards. `merge-gate` requires all four results, so neither the local selection nor a skipped expensive simulation can weaken merge coverage.

**Set Bash tool timeout to match the command, not the hook:**
- `git commit` — **30 000 ms**. No hook runs tests; the commit itself takes < 1s.
- `git push` / `gh pr create` / `gh pr merge` — allow **240 000 ms** for the local `--regular` gate. A 120-second tool window can interrupt its detached timeout child and leave Vitest workers behind. If you've changed an intensive-simulations file, first run `yarn test:intensive-simulations` or a targeted `yarn vitest run <file>` as its own step before pushing.
- A 360 000 ms timeout on `git commit` papers over the wrong symptom. Match the timeout to what the command actually does.

## Concurrent local verification

Routine `yarn test`, `test:regular`, `test:intensive-simulations`, `build`, and `build:tauri` --
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

**The same durable-evidence mechanism is also available for the other three
heavyweight AI/perf commands (#1133 items C/D):** `yarn test:ai-long:durable`
/ `:status`, `yarn test:ai-playability:durable` / `:status`, and `yarn
perf:report:durable` / `:status`. These wrap the exact same underlying
commands as their non-durable equivalents, via `run-durable-test-suite.sh
<scope> --no-lease -- <command>` -- `--no-lease` is required for all three
because each of those commands deliberately manages its own (or no) host-wide
lease already (see their own header comments); only the "full" scope (`yarn
test:durable`) acquires the shared push-verification lease, unchanged from
before this MR.

Every `:status` reader now prints an unambiguous leading `STATUS: <word>` line
to stdout, one of `active` / `passed` / `failed` / `abandoned` / `mismatched`
/ `none` -- read that line, not exit codes or prose, when scripting against
it. `abandoned` is new: previously, a stale `.running` marker whose recorded
process had actually died was indistinguishable from a genuinely active run
(both reported "still running" forever) -- the exact bug #1133 cites
("even that reader trusts a `.running` marker without checking whether its
PID/job is still alive"). The reader now checks the real job's pid (recorded
by `hvl_run_registering_job` via the `DURABLE_JOB_PID_FILE` side channel, the
same mechanism `DURABLE_FAILURE_KIND_FILE` already used) for liveness before
ever reporting `active`. The durable log is also now a genuine live tee (via
`| tee`, not a silent capture redirected to a file and dumped only at the
end), so `:status` while a run is `active` can show real progress (the last
20 lines) instead of nothing.

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
lease. By default (`HOST_VERIFICATION_LEASE_ROOT` unset) the root is
`${TMPDIR:-/tmp}/conquestoria-verification/<uid>/<hash of the canonical
git-common-dir>/push-verification-lease` (`hvl_resolve_host_scope_dir` in
`host-verification-lease.sh`) -- shared by every linked worktree of one
clone (they all share that same git-common-dir), never shared across an
unrelated clone or user (the uid + path-hash key), and, since #1133,
deliberately **not** under `.git`: Codex's default workspace-write sandbox
protects `.git` (and a linked worktree's resolved gitdir target) read-only,
so a coordination primitive rooted there was unusable by design for one of
the two agent runtimes this repo supports. `run-ai-long-horizon.sh` sources
the same helper for its own, separate `ai-long-horizon-lease` sub-path
rather than duplicating git-common-dir resolution. This is deliberately
narrower than "a repository-wide verification lock": it does not touch
`.verification/`, does not touch Vite/Vitest caches, and does not gate the
routine commands listed above -- only the three orchestrators do:

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
cases, and multi-worktree coordination through one injected lease root), and
`tests/hooks/host-verification-lease-relocation.test.sh` for the *default*
(no injected root) resolution contract: never under `.git`, identical across
two linked worktrees of one clone, different across two unrelated clones,
keyed by the real uid, and fully usable (a real acquire+release cycle) even
with a read-only `.git`.

**Job-tree ownership, not just supervisor-pid ownership (#1133 items B/E).**
Recording only the *supervisor* pid (the shell that called `hvl_acquire`) is
not enough: if that supervisor dies (crash, OOM-kill, agent restart) while its
heavyweight job's process tree is still alive, a stale check based on the
supervisor pid alone would reclaim the lease immediately even though the real
job is still consuming CPU, letting a second acquisition overlap it. All
three real callers (`run-under-host-lease.sh` directly, and
`verify-before-push.sh`'s `run_phase`) run their wrapped command through
`hvl_run_registering_job` instead of invoking it directly: it backgrounds the
command and registers its pid into the held lease's metadata as `job_pid` as
soon as it's known. The caller installs `hvl_cancel_and_release` as its
INT/TERM trap once, at the top level (spanning every `hvl_run_registering_job`
call it makes, not one trap per call) -- on a signal, it walks the *live
process table* from the registered pid (`hvl_job_tree_pids`, a portable
`ps -eo pid=,ppid=` parent/child walk) to find every current descendant and
signals each one individually, then releases the lease and exits. Trap
ownership stays with the caller specifically so `hvl_run_registering_job`
never needs to save/query/restore a pre-existing trap around each call (an
earlier version tried that with `trap -p`, which dash -- the `/bin/sh` on at
least one real CI runner -- does not implement at all, silently breaking
every caller there; see below for the other, more serious correction this
same PR needed). `hvl_is_stale` checks `job_pid` liveness (a plain `kill -0`)
before ever reclaiming on a dead-supervisor or PID-reuse verdict: a live
registered job is never stolen, no matter how long its supervisor has been
gone, and the lease becomes reclaimable again only once that job has
actually ended.

An earlier version of this fix put the wrapped command in its own OS process
group (`set -m`, giving a newly backgrounded job a fresh pgid) and signaled
it as a unit with a single `kill -SIGNAL -$pgid`. **That version took down an
entire CI runner the first time it ran in CI**, almost certainly because
`set -m`'s new-process-group semantics resolved more broadly than intended in
that environment (a real risk any negative-pid/process-group signal carries:
if the group boundary you computed is wrong, you can hit far more than you
meant to, with no way to bound the blast radius after the fact). The
tree-walk approach replaced it specifically because it cannot repeat that
failure: it only ever signals PIDs reached by explicit parent/child descent
from a PID this library itself spawned, so it is structurally incapable of
resolving to anything outside that explicit set, regardless of how a given
host or CI environment handles process groups or sessions. Do not reintroduce
process-group-based signaling (`set -m`, `setsid`, `kill -SIGNAL -$pgid`) into
this library without new evidence that it is safe across every environment
this code runs in, local and CI alike.

See `tests/hooks/host-verification-lease-process-group.test.sh` for the real
child+grandchild+worker-like regression: `job_pid`'s tree includes the nested
grandchild; cancelling the supervisor reaps the entire tree, not just the
immediate child; and a lease whose supervisor was SIGKILLed outright
(bypassing its own release trap, exactly like a real crash) is never stolen
while its registered job is still alive, but becomes acquirable the moment
that job actually ends.

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

### Host resource budget (#1133 items H/J)

The host-wide lease above is a single-slot **mutex**: at most one push-
verification-scale run at a time. It never gated the most common command,
plain `yarn test` (and `test:regular` / `test:intensive-simulations`), so
before this, nothing capped how many *simultaneous* heavyweight Vitest
invocations one host could be asked to run at once -- the exact "work is
blocked because several agents' `yarn test` runs are starving each other"
failure mode #1133 was opened to fix. `hvl_acquire_budget_slot` /
`hvl_release_budget_slot` add a host-wide **counting** semaphore on top of
the same coordination family (`hvl_resolve_host_scope_dir`'s scope dir,
`budget/` alongside the mutex's own lease directory): up to
`HOST_VERIFICATION_LEASE_BUDGET` (default 3, chosen from measured evidence
that 2-4-way concurrent full-suite runs on this class of host all complete,
just progressively slower) processes may hold a slot at once; a caller past
the budget waits and reports progress every
`HOST_VERIFICATION_LEASE_REPORT_SECONDS` (15s), identically to the mutex.
`run-test-suite.sh`'s three modes (`full`, `regular`, `intensive-simulations`)
each acquire one slot around their real work and release it on exit --
between them these cover plain `yarn test`, `test:regular`,
`test:intensive-simulations`, `test:durable` (which wraps `full`), and every
`git push`'s test phase (`verify-before-push.sh --regular` -> `regular`).

Implementation is `mkdir` on `HOST_VERIFICATION_LEASE_BUDGET` pre-numbered
slot directories (`budget/slot-0` .. `slot-(N-1)`) -- the same atomic-`mkdir`
primitive the mutex uses, extended to N names instead of one. **Do not
reintroduce a count-then-write scheme** (count live marker files, then write
your own if the count is under budget): an earlier version of this function
did exactly that and passed every isolated/sequenced test, but reliably let
a 3rd/4th holder in the moment real concurrent `yarn test` processes raced
for it on a genuinely busy host -- a classic time-of-check-to-time-of-use gap
between the count and the write. `mkdir` on a specific slot *name* is
atomic, so at most one process can ever believe it won a given slot.

**Reclaiming an already-taken slot needs the same two-sided staleness
handling `hvl_is_stale` already applies to the mutex, PLUS a subtlety unique
to a freshly-created-but-not-yet-populated slot:**

- If the slot's owner file names a pid that is genuinely dead (or was reused
  since -- checked via `hvl_pid_is_live` + the `hvl_start_marker` identity
  check), reclaim it immediately, exactly like the mutex.
- If the owner file is missing or unreadable, that is **not** itself proof
  of abandonment: the process that just won that slot's `mkdir` may simply
  not have finished writing its owner file yet. An earlier version of this
  function had no grace period for this case at all and reclaimed on sight;
  a stress test racing 10 holders for 3 slots as close to simultaneously as
  the shell can manage reliably let a 4th holder in through exactly this
  gap (one racer read the not-yet-written file as empty, concluded the slot
  was abandoned, deleted it, and re-won it for itself while the true owner
  was still mid-write). The fix gives a missing owner file the same short
  grace period (`HOST_VERIFICATION_LEASE_SHORT_GRACE`, default 10s, keyed
  off the slot directory's own mtime) the mutex already gives its metadata
  file for the identical reason, and moves on to the next slot index instead
  of reclaiming immediately while still within that window.

**Reentrancy is tracked with a depth counter (`HVL_BUDGET_DEPTH`), not a
plain "already held" flag.** A flag records only the most recent acquire
call's nested-ness; a real acquire followed by one nested acquire followed
by two releases (an ordinary, correctly-paired reentrant sequence) had both
releases reading the flag as it stood after the *last* acquire (nested) and
skipping the real release -- the actual slot was never removed. The leaked
slot then sat in the budget directory, occupying one of a scarce few slots,
until a later acquirer eventually reclaimed it as stale. The depth counter
instead reflects how many acquire calls are currently open on this process's
stack; only the release that brings it back to zero ever touches the
filesystem. `tests/hooks/host-verification-lease-budget.test.sh` scenario 2
asserts the budget directory is empty after a matched nested pair, not just
that `HVL_BUDGET_NESTED` reports the right value per call -- the earlier bug
passed the latter check while still leaking a slot.

**Reentrancy state must be keyed by domain, not global -- an exported "am I
nested" variable is inherited by every descendant process, not just genuine
nested function calls within the same process.** This was the actual root
cause behind a failure ("a third holder acquired a slot while
HOST_VERIFICATION_LEASE_BUDGET=2 already had two live holders") that
reproduced three times in a row inside a real `bash scripts/run-with-mise.sh
yarn test` invocation but never once across 15+ standalone runs, real
`/bin/dash` execution, or synthetic CPU-stress runs -- a strong initial
signal that the mechanism was specific to running *nested inside* a real
`yarn test`, not a race in the mkdir logic itself. Two dead ends were chased
first (both real, both worth the fix, neither the actual cause here): a
missing-grace-period reclaim race (see above) and a hypothesis that a fixed
`sleep 3` / `sleep 0.6` timing pair in scenario 1 could observe a slot the
first holder had already, legitimately, released under heavy scheduling
delay -- rewriting the test to hold until an explicit release-signal file
instead of a fixed sleep (removing all wall-clock dependence) still failed
identically, disproving that theory outright rather than confirming it.

The real mechanism: `run-test-suite.sh full` (what plain `yarn test` runs)
acquires the REAL, default-rooted budget once around vitest *and* the entire
hook-test suite that follows it, via `trap ... EXIT` held for the whole
duration. Every hook test -- including this file's own scenarios --
therefore runs as a **descendant process** of that held slot. The reentrancy
counter was a single exported `HVL_BUDGET_DEPTH`, inherited by every
descendant regardless of what it does with it. This file's own scenario 1
deliberately overrides `HOST_VERIFICATION_LEASE_ROOT` to an isolated,
per-test directory -- a COMPLETELY DIFFERENT budget domain from the real one
the ancestor `full` invocation holds -- but the single global counter cannot
tell the two apart: it saw a depth inherited from the ancestor's unrelated
real acquisition and treated every one of the test's own acquire calls as
nested no-ops, so all three of its holders (m1/m2/m3) "succeeded" instantly
with **zero real mkdir contention ever happening**. This was confirmed
directly, not inferred: a `HVL_DEBUG_TRACE=1` opt-in stderr trace
(`ENTER`/`WON`/`RECLAIM-*` lines, zero cost when unset -- see the env var
table above) showed these lines appearing normally in every standalone run
but being **completely absent** from the failing nested run, because the
nested-check `return 0` fires before the trace line is ever reached.

The fix keys the depth counter (and its matching decrement in
`hvl_release_budget_slot`) by a hash of the *resolved budget directory*
(`hvl_path_hash`, the same helper already used for the lease root's own key)
rather than one global name, via one `eval`-based indirect variable per
domain (`HVL_BUDGET_DEPTH_<hash>`) -- verified to work correctly under real
`/bin/dash`, not just macOS's bash-as-`/bin/sh`. A genuinely different
domain now always goes through real acquisition; true call-stack reentrancy
against the *same* domain (the scenario the doc comment above actually
describes: "a caller that already holds a slot invoking another function
that also acquires one") still nests correctly. The now-unused
`HVL_BUDGET_HELD` flag (superseded by the domain-keyed depth counter earlier
in this same MR, but left in place until this fix made the redundancy
obvious) was removed as dead state.

See `tests/hooks/host-verification-lease-budget.test.sh` for the full
contract: budget enforcement across sequenced holders, reentrancy (including
scenario 5's explicit ancestor-process-holds-domain-A /
descendant-process-acquires-domain-B regression for the bug above), the
`CI=true` no-op, and the many-simultaneous-racers stress scenario that
catches the mkdir-then-write-metadata race directly.

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

### Stall watchdog in `run-with-timeout.mjs`

`run-with-timeout.mjs` wraps `run-ai-long-horizon.sh` (8400s ceiling),
`run-perf-report.sh` (900s), `run-ai-playability-regressions.sh` (300s), and
`verify-before-push.sh`'s test+build phases. Its original design only had one
failure mode for "too long": the absolute wall-clock ceiling. That leaves a
gap distinct from ordinary CPU-starvation slowdown (the ~2x contention
`.claude/rules/ai-simulation.md` already documents): a Vitest invocation can
sit at genuinely **zero** CPU, having never spawned a worker process at all,
for the entire ceiling with no signal anything is wrong -- observed directly
when an `ai-long-horizon` run launched moments after two back-to-back heavy
`yarn test` runs sat at 0.0% CPU for over an hour before a live `ps` check
caught it, un-noticed the whole time because the process was technically
still "within its timeout."

Every caller of this script is CPU-bound once it actually starts (a Vitest
run or a production build), so unlike stdout activity (Vitest's default
reporter is silent for the whole duration of a single long-running test --
a stdout-based heartbeat would false-positive on real work), **zero CPU
progress across the whole process group genuinely cannot be legitimate slow
work**. The watchdog samples `ps -eo pgid=,time=` every
`STALL_CHECK_INTERVAL_SECONDS` (default 15s), summed across every process
sharing the spawned child's process group (the `detached: true` group leader
plus any workers it forks, which inherit the same pgid), and treats
`STALL_GRACE_SECONDS` (default 90s) of literally zero increase -- after an
initial `STALL_BOOT_GRACE_SECONDS` (default 20s) startup allowance -- as a
stall rather than a legitimately slow run. A stall exits **125** with a
message prefixed `STALL:`, distinct from the plain ceiling's **124**, so a
caller (or a human) can tell "this needs a bigger timeout" apart from "this
never started and is safe to retry immediately." `STALL_WATCHDOG_DISABLE=1`
bypasses it entirely for a one-off case that needs to. See
`tests/hooks/run-with-timeout.test.sh` for the positive (stalled sleeper,
killed well inside a much larger ceiling), negative (a genuinely CPU-busy
process is never killed), and disable-switch cases.

Do not "fix" a future stall by only raising the affected script's absolute
ceiling -- that repeats exactly the silent-wait failure mode this watchdog
exists to shorten. If a *legitimate* slow-but-real-CPU-work phase ever needs
more than 90s to show its first tick (unlikely for any current caller, all of
which are pure test/build execution with no slow network/install phase
wrapped inside the timeout), widen `STALL_GRACE_SECONDS` for that call site
rather than disabling the watchdog outright.

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

## Local selections and CI shards (#608, #1075)

Local selection keeps push feedback practical; CI sharding keeps complete merge coverage balanced. They are independent: a test in `intensive-simulations` still belongs to exactly one CI shard, and a regular test may land in either shard. `scripts/run-tests-by-local-tier.sh` owns local selection; `scripts/ci-test-shards.json` is the checked-in CI contract. Vitest discovers beneath `test.dir = tests`, so local focused filters stay root-relative. `tests/scripts/local-test-tier-selection.test.ts` proves the local selections are disjoint and exhaustive; `tests/scripts/ci-test-shard-selection.test.ts` proves the CI assignment is disjoint, exhaustive, and current against real discovery.

| Test kind | Location | Local selection | CI selection |
| --- | --- | --- | --- |
| Production unit, system, renderer, or UI test | Mirrored `tests/<domain>/` path | `regular` unless expensive | Exactly one balanced shard |
| Multi-city, multi-era, multi-seed, or long-running simulation | Mirrored domain path; use `tests/simulation/long-horizon/` only when intentionally explicit-run | `intensive-simulations` | Exactly one balanced shard when default-discovered |
| Browser test | `tests/e2e/` | Browser command | Existing browser job; never a Vitest shard |
| Tooling script | `tests/scripts/` | `regular` unless expensive | Exactly one balanced shard |
| Shell hook or workflow contract | `tests/hooks/` | `yarn test:hooks` plus a targeted check | Hooks job; a Vitest contract test also belongs in one shard |

- `yarn test:regular` (`run-tests-by-local-tier.sh regular`) excludes the `SLOW_TEST_FILES` implementation list. This is the local pre-push selection.
- `yarn test:intensive-simulations` runs only that list, or one supplied root-relative focused file without unioning it with the whole list.
- `yarn test:manifest`, `test:manifest:regular`, and `test:manifest:intensive-simulations` print real local manifests without executing bodies.
- `yarn test:ci:shard-a`, `test:ci:shard-b`, `test:ci:shard-c`, and `test:ci:shard-d` run the checked-in complete-suite assignments. `test:manifest:ci:shard-a`, `test:manifest:ci:shard-b`, `test:manifest:ci:shard-c`, and `test:manifest:ci:shard-d` print their exact lists. CI must use these package scripts rather than duplicate paths in workflow YAML.
- `yarn test` remains complete and unchanged. CI's four explicit shard jobs, not the local selection, are the required full-suite merge gate.

**When adding, removing, or renaming a default-discovered Vitest test:** first place it by the table above and add an explicit headroom-sized timeout if it is expensive. Then run `yarn test:profile:default`, `yarn test:ci-shards:allocate` (which must pass all four explicit shard names), and `yarn vitest run tests/scripts/ci-test-shard-selection.test.ts`. Commit the regenerated `scripts/ci-test-shards.json`; the runner rejects an unassigned, duplicate, stale, or non-default entry. The profile data is a starting allocation only: use uploaded CI JSON reporter artifacts and the three-run measurement protocol before treating a rebalance as successful. When one measured shard alone is critical, retain every noncritical assignment byte-for-byte and use its successful retained reporter JSON plus `--fixed-shard-manifest` / `--fixed-shards` to divide only that shard with a new companion; do not split file counts, raise timeouts, or weaken tests. For the #1075 B/D topology, A/C are fixed and only B/D are allocatable.

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
