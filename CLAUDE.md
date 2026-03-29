# Conquestoria

Civilization-building strategy game. TypeScript + Canvas 2D + Vite.

## Commands
- `eval "$(mise activate bash)"` — Activate mise for node/yarn (run first in any new shell)
- `yarn dev` — Start dev server
- `yarn build` — Production build
- `yarn test` — Run tests with vitest
- `yarn test:watch` — Run tests in watch mode

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
