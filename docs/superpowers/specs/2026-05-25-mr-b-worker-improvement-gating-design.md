# MR-B: Worker Improvement Gating and UI Descriptions

**Issues:** #258, #262  
**Date:** 2026-05-25  
**PR strategy:** Single PR — both issues touch `improvement-system.ts` and `selected-unit-info.ts`

---

## #258 — Worker Offers Improvements on Tiles Without Required Resources

### Root cause

`canBuildImprovement` in `src/systems/improvement-system.ts` (lines 131–149) checks terrain, river, tech, and territory ownership — but not whether the tile has the resource that the improvement is meant to unlock. `RESOURCE_DEFINITIONS` in `src/systems/trade-system.ts` encodes the `requiredImprovement` contract (e.g., `plantation` requires silk/wine/spices/incense on the tile), but `improvement-system.ts` never consults it.

`getWorkerActionBlockerReason` (lines 174–210) has the same gap: it validates terrain, river, tech, and territory but returns `'none'` for resource-gated improvements on tiles with no matching resource.

As a result:
- Workers show "Plantation" buttons on any grassland tile, not just tiles with silk/wine/etc.
- Workers show "Pasture" on any plains/hills tile, even without sheep/cattle/horses.
- Workers show "Camp" on any forest tile, even without ivory/furs.
- Workers show "Mine" on any hills tile, even without gems/gold/silver/salt/copper/iron.
- Workers show "Quarry" on any mountain tile, even without stone.

### Fix

**Step 1 — Derive resource-gated improvement set at module load**

**File:** `src/systems/improvement-system.ts`

Add an import for `RESOURCE_DEFINITIONS` from `trade-system.ts` and a module-level lookup map. This avoids re-scanning the array on every call.

```ts
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';

// Improvements that only make sense on tiles with a specific resource.
// Derived from RESOURCE_DEFINITIONS.requiredImprovement at module init.
const RESOURCE_GATED_IMPROVEMENTS = new Map<BuildableImprovementType, Set<string>>();
for (const rd of RESOURCE_DEFINITIONS) {
  const set = RESOURCE_GATED_IMPROVEMENTS.get(rd.requiredImprovement) ?? new Set<string>();
  set.add(rd.id);
  RESOURCE_GATED_IMPROVEMENTS.set(rd.requiredImprovement, set);
}
```

**Step 2 — Add resource check to `canBuildImprovement`**

Append one guard after the existing `requiredTech` check (line 148):

```ts
const resourceSet = RESOURCE_GATED_IMPROVEMENTS.get(type);
if (resourceSet !== undefined) {
  // This improvement requires a matching resource on the tile.
  if (!tile.resource || !resourceSet.has(tile.resource)) return false;
}
return true;
```

**Step 3 — Add `'missing-resource'` to `WorkerActionBlockerReason`**

**File:** `src/systems/improvement-system.ts` (lines 25–32)

```ts
export type WorkerActionBlockerReason =
  | 'outside-territory'
  | 'city-center'
  | 'already-improved'
  | 'invalid-terrain'
  | 'requires-river'
  | 'requires-tech'
  | 'missing-resource'   // ← new
  | 'none';
```

**File:** `src/systems/improvement-system.ts` — `formatWorkerActionBlockerReason`

Add the new case:

```ts
case 'missing-resource': return 'No matching resource on this tile';
```

**Step 4 — Add resource check to `getWorkerActionBlockerReason`**

After the `requiredTech` check (currently last before `return 'none'`), insert:

```ts
const resourceSet = RESOURCE_GATED_IMPROVEMENTS.get(action as BuildableImprovementType);
if (resourceSet !== undefined) {
  if (!tile.resource || !resourceSet.has(tile.resource)) return 'missing-resource';
}
return 'none';
```

> **Scope note:** `drain_swamp` is not in `IMPROVEMENT_DEFINITIONS` and is handled separately; it is not affected by this change.

> **AI note:** `src/ai/basic-ai.ts` calls `getAvailableWorkerActions` which delegates to `canBuildImprovement`. Once step 2 lands, the AI automatically stops queuing resource-less improvements — no separate AI change is needed.

### Tests (`tests/systems/improvement-system.test.ts`)

- `canBuildImprovement('plantation', ...)` on a grassland tile **without** `tile.resource` → `false`.
- `canBuildImprovement('plantation', ...)` on a grassland tile with `tile.resource = 'silk'` → `true`.
- `canBuildImprovement('plantation', ...)` on a grassland tile with `tile.resource = 'iron'` (wrong resource type) → `false`.
- `canBuildImprovement('pasture', ...)` on plains without resource → `false`; with `'sheep'` → `true`.
- `canBuildImprovement('camp', ...)` on forest without resource → `false`; with `'ivory'` → `true`.
- `canBuildImprovement('mine', ...)` on hills without resource → `false`; with `'iron'` → `true`.
- `canBuildImprovement('farm', ...)` on plains (farm is NOT resource-gated) → `true` (no regression).
- `getWorkerActionBlockerReason` for plantation on a tile without resource → `'missing-resource'`.
- `getWorkerActionBlockerReason` for plantation on a tile with matching resource → `'none'`.
- `formatWorkerActionBlockerReason('missing-resource')` → `'No matching resource on this tile'`.

---

## #262 — drain_swamp Button Lacks Result Description

### Root cause

In `src/ui/selected-unit-info.ts`, `getAvailableWorkerActions` returns `'drain_swamp'` for swamp tiles and the button is rendered with a static color but no descriptive label beyond the action name. Players do not know that draining transforms the terrain to Grassland and yields +1 food.

Additionally, the `WORKER_ACTIONS` constant (line 52) used for `chooseWorkerBlockerReason` only lists `['farm', 'mine', 'lumber_camp', 'watermill', 'drain_swamp']` — missing `plantation`, `pasture`, `camp`, and `quarry`. With the fix in #258, workers will now correctly NOT offer these actions (because the resource check fails), but if a future caller expands `WORKER_ACTIONS` for blocker-reason coverage, the list should be complete. Update it in this MR.

### Fix

**File:** `src/ui/selected-unit-info.ts`

**drain_swamp label:** Replace the hardcoded color selection to give drain_swamp its own label and descriptive tooltip:

In the `for (const action of workerActions)` loop, replace the color logic for `drain_swamp` and the button creation:

```ts
for (const action of workerActions) {
  const color = action === 'farm'
    ? '#6b9b4b'
    : action === 'mine'
      ? '#8b7355'
      : action === 'lumber_camp'
        ? '#476f3a'
        : action === 'watermill'
          ? '#3f7f8f'
          : action === 'drain_swamp'
            ? '#4a7c59'
            : '#64748b';
  const label = action === 'drain_swamp'
    ? 'Drain Swamp (→ Grassland, +1 🌾)'
    : getWorkerActionLabel(action);
  actionsDiv.appendChild(makeButton(label, color, () => callbacks.onWorkerAction!(action)));
}
```

**WORKER_ACTIONS constant (line 52):** Expand to include all improvement types so `chooseWorkerBlockerReason` covers the full catalog:

```ts
const WORKER_ACTIONS: WorkerActionType[] = [
  'farm', 'mine', 'lumber_camp', 'watermill',
  'plantation', 'pasture', 'camp', 'quarry',
  'drain_swamp',
];
```

### Tests (`tests/ui/selected-unit-info.test.ts`)

- On a swamp tile, the rendered action buttons include one with text matching `/Drain Swamp.*Grassland/`.
- On a swamp tile, there is no button whose text is exactly `'drain_swamp'` (raw action key must not leak into UI).
- On a grassland tile with `tile.resource = 'silk'`, the plantation button is present.
- On a grassland tile **without** a resource, no plantation button is rendered.
- `WORKER_ACTIONS` array contains all 9 worker action types (regression count assertion).

### Summary of files changed

| File | Change |
|------|--------|
| `src/systems/improvement-system.ts` | `RESOURCE_GATED_IMPROVEMENTS` map; resource check in `canBuildImprovement`; `'missing-resource'` in `WorkerActionBlockerReason`; resource check in `getWorkerActionBlockerReason`; `formatWorkerActionBlockerReason` case |
| `src/ui/selected-unit-info.ts` | drain_swamp descriptive label; `WORKER_ACTIONS` expanded |
| `tests/systems/improvement-system.test.ts` | 10 new unit tests |
| `tests/ui/selected-unit-info.test.ts` | 5 new render tests |
