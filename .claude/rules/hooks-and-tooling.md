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

- **Local gate** (the real `.githooks/pre-push` hook, and this Claude Code hook): both call `verify-before-push.sh --fast`, which runs `yarn test:fast` — the fast tier only, see "Fast/slow test split" below.
- **CI** (`yarn verify:push`, the `test` job in `.github/workflows/deploy.yml`, a required branch-protection status check on `main`): calls `verify-before-push.sh --no-mise` with no `--fast`, so it always runs the full `yarn test` (fast + slow tiers) as the actual merge gate, on isolated hardware.

**Set Bash tool timeout to match the command, not the hook:**
- `git commit` — **30 000 ms**. No hook runs tests; the commit itself takes < 1s.
- `git push` / `gh pr create` / `gh pr merge` — **120 000 ms** is enough for the local `--fast` gate. If you've just changed a slow-tier file and want to also verify it locally first (`yarn test:slow` or a targeted `yarn vitest run <file>`), do that as its own step before pushing — see #608 investigation notes above for observed durations up to ~600s worst case.
- A 360 000 ms timeout on `git commit` papers over the wrong symptom. Match the timeout to what the command actually does.

## Fast/slow test split (#608)

`scripts/run-tests-by-tier.sh` splits the suite into two tiers, to keep the local push gate fast without losing coverage at merge time:

- `yarn test:fast` (`run-tests-by-tier.sh fast`) — excludes the `SLOW_TEST_FILES` list defined in that script (currently: `ai-prepared-turn`, `basic-ai-worker-roads`, `turn-manager-beasts`, `save-load-mass-discovery`, `tech-panel`, `pacing-production-budget`, `pacing-reference-economy`, `start-placement-system`, `world-pressure-fairness`). This is what the local pre-push hook and the Claude Code push-gate hook actually run.
- `yarn test:slow` (`run-tests-by-tier.sh slow`) — runs ONLY those files, for a developer working directly on one of those systems.
- `yarn test` (full, unchanged) — always runs everything. This is what CI's required `test` status check runs; it is never given `--fast`, so slow-tier regressions still block merge, just not every local push.

**When adding a new heavy multi-city/era/seed simulation test:** add its path to `SLOW_TEST_FILES` in `scripts/run-tests-by-tier.sh`, in addition to giving it an explicit headroom-sized timeout (see below) — the two are complementary: the timeout stops it from spuriously failing under contention, the tier split stops it from adding wall-clock/CPU cost to every local push-gate run in the first place.

## Vitest cache config

`cacheDir` in `vite.config.ts` is pinned to `node_modules/.vite/vitest` in the main worktree. Without this, `vitest --root /worktree/path` looked for Vite's dependency optimizer cache inside the worktree where `node_modules/` doesn't exist.

**What this fixes:** Vite's dependency pre-bundling cache is shared across all worktrees.

**What this does NOT change:** esbuild TypeScript transforms. That time is proportional to suite size and worker count (`test.maxWorkers: 4`, see #608 below) and is inherent to every run — it is not a cache miss.

## Heavy simulation tests need an explicit, headroom-sized timeout (#608)

This dev machine routinely runs several Claude Code worktree agents in parallel (verified: 200+
worktree directories exist; a live agent was directly observed running the same test files
concurrently during the #608 investigation), each invoking `yarn test` independently and each
defaulting to vitest's own multi-worker sizing. That oversubscribes the machine's CPU whenever
2-3 agents' test runs overlap, and it is not something a single repo-side config change can fully
eliminate (`vite.config.ts`'s `test.maxWorkers: 4` caps one process's own worker count but can't
stop several concurrent processes from adding up).

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
