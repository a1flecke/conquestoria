# City View Redesign — Districts & Citizens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7×7 square building grid and adjacency bonus system with a Districts tab (buildings grouped by theme) and an improved Citizens tab (focus modes + hex tile manual override).

**Architecture:** Two sequential MRs. MR1 is a pure data/system refactor — removes `city.grid`, `city.gridSize`, and `adjacency-system.ts` entirely and bumps four building base yields to compensate. MR2 adds `city-districts.ts` (new read-only Districts tab) and rewires `city-panel.ts` to replace the Grid tab with Districts and add a Citizens tab.

**Tech Stack:** TypeScript, Vitest, JSDOM (UI tests), `@/systems/city-system`, `@/core/types`, `@/ui/city-panel`, `@/ui/city-grid`

---

## MR1: Grid & Adjacency Removal

### File map

| Action | Path |
|---|---|
| Modify | `src/core/types.ts` |
| Modify | `src/systems/city-system.ts` |
| Delete | `src/systems/adjacency-system.ts` |
| Modify | `src/systems/resource-system.ts` |
| Modify | `src/systems/city-maturity-system.ts` |
| Modify | `src/storage/save-manager.ts` |
| Modify | `src/ui/city-grid.ts` |
| Delete | `tests/systems/adjacency-system.test.ts` |
| Modify | `tests/systems/city-system.test.ts` |
| Modify | `tests/ui/city-grid.test.ts` |

---

### Task 1: Strip grid/adjacency from `types.ts`

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Remove `AdjacencyBonus`, `adjacencyBonuses`, `grid`, and `gridSize` from types**

In `src/core/types.ts`, make these removals:

```typescript
// REMOVE this type entirely:
export interface AdjacencyBonus {
  adjacentTo: string;
  bonus: Partial<ResourceYield>;
}

// In Building interface, REMOVE this field:
adjacencyBonuses?: AdjacencyBonus[];

// In City interface, REMOVE these two fields:
grid: (string | null)[][];
gridSize: 3 | 5 | 7;
```

- [ ] **Step 2: Run build to confirm no type errors from these removals**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|adjacencyBonuses|gridSize|AdjacencyBonus" | head -30
```

Expected: errors about `adjacencyBonuses`, `grid`, `gridSize` usage in other files — those are fixed in subsequent tasks. If you see unrelated errors, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "refactor(types): remove grid, gridSize, adjacencyBonuses, AdjacencyBonus"
```

---

### Task 2: Update building definitions and remove `adjacency-system.ts`

**Files:**
- Modify: `src/systems/city-system.ts`
- Delete: `src/systems/adjacency-system.ts`

- [ ] **Step 1: Adjust base yields and strip the `adjacencyBonuses` field from every building**

In `src/systems/city-system.ts`, apply these yield changes and remove all `adjacencyBonuses: []` occurrences. The four buildings that lost reliable `city-center` adjacency bonuses get compensating base yield bumps:

```typescript
// Granary: food 2 → 3
granary: { id: 'granary', name: 'Granary', category: 'food',
  yields: { food: 3, production: 0, gold: 0, science: 0 },
  productionCost: 40, description: 'Stores food for growth', techRequired: 'granary-design' },

// Library: science 2 → 3
library: { id: 'library', name: 'Library', category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 3 },
  productionCost: 40, description: 'Repository of knowledge', techRequired: 'writing' },

// Workshop: production 2 → 3
workshop: { id: 'workshop', name: 'Workshop', category: 'production',
  yields: { food: 0, production: 3, gold: 0, science: 0 },
  productionCost: 12, description: 'Tools boost production', techRequired: null },

// Marketplace: gold 3 → 4
marketplace: { id: 'marketplace', name: 'Marketplace', category: 'economy',
  yields: { food: 0, production: 0, gold: 4, science: 0 },
  productionCost: 50, description: 'Center trade — adds trade route slot.', techRequired: 'currency', routeCapacity: 1 },
```

For every other building, just remove the `adjacencyBonuses: []` field and nothing else. The `pacing` field and all other fields stay.

- [ ] **Step 2: Remove imports of adjacency functions and grid helpers from `city-system.ts`**

Remove this import line at the top of `src/systems/city-system.ts`:

```typescript
import { findOptimalSlot, isSlotUnlocked } from './adjacency-system';
```

Remove these exported functions from `city-system.ts`:
- `createEmptyCityGrid` (the function body and its export)
- `getUnplacedBuildings` (the function body and its export)
- `placeBuilding` (if exported — it places a building in the grid)
- `checkGridExpansion` / `purchaseGridExpansion` (if they exist — they expand grid size)

Also remove from `foundCity`: the `const grid = createEmptyCityGrid();` call, and the `grid` and `gridSize` fields from the returned city object.

- [ ] **Step 3: Delete `adjacency-system.ts`**

```bash
rm src/systems/adjacency-system.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(city): remove adjacency system, adjust building base yields"
```

---

### Task 3: Remove grid-based yield calculation from `resource-system.ts`

**Files:**
- Modify: `src/systems/resource-system.ts`

- [ ] **Step 1: Remove the `getTotalAdjacencyYields` call**

In `src/systems/resource-system.ts`, find the block that looks like:

```typescript
import { getTotalAdjacencyYields } from './adjacency-system';
// ...
// Adjacency bonuses from city grid
if (city.grid) {
  const adjYields = getTotalAdjacencyYields(city.grid, city.gridSize);
  food += adjYields.food ?? 0;
  production += adjYields.production ?? 0;
  gold += adjYields.gold ?? 0;
  science += adjYields.science ?? 0;
}
```

Remove the import and the entire `if (city.grid)` block. Building intrinsic yields (from `city.buildings`) are already summed elsewhere in the same function — only the adjacency block is removed.

- [ ] **Step 2: Run build to confirm it passes**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/systems/resource-system.ts
git commit -m "refactor(resource): remove adjacency yield calculation from city yields"
```

---

### Task 4: Strip `gridSize` from `city-maturity-system.ts`

**Files:**
- Modify: `src/systems/city-maturity-system.ts`

- [ ] **Step 1: Remove `gridSize` from the maturity level definitions and the `CityMaturityLevel` type**

In `src/systems/city-maturity-system.ts`, remove `gridSize` from the `CityMaturityLevel` interface/type (if it's defined there) and from all five maturity level entries (`outpost`, `village`, `town`, `city`, `metropolis`). Leave `districtPages` for now — MR2 removes it.

The maturity upgrade logic that copies `gridSize` forward (line ~91 in the current file):

```typescript
const gridSize = Math.max(city.gridSize ?? definition.gridSize, definition.gridSize) as 3 | 5 | 7;
// ...
city: { ...city, maturity: current, gridSize },
```

Becomes:

```typescript
city: { ...city, maturity: current },
```

- [ ] **Step 2: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/systems/city-maturity-system.ts
git commit -m "refactor(maturity): remove gridSize from city maturity levels"
```

---

### Task 5: Add save migration to strip `grid`/`gridSize` from loaded cities

**Files:**
- Modify: `src/storage/save-manager.ts`

- [ ] **Step 1: Add a migration function that strips old grid fields**

In `src/storage/save-manager.ts`, add a new migration function and wire it into `normalizeLoadedState`. Add it after the existing migration functions:

```typescript
function migrateStripCityGrid(state: GameState): GameState {
  const cities = Object.fromEntries(
    Object.entries(state.cities ?? {}).map(([id, city]) => {
      const { grid: _grid, gridSize: _gridSize, ...rest } = city as any;
      return [id, rest];
    }),
  );
  return { ...state, cities };
}
```

In `normalizeLoadedState`, add `migrateStripCityGrid` to the chain:

```typescript
function normalizeLoadedState(state: GameState): GameState {
  const normalizedCityState = normalizeMinorCivQuestState(
    normalizeLegacyCitySimState(
      migrateLegacyPlanningState(
        migrateLegacyNamingState(
          migrateStripCityGrid(          // ← add here
            ensureGameIdentity(state)
          )
        )
      )
    ),
  );
  // ... rest unchanged
```

- [ ] **Step 2: Commit**

```bash
git add src/storage/save-manager.ts
git commit -m "fix(save): strip legacy grid/gridSize fields from loaded city saves"
```

---

### Task 6: Remove building grid UI from `city-grid.ts`

**Files:**
- Modify: `src/ui/city-grid.ts`

- [ ] **Step 1: Remove the building placement interface and board renderer**

In `src/ui/city-grid.ts`:

1. Remove `onPlaceBuilding?: (buildingId: string, row: number, col: number) => void` from `CityGridCallbacks`.

2. Remove the `renderBuildingBoard` function entirely (it renders the 7×7 grid of cells).

3. Remove `renderBuildingsCoreSection` (which calls `renderBuildingBoard` and shows the "Unplaced buildings" buttons).

4. Remove the `activePlacingId` state and the "Unplaced buildings — tap one to place it" section in `createCityGrid`.

5. Remove imports that are now dead: `getUnplacedBuildings`, `findOptimalSlot`, `isSlotUnlocked`, `calculateAdjacencyBonuses` (if imported).

6. The worked-land hex tile section (`renderWorkedLandSection` or equivalent), the overview section, and the focus buttons all stay intact.

- [ ] **Step 2: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/city-grid.ts
git commit -m "refactor(city-grid): remove building board, onPlaceBuilding, unplaced-buildings UI"
```

---

### Task 7: Replace adjacency tests, add MR1 yield regression

**Files:**
- Delete: `tests/systems/adjacency-system.test.ts`
- Modify: `tests/systems/city-system.test.ts`
- Modify: `tests/ui/city-grid.test.ts`

- [ ] **Step 1: Delete the adjacency test file**

```bash
rm tests/systems/adjacency-system.test.ts
```

- [ ] **Step 2: Add yield regression tests to `tests/systems/city-system.test.ts`**

Add this describe block to `tests/systems/city-system.test.ts`:

```typescript
describe('building intrinsic yields — no adjacency', () => {
  it('granary contributes 3 food regardless of position', () => {
    const map = generateMap(30, 30, 'yield-granary');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const cityWithBuilding = { ...city, buildings: ['granary'] };
    const total = Object.values(BUILDINGS['granary'].yields).reduce((s, v) => s + v, 0);
    expect(BUILDINGS['granary'].yields.food).toBe(3);
    expect(total).toBeGreaterThan(0);
  });

  it('library contributes 3 science', () => {
    expect(BUILDINGS['library'].yields.science).toBe(3);
  });

  it('workshop contributes 3 production', () => {
    expect(BUILDINGS['workshop'].yields.production).toBe(3);
  });

  it('marketplace contributes 4 gold', () => {
    expect(BUILDINGS['marketplace'].yields.gold).toBe(4);
  });

  it('library and temple together do not produce the old +2 science adjacency bonus', () => {
    // Old behaviour: library adjacent to temple → +2 science via adjacency rules.
    // New behaviour: library yields 3 science intrinsically; no extra bonus.
    const libraryScience = BUILDINGS['library'].yields.science;
    const templeScience = BUILDINGS['temple']?.yields.science ?? 0;
    // Combined intrinsic total must equal exactly libraryScience + templeScience,
    // not libraryScience + templeScience + 2 (the old adjacency bonus).
    expect(libraryScience + templeScience).toBe(libraryScience + templeScience);
    // Confirm no adjacencyBonuses field exists on Building at runtime.
    expect((BUILDINGS['library'] as any).adjacencyBonuses).toBeUndefined();
  });

  it('foundCity no longer sets grid or gridSize on the returned city', () => {
    const map = generateMap(30, 30, 'grid-removed');
    const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
    expect((city as any).grid).toBeUndefined();
    expect((city as any).gridSize).toBeUndefined();
  });
});
```

- [ ] **Step 3: Add save-migration test to `tests/systems/city-system.test.ts`**

```typescript
import { normalizeLoadedStateForTest } from '@/storage/save-manager';

describe('save migration — strip grid fields', () => {
  it('strips grid and gridSize from a legacy city on load', () => {
    const map = generateMap(30, 30, 'save-migration');
    const rawCity = {
      ...foundCity('player', { q: 15, r: 15 }, map, mkC()),
      grid: Array.from({ length: 7 }, () => Array(7).fill(null)),
      gridSize: 3,
    };
    const fakeState = {
      cities: { [rawCity.id]: rawCity },
      civilizations: { player: { id: 'player', name: 'Player', civType: 'rome', cities: [rawCity.id], techState: { completed: [], current: null, progress: 0 }, diplomacy: { relationships: {}, atWarWith: [] }, color: '#fff', gold: 0, breakaway: undefined } },
      map,
      units: {},
      turn: 1,
      currentPlayer: 'player',
      era: 1,
      idCounters: mkC(),
    } as any;

    const normalized = normalizeLoadedStateForTest(fakeState);
    const city = normalized.cities[rawCity.id];
    expect((city as any).grid).toBeUndefined();
    expect((city as any).gridSize).toBeUndefined();
    expect(city.buildings).toEqual([]);
  });
});
```

- [ ] **Step 4: Update `tests/ui/city-grid.test.ts`**

Remove the two existing tests (they test `createCityGrid` with grid-specific assertions like `cells[24].dataset.building === 'city-center'`). Replace with a smoke test:

```typescript
import { describe, expect, it } from 'vitest';
// @ts-expect-error jsdom is installed for tests but this repo does not ship @types/jsdom.
import { JSDOM } from 'jsdom';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { createCityGrid } from '@/ui/city-grid';
import { createNewGame } from '@/core/game-state';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('city-grid view', () => {
  it('renders the worked-land citizen section without errors', () => {
    const previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    globalThis.document = dom.window.document;

    try {
      const state = createNewGame(undefined, 'city-grid-test');
      const map = state.map;
      const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
      const container = document.createElement('div');

      const panel = createCityGrid(container, city, map, {
        onSlotTap: () => {},
        onBuyExpansion: () => {},
        onClose: () => {},
      }, { state });

      expect(panel).toBeTruthy();
      // No grid cells should exist — building board is removed.
      expect(panel.querySelector('[data-building-grid]')).toBeNull();
    } finally {
      globalThis.document = previousDocument;
    }
  });
});
```

- [ ] **Step 5: Run all tests**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: all pass. If `city-panel.test.ts` references `createEmptyCityGrid`, update those usages (remove the import and replace any `grid`/`gridSize` field setup with nothing — the city object no longer has those fields).

- [ ] **Step 6: Run build to confirm TypeScript passes**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: zero errors.

- [ ] **Step 7: Commit MR1 complete**

```bash
git add -A
git commit -m "test(mr1): replace adjacency tests, add yield regression and save-migration coverage"
```

---

## MR2: Districts Tab + Citizens Tab

### File map

| Action | Path |
|---|---|
| Modify | `src/core/types.ts` |
| Create | `src/ui/city-districts.ts` |
| Modify | `src/ui/city-grid.ts` |
| Modify | `src/ui/city-panel.ts` |
| Modify | `src/systems/city-maturity-system.ts` |
| Create | `tests/ui/city-districts.test.ts` |
| Modify | `tests/ui/city-panel.test.ts` |

---

### Task 8: Update `CityPanelTab` type in `types.ts`

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Replace the tab type**

Find and replace:

```typescript
// Before (in city-panel.ts or types.ts — wherever CityPanelTab is defined):
type CityPanelTab = 'list' | 'grid';

// After:
type CityPanelTab = 'list' | 'districts' | 'citizens' | 'wonders';
```

If `CityPanelTab` is defined inside `city-panel.ts` rather than `types.ts`, make this change there instead.

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts src/ui/city-panel.ts
git commit -m "refactor(city-panel): update CityPanelTab type — add districts, citizens, wonders"
```

---

### Task 9: Create `city-districts.ts`

**Files:**
- Create: `src/ui/city-districts.ts`
- Test: `tests/ui/city-districts.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `tests/ui/city-districts.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createCityDistrictsTab } from '@/ui/city-districts';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeCity(buildings: string[] = []) {
  const map = generateMap(30, 30, 'districts-test');
  const city = foundCity('player', { q: 15, r: 15 }, map, mkC());
  return { ...city, buildings };
}

describe('createCityDistrictsTab', () => {
  it('shows empty-state message when city has no buildings', () => {
    const el = createCityDistrictsTab(makeCity([]));
    expect(el.textContent).toContain('No districts yet');
  });

  it('renders zero district cards for an empty city', () => {
    const el = createCityDistrictsTab(makeCity([]));
    expect(el.querySelectorAll('[data-district]').length).toBe(0);
  });

  it('renders exactly one card per distinct building category present', () => {
    const el = createCityDistrictsTab(makeCity(['granary', 'library']));
    // granary → food, library → science: two distinct categories
    expect(el.querySelectorAll('[data-district]').length).toBe(2);
  });

  it('does not render a card for a category not in city.buildings', () => {
    // Only food buildings → no Commerce card
    const el = createCityDistrictsTab(makeCity(['granary']));
    const cards = el.querySelectorAll('[data-district]');
    const categories = Array.from(cards).map(c => (c as HTMLElement).dataset.district);
    expect(categories).not.toContain('economy');
  });

  it('renders cards in the spec-defined order: food → production → science → economy → military → culture → espionage', () => {
    const el = createCityDistrictsTab(makeCity(['barracks', 'granary', 'library']));
    const cards = Array.from(el.querySelectorAll('[data-district]'));
    const order = cards.map(c => (c as HTMLElement).dataset.district);
    expect(order).toEqual(['food', 'science', 'military']);
  });

  it('shows each built building name within its district card', () => {
    const el = createCityDistrictsTab(makeCity(['granary', 'herbalist']));
    expect(el.textContent).toContain('Granary');
    expect(el.textContent).toContain('Herbalist');
  });

  it('shows yield string for a building with non-zero yields', () => {
    const el = createCityDistrictsTab(makeCity(['granary']));
    // Granary yields 3 food
    expect(el.textContent).toMatch(/\+3/);
  });

  it('shows description text for a zero-yield building like barracks', () => {
    const el = createCityDistrictsTab(makeCity(['barracks']));
    // BUILDINGS['barracks'].description should appear, not a yield string
    expect(el.textContent).toContain('training');
  });

  it('handles an unknown building ID in city.buildings without throwing', () => {
    expect(() => createCityDistrictsTab(makeCity(['unknown-building-xyz']))).not.toThrow();
  });

  it('shows both yield types in the header total for a mixed-yield district', () => {
    // Harbor: food: 1, gold: 3 → economy district header should show both
    const el = createCityDistrictsTab(makeCity(['harbor']));
    const economyCard = el.querySelector('[data-district="economy"]');
    expect(economyCard).toBeTruthy();
    // Header total should reference both food and gold (harbor gives both)
    const headerText = economyCard!.querySelector('span:last-child')?.textContent ?? '';
    expect(headerText).toMatch(/🌾|food/);
    expect(headerText).toMatch(/💰|gold/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/city-districts.test.ts 2>&1 | tail -10
```

Expected: all fail with "Cannot find module '@/ui/city-districts'".

- [ ] **Step 3: Implement `city-districts.ts`**

Create `src/ui/city-districts.ts`:

```typescript
import type { City } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';

const DISTRICT_ORDER = ['food', 'production', 'science', 'economy', 'military', 'culture', 'espionage'] as const;

const DISTRICT_META: Record<string, { name: string; icon: string; color: string }> = {
  food:      { name: 'Food Quarter',    icon: '🌾', color: '#64c864' },
  production:{ name: 'Industry',        icon: '⚒️', color: '#d98c4a' },
  science:   { name: 'Academy',         icon: '🔭', color: '#4a90d9' },
  economy:   { name: 'Commerce',        icon: '🏪', color: '#e8c170' },
  military:  { name: 'Garrison',        icon: '⚔️', color: '#d94a4a' },
  culture:   { name: 'Culture Quarter', icon: '🎭', color: '#b464d9' },
  espionage: { name: 'Shadow Network',  icon: '🕵️', color: '#7a8899' },
};

function formatYields(yields: Record<string, number>): string {
  const icons: Record<string, string> = { food: '🌾', production: '⚒️', gold: '💰', science: '🔬' };
  return Object.entries(yields)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `+${v} ${icons[k] ?? k}`)
    .join(' · ');
}

function allZero(yields: Record<string, number>): boolean {
  return Object.values(yields).every(v => v === 0);
}

export function createCityDistrictsTab(city: City): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  // Group valid buildings by category, preserving city.buildings insertion order.
  const byCategory = new Map<string, string[]>();
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def) continue; // unknown building ID — skip silently
    const cat = def.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(id);
  }

  if (byCategory.size === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:rgba(255,255,255,0.35);font-size:12px;text-align:center;padding:32px 16px;font-style:italic;';
    empty.textContent = 'No districts yet — build your first building to found one.';
    root.appendChild(empty);
    return root;
  }

  // Render in DISTRICT_ORDER; skip categories not present.
  for (const category of DISTRICT_ORDER) {
    const buildingIds = byCategory.get(category);
    if (!buildingIds) continue;

    const meta = DISTRICT_META[category] ?? { name: category, icon: '🏛️', color: '#888' };

    // Sum yields across all buildings in this district.
    const totalYields: Record<string, number> = { food: 0, production: 0, gold: 0, science: 0 };
    for (const id of buildingIds) {
      const def = BUILDINGS[id]!;
      for (const [k, v] of Object.entries(def.yields)) totalYields[k] = (totalYields[k] ?? 0) + v;
    }
    const headerYieldStr = formatYields(totalYields);

    const card = document.createElement('div');
    card.dataset.district = category;
    card.style.cssText = `background:rgba(255,255,255,0.04);border:1px solid ${meta.color}44;border-radius:8px;overflow:hidden;`;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;';

    const icon = document.createElement('span');
    icon.textContent = meta.icon;
    icon.style.cssText = 'font-size:18px;width:28px;text-align:center;';

    const name = document.createElement('span');
    name.style.cssText = `font-size:13px;font-weight:bold;flex:1;color:${meta.color};`;
    name.textContent = meta.name;

    const total = document.createElement('span');
    total.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.45);';
    total.textContent = headerYieldStr || '';

    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(total);
    card.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:0 12px 10px;';

    for (const id of buildingIds) {
      const def = BUILDINGS[id]!;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,255,255,0.04);border-radius:5px;font-size:11px;';

      const bIcon = document.createElement('span');
      bIcon.style.fontSize = '14px';
      bIcon.textContent = (BUILDINGS[id] as any).icon ?? '🏗️';

      const bName = document.createElement('span');
      bName.style.cssText = 'flex:1;color:rgba(255,255,255,0.85);';
      bName.textContent = def.name;

      const bYield = document.createElement('span');
      bYield.style.cssText = 'color:rgba(255,255,255,0.45);font-size:10px;';
      bYield.textContent = allZero(def.yields) ? def.description : formatYields(def.yields);

      row.appendChild(bIcon);
      row.appendChild(bName);
      row.appendChild(bYield);
      body.appendChild(row);
    }

    card.appendChild(body);
    root.appendChild(card);
  }

  return root;
}
```

> **Note:** The building icon in the row uses `(BUILDINGS[id] as any).icon`. Building definitions don't currently have an `icon` field — `BUILDING_ICONS` in `city-grid.ts` has those mappings. Either import `BUILDING_ICONS` from `city-grid.ts`, or move it to `city-system.ts` and export it. The simplest fix is to add `import { BUILDING_ICONS } from '@/ui/city-grid';` and replace the icon expression with `BUILDING_ICONS[id] ?? '🏗️'`. Do whichever keeps the import cycle clean (check that `city-grid.ts` doesn't import from `city-panel.ts` in a cycle).

- [ ] **Step 4: Run the tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/city-districts.test.ts 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-districts.ts tests/ui/city-districts.test.ts
git commit -m "feat(city): add Districts tab — themed building groupings derived from city.buildings"
```

---

### Task 10: Export `createCityWorkSection` from `city-grid.ts` with new Citizens tab behaviours

**Files:**
- Modify: `src/ui/city-grid.ts`

- [ ] **Step 1: Extract and export the worked-land section, adding two new behaviours**

In `src/ui/city-grid.ts`, extract the worked-land rendering code into a named export. While extracting, add two new behaviours the spec requires:

**New behaviour A — Custom focus indicator.** When `city.focus === 'custom'`, show a greyed-out "Custom" label among the focus buttons so the player knows they are overriding the auto-assignment:

```typescript
// Inside the focus-buttons loop, after rendering the five named focus buttons:
if (city.focus === 'custom') {
  const customLabel = document.createElement('span');
  customLabel.style.cssText = 'padding:7px 12px;font-size:12px;color:rgba(255,255,255,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:6px;';
  customLabel.textContent = 'Custom';
  focusWrap.appendChild(customLabel);
}
```

Clicking any named focus button must call `options.onSetCityFocus?.(city.id, focus)` as before — this exits custom mode via the existing callback path.

**New behaviour B — Idle tile disabled when no citizens available.** When computing whether a tap on an idle tile is allowed, check if any citizen is unassigned (`workedCount < city.population`). If not, render the tile card at reduced opacity and skip the click handler:

```typescript
// When building each tile card in the worked-land section:
const isIdle = !workedKeys.has(hexKey(entry.coord));
const canWork = workedCount < city.population; // true if a spare citizen exists

tileCard.style.opacity = (isIdle && !canWork) ? '0.4' : '1';
if (isIdle && !canWork) {
  // Non-interactive — no click listener attached
} else {
  tileCard.addEventListener('click', () => {
    options.onToggleWorkedTile?.(city.id, entry.coord, !workedKeys.has(hexKey(entry.coord)));
  });
}
```

Export signature:

```typescript
export function createCityWorkSection(
  city: City,
  map: GameMap,
  options: CityManagementOptions,
): HTMLElement {
  // ... all existing worked-land rendering code + the two new behaviours above
}
```

Keep `createCityGrid` calling `createCityWorkSection` internally so existing callers are unaffected.

- [ ] **Step 2: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/city-grid.ts
git commit -m "feat(city-grid): export createCityWorkSection, add custom indicator and disabled-tile logic"
```

---

### Task 11: Rewire `city-panel.ts` — new tab bar and tab handlers

**Files:**
- Modify: `src/ui/city-panel.ts`

- [ ] **Step 1: Update the tab bar HTML**

Find the section in `createCityPanel` that renders the tab buttons. The current code has `<div id="tab-list">List</div>`, `<div id="tab-grid">Grid</div>`, `<div id="tab-wonders">Legendary Wonders</div>` (as DOM elements, not HTML strings — match the exact style already in the file).

Replace those with four tabs using the same `document.createElement('div')` pattern already present:

```typescript
// Reuse the exact style string already on the existing tab divs.
// Active tab style (copy from existing active tab): background:rgba(255,255,255,0.15); font-weight:bold
// Inactive tab style (copy from existing inactive tab): background:rgba(255,255,255,0.05)
// Change the text content of the former "Grid" tab to nothing (remove it).
// Change the text content of the former "List" tab to "Queue".

// The div id="tab-grid" becomes id="tab-districts" with text "Districts".
// Add a new div id="tab-citizens" with text "Citizens" after tab-districts.
// Keep id="tab-wonders" with text "Wonders" (was "Legendary Wonders" — shorten to match new bar width).
```

The exact DOM construction pattern is already in the file; copy it verbatim for the two new tabs (`tab-districts`, `tab-citizens`) rather than inventing a helper.

- [ ] **Step 2: Add the Districts and Citizens view containers**

Below the tab bar, add two new view containers alongside the existing `list-view` and `wonders-view`:

```typescript
const districtsView = document.createElement('div');
districtsView.id = 'city-districts-view';
districtsView.style.display = 'none';

const citizensView = document.createElement('div');
citizensView.id = 'city-citizens-view';
citizensView.style.display = 'none';
```

- [ ] **Step 3: Wire the Districts tab click handler**

```typescript
tabDistricts.addEventListener('click', () => {
  showTab('districts');
  districtsView.textContent = '';
  districtsView.appendChild(createCityDistrictsTab(city));
});
```

Import `createCityDistrictsTab` from `'@/ui/city-districts'`.

- [ ] **Step 4: Wire the Citizens tab click handler**

```typescript
tabCitizens.addEventListener('click', () => {
  showTab('citizens');
  citizensView.textContent = '';
  citizensView.appendChild(createCityWorkSection(city, state.map, {
    state,
    onSetCityFocus: callbacks.onSetCityFocus,
    onToggleWorkedTile: callbacks.onToggleWorkedTile,
  }));
});
```

Import `createCityWorkSection` from `'@/ui/city-grid'`.

- [ ] **Step 5: Update `showTab` / `rerenderPanel` to handle the new tab names**

Find the `showTab` helper (or inline tab-switching logic). Replace all references to `'grid'` with `'districts'` and add `'citizens'` and `'wonders'` to the handled cases. Ensure `initialTab` default remains `'list'`.

- [ ] **Step 6: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/city-panel.ts
git commit -m "feat(city-panel): add Districts and Citizens tabs, rename List→Queue"
```

---

### Task 12: Remove `districtPages` from `city-maturity-system.ts`

**Files:**
- Modify: `src/systems/city-maturity-system.ts`

- [ ] **Step 1: Remove `districtPages` from the maturity level definitions and type**

Remove the `districtPages` field from `CityMaturityLevel` and from all five maturity level entries. It was used to gate which tabs appeared — district presence is now derived from `city.buildings` at render time.

- [ ] **Step 2: Run build and tests**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -10
bash scripts/run-with-mise.sh yarn test tests/systems/city-maturity-system.test.ts 2>&1 | tail -10
```

Expected: zero errors, tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/systems/city-maturity-system.ts
git commit -m "refactor(maturity): remove districtPages — district presence derived from city.buildings"
```

---

### Task 13: Write and run the full MR2 test suite

**Files:**
- Modify: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Add city-panel tests for the new tabs**

Add to `tests/ui/city-panel.test.ts`:

```typescript
import { createCityPanel } from '@/ui/city-panel';
import { foundCity, BUILDINGS } from '@/systems/city-system';
import { createNewGame } from '@/core/game-state';
import { generateMap } from '@/systems/map-generator';
import { vi } from 'vitest';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function clickTab(panel: HTMLElement, tabId: string) {
  const tab = panel.querySelector(`#${tabId}`);
  expect(tab).toBeTruthy();
  tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('city-panel Districts tab', () => {
  it('shows the empty-state message when city has no buildings', () => {
    const state = createNewGame(undefined, 'districts-empty');
    const city = foundCity('player', { q: 15, r: 15 }, state.map, mkC());
    state.cities[city.id] = city;

    const container = document.createElement('div');
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onClose: () => {} });

    clickTab(panel, 'tab-districts');

    const view = panel.querySelector('#city-districts-view');
    expect(view?.textContent).toContain('No districts yet');
  });

  it('shows district cards only for categories present in city.buildings', () => {
    const state = createNewGame(undefined, 'districts-cards');
    const city = { ...foundCity('player', { q: 15, r: 15 }, state.map, mkC()), buildings: ['granary', 'library'] };
    state.cities[city.id] = city;

    const container = document.createElement('div');
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onClose: () => {} });

    clickTab(panel, 'tab-districts');

    const view = panel.querySelector('#city-districts-view')!;
    expect(view.querySelectorAll('[data-district]').length).toBe(2);
    expect(view.querySelector('[data-district="food"]')).toBeTruthy();
    expect(view.querySelector('[data-district="science"]')).toBeTruthy();
    expect(view.querySelector('[data-district="economy"]')).toBeNull();
  });
});

describe('city-panel Citizens tab', () => {
  it('calls onSetCityFocus when a focus button is clicked', () => {
    const state = createNewGame(undefined, 'citizens-focus');
    const city = foundCity('player', { q: 15, r: 15 }, state.map, mkC());
    state.cities[city.id] = city;
    const onSetCityFocus = vi.fn();

    const container = document.createElement('div');
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onClose: () => {},
      onSetCityFocus,
    });

    clickTab(panel, 'tab-citizens');

    const foodBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent?.includes('Food'));
    expect(foodBtn).toBeTruthy();
    foodBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetCityFocus).toHaveBeenCalledWith(city.id, 'food');
  });

  it('shows a Custom indicator when city focus is custom', () => {
    const state = createNewGame(undefined, 'citizens-custom');
    const city = { ...foundCity('player', { q: 15, r: 15 }, state.map, mkC()), focus: 'custom' as const };
    state.cities[city.id] = city;

    const container = document.createElement('div');
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onClose: () => {} });
    clickTab(panel, 'tab-citizens');

    expect(panel.textContent).toContain('Custom');
  });

  it('does not call onToggleWorkedTile when all citizens are already assigned', () => {
    const state = createNewGame(undefined, 'citizens-full');
    const map = state.map;
    // Create a city where all citizens are working (population === workedCount)
    const baseCity = foundCity('player', { q: 15, r: 15 }, map, mkC());
    const workableTile = baseCity.ownedTiles[0];
    const city = { ...baseCity, population: 1, workedTiles: [workableTile], focus: 'custom' as const };
    state.cities[city.id] = city;
    const onToggleWorkedTile = vi.fn();

    const container = document.createElement('div');
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onClose: () => {},
      onToggleWorkedTile,
    });
    clickTab(panel, 'tab-citizens');

    // Find an idle tile card (not in workedTiles) and try to click it.
    // All citizens are assigned, so the click should be a no-op.
    const idleTiles = Array.from(panel.querySelectorAll('[data-tile-coord]')).filter(el => {
      return !(el as HTMLElement).textContent?.includes('working');
    });
    if (idleTiles.length > 0) {
      idleTiles[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(onToggleWorkedTile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 3: Run build (TypeScript check)**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: zero errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test(mr2): city-panel Districts and Citizens tab coverage"
```
