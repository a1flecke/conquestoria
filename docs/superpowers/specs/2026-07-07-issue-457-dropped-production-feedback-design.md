# Issue #457 — Silent Production-Queue Drop Feedback: Design

## Context

`CityProcessResult.droppedProductionItem` (`src/systems/city-system.ts`) is populated by several
code paths inside `processCity` whenever a queued unit or building silently drops out of a city's
production queue, but nothing outside `city-system.ts` ever reads it. Confirmed by grep against
`main` at commit `e1416b64`.

While mapping every branch that removes an item from the queue, this investigation found the bug
is broader than the original issue text: there are five distinct silent-drop paths inside
`processCity`, and only two of them currently reach the player in any form — and one of those two
uses a dead event (`bus.emit('notification:show', ...)` has no listener anywhere in the codebase).

| # | Path (`processCity`, `src/systems/city-system.ts`) | Item kind | Currently tracked? | Currently reaches player? |
|---|---|---|---|---|
| 1 | `isBuildingObsolete` (tech obsolescence) | building | `droppedProductionItem` | No |
| 2 | `resourceRequired` no longer available (building) | building | **No — untracked** | No |
| 3 | Unit no longer in `getTrainableUnitsForCiv` (obsoleted or resource loss, undistinguished) | unit | `droppedProductionItem` | No |
| 4 | National-project outside `homeEra`/`homeEra+1` build window | building | **No — untracked** | No |
| 5 | Coastal-guard: `coastalRequired` building/unit in a now-non-coastal city | building or unit | `droppedBuilding` / `droppedUnit` | Building: yes, via `city:building-dropped` → `appendToCivLog`. Unit: **no — `notification:show` has no listener** |
| 6 | Coastal-guard: unit's `trainedFromBuilding` no longer present | unit | `droppedUnit` (same field as #5, message text wrongly says "needs a coast") | **No — same dead event as #5** |

This design fixes all six paths in one pass, per user decision during brainstorming (scope
explicitly widened beyond the issue's original two named cases to cover every silent-drop path,
including the two newly-discovered untracked cases and the dead `notification:show` event).

## Goals

- Every silent production-queue drop reaches the player as a real, persistent notification
  (`ui-panels.md`'s "No Silent Destructive UI" rule), correctly attributed to the owning civ (hot
  seat-safe — never hardcoded to `'player'`).
- Every drop reason gets an accurate, distinct message. In particular, fix the existing bug where
  a `trainedFromBuilding`-missing unit drop displays "needs a coast" even though that isn't why it
  dropped.
- Support multiple drops from the same city in the same turn (today's `??=` first-drop-only
  semantics under-report if more than one item is filtered out of a queue in one turn).
- No change to *which* items get dropped or *when* — this is a notification-plumbing fix only, not
  a change to queue-filtering behavior/eligibility rules.

## Non-goals

- No change to production-cost calculation, eligibility rules, or any balance-affecting logic.
- No save-migration concerns: `CityProcessResult` is a transient per-turn return value, never
  persisted to `GameState` or a save file.
- Not attempting to prevent drops (e.g., warning the player *before* a tech completes that it will
  orphan a queued item) — this is reactive, after-the-fact feedback only, matching the existing
  `city:building-dropped` precedent.

## Data shape

Replace the three existing single-value fields (`droppedBuilding`, `droppedUnit`,
`droppedProductionItem`) on `CityProcessResult` with one array field:

```ts
export type ProductionDropReason =
  | 'obsoleted'                  // building or unit: obsoletedByTech / isBuildingObsolete fired
  | 'resource-lost'              // building or unit: required resource no longer available
  | 'build-window-expired'       // national-project building: outside homeEra/homeEra+1
  | 'coastal-access-lost'        // building or unit: city lost coastal access
  | 'training-building-missing'; // unit: trainedFromBuilding no longer present

export interface DroppedProductionItem {
  itemId: string;                 // building id (key into BUILDINGS) or UnitType
  itemKind: 'building' | 'unit';
  reason: ProductionDropReason;
}
```

`CityProcessResult` gains `droppedProductionItems: DroppedProductionItem[]` (empty array when
nothing dropped). The three old fields are deleted, not deprecated — nothing outside
`city-system.ts`/`turn-manager.ts`/tests references them, and this is not persisted state.

## `processCity` changes (`src/systems/city-system.ts`)

Each branch that filters an item out of `newQueue` pushes a `DroppedProductionItem` describing
what and why, instead of (or in addition to) whatever it does today:

1. **Tech/resource filter, building branch** (~line 1827–1856): `isBuildingObsolete` check already
   exists → push `{ itemId: item, itemKind: 'building', reason: 'obsoleted' }`. The
   `resourceRequired` check already returns `false` to drop the item but currently pushes nothing
   — add the push: `{ itemId: item, itemKind: 'building', reason: 'resource-lost' }`.
2. **Tech/resource filter, unit branch**: currently one check (`!trainableTypes.has(unit.type)`)
   collapses two causes into one undistinguished drop. **Correction from an earlier draft of this
   design:** `techRequired` and `civTypeRequired` are both static for the life of a game — once a
   unit is validly queued, neither can later become false, since `completedTechs` never shrinks
   anywhere in this codebase (confirmed by grep) and civType never changes. So a previously-valid
   queued unit can only stop being trainable for two reasons, matching `getTrainableUnitsForCiv`'s
   (`src/systems/city-system.ts:1586`) own gating exactly: `unit.obsoletedByTech` now included in
   `completedTechs` (→ `'obsoleted'`, same reason name as the building case — a newer tech
   superseded it), or a `resourceRequired` entry no longer in `availableResources` (→
   `'resource-lost'`). No dual-failure/priority-order case exists to resolve.
3. **NP build-window filter** (~line 1858–1871): currently only compares `newQueue.length` before
   and after. Instead, diff `newQueue` against `filteredNP` (e.g. items present in the former but
   not the latter, since national projects are `uniquePerEmpire` and won't repeat in a queue) and
   push `{ itemId, itemKind: 'building', reason: 'build-window-expired' }` for each removed item.
4. **Coastal-guard section** (~line 1876–1892): building branch → push
   `{ itemId: droppedBuilding, itemKind: 'building', reason: 'coastal-access-lost' }`. Unit branch
   has two sub-cases already distinguished by an `if`/`else if` — keep that distinction and push
   `'coastal-access-lost'` or `'training-building-missing'` accordingly instead of collapsing them.

All pushes go into one local `const droppedProductionItems: DroppedProductionItem[] = []` array,
returned as-is (no more `??=` — every drop in the turn is recorded, not just the first).

## Message text (`src/systems/city-system.ts`)

New exported helper, colocated with the reason enum so wording and reasons can't drift apart, and
independently unit-testable without the event bus or DOM:

```ts
export function describeDroppedProductionItem(item: DroppedProductionItem, cityName: string): string
```

Display name resolution: `BUILDINGS[item.itemId]?.name ?? item.itemId` for buildings,
`TRAINABLE_UNITS.find(u => u.type === item.itemId)?.name ?? item.itemId` for units (matches the
existing `unit?.name ?? itemId` fallback pattern already used elsewhere in this file).

Message copy, one per reason (all rendered as `'warning'` notifications):

| Reason | Message |
|---|---|
| `obsoleted` | `"{name} removed from {city}'s build queue — it's obsolete now that a newer technology is available."` |
| `resource-lost` | `"{name} removed from {city}'s build queue — you no longer control the required resource."` |
| `build-window-expired` | `"{name} removed from {city}'s build queue — its national-project build window has closed."` |
| `coastal-access-lost` | `"{name} removed from {city}'s build queue — the city is no longer coastal."` |
| `training-building-missing` | `"{name} removed from {city}'s build queue — {city} no longer has the building required to train it."` |

## Wiring (`src/core/turn-manager.ts`, `src/main.ts`)

- Retire the `city:building-dropped` event and the dead `bus.emit('notification:show', ...)` call
  in `turn-manager.ts` (both replaced). Remove `'city:building-dropped'` and `'notification:show'`'s
  use-site here (the `notification:show` event type itself stays in `core/types.ts` since
  `unit-movement-system.ts` still emits it separately — that is a pre-existing, separate dead-code
  finding not in scope for this fix, noted below).
- Add one new event to the `EventMap` in `src/core/types.ts`:
  `'city:production-item-dropped': { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason }`.
- In `turn-manager.ts`'s per-city turn-processing loop (where `cityId`/`city`/`result` are already
  in scope, ~line 218 onward), replace the existing `result.droppedBuilding`/`result.droppedUnit`
  handling with: `for (const item of result.droppedProductionItems) { bus.emit('city:production-item-dropped', { cityId, itemId: item.itemId, itemKind: item.itemKind, reason: item.reason }); }`.
- New listener in `main.ts` (replacing the old `city:building-dropped` listener):
  ```ts
  bus.on('city:production-item-dropped', ({ cityId, itemId, itemKind, reason }) => {
    const city = gameState.cities[cityId];
    if (!city) return;
    const message = describeDroppedProductionItem({ itemId, itemKind, reason }, city.name);
    appendToCivLog(city.owner, message, 'warning');
  });
  ```
  This reuses `appendToCivLog`, which is already civ-aware (keys the persistent log by `civId`,
  and only surfaces a toast when `civId === gameState.currentPlayer`) — the same hot-seat-safe path
  already used for `city:building-complete`, `city:maturity-upgraded`, etc.

## Out of scope, flagged but not fixed here

- `unit-movement-system.ts` also emits `bus.emit?.('notification:show', ...)` (~line 480) for an
  unrelated reason (movement failure feedback) and is subject to the same "nothing listens for
  `notification:show`" bug. This is a separate, pre-existing dead-notification finding outside
  this issue's scope — worth its own follow-up issue rather than folding into this PR, since it's
  an unrelated code path (unit movement, not production queues) with its own test surface.

## Testing plan

- `tests/systems/city-system.test.ts`: rewrite the ~15 existing assertions against the new
  `droppedProductionItems` array shape (each `expect(result.droppedX).toBe(...)` becomes an
  assertion against an entry in the array with the right `itemId`/`itemKind`/`reason`). Add new
  cases for:
  - Building resource-loss drop (previously untracked) — positive and a negative (resource still
    available → not dropped).
  - NP build-window-expiry drop (previously untracked) — positive and a negative (still within
    window → not dropped).
  - Unit `obsoleted` vs `resource-lost` disambiguation — independent positive case for each, plus
    a negative (unit still trainable → no drop).
  - Multiple drops in one turn from the same city produce multiple array entries (regression for
    the old `??=` first-only limitation).
- New test suite for `describeDroppedProductionItem` covering all five reasons, exercising both
  `itemKind` values where the reason applies to both (`obsoleted`, `resource-lost`,
  `coastal-access-lost`).
- `tests/core/turn-manager.test.ts` (or nearest equivalent covering turn-manager event emission):
  new test proving `city:production-item-dropped` fires once per entry in
  `result.droppedProductionItems`, with the correct `cityId`/`itemId`/`itemKind`/`reason` payload.
- Update/add a `main.ts`-level or integration-level test proving the new listener calls
  `appendToCivLog` with the owning city's civ id (not `gameState.currentPlayer`) — this is the
  concrete regression test for "AI civs' drops still log correctly in hot seat," and the direct
  regression test that the original silent-drop bug can't recur.
