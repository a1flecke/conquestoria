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

### MR3 — process-group-based lease ownership + signal forwarding (items B, E) ✅ merged (see git history for this file's introducing PR)

Added `hvl_run_registering_job` to `host-verification-lease.sh`: puts the wrapped command in its
own new process group (`set -m` — verified empirically to give a newly backgrounded job a fresh
pgid instead of inheriting the caller's, on this platform's `/bin/sh`), registers that pgid into
the held lease's metadata as `job_pgid` as soon as it's known, and forwards INT/TERM to the whole
group rather than one child pid. `hvl_is_stale` now checks `job_pgid` liveness (`kill -0
-$job_pgid`) before ever reclaiming on a dead-supervisor or PID-reuse verdict — a live registered
job group is never stolen no matter how long its supervisor has been gone. `run-under-host-lease.sh`
and `verify-before-push.sh`'s `run_phase` both now run their wrapped command through this shared
helper instead of duplicating background/signal-forwarding logic (the old bespoke version in
`run-under-host-lease.sh` is gone; `verify-before-push.sh` gained job registration it never had at
all before, since it previously ran its phases in the foreground with no process-group isolation).

New `tests/hooks/host-verification-lease-process-group.test.sh` proves this with a real
child+grandchild nested tree (not the single-`sleep` fixture): the registered `job_pgid` matches a
real live group containing every nested descendant; cancelling the supervisor reaps the *entire*
tree, not just the immediate child; and a supervisor killed outright with SIGKILL (bypassing its
own release trap, exactly like a real crash) never has its lease stolen while the registered job
group is still alive, but the lease becomes acquirable again the moment that group actually ends.

**Known residual, intentionally out of scope:** if a caller's chain goes through
`run-with-timeout.mjs` (which itself `spawn`s its real command with `detached: true`, i.e. a
*second*, deeper process-group boundary — `run-under-host-lease.sh`'s two AI-suite callers and
`verify-before-push.sh`'s two phases all do this), the registered `job_pgid` is the group
containing the `node run-with-timeout.mjs` process itself, not that deeper detached descendant.
This is sufficient for the actually-observed failure mode (an outer shell/supervisor layer dying
while the real job continues), because `run-with-timeout.mjs`'s own SIGINT/SIGTERM handlers
already re-signal its detached child's group when it receives a signal — the group signal only
needs to reach that Node process, not the detached grandchild directly. It would NOT catch the
narrower case of `run-with-timeout.mjs` itself dying while its detached child survives; closing
that gap would need `run-with-timeout.mjs` to report its own child's pid back through a side
channel (an env-var-provided file path) so the shell layer could register the *deeper* pgid
instead. Not attempted here — no observed incident motivates it, and it adds meaningful complexity
for a narrower failure mode than the one this MR actually fixes.

Closes 2 more of #1133's 12 acceptance criteria (7 total closed so far, across MR1+MR2+MR3):
- [x] "Retrying after stream loss cannot start a duplicate while the original registered process
      group is still alive."
- [x] "Cancellation kills/reaps the whole intended process tree or leaves an explicitly
      discoverable registered live job; no unowned Vitest pool remains."

### MR4 — generalized durable-command layer (items C, D) — NOT STARTED

Refactor `run-durable-test-suite.sh`'s ideas into a generic `run-durable-command <scope>
[resource-class] -- <command...>` / `read-durable-command-result <scope>` layer usable by full
tests, AI long-horizon, AI playability, and perf report — each currently has its own bespoke (or
absent) durable-evidence story. Status must resolve to exactly one of `active` / `passed` /
`failed` / `abandoned` / `mismatched`, verified against a live registered job identity (from
MR3), never by an agent inspecting `ps`. Requires a live-tee (stream loss must be
presentation-only, never evidence) and a reconnect/status command that can tail the same file
without restarting the run.

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
