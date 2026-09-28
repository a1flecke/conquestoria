# Durable Signal Status Design

## Goal

Make an interruptible durable test run record an explicit failed `cancelled`
result instead of leaving stale liveness artifacts that read as `abandoned`.

## Scope

`scripts/run-durable-test-suite.sh` owns the worktree-local durable marker,
status file, and job-pid file. A normal exit already writes a terminal status;
this change extends that guarantee to catchable `INT`, `TERM`, and `HUP`
signals. The streamed command and log writer run as managed background
children rather than a foreground pipe, so the supervisor can act on a signal
immediately instead of waiting for the stream to finish.

An uncatchable death, such as `SIGKILL`, remains distinguishable as
`abandoned`. That status continues to mean the reader found a dead recorded
process without a terminal status file; it must never be accepted as passing
evidence.

## Behavior

1. On a catchable termination signal, the runner writes `failure_kind=cancelled`
   with the conventional signal exit code, removes `.running` and `.job-pid`,
   releases its local lock, and exits.
2. The durable-status reader then reports `STATUS: failed`, not `STATUS:
   abandoned`.
3. Existing successful and ordinary failed durable runs retain their current
   status format and exit semantics.
4. The runner persists terminal cancelled status and removes liveness markers
   before waiting for child cleanup. This survives external execution layers
   that follow `TERM` with `SIGKILL`.
5. The terminal status records `completion_reason=signal`, the received
   signal, and the supervisor/job PIDs. The log records receipt of the signal,
   durable-status persistence, and completed cleanup so a later agent can
   distinguish a user or tool cancellation from a product-test failure.
6. A hook-level regression test starts a sleeping no-lease durable run,
   signals the actual durable supervisor, waits for it to exit, and verifies
   the terminal cancelled status and artifact cleanup.
7. If an external force-kill prevents terminal status from being written but
   the worker persisted `failure_kind=cancelled`, the reader reports a failed
   cancellation with the recorded supervisor/job IDs and directs the agent to
   the durable log. It reserves `abandoned` for evidence with no cancellation
   record.

## Non-goals

- Treating a cancellation as successful verification.
- Recovering or changing evidence after an uncatchable process death.
- Changing host lease or test scheduling policy.
