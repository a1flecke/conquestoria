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
