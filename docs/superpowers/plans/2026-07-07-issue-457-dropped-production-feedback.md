# Issue #457 — Silent Production-Drop Feedback Implementation Plan

> **For agentic workers:** This plan is executed **inline in this session, without subagent dispatch** — this repo's `CLAUDE.md` bans subagents/parallel agents. Use `superpowers:executing-plans` conventions (batch execution, checkpoint after each task) but do not use `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks below are written as if handed to a fresh Sonnet-4.5-class engineer with zero context on this codebase — every file path, line number, and code block is exact and complete; do not skip steps because they look obvious.

**Goal:** Make every silent production-queue drop (five distinct causes inside `processCity`) reach the player as an accurate, persistent, hot-seat-safe notification, replacing three dead/partial fields and one genuinely dead event (`notification:show` has no listener anywhere).

**Architecture:** `processCity` (`src/systems/city-system.ts`) returns a new `droppedProductionItems: DroppedProductionItem[]` array instead of three single-value fields. `turn-manager.ts` emits one `city:production-item-dropped` event per array entry. A new router function `routeDroppedProductionItem` (`src/ui/notification-routing.ts`, matching the existing `routeWarDeclared`/`routeFirstContact` pattern) turns each event into a civ-scoped, reason-accurate message via a new pure helper `describeDroppedProductionItem` (`src/systems/city-system.ts`), delivered through the existing `appendToCivLog` sink.

**Tech Stack:** TypeScript, Vitest.

**Deviation from the spec, noted per `.claude/rules/spec-fidelity.md`:** the spec (`docs/superpowers/specs/2026-07-07-issue-457-dropped-production-feedback-design.md`) said `ProductionDropReason`/`DroppedProductionItem` should live in `city-system.ts`. They're defined in `src/core/types.ts` instead. Reason: the new event must be added to `EventMap`, which also lives in `types.ts`, and **`types.ts` never imports from any `src/systems/*` file anywhere in this codebase** (verified by grep — every type used inside `EventMap` is declared locally in `types.ts`, e.g. `TreasuryStrainLevel`, `BeastId`). Declaring the reason/item types in `city-system.ts` and importing them into `types.ts` would be the only reverse system→core import in the codebase. Declaring them in `types.ts` (the normal core→system import direction, same as `City`, `UnitType`, `ResourceType` already flow into `city-system.ts`) avoids that. Behavior and shape are identical to the spec — this only changes which file the `export type`/`export interface` physically lives in.

**Second deviation:** the spec's `describeDroppedProductionItem` re-derives building/unit display names inline. `src/systems/city-system.ts` already exports `getProductionDisplayName(itemId: string): string` (line 1569) doing exactly this lookup (buildings, units, and legendary wonders). Task 3 reuses it instead of duplicating the lookup — same output, less code.

**Third deviation (a real bug caught while writing this plan, already folded back into the spec):** the spec originally split unit drops into just `'obsoleted'` vs `'resource-lost'`. Task 2 found an existing regression, `tests/systems/city-system.test.ts` → "queued musketeer dequeues on load for a tactics-only civ (save-compat)", that queues a unit whose `techRequired` is unmet with neither `obsoletedByTech` nor `resourceRequired` involved — a real save-compat scenario (a saved queue can predate a tech-tree rebalance), not just theoretical. Defaulting that case to `'resource-lost'` would be factually wrong (musketeer has no resource requirement to lose). The reason enum now has a sixth value, `'no-longer-available'`, for exactly this residual case — see Task 1 Step 2 and Task 2 Step 8.

## Global Constraints

- No `Math.random()` — N/A, no randomness in this change.
- `bash scripts/run-with-mise.sh yarn build` and `bash scripts/run-with-mise.sh yarn test` must both exit 0 before `git push`/`gh pr create` (pre-push hook enforces; verify locally first — see Task 7).
- `CityProcessResult` is a transient per-turn return value, never persisted to `GameState` or a save file — no save-migration handling needed anywhere in this plan.
- Never hardcode `'player'` for civ-scoped logic — `routeDroppedProductionItem` must key off `city.owner`, never `state.currentPlayer` (that's only used by `appendToCivLog` internally to decide whether to *also* show a toast).
- Bash tool timeouts: `git commit` → 30 000 ms; `git push`/`gh pr create` → 120 000 ms.

---

### Task 1: Shared types — `ProductionDropReason`, `DroppedProductionItem`, and the `EventMap` swap

**Files:**
- Modify: `src/core/types.ts`

**Interfaces:**
- Produces: `export type ProductionDropReason = 'obsoleted' | 'resource-lost' | 'no-longer-available' | 'build-window-expired' | 'coastal-access-lost' | 'training-building-missing';` and `export interface DroppedProductionItem { itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason; }` — consumed by Tasks 2, 3, 4, 5.
- Produces: `EventMap['city:production-item-dropped']: { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason }` — consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Locate the insertion point**

Run: `grep -n "export type TreasuryStrainLevel" src/core/types.ts`
Expected output: `459:export type TreasuryStrainLevel = 'none' | 'low' | 'high' | 'critical';`

- [ ] **Step 2: Add the two new exported types directly after that line**

Open `src/core/types.ts`, find line 459-460:
```ts
export type TreasuryStrainLevel = 'none' | 'low' | 'high' | 'critical';
export type EconomyStrainLevel = TreasuryStrainLevel;
```
Add immediately after (still before whatever comes next in the file):
```ts

export type ProductionDropReason =
  | 'obsoleted'                  // building or unit: obsoletedByTech / isBuildingObsolete fired
  | 'resource-lost'              // building or unit: required resource no longer available
  | 'no-longer-available'        // unit only: neither obsoleted nor resource-lost explains it
                                  // (e.g. a save-compat queue item whose techRequired is unmet)
  | 'build-window-expired'       // national-project building: outside homeEra/homeEra+1
  | 'coastal-access-lost'        // building or unit: city lost coastal access
  | 'training-building-missing'; // unit: trainedFromBuilding no longer present

export interface DroppedProductionItem {
  itemId: string;                 // building id (key into BUILDINGS) or UnitType
  itemKind: 'building' | 'unit';
  reason: ProductionDropReason;
}
```

- [ ] **Step 3: Replace the `city:building-dropped` EventMap entry with `city:production-item-dropped`**

Run: `grep -n "'city:building-dropped'" src/core/types.ts`
Expected: `1548:  'city:building-dropped': { cityId: string; buildingId: string };` (line number may have shifted by a few lines after Step 2 — use the grep result, not this exact number).

Replace that one line:
```ts
  'city:building-dropped': { cityId: string; buildingId: string };
```
with:
```ts
  'city:production-item-dropped': { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason };
```

- [ ] **Step 4: Verify the file still compiles in isolation**

Run: `bash scripts/run-with-mise.sh yarn build 2>&1 | tail -40`
Expected: Several errors referencing `'city:building-dropped'` no longer existing (in `src/main.ts` and `src/core/turn-manager.ts`) and `droppedBuilding`/`droppedUnit`/`droppedProductionItem` not yet matching — this is expected at this point in the plan; Tasks 2, 4, and 6 fix each error in turn. Confirm the errors are *only* in those files/around those exact symbols, not something unrelated (which would mean this step introduced an unintended break).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(city): add ProductionDropReason/DroppedProductionItem types, retire city:building-dropped event"
```

---

### Task 2: `processCity` — unify all five drop paths into `droppedProductionItems`

**Files:**
- Modify: `src/systems/city-system.ts:1711-1724` (interface), `src/systems/city-system.ts:1789-1948` (function body)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `ProductionDropReason`, `DroppedProductionItem` from `@/core/types` (Task 1).
- Produces: `CityProcessResult.droppedProductionItems: DroppedProductionItem[]` — consumed by Task 4.

This task replaces three fields with one array across the whole function in a single pass, because the type change is not separable from the four branches that populate it — you cannot compile with `droppedBuilding` removed while a branch still tries to write to it. All existing test assertions in `tests/systems/city-system.test.ts` referencing the three old fields must be rewritten in this same task, plus six new cases.

- [ ] **Step 1: Add the new import to `city-system.ts`**

Find line 1:
```ts
import type { City, Building, HexCoord, GameMap, UnitType, CivBonusEffect, TrainableUnitEntry, IdCounters, ResourceType } from '@/core/types';
```
Replace with:
```ts
import type { City, Building, HexCoord, GameMap, UnitType, CivBonusEffect, TrainableUnitEntry, IdCounters, ResourceType, DroppedProductionItem, ProductionDropReason } from '@/core/types';
```

- [ ] **Step 2: Replace the `CityProcessResult` interface**

Run: `grep -n "export interface CityProcessResult" src/systems/city-system.ts` to confirm the current line (should still be ~1711 after Step 1's single-line edit — line count unchanged).

Replace:
```ts
export interface CityProcessResult {
  city: City;
  grew: boolean;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
  idleGoldBonus: number;
  idleScienceBonus: number;
  /** The building id that was silently dequeued because the city is no longer coastal, or null. */
  droppedBuilding: string | null;
  /** The coastal-required unit type that was dequeued because the city is no longer coastal, or null. */
  droppedUnit: UnitType | null;
  /** Any production item dequeued because it is no longer available. */
  droppedProductionItem: string | null;
}
```
with:
```ts
export interface CityProcessResult {
  city: City;
  grew: boolean;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
  idleGoldBonus: number;
  idleScienceBonus: number;
  /** Every unit/building silently dequeued this turn, with why. Empty when nothing dropped. */
  droppedProductionItems: DroppedProductionItem[];
}
```

- [ ] **Step 3: Rewrite the existing test assertions to the new shape (red first)**

Open `tests/systems/city-system.test.ts`. Make these exact replacements (search for each snippet — they are unique in the file):

Replace (around line 416):
```ts
    expect(result.droppedProductionItem).toBe('musketeer');
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([{ itemId: 'musketeer', itemKind: 'unit', reason: 'no-longer-available' }]);
```

This is the exact save-compat case named in the Global Constraints / plan header deviation note: `musketeer` has `techRequired: 'black-powder'` and `obsoletedByTech: 'rifled-infantry'`, but this test's `completedTechs` is only `['tactics']` — neither `black-powder` nor `rifled-infantry` is present, and musketeer has no `resourceRequired` at all. So neither `obsoleted` nor `resource-lost` applies; this is the residual `'no-longer-available'` case Step 8 below implements.

Replace (around line 565):
```ts
    expect(result.droppedProductionItem).toBe('stable');
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([{ itemId: 'stable', itemKind: 'building', reason: 'obsoleted' }]);
```

Replace (around line 583):
```ts
    expect(result.droppedProductionItem).toBeNull();
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([]);
```

Replace (around line 615):
```ts
    expect(result.droppedBuilding).toBe('harbor');
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([{ itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost' }]);
```

Replace (around lines 635-636):
```ts
    expect(result.droppedUnit).toBe('transport');
    expect(result.droppedProductionItem).toBe('transport');
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([{ itemId: 'transport', itemKind: 'unit', reason: 'coastal-access-lost' }]);
```

Replace (around lines 654-655):
```ts
    expect(result.droppedUnit).toBe('stealth_bomber');
    expect(result.droppedProductionItem).toBe('stealth_bomber');
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([{ itemId: 'stealth_bomber', itemKind: 'unit', reason: 'training-building-missing' }]);
```

Replace (around line 673):
```ts
    expect(result.droppedUnit).toBeNull();
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([]);
```

Replace (around lines 683-684):
```ts
    expect(result.droppedProductionItem).toBe('swordsman');
    expect(result.droppedUnit).toBeNull();
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'resource-lost' }]);
```

Replace (around line 706):
```ts
    expect(result.droppedBuilding).toBeNull();
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([]);
```

Replace (around line 715):
```ts
    expect(result.droppedBuilding).toBeNull();
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([]);
```

Replace (around line 737, inside the `it.each(['frigate', 'destroyer'])` block):
```ts
      expect(result.droppedUnit).toBe(unitType);
```
with:
```ts
      expect(result.droppedProductionItems).toEqual([{ itemId: unitType, itemKind: 'unit', reason: 'coastal-access-lost' }]);
```

Replace (around line 970):
```ts
    expect(result.droppedBuilding).toBe('dock');
```
with:
```ts
    expect(result.droppedProductionItems).toEqual([{ itemId: 'dock', itemKind: 'building', reason: 'coastal-access-lost' }]);
```

- [ ] **Step 4: Add six new test cases in a new `describe` block**

The coastal-guard tests from Step 3 live inside `describe('processCity', () => { ... })`, which opens at line 531 and closes at line 857 — immediately followed by `describe('getSettlerProductionCost', ...)` at line 859. (An earlier draft of this plan said to append into "the block ending around line 972" — that line actually closes an unrelated `describe('MR6: 3d-printing production overflow', ...)` block further down the file; don't use it.)

Run: `grep -n "^describe('getSettlerProductionCost'" tests/systems/city-system.test.ts` to confirm the line number, then insert a brand-new `describe` block immediately **before** that line (i.e. right after the `processCity` describe block's closing `});`):

```ts
describe('processCity — droppedProductionItems (issue #457)', () => {
  it('drops a building whose required resource is no longer available (previously untracked)', () => {
    const map = generateMap(30, 30, 'building-resource-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['bronze-workshop'],
      productionProgress: 10,
    };

    const result = processCity(city, map, 2, 100, undefined, ['stone-weapons'], undefined, 1, new Set());

    expect(result.droppedProductionItems).toEqual([{ itemId: 'bronze-workshop', itemKind: 'building', reason: 'resource-lost' }]);
    expect(result.city.productionQueue).not.toContain('bronze-workshop');
  });

  it('does NOT drop a building whose required resource is still available (negative)', () => {
    const map = generateMap(30, 30, 'building-resource-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['bronze-workshop'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 1, undefined, ['stone-weapons'], undefined, 1, new Set(['copper']));

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('bronze-workshop');
  });

  it('drops a national-project building outside its build window (previously untracked)', () => {
    const map = generateMap(30, 30, 'np-window-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['sacred_grove'],
      productionProgress: 10,
    };

    // sacred_grove has nationalProject.homeEra: 1, so era 3 is outside homeEra..homeEra+1.
    const result = processCity(city, map, 2, 100, undefined, ['animism'], undefined, 3);

    expect(result.droppedProductionItems).toEqual([{ itemId: 'sacred_grove', itemKind: 'building', reason: 'build-window-expired' }]);
    expect(result.city.productionQueue).not.toContain('sacred_grove');
  });

  it('does NOT drop a national-project building still within its build window (negative)', () => {
    const map = generateMap(30, 30, 'np-window-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['sacred_grove'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 1, undefined, ['animism'], undefined, 2);

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('sacred_grove');
  });

  it('disambiguates unit obsoleted vs resource-lost, and prefers obsoleted on a tie', () => {
    const map = generateMap(30, 30, 'unit-reason-disambiguation-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;

    // resource-lost only: bronze-working completed (queueable), rifled-infantry NOT completed, no iron.
    const resourceLostCity = { ...foundCity('p1', landTile.coord, map, mkC()), productionQueue: ['swordsman'], productionProgress: 10 };
    const resourceLostResult = processCity(resourceLostCity, map, 2, 100, undefined, ['bronze-working'], undefined, 1, new Set());
    expect(resourceLostResult.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'resource-lost' }]);

    // obsoleted only: iron available, but rifled-infantry completed.
    const obsoletedCity = { ...foundCity('p1', landTile.coord, map, mkC()), productionQueue: ['swordsman'], productionProgress: 10 };
    const obsoletedResult = processCity(obsoletedCity, map, 2, 100, undefined, ['bronze-working', 'rifled-infantry'], undefined, 1, new Set(['iron']));
    expect(obsoletedResult.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'obsoleted' }]);

    // tie: both rifled-infantry completed AND iron unavailable — 'obsoleted' must win.
    const tieCity = { ...foundCity('p1', landTile.coord, map, mkC()), productionQueue: ['swordsman'], productionProgress: 10 };
    const tieResult = processCity(tieCity, map, 2, 100, undefined, ['bronze-working', 'rifled-infantry'], undefined, 1, new Set());
    expect(tieResult.droppedProductionItems).toEqual([{ itemId: 'swordsman', itemKind: 'unit', reason: 'obsoleted' }]);
  });

  it('records multiple drops in one turn: a building and a unit both dropped in the same coastal-guard pass', () => {
    const map = generateMap(30, 30, 'coastal-double-drop-test');
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = {
      ...foundCity('p1', inlandTile.coord, map, mkC()),
      productionQueue: ['harbor', 'transport'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 100, undefined, ['harbor-tech', 'galleys']);

    expect(result.droppedProductionItems).toEqual([
      { itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost' },
      { itemId: 'transport', itemKind: 'unit', reason: 'coastal-access-lost' },
    ]);
    expect(result.city.productionQueue).toEqual([]);
  });

  it('never reports a legendary-wonder queue item as dropped by any filter (negative)', () => {
    const map = generateMap(30, 30, 'legendary-item-exclusion-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      productionQueue: ['legendary:oracle-of-delphi'],
      productionProgress: 10,
    };

    // era 5, no completed techs, no resources, no buildings — every filter gets a chance to (wrongly) drop it.
    const result = processCity(city, map, 2, 100, undefined, [], undefined, 5, new Set());

    expect(result.droppedProductionItems).toEqual([]);
    expect(result.city.productionQueue).toContain('legendary:oracle-of-delphi');
  });
});
```

- [ ] **Step 5: Run the test file to confirm everything fails on the still-old implementation**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts 2>&1 | tail -60`
Expected: many failures — TypeScript errors (`Property 'droppedProductionItems' does not exist`) or assertion failures, since `processCity` hasn't been rewritten yet. This confirms the tests are wired to the right (not-yet-existing) shape.

- [ ] **Step 6: Rewrite the local variable declarations**

Find (inside `processCity`, right after `const newBuildings = [...city.buildings];`):
```ts
  let droppedBuilding: string | null = null;
  let droppedUnit: UnitType | null = null;
  let droppedProductionItem: string | null = null;
```
Replace with:
```ts
  const droppedProductionItems: DroppedProductionItem[] = [];
```

- [ ] **Step 7: Rewrite the tech/resource filter's building branch**

Find:
```ts
      if (BUILDING_IDS.has(item)) {
        const building = BUILDINGS[item];
        if (isBuildingObsolete(building, completedTechs)) {
          droppedProductionItem ??= item;
          return false;
        }
        if (building?.resourceRequired?.length && availableResources !== undefined) {
          if (!building.resourceRequired.every(r => availableResources!.has(r))) return false;
        }
        return true;
      }
```
Replace with:
```ts
      if (BUILDING_IDS.has(item)) {
        const building = BUILDINGS[item];
        if (isBuildingObsolete(building, completedTechs)) {
          droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'obsoleted' });
          return false;
        }
        if (building?.resourceRequired?.length && availableResources !== undefined) {
          if (!building.resourceRequired.every(r => availableResources!.has(r))) {
            droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'resource-lost' });
            return false;
          }
        }
        return true;
      }
```

- [ ] **Step 8: Rewrite the tech/resource filter's unit branch**

Find:
```ts
      const unit = TRAINABLE_UNITS.find(candidate => candidate.type === item);
      if (unit && !trainableTypes.has(unit.type)) {
        droppedProductionItem ??= unit.type;
        return false;
      }
      return trainableTypes.has(item as UnitType);
```
Replace with:
```ts
      const unit = TRAINABLE_UNITS.find(candidate => candidate.type === item);
      if (unit && !trainableTypes.has(unit.type)) {
        // Within one continuous session, a validly-queued unit's techRequired/civTypeRequired
        // can never later become false (completedTechs never shrinks; civType never changes) —
        // the only two dynamic reasons it can stop being trainable are obsoletedByTech firing or
        // a resource becoming unavailable. Check obsoleted first to match the building branch's
        // precedence above; both conditions can be true in the same turn (e.g. a tech completes
        // the same turn a resource is lost), so this order is the deterministic tie-breaker, not
        // a guess. A loaded save, however, can already hold a queue item that predates a
        // tech-tree rebalance — its techRequired can be unmet with neither of the two dynamic
        // reasons applying (see the musketeer save-compat test in Step 3) — so a third, honest
        // fallback reason covers that residual case instead of misreporting it as resource-lost.
        const obsoleted = unit.obsoletedByTech != null && completedTechs.includes(unit.obsoletedByTech);
        const resourceLost = (unit.resourceRequired?.length ?? 0) > 0
          && availableResources !== undefined
          && !unit.resourceRequired!.every(r => availableResources.has(r));
        const reason: ProductionDropReason = obsoleted
          ? 'obsoleted'
          : resourceLost
            ? 'resource-lost'
            : 'no-longer-available';
        droppedProductionItems.push({ itemId: unit.type, itemKind: 'unit', reason });
        return false;
      }
      return trainableTypes.has(item as UnitType);
```

- [ ] **Step 9: Rewrite the NP build-window filter**

Find:
```ts
  // Belt-and-suspenders: dequeue NPs outside their build window
  if (era > 1) {
    const beforeNP = newQueue.length;
    const filteredNP = newQueue.filter((item: string) => {
      const bldg = BUILDINGS[item];
      if (!bldg?.nationalProject) return true;
      return era >= bldg.nationalProject.homeEra && era <= bldg.nationalProject.homeEra + 1;
    });
    if (filteredNP.length !== beforeNP) {
      newQueue.length = 0;
      newQueue.push(...filteredNP);
      if (filteredNP.length === 0) newProgress = 0;
    }
  }
```
Replace with:
```ts
  // Belt-and-suspenders: dequeue NPs outside their build window
  if (era > 1) {
    const beforeNP = newQueue.length;
    const filteredNP = newQueue.filter((item: string) => {
      const bldg = BUILDINGS[item];
      if (!bldg?.nationalProject) return true;
      const inWindow = era >= bldg.nationalProject.homeEra && era <= bldg.nationalProject.homeEra + 1;
      if (!inWindow) {
        droppedProductionItems.push({ itemId: item, itemKind: 'building', reason: 'build-window-expired' });
      }
      return inWindow;
    });
    if (filteredNP.length !== beforeNP) {
      newQueue.length = 0;
      newQueue.push(...filteredNP);
      if (filteredNP.length === 0) newProgress = 0;
    }
  }
```

- [ ] **Step 10: Rewrite the coastal-guard section**

Find:
```ts
  if (newQueue.length > 0) {
    const headBuilding = BUILDINGS[newQueue[0]];
    if (headBuilding?.coastalRequired && !isCityCoastal(city, map)) {
      droppedBuilding = newQueue.shift()!;
      droppedProductionItem = droppedBuilding;
      newProgress = 0;
    }
    const headUnit = TRAINABLE_UNITS.find(unit => unit.type === newQueue[0]);
    if (headUnit?.coastalRequired && !isCityCoastal(city, map)) {
      droppedUnit = newQueue.shift() as UnitType;
      droppedProductionItem = droppedUnit;
      newProgress = 0;
    } else if (headUnit?.trainedFromBuilding && !(city.buildings ?? []).includes(headUnit.trainedFromBuilding)) {
      droppedUnit = newQueue.shift() as UnitType;
      droppedProductionItem = droppedUnit;
      newProgress = 0;
    }
  }
```
Replace with (note the shift-then-recheck order is preserved exactly — the unit check below intentionally re-reads `newQueue[0]` *after* the building shift, since both a building and a unit can legitimately drop in the same call):
```ts
  if (newQueue.length > 0) {
    const headBuilding = BUILDINGS[newQueue[0]];
    if (headBuilding?.coastalRequired && !isCityCoastal(city, map)) {
      const dropped = newQueue.shift()!;
      droppedProductionItems.push({ itemId: dropped, itemKind: 'building', reason: 'coastal-access-lost' });
      newProgress = 0;
    }
    const headUnit = TRAINABLE_UNITS.find(unit => unit.type === newQueue[0]);
    if (headUnit?.coastalRequired && !isCityCoastal(city, map)) {
      const dropped = newQueue.shift() as UnitType;
      droppedProductionItems.push({ itemId: dropped, itemKind: 'unit', reason: 'coastal-access-lost' });
      newProgress = 0;
    } else if (headUnit?.trainedFromBuilding && !(city.buildings ?? []).includes(headUnit.trainedFromBuilding)) {
      const dropped = newQueue.shift() as UnitType;
      droppedProductionItems.push({ itemId: dropped, itemKind: 'unit', reason: 'training-building-missing' });
      newProgress = 0;
    }
  }
```

- [ ] **Step 11: Rewrite the return statement**

Find:
```ts
  return {
    city: nextCity,
    grew,
    completedBuilding,
    completedUnit,
    idleGoldBonus,
    idleScienceBonus,
    droppedBuilding,
    droppedUnit,
    droppedProductionItem,
  };
```
Replace with:
```ts
  return {
    city: nextCity,
    grew,
    completedBuilding,
    completedUnit,
    idleGoldBonus,
    idleScienceBonus,
    droppedProductionItems,
  };
```

- [ ] **Step 12: Run the test file again**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts 2>&1 | tail -60`
Expected: all tests in this file PASS. If the `musketeer` test from Step 3 fails, re-check whether you used the strict or weak assertion form based on what the grep in that step showed — fix to match.

- [ ] **Step 13: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): unify silent production-drop tracking into droppedProductionItems"
```

---

### Task 3: `describeDroppedProductionItem` — message text

**Files:**
- Modify: `src/systems/city-system.ts` (add function near `getProductionDisplayName`, line ~1578)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `DroppedProductionItem`, `getProductionDisplayName(itemId: string): string` (both already available in this file after Task 2).
- Produces: `export function describeDroppedProductionItem(item: DroppedProductionItem, cityName: string): string` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `tests/systems/city-system.test.ts` (anywhere at the top level, e.g. right after the `foundCity` describe block):

```ts
describe('describeDroppedProductionItem', () => {
  it('describes an obsoleted building drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'stable', itemKind: 'building', reason: 'obsoleted' }, 'Rome'))
      .toBe("Stable removed from Rome's build queue — it's obsolete now that a newer technology is available.");
  });

  it('describes an obsoleted unit drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'swordsman', itemKind: 'unit', reason: 'obsoleted' }, 'Rome'))
      .toBe("Swordsman removed from Rome's build queue — it's obsolete now that a newer technology is available.");
  });

  it('describes a resource-lost building drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'bronze-workshop', itemKind: 'building', reason: 'resource-lost' }, 'Athens'))
      .toBe("Bronze Workshop removed from Athens's build queue — you no longer control the required resource.");
  });

  it('describes a resource-lost unit drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'swordsman', itemKind: 'unit', reason: 'resource-lost' }, 'Athens'))
      .toBe("Swordsman removed from Athens's build queue — you no longer control the required resource.");
  });

  it('describes a no-longer-available unit drop (save-compat residual case)', () => {
    expect(describeDroppedProductionItem({ itemId: 'musketeer', itemKind: 'unit', reason: 'no-longer-available' }, 'Byzantium'))
      .toBe("Musketeer removed from Byzantium's build queue — it's no longer available to train.");
  });

  it('describes a build-window-expired drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'sacred_grove', itemKind: 'building', reason: 'build-window-expired' }, 'Thebes'))
      .toBe("Sacred Grove removed from Thebes's build queue — its national-project build window has closed.");
  });

  it('describes a coastal-access-lost building drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost' }, 'Sparta'))
      .toBe("Harbor removed from Sparta's build queue — the city is no longer coastal.");
  });

  it('describes a coastal-access-lost unit drop', () => {
    expect(describeDroppedProductionItem({ itemId: 'transport', itemKind: 'unit', reason: 'coastal-access-lost' }, 'Sparta'))
      .toBe("Transport removed from Sparta's build queue — the city is no longer coastal.");
  });

  it('describes a training-building-missing drop, and the message does not mention coastal access', () => {
    const message = describeDroppedProductionItem({ itemId: 'stealth_bomber', itemKind: 'unit', reason: 'training-building-missing' }, 'Corinth');
    expect(message).toBe("Stealth Bomber removed from Corinth's build queue — Corinth no longer has the building required to train it.");
    expect(message.toLowerCase()).not.toContain('coast');
  });
});
```

Add `describeDroppedProductionItem` to the import list at the top of the test file:
```ts
import {
  foundCity,
  getAvailableBuildings,
  getTrainableUnitsForCity,
  isCityCoastal,
  getTrainableUnitsForCiv,
  getProductionCostForItem,
  processCity,
  completeCityProductionItem,
  BUILDINGS,
  CITY_NAMES,
  TRAINABLE_UNITS,
  PRODUCTION_ICONS,
  TERMINAL_COMBAT_UNITS,
  getCatalogProductionCost,
  getProductionDisplayName,
  getProductionIconForItem,
  getSettlerProductionCost,
  describeDroppedProductionItem,
} from '@/systems/city-system';
```

Confirm the display names used above match reality: run `grep -n "id: 'stealth_bomber'\|type: 'transport'\|type: 'swordsman'\|type: 'musketeer'" src/systems/city-system.ts` and check the `name:` field for each — if any differ from `Stealth Bomber`/`Transport`/`Swordsman`/`Musketeer`, fix the expected strings in the tests above to match the real `name` value rather than changing the source data.

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "describeDroppedProductionItem" 2>&1 | tail -30`
Expected: FAIL — `describeDroppedProductionItem is not a function` (or similar import error).

- [ ] **Step 3: Implement the function**

In `src/systems/city-system.ts`, find:
```ts
export function getProductionDisplayName(itemId: string): string {
  const legendaryName = getLegendaryWonderDisplayName(itemId);
  if (legendaryName) return legendaryName;

  const building = BUILDINGS[itemId];
  if (building) return building.name;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  return unit?.name ?? itemId;
}
```
Add immediately after it:
```ts

export function describeDroppedProductionItem(item: DroppedProductionItem, cityName: string): string {
  const name = getProductionDisplayName(item.itemId);
  switch (item.reason) {
    case 'obsoleted':
      return `${name} removed from ${cityName}'s build queue — it's obsolete now that a newer technology is available.`;
    case 'resource-lost':
      return `${name} removed from ${cityName}'s build queue — you no longer control the required resource.`;
    case 'no-longer-available':
      return `${name} removed from ${cityName}'s build queue — it's no longer available to train.`;
    case 'build-window-expired':
      return `${name} removed from ${cityName}'s build queue — its national-project build window has closed.`;
    case 'coastal-access-lost':
      return `${name} removed from ${cityName}'s build queue — the city is no longer coastal.`;
    case 'training-building-missing':
      return `${name} removed from ${cityName}'s build queue — ${cityName} no longer has the building required to train it.`;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "describeDroppedProductionItem" 2>&1 | tail -30`
Expected: all 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): add describeDroppedProductionItem message helper"
```

---

### Task 4: `turn-manager.ts` — emit `city:production-item-dropped` per dropped item

**Files:**
- Modify: `src/core/turn-manager.ts:284-292`
- Test: `tests/core/turn-manager.test.ts`

**Interfaces:**
- Consumes: `CityProcessResult.droppedProductionItems` (Task 2), `EventMap['city:production-item-dropped']` (Task 1).
- Produces: nothing new consumed by later tasks — this is the emit side; Task 5 is the listen side.

- [ ] **Step 1: Write the failing test**

Add to `tests/core/turn-manager.test.ts` (near the other `processTurn`+`EventBus` tests, e.g. after the "occupied-city" test around line 244):

```ts
  it('emits city:production-item-dropped once per dropped item, including a coastal double-drop in one call', () => {
    const state = createNewGame(undefined, 'turn-dropped-item', 'small');
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('city:production-item-dropped', listener);

    const inlandTile = Object.values(state.map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(state.map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = foundCity('player', inlandTile.coord, state.map, mkC());
    city.id = 'inland-city';
    city.productionQueue = ['harbor', 'transport'];
    city.productionProgress = 0;
    state.cities = { [city.id]: city };
    state.civilizations.player.cities = [city.id];
    state.civilizations.player.techState.completed.push('harbor-tech', 'galleys');

    processTurn(state, bus);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, {
      cityId: 'inland-city', itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost',
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      cityId: 'inland-city', itemId: 'transport', itemKind: 'unit', reason: 'coastal-access-lost',
    });
  });

  it('does not emit city:production-item-dropped when nothing drops (negative)', () => {
    const state = createNewGame(undefined, 'turn-no-drop', 'small');
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('city:production-item-dropped', listener);
    const city = foundCity('player', { q: 2, r: 2 }, state.map, mkC());
    city.id = 'capital';
    city.productionQueue = [];
    state.cities = { capital: city };
    state.civilizations.player.cities = ['capital'];

    processTurn(state, bus);

    expect(listener).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/turn-manager.test.ts -t "city:production-item-dropped" 2>&1 | tail -40`
Expected: FAIL — `listener` was never called (the old code still emits `city:building-dropped`/`notification:show`, not the new event), or a TypeScript error if `city:building-dropped`'s removal from `EventMap` (Task 1) hasn't been matched by this file's update yet.

- [ ] **Step 3: Replace the emit block**

In `src/core/turn-manager.ts`, find (around line 284):
```ts
      if (result.droppedBuilding) {
        bus.emit('city:building-dropped', { cityId, buildingId: result.droppedBuilding });
      }
      if (result.droppedUnit) {
        bus.emit('notification:show', {
          message: `${city.name} needs a coast to build ${result.droppedUnit}.`,
          type: 'warning',
        });
      }
```
Replace with:
```ts
      for (const item of result.droppedProductionItems) {
        bus.emit('city:production-item-dropped', {
          cityId,
          itemId: item.itemId,
          itemKind: item.itemKind,
          reason: item.reason,
        });
      }
```

- [ ] **Step 4: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/turn-manager.test.ts -t "city:production-item-dropped\|does not emit" 2>&1 | tail -40`
Expected: both new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/turn-manager.ts tests/core/turn-manager.test.ts
git commit -m "feat(turn-manager): emit city:production-item-dropped per dropped item"
```

---

### Task 5: `routeDroppedProductionItem` — notification router

**Files:**
- Modify: `src/ui/notification-routing.ts`
- Test: `tests/ui/notification-routing.test.ts`

**Interfaces:**
- Consumes: `describeDroppedProductionItem` (Task 3), `DroppedProductionItem`/`ProductionDropReason` (Task 1), existing `NotificationSink` type (already in this file).
- Produces: `export function routeDroppedProductionItem(state: GameState, event: { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason }, sink: NotificationSink): void` — consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/notification-routing.test.ts`, inside the `describe('notification routing', ...)` block (e.g. right after the `routeFirstContact` test):

```ts
  it('routes a dropped production item to the owning city civ, not the active player', () => {
    const state = makeState(); // currentPlayer: 'p3'; city c1 is owned by p1, named Thebes
    const { sink, calls } = makeSink();

    routeDroppedProductionItem(state, {
      cityId: 'c1', itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost',
    }, sink);

    expect(calls).toEqual([{
      civId: 'p1',
      message: "Harbor removed from Thebes's build queue — the city is no longer coastal.",
      type: 'warning',
      target: undefined,
    }]);
  });

  it('does not call the sink when the cityId no longer resolves to a city (negative)', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routeDroppedProductionItem(state, {
      cityId: 'does-not-exist', itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost',
    }, sink);

    expect(calls).toEqual([]);
  });
```

Add `routeDroppedProductionItem` to this file's import list from `@/ui/notification-routing`:
```ts
import {
  formatEconomyTreasuryStrainMessage,
  getNotificationTargetsForEvent,
  routeBarbarianSpawned,
  routeCombatRewardEarned,
  routeCombatResolved,
  routeDroppedProductionItem,
  routeEconomyTreasuryStrain,
  queueFirstContactPendingEvents,
  routeLegendaryWonder,
  routeFactionTransition,
  routeFirstContact,
  routePeaceMade,
  routePeaceRequested,
  routeWarDeclared,
  queueStrategicWarningPendingEvent,
  routeStrategicWarning,
  type NotificationSink,
} from '@/ui/notification-routing';
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/notification-routing.test.ts -t "dropped production item" 2>&1 | tail -30`
Expected: FAIL — import error (`routeDroppedProductionItem` doesn't exist yet).

- [ ] **Step 3: Implement the router function**

In `src/ui/notification-routing.ts`, find:
```ts
export function routeFirstContact(
  state: GameState,
  civA: string,
  civB: string,
  sink: NotificationSink,
): void {
  const aName = state.civilizations[civA]?.name ?? civA;
  const bName = state.civilizations[civB]?.name ?? civB;
  sink(civA, `You have encountered ${bName}.`, 'info');
  sink(civB, `You have encountered ${aName}.`, 'info');
}
```
Add immediately after it:
```ts

export function routeDroppedProductionItem(
  state: GameState,
  event: { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason },
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const message = describeDroppedProductionItem(
    { itemId: event.itemId, itemKind: event.itemKind, reason: event.reason },
    city.name,
  );
  sink(city.owner, message, 'warning');
}
```

Add the two new imports at the top of `src/ui/notification-routing.ts` (find the existing import block and extend it — do not create a second import from the same module).

Run: `grep -n "^import type { CombatResult" src/ui/notification-routing.ts`
Expected: `1:import type { CombatResult, CombatRewardNotification, GameEvents, GameState } from '@/core/types';` — note `GameEvents` is already part of this import; don't drop it.

Replace line 1:
```ts
import type { CombatResult, CombatRewardNotification, GameEvents, GameState } from '@/core/types';
```
with:
```ts
import type { CombatResult, CombatRewardNotification, GameEvents, GameState, ProductionDropReason } from '@/core/types';
```
And find (there is no existing import from `@/systems/city-system` in this file — this adds a new one, not a duplicate):
```ts
import { getLegendaryWonderNotification } from '@/ui/legendary-wonder-notifications';
```
Add immediately after it:
```ts
import { describeDroppedProductionItem } from '@/systems/city-system';
```

- [ ] **Step 4: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/notification-routing.test.ts -t "dropped production item" 2>&1 | tail -30`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/notification-routing.ts tests/ui/notification-routing.test.ts
git commit -m "feat(notifications): add routeDroppedProductionItem router"
```

---

### Task 6: `main.ts` — wire the new listener, remove the old one

**Files:**
- Modify: `src/main.ts` (import block ~line 202-219, listener ~line 3664)

**Interfaces:**
- Consumes: `routeDroppedProductionItem` (Task 5), `appendToCivLog` (already defined in `main.ts`), `bus` (already in scope in `main.ts`).

This task has no new unit test of its own — it is thin wiring already covered end-to-end by Task 4's `turn-manager.test.ts` tests (which prove the event fires correctly) and Task 5's `notification-routing.test.ts` tests (which prove the router produces the right sink call). Verification here is the full build/typecheck plus a manual smoke check in Task 7.

- [ ] **Step 1: Add the import**

In `src/main.ts`, find:
```ts
import {
  formatEconomyTreasuryStrainMessage,
  routeBarbarianSpawned,
  routeCombatRewardEarned,
  routeEconomyTreasuryStrain,
  routeEraAdvanced,
  routeFactionTransition,
  queueFirstContactPendingEvents,
  routeFirstContact,
  routeLegendaryWonder,
  routePeaceMade,
  routePeaceRequested,
  routeTerritoryTileFlipped,
  routeWarDeclared,
  queueStrategicWarningPendingEvent,
  routeStrategicWarning,
  type NotificationSink,
} from '@/ui/notification-routing';
```
Replace with:
```ts
import {
  formatEconomyTreasuryStrainMessage,
  routeBarbarianSpawned,
  routeCombatRewardEarned,
  routeDroppedProductionItem,
  routeEconomyTreasuryStrain,
  routeEraAdvanced,
  routeFactionTransition,
  queueFirstContactPendingEvents,
  routeFirstContact,
  routeLegendaryWonder,
  routePeaceMade,
  routePeaceRequested,
  routeTerritoryTileFlipped,
  routeWarDeclared,
  queueStrategicWarningPendingEvent,
  routeStrategicWarning,
  type NotificationSink,
} from '@/ui/notification-routing';
```

- [ ] **Step 2: Replace the old listener**

Run: `grep -n "bus.on('city:building-dropped'" src/main.ts`

Find the block (should be the one at ~line 3664):
```ts
bus.on('city:building-dropped', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  const buildingName = BUILDINGS[buildingId]?.name ?? buildingId;
  appendToCivLog(
    city.owner,
    `${city.name}: ${buildingName} removed — city is no longer coastal.`,
    'warning',
  );
});
```
Replace with:
```ts
bus.on('city:production-item-dropped', event => routeDroppedProductionItem(gameState, event, appendToCivLog));
```

- [ ] **Step 3: Full build to catch any remaining reference to the deleted fields/events**

Run: `bash scripts/run-with-mise.sh yarn build 2>&1 | tail -60`
Expected: exits 0. If there are still errors, they mean some file referencing `droppedBuilding`/`droppedUnit`/`droppedProductionItem`/`city:building-dropped` was missed — re-run `grep -rn "droppedBuilding\|droppedUnit\b\|droppedProductionItem\b\|city:building-dropped" src tests --include="*.ts"` and fix any hit not accounted for in Tasks 1-6 above.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): wire city:production-item-dropped through routeDroppedProductionItem"
```

---

### Task 7: Full verification and cleanup

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test 2>&1 | tail -60`
Expected: all test files pass, including the shell hook smoke tests at the end. If `tests/systems/city-system.test.ts` fails anywhere outside what Task 2 touched, investigate — a passing full suite before this task with only this feature's files changed means any new failure is a regression from this plan, not a pre-existing issue.

- [ ] **Step 2: Run the full build**

Run: `bash scripts/run-with-mise.sh yarn build 2>&1 | tail -40`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Grep for any leftover dead references**

Run: `grep -rn "droppedBuilding\|droppedUnit\b\|droppedProductionItem\b" src tests --include="*.ts"`
Expected: no output. (`droppedProductionItems` — plural, the new field — will not match this pattern since it has no word boundary before `s`; if it accidentally does match your grep flavor, confirm every hit is the new plural field name, not a leftover singular one.)

Run: `grep -rn "'city:building-dropped'\|notification:show'," src/core/turn-manager.ts src/main.ts`
Expected: no output in `turn-manager.ts` or `main.ts` (the `notification:show` *type declaration* still exists in `src/core/types.ts` and the emit call in `unit-movement-system.ts` is untouched by design — see the spec's "Out of scope" section).

- [ ] **Step 4: Manual smoke check (optional but recommended given this is player-facing feedback)**

This change is playable-behavior-visible (a new toast/log message appears when production silently drops), but reliably triggering one of the five drop conditions from a fresh game requires many turns of play (researching an obsoleting tech, losing a resource tile, etc.) — not practical to script in a quick manual pass. The automated coverage in Tasks 2-5 (unit tests hitting `processCity` directly, an integration test hitting the full `processTurn` pipeline, and router tests) is the real verification for this change; skip a live `yarn dev` playthrough unless you want to additionally confirm the toast visually renders and the persistent notification log entry appears correctly formatted (open the notification log panel in the running game after triggering any drop).

- [ ] **Step 5: Final review of the diff**

Run: `git log --oneline main..HEAD` (or the appropriate base branch) to confirm one commit per task, then `git diff main...HEAD --stat` to confirm only the expected files changed:
- `src/core/types.ts`
- `src/systems/city-system.ts`
- `src/core/turn-manager.ts`
- `src/ui/notification-routing.ts`
- `src/main.ts`
- `tests/systems/city-system.test.ts`
- `tests/core/turn-manager.test.ts`
- `tests/ui/notification-routing.test.ts`
- `docs/superpowers/specs/2026-07-07-issue-457-dropped-production-feedback-design.md` (already committed during brainstorming)
- `docs/superpowers/plans/2026-07-07-issue-457-dropped-production-feedback.md` (this file)
