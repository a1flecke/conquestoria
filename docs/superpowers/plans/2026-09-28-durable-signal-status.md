# Durable Signal Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a durable test run interrupted by a catchable signal as a terminal cancelled failure instead of abandoned evidence.

**Architecture:** Replace the foreground log-stream pipeline with managed worker and log-writer children. The supervisor can therefore receive a signal immediately, forward it to the worker, wait for both children, and write `cancelled` evidence with the signal and process IDs; the reader surfaces that diagnostic context.

**Tech Stack:** POSIX shell (`sh`), Bash hook regression tests, Git worktree-local `.verification` artifacts.

---

### Task 1: Prove the current signal gap

**Files:**
- Modify: `tests/hooks/run-durable-test-suite.test.sh`
- Test: `tests/hooks/run-durable-test-suite.test.sh`

- [x] **Step 1: Write the failing interruption test**

Start `sh scripts/run-durable-test-suite.sh cancelled-scope --no-lease -- sleep 30`
in the test fixture, wait for its `.running` marker, terminate the recorded
supervisor PID, and wait for it. Assert the status reader reports failed,
the status file says `failure_kind=cancelled`, and neither `.running` nor
`.job-pid` survives.

- [x] **Step 2: Run the focused test**

Run `bash tests/hooks/run-durable-test-suite.test.sh`.
Expect the new scenario to fail with abandoned evidence.

### Task 2: Record graceful cancellation

**Files:**
- Modify: `scripts/run-durable-test-suite.sh`
- Test: `tests/hooks/run-durable-test-suite.test.sh`

- [x] **Step 1: Implement the minimal signal cleanup handler**

Run the command worker and `tee` as background children connected by a named
pipe. Install `INT`, `TERM`, and `HUP` traps in both the supervisor and worker:
the supervisor forwards the signal, waits for cleanup, writes terminal status,
and records the signal and supervisor/job PIDs; the worker forwards the signal
to the registered test process. Append receipt and completed-cleanup messages
to the durable log.

- [x] **Step 2: Re-run the focused test**

Run `bash tests/hooks/run-durable-test-suite.test.sh`.
Expect PASS.

- [ ] **Step 3: Run hook coverage**

Run `./scripts/run-with-mise.sh yarn test:hooks`.
Expect PASS.

- [ ] **Step 4: Commit the tested fix**

Stage the two scripts and these design records, then commit with
`fix(verification): record durable cancellation`.
