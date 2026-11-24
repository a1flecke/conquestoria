# Conquestoria — Gemini / Antigravity Project Guide

Civilization-building strategy game. TypeScript + Canvas 2D + Vite (+ Tauri macOS shell).

## Canonical Policy (Zero-Drift Rule)

Canonical project policy lives in **`CLAUDE.md`** and **`.claude/rules/*.md`**. Shared tool-neutral workflow guidance lives in **`AGENTS.md`**.

> Note: `AGENTS.md` exceeds Antigravity's 24 KB per-file rule cap and is truncated at runtime. This file keeps the essential Antigravity workflow and pointers under budget without duplicating rule prose. Whenever this guide and `CLAUDE.md` / `.claude/rules/*.md` disagree, the canonical files and source/tests win.

## Agent & Subagent Policy

- **Execute coding, research, and implementation tasks inline in the current session**, matching `CLAUDE.md` and `.opencode/opencode.jsonc`.
- Do **not** spawn coding/research subagents (`self`, `research`, custom `define_subagent`), swarms (`swarm`), or multi-agent workflows (`run_workflow`).
- Only Antigravity's specialized `browser` (interactive UI preview/testing) and `image-generator` (visual asset generation) subagents are permitted when the task specifically needs them. `.agents/hooks.json` enforces this policy automatically.

## Worktree Policy

All implementation work happens in a fresh linked worktree off `origin/main` — **never edit, commit, rebase, merge, or switch branches in the main checkout**.

At the start of a coding task:
1. Check `git worktree list`. If you are in the main checkout, create a linked worktree off `origin/main` (for example under `.worktrees/<task>` or `../conquestoria-worktrees/<task>`) on a named feature branch (e.g., `antigravity/<issue-or-task>-<short-name>`).
2. Immediately bootstrap the new worktree:
   ```bash
   ./scripts/setup-git-hooks.sh
   git config --worktree --get core.hooksPath   # must print: .githooks
   ./scripts/run-with-mise.sh yarn install --immutable
   ```
   Run `mise trust mise.toml` if Mise requires trust for the new worktree.
3. Reuse your active worktree for follow-up fixes on the same task.

## Canonical Commands

Always use **`./scripts/dev.sh <task>`** or **`./scripts/run-with-mise.sh yarn <cmd>`**. Never run bare `yarn`, `npm`, `npx`, or `node`, never run `eval "$(mise activate ...)"`, and never run `./scripts/run-with-mise.sh node <file>`.

- `./scripts/dev.sh <task> [paths]` — preferred narrow task dispatcher (`build`, `typecheck`, `test <tests/...>`, `test-all`, `test-regular`, `hooks`, `install`, `setup-hooks`, `verify-pr`, `verify-pr-status`, `verify-status`, `durable`, `durable-status`, `ai-playability`, `ai-playability-status`, `ai-long`, `ai-long-status`, `web-smoke`, `web-smoke-cross-engine`, `docs-lifecycle`, `verify-impact`, `yarn-parity`, `known-gap-owners`, `maintainability-check`, `log <task> [N]`).
- `./scripts/check-src-rule-violations.sh <changed-src-files>` — static rule-violation scan for edited `src/` files.
- `./scripts/sync-main.sh` — fetch and rebase the current feature branch onto `origin/main`.
- `./scripts/push-branch.sh` — publish the current feature branch with pinned lease protection once it contains `origin/main`.
- `./scripts/dev-server.sh start|stop|status|reap` — the **only** way to run a dev server (serves this worktree on its own port, self-expires, and avoids orphaned servers on the shared host). Never start `yarn dev` or `vite` directly.
- `./scripts/pr-body.sh new|write|check|create|update <name> ...` — create and validate PR bodies in `/tmp/pr-bodies/<name>.md` (never write ad-hoc PR body files elsewhere).
- `./scripts/run-with-mise.sh yarn verify:launch <full|ai-long|ai-playability|perf>` / `yarn verify:stop <scope>|--all` / `yarn verify:local:status` — launch, stop (by recorded PID only), and inspect heavyweight local verification runs on the shared host.

## Shared Host & Safety Guardrails

Several agents (Claude, Codex, OpenCode, Antigravity) share this host concurrently across worktrees:
- **Never kill processes by name or process group**: no `pkill`, `killall`, `kill $(pgrep ...)`, `... | xargs kill`, or `kill -- -PGID`. Stop only a specific numeric PID you started, or use `./scripts/run-with-mise.sh yarn verify:stop`.
- **Never run destructive commands or remote approvals without explicit user authorization**: no `sudo`, `rm -rf`, `git reset --hard`, `git clean`, `git restore`, `git checkout --`, `git push --force` / `--delete` / `--tags` / `--mirror`, `gh repo delete`, `gh pr merge`, or `gh pr review --approve` / `-a`.
- **Never read `~/.config/opencode/service.json`** and never edit `~/.config/opencode/**` unless the user explicitly asks in the current conversation (see `.claude/rules/opencode-config.md`).
- Do not edit files in a worktree while a durable verification run for that worktree is active.

## Verification Contract

- **`./scripts/dev.sh verify-impact`** (or `./scripts/run-with-mise.sh yarn verify:impact`) is the single executable verification contract (`scripts/data/verification-impact.json`). Run it to see the exact evidence required for your changed files (source rules, mirrored tests, hook tests, perf, AI, dual-release Tauri build, docs lifecycle, SFX, CI shards) plus any optional diagnostics.
- `yarn test` does **not** type-check; `yarn build` runs `tsc` and the Vite production bundle.
- Before `git push`, PR creation, or merge, run:
  ```bash
  ./scripts/run-with-mise.sh yarn build
  ./scripts/run-with-mise.sh yarn test:durable
  ./scripts/run-with-mise.sh yarn test:durable:status
  ```
  Or run `./scripts/dev.sh verify-pr` + `./scripts/dev.sh verify-pr-status` on the clean commit you plan to push (a passing proof lets the pre-push gate skip redundant test+build phases).
- Allow the full 1800 s budget for `git push` / `gh pr create` — `.githooks/pre-push` runs `yarn test:regular` then `yarn build` sequentially. Do not issue a duplicate push while one is still in flight.

## Antigravity Workspace Customizations (`.agents/`)

- **Path-scoped rules (`.agents/rules/*.md`)**: Glob-triggered pointers that automatically direct you to the canonical `.claude/rules/*.md` files for every area you touch. Read the pointed canonical rule files before editing.
- **Skills (`.agents/skills/*/SKILL.md`)**:
  - `button-styling` — `createGameButton()` design system for `src/ui/` (symlinked to `.claude/skills/button-styling.md`).
  - `generate-sprite-prompt` — visual asset prompt workflow (symlinked to `.claude/skills/generate-sprite-prompt.md`).
  - `work-issue` — end-to-end issue implementation workflow in an isolated worktree.
  - `ship` — validate, rebase, push, and open/update a PR without merging or approving.
- **Lifecycle hooks (`.agents/hooks.json` + `.agents/hooks/`)**:
  - `SessionStart`: reaps stale dev servers via `.claude/hooks/dev-server-lifecycle.sh start`.
  - `PreToolUse`: enforces subagent policy, destructive-command / credential / PR-approval guards, and delegates directly to `.claude/hooks/block-commit-on-main.sh`, `block-pattern-kill.sh`, `block-raw-dev-server.sh`, `pre-push-review-reminder.sh`, and `require-green-before-push.sh`.
  - `PostToolUse` + `PostInvocation`: runs `.claude/hooks/check-src-edit.sh` after `src/` edits and injects any rule violations directly back into the next step.

## Recommended Antigravity Sandbox Permission Grants

Antigravity derives terminal sandbox mounts from user/project **Permission Grants** in Antigravity Settings (there is no repo-checked-in sandbox file). To run `./scripts/dev.sh` and `./scripts/run-with-mise.sh` smoothly inside the sandbox on macOS, configure these project grants in **Settings → Projects → Conquestoria → Permission Grants**:

- **Read-only (`read_file` allow)**:
  - `~/.local/share/mise` — lets `mise exec` use already-installed `node`, `yarn`, `rust`, and `gh` toolchains.
  - `~/.config/mise` — global mise configuration (if present).
- **Read-write (`write_file` allow)**:
  - `~/.local/state/mise` — `mise exec` updates `trusted-configs/` and `tracked-configs/` symlinks on invocation.
  - `~/Library/Caches/Yarn` — shared Yarn 4 cache for `./scripts/run-with-mise.sh yarn install --immutable` in new worktrees.
  - `/tmp/pr-bodies` (and `/private/tmp/pr-bodies`) — PR body files managed by `./scripts/pr-body.sh`.
  - `../conquestoria-worktrees` *(optional)* — if placing linked worktrees in the sibling directory alongside `.opencode/opencode.jsonc`.
- Keep `.git/` read-only in the sandbox and keep networked git/GitHub commands (`git fetch`, `./scripts/push-branch.sh`, `gh pr ...`) outside the sandbox behind explicit approval.

## Core Architecture & Conventions

See `CLAUDE.md` for the full rules index and architecture details. Key invariants to keep in mind at all times:
- **Event-driven, plain-object state**: Systems communicate through `EventBus`; `GameState` is a serializable plain object (no class instances). Turn-processing systems return new `GameState` values rather than mutating state in place.
- **Axial hex coordinates `(q, r)`** everywhere in gameplay code; pixel conversion happens only in `src/renderer/`.
- **Hot-seat multiplayer**: Never hardcode `'player'` for ownership checks — always use `state.currentPlayer`. Major↔major war, peace, and treaties are bilateral (`declareMajorWar` / `makeMajorPeace`).
- **Deterministic RNG**: Never use `Math.random()` in `src/`; use seeded simulation RNG (`createSimulationRng()`).
- **Type safety**: Never bypass TypeScript with `as unknown as`, `@ts-ignore`, or `@ts-expect-error` in `src/`.
- **UI & rendering**: Canvas 2D renders the hex map; DOM/CSS handles UI panels using `textContent`/`createTextNode()` (never `innerHTML` with interpolated game strings) and `createGameButton()` for buttons. `src/main.ts` is a composition root only.
- **Dual-release boundary**: Shared gameplay, UI, renderer, and save code stay distribution-neutral; browser-vs-Tauri differences belong behind `src/platform/`.
- **Tests**: Mirror `src/` under `tests/` (`*.test.ts`). Add a failing regression test for the exact behavior before changing production code.
