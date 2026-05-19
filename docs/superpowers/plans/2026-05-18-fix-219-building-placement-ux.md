# Fix #219: Building Placement UX (Unplaced Buildings) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a completed building can't auto-place into the grid, (1) fire a notification telling the player to open the Grid tab, and (2) let the player tap the building in the "Unplaced buildings" list to enter placement mode and tap a slot to place it.

**Architecture:** Three layers. *System layer:* a new `placeBuilding(city, buildingId, row, col)` pure function in `city-system.ts` (export `isSlotUnlocked` from `adjacency-system.ts` to use in validation). *UI layer:* `CityGridCallbacks` gains `onPlaceBuilding`, and `renderBuildingsCoreSection` in `city-grid.ts` gains local placement-mode state. *Wiring layer:* `city-panel.ts` wires the callback, and `main.ts` handles the state mutation and the unplaced notification.

**Tech Stack:** TypeScript, jsdom/vitest

---

### Task 1: Export `isSlotUnlocked` and add `placeBuilding`

**Files:**
- Modify: `src/systems/adjacency-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write a failing test for `placeBuilding` in `tests/systems/city-system.test.ts`**

Add these imports if not present:

```typescript
import { placeBuilding, getUnplacedBuildings, createEmptyCityGrid } from '@/systems/city-system';
```

Add a new `describe` block:

```typescript
describe('placeBuilding', () => {
  const mkCity = (): City => ({
    id: 'test',
    name: 'Test',
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 10,
    productionProgress: 0,
    productionQueue: [],
    buildings: ['granary'],
    workedTiles: [],
    ownedTiles: [],
    grid: createEmptyCityGrid(),
    gridSize: 3,
    focus: 'balanced' as const,
    culture: 0,
    maturity: 'outpost' as const,
    idleProduction: null,
  });

  it('places a building in the specified slot', () => {
    const city = { ...mkCity(), buildings: ['granary'] };
    // granary is not in the grid yet (unplaced)
    const result = placeBuilding(city, 'granary', 3, 4);
    expect(result.grid[3][4]).toBe('granary');
  });

  it('returns city unchanged when slot is occupied', () => {
    const city = mkCity();
    city.grid[3][4] = 'workshop';
    const result = placeBuilding(city, 'granary', 3, 4);
    expect(result.grid[3][4]).toBe('workshop');
  });

  it('returns city unchanged when building is not in the unplaced list', () => {
    const city = mkCity();
    // granary is already in the grid
    city.grid[3][4] = 'granary';
    const result = placeBuilding(city, 'granary', 3, 5);
    // grid[3][5] should remain null
    expect(result.grid[3][5]).toBeNull();
  });

  it('returns city unchanged when slot is out of unlocked range', () => {
    const city = mkCity(); // gridSize: 3 — outer rows/cols are locked
    const result = placeBuilding(city, 'granary', 0, 0); // top-left corner, locked
    expect(result.grid[0][0]).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts
```

Expected: compile error — `placeBuilding` is not exported yet.

- [ ] **Step 3: Export `isSlotUnlocked` from `src/systems/adjacency-system.ts`**

Find `function isSlotUnlocked` (around line 56) and change it to:

```typescript
export function isSlotUnlocked(row: number, col: number, gridSize: number, renderSize: number): boolean {
```

- [ ] **Step 4: Add `placeBuilding` to `src/systems/city-system.ts`**

Add the import for `isSlotUnlocked` at the top of `city-system.ts`:

```typescript
import { isSlotUnlocked } from '@/systems/adjacency-system';
```

Add the function after `getUnplacedBuildings` (around line 322):

```typescript
export function placeBuilding(city: City, buildingId: string, row: number, col: number): City {
  const renderSize = 7;
  if (!isSlotUnlocked(row, col, city.gridSize, renderSize)) return city;
  if (city.grid[row]?.[col] !== null) return city;
  if (!getUnplacedBuildings(city).includes(buildingId)) return city;

  const grid = city.grid.map(r => r.slice());
  grid[row][col] = buildingId;
  return { ...city, grid };
}
```

- [ ] **Step 5: Run the system tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts
```

Expected: all tests `PASS`.

- [ ] **Step 6: Commit system layer**

```bash
git add src/systems/adjacency-system.ts src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): add placeBuilding() for manual grid slot assignment

Validates slot is unlocked, empty, and the building is in the
unplaced list before writing to city.grid. Pure function — returns
unchanged city on any invalid input.

Partial fix for #219"
```

---

### Task 2: Add placement mode to the grid UI

**Files:**
- Modify: `src/ui/city-grid.ts`

- [ ] **Step 7: Add `onPlaceBuilding` to the `CityGridCallbacks` interface**

Find the interface (line ~53):

```typescript
interface CityGridCallbacks {
  onSlotTap: (row: number, col: number) => void;
  onBuyExpansion: () => void;
  onClose: () => void;
}
```

Replace with:

```typescript
interface CityGridCallbacks {
  onSlotTap: (row: number, col: number) => void;
  onBuyExpansion: () => void;
  onClose: () => void;
  onPlaceBuilding?: (buildingId: string, row: number, col: number) => void;
}
```

- [ ] **Step 8: Update `renderBuildingBoard` to accept and highlight placement-mode slots**

Find `function renderBuildingBoard` (it's called from `renderBuildingsCoreSection`). The function renders the 7×7 grid. We need to pass a `placingBuildingId` through so empty unlocked slots show a "place here" affordance.

Locate the function signature. It will look something like:
```typescript
function renderBuildingBoard(
  root: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
): void {
```

Add `placingBuildingId?: string` as the last parameter:

```typescript
function renderBuildingBoard(
  root: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
  placingBuildingId?: string,
): void {
```

Inside the function, find where empty unlocked slots are rendered (look for the cell element being created for `null` grid entries). Add a visual affordance when `placingBuildingId` is set and the slot is empty+unlocked:

```typescript
// Inside the loop that creates grid cells — after checking the slot is empty and unlocked:
if (placingBuildingId && slotIsEmpty && slotIsUnlocked) {
  cell.style.border = '2px dashed #e8c170';
  cell.style.background = 'rgba(232,193,112,0.12)';
  cell.title = 'Tap to place here';
  cell.addEventListener('click', () => {
    callbacks.onPlaceBuilding?.(placingBuildingId, row, col);
  });
}
```

(Adapt the exact variable names to match whatever the function already uses for row/col/empty/unlocked checks.)

- [ ] **Step 9: Update `renderBuildingsCoreSection` to make unplaced rows tappable and manage placement mode**

Find `renderBuildingsCoreSection` (around line 293). It currently renders unplaced buildings as plain `div` rows. Replace the unplaced section with:

```typescript
  const unplaced = getUnplacedBuildings(city);
  if (unplaced.length > 0) {
    const unplacedSection = document.createElement('section');
    unplacedSection.dataset.unplacedBuildings = 'true';
    unplacedSection.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;';
    const unplacedHeading = document.createElement('h4');
    unplacedHeading.textContent = 'Unplaced buildings — tap one to place it';
    unplacedSection.appendChild(unplacedHeading);

    let activePlacingId: string | null = null;

    const rerender = (): void => {
      // Re-render the whole section with updated state
      section.textContent = '';
      section.appendChild(heading);
      // re-render board with activePlacingId
      renderBuildingBoard(section, city, map, callbacks, suggestedBuilding, activePlacingId ?? undefined);
      // re-append the unplaced section (simplified: just rebuild it)
    };

    for (const buildingId of unplaced) {
      const btn = document.createElement('button');
      btn.style.cssText = 'background:rgba(255,255,255,0.08);color:white;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;text-align:left;cursor:pointer;min-height:44px;';
      btn.textContent = BUILDINGS[buildingId]?.name ?? titleCase(buildingId);
      btn.dataset.buildingId = buildingId;
      btn.addEventListener('click', () => {
        activePlacingId = activePlacingId === buildingId ? null : buildingId;
        // Update button highlight
        for (const el of Array.from(unplacedSection.querySelectorAll('button'))) {
          (el as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
        }
        if (activePlacingId) {
          btn.style.background = 'rgba(232,193,112,0.25)';
        }
        // Re-render board to show/hide highlights
        const boardContainer = section.querySelector('[data-building-board]') as HTMLElement | null;
        if (boardContainer) {
          boardContainer.textContent = '';
          renderBuildingBoard(boardContainer, city, map, callbacks, suggestedBuilding, activePlacingId ?? undefined);
        }
      });
      unplacedSection.appendChild(btn);
    }

    section.appendChild(unplacedSection);
  }
```

Also wrap the building board render in a container element with `data-building-board` so it can be re-rendered without rebuilding the whole section:

```typescript
  const boardContainer = document.createElement('div');
  boardContainer.dataset.buildingBoard = 'true';
  renderBuildingBoard(boardContainer, city, map, callbacks, suggestedBuilding);
  section.appendChild(boardContainer);
```

(Adapt to existing structure — the exact refactor depends on how `renderBuildingBoard` is currently called in this function.)

- [ ] **Step 10: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: no failures. (The UI tests for placement mode are added next.)

- [ ] **Step 11: Commit UI layer**

```bash
git add src/ui/city-grid.ts
git commit -m "feat(ui): placement mode for unplaced buildings in Grid tab

Unplaced building rows become tappable buttons. Tapping one highlights
empty unlocked grid slots with a gold dashed border. Tapping a slot
calls onPlaceBuilding(buildingId, row, col). Tapping the button again
cancels placement mode.

Partial fix for #219"
```

---

### Task 3: Wire in city-panel and main.ts

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `src/main.ts`

- [ ] **Step 12: Wire `onPlaceBuilding` in `src/ui/city-panel.ts`**

Find the `createCityGrid` call in `renderCityGridTab` (around line 373):

```typescript
    createCityGrid(gridView, city, state.map, {
      onSlotTap: () => {
        callbacks.onClose();
      },
      onBuyExpansion: () => {
        callbacks.onClose();
      },
      onClose: callbacks.onClose,
    }, undefined, { ... });
```

Add `onPlaceBuilding`:

```typescript
    createCityGrid(gridView, city, state.map, {
      onSlotTap: () => {
        callbacks.onClose();
      },
      onBuyExpansion: () => {
        callbacks.onClose();
      },
      onClose: callbacks.onClose,
      onPlaceBuilding: callbacks.onPlaceBuilding,
    }, undefined, { ... });
```

Also add `onPlaceBuilding?: (cityId: string, buildingId: string, row: number, col: number) => void` to the `CityPanelCallbacks` interface (wherever it's defined in `city-panel.ts`).

- [ ] **Step 13: Add the unplaced notification and `onPlaceBuilding` mutation in `src/main.ts`**

**Notification:** Find the `city:building-complete` handler (around line 2401):

```typescript
bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  appendToCivLog(city.owner, `${city.name}: ${buildingId} completed!`, 'success');
});
```

Replace with:

```typescript
bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  const buildingName = BUILDINGS[buildingId]?.name ?? buildingId;
  appendToCivLog(city.owner, `${city.name}: ${buildingName} completed!`, 'success');
  if (getUnplacedBuildings(city).includes(buildingId)) {
    appendToCivLog(city.owner, `${buildingName} needs a grid slot — open the Grid tab to place it.`, 'info');
  }
});
```

Add the required imports at the top of `main.ts` if missing:

```typescript
import { BUILDINGS, getUnplacedBuildings, placeBuilding } from '@/systems/city-system';
```

**`onPlaceBuilding` callback:** Find where `openCityPanel` is called and the callbacks object is built. Add the callback:

```typescript
onPlaceBuilding: (cityId, buildingId, row, col) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  const updated = placeBuilding(city, buildingId, row, col);
  if (updated === city) return; // no change
  gameState = { ...gameState, cities: { ...gameState.cities, [cityId]: updated } };
  renderLoop.setGameState(gameState);
  // Re-render the panel
  openCityPanel(cityId);
},
```

(Wire `cityId` into `onPlaceBuilding` — the city-panel should forward the city's ID along with the building and slot.)

- [ ] **Step 14: Run the full suite and build**

```bash
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 15: Final commit**

```bash
git add src/ui/city-panel.ts src/main.ts
git commit -m "feat(wiring): wire building placement and unplaced notification

- city:building-complete now fires a second 'info' log entry when the
  building couldn't auto-place, telling the player to open Grid tab.
- onPlaceBuilding callback applies placeBuilding() to gameState and
  re-opens the city panel so the player sees the updated grid.

Fixes #219"
```
