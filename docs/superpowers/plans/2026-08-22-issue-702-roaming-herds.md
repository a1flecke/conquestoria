# Roaming Herds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, save-safe two-hex crisis-herd routing and target-scoped previews without activating the future Stampede crisis.

**Architecture:** A focused route system owns selection, commit, validation, and viewer-safe facts. Crisis force state owns optional normalized routes; Canvas and the unit panel render those committed facts without recalculating.

**Tech Stack:** TypeScript, Vitest, serializable state, Canvas 2D, DOM.

---

## File Structure

- `src/core/types.ts`: `HerdRoute` plus optional `CrisisForce.herdRoutes`.
- `src/systems/stampede-route-system.ts`: legal routes, 3/4/2 avoidance/cap 6, normalization, commit, viewer presentation.
- `src/systems/crisis-force-system.ts`: invokes route normalization.
- `src/storage/save-migrations.ts`: schema 16.
- `src/renderer/stampede-route-overlay.ts`, `src/renderer/render-loop.ts`: cached current-viewer markers.
- `src/ui/selected-unit-info.ts`: target-visible plain text.

### Task 1: Canonical routing

**Files:** create `src/systems/stampede-route-system.ts`, `tests/systems/stampede-route-system.test.ts`; modify `src/core/types.ts`, `src/systems/crisis-force-system.ts`, `tests/systems/crisis-force-system.test.ts`.

- [ ] Write a failing test proving `planHerdRoute(state, 'stampede-1', 'herd-1')` returns two outward coordinates; add negative fixtures for ocean/coast/mountain/city/occupied intermediate tiles, a no-route result, a non-increasing fallback, stable repeated seeds and reordered map insertion.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/stampede-route-system.test.ts`; expect a missing-module failure.
- [ ] Add `HerdRoute { unitId; committedTurn; steps }`, `planHerdRoute`, `getHerdAvoidanceScore`, and `commitHerdRouteForTurn`. Filter legal land neighbors; rank outward class, then avoidance, then a seeded hash of game/force/unit/turn/coordinate. Fort=3, Citadel=4, each adjacent fortified land unit=2, total cap=6; stop after a Fort/Citadel route tile.
- [ ] Run the two system tests; expect PASS. Commit `feat(702): add deterministic herd routing`.

### Task 2: Persisted-route normalization

**Files:** modify `src/systems/crisis-force-system.ts`, `src/storage/save-migrations.ts`; test `tests/storage/save-migrations.test.ts`.

- [ ] Write a failing schema-15 fixture containing a valid mid-route herd and malformed coordinate/non-member/wrong-owner/three-step/non-adjacent routes. Assert migration reaches 16, preserves the valid route and unrelated units, removes only invalid routes, and is idempotent.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts`; expect the schema-15 expectation to fail.
- [ ] Advance `CURRENT_SAVE_SCHEMA_VERSION` to 16 and make migration 16 call force normalization. Validate registered membership, crisis ownership, integer map coordinates, adjacency, legal terrain, occupancy, and one-step Fort/Citadel termination.
- [ ] Run migration and force tests; expect PASS. Commit `feat(702): migrate committed herd routes`.

### Task 3: Viewer-safe presentation

**Files:** create `src/renderer/stampede-route-overlay.ts`, `tests/renderer/stampede-route-overlay.test.ts`; modify `src/renderer/render-loop.ts`, `src/ui/selected-unit-info.ts`; test `tests/ui/selected-unit-info.test.ts`.

- [ ] Write failing tests for `getHerdRoutePresentationForViewer`: a visible target receives route data; unseen/non-target/hot-seat viewer receives none. Render the selected unit and assert `Herd path: next two steps`; use a Fort route to assert stop wording and one marker.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/renderer/stampede-route-overlay.test.ts tests/ui/selected-unit-info.test.ts`; expect missing-presentation failure.
- [ ] Implement presentation that reads committed, target-visible routes only. Cache it in `GameRenderer.setGameState` for `state.currentPlayer`; draw non-animated markers; use panel `textContent`. Never plan a route, emit a notification, play SFX, or add a route action in rendering.
- [ ] Run renderer and UI tests; expect PASS. Commit `feat(702): present committed herd paths`.

## Player Truth Table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Target sees routed herd | Select / inspect map | Stored one- or two-step path text and markers appear. |
| Fort is first step | Select / inspect map | Stop text and exactly one marker appear. |
| Herd unseen or other hot-seat player | Render / hand off | No marker, label, or coordinate appears. |

## Misleading UI Risks

- “Next” means the persisted route, not a render-time recalculation.
- Fort screens are intended detours, not guarantees.
- Hot-seat handoff must clear prior-player route facts without changing state.

## Interaction Replay Checklist

- Select, deselect, and reselect: route facts remain identical.
- Hand off then return: surfaces clear then restore the same fact without recalculation.
- Load mid-route: valid path appears; malformed path remains hidden.

### Task 4: Verification and plan synchronization

**Files:** all changed source/tests and this plan.

- [ ] Run `scripts/check-src-rule-violations.sh` for every changed `src` file, then run all route, crisis-force, migration, renderer, and panel tests together.
- [ ] Inspect `git diff --check`, `git diff --stat origin/main...HEAD`, and `git diff --stat`; separately run `bash scripts/run-with-mise.sh yarn build`, `bash scripts/run-with-mise.sh yarn test:durable`, and `bash scripts/run-with-mise.sh yarn test:durable:status`.
- [ ] Tick completed plan steps; after merge annotate task headers with the PR number, per repository plan-sync policy.
