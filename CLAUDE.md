# Conquestoria

Civilization-building strategy game. TypeScript + Canvas 2D + Vite.

## Agent Policy

**NEVER use subagents or parallel agents.** Execute all tasks inline in the current session. Do not spawn Agent tool calls, fork subagents, or delegate to parallel workers for any reason.

## Worktree Policy

**ALL implementation work MUST happen in a git worktree.** At the start of every coding session:
1. Check if already in a worktree (`git worktree list`).
2. If not, create one via `EnterWorktree` tool BEFORE writing any code.
3. Never write code on `main` or on a feature branch in the main working tree — always use a worktree.
4. After creating a new worktree, run `./scripts/setup-git-hooks.sh` (or `bash scripts/run-with-mise.sh yarn setup:hooks`) immediately, then verify `git config --worktree --get core.hooksPath` returns `.githooks` — a worktree without this has its hooks silently resolve to `main`'s checkout or the plain git default, and `#608`'s investigation found this had regressed on 12 already-active worktrees.
5. Also run `mise trust <worktree-path>/mise.toml` before the first push — otherwise the `run-with-mise-worktree.test.sh` smoke test will block the push.

This is enforced by the user and is not optional.

## Commands

**Always use `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)" && yarn <cmd>`.** The script is pre-approved in `.claude/settings.local.json` and avoids permission prompts.

- `./scripts/dev.sh <task> [paths]` — **Preferred for build/test/verify** (#1256): a narrow dispatcher with a fixed task table (`build`, `typecheck`, `test <tests/… paths>`, `test-all`, `test-regular`, `hooks`, `install`, `setup-hooks`, `verify-pr`, `verify-pr-status`, `verify-status`, `durable`, `durable-status`, `ai-playability`, `ai-long`, `web-smoke`, `docs-lifecycle`, `maintainability-check|report|baseline`). No flags and no pipes needed: output is saved to `.verification/logs/<task>.log`, the last 60 lines print, and `./scripts/dev.sh log <task> [N]` shows more. Run it without arguments for the list. Details: `.claude/rules/hooks-and-tooling.md` → "Task dispatcher".
- **Never `./scripts/run-with-mise.sh node <file>`** (e.g. the maintainability audit): it runs arbitrary code, is deliberately not pre-approved, and prompts. Use the matching `dev.sh` task. `./scripts/check-src-rule-violations.sh <src paths>` is pre-approved as written. If another routine command still prompts, do **not** pick "Allow always" or widen the wrapper rule — state the command and propose a fixed `dev.sh` task (a `case` arm, usage line and test-table row) instead.
- `./scripts/sync-main.sh` — **Bring your branch up to date with `origin/main`** (fetch + rebase, no arguments, no approval needed; refuses `main`, a dirty tree, a detached HEAD). Run it whenever work has landed on `origin/main`; on a conflict resolve, `git add -- <paths>`, then `GIT_EDITOR=true git rebase --continue`.
- `./scripts/push-branch.sh` — **Publish the current feature branch**, including after a rebase (#1260; no arguments, no approval needed). It pushes only the current branch to `origin` under the same name, requires the branch to contain the latest `origin/main` (run `sync-main.sh` first), and for a rebased branch uses a lease pinned to the remote tip this clone last saw, so another agent's newer push is never overwritten. Raw `git push --force*` stays denied/asking.
- `bash scripts/run-with-mise.sh yarn dev` — Start dev server
- `bash scripts/run-with-mise.sh yarn build` — Production build
- `bash scripts/run-with-mise.sh yarn test` — Run vitest + hook smoke tests. DOES NOT type-check — `yarn build` is the only path that runs `tsc`. Before any `git push`, `gh pr create`, or `gh pr merge`, run `yarn build` and `yarn test` and confirm both exit 0. The `require-green-before-push` hook enforces this, but catching it locally is faster.
- `bash scripts/run-with-mise.sh yarn test:durable` — Run the complete suite and persist its result in this worktree's ignored `.verification/` directory. Use this for agent-driven full-suite checks when terminal output might be interrupted; it removes stale completed evidence before it starts, refuses to replace a live run in the same worktree, and records the tested HEAD plus exit code.
- `bash scripts/run-with-mise.sh yarn test:durable:status` — Accept durable evidence only when it passed and belongs to the current `HEAD` and working tree; otherwise it exits non-zero and explains why.
- `bash scripts/run-with-mise.sh yarn test:regular` — Run the local push-gate selection, excluding expensive simulation coverage.
- `bash scripts/run-with-mise.sh yarn test:intensive-simulations` — Run the expensive local simulation selection.
- `bash scripts/run-with-mise.sh yarn test:ci:shard-a` / `test:ci:shard-b` / `test:ci:shard-c` / `test:ci:shard-d` — Run one duration-balanced full-suite CI shard; these are not local tiers.
- `bash scripts/run-with-mise.sh yarn test:watch` — Run tests in watch mode
- `bash scripts/run-with-mise.sh yarn verify:launch <full|ai-long|ai-playability|perf> [--wait] [--force]` — Start a durable verification run detached, after showing who else is running on the host; when the worktree is clean and a durable result for this HEAD already passed, it reuses it (`Reusing durable …`; `--force` re-runs anyway); refuses duplicates, a dirty tree (without `--allow-dirty`) and pile-ons.
- `bash scripts/run-with-mise.sh yarn verify:stop <scope>|--all [--dry-run]` — Stop **only this worktree's own** durable runs, by recorded pid.
- `bash scripts/run-with-mise.sh yarn verify:local:status` — See every agent's active/queued heavyweight runs on this host (read-only).
- `bash scripts/pr-body.sh new|write|check|create|update <name> …` — Write PR bodies in `/tmp/pr-bodies/<name>.md` (the one directory that is pre-allowed), then `create`/`update` from there. Never improvise a body file elsewhere.
- `bash scripts/run-with-mise.sh yarn verify:impact [files...]` — List the evidence the current change requires (source rules, mirrored tests, build, durable suite, perf, AI, docs, SFX, shards), each with a reason and command. Reports requirements; never runs them.

**Shared host — several agents run at once.** Never kill processes by name or process group: no `pkill`, `killall`, `kill $(pgrep …)`, `… | xargs kill`, `kill -- -PGID`. That terminates other agents' runs in other worktrees (it already killed someone's multi-hour `ai-long` run). Stop only a specific numeric pid you started, or use `yarn verify:stop`. `.claude/hooks/block-pattern-kill.sh` blocks these. Do not edit files in a worktree while a durable run of it is in progress. Details: `.claude/rules/hooks-and-tooling.md` → "Launching and stopping runs on a shared host" and "PR bodies".

**Bash tool timeout guidance** — set `timeout` to match what the command actually does:
- `git commit` → **30 000 ms** (commit itself < 1s; no hook runs tests on commit)
- `git push` / `gh pr create` / `gh pr merge` → **1 800 000 ms** (pre-push verification runs the regular local selection, then the production build, sequentially; raised from 240 000ms because `verify-before-push.sh` now retries a detected STALL with backoff — see `.claude/rules/hooks-and-tooling.md`)
- Using a 360 000 ms timeout for commits papers over the root cause; the correct fix is matching the timeout to the command's expected duration.

## Rules Index

Detailed rules live in `.claude/rules/` and auto-apply based on the files you edit:
- `.claude/rules/game-systems.md` — RNG, events-vs-state, diplomacy, unit types, **immutable turn processing**, **diplomacy lifecycle**, **no dead return fields**, **spawn occupancy**
- `.claude/rules/ui-panels.md` — hot-seat `currentPlayer`, **cities[0] is never the answer**, **privacy and discovery**, **no silent destructive UI**, **panel rerender after interaction**, XSS-safe rendering, **no bare buttons**
- `.claude/rules/strategy-game-mechanics.md` — combat, tech gating, victory
- `.claude/rules/end-to-end-wiring.md` — computed-data-must-render
- `.claude/rules/spec-fidelity.md` — spec conjunctions, gating preservation, visible-UI contract preservation, and the **plan/spec lifecycle**: delivered plans are deleted in the PR that completes them, every surviving plan/spec is classified in `docs/docs-lifecycle-manifest.json`
- `.claude/rules/incremental-mr-completion.md` — partial-MR PR title/body requirements and dead-end UX prevention
- `.claude/rules/hooks-and-tooling.md` — hook stdin/jq contract, exit codes, and required smoke tests; **shared-host launch/stop of verification runs (never `pkill`/`killall`)** and **PR bodies in `/tmp/pr-bodies`**
- `.claude/rules/action-contracts.md` — one legality source per action family: previews/AI consume it, executors re-run it, typed denials; links the audited inventory
- `.claude/rules/movement-actions.md` — the worked example: `resolveUnitMoveIntent` → `ValidatedUnitMove` → `executeValidatedUnitMove`
- `.claude/rules/caller-discipline.md` — how "caller must remember" contracts are turned into structure; the inventory, the mechanisms, and the decision procedure for a new contract
- `.claude/rules/session-publication.md` — `GameSession` publication: `commit`/`update`/`batch`, the closed set of silent-write reasons, no hand-written renderer/HUD refresh
- `.claude/rules/sprites.md` — unit/building/terrain/improvement extension recipes, FactionPalette contract, catalog coverage, animation class reference, terrain tile contracts
- `.claude/rules/game-balance.md` — wonder/national-project yield ceilings, movement stacking policy, national-project production-discount table pattern, **canonical production-cost context (Civilization Era vs World Age)**
- `.claude/rules/wonder-content.md` — legendary/natural wonder gating, name collisions, quest-step baselines, codex ledger sync
- `.claude/rules/audio-sfx.md` — capability-derived unit SFX coverage, named shared families, synthetic-cue provenance/manifest (#612)
- `.claude/rules/content-description-honesty.md` — keeping `Tech.unlocks`/`Building.description`/`UNIT_DESCRIPTIONS` text honest about implemented mechanics
- `.claude/rules/ai-simulation.md` — long-horizon AI campaign/playability suites and their isolation from the default suite (#1005)
- `.claude/rules/invariants.md` — the cross-system `GameState` invariant catalog and how each invariant is enforced (#1003)
- `.claude/rules/performance-budgets.md` — turn/pathfinding/fog/storage performance budgets and their baselines
- `.claude/rules/great-general-content.md` — authored Great General roster content: descriptor vs `GeneralProfile` layers, biography, facts, provenance

A PostToolUse hook (`.claude/hooks/check-src-edit.sh`) greps every Write/Edit under `src/` for known rule violations and returns feedback in the same turn.

## Skills

Project-level skills live in `.claude/skills/` and are invoked by the Skill tool:
- `.claude/skills/button-styling.md` — `createGameButton()` API reference; invoke before writing any button in `src/ui/`
- `.claude/skills/generate-sprite-prompt.md` — invoke whenever the user asks to add sprites, terrain tiles, animations, improvement markers, or wonder graphics, or asks you to generate a Claude Design prompt for any visual asset

When planning interactive UI or queue work, use `docs/superpowers/plans/README.md` as the minimum checklist for player-visible state transitions, misleading derived labels, and replayable interaction coverage.

**Visual asset reference**: `docs/sprite-design-system.md` — canonical inventory of all sprites (units, buildings, terrain, improvements, wonders), placeholder list, full material palette, animation class map, and GitHub reference URLs for Claude Design prompts.

## Documentation Authority (#1024)

- **Source, tests and canonical rules** (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/**`) describe what exists. When a doc and the code disagree, the code wins.
- **`docs/superpowers/{plans,specs}/`** hold only what `docs/docs-lifecycle-manifest.json` lists: `active` work owned by an open issue, and `durable-reference` rationale that source, tests or rules cite. A delivered plan is **deleted** (git history is the archive), not annotated and kept. Treat any surviving doc as a snapshot and verify its claims against source before relying on them.
- Other `docs/*.md` (inventories, sprite design system, benchmarks, ledgers) are current engineering references and are kept honest in the PR that changes what they describe.
- `node scripts/docs-lifecycle.mjs check` (offline; run by the hooks job) enforces the above; see `.claude/rules/spec-fidelity.md` ("Plan And Spec Lifecycle").

## Architecture
- Event-driven: systems communicate via EventBus, not direct imports
- All game state is a single serializable plain object (no class instances)
- Canvas 2D renders the hex map; DOM/CSS handles all UI panels
- Mobile-first: touch input is primary, mouse/keyboard secondary
- Offline-first: Service Worker caches everything, IndexedDB stores saves
- Sprites: JSX→SVG→HTMLImageElement pipeline; unit/building sprites in `src/renderer/sprites/`; terrain tiles in `src/renderer/terrain/`; improvement markers in `src/renderer/improvements/`; wonder graphics in `src/renderer/wonders/`
- Terrain tiles: 4 SVG variants per terrain type, variant chosen by `Math.abs(q*7 + r*13) % 4`; fallback to flat `TERRAIN_COLORS` while loading
- `src/main.ts` is a composition root only. New app behavior goes in `src/app/controllers/` (depending on `src/app/ports.ts`) or a `src/presentation/register-*.ts` registrar. A new panel is one `PANEL_REGISTRY` entry; a new notification is one handler in the matching registrar; a new persisted save field is one numbered migration in `save-migrations.ts`. Enforced by `tests/app/architecture-boundaries.test.ts`.

## Conventions
- Axial hex coordinates (q, r) everywhere
- All positions are in hex coordinates; pixel conversion happens only in renderer
- Tests live in tests/ mirroring src/ structure
- Use vitest for testing
- Keep files focused and small — one clear responsibility per file
- Use mise for all tool installation (node, yarn, etc.)
- Do not bypass the type system with `as unknown as`, `@ts-ignore`, or `@ts-expect-error` in `src/` (compile-time negative fixtures in `tests/` are the legitimate exception) — fix the types instead

## Hot Seat Multiplayer Rules
- NEVER hardcode `'player'` for ownership checks — always use `state.currentPlayer`
- Major↔major war, peace and treaties are bilateral **by construction**: use `declareMajorWar`/`makeMajorPeace`; the single-side writers are unreachable from the `diplomacy-system` barrel and their importers are pinned (see `.claude/rules/caller-discipline.md`)
- Renderer must accept `currentPlayer` for context-dependent visuals (borders, fog)
- Advisors, UI panels, and HUD must all use `state.currentPlayer`

## Game System Rules
- NEVER use `Math.random()` — all randomness must use seeded RNG for determinism
- When an event fires (e.g., `city:unit-trained`), the corresponding state mutation MUST also happen — events are notifications, not commands
- All unit types defined in `types.ts` must be trainable in `city-unit-catalog.ts` (gate by tech if needed)
- `declareWar` must deduplicate `atWarWith` — never add the same civ twice
- AI must check `isAtWar()` before initiating combat against non-barbarian units
- City panels must cycle through all cities, not just `cities[0]`
- HUD should show per-turn yield rates (food, production, gold, science), not just totals
- Building yields must be displayed in city panel build queue
- If you compute data (movement range, attack targets, etc.), it MUST be rendered — dead computed data is a bug
- Map wrapping must be applied in BOTH rendering (ghost tiles at edges) AND input (coordinate normalization in handleHexTap)
- All UI elements must be self-explanatory — add help text, descriptions, and inline info where users make choices
- Use `textContent`/`createTextNode()` for dynamic text in DOM — never `innerHTML` with game-generated strings
