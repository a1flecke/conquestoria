# Idle City Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow cities with an empty production queue to convert their production yield into gold or science each turn, instead of wasting it.

**Architecture:** Add `idleProduction?: 'gold' | 'science' | null` to the `City` type (optional to avoid breaking existing saves and test fixtures); teach `processCity()` to return bonus gold/science when the queue was already empty at turn start and the mode is set; consume those bonuses in `turn-manager.ts` alongside the existing `totalGold`/`totalScience` accumulators; update `getIdleCityIds` so cities with a conversion mode set are not treated as idle (suppresses advisor nag); expose a `setIdleProduction` planning helper; and wire a selector UI into the city panel that shows the per-turn conversion amount.

**Tech Stack:** TypeScript, Vitest, jsdom (for UI tests)

---

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| City panel, empty queue — no idle mode set | — | "Idle Production" selector shown with three buttons: None / 💰 Gold (+N/turn) / 🔬 Science (+N/turn) |
| None is highlighted, click `Gold` | `onSetIdleProduction(cityId, 'gold')` fires | Panel rerenders; Gold button highlighted |
| Gold is highlighted, click `None` | `onSetIdleProduction(cityId, null)` fires | Panel rerenders; None button highlighted |
| City panel, queue has ≥1 item | — | Idle selector is NOT shown (queue is active) |
| End of turn, empty queue at turn start, mode = 'gold' | turn-manager processes city | `civ.gold` increases by `productionYield` that turn |
| End of turn, empty queue at turn start, mode = 'science' | turn-manager processes city | science accumulator increases by `productionYield` that turn |
| End of turn, empty queue at turn start, mode = null | turn-manager processes city | production yield is silently discarded (existing behavior) |
| End of turn, queue had items that complete this turn | turn-manager processes city | idle mode is ignored; production was spent on the build |
| End of turn, non-empty queue, any mode | turn-manager processes city | mode is ignored; normal production progress applies |

## Misleading UI Risks

- The idle selector must only appear when `city.productionQueue.length === 0`. A city with any queued item is not idle — showing the selector would confuse the player.
- Highlight whichever button matches the current conversion mode, including `None` when `idleProduction` is null or undefined. The player needs clear feedback about the current state. All three buttons share the same highlight style; only one gets it.
- Conversion applies to `productionYield` (the computed yield for the turn). Show the actual per-turn amount on each button — e.g. `💰 Gold (+5/turn)` — so the player knows what the choice is worth. Omitting the amount violates the "self-explanatory" rule.
- Conversion applies only when the queue was **already empty** at the start of the turn. A city that completes its last item in a turn does not also produce an idle bonus that turn (the production was spent on the build).
- The panel must not show a progress bar for idle conversion — there is no accumulated progress.

## Interaction Replay Checklist

- Open city panel when queue is empty → idle selector appears with correct mode highlighted
- Click Gold → panel rerenders → Gold is highlighted, amount shown
- Click Science → panel rerenders → Science is highlighted
- Click None → panel rerenders → None is highlighted
- Enqueue an item → panel rerenders → idle selector disappears
- Remove the item → panel rerenders → idle selector reappears, still showing previously chosen mode
- City with `productionDisabledTurns` set produces 0 effective production → idle selector shows `(+0/turn)`, no bonus accrues

---

## File Map

| File | Change |
|---|---|
| `src/core/types.ts` | Add `idleProduction?: 'gold' \| 'science' \| null` to `City` |
| `src/systems/city-system.ts` | `foundCity`: set `idleProduction: null`; `CityProcessResult`: add `idleGoldBonus`/`idleScienceBonus`; `processCity`: compute idle bonuses using original queue length |
| `src/systems/planning-system.ts` | Add `setIdleProduction`; update `getIdleCityIds` to exclude cities with conversion mode set |
| `src/core/turn-manager.ts` | Consume `idleGoldBonus`/`idleScienceBonus` from `processCity` result |
| `src/ui/city-panel.ts` | Add `onSetIdleProduction` callback; render idle selector with per-turn amount when queue empty |
| `src/main.ts` | Wire `onSetIdleProduction` callback |
| `tests/systems/city-system.test.ts` | 4 new tests for `processCity` idle logic (including completion-turn negative case) |
| `tests/systems/planning-system.test.ts` | 4 new tests: 2 for `setIdleProduction`, 2 for `getIdleCityIds` exclusion |
| `tests/ui/city-panel.test.ts` | 3 new tests: selector shows/hides, callback fires, amount displayed |

---

## Task 1: Add `idleProduction` field to `City` type and `foundCity`

**Files:**
- Modify: `src/core/types.ts:283`
- Modify: `src/systems/city-system.ts:163`

- [ ] **Step 1: Add optional field to `City` interface**

  In `src/core/types.ts`, find the `City` interface. After `productionDisabledTurns?: number;` (the last field, around line 283), add:

  ```typescript
  idleProduction?: 'gold' | 'science' | null; // conversion mode when queue is empty
  ```

  The field is **optional** (`?`) so existing saves and test fixtures that don't set it still type-check. Absent or `null` both mean "no conversion" — the processCity condition uses a falsy check.

- [ ] **Step 2: Initialize explicitly in `foundCity`**

  In `src/systems/city-system.ts`, inside `foundCity()`, the returned object ends with `spyUnrestBonus: 0,` (around line 163). Add below it:

  ```typescript
  idleProduction: null,
  ```

  This is for clarity — `undefined` would also mean no conversion, but explicit `null` documents intent.

- [ ] **Step 3: Verify build passes**

  ```bash
  eval "$(mise activate bash)" && yarn build 2>&1 | tail -10
  ```
  Expected: exit 0. Because the field is optional, no existing code needs updating — TypeScript will not error on City literals that don't include it.

- [ ] **Step 4: Commit**

  ```bash
  git add src/core/types.ts src/systems/city-system.ts
  git commit -m "feat(types): add optional idleProduction field to City"
  ```

---

## Task 2: Add `setIdleProduction` and update `getIdleCityIds` in `planning-system.ts`

**Files:**
- Modify: `src/systems/planning-system.ts`
- Modify: `tests/systems/planning-system.test.ts`

- [ ] **Step 1: Write the failing tests**

  In `tests/systems/planning-system.test.ts`, after the last `describe` block, add:

  ```typescript
  describe('setIdleProduction', () => {
    it('sets idleProduction mode on the city', () => {
      const city = { productionQueue: [], idleProduction: null } as any;
      const updated = setIdleProduction(city, 'gold');
      expect(updated.idleProduction).toBe('gold');
      expect(updated.productionQueue).toEqual([]);
    });

    it('clears idleProduction when mode is null', () => {
      const city = { productionQueue: [], idleProduction: 'science' } as any;
      const cleared = setIdleProduction(city, null);
      expect(cleared.idleProduction).toBeNull();
    });
  });

  describe('getIdleCityIds', () => {
    it('excludes cities that have idleProduction set even if queue is empty', () => {
      const map = generateMap(20, 20, 'idle-exclude');
      const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
      const city = { ...foundCity('player', tile.coord, map), idleProduction: 'gold' as const };
      const state = createNewGame({});
      state.cities = { [city.id]: city };
      state.civilizations[state.currentPlayer].cities = [city.id];

      const ids = getIdleCityIds(state, state.currentPlayer);
      expect(ids).not.toContain(city.id);
    });

    it('includes cities with empty queue and no idleProduction set', () => {
      const map = generateMap(20, 20, 'idle-include');
      const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
      const city = { ...foundCity('player', tile.coord, map), idleProduction: null };
      const state = createNewGame({});
      state.cities = { [city.id]: city };
      state.civilizations[state.currentPlayer].cities = [city.id];

      const ids = getIdleCityIds(state, state.currentPlayer);
      expect(ids).toContain(city.id);
    });
  });
  ```

  Update the imports at the top of the file:

  ```typescript
  import {
    enqueueCityProduction,
    enqueueResearch,
    getIdleCityIds,
    getRecommendedIdleCityChoice,
    moveQueuedId,
    needsResearchChoice,
    removeQueuedId,
    reorderCityProduction,
    setIdleProduction,
  } from '@/systems/planning-system';
  import { foundCity } from '@/systems/city-system';
  import { createNewGame } from '@/core/game-state';
  import { generateMap } from '@/systems/map-generator';
  ```

  (Add only the imports that are not already present.)

- [ ] **Step 2: Run the failing tests**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/systems/planning-system.test.ts 2>&1 | tail -20
  ```
  Expected: FAIL — `setIdleProduction is not a function`, and the `getIdleCityIds` tests fail because the function still returns the city with idleProduction set.

- [ ] **Step 3: Implement `setIdleProduction`**

  In `src/systems/planning-system.ts`, at the end of the file, add:

  ```typescript
  export function setIdleProduction(city: City, mode: 'gold' | 'science' | null): City {
    return { ...city, idleProduction: mode };
  }
  ```

- [ ] **Step 4: Update `getIdleCityIds` to exclude cities with conversion mode set**

  In `src/systems/planning-system.ts`, find `getIdleCityIds` (around line 84). It currently has these filters:

  ```typescript
  .filter(city => city.owner === civId)
  .filter(city => city.productionQueue.length === 0)
  .filter(city => {
    const buildableBuildings = getAvailableBuildings(city, completedTechs).length > 0;
    const buildableUnits = TRAINABLE_UNITS.some(unit => !unit.techRequired || completedTechs.includes(unit.techRequired));
    return buildableBuildings || buildableUnits;
  })
  ```

  Add a filter after the `productionQueue.length === 0` check:

  ```typescript
  .filter(city => city.owner === civId)
  .filter(city => city.productionQueue.length === 0)
  .filter(city => !city.idleProduction)
  .filter(city => {
    const buildableBuildings = getAvailableBuildings(city, completedTechs).length > 0;
    const buildableUnits = TRAINABLE_UNITS.some(unit => !unit.techRequired || completedTechs.includes(unit.techRequired));
    return buildableBuildings || buildableUnits;
  })
  ```

- [ ] **Step 5: Run the tests — they must pass**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/systems/planning-system.test.ts 2>&1 | tail -10
  ```
  Expected: all tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add src/systems/planning-system.ts tests/systems/planning-system.test.ts
  git commit -m "feat(planning): add setIdleProduction helper and exclude idle-converting cities from advisor nag"
  ```

---

## Task 3: Add idle conversion logic to `processCity`

**Files:**
- Modify: `src/systems/city-system.ts:208-213` (`CityProcessResult`)
- Modify: `src/systems/city-system.ts:263-295` (`processCity` body)
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write the failing tests**

  In `tests/systems/city-system.test.ts`, inside the existing `describe('processCity', ...)` block, add four tests after the last existing test:

  ```typescript
  it('converts production to gold when queue is empty at turn start and idleProduction is gold', () => {
    const map = generateMap(30, 30, 'idle-gold');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const idle = { ...city, idleProduction: 'gold' as const, productionQueue: [] };

    const result = processCity(idle, map, 0, 8);

    expect(result.idleGoldBonus).toBe(8);
    expect(result.idleScienceBonus).toBe(0);
    expect(result.city.productionProgress).toBe(0);
  });

  it('converts production to science when queue is empty at turn start and idleProduction is science', () => {
    const map = generateMap(30, 30, 'idle-science');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const idle = { ...city, idleProduction: 'science' as const, productionQueue: [] };

    const result = processCity(idle, map, 0, 5);

    expect(result.idleScienceBonus).toBe(5);
    expect(result.idleGoldBonus).toBe(0);
    expect(result.city.productionProgress).toBe(0);
  });

  it('does not produce idle bonus when queue is non-empty even if idleProduction is set', () => {
    const map = generateMap(30, 30, 'idle-ignored');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const active = { ...city, idleProduction: 'gold' as const, productionQueue: ['workshop'], productionProgress: 0 };

    const result = processCity(active, map, 0, 5);

    expect(result.idleGoldBonus).toBe(0);
    expect(result.idleScienceBonus).toBe(0);
    expect(result.city.productionProgress).toBe(5);
  });

  it('does not produce idle bonus when the last queue item completes this turn', () => {
    // workshop costs 12; progress=7 + yield=5 = 12 → completes this turn
    // The production was spent on the build, not on idle conversion
    const map = generateMap(30, 30, 'idle-completion-turn');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const completing = { ...city, idleProduction: 'gold' as const, productionQueue: ['workshop'], productionProgress: 7 };

    const result = processCity(completing, map, 0, 5);

    expect(result.completedBuilding).toBe('workshop');
    expect(result.idleGoldBonus).toBe(0);
    expect(result.idleScienceBonus).toBe(0);
  });
  ```

- [ ] **Step 2: Run the failing tests**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/systems/city-system.test.ts 2>&1 | tail -15
  ```
  Expected: FAIL — `idleGoldBonus` is `undefined`

- [ ] **Step 3: Extend `CityProcessResult`**

  In `src/systems/city-system.ts`, find `CityProcessResult` (around line 208):

  ```typescript
  export interface CityProcessResult {
    city: City;
    grew: boolean;
    completedBuilding: string | null;
    completedUnit: UnitType | null;
  }
  ```

  Replace it with:

  ```typescript
  export interface CityProcessResult {
    city: City;
    grew: boolean;
    completedBuilding: string | null;
    completedUnit: UnitType | null;
    idleGoldBonus: number;
    idleScienceBonus: number;
  }
  ```

- [ ] **Step 4: Add idle conversion logic in `processCity`**

  In `src/systems/city-system.ts`, find the section that starts at `if (newQueue.length > 0) {` (around line 263). Add idle conversion logic **after** that entire block ends and **before** `let nextCity: City = {`.

  **Critical:** check `city.productionQueue.length` (the **original** queue before this turn's processing), not `newQueue.length` (the mutated copy that may be empty after a build completes). Using `newQueue.length` would double-count production on the turn the last item finishes.

  ```typescript
  let idleGoldBonus = 0;
  let idleScienceBonus = 0;
  if (city.productionQueue.length === 0 && city.idleProduction) {
    if (city.idleProduction === 'gold') {
      idleGoldBonus = productionYield;
    } else if (city.idleProduction === 'science') {
      idleScienceBonus = productionYield;
    }
  }
  ```

- [ ] **Step 5: Include the new fields in the return value**

  In `src/systems/city-system.ts`, find the `return {` at the end of `processCity` (around line 311):

  ```typescript
  return {
    city: nextCity,
    grew,
    completedBuilding,
    completedUnit,
  };
  ```

  Replace it with:

  ```typescript
  return {
    city: nextCity,
    grew,
    completedBuilding,
    completedUnit,
    idleGoldBonus,
    idleScienceBonus,
  };
  ```

- [ ] **Step 6: Run the tests — they must pass**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/systems/city-system.test.ts 2>&1 | tail -10
  ```
  Expected: all tests PASS

- [ ] **Step 7: Commit**

  ```bash
  git add src/systems/city-system.ts tests/systems/city-system.test.ts
  git commit -m "feat(city): idle production converts to gold or science when queue is empty at turn start"
  ```

---

## Task 4: Consume idle bonuses in `turn-manager.ts`

**Files:**
- Modify: `src/core/turn-manager.ts:93`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/systems/idle-production-integration.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { EventBus } from '@/core/event-bus';
  import { processTurn } from '@/core/turn-manager';
  import { foundCity } from '@/systems/city-system';
  import { generateMap } from '@/systems/map-generator';
  import type { GameState } from '@/core/types';

  function makeIdleProductionState(idleProduction: 'gold' | 'science' | null): GameState {
    const map = generateMap(20, 20, `idle-integration-${idleProduction ?? 'none'}`);
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = { ...foundCity('player', tile.coord, map), productionQueue: [], idleProduction };

    return {
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
  }

  describe('idle production — turn-manager wiring', () => {
    it('increases civ gold when idle city has idleProduction gold', () => {
      const withIdle = processTurn(makeIdleProductionState('gold'), new EventBus());
      const withoutIdle = processTurn(makeIdleProductionState(null), new EventBus());
      // Both may have base gold from tile yields; the idle mode should add more
      expect(withIdle.civilizations['player'].gold).toBeGreaterThan(withoutIdle.civilizations['player'].gold);
    });

    it('increases research progress when idle city has idleProduction science', () => {
      const scienceState = makeIdleProductionState('science');
      scienceState.civilizations['player'].techState.currentResearch = 'fire';
      const withIdle = processTurn(scienceState, new EventBus());

      const noneState = makeIdleProductionState(null);
      noneState.civilizations['player'].techState.currentResearch = 'fire';
      const withoutIdle = processTurn(noneState, new EventBus());

      expect(withIdle.civilizations['player'].techState.researchProgress)
        .toBeGreaterThan(withoutIdle.civilizations['player'].techState.researchProgress);
    });
  });
  ```

- [ ] **Step 2: Run the failing integration tests**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/systems/idle-production-integration.test.ts 2>&1 | tail -15
  ```
  Expected: FAIL — gold/researchProgress are the same with or without idle mode (wiring not added yet)

- [ ] **Step 3: Wire the bonuses into turn accumulators**

  In `src/core/turn-manager.ts`, find the `processCity` call (around line 93):

  ```typescript
  const result = processCity(city, newState.map, yields.food, effectiveProduction, civDef?.bonusEffect, civ.techState.completed, civ.civType);
  ```

  Immediately after it, before `const maturityResult = ...`, add:

  ```typescript
  totalGold += result.idleGoldBonus;
  totalScience += result.idleScienceBonus;
  ```

- [ ] **Step 4: Run the integration tests — they must pass**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/systems/idle-production-integration.test.ts 2>&1 | tail -10
  ```
  Expected: PASS

- [ ] **Step 5: Run all tests**

  ```bash
  eval "$(mise activate bash)" && yarn test 2>&1 | tail -20
  ```
  Expected: all tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add src/core/turn-manager.ts tests/systems/idle-production-integration.test.ts
  git commit -m "feat(turn): apply idle production gold/science bonuses to civ totals"
  ```

---

## Task 5: Add idle selector UI to city panel

**Files:**
- Modify: `src/ui/city-panel.ts:10-21` (`CityPanelCallbacks`)
- Modify: `src/ui/city-panel.ts` (HTML template and event wiring)
- Modify: `tests/ui/city-panel.test.ts`

### 5a: Write failing UI tests

- [ ] **Step 1: Write the failing UI tests**

  In `tests/ui/city-panel.test.ts`, at the end of the file add a new describe block:

  ```typescript
  describe('city-panel idle production selector', () => {
    function makeIdleCityFixture() {
      const { container, city, state } = makeWonderPanelFixture();
      city.productionQueue = [];
      city.idleProduction = null;
      state.cities[city.id] = city;
      return { container, city, state };
    }

    it('shows idle mode selector when production queue is empty', () => {
      const { container, city, state } = makeIdleCityFixture();
      const panel = createCityPanel(container, city, state, {
        onBuild: () => {},
        onOpenWonderPanel: () => {},
        onClose: () => {},
      });
      const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
      expect(html).toContain('data-idle-mode');
    });

    it('does not show idle mode selector when production queue is non-empty', () => {
      const { container, city, state } = makeWonderPanelFixture();
      city.productionQueue = ['warrior'];
      const panel = createCityPanel(container, city, state, {
        onBuild: () => {},
        onOpenWonderPanel: () => {},
        onClose: () => {},
      });
      const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
      expect(html).not.toContain('data-idle-mode');
    });

    it('shows per-turn production amount in the idle selector', () => {
      const { container, city, state } = makeIdleCityFixture();
      city.buildings = ['workshop']; // adds +2 production
      state.cities[city.id] = city;
      const panel = createCityPanel(container, city, state, {
        onBuild: () => {},
        onOpenWonderPanel: () => {},
        onClose: () => {},
      });
      const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
      expect(html).toMatch(/\+\d+\/turn/);
    });

    it('calls onSetIdleProduction with gold when Gold button is clicked', () => {
      const { container, city, state } = makeIdleCityFixture();
      const onSetIdleProduction = vi.fn();
      const panel = createCityPanel(container, city, state, {
        onBuild: () => {},
        onOpenWonderPanel: () => {},
        onClose: () => {},
        onSetIdleProduction: (cityId, mode) => {
          state.cities[cityId] = { ...state.cities[cityId]!, idleProduction: mode };
          onSetIdleProduction(cityId, mode);
        },
      } as any);
      const goldBtn = panel.querySelector<HTMLElement>('[data-idle-mode="gold"]');
      expect(goldBtn).toBeTruthy();
      goldBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(onSetIdleProduction).toHaveBeenCalledWith(city.id, 'gold');
    });
  });
  ```

- [ ] **Step 2: Run the failing tests**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/ui/city-panel.test.ts 2>&1 | tail -20
  ```
  Expected: FAIL — `data-idle-mode` not found in rendered HTML

### 5b: Add callback to `CityPanelCallbacks`

- [ ] **Step 3: Add `onSetIdleProduction` to the interface**

  In `src/ui/city-panel.ts`, find `CityPanelCallbacks` (lines 10-21). Add one line after `onUpgradeUnit`:

  ```typescript
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
    onUpgradeUnit?: (unitId: string) => void;
    onSetIdleProduction?: (cityId: string, mode: 'gold' | 'science' | null) => void;
  }
  ```

### 5c: Add idle selector HTML when queue is empty

- [ ] **Step 4: Build the idle selector HTML**

  In `src/ui/city-panel.ts`, find `let currentProductionHtml = '';` (around line 94). After the `if (city.productionQueue.length > 0) { ... }` block that sets `currentProductionHtml`, add:

  ```typescript
  let idleSelectorHtml = '';
  if (city.productionQueue.length === 0) {
    const noneActive = !city.idleProduction;
    const goldActive = city.idleProduction === 'gold';
    const scienceActive = city.idleProduction === 'science';
    const activeStyle = 'padding:6px 14px;background:rgba(232,193,112,0.3);border:1px solid rgba(232,193,112,0.6);border-radius:6px;color:white;cursor:pointer;font-size:12px;font-weight:bold;';
    const inactiveStyle = 'padding:6px 14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:white;cursor:pointer;font-size:12px;';
    const prodAmount = yields.production;
    const amountSuffix = prodAmount > 0 ? ` (+${prodAmount}/turn)` : ' (+0/turn)';
    idleSelectorHtml = `
      <div style="background:rgba(255,255,255,0.07);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-size:12px;color:#e8c170;font-weight:bold;margin-bottom:8px;">Idle Production</div>
        <div style="font-size:11px;opacity:0.6;margin-bottom:10px;">No build queued. Convert ${prodAmount} ⚒️ production to:</div>
        <div style="display:flex;gap:8px;">
          <button type="button" data-idle-mode="none" style="${noneActive ? activeStyle : inactiveStyle}">None</button>
          <button type="button" data-idle-mode="gold" style="${goldActive ? activeStyle : inactiveStyle}">💰 Gold${amountSuffix}</button>
          <button type="button" data-idle-mode="science" style="${scienceActive ? activeStyle : inactiveStyle}">🔬 Science${amountSuffix}</button>
        </div>
      </div>
    `;
  }
  ```

  `yields` is already computed earlier in `createCityPanel` (it accounts for unrest and occupation multipliers), so `yields.production` is the correct value to display. The `prodAmount` variable holds a computed number — safe to embed in innerHTML.

- [ ] **Step 5: Inject the idle selector into the HTML template**

  In `src/ui/city-panel.ts`, find the HTML template string inside `<div id="city-list-view">`. Find:

  ```
  ${currentProductionHtml}
  ```

  Change it to:

  ```
  ${idleSelectorHtml}${currentProductionHtml}
  ```

  The idle selector and production progress are mutually exclusive (`idleSelectorHtml` is only built when the queue is empty; `currentProductionHtml` is only built when the queue is non-empty).

### 5d: Wire the idle button click handler

- [ ] **Step 6: Add event listener for idle mode buttons**

  In `src/ui/city-panel.ts`, after the `panel.querySelectorAll('[data-queue-action]').forEach(...)` block (around line 332), add:

  ```typescript
  panel.querySelectorAll<HTMLElement>('[data-idle-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.dataset.idleMode;
      const mode: 'gold' | 'science' | null =
        raw === 'gold' ? 'gold' : raw === 'science' ? 'science' : null;
      callbacks.onSetIdleProduction?.(city.id, mode);
      rerenderPanel();
    });
  });
  ```

  `rerenderPanel()` is called with no arguments. It reads from the `state` object, which the callback mutates in place (same reference as `gameState` in main.ts). This matches the same pattern used by `onRemoveQueueItem` and `onMoveQueueItem`.

- [ ] **Step 7: Run all city-panel tests — they must pass**

  ```bash
  eval "$(mise activate bash)" && yarn test tests/ui/city-panel.test.ts 2>&1 | tail -20
  ```
  Expected: all tests PASS

- [ ] **Step 8: Commit**

  ```bash
  git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
  git commit -m "feat(ui): idle production selector with per-turn amount in city panel"
  ```

---

## Task 6: Wire `onSetIdleProduction` in `main.ts`

**Files:**
- Modify: `src/main.ts:495`

- [ ] **Step 1: Add the callback**

  In `src/main.ts`, find the `createCityPanel(uiLayer, city, gameState, {` call inside `openCityPanelForCity` (around line 495). After the `onRemoveQueueItem` callback block (around line 523), add:

  ```typescript
  onSetIdleProduction: (cityId, mode) => {
    const targetCity = gameState.cities[cityId];
    if (!targetCity) return;
    gameState.cities[cityId] = setIdleProduction(targetCity, mode);
    renderLoop.setGameState(gameState);
  },
  ```

- [ ] **Step 2: Add `setIdleProduction` to the `planning-system` import**

  In `src/main.ts`, find the import line for `planning-system`. It currently imports `enqueueCityProduction`, `reorderCityProduction`, `removeQueuedId`, etc. Add `setIdleProduction` to that list.

- [ ] **Step 3: Final full build + test**

  ```bash
  eval "$(mise activate bash)" && yarn build 2>&1 | tail -10 && yarn test 2>&1 | tail -20
  ```
  Expected: both exit 0, all tests PASS

- [ ] **Step 4: Commit**

  ```bash
  git add src/main.ts
  git commit -m "feat(main): wire onSetIdleProduction callback in city panel"
  ```

---

## Self-Review

### Spec Coverage

- [x] Empty-queue city can select Gold, Science, or None — Task 5
- [x] Idle selector hidden when queue is non-empty — Task 5 (HTML conditional + negative test)
- [x] Per-turn conversion amount shown in selector — Task 5 (yield amount suffix on buttons)
- [x] Production yield converted to gold per turn — Task 3 + Task 4
- [x] Production yield converted to science per turn — Task 3 + Task 4
- [x] No idle bonus on the turn the last item completes — Task 3 (4th test, `city.productionQueue.length` check)
- [x] Conversion mode persisted on City state — Task 1 + Task 6
- [x] Selector rerenders after button click — Task 5 (rerenderPanel call)
- [x] No conversion when mode is null (existing behavior preserved) — Task 3 negative test
- [x] Advisor does not nag cities that have a conversion mode set — Task 2 (getIdleCityIds filter + 2 tests)
- [x] Turn-level gold/science wiring verified end-to-end — Task 4 (integration test file)

### Placeholder Scan

No TBDs, TODOs, or "similar to Task N" references found.

### Type Consistency

- `idleProduction?: 'gold' | 'science' | null` — optional in `City` (Task 1), explicit `null` in `foundCity` (Task 1), parameter type in `setIdleProduction` (Task 2), parameter type in `onSetIdleProduction` callback (Task 5), `data-idle-mode` attribute reading in handler (Task 5).
- `idleGoldBonus` and `idleScienceBonus` defined in `CityProcessResult` (Task 3) and consumed in `turn-manager.ts` (Task 4) and integration-tested in Task 4.
