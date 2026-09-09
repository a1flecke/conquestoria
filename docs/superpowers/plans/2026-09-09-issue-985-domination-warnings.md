# Domination Warnings and Safe Ending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add viewer-safe Domination near-victory warnings and a recipient-safe final Domination outcome without changing saved-state shape.

**Architecture:** Build warnings from the observer's earned `DominationKnowledge`, then route only transition edges through the existing strategic-warning ledger, presenter, acknowledgement, and audio suppression seam. Keep the simulation's `victory:resolved` event raw and one-shot; project it into solo or hot-seat-safe outcome DTOs before the final modal renders.

**Tech Stack:** TypeScript, Vitest, DOM testing, EventBus, existing strategic-warning/audio and hot-seat infrastructure.

---

## Player truth table

| Player context | Visible outcome | Must remain hidden |
|---|---|---|
| Solo player with a known winning rival | The earned rival name and the player's own defeat status | Any current foreign state beyond earned reports |
| Solo player with an unknown winning rival | “A rival empire” and the player's own defeat status | The winner identity and its private sovereignty details |
| Human hot-seat winner | Configured human names and winner/not-winner standings | Civilization names, private panels, and per-seat intelligence |
| AI hot-seat winner | Generic AI result and configured human standings | The AI civilization identity and its private state |
| All humans eliminated | Defeat and “No human civilizations remain” | A Domination winner or a reclassified victory outcome |

The final interaction closes the viewer-private Victory Progress panel before opening the blocking result panel. DOM tests assert the visible safe result text, standings, warning marker, and panel cleanup.

---

### Task 1: Earned-knowledge threat inference and warning lifecycle

**Files:**
- Modify: `src/systems/domination-knowledge.ts`, `src/systems/domination-presentation.ts`, `src/systems/strategic-warning-system.ts`, `src/ui/strategic-warning-presentation.ts`, `src/core/types.ts`
- Create: `tests/systems/domination-warning.test.ts`
- Modify: `tests/systems/strategic-warning-system.test.ts`, `tests/ui/strategic-warning-presentation.test.ts`

- [ ] Write failing tests for the two-of-three secured threshold, an unresolved rival clearing the threat, report age five versus six, provisional/vassal/future-report rejection, and an observer-differential hidden-state variant.
- [ ] Add private inference helpers that consume `DominationKnowledge` only. A recent known independent contender threatens when it has at least two secured known rivals, at most one unresolved known rival, and secured rivals comprise at least two thirds of the known rival denominator.
- [ ] Add `domination` and `domination-eased` warning kinds. Derive only false-to-true Domination edges for every living human viewer, key them as `viewer:actor:domination`, and use the existing per-key five-turn ledger cooldown. A clear edge never plays audio.
- [ ] Render fixed uncertainty-aware warning copy and preserve the existing acknowledgement/mute/presentation-suppression behavior.
- [ ] Verify targeted inference, warning, presenter, hot-seat, and audio tests.

### Task 2: One-shot final event and safe outcome projection

**Files:**
- Modify: `src/systems/victory-system.ts`, `src/systems/domination-presentation.ts`, `src/core/types.ts`
- Modify: `tests/systems/victory-system.test.ts`, `tests/systems/domination-presentation.test.ts`
- Create: `tests/integration/domination-outcome-presentation.test.ts`

- [ ] Write failing tests proving a real Domination transition emits `victory:resolved` once and that repeat finalization or loading a finished state emits no duplicate event.
- [ ] Emit `victory:resolved` only after `finalizeDominationVictory` changes a nonfinished state, with `{ winnerId, reason: 'domination', turn }`.
- [ ] Add `projectDominationOutcome(state, viewerId)` that names a solo winner only when the viewer is entitled to know it, explains the viewer's own outcome without foreign private facts, and produces an opaque shared hot-seat result with configured human winner/not-winner standings and generic AI identity.
- [ ] Verify simulation, reload, and projection privacy behavior without using notification history as truth.

### Task 3: Final modal and hot-seat cleanup integration

**Files:**
- Modify: `src/app/controllers/turn-flow-controller.ts`, `src/ui/victory-panel.ts`, `src/presentation/register-civilization-presentation.ts` if explicit safe notification delivery is required
- Modify: `tests/app/controllers/turn-flow-controller.test.ts`, `tests/ui/victory-panel.test.ts`

- [ ] Write failing DOM tests for solo unknown winners, a human hot-seat winner, an AI hot-seat winner, completed-save load, and finalization while a private victory-progress panel is open.
- [ ] Pass the safe outcome DTO into the final modal. Close private panels and release the handoff blocker before rendering the opaque shared result; retain failed-persistence retry behavior.
- [ ] Reuse the existing modal and warning SFX path only. Do not create a generic ceremony framework, a `SFX.victory` call, a chronicle career record, or a new persisted field.
- [ ] Verify rendered text and overlay cleanup across repeated handling, reload, and handoff.

### Task 4: Determinism, regression gate, and MR delivery

**Files:**
- Modify: relevant targeted tests only

- [ ] Add save/reload and deterministic completed-round coverage for warning edges and final outcomes.
- [ ] Run the narrow Domination, warning, audio, presentation, controller, hot-seat, and determinism suites; then `yarn verify:push`, `yarn build`, and the applicable Tauri build.
- [ ] Perform inline review against viewer privacy, solo/hot-seat behavior, accessibility, SFX suppression, save compatibility, and regression risks. Commit, push, create an MR with `Refs #985`, and monitor all required checks.
