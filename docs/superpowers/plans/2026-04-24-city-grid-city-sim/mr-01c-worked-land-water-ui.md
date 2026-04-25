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
- Test: `tests/integration/city-hex-tap.test.ts` if player founding UI feedback is covered there

## Player Truth Table

| Before | Action | Internal change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| City panel shows `Balanced` and `Worked 0/3 citizens` | Tap `Food` | `assignCityFocus(state, city.id, 'food')` | Focus label changes to `Food focus`; worked count and yields update in the open panel | All workable tiles via `Show all` or full list |
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
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Add failing tests for sections and labels**

In `tests/ui/city-panel.test.ts`, add:

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
  expect(panel.textContent).toContain('Overview');
  expect(panel.textContent).toContain('Buildings/Core');
  expect(panel.textContent).toContain('Worked Land And Water');
  expect(panel.textContent).toContain('Worked 0/');
  expect(panel.textContent).toContain('Balanced focus');
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
  expect(panel.textContent).toContain('Unassigned citizens: 4');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL because callbacks and rendered sections do not exist.

- [ ] **Step 3: Update callback interface**

In `src/ui/city-panel.ts`, update `CityPanelCallbacks`:

```ts
import type { City, CityFocus, GameState, HexCoord } from '@/core/types';

export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onMoveQueueItem?: (cityId: string, fromIndex: number, toIndex: number) => void;
  onRemoveQueueItem?: (cityId: string, index: number) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => void;
  onClose: () => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
}
```

- [ ] **Step 4: Add safe tab rendering helper**

Keep existing list and wonders behavior. For the Grid tab, call a single helper:

```ts
function renderCityGridTab(
  container: HTMLElement,
  city: City,
  state: GameState,
  callbacks: CityPanelCallbacks,
): void {
  container.textContent = '';
  container.appendChild(createCityGrid(container.ownerDocument.createElement('div'), city, state.map, {
    onSlotTap: () => {},
    onBuyExpansion: () => {},
    onClose: callbacks.onClose,
  }, undefined, {
    state,
    onSetCityFocus: callbacks.onSetCityFocus,
    onToggleWorkedTile: callbacks.onToggleWorkedTile,
  }));
}
```

Split a new `createCityManagementGrid` helper in `src/ui/city-grid.ts` and keep the old `createCityGrid` export as a thin wrapper until MR 1d replaces building-grid details.

## Task 2: Render Worked Land And Water Cards

**Files:**
- Modify: `src/ui/city-grid.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Add failing farm/water/claimed tile tests**

In `tests/ui/city-panel.test.ts`, add:

```ts
it('shows farm and water worked-land rows with yields', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const farm = { q: city.position.q + 1, r: city.position.r };
  const coast = Object.values(state.map.tiles).find(tile => tile.terrain === 'coast')!.coord;
  state.map.tiles[`${farm.q},${farm.r}`] = {
    ...state.map.tiles[`${farm.q},${farm.r}`],
    coord: farm,
    terrain: 'grassland',
    improvement: 'farm',
    improvementTurnsLeft: 0,
    owner: city.owner,
  };
  state.map.tiles[`${coast.q},${coast.r}`].owner = city.owner;
  city.ownedTiles = [city.position, farm, coast];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  expect(panel.textContent).toContain('Farm');
  expect(panel.textContent).toContain('Water work: fishing/trapping');
});

it('shows claimed overlap tiles as unavailable', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const claimed = { q: city.position.q + 1, r: city.position.r };
  const otherCity = { ...city, id: 'city-other', name: 'Corinth', workedTiles: [claimed] };
  state.cities[otherCity.id] = otherCity;
  state.map.tiles[`${claimed.q},${claimed.r}`] = {
    ...state.map.tiles[`${claimed.q},${claimed.r}`],
    coord: claimed,
    owner: city.owner,
  };
  city.ownedTiles = [city.position, claimed];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onSetCityFocus: () => {},
    onToggleWorkedTile: () => {},
  });

  panel.querySelector<HTMLElement>('#tab-grid')?.click();
  expect(panel.textContent).toContain('Worked by Corinth');
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
```

Add an options type:

```ts
interface CityManagementOptions {
  state: GameState;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => void;
}
```

Render focus buttons with `button.textContent`:

```ts
const focusModes: Array<Exclude<CityFocus, 'custom'>> = ['balanced', 'food', 'production', 'gold', 'science'];
for (const focus of focusModes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.cityFocus = focus;
  button.textContent = `${focus[0].toUpperCase()}${focus.slice(1)}`;
  button.addEventListener('click', () => options.onSetCityFocus?.(city.id, focus));
  focusWrap.appendChild(button);
}
```

Render worked cards from `getWorkableTilesForCity(options.state, city.id)`. Each card must include terrain, improvement label, yield text, worked state, and claim label. Use `textContent` for all game data.

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
it('clicking a focus button calls focus callback and rerenders expected text', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const onSetCityFocus = vi.fn();
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
});

it('manual work button calls tile toggle callback with coordinates', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const target = city.ownedTiles.find(coord => coord.q !== city.position.q || coord.r !== city.position.r)!;
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
},
onToggleWorkedTile: (cityId, coord, worked) => {
  const result = setCityWorkedTile(gameState, cityId, coord, worked);
  gameState = result.state;
  if (!result.changed && result.reason === 'claimed') {
    showNotification('That tile is already worked by another city.', 'warning');
  }
},
```

If `createCityPanel` already owns reopen behavior after callbacks, keep the rerender centralized there. The open panel must refresh immediately after the state change.

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

Use the existing integration harness if it exposes `handleHexTap` and unit actions. The test must prove:

```ts
expect(state.cities).toHaveProperty(existingCity.id);
expect(Object.values(state.cities).filter(city => city.owner === state.currentPlayer)).toHaveLength(1);
expect(state.units[settler.id]).toBeDefined();
expect(notificationText).toContain('Too close to');
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
git add src/ui/city-panel.ts src/ui/city-grid.ts src/main.ts tests/ui/city-panel.test.ts tests/integration/city-hex-tap.test.ts
git commit -m "feat(city): add worked land management UI"
```
