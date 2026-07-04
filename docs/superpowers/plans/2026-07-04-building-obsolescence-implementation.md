# Building Obsolescence (#443) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project override:** this repo's `CLAUDE.md` forbids subagents/parallel agents. Execute this plan with `superpowers:executing-plans` inline in the current session, not `subagent-driven-development`.

**Goal:** Give `stable`, `cavalry-academy`, and `siege-workshop` an `obsoletedByTech` field so they disappear from the build queue, silently dequeue if already queued, drop to zero upkeep, and show an "(obsolete)" badge once their linked unit line fully retires — mirroring #429's unit-obsolescence behavior exactly, with no demolish mechanic.

**Architecture:** One new optional field on `Building` (`src/core/types.ts`), consumed at 4 existing touch points: `getAvailableBuildings` (queue filter), `processCity`'s dequeue block (silent drop), `calculateCityBuildingMaintenance` (upkeep exemption via a new `'obsolete'` `MaintenanceReason`), and `createCityPanel`'s built-buildings render loop (badge + upkeep row text). No new files, no new systems, no AI changes (AI already only acts on `getAvailableBuildings`'s output).

**Tech Stack:** TypeScript, Vitest. No UI framework — `city-panel.ts` builds an HTML string template.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-07-04-building-obsolescence-design.md` — do not deviate from its scope (queue availability + upkeep + UI badge; no demolish mechanic; cosmetic only, not a mechanical fix).
- Exactly 3 buildings get `obsoletedByTech`: `stable` → `tank-warfare`, `cavalry-academy` → `tank-warfare`, `siege-workshop` → `black-powder`. `armory`, `war-academy`, `safehouse`, `artillery_corps_hq` must NOT get the field (see spec's exclusion table).
- `calculateCityBuildingMaintenance` must resolve the owning civ via `city.owner`, never `state.currentPlayer` (this function runs for AI cities too).
- `game-balance.md`: not applicable to this feature (no yields added), but do not touch any wonder/national-project ceiling while in these files.
- Every step below shows real code — no "add tests for the above" placeholders.

---

### Task 1: `Building.obsoletedByTech` field + assign to the 3 candidate buildings

**Files:**
- Modify: `src/core/types.ts` (`Building` interface, ~line 393-409)
- Modify: `src/systems/city-system.ts` (`stable` at line 65, `cavalry-academy` at line 131-140, `siege-workshop` at line 173-182)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Produces: `Building.obsoletedByTech?: string` — consumed by Tasks 2, 6, 7 (`getAvailableBuildings`, `processCity`, `calculateCityBuildingMaintenance`) and Task 8 (`city-panel.ts`).

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/city-system.test.ts` (new `describe` block, anywhere after the existing `describe('getAvailableBuildings', ...)` block):

```typescript
describe('#443 — building obsolescence data', () => {
  it('stable obsoletes at tank-warfare (mounted-unit line fully retires there)', () => {
    expect(BUILDINGS.stable.obsoletedByTech).toBe('tank-warfare');
  });

  it('cavalry-academy obsoletes at tank-warfare (same mounted-unit line)', () => {
    expect(BUILDINGS['cavalry-academy'].obsoletedByTech).toBe('tank-warfare');
  });

  it('siege-workshop obsoletes at black-powder (catapult/ballista line fully retires there)', () => {
    expect(BUILDINGS['siege-workshop'].obsoletedByTech).toBe('black-powder');
  });

  it('armory, war-academy, safehouse, artillery_corps_hq do NOT get obsoletedByTech (melee/ranged/spy categories never fully empty; artillery_corps_hq already has its own national-project fade lifecycle)', () => {
    expect(BUILDINGS.armory.obsoletedByTech).toBeUndefined();
    expect(BUILDINGS['war-academy'].obsoletedByTech).toBeUndefined();
    expect(BUILDINGS.safehouse.obsoletedByTech).toBeUndefined();
    expect(BUILDINGS.artillery_corps_hq.obsoletedByTech).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "building obsolescence data"`
Expected: FAIL — `obsoletedByTech` is `undefined` for `stable`/`cavalry-academy`/`siege-workshop` (property doesn't exist on the type or data yet; the `toBeUndefined()` assertions on the 4 excluded buildings already pass since the field doesn't exist anywhere yet, but the first 3 fail).

- [ ] **Step 3: Add the field to the type**

In `src/core/types.ts`, in the `Building` interface:

```typescript
export interface Building {
  id: string;
  name: string;
  category?: BuildingCategory;
  yields: ResourceYield;
  productionCost: number;
  description: string;
  techRequired?: string | null;
  coastalRequired?: boolean;
  pacing?: PacingMetadata;
  resourceRequired?: ResourceType[];
  routeCapacity?: number;   // trade route slots added to the FROM city; 0 or absent = none
  requiresBuildings?: string[];   // chain of building IDs that must be built first
  uniquePerEmpire?: true;         // only one instance per civ (used by national projects)
  nationalProject?: NationalProject;  // present when this building is a national project
  civYieldBonus?: Partial<ResourceYield>;  // empire-wide yield bonus while active
  obsoletedByTech?: string;  // once this tech completes, building is hidden from queue, silently dequeued, upkeep-free
}
```

- [ ] **Step 4: Set the field on the 3 buildings**

In `src/systems/city-system.ts`, edit the 3 definitions in place (do not reformat surrounding entries):

```typescript
  stable: { id: 'stable', name: 'Stable', category: 'military', yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 55, description: 'Trains mounted units', techRequired: 'horseback-riding', obsoletedByTech: 'tank-warfare' },
```

```typescript
  'cavalry-academy': {
    id: 'cavalry-academy', name: 'Cavalry Academy', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 55,
    description: 'Mounted warfare school. Reduces cavalry unit training cost by 15% in this city.',
    techRequired: 'horseback-riding',
    resourceRequired: ['horses'],
    obsoletedByTech: 'tank-warfare',
    pacing: { band: 'power-spike', role: 'cavalry-cost-reduction', impact: 1.15, scope: 'city', snowball: 1, urgency: 1, situationality: 1.15, unlockBreadth: 1 },
  },
```

```typescript
  'siege-workshop': {
    id: 'siege-workshop', name: 'Siege Workshop', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 90,
    description: 'Siege engine fabrication. Reduces Catapult and Ballista training cost by 20% in this city.',
    techRequired: 'siege-warfare',
    resourceRequired: ['stone'],
    obsoletedByTech: 'black-powder',
    pacing: { band: 'infrastructure', role: 'siege-cost-reduction', impact: 1.2, scope: 'city', snowball: 1, urgency: 1, situationality: 1.2, unlockBreadth: 1 },
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "building obsolescence data"`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(buildings): add obsoletedByTech to stable, cavalry-academy, siege-workshop (#443)"
```

---

### Task 2: Queue availability — `getAvailableBuildings` filters obsolete buildings

**Files:**
- Modify: `src/systems/city-system.ts`, `getAvailableBuildings` (currently lines 1529-1556)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `Building.obsoletedByTech` (Task 1), `completedTechs: string[]` (already a parameter of `getAvailableBuildings`).

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('getAvailableBuildings', ...)` block in `tests/systems/city-system.test.ts`:

```typescript
  it('offers stable and cavalry-academy before tank-warfare completes', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['horseback-riding'], map);
    expect(available.find(b => b.id === 'stable')).toBeDefined();
    expect(available.find(b => b.id === 'cavalry-academy')).toBeDefined();
  });

  it('hides stable and cavalry-academy once tank-warfare completes', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['horseback-riding', 'tank-warfare'], map);
    expect(available.find(b => b.id === 'stable')).toBeUndefined();
    expect(available.find(b => b.id === 'cavalry-academy')).toBeUndefined();
  });

  it('hides siege-workshop once black-powder completes', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['siege-warfare', 'black-powder'], map);
    expect(available.find(b => b.id === 'siege-workshop')).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "tank-warfare completes"`
Expected: FAIL — the "hides" tests fail because `getAvailableBuildings` does not yet check `obsoletedByTech`, so `stable`/`cavalry-academy`/`siege-workshop` are still returned.

- [ ] **Step 3: Implement the filter**

In `src/systems/city-system.ts`, add one condition inside `getAvailableBuildings`'s filter callback:

```typescript
export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  map: GameMap,
  availableResources?: Set<ResourceType>,
  era?: number,
  builtNationalProjectKeys?: Set<string>,
  civId?: string,
): Building[] {
  const coastal = isCityCoastal(city, map);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.techRequired && !completedTechs.includes(b.techRequired)) return false;
    if (b.obsoletedByTech && completedTechs.includes(b.obsoletedByTech)) return false;
    if (b.coastalRequired && !coastal) return false;
    if (availableResources !== undefined && b.resourceRequired?.length) {
      if (!b.resourceRequired.every(r => availableResources.has(r))) return false;
    }
    if (b.requiresBuildings?.length) {
      if (!b.requiresBuildings.every((req: string) => city.buildings.includes(req))) return false;
    }
    if (b.nationalProject) {
      const currentEra = era ?? 1;
      if (currentEra < b.nationalProject.homeEra || currentEra > b.nationalProject.homeEra + 1) return false;
      if (b.uniquePerEmpire && civId && builtNationalProjectKeys?.has(`${civId}:${b.id}`)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "getAvailableBuildings"`
Expected: PASS (all `getAvailableBuildings` tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(buildings): hide obsoleted buildings from the production queue (#443)"
```

---

### Task 3: Data-integrity test — `obsoletedByTech` genuinely matches the retired unit line

**Files:**
- Test only: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `getTrainableUnitsForCiv` (existing export), `Building.obsoletedByTech` (Task 1).

This proves the 3 `obsoletedByTech` values are semantically correct (the units the description names are actually gone at that tech state), not a copy-paste guess — per the spec's testing-strategy item 2. No production code changes in this task.

- [ ] **Step 1: Write the test**

Add a new `describe` block to `tests/systems/city-system.test.ts`:

```typescript
describe('#443 — building obsolescence matches the retired unit line', () => {
  it('stable ("Trains mounted units"): horseman/cavalry/knight are all gone once tank-warfare completes', () => {
    const units = getTrainableUnitsForCiv(
      ['horseback-riding', 'iron-forging', 'tank-warfare'],
      undefined,
      new Set<ResourceType>(['horses', 'iron']),
    );
    expect(units.some(u => u.type === 'horseman')).toBe(false);
    expect(units.some(u => u.type === 'cavalry')).toBe(false);
    expect(units.some(u => u.type === 'knight')).toBe(false);
  });

  it('siege-workshop ("Reduces Catapult and Ballista training cost"): both gone once black-powder completes', () => {
    const units = getTrainableUnitsForCiv(
      ['siege-warfare', 'black-powder'],
      undefined,
      new Set<ResourceType>(['stone', 'iron']),
    );
    expect(units.some(u => u.type === 'catapult')).toBe(false);
    expect(units.some(u => u.type === 'ballista')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "matches the retired unit line"`
Expected: This should already PASS if #429's unit `obsoletedByTech` chains are intact (Task 5's earlier verification confirmed `horseman`/`cavalry`/`knight` → `tank-warfare` and `catapult`/`ballista` → `black-powder` on `main`). If it fails, that means #429's unit data has regressed since this plan was written — stop and re-verify before continuing; do not adjust this test to match a regression.

- [ ] **Step 3: Confirm passing (no implementation step — this task locks in an existing invariant)**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "#443"`
Expected: PASS (all `#443` tests written so far)

- [ ] **Step 4: Commit**

```bash
git add tests/systems/city-system.test.ts
git commit -m "test(buildings): lock in that obsoletedByTech matches the retired unit line (#443)"
```

---

### Task 4: Negative regression — excluded buildings never obsolete, even with every tech completed

**Files:**
- Test only: `tests/systems/city-system.test.ts` (add `TECH_TREE` import from `@/systems/tech-definitions`)

**Interfaces:**
- Consumes: `TECH_TREE: Tech[]` from `@/systems/tech-definitions` (existing export, full merged tech roster across all eras), `getAvailableBuildings` (Task 2).

- [ ] **Step 1: Write the failing-if-regressed test**

Add `import { TECH_TREE } from '@/systems/tech-definitions';` to the top of `tests/systems/city-system.test.ts` alongside the other imports, then add:

```typescript
describe('#443 — excluded buildings never obsolete (negative regression)', () => {
  it('armory, war-academy, safehouse remain available even with every tech in the game completed', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map, mkC());
    const allTechs = TECH_TREE.map(t => t.id);
    const available = getAvailableBuildings(city, allTechs, map, new Set<ResourceType>(['copper', 'iron', 'horses', 'stone']));
    expect(available.find(b => b.id === 'armory')).toBeDefined();
    expect(available.find(b => b.id === 'war-academy')).toBeDefined();
    expect(available.find(b => b.id === 'safehouse')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes as-is**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "excluded buildings never obsolete"`
Expected: PASS immediately — Task 1 never assigned `obsoletedByTech` to these 3 buildings, so this is a regression guard, not a red/green cycle. (If it fails, a later change accidentally added `obsoletedByTech` to one of these — fix that regression before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add tests/systems/city-system.test.ts
git commit -m "test(buildings): guard armory/war-academy/safehouse against accidental obsoletedByTech (#443)"
```

---

### Task 5: Soft-lock guard — no `requiresBuildings` chain depends on the 3 obsoleting buildings

**Files:**
- Test only: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `BUILDINGS: Record<string, Building>` (existing export).

Locks in the precondition the spec's soft-lock-risk section relies on: hiding `stable`/`cavalry-academy`/`siege-workshop` from the queue is only safe because no other building's `requiresBuildings` names them as a prerequisite. If a future building addition violates this, this test fails loudly instead of silently creating a dead-end city.

- [ ] **Step 1: Write the test**

```typescript
describe('#443 — soft-lock guard', () => {
  it('no Building.requiresBuildings chain references stable, cavalry-academy, or siege-workshop as a prerequisite', () => {
    const obsoletableIds = new Set(['stable', 'cavalry-academy', 'siege-workshop']);
    const offenders: string[] = [];
    for (const b of Object.values(BUILDINGS)) {
      if (!b.requiresBuildings?.length) continue;
      for (const req of b.requiresBuildings) {
        if (obsoletableIds.has(req)) offenders.push(`${b.id} requires ${req}`);
      }
    }
    expect(offenders, `hiding an obsoleted building from the queue would permanently block: ${offenders.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "soft-lock guard"`
Expected: PASS — confirmed in the plan's pre-work (grep of `requiresBuildings` on current `main` only shows `herbalist`, `semiconductor_fab`, `cyber_defense_center`, `factory` as prerequisites).

- [ ] **Step 3: Commit**

```bash
git add tests/systems/city-system.test.ts
git commit -m "test(buildings): guard against future requiresBuildings chains on obsoletable buildings (#443)"
```

---

### Task 6: Dequeue already-queued obsolete buildings — `processCity`

**Files:**
- Modify: `src/systems/city-system.ts`, inside `processCity`'s drop-queued-items block (currently lines 1655-1679; the building branch is `if (BUILDING_IDS.has(item)) { ... }` at line 1662)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `Building.obsoletedByTech` (Task 1), `completedTechs` (already a `processCity` parameter).
- Produces: `CityProcessResult.droppedProductionItem` populated with the building id when dropped for this reason (field already exists on the type; this task is the first building-side writer of it for the tech-loss case).

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('processCity', ...)` block in `tests/systems/city-system.test.ts`:

```typescript
  it('processCity silently dequeues a not-yet-built stable once tank-warfare completes, and reports droppedProductionItem', () => {
    const map = generateMap(30, 30, 'obsolete-building-drop-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: [],
      productionQueue: ['stable'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 100, undefined, ['horseback-riding', 'tank-warfare']);

    expect(result.droppedProductionItem).toBe('stable');
    expect(result.city.productionQueue).not.toContain('stable');
    expect(result.completedBuilding).toBeNull();
    expect(result.city.productionProgress).toBe(0);
  });

  it('processCity does NOT dequeue a queued stable when tank-warfare has not completed', () => {
    const map = generateMap(30, 30, 'obsolete-building-keep-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland' || t.terrain === 'plains')!;
    const city = {
      ...foundCity('p1', landTile.coord, map, mkC()),
      buildings: [],
      productionQueue: ['stable'],
      productionProgress: 0,
    };

    const result = processCity(city, map, 2, 1, undefined, ['horseback-riding']);

    expect(result.droppedProductionItem).toBeNull();
    expect(result.city.productionQueue).toContain('stable');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "dequeues a not-yet-built stable"`
Expected: FAIL — `droppedProductionItem` is `null` and `stable` is still in the queue, because the `BUILDING_IDS.has(item)` branch does not yet check `obsoletedByTech`.

- [ ] **Step 3: Implement the dequeue check**

In `src/systems/city-system.ts`, inside `processCity`, extend the `BUILDING_IDS.has(item)` branch (the surrounding `filtered = newQueue.filter(item => { ... })` block stays otherwise unchanged):

```typescript
      if (BUILDING_IDS.has(item)) {
        const building = BUILDINGS[item];
        if (building?.obsoletedByTech && completedTechs.includes(building.obsoletedByTech)) {
          droppedProductionItem ??= item;
          return false;
        }
        if (building?.resourceRequired?.length && availableResources !== undefined) {
          if (!building.resourceRequired.every(r => availableResources!.has(r))) return false;
        }
        return true;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts -t "processCity"`
Expected: PASS (all `processCity` tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(buildings): silently dequeue obsoleted buildings still in production (#443)"
```

---

### Task 7: Upkeep exemption — `'obsolete'` `MaintenanceReason` + `calculateCityBuildingMaintenance`

**Files:**
- Modify: `src/systems/economy-system.ts` — `MaintenanceReason` type (currently line 131) and the per-building loop inside `calculateCityBuildingMaintenance` (currently lines 329-341, inside the function starting at line 318)
- Test: `tests/systems/economy-system.test.ts`

**Interfaces:**
- Consumes: `Building.obsoletedByTech` (Task 1), `state.civilizations[city.owner].techState.completed` (existing state shape).
- Produces: `MaintenanceRow.reason` can now be `'obsolete'`, consumed by Task 8 (`city-panel.ts`).

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('economy maintenance', ...)` block in `tests/systems/economy-system.test.ts`:

```typescript
  it('exempts an obsolete building from upkeep with reason "obsolete" (#443)', () => {
    const state = makeState();
    city(state).buildings = ['cavalry-academy'];
    state.civilizations.player.techState.completed.push('tank-warfare');

    const breakdown = calculateCityBuildingMaintenance(state, 'capital');
    const row = breakdown.rows.find(r => r.id === 'cavalry-academy');

    expect(row?.upkeep).toBe(0);
    expect(row?.reason).toBe('obsolete');
  });

  it('charges normal upkeep for cavalry-academy before tank-warfare completes', () => {
    const state = makeState();
    city(state).buildings = ['cavalry-academy'];

    const breakdown = calculateCityBuildingMaintenance(state, 'capital');
    const row = breakdown.rows.find(r => r.id === 'cavalry-academy');

    expect(row?.reason).not.toBe('obsolete');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/economy-system.test.ts -t "obsolete"`
Expected: FAIL — `row?.reason` is `'free-support'` or `'paid'` (never `'obsolete'`, since that value doesn't exist yet) for the first test.

- [ ] **Step 3: Add the `'obsolete'` reason to the type**

In `src/systems/economy-system.ts`:

```typescript
export type MaintenanceReason = 'exempt' | 'free-support' | 'free-defender' | 'paid' | 'obsolete';
```

- [ ] **Step 4: Implement the exemption in the per-building loop**

In `src/systems/economy-system.ts`, inside `calculateCityBuildingMaintenance` (the function starting at `export function calculateCityBuildingMaintenance(state: GameState, cityOrId: City | string): CityBuildingMaintenance {`), replace the per-building loop:

```typescript
  const freeSupport = getFreeBuildingSlots(city);
  const exemptBuildings: MaintenanceRow[] = [];
  const candidates: MaintenanceRow[] = [];
  const owner = state.civilizations[city.owner];

  for (const buildingId of city.buildings) {
    if (!BUILDINGS[buildingId]) continue;
    if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) {
      exemptBuildings.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: 0, reason: 'exempt' });
      continue;
    }
    const building = BUILDINGS[buildingId];
    if (building?.obsoletedByTech && owner?.techState.completed.includes(building.obsoletedByTech)) {
      exemptBuildings.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: 0, reason: 'obsolete' });
      continue;
    }
    candidates.push({
      id: buildingId,
      label: getBuildingLabel(buildingId),
      upkeep: getBuildingUpkeep(buildingId),
      reason: 'paid',
    });
  }
```

(Only the loop body changes — `candidates.sort(...)` and everything after it in the function is unchanged. `owner` uses `city.owner`, never `state.currentPlayer`, so this stays correct for AI-owned cities.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/economy-system.test.ts -t "economy maintenance"`
Expected: PASS (all tests in the `describe('economy maintenance', ...)` block, including the 2 new ones)

- [ ] **Step 6: Run the full economy + city-system suites to check for exhaustiveness regressions**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/economy-system.test.ts tests/systems/city-system.test.ts`
Expected: PASS — the spec's regression-safety check confirmed no exhaustive switch elsewhere consumes `MaintenanceReason`, but this step verifies nothing in these two suites broke.

- [ ] **Step 7: Commit**

```bash
git add src/systems/economy-system.ts tests/systems/economy-system.test.ts
git commit -m "feat(economy): exempt obsolete buildings from upkeep via new MaintenanceReason (#443)"
```

---

### Task 8: City panel UI — obsolete badge + upkeep row text

**Files:**
- Modify: `src/ui/city-panel.ts` — the built-buildings render loop (currently lines 231-253, inside `createCityPanel`)
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `Building.obsoletedByTech` (Task 1), `state.civilizations[city.owner].techState.completed` (existing), `cityMaintenance.rows` with `reason: 'obsolete'` (Task 7, already computed at line 201 via `calculateCityBuildingMaintenance(state, city)`).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `tests/ui/city-panel.test.ts` (after the existing `describe('city-panel unrest section — #436', ...)` block, using the same `makeWonderPanelFixture()`/`collectText()` pattern already imported at the top of the file):

```typescript
describe('city-panel obsolete-building badge — #443', () => {
  it('shows the obsolete badge and "Obsolete — no upkeep" text for a built, now-obsolete building', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['cavalry-academy'];
    state.civilizations[state.currentPlayer].techState.completed.push('tank-warfare');

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('obsolete');
    expect(rendered).toContain('Obsolete — no upkeep');
  });

  it('shows neither the obsolete badge nor "Obsolete — no upkeep" for a still-relevant building', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['cavalry-academy'];
    // tank-warfare NOT completed — cavalry-academy is still relevant

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).not.toContain('obsolete');
    expect(rendered).not.toContain('Obsolete — no upkeep');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts -t "obsolete-building badge"`
Expected: FAIL — the first test fails because neither the badge nor the upkeep text exists yet.

- [ ] **Step 3: Implement the badge and upkeep row text**

In `src/ui/city-panel.ts`, inside the built-buildings render loop (the `for (let idx = 0; idx < city.buildings.length; idx++) { ... }` block), replace the body:

```typescript
  let buildingPlaceholders = '';
  for (let idx = 0; idx < city.buildings.length; idx++) {
    const bid = city.buildings[idx];
    const b = BUILDINGS[bid];
    if (b) {
      const row = cityMaintenance.rows.find(r => r.id === bid);
      const upkeep = row?.upkeep ?? 0;
      let fadingBadge = '';
      if (b.nationalProject && b.uniquePerEmpire) {
        const record = state.builtNationalProjects?.[`${city.owner}:${bid}`];
        if (record) {
          const multiplier = getNationalProjectMultiplier(state.era, record.eraBuilt);
          if (multiplier === 0.5) {
            fadingBadge = ' <span style="color:#f0c040;font-size:10px;" title="This institution is losing relevance and will expire next era.">⏳ (fading)</span>';
          }
        }
      }
      let obsoleteBadge = '';
      if (b.obsoletedByTech && state.civilizations[city.owner]?.techState.completed.includes(b.obsoletedByTech)) {
        obsoleteBadge = ' <span style="color:#e88;font-size:10px;" title="This building\'s purpose no longer applies — later technology has moved past it. No upkeep cost, but no effect either.">⚠️ (obsolete)</span>';
      }
      const upkeepText = row?.reason === 'obsolete'
        ? 'Obsolete — no upkeep'
        : upkeep > 0
          ? `Upkeep: -${upkeep} gold/turn`
          : 'Free support';
      buildingPlaceholders += `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:4px;font-size:12px;">
        <strong data-text="bldg-name-${idx}"></strong>${fadingBadge}${obsoleteBadge} — <span data-text="bldg-desc-${idx}"></span>
        <div style="font-size:11px;opacity:0.72;margin-top:3px;" data-text="bldg-upkeep-${idx}">${upkeepText}</div>
      </div>`;
    }
  }
```

Note: this replaces the old `const upkeep = cityMaintenance.rows.find(row => row.id === bid)?.upkeep ?? 0;` line with `const row = cityMaintenance.rows.find(r => r.id === bid);` plus a derived `upkeep`, since the row's `reason` is now needed too, not just its `upkeep`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts -t "obsolete-building badge"`
Expected: PASS (both new tests)

- [ ] **Step 5: Run the full city-panel suite to check for regressions**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts`
Expected: PASS — confirms the `fadingBadge`/national-project rendering and the plain "Free support"/"Upkeep: -N gold/turn" text for ordinary buildings still render correctly.

- [ ] **Step 6: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): show obsolete badge and upkeep-free label on the city panel (#443)"
```

---

## Final Verification (after all 8 tasks)

- [ ] **Run the full build and test suite**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
```

Expected: both exit 0.

- [ ] **Self-review the full diff against merge-base with origin/main**

```bash
git diff "$(git merge-base HEAD origin/main)"..HEAD
```

Check for: proper testing, regressions, logic issues, data issues, quality issues — per `spec-fidelity.md`'s instruction to compare against the current merge-base, not a stale ref.

- [ ] **Push and open a PR** (see task prompt Step 5 for the required PR body sections: Summary, Design rationale, Notable findings, Test plan). Do not merge — leave open for review.

- [ ] **File 2 deferred follow-up issues** (see task prompt Step 6): `droppedProductionItem` notification-wiring gap, and the unit-training-cost-reduction mechanics these buildings' flavor text describes. Reference this PR and the spec doc in both.
