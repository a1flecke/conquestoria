# Issues 823–827 Bug-Squash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all five reported defects and their shared regressions without widening unrelated gameplay behavior.

**Architecture:** Attack domain capability and ranged-threat detection live in canonical attack targeting. UI and sprite repairs remain at their current presentation/source boundaries. Pirate flotilla art is regenerated from the design source, with state effects preserved as overlays.

**Tech Stack:** TypeScript, Vitest, SVG/JSX sprite source, Vite.

---

### Task 1: Domain-aware unit targeting (#826)

**Files:**
- Modify: `src/core/types.ts`, `src/systems/attack-targeting.ts`, `src/systems/unit-system.ts`
- Test: `tests/systems/attack-targeting.test.ts`, `tests/ai/ai-tactics.test.ts`

- [ ] Write failing tests proving a Spearman cannot attack a naval unit, while an Archer and naval unit retain valid intended attacks.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/attack-targeting.test.ts tests/ai/ai-tactics.test.ts`; confirm the melee-naval assertion fails.
- [ ] Add typed unit-domain target capability, set definition values by combat class, and route both `canAttackByProfileOnMap` and `canUnitAttackTarget` through one shared domain check.
- [ ] Re-run the focused tests; confirm the new negative and existing positive behavior pass.

### Task 2: Reactive legal AI pursuit (#827)

**Files:**
- Modify: `src/systems/attack-targeting.ts`, `src/ai/ai-tactics.ts`, `src/systems/beast-system.ts`, `src/systems/barbarian-system.ts`, `src/systems/pirate-behavior.ts`
- Test: `tests/ai/ai-tactics.test.ts`, `tests/systems/beast-system.test.ts`, `tests/systems/barbarian-system.test.ts`, `tests/systems/pirate-behavior.test.ts`

- [ ] Write failing deterministic tests for each controller: major-civ melee pursues an in-range hostile archer; beast/barbarian prefer a ranged threat inside their present constraints; pirate does not pursue an illegal shore target but may pursue a legal naval ranged threat.
- [ ] Run the four focused suites and confirm the new assertions fail for absent threat prioritization.
- [ ] Add one shared current-ranged-threat query based on canonical profile legality; rank its reachable pursuit move after withdrawals and before ordinary plan movement. Reorder beast/barbarian target selection only within existing leash/defense constraints. Restrict pirate candidates to legal naval targets.
- [ ] Re-run the focused suites and confirm pursuit, constraint, and cross-domain negative cases pass.

### Task 3: Bestiary containment (#823)

**Files:**
- Modify: `src/ui/bestiary-panel.ts`
- Test: `tests/ui/bestiary-panel.test.ts`

- [ ] Write a failing DOM test for a large discovered beast that asserts the 72px art holder clips overflow and contains a responsive SVG.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/ui/bestiary-panel.test.ts`; confirm it fails before the layout change.
- [ ] Make the art holder clip its contents and size the child SVG to its holder, keeping unknown entries unchanged.
- [ ] Re-run the focused suite and confirm both visual-structure and privacy coverage pass.

### Task 4: Valid late-era naval v2 markup (#824)

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`, generated `src/renderer/sprites/v2/{carrack,galleon,steamship,troop_transport}.svg.ts`
- Test: `tests/renderer/sprites/v2/index.test.ts`, `tests/renderer/sprite-overlay.test.ts`

- [ ] Write failing tests for all four units that require a single v2 wrapper and no HTML wrapper nested in the SVG figure.
- [ ] Run the focused renderer tests and confirm the invalid nested-wrapper assertion fails.
- [ ] Replace each v1-in-v2 wrapper with valid v2 SVG figure content, regenerate via `node scripts/serialize-sprites.mjs`, and preserve unit-specific silhouettes.
- [ ] Re-run focused renderer tests; confirm each ship has renderable v2 markup and a DOM overlay entry.

### Task 5: Armed pirate flotilla landmark (#825)

**Files:**
- Modify: `design/conquestoria-sprites/lib/pirates-v2.jsx`, generated `src/renderer/sprites/v2/pirate_flotilla_stage_{2,3,4,5}.svg.ts`, `src/renderer/pirate-headquarters-presentation.ts`
- Test: `tests/renderer/sprites/v2/index.test.ts`, `tests/renderer/pirate-headquarters-presentation.test.ts`

- [ ] Write failing tests requiring each flotilla stage to preserve its foundation/state hooks, sail-stage broadside armament, iron-stage turret armament, and safe resolution of stage-one flotilla state.
- [ ] Run focused sprite/presentation tests and confirm the new weapon and stage-one assertions fail.
- [ ] Redraw flotilla foundations as flagship-plus-two-escort formations using the pirate ship family’s hull, stripe, canvas, wake, pennant, broadside, and turret language. Normalize unsupported stage one to stage two at presentation selection. Regenerate assets.
- [ ] Re-run focused tests and inspect the rendered sprite output at map scale.

### Task 6: Cross-cutting verification

**Files:** all changed source and test files.

- [ ] Run `scripts/check-src-rule-violations.sh` with every changed `src/` path.
- [ ] Run every focused suite together using `./scripts/run-with-mise.sh yarn test --run`.
- [ ] Run `./scripts/run-with-mise.sh yarn build`.
- [ ] Inspect `git diff --check`, `git diff --stat origin/main...HEAD`, and full source diffs before committing implementation.
