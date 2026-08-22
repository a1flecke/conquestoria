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

### Task 1: Canonical routing ✅ implemented

**Files:** create `src/systems/stampede-route-system.ts`, `tests/systems/stampede-route-system.test.ts`; modify `src/core/types.ts`, `src/systems/crisis-force-system.ts`, `tests/systems/crisis-force-system.test.ts`.

- [x] Write and prove focused routing regressions.
- [x] Implement canonical deterministic route planning and commit.

### Task 2: Persisted-route normalization ✅ implemented

**Files:** modify `src/systems/crisis-force-system.ts`, `src/storage/save-migrations.ts`; test `tests/storage/save-migrations.test.ts`.

- [x] Add and prove schema-15-to-16 migration and idempotence regressions.
- [x] Advance the schema and normalize persisted route records.

### Task 3: Viewer-safe presentation ✅ implemented

**Files:** create `src/renderer/stampede-route-overlay.ts`, `tests/renderer/stampede-route-overlay.test.ts`; modify `src/renderer/render-loop.ts`, `src/ui/selected-unit-info.ts`; test `tests/ui/selected-unit-info.test.ts`.

- [x] Add viewer-scope and selected-unit rendered-text regressions.
- [x] Cache target-visible facts, render non-animated markers, and present safe DOM text.

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

### Task 4: Verification and plan synchronization ✅ implemented

**Files:** all changed source/tests and this plan.

- [x] Run source rules, focused tests, build, durable suite, and diff inspection.
- [x] Sync implemented plan status; PR-number annotation remains for the future merge PR.
