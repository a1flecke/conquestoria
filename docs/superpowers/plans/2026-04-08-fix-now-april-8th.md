# Fix-Now-April-8th Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the current April 8 playtest blockers that break information privacy, save/load discoverability, early-game diplomacy sanity, and horizontally wrapped map behavior.

**Architecture:** Treat this as a focused hotfix milestone, not a redesign milestone. Group the fixes by shared root cause so each task lands a coherent, testable behavior change: diplomacy/privacy gating, quest validity, save-panel discoverability, AI war timing, and wrap-aware rendering/pathing. Keep all state serializable and follow the existing hot-seat rule that the current player must only see information legitimately available to `state.currentPlayer`.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, IndexedDB, GitHub issue triage

---

## Milestone

**Milestone name:** `fix-now-april-8th`

This milestone owns the bugs that should be fixed immediately from the April 8, 2026 gameplay review. Deferred items stay explicitly assigned to `M4e` or `M5`; they are not part of this implementation plan.

---

## Scope

**Fix now**
- `#47` Initial diplomacy still shows civilizations not met
- `#49` Saved games do not appear in the list
- `#50` Computer declared war after first turn
- `#55` Weird starting map state / visible wrap seams
- `#57` Receiving requests from city-states not met
- `#58` Diplomacy shows many cities/civs not met
- `#63` Cannot move onto wrapped desert-edge tiles
- `#66` Quest generation produces invalid or unsupported requests

**Already fixed on main**
- `#45` Hot seat new game bug
- `#46` Hot seat civilization list

**Deferred**
- `#48`, `#56`, `#59`, `#60`, `#61`, `#64`, `#65`

---

### Task 1: Gate Diplomacy And Minor-Civ Information By Discovery

**Issues:** `#47`, `#57`, `#58`

**Files:**
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/ui/advisor-system.ts`
- Modify: `src/main.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Add failing diplomacy-panel tests for unknown majors and undiscovered minor civs**
- [ ] **Step 2: Add a failing minor-civ turn test proving quests are not issued to undiscovered players**
- [ ] **Step 3: Add a shared helper for “has discovered this minor civ / has met this major civ” using current-player visibility**
- [ ] **Step 4: Update the diplomacy panel so known majors render by name, unknown majors render as `Unknown Civilization N`, and undiscovered minor civs are omitted**
- [ ] **Step 5: Update minor-civ quest issuance and quest notifications so a city-state must be discovered before it can issue requests or appear in player-facing messaging**
- [ ] **Step 6: Re-run targeted diplomacy/minor-civ tests**
- [ ] **Step 7: Commit**

**Verification:**
- `./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts tests/systems/minor-civ-system.test.ts`

---

### Task 2: Validate Quest Targets Against Real Game State

**Issues:** `#57`, `#66`

**Files:**
- Modify: `src/systems/quest-system.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/systems/quest-system.test.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Add failing tests for unsupported trade-route quests and for defeat-units quests with no nearby enemies**
- [ ] **Step 2: Add a failing test proving destroy-camp quests only target real camps near the minor civ**
- [ ] **Step 3: Change quest target building so unsupported or context-free quest types are skipped instead of emitted**
- [ ] **Step 4: Remove or gate `trade_route` until the supporting trade-route system exists**
- [ ] **Step 5: Make defeat-units and destroy-camp targets depend on actual nearby hostile state instead of placeholder coordinates**
- [ ] **Step 6: Re-run quest tests**
- [ ] **Step 7: Commit**

**Verification:**
- `./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/systems/minor-civ-system.test.ts`

---

### Task 3: Surface Autosave And Real Save Choices In The Save Panel

**Issue:** `#49`

**Files:**
- Modify: `src/storage/save-manager.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `tests/storage/save-persistence.test.ts`
- Create or Modify: `tests/ui/save-panel.test.ts`

- [ ] **Step 1: Add failing tests proving the start-screen save list includes autosave metadata when an autosave exists**
- [ ] **Step 2: Add a failing UI test proving the save panel renders a selectable autosave entry before backup/export actions**
- [ ] **Step 3: Extend save metadata loading so the UI can display autosave as a first-class row instead of only a separate `Continue` button**
- [ ] **Step 4: Adjust the save panel layout so “Saved Games” actually shows loadable entries and backup/import actions are visually secondary**
- [ ] **Step 5: Re-run save-panel and persistence tests**
- [ ] **Step 6: Commit**

**Verification:**
- `./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/ui/save-panel.test.ts`

---

### Task 4: Add AI Early-War Sanity Gates

**Issue:** `#50`

**Files:**
- Modify: `src/ai/ai-diplomacy.ts`
- Modify: `src/ai/ai-personality.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/ai/ai-diplomacy.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Add failing AI tests proving an AI cannot declare war on turn 1 without enough hostility/contact pressure**
- [ ] **Step 2: Add a failing regression proving aggressive civs can still declare war later once the gating conditions are satisfied**
- [ ] **Step 3: Introduce a simple early-war gate based on minimum turn and/or sustained hostility rather than raw military advantage alone**
- [ ] **Step 4: Keep the aggressive personalities dangerous after the grace period instead of flattening them into permanent peace**
- [ ] **Step 5: Re-run targeted AI diplomacy tests**
- [ ] **Step 6: Commit**

**Verification:**
- `./scripts/run-with-mise.sh yarn test --run tests/ai/ai-diplomacy.test.ts tests/ai/basic-ai.test.ts`

---

### Task 5: Make Wrapped Maps Consistent For Fog, Input, And Movement

**Issues:** `#55`, `#63`

**Files:**
- Modify: `src/renderer/fog-renderer.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/hex-utils.ts`
- Modify: `tests/systems/map-generator.test.ts`
- Modify: `tests/ui/fog-leak.test.ts`
- Modify: `tests/systems/unit-system.test.ts`

- [ ] **Step 1: Add failing renderer/fog tests proving wrap ghost tiles are fogged the same way as their source tiles**
- [ ] **Step 2: Add failing movement/path tests proving edge-to-edge wrapped tiles are reachable when the map wraps horizontally**
- [ ] **Step 3: Make fog rendering draw the same wrap ghost overlays that the terrain renderer already draws**
- [ ] **Step 4: Make movement-range and pathfinding logic honor horizontal wrapping instead of treating ghost-edge tiles as disconnected**
- [ ] **Step 5: Re-run wrap-specific renderer and movement tests**
- [ ] **Step 6: Commit**

**Verification:**
- `./scripts/run-with-mise.sh yarn test --run tests/ui/fog-leak.test.ts tests/systems/unit-system.test.ts tests/systems/map-generator.test.ts`

---

### Task 6: Final Regression Sweep And Release Gate

**Files:**
- Modify: bugfix plan/spec docs only if implementation details changed

- [ ] **Step 1: Run the full suite**
- [ ] **Step 2: Run the production build**
- [ ] **Step 3: Re-review the linked issues against the final branch behavior**
- [ ] **Step 4: Update issue comments with final fix notes and close resolved issues**
- [ ] **Step 5: Commit the release-gate updates**

**Verification:**
- `./scripts/run-with-mise.sh yarn test --run`
- `./scripts/run-with-mise.sh yarn build`

---

## Triage Notes

- `#45` and `#46` are already fixed on current `main`; they should be commented and closed, not reimplemented.
- `#47` and `#58` share the same root cause and should be fixed in one privacy-gating change set.
- `#57` and `#66` share the same quest-validation root cause and should be fixed together.
- `#55` and `#63` are both symptoms of horizontal-wrap inconsistency and should land in the same branch.
- `#50` should be fixed with a small, explicit AI-war gate, not a broad diplomacy rewrite.
