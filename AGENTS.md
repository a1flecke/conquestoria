# Repository Guidelines

## Project Structure & Module Organization
Core game code lives in `src/`. Use the existing domain split: `src/core/` for shared state and turn flow, `src/systems/` for gameplay rules, `src/renderer/` for Canvas rendering, `src/ui/` for DOM panels, `src/input/` for controls, `src/ai/` for opponents, `src/audio/` for sound, and `src/storage/` for saves. Static assets and PWA files live in `public/`. Tests live in `tests/` and generally mirror `src/` paths, for example `src/systems/map-generator.ts` pairs with `tests/systems/map-generator.test.ts`.

## Build, Test, and Development Commands
Prefer the repo wrapper `./scripts/run-with-mise.sh` for project commands so Codex can reuse one stable approval path. In a fresh interactive shell, `eval "$(mise activate bash)"` still works. Main commands:

- `./scripts/run-with-mise.sh yarn dev` starts the Vite dev server.
- `./scripts/run-with-mise.sh yarn build` runs `tsc` and then produces a production bundle with Vite.
- `./scripts/run-with-mise.sh yarn test` runs the full Vitest suite once.
- `./scripts/run-with-mise.sh yarn test:watch` runs Vitest in watch mode during feature work.

For Codex command consistency, prefer:

- `./scripts/run-with-mise.sh yarn test --run tests/path/to/file.test.ts`
- `./scripts/run-with-mise.sh yarn build`

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF endings, 2-space indentation, final newline. Write TypeScript modules with one clear responsibility per file. Prefer kebab-case filenames such as `city-system.ts` and `fog-of-war.ts`; keep tests named `*.test.ts`. Keep gameplay state serializable plain objects, not class instances. Use axial hex coordinates `(q, r)` throughout gameplay code and convert to pixels only inside renderer code. For DOM updates, use `textContent` or `createTextNode()` instead of `innerHTML`.

## Testing Guidelines
Vitest is the test runner. Add tests beside the relevant domain under `tests/`, and mirror the source directory structure. Cover deterministic gameplay behavior, especially systems that affect turn order, diplomacy, combat, map generation, or save persistence. Do not use `Math.random()` in game logic; seeded randomness is required so tests stay reproducible.

When fixing a bug or implementing from a plan/spec, add at least one regression test for the exact failure mode before changing production code. If you introduce a new owner/faction or neutral hostile actor such as `rebels`, add an interaction test covering AI or player handling of that owner. If a rule in a spec is conjunctive, such as "A and B must both be true", write a negative test proving that only `A` or only `B` is insufficient.

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit style, often with scopes, for example `fix(m5): wire marketplace supply/demand from game state` or `docs: triage open issues`. Keep commit subjects imperative and specific. PRs should explain gameplay impact, list tests run, link the relevant issue or milestone, and include screenshots when UI or rendering changes are visible.

## Architecture Notes
Respect the event-driven design: systems communicate through the event bus, while state mutations still happen directly in state-updating code. Hot-seat features must use `state.currentPlayer` rather than hardcoded player IDs, and bilateral diplomacy changes must update both sides.

## Spec Fidelity
When working from `docs/superpowers/specs/` or `docs/superpowers/plans/`, preserve the exact gameplay contract unless the user explicitly changes it. Do not broaden gated mission effects, relax resolution conditions, or leave bonus-effect fields partially wired. Review branch work against both `origin/main...HEAD` and the local uncommitted delta, not just untracked files, before claiming review coverage.
