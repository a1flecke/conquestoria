# Hot Seat Map Type Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players choose a map type (Earth, Old World, New World, Balanced, Continent) when starting a hot seat game, mirroring the option that already exists for solo campaigns.

**Architecture:** Three-layer fix: (1) add `mapScript?: MapScript` to `HotSeatConfig` in `types.ts`, (2) wire the switch-on-mapScript block through `createHotSeatGame()` in `game-state.ts`, (3) insert a new "Choose Map Type" wizard stage in `hotseat-setup.ts` between map size and player count. All geo-map generators and their data files are already imported by `game-state.ts`; no new imports needed.

**Tech Stack:** TypeScript, Vitest (jsdom for UI tests), Canvas 2D (untouched), no new dependencies.

---

## File Structure

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `mapScript?: MapScript` to `HotSeatConfig` |
| `src/core/game-state.ts` | Replace hardcoded `generateMap` call with `switch (mapScript)` block; store `mapScript` on returned `GameState` |
| `src/ui/hotseat-setup.ts` | Add `selectedMapScript: MapScript` state; add `showMapTypeStage()`; fix `showPlayerCountStage()` back button; pass `mapScript` in `finalize()` |
| `tests/core/game-state.test.ts` | Add `createHotSeatGame` map-script tests (feature + regression guard) |
| `tests/ui/hotseat-setup.test.ts` | Update all existing tests to step through the new map type stage; add new tests for the stage itself |

---

## Task 1: Extend `HotSeatConfig` with `mapScript`

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Verify the current shape of `HotSeatConfig` and `SoloSetupConfig`**

```bash
grep -n "HotSeatConfig\|SoloSetupConfig" src/core/types.ts
```

Expected output includes lines ~810-825. Confirm `HotSeatConfig` has no `mapScript` field and `SoloSetupConfig` does.

- [ ] **Step 2: Add `mapScript` to `HotSeatConfig`**

In `src/core/types.ts`, find the `HotSeatConfig` interface (around line 810) and add the field plus a sync comment:

```ts
export interface HotSeatConfig {
  playerCount: number;
  mapSize: 'small' | 'medium' | 'large';
  /** Keep map generation fields in sync with SoloSetupConfig. */
  mapScript?: MapScript;
  players: HotSeatPlayer[];
  customCivilizations?: CustomCivDefinition[];
}
```

- [ ] **Step 3: Verify build passes (type-checks)**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -20
```

Expected: exits 0 (no type errors — the new optional field can't break callers).

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(types): add mapScript to HotSeatConfig"
```

---

## Task 2: Wire `mapScript` through `createHotSeatGame()`

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `tests/core/game-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/core/game-state.test.ts`. Find the end of the `describe('createNewGame', ...)` block and append a new describe block:

```ts
import type { MapScript } from '@/core/types';

describe('createHotSeatGame', () => {
  const baseConfig = {
    playerCount: 2,
    mapSize: 'small' as const,
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob',   slotId: 'player-2', civType: 'rome',  isHuman: true },
    ],
  };

  it('defaults to procedural map when mapScript is omitted', () => {
    const state = createHotSeatGame(baseConfig, 'seed-proc');
    expect(state.mapScript).toBe('procedural');
  });

  it('stores the mapScript from config on the returned state — regression guard', () => {
    // If HotSeatConfig ever loses mapScript this test will stop compiling or fail at runtime.
    const scripts: MapScript[] = [
      'procedural', 'earth', 'old-world', 'new-world', 'balanced', 'single-continent',
    ];
    for (const script of scripts) {
      const state = createHotSeatGame({ ...baseConfig, mapScript: script }, 'seed-' + script);
      expect(state.mapScript).toBe(script);
    }
  });

  it('generates a map with the correct dimensions for balanced script', () => {
    const state = createHotSeatGame({ ...baseConfig, mapScript: 'balanced' }, 'seed-bal');
    expect(state.map.width).toBe(30);   // small = 30x30
    expect(state.map.height).toBe(30);
    expect(state.mapScript).toBe('balanced');
  });

  it('generates a map for single-continent script', () => {
    const state = createHotSeatGame({ ...baseConfig, mapScript: 'single-continent' }, 'seed-sc');
    expect(state.map.width).toBe(30);
    expect(state.mapScript).toBe('single-continent');
  });

  it('generates a map for earth script', () => {
    const state = createHotSeatGame({ ...baseConfig, mapScript: 'earth' }, 'seed-earth');
    expect(state.map.width).toBe(30);
    expect(state.mapScript).toBe('earth');
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts 2>&1 | tail -30
```

Expected: failures on the `createHotSeatGame` tests because `state.mapScript` is `undefined`.

- [ ] **Step 3: Implement the fix in `createHotSeatGame()`**

Open `src/core/game-state.ts`. Find `createHotSeatGame` (around line 301).

Replace these lines:
```ts
  const dims = MAP_DIMENSIONS[config.mapSize];
  const map = generateMap(dims.width, dims.height, gameSeed);
  const startPositions = findStartPositions(
    map,
    config.players.map(p => p.civType),
    'procedural',
    config.mapSize,
  );
```

With:
```ts
  const dims = MAP_DIMENSIONS[config.mapSize];
  const mapScript: MapScript = config.mapScript ?? 'procedural';
  const civTypeIds = config.players.map(p => p.civType);

  let map: GameMap;
  let startPositions: HexCoord[];

  switch (mapScript) {
    case 'earth':
      map = loadGeoMap(EARTH_TILES[config.mapSize], EARTH_RIVERS[config.mapSize], dims, true);
      startPositions = findStartPositions(map, civTypeIds, 'earth', config.mapSize);
      break;
    case 'old-world':
      map = loadGeoMap(OLD_WORLD_TILES[config.mapSize], OLD_WORLD_RIVERS[config.mapSize], dims, false);
      startPositions = findStartPositions(map, civTypeIds, 'old-world', config.mapSize);
      break;
    case 'new-world':
      map = loadGeoMap(NEW_WORLD_TILES[config.mapSize], NEW_WORLD_RIVERS[config.mapSize], dims, false);
      startPositions = findStartPositions(map, civTypeIds, 'new-world', config.mapSize);
      break;
    case 'balanced': {
      const result = generateBalancedMap(dims.width, dims.height, gameSeed, civTypeIds.length);
      map = result.map;
      startPositions = result.startPositions;
      break;
    }
    case 'single-continent': {
      const result = generateContinentMap(dims.width, dims.height, gameSeed);
      map = result.map;
      startPositions = findStartPositions(map, civTypeIds, 'single-continent', config.mapSize, result.continentHexes);
      break;
    }
    default: // 'procedural' and old saves
      map = generateMap(dims.width, dims.height, gameSeed);
      startPositions = findStartPositions(map, civTypeIds, 'procedural', config.mapSize);
      break;
  }
```

Then find the `const state: GameState = {` block inside `createHotSeatGame` and add `mapScript` to it (mirror what `createNewGame` does at its line 281):

```ts
  const state: GameState = {
    turn: 1,
    era: 1,
    gameId: createGameId(gameSeed),
    gameTitle: resolvedGameTitle,
    civilizations,
    map,
    units,
    cities: {},
    barbarianCamps,
    minorCivs: {},
    idCounters,
    marketplace: createMarketplaceState(),
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: config.players[0].slotId,
    gameOver: false,
    winner: null,
    hotSeat: config,
    pendingEvents: {},
    tribalVillages,
    discoveredWonders: {},
    wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {},
    embargoes: [],
    defensiveLeagues: [],
    pendingDiplomacyRequests: [],
    settings,
    mapScript,
  };
```

- [ ] **Step 4: Run the tests to confirm they now pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts 2>&1 | tail -20
```

Expected: all tests in the file pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/game-state.ts tests/core/game-state.test.ts
git commit -m "feat(game-state): wire mapScript through createHotSeatGame"
```

---

## Task 3: Add map type selection stage to `hotseat-setup.ts`

**Files:**
- Modify: `src/ui/hotseat-setup.ts`
- Modify: `tests/ui/hotseat-setup.test.ts`

This task has three parts: (A) add the new stage, (B) fix the back-navigation in the existing player-count stage, (C) pass `mapScript` in `finalize()`. We write the tests first.

### Part A — Failing tests for the new stage and updated flow

- [ ] **Step 1: Add helper and new tests to `tests/ui/hotseat-setup.test.ts`**

After the existing `chooseCiv` helper (around line 43), add:

```ts
function advanceThroughMapType(): void {
  // click #hs-map-type-next to accept the pre-selected map type and continue
  click('#hs-map-type-next');
}
```

Add a new `describe` block **before** the closing `});` of the outer `describe('hotseat-setup', ...)`:

```ts
  describe('map type stage', () => {
    it('shows all five map type options after selecting a map size', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');

      expect(document.querySelector('[data-map-script="earth"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="old-world"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="new-world"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="balanced"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="single-continent"]')).toBeTruthy();
    });

    it('pre-selects earth and shows its description', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');

      const earthCard = document.querySelector('[data-map-script="earth"]') as HTMLElement | null;
      expect(earthCard?.dataset.selected).toBe('true');
      expect(document.querySelector('[data-role="map-script-description"]')?.textContent?.length).toBeGreaterThan(0);
    });

    it('updates description when a different map type card is clicked', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      const earthDesc = document.querySelector('[data-role="map-script-description"]')?.textContent ?? '';

      click('[data-map-script="balanced"]');
      const balancedDesc = document.querySelector('[data-role="map-script-description"]')?.textContent ?? '';

      expect(balancedDesc).not.toBe(earthDesc);
      expect(balancedDesc.length).toBeGreaterThan(0);
    });

    it('advances to player count after clicking Next', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      advanceThroughMapType();

      // player count stage is now showing
      expect(document.querySelector('.count-card[data-count="2"]')).toBeTruthy();
    });

    it('returns to map size stage when Back is clicked from the map type stage', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      expect(document.querySelector('[data-map-script="earth"]')).toBeTruthy();

      click('#hs-back-map-size');
      expect(document.querySelector('[data-size="small"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="earth"]')).toBeFalsy();
    });

    it('returns to map type stage (not map size) when Back is clicked from player count', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      advanceThroughMapType();
      expect(document.querySelector('.count-card[data-count="2"]')).toBeTruthy();

      click('#hs-back-size');
      expect(document.querySelector('[data-map-script="earth"]')).toBeTruthy();
      expect(document.querySelector('[data-size="small"]')).toBeFalsy();
    });

    it('passes the selected map script to onComplete', () => {
      const onComplete = vi.fn();
      showHotSeatSetup(document.body, { onComplete, onCancel: () => {} });

      click('[data-size="small"]');
      click('[data-map-script="balanced"]');
      advanceThroughMapType();
      click('[data-count="2"]');
      setInputValue('.player-name-input[data-idx="0"]', 'Alice');
      setInputValue('.player-name-input[data-idx="1"]', 'Bob');
      click('#hs-names-next');
      chooseCiv('egypt');
      click('#hs-civ-ready');
      chooseCiv('rome');

      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        mapScript: 'balanced',
      }));
    });

    it('defaults to earth when no map type card is clicked before Next', () => {
      const onComplete = vi.fn();
      showHotSeatSetup(document.body, { onComplete, onCancel: () => {} });

      click('[data-size="small"]');
      // do NOT click any map type card — just advance
      advanceThroughMapType();
      click('[data-count="2"]');
      setInputValue('.player-name-input[data-idx="0"]', 'Alice');
      setInputValue('.player-name-input[data-idx="1"]', 'Bob');
      click('#hs-names-next');
      chooseCiv('egypt');
      click('#hs-civ-ready');
      chooseCiv('rome');

      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        mapScript: 'earth',
      }));
    });
  });
```

- [ ] **Step 2: Update every existing test that steps through the full flow**

All existing tests that click `[data-size="small"]` and then immediately click `[data-count="..."]` need an `advanceThroughMapType()` call inserted between them.

Find and update each test below (search for `click('[data-size=` to locate them):

**`it('passes custom civ definitions...')`** (around line 96):
```ts
    click('[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('[data-count="2"]');
```

**`it('allows a hot-seat player to select a custom civ...')`** (around line 115):
```ts
    click('[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('[data-count="2"]');
```

**`it('preserves a saved custom civ...')`** (around line 158):
```ts
    click('[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('[data-count="2"]');
```

**`it('reopens the hot-seat civ picker...')`** (around line 195):
```ts
    click('[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('[data-count="2"]');
```

**`it('creates a distinct id...')`** (around line 232):
```ts
    click('[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('[data-count="2"]');
```

**`it('preserves newer stored custom civs...')`** (around line 269):
```ts
    click('[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('[data-count="2"]');
```

**`it('keeps the newer stored version...')`** (around line 321):
```ts
    click('[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('[data-count="2"]');
```

**`it('does not finish after the first human...')`** (around line 368):
```ts
    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('.count-card[data-count="2"]');
```

**`it('lets the second human choose...')`** (around line 389):
```ts
    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('.count-card[data-count="2"]');
```

**`it('shows Next Player as the civ-pick CTA...')`** (around line 420):
```ts
    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('.count-card[data-count="2"]');
```

**`it('shows Start Game as the civ-pick CTA...')`** (around line 436):
```ts
    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();       // ← add this line
    click('.count-card[data-count="2"]');
```

- [ ] **Step 3: Run the hotseat-setup tests to confirm they now fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/hotseat-setup.test.ts 2>&1 | tail -40
```

Expected: the new tests fail (stage doesn't exist yet) and the updated tests fail because `[data-map-script="earth"]` / `#hs-map-type-next` are not found.

### Part B — Implement `showMapTypeStage()` and wire it into the flow

- [ ] **Step 4: Open `src/ui/hotseat-setup.ts` and add `selectedMapScript` state**

Near the top of `showHotSeatSetup`, after `let selectedMapSize: ... = null;` (around line 32), add:

```ts
  let selectedMapScript: MapScript = 'earth';
```

Also add `MapScript` to the import at the top of the file:

```ts
import type { CustomCivDefinition, HotSeatConfig, HotSeatPlayer, MapScript } from '@/core/types';
```

- [ ] **Step 5: Add `showMapTypeStage()` function**

Insert the following function after `showMapSizeStage()` closes (after its closing `}`, around line 100):

```ts
  function showMapTypeStage() {
    type MapScriptKey = 'earth' | 'old-world' | 'new-world' | 'balanced' | 'single-continent';
    const MAP_SCRIPT_ORDER: MapScriptKey[] = ['earth', 'old-world', 'new-world', 'balanced', 'single-continent'];

    const MAP_SCRIPT_LABELS: Record<MapScriptKey, { emoji: string; label: string; description: string }> = {
      earth: {
        emoji: '🌍',
        label: 'Earth',
        description: 'Real-world geography. Civilizations start near their historical homelands; fantasy and out-of-region civs get good constrained starts. Resources follow real-world distribution.',
      },
      'old-world': {
        emoji: '🗺️',
        label: 'Old World',
        description: 'Europe, Asia, and Africa. Historical civilizations start at their homelands. Best for Old World civs — Aztec gets a constrained random start.',
      },
      'new-world': {
        emoji: '🌎',
        label: 'New World',
        description: 'North and South America. Aztec starts in Central Mexico. England and France land on the eastern seaboard; Spain lands on the Gulf of Mexico.',
      },
      balanced: {
        emoji: '⚖️',
        label: 'Balanced',
        description: 'Procedurally generated. Each civilization receives an algorithmically fair share of terrain and resources. A cluster of luxury resources creates a natural conflict hotspot.',
      },
      'single-continent': {
        emoji: '🏝️',
        label: 'Continent',
        description: 'One large connected landmass with small islands in the surrounding ocean. Fast early contact between civilizations; islands reward naval exploration with bonus resources.',
      },
    };

    panel.innerHTML = '';

    const h1 = document.createElement('h1');
    h1.style.cssText = 'font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;';
    h1.textContent = 'Choose Map Type';
    panel.appendChild(h1);

    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size:13px;opacity:0.6;margin-bottom:20px;text-align:center;';
    subtitle.textContent = 'Select the world your civilizations will inhabit';
    panel.appendChild(subtitle);

    const cardRow = document.createElement('div');
    cardRow.id = 'hs-map-type-row';
    cardRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:480px;width:100%;';
    panel.appendChild(cardRow);

    const descEl = document.createElement('p');
    descEl.dataset.role = 'map-script-description';
    descEl.style.cssText = 'font-size:12px;opacity:0.82;margin:12px 0;text-align:center;max-width:420px;line-height:1.45;';
    panel.appendChild(descEl);

    const buttons = new Map<MapScriptKey, HTMLButtonElement>();

    const syncCards = (current: MapScriptKey): void => {
      for (const [script, btn] of buttons.entries()) {
        const sel = script === current;
        btn.dataset.selected = sel ? 'true' : 'false';
        btn.style.borderColor = sel ? '#e8c170' : 'rgba(255,255,255,0.18)';
        btn.style.background = sel ? 'rgba(232,193,112,0.16)' : 'rgba(255,255,255,0.08)';
        btn.style.color = sel ? '#f7f1d7' : '#f4f1e8';
      }
      descEl.textContent = MAP_SCRIPT_LABELS[current].description;
    };

    for (const script of MAP_SCRIPT_ORDER) {
      const info = MAP_SCRIPT_LABELS[script];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mapScript = script;
      btn.style.cssText = 'min-height:44px;padding:10px 8px;border-radius:12px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#f4f1e8;cursor:pointer;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:4px;';

      const emojiSpan = document.createElement('span');
      emojiSpan.style.fontSize = '18px';
      emojiSpan.textContent = info.emoji;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = info.label;

      btn.appendChild(emojiSpan);
      btn.appendChild(labelSpan);

      btn.addEventListener('click', () => {
        selectedMapScript = script;
        syncCards(script);
      });

      buttons.set(script, btn);
      cardRow.appendChild(btn);
    }

    // Pre-select the current (or default) choice so description is always visible
    const preselect = (MAP_SCRIPT_ORDER.includes(selectedMapScript as MapScriptKey)
      ? selectedMapScript as MapScriptKey
      : 'earth');
    syncCards(preselect);

    const nav = document.createElement('div');
    nav.style.cssText = 'margin-top:20px;display:flex;gap:12px;';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'hs-back-map-size';
    backBtn.style.cssText = 'padding:10px 20px;min-height:44px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;cursor:pointer;font-size:13px;';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => showMapSizeStage());

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.id = 'hs-map-type-next';
    nextBtn.style.cssText = 'padding:10px 24px;min-height:44px;background:rgba(232,193,112,0.3);border:2px solid #e8c170;border-radius:8px;color:#e8c170;cursor:pointer;font-size:14px;font-weight:bold;';
    nextBtn.textContent = 'Next';
    nextBtn.addEventListener('click', () => showPlayerCountStage());

    nav.appendChild(backBtn);
    nav.appendChild(nextBtn);
    panel.appendChild(nav);
  }
```

- [ ] **Step 6: Change `showMapSizeStage()` to call `showMapTypeStage()` on card click**

In `showMapSizeStage()`, find the card click handler (around line 89–94):

```ts
    panel.querySelectorAll('.map-size-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedMapSize = (card as HTMLElement).dataset.size as 'small' | 'medium' | 'large';
        showPlayerCountStage();
      });
    });
```

Change `showPlayerCountStage()` to `showMapTypeStage()`:

```ts
    panel.querySelectorAll('.map-size-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedMapSize = (card as HTMLElement).dataset.size as 'small' | 'medium' | 'large';
        showMapTypeStage();
      });
    });
```

- [ ] **Step 7: Fix `showPlayerCountStage()` back button to return to map type (not map size)**

In `showPlayerCountStage()`, find the back button handler (around line 136–138):

```ts
    panel.querySelector('#hs-back-size')?.addEventListener('click', () => {
      showMapSizeStage();
    });
```

Change it to:

```ts
    panel.querySelector('#hs-back-size')?.addEventListener('click', () => {
      showMapTypeStage();
    });
```

### Part C — Pass `mapScript` in `finalize()`

- [ ] **Step 8: Add `mapScript` to the config built in `finalize()`**

Find the `function finalize()` block (around line 267). The `config` object currently is:

```ts
    const config: HotSeatConfig = {
      playerCount: players.length,
      mapSize: selectedMapSize!,
      players,
      customCivilizations,
    };
```

Change it to:

```ts
    const config: HotSeatConfig = {
      playerCount: players.length,
      mapSize: selectedMapSize!,
      mapScript: selectedMapScript,
      players,
      customCivilizations,
    };
```

- [ ] **Step 9: Run the tests to confirm they all pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/hotseat-setup.test.ts 2>&1 | tail -30
```

Expected: all tests in the file pass, including the new `map type stage` describe block.

- [ ] **Step 10: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 11: Type-check**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 12: Commit**

```bash
git add src/ui/hotseat-setup.ts tests/ui/hotseat-setup.test.ts
git commit -m "feat(hotseat-setup): add map type selection stage (fixes #225)"
```

---

## Task 4: Open a PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create \
  --title "feat: add map type selection to hot seat game setup (fixes #225)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `mapScript?: MapScript` to `HotSeatConfig` so the chosen map type can be carried through to game creation.
- Wires a `switch (mapScript)` block through `createHotSeatGame()`, mirroring the identical logic in `createNewGame()`. All six scripts (procedural, earth, old-world, new-world, balanced, single-continent) are now supported.
- Inserts a new "Choose Map Type" stage in the hot seat setup wizard, showing five clickable cards with descriptions, placed between map size and player count.

## Regression prevention
A dedicated test `stores the mapScript from config on the returned state` iterates over all six `MapScript` values and asserts `state.mapScript === script`. If `mapScript` is ever removed from `HotSeatConfig` the test will either stop compiling or fail at runtime, catching the same class of omission that caused this bug.

## Test plan
- [ ] `bash scripts/run-with-mise.sh yarn test` exits 0
- [ ] `bash scripts/run-with-mise.sh yarn build` exits 0
- [ ] Manually start dev server, begin a hot seat game, confirm "Choose Map Type" stage appears after selecting a size, all five cards are shown with descriptions, selecting Balanced produces a balanced map, Back returns to size picker
EOF
)"
```

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|-------------|-----------|
| User can choose map type in hot seat | `showMapTypeStage()` in Task 3 |
| All 5 map types shown with descriptions | Cards loop + description in Task 3 |
| Selected type reaches game creation | `mapScript` in `finalize()` + `createHotSeatGame` switch in Task 2 |
| Default when nothing selected | `selectedMapScript = 'earth'` pre-selection |
| Back nav from map type → map size | `#hs-back-map-size` button + test |
| Back nav from player count → map type | Fixed `#hs-back-size` handler + test |
| `procedural` still works (old saves) | `default` case in switch + test |
| Regression guard | `stores the mapScript` test in Task 2 |

### Placeholder scan

No TBDs, TODOs, or "similar to Task N" references. All code blocks are complete.

### Type consistency

- `MapScript` (from `src/core/types.ts`) used throughout — imported in `hotseat-setup.ts` and already available in `game-state.ts`.
- `selectedMapScript: MapScript` typed consistently in the closure. The `MAP_SCRIPT_ORDER` local type `MapScriptKey` in `showMapTypeStage` is a strict subset of `MapScript` (no `'procedural'`), which is intentional — procedural is not surfaced in UI but still accepted in `createHotSeatGame`.
- `config.mapScript: selectedMapScript` is `MapScript` (not nullable), matching the `mapScript?: MapScript` field in `HotSeatConfig`.
- `state.mapScript = mapScript` in `createHotSeatGame` matches `mapScript?: MapScript` on `GameState`.

### Logic issues checked

- `showMapSizeStage()` back button (`#hs-cancel`) was not changed — it still calls `callbacks.onCancel()`, which is correct.
- When the user goes Back from map type to map size and picks a different size, `selectedMapScript` retains its last value. This is correct — if the user already picked Balanced, changing the size shouldn't reset their map type choice.
- `'procedural'` is excluded from the UI cards but the default `selectedMapScript = 'earth'` means no game will silently use procedural from the UI. Existing saves with `mapScript: undefined` on `GameState` still fall through to the `default` case in `createHotSeatGame`, unchanged.

### UX issues checked

- All buttons have `min-height: 44px` (touch target rule).
- All buttons have explicit `background` and `color` in `style.cssText` (no-bare-buttons rule).
- The description element is always visible once the stage is shown (pre-selection ensures `syncCards` always runs).
- The `'Continent'` card label is used (not `'single-continent'`) — matches the campaign setup label.
