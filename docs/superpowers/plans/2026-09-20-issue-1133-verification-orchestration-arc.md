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

### MR3 — process-group-based lease ownership + signal forwarding (items B, E) — NOT STARTED

Record the heavyweight job's actual PGID (not just the supervisor PID) in lease metadata; don't
reclaim a lease just because the supervisor PID disappeared while the registered job group is
still live. `run-under-host-lease.sh`'s signal forwarding (`kill -"$fwd_signal" "$run_child_pid"`)
targets one PID, not the process group (POSIX uses a negative PID for that) — needs an explicit
regression with a real child+grandchild+worker-like nested tree, not the current single-`sleep`
fixture, proving cancellation reaps or leaves a discoverable live job, and a second invocation
cannot start a duplicate while the first group is alive.

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
