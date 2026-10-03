# Verification scheduler — real-host validation (#1166)

Measured 2026-10-02 on the development host (10 cores, 32 GB, macOS/arm64) at base commit `03cd3180`, with the
scheduler as implemented by #1166 (1 foreground + 2 background capacity slots, AI-long singleton, proof reuse).
Raw numbers: [`benchmarks/verification-scheduler-real-2026-10-02.json`](./benchmarks/verification-scheduler-real-2026-10-02.json).
Harness: [`scripts/benchmark-verification-scheduler.mjs`](../scripts/benchmark-verification-scheduler.mjs).

## Method

The harness drives the **real scheduler scripts** through the issue's scenario matrix inside an **isolated lease
domain** (so a benchmark can never queue behind, or be mistaken for, another agent's run). It samples the lease
directories and the process tree every 500 ms to measure admission time, lane occupancy, worker count and host CPU,
takes one `yarn verify:local:status` snapshot per scenario, and evaluates the scheduler's invariants from those
measurements. It never kills by name or process group; only pids it spawned, by explicit descendant walk.

- **Foreground** = `verify-before-push.sh --regular` (regular suite + production build; proof reuse off).
- **Background** = `run-test-suite.sh full` on `tests/systems` (+ the hook suite).
- **AI-long** = `run-ai-long-horizon.sh` on a miniature of the long-horizon matrix (`lh-standard-medium`,
  `lh-veteran-medium`, and the determinism tests: the same two-file shape `fileParallelism` acts on). The full
  matrix takes 40–90 minutes, which would make a 15-scenario matrix a multi-day exercise.
- **Focused** = one `vitest run <file>`, ungated by design.

Three things to keep in mind when reading the numbers: the host has a macOS indexing daemon pinned near 100% of one
core for hours (load average ~3–5 when "idle"); real runs are single samples, not distributions; and the hook suite
the full/regular jobs run includes this harness's own short synthetic test.

Two modes: `--mode synthetic` runs the same real scripts against CPU-burning shims (deterministic invariants, run
by `tests/hooks/benchmark-verification-scheduler.test.sh`, including a fault-injection run that must **fail**);
`--mode real` produced everything below. Reproduce with
`yarn bench:verification-scheduler --mode real --scenarios 1,2,3 --json out.json --md out.md`.

## Result matrix (seconds)

"Queue" is admission delay (sampling resolution 0.5 s). Every scenario held every invariant.

| # | Scenario | Jobs: lane · queue → run |
|---|---|---|
| 1 | foreground alone | fg 0.6 → **297** |
| 2 | background full alone | bg 0.6 → **251** |
| 3 | AI-long alone | ai 0.6 → **957** |
| 4 | AI-long + one background | ai 0.6 → 1018 · bg 0.6 → 275 |
| 5 | AI-long + foreground | ai 0.6 → 1030 · fg 0.6 → **317** |
| 6 | AI-long + background + foreground | ai 0.6 → 1109 · bg 0.6 → 340 · fg 1.2 → **386** |
| 7 | two background + foreground | bg 0.6 → 372 · bg 0.6 → 370 · fg 1.2 → **409** |
| 8 | focused test while AI-long active | ai 957 · focused 0 → **2.8** |
| 9 | focused test while two background active | bg 304 · bg 303 · focused 0 → **4.9** |
| 10 | asymmetric join (bg, bg, AI-long, then fg) | bg 0.6 → 268 · ai 0.6 → 1149 · **fg 1.2 → 360** · third background job **queued 269 s** (see below) |
| 11 | second AI-long while one owns the singleton | ai 0.6 → 1017 · **ai2 queued 1016 → 1041** |
| 12–15 | stall-retry, proof reuse (valid / stale / linked worktree) | synthetic only; see below |

### What the matrix shows

- **Foreground progress.** A publication started while background work held capacity was admitted in ≤ 1.2 s in
  every scenario (5, 6, 7, 10). It never waited for a background job's lifetime. Its *runtime* grows with load
  (297 s alone → 317 / 386 / 409 s with AI-long / AI-long + background / two background) — about 7% to 38% —
  which is the cost of sharing 10 cores with up to three heavyweight jobs, not queueing.
- **Bounded background work.** The background lane never exceeded 2 holders and the foreground lane never exceeded 1
  in any scenario. In scenario 10 the third background-class job (a background suite behind AI-long + another
  background suite) correctly **queued for 269 s** and `verify:local:status` showed it as `QUEUED`.
- **AI-long singleton.** In scenario 11 the second request held **no capacity** while waiting on the singleton
  (peak background holders stayed 1) and started only after the first finished (1016 s later); two campaign matrices
  never ran concurrently.
- **Focused tests are unaffected by scheduling** (2.8 s with AI-long, 4.9 s with two background suites).
- **Status truth.** In every scenario `verify:local:status` capacity rows equalled the real slot holders at the
  moment of the snapshot, per-lane counts agreed with its own rows, and the queued job in scenario 10 was reported.
  While the final scenarios ran, another agent's (OpenCode's) full suite appeared correctly in the real
  `verify:local:status` as `ACTIVE ... lane=background worktree=...`.
- **Peak host CPU** reached 90–96% with three heavy jobs and ~25–38% with AI-long alone: AI-long is essentially
  single-core, so it is cheap to co-schedule.

## Proof reuse (real, from a linked worktree)

`yarn verify:pr` (build + full suite) passed in **389 s** and recorded a proof for the clean `HEAD`; the very next
`git push` from the same linked worktree ran the real `.githooks/pre-push` and took **2.5 s** (it reported proof
reuse and skipped the regular suite and the build). Without a matching proof the same gate runs the regular
suite and the build (~5-7 min in the matrix above): the follow-up commit that added this paragraph changed `HEAD`,
so its push is the stale-proof fallback and is timed in the PR. The valid / stale-or-dirty / linked-worktree /
failed-run / weaker-capability / unknown-format / CI cases are asserted deterministically by
`tests/hooks/verification-proof.test.sh` and exercised again by the harness (scenarios 13-15).

## AI-long parallelism: keep the current configuration

AI-long runs the matrix file and the continuity/determinism file in two workers (`maxWorkers: 25%`). The candidate
was `--no-file-parallelism` (one worker). Scenario 4 (AI-long + one background suite), same conditions:

| Configuration | AI-long (s) | Concurrent background suite (s) |
|---|---|---|
| current (two files in parallel) | 1018, 1079 | 275, 323 |
| `fileParallelism: false` | 1206 | 356 |

One worker made AI-long **~15% slower** and did not help the concurrent suite (it was slower in that sample too;
single-sample noise on this host is ~±10%). Serialising two files only lengthens the run; it does not remove CPU
pressure, because AI-long's second file is short and the first is single-core either way. **Decision: no change.**

## Defects found and fixed

1. **The push gate's fixed 600 s / 300 s phase ceilings turned contention into a failure.** In a contended re-run of
   scenario 10 (four heavyweight jobs at once — the benchmark's three plus another agent's full suite in the real
   lease domain — load average ~9) the foreground job was **killed at 599 s with exit 124 while making CPU
   progress**. #1166 had already split verify:pr into a latency SLO and a runaway ceiling; the push gate was still a
   hard latency limit. `verify-before-push.sh` now uses **runaway** ceilings of 1200 s (tests) and 600 s (build):
   hangs remain the stall watchdog's job (exit 125, retried), and the measured worst *permitted* case (409 s) keeps
   ~3x headroom. The Claude push-gate hook timeout was raised from 900 s to 1800 s to stay above the verifier's
   total budget (a hook that times out lets the push through unverified).
2. **`host-verification-lease-relocation.test.sh` failed whenever an agent exported
   `HOST_VERIFICATION_LEASE_ROOT`** (it tests the *default* root). The first real foreground run exposed it; the
   test now clears scheduler overrides itself.
3. **Harness defects fixed along the way** (a foreground check timed from a queued job; a stall-retry scenario that
   missed the release window; a status check that compared mismatched sets). Three times a *synthetic* scenario sat
   for 12–16 minutes with its sampling loop silent and could not be reproduced in 60+ reruns; the harness now
   records evidence and automatically retries an invalid run. Cause not identified (host-level suspension of the
   process family is the leading suspect).

## What this does not claim

- Single samples on a noisy host; ratios, not absolute seconds, are the evidence.
- The AI-long workload is a miniature of the real matrix (same structure, ~17 minutes instead of 40–90).
- Claude/Codex/OpenCode execution contexts differ in sandbox visibility; this validates the scheduler's policy and
  the process model on the real host, not each agent's wrapper. OpenCode's live run appearing correctly in the
  shared status view is the one cross-agent observation made.
- The 1 + 2 split held up in every scenario; no evidence supports changing it. Lane borrowing, weighted costs or
  queues (the documented trigger for revisiting shell vs Node) were not needed.
