---
name: mr-a-worker-improvements-design
description: Design spec for MR-A fixing issues #277 (worker in to-move queue), #280 (quarry blocker UX), #282 (improvement replacement)
metadata:
  type: project
---

# MR-A — Worker Turn-State & Improvement UX

**Issues:** #277, #280, #282
**Depends on:** nothing (ship first)
**Followed by:** MR-C

## Problem Statement

Three related gaps in the worker/improvement system:

1. **#277:** Workers with an active `workerTask` re-appear in the "to move" queue every turn. `resetUnitTurn()` clears `hasActed: false` unconditionally; committed caravans are excluded via a guard but workers are not.

2. **#280:** When a worker cannot build an improvement, the blocker message says "Requires technology" or "No matching resource on this tile" without naming the specific tech or resource. The data exists in `IMPROVEMENT_DEFINITIONS` and `RESOURCE_GATED_IMPROVEMENTS` but is not surfaced to the player.

3. **#282:** If a tile already has an improvement (e.g., Farm), the player cannot replace it. `canBuildImprovement` hard-blocks on `tile.improvement !== 'none'` with no recourse. After researching Plantation the player is stuck with the old Farm forever.

## Architecture

### Fix 1 — Worker reset guard (`src/core/turn-manager.ts`)

In the unit-reset loop (lines ~252–263), after the existing committed-caravan guard, add:

```ts
if (reset.workerTask) {
  reset = { ...reset, movementPointsLeft: 0, hasActed: true };
}
```

**Order of operations is safe:** `processImprovements()` runs before `processTurn()` in both hot-seat and solo paths. When an improvement finishes, `clearCompletedWorkerTasksForImprovement` clears `workerTask` before the reset runs. A worker whose improvement just finished gets normal movement restored; one whose improvement is still in progress stays "acted."

### Fix 2 — Specific blocker descriptions (`src/systems/improvement-system.ts`)

Add a new export alongside `formatWorkerActionBlockerReason`:

```ts
export function getWorkerActionBlockerDescription(
  tile: HexTile | undefined,
  action: WorkerActionType,
  completedTechs: string[],
  ownerId?: string,
  options?: WorkerActionEligibilityOptions,
): string
```

This calls `getWorkerActionBlockerReason` internally and formats a rich message:
- `requires-tech` → `"Requires [Tech Name]"` — looks up tech display name from `TECH_DEFINITIONS` using `IMPROVEMENT_DEFINITIONS[action].requiredTech`
- `missing-resource` → `"Needs [Resource Name] on this tile"` — reads the resource set from `RESOURCE_GATED_IMPROVEMENTS.get(action)` and maps IDs to display names via `RESOURCE_DEFINITIONS`
- All other reasons → delegates to existing `formatWorkerActionBlockerReason(reason)` unchanged

Leave `formatWorkerActionBlockerReason(reason: WorkerActionBlockerReason): string` signature **unchanged** — it's a public utility. The new function is the rich variant.

**Call site change:** `selected-unit-info.ts:211` — replace `formatWorkerActionBlockerReason(blockerReason)` with `getWorkerActionBlockerDescription(tile, action, completedTechs, ownerId, options)`. Pass the tile and action already in scope at that call site.

### Fix 3 — Improvement replacement (`src/systems/improvement-system.ts` + `src/ui/worker-task-warning-panel.ts` + `src/main.ts`)

**Panel generalization:** Rename `WorkerTaskWarningPanelConfig` fields to be copy-agnostic:

```ts
export interface WorkerTaskWarningPanelConfig {
  title: string;       // was: derived from improvementName + turnsLeft
  body: string;        // was: hardcoded "Moving this worker..."
  confirmLabel: string; // was: "Move anyway"
  cancelLabel: string;  // was: "Keep working"
  onConfirm: () => void;
  onCancel: () => void;
}
```

Existing caller in `main.ts` passes:
```ts
title: `${improvementName} in progress — ${turnsLabel}`,
body: 'Moving this worker now means work in progress will be lost.',
confirmLabel: 'Move anyway',
cancelLabel: 'Keep working',
```

**Replacement flow:** In `canBuildImprovement`, add `allowReplacement?: boolean` to `WorkerActionEligibilityOptions`. When `allowReplacement: true`, skip the `tile.improvement !== 'none'` guard (all other guards — terrain, river, tech, resource — still apply).

In `selected-unit-info.ts`, when the blocker reason is `'already-improved'`, the action button's click handler invokes an `onReplaceImprovement` callback (passed in from `main.ts`). In `main.ts`, that callback shows the confirmation panel — matching the pattern used for the existing worker-task-warning panel:
- Show the confirmation panel with:
  ```ts
  title: `Replace ${existingImprovementName}?`,
  body: `Building ${newImprovementName} will remove the existing ${existingImprovementName}.`,
  confirmLabel: 'Replace',
  cancelLabel: 'Keep',
  ```
- On confirm: call `applyWorkerAction` with `allowReplacement: true` in options (thread through to `canBuildImprovement`).

`applyWorkerAction` passes options through to `getWorkerActionBlockerReason`, which in turn passes `allowReplacement` to `canBuildImprovement`. No other changes to `applyWorkerAction`.

## Data Flow

```
Unit reset loop (turn-manager.ts)
  → unit.workerTask present? → preserve hasActed:true, movementPointsLeft:0
  → unit.workerTask absent?  → normal reset

Worker action panel (selected-unit-info.ts)
  → blocker = 'already-improved'? → show replacement confirmation
  → onConfirm → applyWorkerAction(allowReplacement:true)
  → blocker = 'requires-tech'/'missing-resource'? → getWorkerActionBlockerDescription → specific message
```

## Error Handling

- If `IMPROVEMENT_DEFINITIONS[action].requiredTech` names a tech ID not found in `TECH_DEFINITIONS`, fall back to `"Requires [techId]"` (shows the ID rather than crashing).
- If `RESOURCE_GATED_IMPROVEMENTS.get(action)` returns an empty set (shouldn't happen, but defensive), fall back to `"No matching resource on this tile"`.

## Tests

1. **Turn reset — worker with active task stays acted:**
   - Create a unit with `workerTask` set; call `resetUnitTurn`; assert `hasActed: true, movementPointsLeft: 0`.
   - Create a unit without `workerTask`; call `resetUnitTurn`; assert `hasActed: false, movementPointsLeft > 0`.

2. **Turn reset — finished improvement frees worker:**
   - Setup state where `improvementTurnsLeft: 1` on tile and unit has matching `workerTask`.
   - Run `processImprovements()` then the reset loop; assert worker has `hasActed: false` and no `workerTask`.

3. **Blocker description — tech name:**
   - Set up a tile that blocks on `requires-tech`; call `getWorkerActionBlockerDescription`; assert string contains the tech's display name.

4. **Blocker description — resource name:**
   - Set up a tile that blocks on `missing-resource`; assert string contains the resource display name.

5. **Replacement — bypass already-improved guard:**
   - Tile with `improvement: 'farm'`; call `canBuildImprovement` without `allowReplacement` → false.
   - Same tile with `allowReplacement: true` → true (assuming terrain/tech pass).

6. **Replacement — other guards still apply:**
   - Tile with wrong terrain + existing improvement + `allowReplacement: true` → still false.
