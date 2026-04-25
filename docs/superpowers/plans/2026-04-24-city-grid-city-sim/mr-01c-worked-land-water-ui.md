# MR 1c: Worked Land And Water UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the city Grid tab into a readable management surface with Overview, Buildings/Core, and Worked Land And Water sections, including focus buttons and manual worked-tile toggles that refresh immediately.

**Architecture:** Keep game rules in `city-work-system.ts` and expose only render-ready view data to DOM builders. `city-panel.ts` owns tabs and callbacks; `main.ts` mutates state through shared system helpers and reopens/rerenders the active panel. The UI uses vertical scrolling and compact cards on iPhone, never a tiny 49-cell worked-land board. Target implementing model: GPT-5.4 Medium.

**Tech Stack:** TypeScript, DOM/CSS, Vitest with jsdom, existing city panel and grid modules.

---

## Source Contract

Spec: `docs/superpowers/specs/2026-04-24-city-grid-city-sim-design.md`

Rules to read before editing source:

- `CLAUDE.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`
- `docs/superpowers/plans/README.md`

MR dependency: complete MR 1a and MR 1b first.

## Files

- Modify: `src/ui/city-panel.ts`
- Modify: `src/ui/city-grid.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/city-panel.test.ts`
- Test helper: `tests/ui/helpers/wonder-panel-fixture.ts`
- Test: `tests/integration/city-hex-tap.test.ts`

## Player Truth Table

| Before | Action | Internal change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| City panel shows `Balanced` and `Worked 0/3 citizens` | Tap `Food` | `assignCityFocus(state, city.id, 'food')` | Focus label changes to `Food focus`; worked count and yields update in the open panel | Full workable tile list |
| Worked Land page shows an unworked tile | Tap `Work` | `setCityWorkedTile(..., true)` | Tile row changes to worked; focus label becomes `Custom`; yields update | Other workable tiles remain visible |
| Worked Land page shows a worked tile | Tap `Unwork` | `setCityWorkedTile(..., false)` | Tile row changes to unworked; worked count decreases; yields update | The same tile remains visible for rework |
| Worked Land page shows `Worked by Corinth` | Tap disabled tile | No mutation | Button remains disabled and label stays visible | The tile remains visible as an unavailable overlap |
| Population exceeds valid tiles | Open Worked Land page | No mutation | `Unassigned citizens: N` is visible | Focus buttons and manual controls remain visible |
| Settler stands too close to a city | Tap Found City | Shared founding blocker rejects | Toast says `Too close to Ephyra`; settler remains selected/on map | Other unit actions remain available |

## Misleading UI Risks

- `Worked by Corinth` is valid only when the claim index says a known friendly city owns the claim.
- `Worked by another city` is used for hidden or foreign claims where the city name is not viewer-safe.
- A tile is `available` only when it is controlled by the city's owner, not the city center, workable terrain or eligible water, and unclaimed by another city.
- The default sort can recommend good focus tiles first, but it must not hide lower-ranked workable tiles.
- Negative tests must prove claimed tiles are disabled, city-center tiles do not appear, and surplus citizens are shown instead of duplicate claims.

## Interaction Replay Checklist

- Click each focus button twice and assert the second click rerenders the current state without stale DOM.
- Work a tile, unwork it, work it again, and reopen the city panel.
- Attempt to click a claimed tile and assert no state change.
- Switch from Food focus to manual work and assert `Custom` appears.
- Navigate away from Worked Land and back; worked state and unassigned count remain correct.

## Task 1: Extend City Panel Callbacks And View Data

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `tests/ui/helpers/wonder-panel-fixture.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Extend the city-panel test fixture selectors**

In `tests/ui/helpers/wonder-panel-fixture.ts`, extend `MockElement` with data-attribute selectors and disabled-button support. Add these fields to the class:

```ts
  className = '';
  disabled = false;
  private _attributes: Record<string, string> = {};
```

Add these methods to the class:

```ts
  setAttribute(name: string, value: string = ''): void {
    this._attributes[name] = value;
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
    if (name === 'disabled') this.disabled = true;
    const dataMatch = name.match(/^data-(.+)$/);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_match: string, char: string) => char.toUpperCase());
      this.dataset[key] = value;
    }
  }

  getAttribute(name: string): string | null {
    if (name === 'disabled' && this.disabled) return '';
    return this._attributes[name] ?? null;
  }

  private descendants(): MockElement[] {
    return this.children.flatMap(child => [child, ...child.descendants()]);
  }

  private matchesSelector(selector: string): boolean {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const dataMatch = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_match: string, char: string) => char.toUpperCase());
      return dataMatch[2] === undefined
        ? this.dataset[key] !== undefined
        : this.dataset[key] === dataMatch[2];
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
```

Replace the current final `return null;` in `querySelector` with:

```ts
    return this.querySelectorAll(selector)[0] ?? null;
```

Replace `querySelectorAll()` with:

```ts
  querySelectorAll(selector: string = ''): MockElement[] {
    if (!selector) return [];
    return this.descendants().filter(child => child.matchesSelector(selector));
  }
```

- [ ] **Step 2: Add failing tests for sections and labels**

In `tests/ui/city-panel.test.ts`, update the fixture import:

```ts
import { collectText, makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
```

Then add:

```ts
it('renders Overview, Buildings/Core, and Worked Land And Water sections in the Grid tab', () => {
  const { container, city, state } = makeWonderPanelFixture();
  city.focus = 'balanced';
  city.workedTiles = [];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  const rendered = collectText(panel);
  expect(rendered).toContain('Overview');
  expect(rendered).toContain('Buildings/Core');
  expect(rendered).toContain('Worked Land And Water');
  expect(rendered).toContain('Worked 0/');
  expect(rendered).toContain('Balanced focus');
});

it('shows surplus unassigned citizens when population exceeds available worked tiles', () => {
  const { container, city, state } = makeWonderPanelFixture();
  city.population = 4;
  city.ownedTiles = [city.position];
  city.workedTiles = [];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  expect(collectText(panel)).toContain('Unassigned citizens: 4');
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL because callbacks and rendered sections do not exist.

- [ ] **Step 4: Update callback interface**

In `src/ui/city-panel.ts`, update `CityPanelCallbacks`:

```ts
import type { City, CityFocus, GameState, HexCoord } from '@/core/types';

export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onMoveQueueItem?: (cityId: string, fromIndex: number, toIndex: number) => void;
  onRemoveQueueItem?: (cityId: string, index: number) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => GameState | void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => GameState | void;
  onClose: () => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
}
```

- [ ] **Step 5: Add safe tab rendering helper**

Keep existing list and wonders behavior. Add a rerender helper in `createCityPanel`:

```ts
const rerenderPanel = (nextState: GameState | void = state) => {
  const renderState = nextState ?? state;
  const refreshedCity = renderState.cities[city.id];
  if (!refreshedCity) {
    panel.remove();
    callbacks.onClose();
    return;
  }

  panel.remove();
  createCityPanel(container, refreshedCity, renderState, callbacks);
};
```

For the Grid tab, call a single helper:

```ts
function renderCityGridTab(
  container: HTMLElement,
  city: City,
  state: GameState,
  callbacks: CityPanelCallbacks,
  rerenderPanel: (nextState?: GameState | void) => void,
): void {
  container.textContent = '';
  createCityGrid(container, city, state.map, {
    onSlotTap: () => {},
    onBuyExpansion: () => {},
    onClose: callbacks.onClose,
  }, undefined, {
    state,
    onSetCityFocus: (cityId, focus) => rerenderPanel(callbacks.onSetCityFocus?.(cityId, focus)),
    onToggleWorkedTile: (cityId, coord, worked) => rerenderPanel(callbacks.onToggleWorkedTile?.(cityId, coord, worked)),
  });
}
```

Keep the existing `createCityGrid` export and add the optional management argument shown above. MR 1d will continue refining the building-grid details without changing the panel callback contract again.

## Task 2: Render Worked Land And Water Cards

**Files:**
- Modify: `src/ui/city-grid.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Add failing farm/water/claimed tile tests**

In `tests/ui/city-panel.test.ts`, add this import:

```ts
import { hexKey } from '@/systems/hex-utils';
```

Then add:

```ts
it('shows farm and water worked-land rows with yields', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const farm = { q: city.position.q + 1, r: city.position.r };
  const coast = { q: city.position.q, r: city.position.r + 1 };
  state.map.tiles[hexKey(farm)] = {
    ...state.map.tiles[hexKey(farm)],
    coord: farm,
    terrain: 'grassland',
    elevation: 'lowland',
    improvement: 'farm',
    improvementTurnsLeft: 0,
    owner: city.owner,
    hasRiver: false,
    wonder: null,
    resource: null,
  };
  state.map.tiles[hexKey(coast)] = {
    ...state.map.tiles[hexKey(coast)],
    coord: coast,
    terrain: 'coast',
    elevation: 'lowland',
    improvement: 'none',
    improvementTurnsLeft: 0,
    owner: city.owner,
    hasRiver: false,
    wonder: null,
    resource: null,
  };
  city.ownedTiles = [city.position, farm, coast];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  const rendered = collectText(panel);
  expect(rendered).toContain('Farm');
  expect(rendered).toContain('Water work: fishing/trapping');
});

it('shows claimed overlap tiles as unavailable', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const claimed = { q: city.position.q + 1, r: city.position.r };
  const otherCity = { ...city, id: 'city-other', name: 'Corinth', workedTiles: [claimed] };
  state.cities[otherCity.id] = otherCity;
  state.map.tiles[hexKey(claimed)] = {
    ...state.map.tiles[hexKey(claimed)],
    coord: claimed,
    terrain: 'grassland',
    elevation: 'lowland',
    improvement: 'none',
    improvementTurnsLeft: 0,
    owner: city.owner,
    hasRiver: false,
    wonder: null,
    resource: null,
  };
  city.ownedTiles = [city.position, claimed];
  city.workedTiles = [];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  expect(collectText(panel)).toContain('Worked by Corinth');
  expect(panel.querySelector('[data-worked-tile-action="work"]')?.getAttribute('disabled')).not.toBeNull();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL until UI renders worked-land rows.

- [ ] **Step 3: Add rendering helpers in `city-grid.ts`**

Import:

```ts
import type { CityFocus, GameState, HexCoord } from '@/core/types';
import { getWorkableTilesForCity } from '@/systems/city-work-system';
import { calculateCityYields } from '@/systems/resource-system';
import { hexKey } from '@/systems/hex-utils';
```

Add an options type:

```ts
interface CityManagementOptions {
  state: GameState;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => void;
}
```

Update `createCityGrid` to accept the options as the sixth argument:

```ts
export function createCityGrid(
  container: HTMLElement,
  city: City,
  map: GameMap,
  callbacks: CityGridCallbacks,
  suggestedBuilding?: string,
  managementOptions?: CityManagementOptions,
): HTMLElement {
```

Add these helpers below `CityManagementOptions`:

```ts
function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function formatYield(yieldValue: { food: number; production: number; gold: number; science: number }): string {
  const parts: string[] = [];
  if (yieldValue.food) parts.push(`+${yieldValue.food} food`);
  if (yieldValue.production) parts.push(`+${yieldValue.production} production`);
  if (yieldValue.gold) parts.push(`+${yieldValue.gold} gold`);
  if (yieldValue.science) parts.push(`+${yieldValue.science} science`);
  return parts.length > 0 ? parts.join(', ') : 'No yield';
}

function formatFocusLabel(focus: CityFocus): string {
  return `${titleCase(focus)} focus`;
}
```

Add this renderer and call it before the existing building-grid board:

```ts
function renderOverviewSection(root: HTMLElement, city: City, options: CityManagementOptions): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const heading = document.createElement('h3');
  heading.textContent = 'Overview';
  section.appendChild(heading);

  const yields = calculateCityYields(city, options.state.map);
  const summary = document.createElement('div');
  summary.textContent = [
    `Population ${city.population}`,
    formatFocusLabel(city.focus),
    `Food +${yields.food}`,
    `Production +${yields.production}`,
    `Gold +${yields.gold}`,
    `Science +${yields.science}`,
  ].join(' · ');
  section.appendChild(summary);
  root.appendChild(section);
}

function renderBuildingsCoreSection(root: HTMLElement, city: City): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const heading = document.createElement('h3');
  heading.textContent = 'Buildings/Core';
  section.appendChild(heading);

  const placedBuildingIds = city.grid.flat().filter((buildingId): buildingId is string => Boolean(buildingId));
  const summary = document.createElement('div');
  summary.textContent = placedBuildingIds.length > 0
    ? placedBuildingIds.map(buildingId => BUILDINGS[buildingId]?.name ?? titleCase(buildingId)).join(', ')
    : 'City Center';
  section.appendChild(summary);
  root.appendChild(section);
}

function renderWorkedLandSection(root: HTMLElement, city: City, options: CityManagementOptions): void {
  const section = document.createElement('section');
  section.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const heading = document.createElement('h3');
  heading.textContent = 'Worked Land And Water';
  section.appendChild(heading);

  const workedKeys = new Set((city.workedTiles ?? []).map(coord => hexKey(coord)));
  const workedCount = Math.min(city.population, workedKeys.size);
  const unassigned = Math.max(0, city.population - workedCount);

  const summary = document.createElement('div');
  summary.textContent = `Worked ${workedCount}/${city.population} citizens · ${formatFocusLabel(city.focus)}`;
  section.appendChild(summary);

  if (unassigned > 0) {
    const unassignedLabel = document.createElement('div');
    unassignedLabel.textContent = `Unassigned citizens: ${unassigned}`;
    section.appendChild(unassignedLabel);
  }

  const focusWrap = document.createElement('div');
  focusWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const focusModes: Array<Exclude<CityFocus, 'custom'>> = ['balanced', 'food', 'production', 'gold', 'science'];
  for (const focus of focusModes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cityFocus = focus;
    button.textContent = `${focus[0].toUpperCase()}${focus.slice(1)}`;
    button.addEventListener('click', () => options.onSetCityFocus?.(city.id, focus));
    focusWrap.appendChild(button);
  }
  section.appendChild(focusWrap);

  for (const entry of getWorkableTilesForCity(options.state, city.id)) {
    const tile = options.state.map.tiles[hexKey(entry.coord)];
    if (!tile) continue;
    const worked = workedKeys.has(hexKey(entry.coord));
    const row = document.createElement('div');
    row.style.cssText = [
      'display:grid',
      'grid-template-columns:minmax(0,1fr) auto',
      'gap:8px',
      'align-items:center',
      'padding:10px',
      'border:1px solid rgba(255,255,255,0.14)',
      'border-radius:8px',
    ].join(';');

    const text = document.createElement('div');
    const labels = [titleCase(tile.terrain), formatYield(entry.yield)];
    if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) labels.push(titleCase(tile.improvement));
    if (entry.isWater) labels.push('Water work: fishing/trapping');
    if (entry.claim) {
      const claimingCity = options.state.cities[entry.claim.cityId];
      labels.push(claimingCity && claimingCity.owner === city.owner ? `Worked by ${claimingCity.name}` : 'Worked by another city');
    } else {
      labels.push(worked ? 'Working' : 'Available');
    }
    text.textContent = labels.join(' · ');
    row.appendChild(text);

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.workedTileAction = worked ? 'unwork' : 'work';
    button.textContent = worked ? 'Unwork' : 'Work';
    button.disabled = !entry.available && !worked;
    button.addEventListener('click', () => options.onToggleWorkedTile?.(city.id, entry.coord, !worked));
    row.appendChild(button);
    section.appendChild(row);
  }

  root.appendChild(section);
}
```

Replace the existing `panel.innerHTML = html;` assignment with this block so the management sections render before the legacy building board:

```ts
if (managementOptions) {
  const managementRoot = document.createElement('div');
  managementRoot.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'gap:12px',
    'max-width:720px',
    'margin:0 auto',
  ].join(';');
  renderOverviewSection(managementRoot, city, managementOptions);
  renderBuildingsCoreSection(managementRoot, city);
  renderWorkedLandSection(managementRoot, city, managementOptions);

  const boardRoot = document.createElement('div');
  boardRoot.innerHTML = html;
  panel.appendChild(managementRoot);
  panel.appendChild(boardRoot);
} else {
  panel.innerHTML = html;
}
```

- [ ] **Step 4: Use responsive layout**

In the grid tab wrapper, use styles equivalent to:

```ts
root.style.cssText = [
  'display:flex',
  'flex-direction:column',
  'gap:12px',
  'max-width:720px',
  'margin:0 auto',
].join(';');
```

For worked land rows:

```ts
row.style.cssText = [
  'display:grid',
  'grid-template-columns:minmax(0,1fr) auto',
  'gap:8px',
  'align-items:center',
  'padding:10px',
  'border:1px solid rgba(255,255,255,0.14)',
  'border-radius:8px',
].join(';');
```

Avoid horizontal scrolling for worked land. The list must wrap labels naturally on narrow screens.

- [ ] **Step 5: Run UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: PASS.

## Task 3: Wire Focus And Manual Assignment Through `main.ts`

**Files:**
- Modify: `src/main.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Add interaction tests**

In `tests/ui/city-panel.test.ts`, add:

```ts
it('clicking a focus button calls focus callback and rerenders from the returned state', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const onSetCityFocus = vi.fn((_cityId, focus) => {
    const nextState = {
      ...state,
      cities: {
        ...state.cities,
        [city.id]: { ...city, focus, workedTiles: [] },
      },
    };
    return nextState;
  });
  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus,
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  panel.querySelector<HTMLButtonElement>('[data-city-focus="food"]')?.click();

  expect(onSetCityFocus).toHaveBeenCalledWith(city.id, 'food');
  expect(collectText(container)).toContain('Food focus');
});

it('manual work button calls tile toggle callback with coordinates', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const target = { q: city.position.q + 1, r: city.position.r };
  state.map.tiles[hexKey(target)] = {
    ...state.map.tiles[hexKey(target)],
    coord: target,
    terrain: 'grassland',
    elevation: 'lowland',
    owner: city.owner,
    improvement: 'none',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    resource: null,
  };
  city.ownedTiles = [city.position, target];
  const onToggleWorkedTile = vi.fn();
  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile,
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  panel.querySelector<HTMLButtonElement>('[data-worked-tile-action="work"]')?.click();

  expect(onToggleWorkedTile).toHaveBeenCalledWith(city.id, target, true);
});
```

- [ ] **Step 2: Run tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL until callbacks are attached.

- [ ] **Step 3: Wire state mutation in `main.ts`**

Import:

```ts
import { assignCityFocus, setCityWorkedTile } from '@/systems/city-work-system';
```

When opening `createCityPanel`, pass:

```ts
onSetCityFocus: (cityId, focus) => {
  const result = assignCityFocus(gameState, cityId, focus);
  gameState = result.state;
  showNotification(`${gameState.cities[cityId].name} reassigned citizens for ${focus} focus.`, 'info');
  return gameState;
},
onToggleWorkedTile: (cityId, coord, worked) => {
  const result = setCityWorkedTile(gameState, cityId, coord, worked);
  gameState = result.state;
  if (!result.changed && result.reason === 'claimed') {
    showNotification('That tile is already worked by another city.', 'warning');
  }
  return gameState;
},
```

Keep the rerender centralized in `createCityPanel` by returning the updated `gameState` from these callbacks. The open panel must refresh immediately from the returned state rather than from the stale `state` object captured when the panel first opened.

- [ ] **Step 4: Run tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: PASS.

## Task 4: Player Founding Blocker UI Regression

**Files:**
- Test: `tests/integration/city-hex-tap.test.ts`

- [ ] **Step 1: Add regression for too-close founding feedback**

Add imports:

```ts
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
```

Add this test:

```ts
it('uses shared founding blockers for player-facing too-close city feedback', () => {
  const state = createNewGame(undefined, 'player-too-close-founding', 'small');
  const playerId = state.currentPlayer;
  const settlerId = state.civilizations[playerId].units.find(id => state.units[id]?.type === 'settler')!;
  const settler = state.units[settlerId];
  const existingCity = foundCity(playerId, { q: settler.position.q + 2, r: settler.position.r }, state.map);
  state.cities[existingCity.id] = existingCity;
  state.civilizations[playerId].cities.push(existingCity.id);

  const blockers = getCityFoundingBlockers(state, settler.position, { ignoreUnitId: settler.id });
  const message = formatCityFoundingBlockerMessage(blockers);

  expect(blockers).toContainEqual(expect.objectContaining({ reason: 'too-close', cityId: existingCity.id }));
  expect(message).toContain(`Too close to ${existingCity.name}`);
  expect(state.units[settler.id]).toBeDefined();
  expect(Object.values(state.cities).filter(city => city.owner === playerId)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the chosen test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/integration/city-hex-tap.test.ts
```

Expected: PASS after MR 1a wiring.

## Task 5: Verification And Commit

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/ui/city-panel.ts src/ui/city-grid.ts src/main.ts
```

Expected: no rule violations.

- [ ] **Step 2: Run UI and integration tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/integration/city-hex-tap.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Commit MR 1c**

Run:

```bash
git add src/ui/city-panel.ts src/ui/city-grid.ts src/main.ts tests/ui/city-panel.test.ts tests/ui/helpers/wonder-panel-fixture.ts tests/integration/city-hex-tap.test.ts
git commit -m "feat(city): add worked land management UI"
```
