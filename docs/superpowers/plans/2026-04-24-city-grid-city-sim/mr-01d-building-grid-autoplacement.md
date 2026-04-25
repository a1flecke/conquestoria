# MR 1d: Building Grid Auto-Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make completed buildings, especially Barracks, appear in the city building grid automatically and surface unplaced buildings instead of hiding them.

**Architecture:** Extend adjacency/grid helpers to work with 7x7 city grids and grid sizes 3, 5, and 7. `processCity` remains the canonical production completion path; when a building completes it calls a shared auto-placement helper. The city UI derives unplaced buildings from `city.buildings` minus grid contents. Target implementing model: GPT-5.4 Medium.

**Tech Stack:** TypeScript, Vitest, existing adjacency system, existing city panel/grid DOM.

---

## Source Contract

Spec: `docs/superpowers/specs/2026-04-24-city-grid-city-sim-design.md`

Rules to read before editing source:

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`

MR dependency: complete MR 1a, MR 1b, and MR 1c first.

## Files

- Modify: `src/systems/adjacency-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/ui/city-grid.ts`
- Test: `tests/systems/adjacency-system.test.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/ui/city-panel.test.ts`

## Task 1: Make Adjacency Helpers Support 7x7 Grids

**Files:**
- Modify: `src/systems/adjacency-system.ts`
- Test: `tests/systems/adjacency-system.test.ts`

- [ ] **Step 1: Add failing adjacency tests**

In `tests/systems/adjacency-system.test.ts`, add:

```ts
it('calculates adjacency bonuses in a 7x7 grid', () => {
  const grid: (string | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => null),
  );
  grid[3][3] = 'city-center';
  grid[3][2] = 'library';

  const bonuses = calculateAdjacencyBonuses(grid, 7);
  expect(bonuses['3,2'].science).toBeGreaterThan(0);
});

it('finds optimal slots in the centered unlocked area for 7x7 grids', () => {
  const grid: (string | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => null),
  );
  grid[3][3] = 'city-center';

  const slot = findOptimalSlot(grid, 3, 'library');

  expect(slot).not.toBeNull();
  expect(slot!.row).toBeGreaterThanOrEqual(2);
  expect(slot!.row).toBeLessThanOrEqual(4);
  expect(slot!.col).toBeGreaterThanOrEqual(2);
  expect(slot!.col).toBeLessThanOrEqual(4);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/adjacency-system.test.ts
```

Expected: FAIL because helpers currently assume a 5x5 board.

- [ ] **Step 3: Update grid bounds helpers**

In `src/systems/adjacency-system.ts`, replace 5x5 assumptions with dynamic bounds:

```ts
function getGridLength(grid: (string | null)[][]): number {
  return grid.length;
}

export function isSlotUnlocked(row: number, col: number, gridSize: number, gridLength: number): boolean {
  const offset = Math.floor((gridLength - gridSize) / 2);
  return row >= offset && row < gridLength - offset && col >= offset && col < gridLength - offset;
}
```

Update loops:

```ts
const gridLength = getGridLength(grid);
for (let r = 0; r < gridLength; r++) {
  for (let c = 0; c < gridLength; c++) {
    if (!isSlotUnlocked(r, c, gridSize, gridLength)) continue;
    // existing body
  }
}
```

Update `findOptimalSlot` and `calculateAdjacencyBonuses` to call the exported `isSlotUnlocked`.

- [ ] **Step 4: Run adjacency tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/adjacency-system.test.ts
```

Expected: PASS.

## Task 2: Auto-Place Completed Buildings

**Files:**
- Modify: `src/systems/city-system.ts`
- Test: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Add failing city-system tests**

In `tests/systems/city-system.test.ts`, add:

```ts
it('auto-places a completed Barracks into the building grid', () => {
  const city = foundCity('player', { q: 15, r: 15 }, map);
  const queued = { ...city, productionQueue: ['barracks'], productionProgress: 9 };

  const result = processCity(queued, map, 0, 1);

  expect(result.completedBuilding).toBe('barracks');
  expect(result.city.buildings).toContain('barracks');
  expect(result.city.grid.flat()).toContain('barracks');
});

it('surfaces completed buildings as unplaced when no unlocked slots exist', () => {
  const city = foundCity('player', { q: 15, r: 15 }, map);
  const fullGrid = city.grid.map(row => row.slice());
  for (let row = 2; row <= 4; row++) {
    for (let col = 2; col <= 4; col++) {
      if (row !== 3 || col !== 3) fullGrid[row][col] = 'shrine';
    }
  }
  const queued = { ...city, grid: fullGrid, productionQueue: ['barracks'], productionProgress: 9 };

  const result = processCity(queued, map, 0, 1);

  expect(result.city.buildings).toContain('barracks');
  expect(result.city.grid.flat()).not.toContain('barracks');
  expect(getUnplacedBuildings(result.city)).toContain('barracks');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts
```

Expected: FAIL because completion only pushes to `city.buildings`.

- [ ] **Step 3: Add placement helpers**

In `src/systems/city-system.ts`, import `findOptimalSlot`:

```ts
import { findOptimalSlot } from './adjacency-system';
```

Add:

```ts
export function placeBuildingInGrid(city: City, buildingId: string): City {
  if (city.grid.flat().includes(buildingId)) return city;
  const slot = findOptimalSlot(city.grid, city.gridSize, buildingId);
  if (!slot) return city;
  const grid = city.grid.map(row => row.slice());
  grid[slot.row][slot.col] = buildingId;
  return { ...city, grid };
}

export function getUnplacedBuildings(city: City): string[] {
  const placed = new Set(city.grid.flat().filter((entry): entry is string => Boolean(entry)));
  return city.buildings.filter(buildingId => !placed.has(buildingId));
}
```

- [ ] **Step 4: Call placement during production completion**

In `processCity`, when a building completes, replace:

```ts
newBuildings.push(building.id);
```

with:

```ts
newBuildings.push(building.id);
```

Then before the final return, build an intermediate city:

```ts
let nextCity: City = {
  ...city,
  food: newFood,
  foodNeeded: newFoodNeeded,
  population: newPop,
  productionProgress: newProgress,
  productionQueue: newQueue,
  buildings: newBuildings,
  gridSize: newGridSize,
};

if (completedBuilding) {
  nextCity = placeBuildingInGrid(nextCity, completedBuilding);
}
```

Return `city: nextCity`.

- [ ] **Step 5: Run city-system tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts
```

Expected: PASS.

## Task 3: Show Placed And Unplaced Buildings In The Grid UI

**Files:**
- Modify: `src/ui/city-grid.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Add failing UI tests**

In `tests/ui/city-panel.test.ts`, add:

```ts
it('shows a completed Barracks in the Buildings/Core grid', () => {
  const { container, city, state } = makeWonderPanelFixture();
  city.buildings = ['barracks'];
  city.grid[3][2] = 'barracks';

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  expect(panel.textContent).toContain('Barracks');
});

it('shows unplaced buildings instead of hiding them', () => {
  const { container, city, state } = makeWonderPanelFixture();
  city.buildings = ['barracks'];
  city.grid = city.grid.map(row => row.map(value => value === 'barracks' ? null : value));

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  expect(panel.textContent).toContain('Unplaced buildings');
  expect(panel.textContent).toContain('Barracks');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL until UI derives unplaced buildings.

- [ ] **Step 3: Render 7x7 building grid and unplaced section**

In `src/ui/city-grid.ts`, import:

```ts
import { BUILDINGS, getUnplacedBuildings } from '@/systems/city-system';
import { isSlotUnlocked } from '@/systems/adjacency-system';
```

Render building grid using `city.grid.length`:

```ts
const grid = document.createElement('div');
grid.style.cssText = `display:grid;grid-template-columns:repeat(${city.grid.length},minmax(28px,1fr));gap:3px;max-width:420px;margin:0 auto;`;
```

For each slot, show:

```ts
const buildingId = city.grid[row]?.[col];
const cell = document.createElement('button');
cell.type = 'button';
cell.disabled = !isSlotUnlocked(row, col, city.gridSize, city.grid.length);
cell.textContent = buildingId ? (BUILDINGS[buildingId]?.name ?? buildingId) : '';
```

Below the grid:

```ts
const unplaced = getUnplacedBuildings(city);
if (unplaced.length > 0) {
  const section = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = 'Unplaced buildings';
  section.appendChild(heading);
  for (const buildingId of unplaced) {
    const row = document.createElement('div');
    row.textContent = BUILDINGS[buildingId]?.name ?? buildingId;
    section.appendChild(row);
  }
  root.appendChild(section);
}
```

Keep all dynamic names assigned with `textContent`.

- [ ] **Step 4: Run UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: PASS.

## Task 4: Remove Remaining 4x4 Grid Behavior

**Files:**
- Modify: `src/systems/city-system.ts`
- Test: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Update tests away from 4x4**

Replace tests that expect grid size 4 with tests for 3, 5, and 7:

```ts
it('does not use even grid sizes when expanding', () => {
  const city = foundCity('player', { q: 15, r: 15 }, map);
  city.population = 3;
  expect(checkGridExpansion(city)).toBe(false);
  expect(city.gridSize).toBe(3);
});

it('expands from 3x3 to 5x5 at Town scale', () => {
  const city = foundCity('player', { q: 15, r: 15 }, map);
  city.population = 5;
  expect(checkGridExpansion(city)).toBe(true);
  expect(city.gridSize).toBe(5);
});
```

- [ ] **Step 2: Update expansion helpers**

In `src/systems/city-system.ts`, update:

```ts
export function checkGridExpansion(city: City): boolean {
  if (city.population >= 12 && city.gridSize < 7) {
    city.gridSize = 7;
    return true;
  }
  if (city.population >= 5 && city.gridSize < 5) {
    city.gridSize = 5;
    return true;
  }
  return false;
}
```

If `purchaseGridExpansion` remains in this MR, make it skip even sizes:

```ts
export function purchaseGridExpansion(city: City, currentGold: number): number {
  if (city.gridSize >= 7) return 0;
  const nextSize: 5 | 7 = city.gridSize < 5 ? 5 : 7;
  const cost = nextSize === 5 ? 150 : 400;
  if (currentGold < cost) return 0;
  city.gridSize = nextSize;
  return cost;
}
```

- [ ] **Step 3: Run city-system tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts
```

Expected: PASS.

## Task 5: Verification And Commit

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/adjacency-system.ts src/systems/city-system.ts src/ui/city-grid.ts
```

Expected: no rule violations.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/adjacency-system.test.ts tests/systems/city-system.test.ts tests/ui/city-panel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Commit MR 1d**

Run:

```bash
git add src/systems/adjacency-system.ts src/systems/city-system.ts src/ui/city-grid.ts tests/systems/adjacency-system.test.ts tests/systems/city-system.test.ts tests/ui/city-panel.test.ts
git commit -m "feat(city): auto-place completed buildings"
```
