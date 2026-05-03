# Idle Production & Build Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve [issue #159](https://github.com/a1flecke/conquestoria/issues/159) — make the city idle-production selector always visible, render at-a-glance map badges for what each city is doing, and surface idle-converted yields in the HUD's per-turn rates.

**Architecture:** A single-source-of-truth `PRODUCTION_ICONS` map lives in `src/systems/city-system.ts` alongside `BUILDINGS` and `TRAINABLE_UNITS`. The city panel imports the map to prefix every build-list and queue entry. The city renderer imports the map to draw two new corner badges (top-left = idle mode when queue empty; bottom-right = current build when queue non-empty), gated to the current player's own cities for privacy. `calculateProjectedCityYields` shifts production → gold/science when a city is idle so the HUD's per-turn rates match what `processCity` will apply at turn end.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-02-idle-production-and-build-badges-design.md](../specs/2026-05-02-idle-production-and-build-badges-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/systems/city-system.ts` | Modify | Add `PRODUCTION_ICONS` map after `TRAINABLE_UNITS` |
| `src/systems/city-work-system.ts` | Modify | `calculateProjectedCityYields` shifts production→gold/science when idle |
| `src/ui/city-panel.ts` | Modify | Always-render idle selector, replace literal `🏗️`/`⚔️` prefixes with `PRODUCTION_ICONS` lookup, add icons to current production + queue rows |
| `src/renderer/city-renderer.ts` | Modify | Add `getProductionBadgeIcon` helper, draw top-left idle badge + bottom-right build badge with ownership gate |
| `tests/systems/city-system.test.ts` | Modify | Add icon-coverage regression tests |
| `tests/systems/city-work-system.test.ts` | Modify (or create) | Add idle-yield projection tests |
| `tests/ui/city-panel.test.ts` | Modify | Update existing test, add science/none button click tests, build-list icon tests |
| `tests/renderer/city-renderer.test.ts` | Modify | Add badge-helper tests, ownership-gate tests, badge rendering tests |
| `.claude/rules/end-to-end-wiring.md` | Modify | Add `PRODUCTION_ICONS` wiring rule |

---

## Task 1: PRODUCTION_ICONS map + coverage regression

**Files:**
- Modify: `src/systems/city-system.ts` (after `TRAINABLE_UNITS` definition, around line 95)
- Test: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Add the PRODUCTION_ICONS export to city-system.ts**

In `src/systems/city-system.ts`, find the end of the `TRAINABLE_UNITS` array (around line 94, after the `]`). Add the following block immediately after:

```ts
export const PRODUCTION_ICONS: Record<string, string> = {
  // Buildings
  granary: '🌾',
  herbalist: '🌿',
  aqueduct: '💧',
  workshop: '🔨',
  forge: '🔥',
  lumbermill: '🪵',
  'quarry-building': '⛏️',
  library: '📚',
  archive: '📜',
  observatory: '🔭',
  marketplace: '🏪',
  harbor: '⚓',
  barracks: '🪖',
  walls: '🧱',
  stable: '🐴',
  temple: '🛕',
  monument: '🗿',
  amphitheater: '🎭',
  shrine: '⛩️',
  forum: '📢',
  safehouse: '🏠',
  'intelligence-agency': '🛡️',
  'security-bureau': '🔒',
  // Units
  warrior: '⚔️',
  archer: '🏹',
  scout: '🔍',
  worker: '🪚',
  settler: '🏕️',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  galley: '⛵',
  trireme: '🚢',
  spy_scout: '👁️',
  spy_informant: '📡',
  spy_agent: '🕵️',
  spy_operative: '🎯',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '👤',
  war_hound: '🐺',
};

export const PRODUCTION_ICON_FALLBACK = '🏗️';
```

- [ ] **Step 2: Add coverage regression tests**

Append to `tests/systems/city-system.test.ts` (inside the existing `describe` block or as a new top-level `describe`):

```ts
import { BUILDINGS, TRAINABLE_UNITS, PRODUCTION_ICONS } from '@/systems/city-system';

describe('PRODUCTION_ICONS coverage', () => {
  it('has an entry for every building in BUILDINGS', () => {
    for (const buildingId of Object.keys(BUILDINGS)) {
      expect(PRODUCTION_ICONS[buildingId], `missing icon for building "${buildingId}"`).toBeTruthy();
    }
  });

  it('has an entry for every unit in TRAINABLE_UNITS', () => {
    for (const unit of TRAINABLE_UNITS) {
      expect(PRODUCTION_ICONS[unit.type], `missing icon for unit "${unit.type}"`).toBeTruthy();
    }
  });

  it('every icon is a non-empty string', () => {
    for (const [id, icon] of Object.entries(PRODUCTION_ICONS)) {
      expect(typeof icon, `icon for "${id}" must be string`).toBe('string');
      expect(icon.length, `icon for "${id}" must be non-empty`).toBeGreaterThan(0);
    }
  });
});
```

If the existing file has its own `import` line for `BUILDINGS`/`TRAINABLE_UNITS`, merge `PRODUCTION_ICONS` into that import instead of adding a duplicate.

- [ ] **Step 3: Run the regression tests**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/systems/city-system.test.ts
```

Expected: PASS for the three new tests. If a building or unit fails coverage, add the missing entry to `PRODUCTION_ICONS`.

- [ ] **Step 4: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): add PRODUCTION_ICONS map with coverage regression"
```

---

## Task 2: Idle-aware HUD per-turn yield projection

**Files:**
- Modify: `src/systems/city-work-system.ts` (function `calculateProjectedCityYields`, lines 236-249)
- Test: `tests/systems/city-work-system.test.ts` (modify or create)

- [ ] **Step 1: Write the failing tests**

Open or create `tests/systems/city-work-system.test.ts`. Add a new describe block:

```ts
import { describe, it, expect } from 'vitest';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import type { GameState, City } from '@/core/types';

function makeIdleProjectionState(idleProduction: 'gold' | 'science' | null, queue: string[] = []): { state: GameState; cityId: string } {
  const map = generateMap(20, 20, `idle-projection-${idleProduction ?? 'none'}-${queue.length}`);
  const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
  const founded = foundCity('player', tile.coord, map);
  const city: City = { ...founded, productionQueue: queue, idleProduction };
  const state = {
    turn: 1, era: 1, currentPlayer: 'player', hotSeat: false,
    gameOver: false, winner: null, map,
    units: {},
    cities: { [city.id]: city },
    civilizations: {
      player: {
        id: 'player', name: 'Test', color: '#fff', isHuman: true, civType: 'generic',
        cities: [city.id], units: [], gold: 0, score: 0,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        visibility: { tiles: {} },
        diplomacy: {
          relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
  } as unknown as GameState;
  return { state, cityId: city.id };
}

describe('calculateProjectedCityYields — idle production projection', () => {
  it('shifts production into gold when city is idle with idleProduction=gold', () => {
    const baseline = makeIdleProjectionState(null);
    const baseYields = calculateProjectedCityYields(baseline.state, baseline.cityId);

    const idle = makeIdleProjectionState('gold');
    const idleYields = calculateProjectedCityYields(idle.state, idle.cityId);

    expect(idleYields.production).toBe(0);
    expect(idleYields.gold).toBe(baseYields.gold + baseYields.production);
    expect(idleYields.science).toBe(baseYields.science);
  });

  it('shifts production into science when city is idle with idleProduction=science', () => {
    const baseline = makeIdleProjectionState(null);
    const baseYields = calculateProjectedCityYields(baseline.state, baseline.cityId);

    const idle = makeIdleProjectionState('science');
    const idleYields = calculateProjectedCityYields(idle.state, idle.cityId);

    expect(idleYields.production).toBe(0);
    expect(idleYields.science).toBe(baseYields.science + baseYields.production);
    expect(idleYields.gold).toBe(baseYields.gold);
  });

  it('does NOT shift when productionQueue is non-empty even with idleProduction set', () => {
    const baseline = makeIdleProjectionState(null);
    const baseYields = calculateProjectedCityYields(baseline.state, baseline.cityId);

    const queued = makeIdleProjectionState('gold', ['warrior']);
    const queuedYields = calculateProjectedCityYields(queued.state, queued.cityId);

    expect(queuedYields.production).toBe(baseYields.production);
    expect(queuedYields.gold).toBe(baseYields.gold);
  });

  it('does NOT shift when idleProduction is null', () => {
    const a = makeIdleProjectionState(null);
    const aYields = calculateProjectedCityYields(a.state, a.cityId);

    const b = makeIdleProjectionState(null);
    const bYields = calculateProjectedCityYields(b.state, b.cityId);

    expect(aYields).toEqual(bYields);
    expect(aYields.production).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests, expect failure**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/systems/city-work-system.test.ts
```

Expected: 3 of the 4 new tests FAIL (the `null` baseline test passes; the other three fail because no shift logic exists yet).

- [ ] **Step 3: Modify calculateProjectedCityYields to apply the shift**

In `src/systems/city-work-system.ts`, replace the body of `calculateProjectedCityYields` (lines 236-249) with:

```ts
export function calculateProjectedCityYields(
  state: GameState,
  cityId: string,
  bonusEffect?: CivBonusEffect,
): ResourceYield {
  const city = state.cities[cityId];
  if (!city) return { food: 0, production: 0, gold: 0, science: 0 };

  const workResult = city.focus === 'custom'
    ? normalizeWorkedTilesForCity(state, cityId)
    : assignCityFocus(state, cityId, city.focus);
  const projectedCity = workResult.state.cities[cityId] ?? city;
  const yields = calculateCityYields(projectedCity, workResult.state.map, bonusEffect);

  if (city.productionQueue.length === 0 && city.idleProduction) {
    if (city.idleProduction === 'gold') {
      return { ...yields, production: 0, gold: yields.gold + yields.production };
    }
    if (city.idleProduction === 'science') {
      return { ...yields, production: 0, science: yields.science + yields.production };
    }
  }

  return yields;
}
```

- [ ] **Step 4: Run the tests, expect all to pass**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/systems/city-work-system.test.ts
```

Expected: all 4 new tests PASS.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run:
```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all tests PASS. If any fail, the projection change has a downstream impact — investigate before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/systems/city-work-system.ts tests/systems/city-work-system.test.ts
git commit -m "feat(yields): project idle production conversion into gold/science yields"
```

---

## Task 3: Always-visible idle selector + button click coverage

**Files:**
- Modify: `src/ui/city-panel.ts` (lines 94-112)
- Test: `tests/ui/city-panel.test.ts` (lines 836-898)

- [ ] **Step 1: Update the existing failing test (queue non-empty)**

In `tests/ui/city-panel.test.ts`, find the test at line 856 (`'does not show idle mode selector when production queue is non-empty'`). Replace its body:

```ts
  it('shows idle mode selector even when production queue is non-empty', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['warrior'];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('data-idle-mode');
  });
```

- [ ] **Step 2: Add new tests for science and none button clicks**

Append inside the same `describe('city-panel idle production selector', …)` block (after the gold-button test, before the closing `});`):

```ts
  it('calls onSetIdleProduction with science when Science button is clicked', () => {
    const { container, city, state } = makeIdleCityFixture();
    const onSetIdleProduction = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetIdleProduction: (cityId: string, mode: 'gold' | 'science' | null) => {
        state.cities[cityId] = { ...state.cities[cityId]!, idleProduction: mode };
        onSetIdleProduction(cityId, mode);
      },
    });
    const sciBtn = panel.querySelector<HTMLElement>('[data-idle-mode="science"]');
    expect(sciBtn).toBeTruthy();
    sciBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetIdleProduction).toHaveBeenCalledWith(city.id, 'science');
  });

  it('calls onSetIdleProduction with null when None button is clicked', () => {
    const { container, city, state } = makeIdleCityFixture();
    city.idleProduction = 'gold';
    state.cities[city.id] = city;
    const onSetIdleProduction = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetIdleProduction: (cityId: string, mode: 'gold' | 'science' | null) => {
        state.cities[cityId] = { ...state.cities[cityId]!, idleProduction: mode };
        onSetIdleProduction(cityId, mode);
      },
    });
    const noneBtn = panel.querySelector<HTMLElement>('[data-idle-mode="none"]');
    expect(noneBtn).toBeTruthy();
    noneBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetIdleProduction).toHaveBeenCalledWith(city.id, null);
  });
```

- [ ] **Step 3: Run the tests, expect failures**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/ui/city-panel.test.ts
```

Expected: the inverted test FAILS ("expected to contain data-idle-mode" — it's hidden when queue is non-empty under current code). The science/none tests PASS already (since they use `makeIdleCityFixture()` with empty queue — but they're new coverage that needs the panel handler logic which already exists).

- [ ] **Step 4: Remove the queue-empty guard and update the label**

In `src/ui/city-panel.ts`, replace lines 94-112 (the entire `idleSelectorHtml` block):

```ts
  // Idle production selector — always visible; conversion only fires when queue is empty.
  const activeMode = city.idleProduction ?? 'none';
  const goldActive = activeMode === 'gold' ? 'border-color:#d4aa2c;background:rgba(212,170,44,0.3);' : '';
  const sciActive = activeMode === 'science' ? 'border-color:#6496ff;background:rgba(100,150,255,0.3);' : '';
  const noneActive = activeMode === 'none' ? 'border-color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.2);' : '';
  const idleSelectorHtml = `
    <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:16px;">
      <div style="font-weight:bold;color:#e8c170;margin-bottom:6px;">Idle Production</div>
      <div style="font-size:12px;opacity:0.7;margin-bottom:8px;">When idle, convert +${yields.production}/turn production to:</div>
      <div style="display:flex;gap:8px;">
        <button type="button" data-idle-mode="gold" style="flex:1;padding:8px;background:rgba(212,170,44,0.15);border:1px solid rgba(212,170,44,0.4);border-radius:6px;color:white;cursor:pointer;font-size:12px;${goldActive}">💰 Gold +${yields.production}/turn</button>
        <button type="button" data-idle-mode="science" style="flex:1;padding:8px;background:rgba(100,150,255,0.15);border:1px solid rgba(100,150,255,0.4);border-radius:6px;color:white;cursor:pointer;font-size:12px;${sciActive}">🔬 Science +${yields.production}/turn</button>
        <button type="button" data-idle-mode="none" style="flex:1;padding:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;cursor:pointer;font-size:12px;${noneActive}">None</button>
      </div>
    </div>
  `;
```

This removes the `if (city.productionQueue.length === 0) {` wrapping and changes the descriptive line from `"Queue is empty — convert ..."` to `"When idle, convert ..."`.

- [ ] **Step 5: Run the tests, expect all to pass**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/ui/city-panel.test.ts
```

Expected: all idle-selector tests PASS (the original 3, the inverted 1, and the 2 new click tests).

- [ ] **Step 6: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): always-visible idle production selector with science/none click coverage"
```

---

## Task 4: Replace literal build-list icons with PRODUCTION_ICONS

**Files:**
- Modify: `src/ui/city-panel.ts` (lines 73, 88, current production block ~line 125, queue rows ~line 282)
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write the failing tests for build-list icon replacement**

Append to `tests/ui/city-panel.test.ts` (as a new top-level describe near the bottom, before the final closing brace):

```ts
describe('city-panel build list icons', () => {
  it('renders the granary icon prefix in the available buildings list', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = [];
    state.cities[city.id] = city;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('🌾');
    // Confirms the literal generic 🏗️ prefix has been replaced for granary.
    // (Buildings without specific icons would still use the fallback.)
  });

  it('renders the warrior icon prefix in the available units list', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = [];
    state.cities[city.id] = city;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('⚔️');
  });

  it('renders the icon for the currently building item', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['workshop'];
    city.productionProgress = 5;
    state.cities[city.id] = city;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    // 🔨 = workshop icon
    expect(html).toContain('🔨');
  });
});
```

- [ ] **Step 2: Run the tests**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/ui/city-panel.test.ts
```

Expected: the warrior test PASSES (literal `⚔️` already present), the granary test FAILS (current code uses literal `🏗️` not `🌾`), the workshop test FAILS (current production block has no icon).

- [ ] **Step 3: Update the import in city-panel.ts**

In `src/ui/city-panel.ts` line 2, replace:

```ts
import { getAvailableBuildings, BUILDINGS, TRAINABLE_UNITS, getTrainableUnitsForCiv } from '@/systems/city-system';
```

with:

```ts
import { getAvailableBuildings, BUILDINGS, TRAINABLE_UNITS, getTrainableUnitsForCiv, PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
```

- [ ] **Step 4: Replace the literal 🏗️ in the available-buildings loop**

In `src/ui/city-panel.ts`, find the loop building `buildItemPlaceholders` (lines 64-78). Replace line 74:

```ts
      <div style="font-weight:bold;font-size:13px;">🏗️ <span data-text="build-name-${idx}"></span></div>
```

with:

```ts
      <div style="font-weight:bold;font-size:13px;">${PRODUCTION_ICONS[b.id] ?? PRODUCTION_ICON_FALLBACK} <span data-text="build-name-${idx}"></span></div>
```

- [ ] **Step 5: Replace the literal ⚔️ in the available-units loop**

In `src/ui/city-panel.ts`, find the unit loop (lines 84-92). Replace line 89:

```ts
      <div style="font-weight:bold;font-size:13px;">⚔️ <span data-text="unit-name-${idx}"></span></div>
```

with:

```ts
      <div style="font-weight:bold;font-size:13px;">${PRODUCTION_ICONS[u.type] ?? PRODUCTION_ICON_FALLBACK} <span data-text="unit-name-${idx}"></span></div>
```

- [ ] **Step 6: Add icon to the current-production block**

In `src/ui/city-panel.ts`, find the current-production block (around lines 114-132). The block currently uses `data-text="prod-name"` populated later via `setText('prod-name', building?.name ?? currentItem)`.

Replace the line that says `<div style="font-weight:bold;color:#e8c170;">Building: <span data-text="prod-name"></span></div>` with:

```ts
        <div style="font-weight:bold;color:#e8c170;">Building: ${PRODUCTION_ICONS[currentItem] ?? PRODUCTION_ICON_FALLBACK} <span data-text="prod-name"></span></div>
```

- [ ] **Step 7: Add icon prefix to follow-up queue rows**

In `src/ui/city-panel.ts`, find the queue rows loop (around lines 161-181). Inside the `for (let idx = 1; ...)` loop, replace the `<div style="font-weight:bold;" data-text="queue-name-${idx}"></div>` line with:

```ts
          <div style="font-weight:bold;">${PRODUCTION_ICONS[city.productionQueue[idx]] ?? PRODUCTION_ICON_FALLBACK} <span data-text="queue-name-${idx}"></span></div>
```

(The icon is interpolated into the literal HTML; the name still flows through `setText` for XSS safety.)

- [ ] **Step 8: Run the tests, expect all to pass**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/ui/city-panel.test.ts
```

Expected: all build-list-icons tests PASS, all idle-selector tests still PASS.

- [ ] **Step 9: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): use PRODUCTION_ICONS for build list, current production, and queue rows"
```

---

## Task 5: Renderer pure helper `getProductionBadgeIcon`

**Files:**
- Modify: `src/renderer/city-renderer.ts` (add export at top of file)
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `tests/renderer/city-renderer.test.ts` (after the existing wrap/breakaway tests, inside the file but outside other `describe` blocks):

```ts
import { getProductionBadgeIcon } from '@/renderer/city-renderer';
import type { City } from '@/core/types';

function makeCityStub(overrides: Partial<City> = {}): City {
  return {
    id: 'c1', name: 'Test', owner: 'player', position: { q: 0, r: 0 },
    population: 1, food: 0, foodNeeded: 10, foodPerTurn: 2,
    productionQueue: [], productionProgress: 0,
    buildings: [], grid: { slots: [], expansionsBought: 0 },
    focus: 'balanced', workedTiles: [], unrestLevel: 0,
    idleProduction: null,
    ...overrides,
  } as unknown as City;
}

describe('getProductionBadgeIcon', () => {
  it('returns the matching icon when productionQueue[0] is a known building', () => {
    const city = makeCityStub({ productionQueue: ['granary'] });
    expect(getProductionBadgeIcon(city)).toBe('🌾');
  });

  it('returns the matching icon when productionQueue[0] is a known unit', () => {
    const city = makeCityStub({ productionQueue: ['warrior'] });
    expect(getProductionBadgeIcon(city)).toBe('⚔️');
  });

  it('returns the fallback icon when productionQueue[0] is unknown (e.g. legendary wonder)', () => {
    const city = makeCityStub({ productionQueue: ['some-legendary-wonder-id'] });
    expect(getProductionBadgeIcon(city)).toBe('🏗️');
  });

  it('returns null when productionQueue is empty', () => {
    const city = makeCityStub({ productionQueue: [] });
    expect(getProductionBadgeIcon(city)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests, expect failure**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/renderer/city-renderer.test.ts
```

Expected: import error or 4 FAILS — `getProductionBadgeIcon` does not yet exist.

- [ ] **Step 3: Implement the helper**

In `src/renderer/city-renderer.ts`, add this import near the top (alongside the existing imports):

```ts
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
```

Then add the helper export immediately after the imports and before the `interface CityRenderInfo` declaration:

```ts
export function getProductionBadgeIcon(city: { productionQueue: string[] }): string | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return PRODUCTION_ICONS[id] ?? PRODUCTION_ICON_FALLBACK;
}
```

- [ ] **Step 4: Run the tests, expect pass**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/renderer/city-renderer.test.ts
```

Expected: all 4 helper tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/city-renderer.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(renderer): add getProductionBadgeIcon helper"
```

---

## Task 6: Bottom-right "currently building" badge with ownership gate

**Files:**
- Modify: `src/renderer/city-renderer.ts` (`drawCities` function, around line 117 inside the existing for-loop)
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Write the failing rendering tests**

Append to `tests/renderer/city-renderer.test.ts` (use the existing `MockCanvasContext` and import `drawCities`):

```ts
describe('drawCities — bottom-right build badge', () => {
  function makeCamera() {
    return {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;
  }

  it('draws the production icon for a player-owned city with a non-empty queue', () => {
    const state = createNewGame(undefined, 'badge-build-render');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    city.productionQueue = ['warrior'];
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).toContain('⚔️');
  });

  it('does NOT draw the production icon for an enemy-owned visible city', () => {
    const state = createNewGame(undefined, 'badge-build-enemy');
    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map);
    aiCity.productionQueue = ['warrior'];
    state.cities[aiCity.id] = aiCity;
    state.civilizations['ai-1'].cities.push(aiCity.id);
    state.civilizations.player.visibility.tiles[hexKey(aiCity.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('⚔️');
  });

  it('does NOT draw a production icon when the queue is empty', () => {
    const state = createNewGame(undefined, 'badge-build-empty');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    city.productionQueue = [];
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('🏗️');
    expect(texts).not.toContain('⚔️');
  });
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/renderer/city-renderer.test.ts
```

Expected: the "draws the production icon for a player-owned city" test FAILS (no badge logic yet); the negative tests PASS by accident.

- [ ] **Step 3: Add the bottom-right badge to drawCities**

In `src/renderer/city-renderer.ts`, find the existing breakaway/occupation/unrest badge block inside `drawCities` (currently lines 102-117 — the `if (breakaway) { … } else if (city.occupation) { … } else if (city.unrestLevel > 0) { … }` chain).

Immediately after the closing `}` of that chain (after line 117, before the closing `}` of the inner `for (const renderCoord …)` loop), add:

```ts
      // Bottom-right badge: currently-building icon (player-owned, non-empty queue only)
      if (city.owner === playerCivId) {
        const buildIcon = getProductionBadgeIcon(city);
        if (buildIcon) {
          ctx.font = `${size * 0.28}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(buildIcon, screen.x + size * 0.45, screen.y + size * 0.45);
        }
      }
```

- [ ] **Step 4: Run the tests, expect all to pass**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/renderer/city-renderer.test.ts
```

Expected: all build-badge tests PASS, including the ownership gate (no `⚔️` for enemy city) and the empty-queue case.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/city-renderer.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(renderer): bottom-right build badge with current-player ownership gate"
```

---

## Task 7: Top-left idle production badge with ownership + queue-empty gate

**Files:**
- Modify: `src/renderer/city-renderer.ts` (`drawCities` function, near the bottom-right badge)
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/renderer/city-renderer.test.ts`:

```ts
describe('drawCities — top-left idle badge', () => {
  function makeCamera() {
    return {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;
  }

  it('draws 💰 for a player-owned idle city with idleProduction=gold', () => {
    const state = createNewGame(undefined, 'badge-idle-gold');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    city.productionQueue = [];
    city.idleProduction = 'gold';
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).toContain('💰');
  });

  it('draws 🔬 for a player-owned idle city with idleProduction=science', () => {
    const state = createNewGame(undefined, 'badge-idle-sci');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    city.productionQueue = [];
    city.idleProduction = 'science';
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).toContain('🔬');
  });

  it('does NOT draw the idle badge when queue is non-empty even with idleProduction set', () => {
    const state = createNewGame(undefined, 'badge-idle-queued');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    city.productionQueue = ['warrior'];
    city.idleProduction = 'gold';
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('💰');
  });

  it('does NOT draw the idle badge for an enemy-owned visible idle city', () => {
    const state = createNewGame(undefined, 'badge-idle-enemy');
    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map);
    aiCity.productionQueue = [];
    aiCity.idleProduction = 'gold';
    state.cities[aiCity.id] = aiCity;
    state.civilizations['ai-1'].cities.push(aiCity.id);
    state.civilizations.player.visibility.tiles[hexKey(aiCity.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('💰');
  });

  it('does NOT draw the idle badge when idleProduction is null', () => {
    const state = createNewGame(undefined, 'badge-idle-null');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    city.productionQueue = [];
    city.idleProduction = null;
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('💰');
    expect(texts).not.toContain('🔬');
  });
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/renderer/city-renderer.test.ts
```

Expected: the two positive tests FAIL (no idle badge drawn yet); negative tests PASS by absence.

- [ ] **Step 3: Add the top-left badge to drawCities**

In `src/renderer/city-renderer.ts`, immediately AFTER the bottom-right badge block (added in Task 6), add:

```ts
      // Top-left badge: idle production mode (player-owned, queue empty, idleProduction set)
      if (
        city.owner === playerCivId &&
        city.productionQueue.length === 0 &&
        (city.idleProduction === 'gold' || city.idleProduction === 'science')
      ) {
        const idleIcon = city.idleProduction === 'gold' ? '💰' : '🔬';
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(idleIcon, screen.x - size * 0.45, screen.y - size * 0.45);
      }
```

- [ ] **Step 4: Run the tests, expect all to pass**

Run:
```bash
eval "$(mise activate bash)" && yarn test tests/renderer/city-renderer.test.ts
```

Expected: all idle-badge tests PASS, all earlier renderer tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/city-renderer.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(renderer): top-left idle badge with ownership + queue-empty gates"
```

---

## Task 8: Add PRODUCTION_ICONS wiring rule

**Files:**
- Modify: `.claude/rules/end-to-end-wiring.md`

- [ ] **Step 1: Append the new wiring section**

Open `.claude/rules/end-to-end-wiring.md` and append (after the "Trainable units must be wired end-to-end" section):

```markdown
## Production icons must be wired end-to-end
- When you add an entry to `BUILDINGS` or `TRAINABLE_UNITS` in `src/systems/city-system.ts`, you MUST also add a matching entry to `PRODUCTION_ICONS` in the same file.
- The icon-coverage regression tests in `tests/systems/city-system.test.ts` will fail if a building or unit lacks an icon, but the rule catches it before the failed test cycle.
- Legendary wonders intentionally fall through to `PRODUCTION_ICON_FALLBACK` ('🏗️'); they are not required to have entries in this map until a follow-up issue adds wonder-specific icons.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/end-to-end-wiring.md
git commit -m "docs(rules): require PRODUCTION_ICONS entry for new buildings/units"
```

---

## Task 9: Final verification — full test + build

**Files:** none

- [ ] **Step 1: Run full test suite**

Run:
```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all tests PASS, including the existing `idle-production-integration.test.ts` and the legacy unrest/breakaway/occupation renderer tests.

- [ ] **Step 2: Run TypeScript build**

Run:
```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exit 0. The `yarn test` script does NOT type-check (per `CLAUDE.md`); only `yarn build` runs `tsc`. If a type error surfaces in `City` (`idleProduction` field), in `PRODUCTION_ICONS` import, or in the renderer helper, fix and re-run.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Run:
```bash
eval "$(mise activate bash)" && yarn dev
```

In the browser:
1. Found a city, verify the build list shows specific icons (🌾 Granary, ⚔️ Warrior, etc.) with no double-prefix.
2. Click a build item → verify the bottom-right badge on the map shows the build's icon (e.g. `🔨` for Workshop).
3. Open the city panel with a non-empty queue → verify the idle selector is still visible.
4. Click the science button → close the panel → set queue to empty (let the build complete) → verify the top-left badge shows `🔬`.
5. (Hot-seat only) End turn → switch to Player 2 → verify Player 1's idle/build badges are NOT visible on Player 1's cities from Player 2's POV.

- [ ] **Step 4: Final commit (if any leftovers)**

If type or smoke fixes were needed:
```bash
git add -A
git commit -m "fix: post-verification adjustments"
```

Otherwise no commit is needed.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin claude/priceless-lewin-e67829
gh pr create --title "feat: idle production options + map build badges (#159)" --body "$(cat <<'EOF'
## Summary
- Always-visible idle production selector in the city panel (gold/science/none) with click-through coverage for all three buttons
- Map badges: top-left for idle conversion mode (player-owned, queue empty), bottom-right for current build (player-owned, queue non-empty), gated to current player for privacy
- Build-list, current-production, and queue rows now show per-item `PRODUCTION_ICONS` (replacing the previous literal 🏗️/⚔️ prefixes)
- HUD per-turn gold/science rates now reflect idle conversion via `calculateProjectedCityYields`
- New wiring rule in `.claude/rules/end-to-end-wiring.md` requiring PRODUCTION_ICONS entries for any new building/unit
- Culture, AI usage, and wonder-specific icons are out of scope (documented in spec)

Closes #159

## Test plan
- [x] `yarn test` — all tests pass including new idle/badge/icon coverage and ownership-gate negative tests
- [x] `yarn build` — type-checks clean
- [x] Manual smoke: idle selector visible regardless of queue state; map badges appear on player cities only; HUD per-turn rates update when toggling idle mode

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §1 Always-visible idle selector | Task 3 |
| §2 HUD per-turn yield wiring | Task 2 |
| §3 Map badges — ownership gate | Tasks 6, 7 (negative tests verify gate) |
| §3 Top-left idle badge | Task 7 |
| §3 Bottom-right build badge | Task 6 |
| §3 Mutual exclusion | Tasks 6, 7 (gate conditions ensure this; "queue non-empty + idle set" test in Task 7 confirms idle hidden) |
| §4 PRODUCTION_ICONS map | Task 1 |
| §4 Replace literal icons in city panel | Task 4 |
| §4 Wonder fallback to 🏗️ | Task 5 (helper test for unknown ID) |
| §5 City panel tests | Task 3 (selector), Task 4 (icons) |
| §5 Renderer tests | Tasks 5, 6, 7 |
| §5 HUD projection tests | Task 2 |
| §5 Icon coverage regression | Task 1 |
| §6 Wiring rule update | Task 8 |

**Placeholder scan:** No "TBD", "TODO", or "implement later". All test bodies and implementation code blocks are concrete. Exact line numbers reference the as-of-spec state of the source files; if the file has shifted by the time the implementer reaches a task, they should re-locate by content (e.g. "find the `if (city.productionQueue.length === 0)` block").

**Type/name consistency:** `PRODUCTION_ICONS` and `PRODUCTION_ICON_FALLBACK` are used consistently in Tasks 1, 4, 5. `getProductionBadgeIcon` defined in Task 5 and used in Task 6. `calculateProjectedCityYields` signature unchanged. `idleProduction` field type (`'gold' | 'science' | null`) unchanged.

**Privacy:** Both badges have explicit `city.owner === playerCivId` gates in Tasks 6 and 7, with negative tests proving enemy cities don't leak.

**Build/test ordering:** Tests are written first; implementation makes them pass; commits land after each task. Final task runs `yarn build && yarn test` per CLAUDE.md.
