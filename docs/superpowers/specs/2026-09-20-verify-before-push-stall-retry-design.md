# `verify-before-push.sh` automatic STALL retry: design

## Status

Follow-up to #1133, not part of a numbered issue — user-directed infra work discovered while
working the #1125/#1126/#1080/#1083 stability arc: pushing repeatedly hit a STALL (host
contention) and had to be retried by hand, observed across this session's own pushes and directly
confirmed to also affect a concurrent OpenCode agent's own push-verification on the same host.

## 0. Problem, confirmed with evidence before designing anything

- `run-with-timeout.mjs`'s stall watchdog already distinguishes exit **125** (STALL — zero CPU
  progress, a machine-checked claim) from **124** (plain timeout — genuinely slow, not stalled)
  from any other non-zero (a real test/build failure). Its own message already says "safe to
  retry immediately."
- `verify-before-push.sh` (`set -eu`, calling the timeout runner unguarded) already propagates
  that exact exit code as its own exit status — confirmed by reading the script, not assumed.
- Nothing *used* that distinction. `require-green-before-push.sh` (the Claude-only PreToolUse
  wrapper) collapses every non-zero into one generic `"ERROR: pre-push verification failed"` +
  exit 2. The real `.githooks/pre-push` (what Codex/OpenCode hit directly) does preserve the raw
  `STALL:` text in `git push`'s own output, but nothing acts on it automatically either — a human
  or an agent has to notice it and re-run the command by hand. This session did that by hand five
  times across two pushes before the pattern was worth automating.
- Directly observed cross-agent: one stall's held lease belonged to
  `.worktrees/opencode-tailscale-remote` (an OpenCode agent), proving the host-wide lease already
  coordinates correctly across agent frameworks (#1133 built it that way on purpose — its own
  text discusses Codex's sandbox explicitly). The fix belongs at the same layer, not duplicated
  per agent framework.

## 1. Where to put the retry, and why nowhere else

`scripts/verify-before-push.sh` is the one script every path already funnels through:
`.githooks/pre-push` (every agent, via the real git hook), the Claude Code push-gate hook
(`require-green-before-push.sh`, when its own worktree-detection fallback fires), and CI's `yarn
verify:push --no-mise`. Putting the retry in `run_phase()` here means every caller gets it for
free, agent-framework-agnostic by construction — the same design property #1133 already
established for the lease/budget mechanism this sits on top of. Rejected alternatives:

- **Retry inside `require-green-before-push.sh` only.** Would fix Claude Code sessions and leave
  Codex/OpenCode (the majority of what this user runs, per their own account) with the exact
  manual-retry problem this change exists to remove.
- **Retry inside `run-with-timeout.mjs` itself.** Wrong layer — that script's job is detecting a
  stall and reporting it distinctly (125 vs 124), which it already does correctly; deciding
  *what to do* about a detected stall (retry a specific command with backoff) is a caller
  decision, and `run-with-timeout.mjs` is also used by `run-ai-long-horizon.sh`,
  `run-perf-report.sh`, and `run-ai-playability-regressions.sh`, none of which necessarily want
  the same retry policy.

## 2. What retries, what never does

Only exit **125**. Never **124** (the work is genuinely slow — retrying just wastes the same
amount of time again for no reason) and never any other non-zero (a real test/build failure —
retrying risks silently reporting a flake as "fixed" instead of surfacing it, exactly the anti-
pattern this repo's own `.claude/rules/` warn against elsewhere, e.g. `feedback_fix_flakiness_
dont_rerun` as a durable project convention). This precision is the entire point: "safe to retry"
is true specifically because the watchdog already proved zero CPU progress, not because "it
failed, try again" is a generally safe policy.

## 3. Bounded, backed off, and NOT releasing the host-wide mutex between attempts

`VERIFY_STALL_MAX_RETRIES` (default 2, so 3 total attempts) and
`VERIFY_STALL_RETRY_BACKOFF_SECONDS` (default 20) are both overridable env vars, matching this
repo's existing convention for every other tunable in this file (`VERIFY_TEST_TIMEOUT_SECONDS`,
`HOST_VERIFICATION_LEASE_BUDGET`, etc.).

**Deliberately does not release+reacquire the host-wide verification mutex
(`hvl_acquire "pre-push verification"`) between retry attempts**, even though that would let
another waiting push-verification-class process go first during the backoff. Traced why this
would add real risk for uncertain benefit:

- `hvl_acquire`'s own wait loop installs its own INT/TERM traps and explicitly clears them
  (`trap - INT TERM`) on success — calling it again mid-script would silently clear
  `verify-before-push.sh`'s own `hvl_cancel_and_release` INT/TERM traps (installed once, right
  after the first acquire), unless carefully re-installed after every re-acquire. Getting this
  wrong risks a Ctrl-C during a retry-driven backoff leaving the lease held forever with no
  cleanup — a correctness regression in shared infra every agent's push depends on, for a
  courtesy gesture of uncertain payoff.
- The uncertain payoff: the STALL this session actually observed happened *after* the mutex was
  already held exclusively (no other push-verification-class process was contending for it at
  that moment) — the real contention source was host-wide CPU oversubscription from processes
  outside this lease's scope entirely (other agents' concurrent `yarn test` runs, each already
  gated by the separate budget semaphore, but apparently still enough in aggregate). Releasing
  the mutex specifically would not have freed the resource that actually caused the stall.

Kept it simple: hold the mutex for the whole script, exactly as before this change: retries just
extend how long that single acquisition is held, bounded by the backoff/retry-count ceiling.

## 4. Time budget

A stalled attempt exits fast — `STALL_BOOT_GRACE_SECONDS` (20) + `STALL_GRACE_SECONDS` (90) ≈
110s, not the phase's full timeout (600s for tests, 300s for build) — so the realistic worst case
across the default 3 attempts is on the order of a few minutes, not the timeouts multiplied by
attempt count. Still, this is strictly longer than before, so the external timeouts that wrap the
whole `verify-before-push.sh` invocation needed raising to avoid a worse failure mode: killing the
*governing hook* mid-retry, which (per Claude Code's own documented PreToolUse behavior) lets the
tool call through **without completing verification at all** — strictly worse than the stall it
was retrying around. Raised `.claude/settings.json`'s `require-green-before-push.sh` timeout
240s → 900s, and the matching Bash-tool-timeout guidance in `CLAUDE.md` /
`.claude/rules/hooks-and-tooling.md` to match.

## 5. Testing

`tests/hooks/verify-before-push-stall-retry.test.sh` (new — the existing
`verify-before-push.test.sh` only ever exercises fixed exit codes, never a multi-attempt
sequence, so a new fixture harness supporting a per-call exit-code sequence was needed rather than
extending the existing one). Six scenarios: stall-then-success (overall pass, exactly 2 test-phase
calls, build still runs, backoff message asserted); every attempt stalls (retries exhaust, original
125 preserved, build never runs); a plain timeout (124) never retries; a real failure never
retries; `VERIFY_STALL_MAX_RETRIES=0` disables retrying entirely; the build phase's own stall
retries independently of the test phase's (separate attempt counters — a passed test phase stays
at exactly one invocation while the build phase retries).

`bash tests/hooks/run.sh` (the full hooks suite, discovers `*.test.sh` by glob, no manual
registration needed) — all pass; the one observed failure
(`run-test-suite-classification.test.sh`, "yarn: command not found") is an artifact of invoking
the suite directly without `scripts/run-with-mise.sh` and reproduces identically on `main` before
this change — confirmed by re-running that single file through the proper wrapper, where it
passes.
