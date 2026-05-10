# Conquestoria

Civilization-building strategy game. TypeScript + Canvas 2D + Vite.

## Commands
- `eval "$(mise activate bash)"` — Activate mise for node/yarn (run first in any new shell)
- `yarn dev` — Start dev server
- `yarn build` — Production build
- `yarn test` — Run vitest + hook smoke tests. DOES NOT type-check — `yarn build` is the only path that runs `tsc`. Before any `git push`, `gh pr create`, or `gh pr merge`, run `yarn build` and `yarn test` and confirm both exit 0. The `require-green-before-push` hook enforces this, but catching it locally is faster.
- `yarn test:watch` — Run tests in watch mode

## Rules Index

Detailed rules live in `.claude/rules/` and auto-apply based on the files you edit:
- `.claude/rules/game-systems.md` — RNG, events-vs-state, diplomacy, unit types, **immutable turn processing**, **diplomacy lifecycle**, **no dead return fields**, **spawn occupancy**
- `.claude/rules/ui-panels.md` — hot-seat `currentPlayer`, **cities[0] is never the answer**, **privacy and discovery**, **no silent destructive UI**, **panel rerender after interaction**, XSS-safe rendering, **no bare buttons**
- `.claude/rules/strategy-game-mechanics.md` — combat, tech gating, victory
- `.claude/rules/end-to-end-wiring.md` — computed-data-must-render
- `.claude/rules/spec-fidelity.md` — spec conjunctions, gating preservation, and visible-UI contract preservation
- `.claude/rules/incremental-mr-completion.md` — partial-MR PR title/body requirements and dead-end UX prevention
- `.claude/rules/hooks-and-tooling.md` — hook stdin/jq contract, exit codes, and required smoke tests

A PostToolUse hook (`.claude/hooks/check-src-edit.sh`) greps every Write/Edit under `src/` for known rule violations and returns feedback in the same turn.

## Skills

Project-level skills live in `.claude/skills/` and are invoked by the Skill tool:
- `.claude/skills/button-styling.md` — `createGameButton()` API reference; invoke before writing any button in `src/ui/`

When planning interactive UI or queue work, use `docs/superpowers/plans/README.md` as the minimum checklist for player-visible state transitions, misleading derived labels, and replayable interaction coverage.

## Architecture
- Event-driven: systems communicate via EventBus, not direct imports
- All game state is a single serializable plain object (no class instances)
- Canvas 2D renders the hex map; DOM/CSS handles all UI panels
- Mobile-first: touch input is primary, mouse/keyboard secondary
- Offline-first: Service Worker caches everything, IndexedDB stores saves

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
