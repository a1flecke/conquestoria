# Conquestoria

Civilization-building strategy game. TypeScript + Canvas 2D + Vite.

## Agent Policy

**NEVER use subagents or parallel agents.** Execute all tasks inline in the current session. Do not spawn Agent tool calls, fork subagents, or delegate to parallel workers for any reason.

## Worktree Policy

**ALL implementation work MUST happen in a git worktree.** At the start of every coding session:
1. Check if already in a worktree (`git worktree list`).
2. If not, create one via `EnterWorktree` tool BEFORE writing any code.
3. Never write code on `main` or on a feature branch in the main working tree — always use a worktree.
4. After creating a new worktree, run `mise trust <worktree-path>/mise.toml` before the first push — otherwise the `run-with-mise-worktree.test.sh` smoke test will block the push.

This is enforced by the user and is not optional.

## Commands

**Always use `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)" && yarn <cmd>`.** The script is pre-approved in `.claude/settings.local.json` and avoids permission prompts.

- `bash scripts/run-with-mise.sh yarn dev` — Start dev server
- `bash scripts/run-with-mise.sh yarn build` — Production build
- `bash scripts/run-with-mise.sh yarn test` — Run vitest + hook smoke tests. DOES NOT type-check — `yarn build` is the only path that runs `tsc`. Before any `git push`, `gh pr create`, or `gh pr merge`, run `yarn build` and `yarn test` and confirm both exit 0. The `require-green-before-push` hook enforces this, but catching it locally is faster.
- `bash scripts/run-with-mise.sh yarn test:watch` — Run tests in watch mode

**Bash tool timeout guidance** — set `timeout` to match what the command actually does:
- `git commit` → **30 000 ms** (commit itself < 1s; no hook runs tests on commit)
- `git push` / `gh pr create` / `gh pr merge` → **120 000 ms** (pre-push hook runs tsc + vitest in parallel, ~35–45s from a worktree)
- Using a 360 000 ms timeout for commits papers over the root cause; the correct fix is matching the timeout to the command's expected duration.

## Rules Index

Detailed rules live in `.claude/rules/` and auto-apply based on the files you edit:
- `.claude/rules/game-systems.md` — RNG, events-vs-state, diplomacy, unit types, **immutable turn processing**, **diplomacy lifecycle**, **no dead return fields**, **spawn occupancy**
- `.claude/rules/ui-panels.md` — hot-seat `currentPlayer`, **cities[0] is never the answer**, **privacy and discovery**, **no silent destructive UI**, **panel rerender after interaction**, XSS-safe rendering, **no bare buttons**
- `.claude/rules/strategy-game-mechanics.md` — combat, tech gating, victory
- `.claude/rules/end-to-end-wiring.md` — computed-data-must-render
- `.claude/rules/spec-fidelity.md` — spec conjunctions, gating preservation, and visible-UI contract preservation
- `.claude/rules/incremental-mr-completion.md` — partial-MR PR title/body requirements and dead-end UX prevention
- `.claude/rules/hooks-and-tooling.md` — hook stdin/jq contract, exit codes, and required smoke tests
- `.claude/rules/sprites.md` — unit/building/terrain/improvement extension recipes, FactionPalette contract, catalog coverage, animation class reference, terrain tile contracts

A PostToolUse hook (`.claude/hooks/check-src-edit.sh`) greps every Write/Edit under `src/` for known rule violations and returns feedback in the same turn.

## Skills

Project-level skills live in `.claude/skills/` and are invoked by the Skill tool:
- `.claude/skills/button-styling.md` — `createGameButton()` API reference; invoke before writing any button in `src/ui/`
- `.claude/skills/generate-sprite-prompt.md` — invoke whenever the user asks to add sprites, terrain tiles, animations, improvement markers, or wonder graphics, or asks you to generate a Claude Design prompt for any visual asset

When planning interactive UI or queue work, use `docs/superpowers/plans/README.md` as the minimum checklist for player-visible state transitions, misleading derived labels, and replayable interaction coverage.

**Visual asset reference**: `docs/sprite-design-system.md` — canonical inventory of all sprites (units, buildings, terrain, improvements, wonders), placeholder list, full material palette, animation class map, and GitHub reference URLs for Claude Design prompts.

## Architecture
- Event-driven: systems communicate via EventBus, not direct imports
- All game state is a single serializable plain object (no class instances)
- Canvas 2D renders the hex map; DOM/CSS handles all UI panels
- Mobile-first: touch input is primary, mouse/keyboard secondary
- Offline-first: Service Worker caches everything, IndexedDB stores saves
- Sprites: JSX→SVG→HTMLImageElement pipeline; unit/building sprites in `src/renderer/sprites/`; terrain tiles in `src/renderer/terrain/`; improvement markers in `src/renderer/improvements/`; wonder graphics in `src/renderer/wonders/`
- Terrain tiles: 4 SVG variants per terrain type, variant chosen by `Math.abs(q*7 + r*13) % 4`; fallback to flat `TERRAIN_COLORS` while loading

## Conventions
- Axial hex coordinates (q, r) everywhere
- All positions are in hex coordinates; pixel conversion happens only in renderer
- Tests live in tests/ mirroring src/ structure
- Use vitest for testing
- Keep files focused and small — one clear responsibility per file
- Use mise for all tool installation (node, yarn, etc.)

## Hot Seat Multiplayer Rules
- NEVER hardcode `'player'` for ownership checks — always use `state.currentPlayer`
- Diplomacy operations MUST update BOTH sides (bilateral state updates)
- Renderer must accept `currentPlayer` for context-dependent visuals (borders, fog)
- Advisors, UI panels, and HUD must all use `state.currentPlayer`

## Game System Rules
- NEVER use `Math.random()` — all randomness must use seeded RNG for determinism
- When an event fires (e.g., `city:unit-trained`), the corresponding state mutation MUST also happen — events are notifications, not commands
- All unit types defined in `types.ts` must be trainable in `city-system.ts` (gate by tech if needed)
- `declareWar` must deduplicate `atWarWith` — never add the same civ twice
- AI must check `isAtWar()` before initiating combat against non-barbarian units
- City panels must cycle through all cities, not just `cities[0]`
- HUD should show per-turn yield rates (food, production, gold, science), not just totals
- Building yields must be displayed in city panel build queue
- If you compute data (movement range, attack targets, etc.), it MUST be rendered — dead computed data is a bug
- Map wrapping must be applied in BOTH rendering (ghost tiles at edges) AND input (coordinate normalization in handleHexTap)
- All UI elements must be self-explanatory — add help text, descriptions, and inline info where users make choices
- Use `textContent`/`createTextNode()` for dynamic text in DOM — never `innerHTML` with game-generated strings
