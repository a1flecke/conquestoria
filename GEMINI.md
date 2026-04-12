# Conquestoria - Gemini CLI Guide

Civilization-building strategy game. TypeScript + Canvas 2D + Vite.

## Project Overview
Conquestoria is an event-driven 4X/Civ-like game. It uses a single serializable plain object for game state and axial hex coordinates (q, r) for all gameplay logic.

## Commands
- `eval "$(mise activate bash)"` — Activate mise for node/yarn (run first in any new shell)
- `./scripts/run-with-mise.sh yarn dev` — Start dev server
- `./scripts/run-with-mise.sh yarn build` — Production build (tsc + vite)
- `./scripts/run-with-mise.sh yarn test` — Run all tests
- `./scripts/run-with-mise.sh yarn test --run <path>` — Run specific test
- `./scripts/run-wonder-regressions.sh` — Run regressions for legendary wonders/quests

## Architecture & Conventions
- **State**: Serializable plain objects (no class instances).
- **Coordinates**: Axial hex (q, r). Pixel conversion only in renderer.
- **Communication**: EventBus for notifications; direct mutations for state updates in canonical helpers.
- **Tech Stack**: TypeScript, Canvas 2D, Vite, Vitest, Mise.
- **Storage**: IndexedDB (primary) with localStorage fallback.
- **UI**: Canvas for map; DOM/CSS for panels. Use `textContent` for dynamic text (XSS safety).

## Required Verification
After editing `src/`, always run:
1. `scripts/check-src-rule-violations.sh <changed-files>`
2. `./scripts/run-with-mise.sh yarn test --run <mirrored-test-file>`

## Rule Policies
Detailed behavior policies are located in `.gemini/policies/`:
- `game-systems.md`: RNG, state/events, diplomacy, unit types, immutability.
- `ui-panels.md`: Hot-seat, city cycling, privacy, XSS safety.
- `strategy-game-mechanics.md`: Combat, tech gating, victory, storage resilience.
- `end-to-end-wiring.md`: Data flow from compute to rendering.
- `spec-fidelity.md`: Adherence to documentation in `docs/superpowers/`.

## Hot Seat Multiplayer Rules
- NEVER hardcode `'player'`; use `state.currentPlayer`.
- Update BOTH parties in diplomacy (bilateral updates).
- Mask player-visible fields behind discovery checks (Privacy).
