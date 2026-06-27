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

`require-green-before-push.sh` fires only for `git push`, `gh pr create`, and `gh pr merge` — not for `git commit`.

**From a worktree** (the common case for all Claude sessions):
- `yarn install --immutable` — serial, ~3s
- `tsc` + `vitest run --root <worktree>` — **parallel**, wall-clock ~25s (vitest dominates)
- Shell hook smoke tests — serial after vitest, ~5s
- **Total: ~35–45 seconds**

**From the main tree:**
- `yarn build` (tsc + vite bundle) then `yarn test` — sequential, ~50s total

**Set Bash tool timeout to match the command, not the hook:**
- `git commit` — **30 000 ms**. No hook runs tests; the commit itself takes < 1s.
- `git push` / `gh pr create` / `gh pr merge` — **120 000 ms**. The hook runs tsc + vitest.
- A 360 000 ms timeout on `git commit` papers over the wrong symptom. Match the timeout to what the command actually does.

## Vitest cache config

`cacheDir` in `vite.config.ts` is pinned to `node_modules/.vite/vitest` in the main worktree. Without this, `vitest --root /worktree/path` looked for Vite's dependency optimizer cache inside the worktree where `node_modules/` doesn't exist.

**What this fixes:** Vite's dependency pre-bundling cache is shared across all worktrees.

**What this does NOT change:** esbuild TypeScript transforms (~17s cumulative / ~2–3s wall-clock). That time is proportional to suite size (~300 files × 8 workers) and is inherent to every run. The ~26s floor is the cost of running the suite, not a cache miss.

## Worktree setup: trust mise before the first push

Every new worktree has its own `mise.toml`. The `run-with-mise-worktree.test.sh` smoke test will fail with `mise ERROR Config files ... are not trusted` until you run:

```bash
mise trust /path/to/worktree/mise.toml
```

Run this immediately after creating a worktree, before the first push attempt. The `EnterWorktree` tool does not do this automatically.
