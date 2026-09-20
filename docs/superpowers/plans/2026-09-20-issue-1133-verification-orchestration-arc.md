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

Closes 1 more of #1133's 12 acceptance criteria (8 total closed so far, across MR1+MR2+MR3+MR4):
- [x] "Losing the terminal/tool stream does not make a heavyweight run inconclusive; a durable
      status command reports active/passed/failed/abandoned."

### MR5 — benchmarking-driven host resource budget (items H, I, J) — NOT STARTED

This is a measurement task first, a code change second: benchmark `maxWorkers: '25%'` under the
issue's six named scenarios (one full suite; two concurrent full suites; AI-long alone; AI-long +
regular/pre-push; AI-long + full suite; two focused runs during one heavy run), and
`vitest.long-horizon.config.ts` with `fileParallelism: false` against the current concurrent
matrix+continuity default, before choosing a bounded host-wide heavy-worker policy. Do not encode
a policy number without the measurement data backing it — see `.claude/rules/game-balance.md`'s
"Pacing Regression Prevention" section for the parallel precedent (never retune a ceiling without
attached measurement).

### MR6 — agent-facing `yarn verify:local:status` (P2) — NOT STARTED

Built on top of MR3/MR4's durable/ownership records, not `ps` heuristics: one view showing every
tracked heavyweight class's live/queued/done state, pid/pgid, worktree, elapsed time, and log
path. Depends on MR3 and MR4 landing first.

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
