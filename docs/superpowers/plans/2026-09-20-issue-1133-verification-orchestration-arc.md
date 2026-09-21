# #1133 — verification/tooling orchestration arc

**Tracking issue:** [#1133](https://github.com/a1flecke/conquestoria/issues/1133) — "fix(tooling):
make local AI verification sandbox-safe, durable, and single-owner across agent failures."

**Goal:** Fix the underlying ownership/scheduling/sandbox/cancellation/reporting model behind
the repo's local test-verification tooling, not just the CPU-stall symptom (#1131 already
shipped the stall watchdog; this arc is the root-cause work the issue explicitly asks for
instead of "another timeout or another retry loop").

The issue enumerates 11 concrete defects (labeled A-K below, matching its own "Recommended
design" section) and 12 acceptance criteria. This is a multi-week rewrite of live,
concurrently-used dev infrastructure — phased into independently-landable MRs so each can be
verified in isolation before the next touches the same scripts.

## Phase status

### MR1 — safe mechanical correctness fixes ✅ merged (see git history for this file's introducing PR)

Scope: item F (stdout+stderr classification), item K (AI playability runner direct-vitest
invocation), item G-partial (Claude push-gate duplicate-verification dedup + hook timeout
mismatch). See `scripts/run-test-suite.sh`, `scripts/run-ai-playability-regressions.sh`,
`.claude/hooks/require-green-before-push.sh`, `.claude/settings.json`. Fully diagnosed with an
exact code location per item; each fix has a safe fallback path (the push-gate dedup only skips
its own verifier call when the repo's real `.githooks/pre-push` hook is actually wired up;
otherwise it runs the verifier itself, unchanged). Closes 4 of #1133's 12 acceptance criteria:
- [x] "Vitest infrastructure failures emitted on stderr are classified as infrastructure when no
      real assertion failure is present."
- [x] "AI playability/focused invocations cannot accidentally route into the full suite due to
      package-script separator ambiguity."
- [x] "A clean Claude `git push` runs the expensive regular test+build gate exactly once."
- [x] "No Claude `PreToolUse` timeout is shorter than the verification it is expected to govern."

### MR2 — relocate the host verification lease out of `.git` (item A) ✅ merged (see git history for this file's introducing PR)

`scripts/host-verification-lease.sh` gained `hvl_resolve_host_scope_dir`: the default lease root
(`HOST_VERIFICATION_LEASE_ROOT` unset) now resolves to
`${TMPDIR:-/tmp}/conquestoria-verification/<uid>/<hash(canonical-git-common-dir)>/push-verification-lease`
instead of `<git-common-dir>/conquestoria-verification-lease`, so it never lives under `.git`.
`run-ai-long-horizon.sh` now sources this same helper for its own `ai-long-horizon-lease`
sub-path instead of duplicating git-common-dir resolution inline. Env override, same-key
resolution across every linked worktree of one clone, and no collision across unrelated
clones/users are all preserved — verified in `tests/hooks/host-verification-lease-relocation.test.sh`
(never under `.git`; identical root for two linked worktrees of one clone; different root for an
unrelated clone; keyed by real uid; and a real acquire+release cycle succeeds even with the fake
repo's `.git` made read-only, simulating Codex's default sandbox exactly). Closes 1 more of
#1133's 12 acceptance criteria (5 total closed so far):
- [x] "Default Codex workspace-write can acquire/read/release coordination without writing under
      `.git` and without sandbox escalation."

### MR3 — process-tree-based lease ownership + signal forwarding (items B, E) ✅ merged (see git history for this file's introducing PR)

Added `hvl_run_registering_job` to `host-verification-lease.sh`: backgrounds the wrapped command
and registers its pid into the held lease's metadata as `job_pid` as soon as it's known. The caller
installs `hvl_cancel_and_release` as its INT/TERM trap once, at the top level (spanning every
`hvl_run_registering_job` call it makes) — on a signal, it walks the *live process table* from the
registered pid (`hvl_job_tree_pids`, a portable `ps -eo pid=,ppid=` parent/child walk — this reaches
a descendant regardless of process-group or session membership, since it follows the real OS
parent/child link, not group membership) to find every current descendant, signals each one
individually, then releases the lease and exits. `hvl_is_stale` checks `job_pid` liveness (a plain
`kill -0`) before ever reclaiming on a dead-supervisor or PID-reuse verdict — a live registered job
is never stolen no matter how long its supervisor has been gone. `run-under-host-lease.sh` and
`verify-before-push.sh` both now run their wrapped command(s) through this shared pair instead of
duplicating background/signal-forwarding logic (the old bespoke version in `run-under-host-lease.sh`
is gone; `verify-before-push.sh` gained job registration and cancellation it never had at all
before, since it previously ran its phases in the plain foreground).

**Two design corrections during this MR's own CI verification (important — read before touching
this code again), in the order they were found:**

1. The first implementation put the wrapped command in its own OS process group (`set -m`, giving a
   newly backgrounded job a fresh pgid) and signaled it as a unit with a single `kill -SIGNAL
   -$pgid`. **That version took down an entire CI runner** the first time its test ran in CI
   (`##[error]The runner has received a shutdown signal` / `The operation was canceled`, reproduced
   identically on a rerun, at the exact point the new test started) — almost certainly because
   `set -m`'s new-process-group semantics resolved more broadly than intended in that environment,
   so the group signal reached far more than the intended job. This is the general risk of any
   negative-pid/process-group signal: if the computed group boundary is wrong, there is no way to
   bound the blast radius after the fact. Replaced with the tree-walk approach described above,
   which is structurally incapable of repeating that failure — it only ever signals PIDs reached by
   explicit parent/child descent from a PID this library itself spawned, never anything inferred
   from process-group/session state.
2. The corrected tree-walk version still failed CI (this time safely — no runner crash), because it
   tried to make `hvl_run_registering_job` composable with a caller's pre-existing INT/TERM trap by
   saving it with `trap -p` and restoring it with `eval` after each call. **`dash` — the `/bin/sh` on
   that CI runner — does not implement the POSIX `-p` option at all** (`trap: Illegal option -p`),
   silently breaking every caller there even though the exact same code worked on macOS (whose
   `/bin/sh` is bash in POSIX mode). Fixed by moving trap ownership to the caller entirely:
   `hvl_run_registering_job` no longer touches signal handling at all, and each caller installs
   `hvl_cancel_and_release` once, at the top level, instead of the helper installing/restoring a
   trap per call. This sidesteps the portability gap structurally — nothing ever needs to query an
   existing trap.

**Do not reintroduce `set -m`, `setsid`, `kill -SIGNAL -$pgid`, or `trap -p` into this library
without new cross-environment (including a real dash `/bin/sh`, not just macOS) evidence that it's
safe.**

A third, minor round-trip: `tests/hooks/host-verification-lease-dash-compat.test.sh`'s own first
draft duplicated the nested-tree-cancellation scenario under an explicitly-invoked `dash`, which hit
a CI-only, never-reproduced-locally "holder never acquired the lease" timeout in its background/poll
setup. Simplified to just the plain synchronous run (the scenario that actually caught the `trap -p`
incident) once it became clear the cancellation scenario was already fully covered on any dash-as-
/bin/sh host — including this repo's own CI — by `host-verification-lease-process-group.test.sh`'s
existing `sh "$RUNNER"` calls.

New `tests/hooks/host-verification-lease-process-group.test.sh` proves the corrected design with a
real child+grandchild nested tree (not the single-`sleep` fixture): `job_pid`'s tree includes the
nested grandchild; cancelling the supervisor reaps the *entire* tree, not just the immediate
child; and a supervisor killed outright with SIGKILL (bypassing its own release trap, exactly like
a real crash) never has its lease stolen while the registered job is still alive, but the lease
becomes acquirable again the moment that job actually ends.

**Known residual, intentionally out of scope:** the tree-walk follows real PPID links, so it
already reaches a `run-with-timeout.mjs`-spawned `detached: true` descendant during normal
cancellation (detachment changes process-group/session, not the parent/child link) — this is
actually more robust than the original pgid design would have been for that case. The residual gap
is narrower: it only affects `hvl_is_stale`'s *liveness* check if `run-with-timeout.mjs` itself
dies while its detached child survives and gets reparented to init (changing its ppid away from
the tree we registered) — a case with no observed incident motivating a fix.

Closes 2 more of #1133's 12 acceptance criteria (7 total closed so far, across MR1+MR2+MR3):
- [x] "Retrying after stream loss cannot start a duplicate while the original registered process
      group is still alive."
- [x] "Cancellation kills/reaps the whole intended process tree or leaves an explicitly
      discoverable registered live job; no unowned Vitest pool remains."

### MR4 — generalized durable-command layer (items C, D) ✅ merged (see git history for this file's introducing PR)

Rather than renaming `run-durable-test-suite.sh`/`read-durable-test-result.sh` to the issue's
suggested `run-durable-command`/`read-durable-command-result` names, kept the existing names
(all four heavy callers are fundamentally Vitest runs, so "test-suite" isn't misleading) and
generalized the existing `<scope> -- <command>` interface, which was already parameter-generic —
the real gaps were behavioral, not naming:

- **Item C (usable by all four heavy commands):** added a `--no-lease` flag
  (`run-durable-test-suite.sh <scope> [--no-lease] -- <command...>`) so a caller can get durable
  evidence + job-pid liveness tracking without being forced into the shared push-verification
  lease — required because the AI-long/AI-playability/perf-report runners deliberately manage
  their own (or no) host-wide lease already. New `yarn test:ai-long:durable`/`:status`, `yarn
  test:ai-playability:durable`/`:status`, `yarn perf:report:durable`/`:status` package scripts
  wire this up for the three previously bespoke-or-absent callers; `yarn test:durable`/`:status`
  (the "full" scope) keeps its exact prior behavior (still acquires the shared lease).
- **Item D (live tee):** the runner used to capture the wrapped command's output silently to a
  file and only `cat` the whole thing at the end — not a live stream at all. Now pipes through
  `tee` (with the same exit-code-through-a-pipe pattern `run-test-suite.sh` already uses:
  capture to a file inside the `{ }` group, `set +e` around it) so the durable log streams live
  while still being durable evidence.
- **Real `active`/`passed`/`failed`/`abandoned`/`mismatched` status:** added `DURABLE_JOB_PID_FILE`
  to `host-verification-lease.sh`'s `hvl_run_registering_job` (same side-channel-env-var
  convention `DURABLE_FAILURE_KIND_FILE` already used) so the real job's pid is written to disk,
  readable by a separate process, independent of lease state or of the writer's own progress.
  `read-durable-test-result.sh` now checks that pid's liveness before ever reporting `active` —
  a stale `.running` marker whose recorded process actually died now reports `abandoned` (a new,
  previously-nonexistent distinction; both cases used to report "still running" forever, the
  exact bug #1133 cites). Every status now leads with an unambiguous `STATUS: <word>` line on
  stdout for agent parseability; all pre-existing exit codes (0/1/2/3) are unchanged, `abandoned`
  gets a new exit 4.

New tests: `tests/hooks/run-durable-test-suite-abandoned.test.sh` (live-tee streaming proven via a
real running job; `abandoned` vs `active` proven with a real dead pid vs a real live one) and
`tests/hooks/run-durable-test-suite-no-lease.test.sh` (`--no-lease` never contends for the shared
lease; the default still does, unchanged). `tests/scripts/ai-long-horizon-isolation.test.ts` and
`tests/scripts/perf-isolation.test.ts` (pre-existing #1005/#1007 guards against the heavy suites
leaking into a default path) updated to allowlist the new durable package-script lines — they're
equally explicit/opt-in, never reached by any default path, same as the originals.

Verified end-to-end with a real run of `yarn test:ai-playability:durable` (not just synthetic
fixtures) followed by `yarn test:ai-playability:durable:status`, confirming real job-pid
tracking, real live-tee streaming, and correct `mismatched` detection once the worktree changed
after the run completed.

**One CI-only round-trip:** `tests/hooks/run-durable-test-suite-no-lease.test.sh` failed on its
first CI run ("unrelated holder never acquired the shared lease") but never locally. Root cause,
confirmed by reproducing it locally with `CI=true bash tests/hooks/run-durable-test-suite-no-lease.test.sh`
and fixed by comparing against the passing sibling tests: GitHub Actions always sets `CI=true`,
which `hvl_acquire` treats as "skip coordination entirely" by design (documented: "CI runs on
isolated, dedicated hardware and must not know this exists") — so the test's "unrelated holder,"
meant to occupy the shared lease so the test can prove `--no-lease` doesn't wait behind it, never
created anything at all under real CI conditions, and the poll loop waiting for it timed out.
`host-verification-lease.test.sh` and `host-verification-lease-process-group.test.sh` already
`unset CI || true` at the top for exactly this reason; the new file simply forgot to. Fixed, and
reproduced+verified locally with `CI=true` before and after the fix (not just re-run on faith).

Closes 1 more of #1133's 12 acceptance criteria (8 total closed so far, across MR1+MR2+MR3+MR4):
- [x] "Losing the terminal/tool stream does not make a heavyweight run inconclusive; a durable
      status command reports active/passed/failed/abandoned."

### MR5 — host resource budget (items H, J) ✅ merged (see git history for this file's introducing PR)

Mid-arc, the user reframed this MR's priority directly: multiple concurrent agents on this host
were experiencing real, active work-blocking contention from unbounded simultaneous heavyweight
`yarn test` invocations, and the ask became "get isolation actually working now," not "produce a
full formal benchmark report first." Real empirical spot-checks earlier in this session (2-way,
3-way, 4-way simultaneous full-suite `yarn test` runs across linked worktrees on this exact host)
had already shown all of 2/3/4-way concurrency completing successfully, just progressively slower
(~1.3x/2x/2.5x a solo baseline) — enough evidence to pick a starting cap without a multi-day
formal benchmarking pass, with the explicit understanding the number can be revisited later
against real usage. Item I (a full six-scenario `maxWorkers`/`fileParallelism` benchmark matrix)
was consciously deferred, not silently dropped — see "Not in this MR" below.

`hvl_acquire_budget_slot` / `hvl_release_budget_slot` in `host-verification-lease.sh` add a
host-wide **counting** semaphore (default budget 3, `HOST_VERIFICATION_LEASE_BUDGET`) alongside
the existing single-slot mutex, gating `run-test-suite.sh`'s three modes (`full`, `regular`,
`intensive-simulations`) — which between them cover plain `yarn test`, `test:regular`,
`test:intensive-simulations`, `test:durable`, and every `git push`'s test phase. This was
previously the one completely ungated path; only the durable/push-verification and AI-long-horizon
classes had their own (separate, single-slot) coordination before this.

**Three real concurrency defects were found and fixed during this MR's own verification (in the
order they were found), plus a fourth and most significant one found while chasing down what
first looked like a test-timing flake — read `.claude/rules/hooks-and-tooling.md`'s "Host resource
budget" section for the full mechanism-level detail on each:**

1. **Count-then-write TOCTOU race.** The first implementation counted live marker files and then
   wrote its own — passed every isolated/sequenced test, but reliably let a 3rd/4th holder in the
   moment several real `yarn test` processes raced for it on a genuinely busy host. Fixed by
   switching to atomic `mkdir` on `HOST_VERIFICATION_LEASE_BUDGET` pre-numbered slot directories,
   the same primitive the mutex already uses.
2. **Missing-owner-file reclaim race.** A slot whose `mkdir` succeeded but whose owner file hadn't
   been written yet looked identical to an abandoned slot to a racing reader, which would delete
   and re-win it out from under the true (still-writing) owner. Fixed with the same short-grace-
   period treatment `hvl_is_stale` already gives the mutex's own metadata file for the identical
   reason.
3. **Nested-release leak.** Reentrant acquire/release tracked "nested" as a single flag reflecting
   only the *last* acquire call's nested-ness; a real acquire followed by one nested acquire
   followed by two releases had both releases read that stale flag and both skip the real release,
   leaking the slot. Fixed by switching to a depth counter (`HVL_BUDGET_DEPTH`) so only the release
   that brings depth back to zero touches the filesystem.

**A fourth issue looked like a test-timing flake and was NOT — chasing that theory to its
disproof is what found the real (and most important) defect.** Scenario 1 originally held its
first two slots for a fixed `sleep 3` and checked a third holder was still blocked after a fixed
`sleep 0.6`; that failure ("a third holder acquired a slot while `HOST_VERIFICATION_LEASE_BUDGET=2`
already had two live holders") reproduced three separate times inside a real
`bash scripts/run-with-mise.sh yarn test` invocation but never once across 15+ standalone runs, real
`/bin/dash` execution, or synthetic CPU-stress runs. The plausible-sounding timing theory (scheduling
delay under real load could let the fixed 0.6s check observe a slot the first holder had already,
legitimately, released) was rewritten out entirely — holding until an explicit release-signal file
instead of a fixed sleep, removing all wall-clock dependence — and the **exact same failure still
reproduced**, disproving the theory rather than confirming it.

The real defect: `run-test-suite.sh full` (what `yarn test` runs) acquires the real, default-rooted
budget once around vitest *and* the entire hook-test suite that follows it, held for the whole
duration via `trap ... EXIT`. Every hook test — including this file's own scenarios, which
deliberately override `HOST_VERIFICATION_LEASE_ROOT` to their own isolated domain — therefore runs
as a **descendant process** of that held slot. The reentrancy depth counter was a single *exported*
`HVL_BUDGET_DEPTH`, inherited by every descendant regardless of what domain it actually targets: a
descendant resolving a completely different budget directory still saw the ancestor's inherited
depth and treated its own acquire calls as nested no-ops, so scenario 1's three holders "succeeded"
instantly with **zero real mkdir contention ever happening** — explaining every symptom at once (no
wait message, and, once a `HVL_DEBUG_TRACE=1` opt-in stderr trace was added, a complete absence of
the `ENTER` line that logs *before* the nested-check return). Fixed by keying the depth counter
(`hvl_path_hash` of the resolved budget directory, one `eval`-based indirect variable per domain,
verified under real `/bin/dash`) so a genuinely different domain always goes through real
acquisition, while true same-domain call-stack reentrancy still nests correctly. The now-redundant
`HVL_BUDGET_HELD` flag (superseded by the depth counter, itself now domain-keyed) was removed as
dead state.

All five fixes were verified with: the full sequenced+reentrant+CI-noop+many-simultaneous-racers+
cross-domain test file (the cross-domain scenario is a direct regression test for the fifth defect),
repeated standalone runs (15+ clean) both in isolation and under synthetic CPU stress, real execution
under `/bin/dash` for both the outer test driver and the sourced library, and four full
`bash scripts/run-with-mise.sh yarn test` runs end-to-end — the first three of which reproduced the
cross-domain defect (the first surfaced defect 1 also; the fourth, after the domain-scoping fix,
passed clean).

**Not in this MR (tracked as explicit follow-up, not silently dropped):**
- **Item I** — the full six-scenario `maxWorkers`/`fileParallelism` benchmark matrix the issue's
  original design called for. The budget default (3) is backed by real spot-check evidence, not a
  guess, but not the exhaustive matrix either; revisit the constant against real multi-agent usage
  data once it accumulates, the same way `.claude/rules/game-balance.md`'s pacing constants get
  revisited against reference-economy snapshots rather than re-tuned on vibes.
- The "asymmetric join" hypothesis (a new heavyweight process starting while others are already
  deep into execution, rather than several starting simultaneously) was raised during this
  session's own investigation but never cleanly isolated as its own test scenario — worth a
  dedicated look if real contention is still observed after this MR ships.

Closes 2 more of #1133's 12 acceptance criteria (10 total closed so far, across MR1-MR5):
- [x] "One Claude + one Codex can work concurrently without an unbounded number of Vitest pools
      appearing."
- [x] "The number of heavyweight workers has a documented, mechanically enforced host-level upper
      bound."

Still open (both explicitly deferred, not silently dropped):
- [ ] "AI-long one-worker vs current file-parallel mode is benchmarked under the real two-agent
      workload and the chosen setting is documented with measurements." (item I)
- [ ] "The fix does not weaken CI coverage or the deterministic AI test matrix." — a standing
      constraint the whole arc has held so far rather than a one-time task; carried forward as an
      open item since it was never explicitly itemized as "closed" by any prior MR either.

### MR6 — agent-facing `yarn verify:local:status` (P2) ✅ merged (PR #1141)

Built on top of MR3/MR4's durable/ownership records and MR5's budget metadata, not `ps`
heuristics: `scripts/verify-local-status.sh` shows the mutex's current holder (if any), every
live budget-semaphore holder up to `HOST_VERIFICATION_LEASE_BUDGET`, any process currently
blocked waiting for either (a genuinely new signal — see below), and each of the four durable
scopes' (`full`, `ai-long`, `ai-playability`, `perf`) last known state, delegating entirely to
the existing `read-durable-test-result.sh <scope>` for the durable judgment rather than
reimplementing it. Row states: `ACTIVE` / `QUEUED` for live coordination, `RUNNING` / `DONE` /
`ABANDONED` / `STALE` / `NONE` for durable scopes. One deliberate deviation from the issue's
original terse sketch: no per-row log path for `ACTIVE`/`QUEUED` rows, since the mutex and budget
semaphore are pure coordination primitives with no log of their own (a durable scope's own log is
reachable via `read-durable-test-result.sh`, which already tails it for an `active` scope).

**QUEUED visibility needed new self-registration — neither primitive previously left any trace of
a *waiting* process, only of one that had *acquired*.** Both `hvl_acquire` and
`hvl_acquire_budget_slot` now write a small file (pid, command label, worktree, wait-started-at)
the first time they actually have to wait, removed on acquire or via `hvl_wait_cancel`'s shared
INT/TERM handler. A record from a process since `SIGKILL`ed is a read-side concern (filtered by a
liveness check), never a write-side guarantee. `hvl_acquire_budget_slot` also gained an optional
`[label]` parameter (backward-compatible default `"budget"`) so a won slot's owner file can name
the real command; `run-test-suite.sh`'s three modes now pass their own mode name.

**A real, previously-undiscovered bug in `hvl_run_registering_job` was found and fixed while
manually verifying this MR's own durable-scope rows (latent since MR3, not introduced here):** it
unconditionally `set -e`'d at its own end regardless of the caller's prior errexit state, silently
defeating a caller's deliberate `set +e` around the call (done specifically to capture `"$?"`
afterward). Confirmed directly under both bash and dash with a minimal repro. This corrupted
`exit_code=` (left empty) in the durable `.status` file for any `--no-lease` durable command
(`test:ai-long:durable`, `test:ai-playability:durable`, `perf:report:durable`) whose wrapped
command actually failed — `test:durable` (`full`, always leased) was unaffected, since it wraps
`run-under-host-lease.sh` as a separate process and shell option state never crosses that
boundary. Neither pre-existing test for this path had ever exercised a *failing* wrapped command.
Fixed by having the function save and restore the caller's own errexit state instead of forcing
it; regression test added as `run-durable-test-suite-no-lease.test.sh`'s third scenario.

See `tests/hooks/verify-local-status.test.sh` for the full contract (idle-host baseline,
passed/failed/running/abandoned durable rows, live mutex and budget ACTIVE/QUEUED rows with
correct in-use counts) and `.claude/rules/hooks-and-tooling.md`'s "`yarn verify:local:status`"
section for the complete mechanism-level writeup of both the feature and the bug fix.

### MR7 — real-host benchmark/tuning pass (2026-09-21 issue comment) 🟡 partial

Scope was the issue's own follow-up comment: run the real benchmark matrix, tune the host
budget/ai-long-parallelism knobs from evidence, and either close #1133 or file any newly-found
structural bug narrowly. Ran on the actual dev host (10 logical/physical cores, Apple Silicon,
32GB RAM, swap disabled, macOS, Node v26.4.0, vitest 4.1.9) with real concurrent-agent
contention present for parts of the session (another agent's worktree ran real
`test:regular`/pre-push cycles throughout) — noted per-scenario below rather than pretending a
clean isolated baseline throughout.

**Benchmark data (§1, partial — see "Not done" below):**

| Scenario | Wall time | Notes |
|---|---:|---|
| 1x solo `yarn test` | 334s | host idle |
| 2x concurrent | 607s each (1.82x) | host idle |
| 3x concurrent | 657-659s each (1.97x) | host idle |
| 4x concurrent, default budget=3 | 577-1002s | 4th queued; **real external contention** from another agent's `regular` job took one of the 3 slots, so only 2 of 4 got immediate slots — an authentic two-agent data point, not a clean 4-way-only measurement |
| 4x concurrent, budget raised to 10 (no self-queue) | 766s each | **all 4 failed** — see bug #1 below |

Peak resource sampling used `ps`-based vitest-worker-count and load-average polling; the
load-average field had a shell field-splitting bug in the sampler script (a scratch tool, not
committed) and its absolute numbers are unreliable — worker-count and wall-clock are the
trustworthy signals above. Not measured: `perf:report`/ai-playability contention (§5), the
`fileParallelism:false` ai-long comparison (§2), the asymmetric-join scenario (a heavy job
starting mid-way through another's execution, distinct from simultaneous starts) — all
explicitly deferred, not silently dropped; see "Not done" below.

**Bug #1 (found via the raw 4-way scenario, fixed + verified):**
`tests/systems/minor-civ-league-longrun.test.ts`'s `'replays the same peaceful compact trace
from an identical seed'` test reproducibly timed out (23.5-24.8s, 4/4 concurrent jobs, byte-
identical failure) against a hardcoded 20000ms budget. Root cause: unlike its six `it.each`
siblings (which average ~12.3s each under the same contention, well inside their own 20000ms
budget), this test runs the full 120-turn simulation **twice** (a determinism check) while
sharing the single-run budget. Fixed by doubling its timeout to 40000ms, matching the doubled
workload, with a comment explaining the derivation. Re-run standalone: 21.42s, passes.

**Bug #2 (found via the ai-long-alone scenario, fixed + verified — a real architectural gap
the plan doc's own MR5 section had already flagged as open, §4 in the issue):**
`scripts/run-ai-long-horizon.sh` held only its own separate `ai-long-horizon-lease` mutex
(via `run-under-host-lease.sh`), never the shared host-wide budget semaphore
`run-test-suite.sh`'s three modes (`full`/`regular`/`intensive-simulations`) already respect.
This meant up to `HOST_VERIFICATION_LEASE_BUDGET` (3) of those **plus** one ai-long run could
proceed fully simultaneously — one more heavyweight Vitest invocation than the documented
ceiling. Not theoretical: directly observed via `yarn verify:local:status` showing an ai-long
stall-retry attempt genuinely overlapping with another agent's real `regular` push-verification
run at the same instant. Fixed by having `run-ai-long-horizon.sh` also acquire one shared
budget slot (`hvl_acquire_budget_slot ai-long`) for its entire run — including stall-retry
attempts and their backoff sleeps — acquired *before* the script's own
`HOST_VERIFICATION_LEASE_ROOT` override so it resolves against the real shared root, not
ai-long's separate domain. Deliberately the simplest policy (one slot, not a weighted
multi-slot cost) per the issue's own stated preference for the simplest policy that gives a
single known host-wide ceiling. Its own per-ai-long mutex is untouched and still separately
prevents two ai-long runs from double-booking each other. Verified live: with
`HOST_VERIFICATION_LEASE_BUDGET=1` and a concurrent `yarn test` holding the only slot, a
started `yarn test:ai-long` now correctly shows as a `QUEUED` row in
`yarn verify:local:status` (never possible before this fix) and proceeds only after the slot
frees. All 28 existing `yarn test:hooks` scenarios still pass, including
`run-ai-long-horizon-stall-retry.test.sh` unmodified.

**The "ai-long stalls to zero CPU progress" investigation (§2/§6 evidence, root-caused —
not a wrapper-chain bug):** `yarn test:ai-long` (and a `-t lh-standard-small`-filtered single
scenario) stalled to genuine zero-CPU-progress 6/6 times across two independent invocations
during this session, each auto-retried by the #1131 watchdog and eventually exhausting
retries with a clean `STATUS: STALL`. Memory pressure, swap, and process-group CPU-tracking
correctness were all ruled out directly (66% system-wide free memory, swap disabled/0 used,
and a dedicated instrumented repro confirmed every descendant — including the real Vitest
worker fork — correctly shares the wrapper's detached process-group pgid, with the worker
consistently visible at 100%+ CPU). The actual test logic was confirmed healthy in isolation:
run directly through plain `vitest run -t lh-standard-small`, it completed in 48.8s (in line
with the documented ~19.4s baseline plus known contention slowdown, not the ~1155-1571s seen
in the failing runs). Bisecting the wrapper chain layer by layer on a now-quiet host — plain
`run-with-timeout.mjs` (52s, clean), `run-under-host-lease.sh` with an isolated lease root
(51s, clean), the same with the *real* (non-isolated) host-scope root (51s, clean), and
finally the full unmodified production `run-ai-long-horizon.sh -t lh-standard-small` itself
(51s, clean) — found no defect in any layer once the host was actually quiet. Conclusion: the
six stalls were genuine, self-inflicted host exhaustion from this session's own unusually
aggressive back-to-back benchmark campaign (several 4-way-concurrent full-suite runs, one of
which failed all 4 jobs, run within about an hour on one 10-core host), not a code bug — the
stall-retry mechanism worked exactly as designed throughout (never a silent hang, never a
false pass, always a clean machine-checked signal). Bug #2 above is the real, durable
mitigation: it directly caps the worst-case simultaneous-heavyweight-job count that can
produce this condition under *normal* two-agent usage. No further code change is filed for
this specific investigation; re-open with fresh evidence if it reproduces under normal
(non-benchmark-stress) conditions.

**Not done in this MR (explicitly deferred, not silently dropped):**
- The full 9-scenario benchmark matrix (§1) — completed 1x/2x/3x/4x-gated/4x-raw only; ai-long
  alone/+regular/+full combinations, the two focused-during-heavy-load and asymmetric-join
  scenarios were not cleanly measured (the ai-long-alone attempts became the stall
  investigation above instead of clean timing data).
- §2 (ai-long `fileParallelism:false` comparison) and §5 (`perf:report`/ai-playability
  contention check) — not started.
- §3 (validate/change the default budget of 3) — not re-tuned; the 2x/3x/4x scaling numbers
  above (1.82x/1.97x/queued-4th) are consistent with the existing default's own documented
  spot-check rationale, but were not run as a dedicated statistical pass, so the existing
  default is left as-is rather than changed on this partial evidence.
- §4 (should ai-long participate in the shared budget) — **answered and shipped**: yes, one
  slot (bug #2 above).
- §7 (close #1133) — not done. The benchmark matrix is still incomplete per the items above.

### MR8 — cross-context PID-visibility fix (2026-09-21 issue comment) ✅ done

Follow-up issue comment reported and reproduced a real, safety-relevant bug: from a restricted
Codex command context, `yarn verify:local:status` reported a lease as fully idle at the exact
moment the same command run from the privileged execution context found two genuinely live
holders on disk. Root cause: `hvl_pid_is_live` trusted `kill -0` alone; POSIX `kill(2)` returns
`EPERM` (not `ESRCH`) when a process genuinely exists but the caller lacks signal permission — a
real condition across a sandbox/privilege boundary — and `kill -0 2>/dev/null` discards that
distinction. Fixed by falling back to a `ps -p` (listing-only, no signal permission needed)
check before concluding "not live," at the single primitive every reclaim decision and status
display in this system reads from. Two direct `kill -0` calls in `run-durable-test-suite.sh`
that already sourced the library but bypassed it were also switched over — same bug class, same
fix. See `.claude/rules/hooks-and-tooling.md`'s new section for the full writeup and
`tests/hooks/host-verification-lease-pid-visibility.test.sh` for the regression coverage.
Explicitly not claimed as solved: a true PID-namespace container where even `ps` can't see
foreign-namespace PIDs has no local probe that can prove liveness — documented as a residual
limitation, not silently ignored.

## Notes for whoever picks this up next

- Do not attempt MR2 onward without re-reading #1133 in full — the "Recommended design" section
  has exact required-fields lists (e.g. MR3's lease metadata: supervisor PID + start identity,
  job PGID, worktree, git HEAD + working-tree fingerprint, command/scope, start timestamp,
  durable log path) that this summary does not repeat verbatim.
- Every MR after MR1 touches infrastructure other concurrent agents on this host actively depend
  on (`.claude/rules/hooks-and-tooling.md`'s own #608 section, plus this session's own read of
  `project_concurrent_agents_norm` — two agents running concurrently on this dev host is the
  normal case, not an edge case). Test each MR's concurrency behavior directly (real nested
  process trees, real second-worktree races) rather than trusting single-process unit tests.
