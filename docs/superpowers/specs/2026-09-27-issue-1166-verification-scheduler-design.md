# #1166 — Verification scheduler: collision locks, host capacity, foreground priority

Status: **implemented and validated on the real host (2026-10-02)**; the measurements
are in `docs/verification-scheduler-benchmark.md`. Retained as design rationale (cited by
`.claude/rules/hooks-and-tooling.md`). Follow-up to #1133.

## Problem, restated

One fungible 3-slot host budget was serving three different purposes at
once: preventing collisions, bounding CPU, and ordering work by urgency.
Concretely, before this change:

- `test:ai-long` took a shared slot *before* its own singleton mutex and held
  it for its whole lifetime, including retry backoff sleeps. A second
  accidental ai-long burned a slot while doing nothing but waiting.
- The push-verification mutex was shared with *background* `yarn
  test:durable`, so another agent's durable run blocked a `git push` twice
  over (mutex and budget).
- `git push` re-ran `test:regular` + `build` even right after `verify:pr`
  proved build + full suite for the same commit.
- `verify:pr` failed healthy runs that exceeded 480s, although #1133's own
  measurements show permitted 2-3-way contention takes a full suite to
  ~600-660s.

## Decision 1 — Keep and refactor the shell implementation (for now)

**Answer: keep/refactor shell.** Not a rewrite to Node/TypeScript in this
change. Reasons, weighted as the issue asks:

- **Reliability.** Everything #1133 hardened the hard way lives in the
  process-lifecycle layer: atomic `mkdir` acquisition, stale-owner reclaim
  with PID + start-marker identity, `EPERM`-aware liveness across the Codex
  sandbox, supervisor-vs-job ownership, tree-walk cancellation, dash-safe
  traps, domain-keyed reentrancy. #1166 needs *none* of that to change. A
  lane is the same slot primitive pointed at a second directory with a
  second capacity; proof reuse is field comparison (the same shape as
  `read-durable-test-result.sh`); the ai-long fix is a lock-order change in
  one caller. A rewrite would move exactly the layer where #1133 found its
  bugs into new, unproven code.
- **Validation reach.** This change was built in a 4-core Linux cloud
  container with no Codex, OpenCode Go, or macOS available. The existing
  primitives have already been exercised in those contexts; a Node
  controller's signal/sandbox/dash behavior could not be validated from here
  at all. Shipping an unvalidatable rewrite of the most failure-prone layer is
  the larger risk.
- **Maintainability / testability.** The new policy adds no new state machine:
  no queue ordering, no priority inversion handling, no borrowing, no weighted
  costs. Every new invariant is covered by a deterministic test that uses
  explicit release files or fake `sleep`/`yarn` probes rather than timing
  (see the invariant table in `.claude/rules/hooks-and-tooling.md`).
- **Portability.** No new runtime assumption: the pre-push hook still needs
  nothing beyond POSIX `sh`, `ps`, `mkdir`, and `git` before admission.

**Trigger for a Node/TypeScript admission controller.** Rewrite when the
policy itself needs real scheduling state, e.g. any of: lane borrowing with
fairness/starvation guarantees, weighted job costs, FIFO/priority queues
within a lane, or cross-lane preemption. At that point typed state,
injected clock/liveness/filesystem, and N-agent simulations pay for the
migration. Keep the shell layer as a thin bootstrap that execs the
controller, and keep the on-disk formats (`slot-N/owner`, `waiting/<pid>`,
`pr-verification.status`) so the status view and old checkouts interoperate.

## Decision 2 — What must stay compatible

- On-disk layout: background slots stay at `<scope>/budget/slot-N` (an older
  checkout's holders still count and are still reclaimable); the
  publication lease stays at `<scope>/push-verification-lease`; owner files
  only *gain* a `lane=` field.
- `HOST_VERIFICATION_LEASE_BUDGET` keeps working as an alias for the
  background lane.
- `CI` remains a complete no-op; CI never consumes a proof.
- `read-durable-test-result.sh`'s `STATUS:` contract, durable evidence, and
  STALL retry semantics are untouched.

## Model

| Concept | Mechanism |
|---|---|
| Collision locks | publication lease (push + `verify:pr` only), ai-long singleton, worktree durable lock |
| Host capacity | foreground lane (1) + background lane (2), non-borrowable, held only around a running job |
| Priority | lane chosen by the caller via `HVL_CAPACITY_LANE`, consumed at acquisition |
| Proof reuse | `verify:pr` records `capabilities=build,test:full` for a clean, unmoved HEAD; pre-push consumes it |
| Time | 480s SLO warning; 1800s runaway failure |

The 1+2 split keeps the #1133 host ceiling (3) while guaranteeing a push
never waits solely behind background work. It is a hypothesis to be
measured, not a tuned optimum.

## Decision 3 — Migration

Single step; no persisted state needs migrating (all state is ephemeral
lease directories plus per-worktree `.verification/`). An old
`pr-verification.status` without `proof_format=1` is simply not a proof and
falls through to normal verification. A mixed fleet (one worktree on an old
checkout) is safe: the old code's holders occupy background slots, which the
new status view scans in full.

## Decision 4 — How it is tested

Deterministic hook tests (no wall-clock assertions in the new scenarios):

- lane independence, non-borrowing, lane-request consumption, invalid lanes;
- background durable never takes the publication lease, foreground does;
- ai-long: exact slot occupancy probed *at* each attempt and *at* the
  backoff sleep (fake `sleep` sentinel); a second ai-long queues on the
  mutex holding zero capacity and runs only afterwards;
- proof reuse: stronger-satisfies-weaker, dirty tree, moved HEAD, tree
  dirtied mid-run, failed run, weaker capability, unknown format, CI and
  opt-out all fall through; publication verifiers really request
  foreground;
- SLO vs runaway classification; status rows per lane.

The new ai-long scenarios were confirmed to **fail against the pre-change
script** (slot observed held during backoff).

## Host validation (was "Not done here")

Done: the benchmark matrix, status accuracy, proof reuse and the AI-long parallelism comparison were run on the
10-core/32 GB host and are recorded in `docs/verification-scheduler-benchmark.md` (raw data in `docs/benchmarks/`,
harness `scripts/benchmark-verification-scheduler.mjs`). The 1 + 2 lane split held in every scenario; AI-long
`fileParallelism:false` was ~15% slower, so the current configuration stays; the push gate's fixed phase ceilings
were widened to runaway guards after a healthy run was killed at 599 s under out-of-design load. Per-agent
(Codex / OpenCode Go / Claude) sandbox wrappers were not separately validated; PID-namespace isolation remains the
documented residual limitation of the liveness model.
