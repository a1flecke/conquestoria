# Repository Guidelines

## Purpose
`AGENTS.md` is the official repo instruction file for Codex.

Canonical project policy lives in:
- `CLAUDE.md`
- `.claude/rules/*.md`

Claude-specific hook scripts in `.claude/hooks/` are enforcement helpers, not the policy source. When Codex is working in this repo, follow the policy files above and run the repo checks listed below.

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

For legendary wonder, quest-race, or wonder-panel changes, run:

- `./scripts/run-wonder-regressions.sh`

## Architecture Notes
Respect the event-driven design: systems communicate through the event bus, while state mutations still happen directly in state-updating code. Shared gameplay consequences must live in canonical system helpers, not only in `main.ts` UI handlers. If the player, AI, and turn loop can all trigger the same outcome, the mutation path should be shared and the UI layer should only add viewer-specific notifications.

Keep gameplay state serializable plain objects, not class instances. Use axial hex coordinates `(q, r)` throughout gameplay code and convert to pixels only inside renderer code. Canvas 2D renders the hex map; DOM/CSS handles UI panels. Mobile-first and offline-first assumptions still apply.

## Rule Files
If you touch files in these areas, read the matching rule file before editing:

- `src/systems/**`, `src/core/**`, `src/ai/**` -> `.claude/rules/game-systems.md`
- `src/ui/**`, `src/renderer/**`, `src/main.ts` -> `.claude/rules/ui-panels.md`
- `src/systems/**`, `src/core/**` for mechanic-completeness, wonder-race, and storage rules -> `.claude/rules/strategy-game-mechanics.md`
- `src/**` -> `.claude/rules/end-to-end-wiring.md`
- `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, or any spec-driven implementation -> `.claude/rules/spec-fidelity.md`

Use `CLAUDE.md` for repo-wide architecture, command, and gameplay conventions.

When writing or updating implementation plans for interactive UI, queueing, or recommendation surfaces, also read `docs/superpowers/plans/README.md` and include its guardrail sections in the plan.

## Required Verification
After editing files under `src/`, run:

- `scripts/check-src-rule-violations.sh path/to/changed-src-file.ts [more changed src files...]`
- `./scripts/run-with-mise.sh yarn test --run tests/path/to/mirrored-file.test.ts [more mirrored tests...]`

Test-selection rule:

- For each changed `src/foo/bar.ts`, first look for the mirrored test file `tests/foo/bar.test.ts`.
- If one or more mirrored test files exist, run all of them in the same `yarn test --run ...` command.
- If no mirrored test file exists for the changed area, run the smallest existing relevant test file in the same domain directory.
- If no targeted test can be identified confidently, run `./scripts/run-with-mise.sh yarn test`.

Before `git push`, PR creation, or merge when `HEAD` is ahead of `origin/main`, review both:

- `git diff --stat origin/main...HEAD`
- `git diff --stat`

If either diff includes source changes, inspect the full diff before concluding review is complete.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF endings, 2-space indentation, final newline. Write TypeScript modules with one clear responsibility per file. Prefer kebab-case filenames such as `city-system.ts` and `fog-of-war.ts`; keep tests named `*.test.ts`. For DOM updates, use `textContent` or `createTextNode()` instead of `innerHTML`.

## Testing Guidelines
Vitest is the test runner. Add tests beside the relevant domain under `tests/`, and mirror the source directory structure. Cover deterministic gameplay behavior, especially systems that affect turn order, diplomacy, combat, map generation, or save persistence. Do not use `Math.random()` in game logic; seeded randomness is required so tests stay reproducible.

When fixing a bug or implementing from a plan/spec, add at least one regression test for the exact failure mode before changing production code. If you introduce a new owner/faction or neutral hostile actor such as `rebels`, add an interaction test covering AI or player handling of that owner. If a rule in a spec is conjunctive, such as "A and B must both be true", write a negative test proving that only `A` or only `B` is insufficient.

If a UI panel is the only place a player can inspect or trigger a full catalog of actions, tests must prove every actionable item remains reachable. Recommendation or prioritization may reorder the surface, but it must not silently hide lower-ranked items unless there is an explicit secondary affordance such as `Show all` that is itself tested.

If a panel action changes state that the same panel renders, add a regression that performs the interaction and asserts the visible panel updates immediately. Do not treat HUD updates or underlying state mutation as sufficient proof for panel correctness.

If you add a derived UI helper or label such as `next layer`, `reachable`, `recommended`, or `available soon`, add a negative test that proves items outside that semantic boundary remain hidden.

If you add or modify a player-visible queue, tests must verify both data integrity and rendered behavior: active item, queued order, ETA text when relevant, and visible post-action state after reorder/remove.

When a gameplay rule is attached to combat resolution, camp destruction, capture, or any other actor-agnostic state change, add parity coverage for the human path and at least one non-human path (`AI`, `turn-manager`, or another system caller). Do not treat a UI handler as the only execution path for game-state history or progression rules.

If a system seeds local placeholders or project shells ahead of true eligibility, do not treat those seeded records as actionable by default. UI guidance, AI prioritization, and recommendation systems must use a shared helper that filters seeded state down to currently reachable opportunities.

For globally unique content with local per-city state, test both invariants separately:
- global uniqueness across different civilizations
- no self-competition within the same civilization unless the spec explicitly allows it

Viewer-scoped intel must be stored at the same granularity the player actually earned. Do not reuse richer live objects to render persistent intel surfaces.

Emit gameplay events from the mutation or an explicit before/after diff. Do not re-derive one-time events by scanning final state for a phase/value.

When adding or changing legendary wonder rules:
- encode new semantics in typed definition metadata before adding `stepId`-specific evaluator branches
- do not use wonder step prose to imply host-city versus empire scope; encode it in metadata
- do not use `map-discoveries` without explicit `discoveryTypes`; the evaluator must never infer discovery scope from quest text
- if a gameplay event should advance wonder progress, record it in `legendaryWonderHistory` at the event source instead of reconstructing it later
- normalize newly seeded wonder projects immediately so the same turn shows current progress and buildability
- keep existing seeded projects in sync with current definition descriptions and completion truth so UI/save state does not drift from the roster
- if AI or another non-player system can abandon or resolve multiple projects in one turn, process the full set instead of early-returning after the first match

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit style, often with scopes, for example `fix(m5): wire marketplace supply/demand from game state` or `docs: triage open issues`. Keep commit subjects imperative and specific. PRs should explain gameplay impact, list tests run, link the relevant issue or milestone, and include screenshots when UI or rendering changes are visible.

## Spec Fidelity
When working from `docs/superpowers/specs/` or `docs/superpowers/plans/`, preserve the exact gameplay contract unless the user explicitly changes it. Do not broaden gated mission effects, relax resolution conditions, or leave bonus-effect fields partially wired. Review branch work against both `origin/main...HEAD` and the local uncommitted delta, not just untracked files, before claiming review coverage.
