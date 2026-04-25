# MR 1e: Focus Reminders And Worked-Tile Map Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remind players when a city remains focused and show person-style worked-tile markers with focus glyphs on the map.

**Architecture:** Keep reminder cadence in a small system helper that updates serializable city fields and returns viewer-facing reminder records. Add a dedicated worked-tile renderer that derives visible markers from `city.workedTiles`, city focus, fog of war, and horizontal wrapping. `main.ts` only displays reminder notifications and tracks which city panel is currently open. Target implementing model: GPT-5.4 Medium.

**Tech Stack:** TypeScript, Canvas 2D, Vitest, existing `EventBus`, `RenderLoop`, `Camera`, fog-of-war helpers, wrap-rendering helpers.

---

## Source Contract

Spec: `docs/superpowers/specs/2026-04-24-city-grid-city-sim-design.md`

Rules to read before editing source:

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`

MR dependency: complete MR 1a, MR 1b, MR 1c, and MR 1d first.

## Files

- Create: `src/systems/city-focus-reminder-system.ts`
- Create: `src/renderer/worked-tile-renderer.ts`
- Modify: `src/main.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/systems/city-focus-reminder-system.test.ts`
- Test: `tests/renderer/worked-tile-renderer.test.ts`
- Test: `tests/renderer/render-loop-wrap.test.ts`

## Player Truth Table

| Before | Action | Internal change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| City has `Food focus`, panel is closed, seven turns passed since last reminder | End turn | `lastFocusReminderTurn` updates | Notification says `Ephyra is still on Food focus.` | Normal turn notifications |
| City has `Food focus`, its city panel is open | End turn | Reminder is suppressed for that city | No duplicate focus reminder while player is inspecting it | Panel stays open or can be reopened normally |
| Tile is worked by visible player city | Map renders | Marker is derived from `workedTiles` | Person-style marker appears on the worked tile with food/production/gold/science glyph | City, unit, and fog rendering |
| Worked tile is fogged or unexplored | Map renders | Marker is filtered by visibility | No worked marker leaks through fog | Fog overlay remains authoritative |

## Misleading UI Risks

- A marker means a citizen is actively working a tile, not merely that the tile belongs to the city.
- The glyph on the marker reflects the city's current focus, not the tile's best yield.
- Reminder cadence must be per city. One focused city should not reset another city's reminder timer.
- Reminder notifications must not fire for `balanced` or `custom` focus.

## Task 1: Add Focus Reminder System

**Files:**
- Create: `src/systems/city-focus-reminder-system.ts`
- Test: `tests/systems/city-focus-reminder-system.test.ts`

- [ ] **Step 1: Write failing reminder tests**

Create `tests/systems/city-focus-reminder-system.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  CITY_FOCUS_REMINDER_INTERVAL,
  processCityFocusReminders,
} from '@/systems/city-focus-reminder-system';

describe('city focus reminders', () => {
  it('reminds for non-balanced focus after the cadence passes', () => {
    const state = createNewGame(undefined, 'focus-reminder-due', 'small');
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
    state.cities[city.id] = {
      ...city,
      name: 'Ephyra',
      focus: 'food',
      lastFocusReminderTurn: 1,
    };
    state.civilizations.player.cities.push(city.id);
    state.turn = 1 + CITY_FOCUS_REMINDER_INTERVAL;

    const result = processCityFocusReminders(state, 'player');

    expect(result.reminders).toEqual([{ cityId: city.id, cityName: 'Ephyra', focus: 'food' }]);
    expect(result.state.cities[city.id].lastFocusReminderTurn).toBe(state.turn);
  });

  it('does not remind for balanced or custom focus', () => {
    const state = createNewGame(undefined, 'focus-reminder-skip', 'small');
    const balanced = foundCity('player', { q: 10, r: 10 }, state.map);
    const custom = foundCity('player', { q: 16, r: 10 }, state.map);
    state.cities[balanced.id] = { ...balanced, focus: 'balanced', lastFocusReminderTurn: 1 };
    state.cities[custom.id] = { ...custom, focus: 'custom', lastFocusReminderTurn: 1 };
    state.civilizations.player.cities.push(balanced.id, custom.id);
    state.turn = 20;

    const result = processCityFocusReminders(state, 'player');

    expect(result.reminders).toEqual([]);
    expect(result.state.cities[balanced.id].lastFocusReminderTurn).toBe(1);
    expect(result.state.cities[custom.id].lastFocusReminderTurn).toBe(1);
  });

  it('suppresses the currently open city panel city', () => {
    const state = createNewGame(undefined, 'focus-reminder-open-panel', 'small');
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
    state.cities[city.id] = { ...city, focus: 'science', lastFocusReminderTurn: 1 };
    state.civilizations.player.cities.push(city.id);
    state.turn = 20;

    const result = processCityFocusReminders(state, 'player', { suppressCityId: city.id });

    expect(result.reminders).toEqual([]);
    expect(result.state.cities[city.id].lastFocusReminderTurn).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-focus-reminder-system.test.ts
```

Expected: FAIL because `city-focus-reminder-system.ts` does not exist.

- [ ] **Step 3: Implement reminder helper**

Create `src/systems/city-focus-reminder-system.ts`:

```ts
import type { CityFocus, GameState } from '@/core/types';

export const CITY_FOCUS_REMINDER_INTERVAL = 7;

export interface CityFocusReminder {
  cityId: string;
  cityName: string;
  focus: Exclude<CityFocus, 'balanced' | 'custom'>;
}

export interface CityFocusReminderOptions {
  suppressCityId?: string | null;
}

export interface CityFocusReminderResult {
  state: GameState;
  reminders: CityFocusReminder[];
}

function isReminderFocus(focus: CityFocus): focus is Exclude<CityFocus, 'balanced' | 'custom'> {
  return focus !== 'balanced' && focus !== 'custom';
}

export function processCityFocusReminders(
  state: GameState,
  civId: string,
  options: CityFocusReminderOptions = {},
): CityFocusReminderResult {
  const civ = state.civilizations[civId];
  if (!civ) return { state, reminders: [] };

  const cities = { ...state.cities };
  const reminders: CityFocusReminder[] = [];

  for (const cityId of civ.cities) {
    const city = cities[cityId];
    if (!city || city.id === options.suppressCityId || !isReminderFocus(city.focus)) continue;

    const lastReminder = city.lastFocusReminderTurn ?? 0;
    if (state.turn - lastReminder < CITY_FOCUS_REMINDER_INTERVAL) continue;

    reminders.push({ cityId: city.id, cityName: city.name, focus: city.focus });
    cities[city.id] = { ...city, lastFocusReminderTurn: state.turn };
  }

  return { state: { ...state, cities }, reminders };
}
```

- [ ] **Step 4: Run reminder tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-focus-reminder-system.test.ts
```

Expected: PASS.

## Task 2: Wire Reminder Notifications In `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Track the open city panel**

In `src/main.ts`, import:

```ts
import { processCityFocusReminders } from '@/systems/city-focus-reminder-system';
```

Add near the other UI state variables:

```ts
let openCityPanelId: string | null = null;
```

At the start of `openCityPanelForCity`, after the owner guard, set:

```ts
openCityPanelId = city.id;
```

Change the city panel callback:

```ts
onClose: () => {
  openCityPanelId = null;
},
```

In `onPrevCity` and `onNextCity`, set `openCityPanelId = null` immediately before opening the next city so the next `openCityPanelForCity` call owns the new value.

- [ ] **Step 2: Add a notification helper**

Add near `showNotification` helpers:

```ts
function applyCityFocusReminders(): void {
  const result = processCityFocusReminders(gameState, gameState.currentPlayer, { suppressCityId: openCityPanelId });
  gameState = result.state;
  for (const reminder of result.reminders) {
    const focusLabel = `${reminder.focus[0].toUpperCase()}${reminder.focus.slice(1)}`;
    showNotification(`${reminder.cityName} is still on ${focusLabel} focus.`, 'info');
  }
}
```

- [ ] **Step 3: Call reminders after turn processing**

In solo end-turn flow, after `gameState = processTurn(gameState, bus);` and before `renderLoop.setGameState(gameState);`, call:

```ts
applyCityFocusReminders();
```

In hot-seat flow, after the next human player is assigned:

```ts
gameState.currentPlayer = nextSlotId;
openCityPanelId = null;
applyCityFocusReminders();
```

This makes reminders viewer-specific and prevents the previous human's focused cities from notifying the next player.

- [ ] **Step 4: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

## Task 3: Add Worked-Tile Marker Renderer

**Files:**
- Create: `src/renderer/worked-tile-renderer.ts`
- Test: `tests/renderer/worked-tile-renderer.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `tests/renderer/worked-tile-renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Camera } from '@/renderer/camera';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { drawWorkedTileMarkers, getWorkedTileRenderData } from '@/renderer/worked-tile-renderer';
import { hexKey } from '@/systems/hex-utils';

class MockCanvasContext {
  fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  beginPath(): void {}
  arc(): void {}
  moveTo(): void {}
  lineTo(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(text: string, x: number, y: number): void {
    this.fillTextCalls.push({ text, x, y });
  }
}

function makeCamera(): Camera {
  return {
    zoom: 1,
    hexSize: 48,
    isHexVisible: () => true,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  } as unknown as Camera;
}

describe('worked tile renderer', () => {
  it('derives visible worked-tile markers with focus glyphs', () => {
    const state = createNewGame(undefined, 'worked-marker-visible', 'small');
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
    const worked = { q: 11, r: 10 };
    state.cities[city.id] = { ...city, focus: 'food', workedTiles: [worked] };
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(worked)] = 'visible';

    const markers = getWorkedTileRenderData(state, 'player');

    expect(markers).toEqual([expect.objectContaining({
      cityId: city.id,
      coord: worked,
      focus: 'food',
      glyph: '🌾',
    })]);
  });

  it('does not derive markers for fogged worked tiles', () => {
    const state = createNewGame(undefined, 'worked-marker-fog', 'small');
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
    const worked = { q: 11, r: 10 };
    state.cities[city.id] = { ...city, focus: 'production', workedTiles: [worked] };
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(worked)] = 'fog';

    expect(getWorkedTileRenderData(state, 'player')).toEqual([]);
  });

  it('draws a person marker and focus glyph for visible worked tiles', () => {
    const state = createNewGame(undefined, 'worked-marker-draw', 'small');
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
    const worked = { q: 11, r: 10 };
    state.cities[city.id] = { ...city, focus: 'science', workedTiles: [worked] };
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(worked)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawWorkedTileMarkers(ctx, state, makeCamera(), 'player');

    const text = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(text).toContain('👤');
    expect(text).toContain('🔬');
  });

  it('renders wrapped worked-marker copies at the horizontal seam', () => {
    const state = createNewGame(undefined, 'worked-marker-wrap', 'small');
    state.map.wrapsHorizontally = true;
    state.map.width = 5;
    const city = foundCity('player', { q: 0, r: 0 }, state.map);
    const worked = { q: 0, r: 1 };
    state.cities[city.id] = { ...city, focus: 'gold', workedTiles: [worked] };
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(worked)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      ...makeCamera(),
      isHexVisible: (coord: { q: number; r: number }) => coord.q === 5,
    } as unknown as Camera;
    drawWorkedTileMarkers(ctx, state, camera, 'player');

    const text = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(text).toContain('💰');
  });
});
```

- [ ] **Step 2: Run renderer tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/worked-tile-renderer.test.ts
```

Expected: FAIL because `worked-tile-renderer.ts` does not exist.

- [ ] **Step 3: Implement renderer**

Create `src/renderer/worked-tile-renderer.ts`:

```ts
import type { CityFocus, GameState, HexCoord } from '@/core/types';
import type { Camera } from './camera';
import { hexKey, hexToPixel } from '@/systems/hex-utils';
import { isVisible } from '@/systems/fog-of-war';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

export const FOCUS_GLYPHS: Record<CityFocus, string> = {
  balanced: '•',
  food: '🌾',
  production: '⚒',
  gold: '💰',
  science: '🔬',
  custom: '•',
};

export interface WorkedTileMarker {
  cityId: string;
  coord: HexCoord;
  focus: CityFocus;
  glyph: string;
}

export function getWorkedTileRenderData(state: GameState, viewerCivId: string): WorkedTileMarker[] {
  const visibility = state.civilizations[viewerCivId]?.visibility;
  if (!visibility) return [];

  const markers: WorkedTileMarker[] = [];
  const seen = new Set<string>();

  for (const city of Object.values(state.cities)) {
    for (const coord of city.workedTiles ?? []) {
      const key = hexKey(coord);
      if (seen.has(key) || !isVisible(visibility, coord)) continue;
      seen.add(key);
      markers.push({
        cityId: city.id,
        coord: { ...coord },
        focus: city.focus,
        glyph: FOCUS_GLYPHS[city.focus],
      });
    }
  }

  return markers;
}

export function drawWorkedTileMarkers(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  viewerCivId: string,
): void {
  const markers = getWorkedTileRenderData(state, viewerCivId);
  for (const marker of markers) {
    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(marker.coord, state.map.width, camera)
      : [marker.coord];

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;
      const pixel = hexToPixel(renderCoord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom;

      ctx.beginPath();
      ctx.arc(screen.x, screen.y - size * 0.12, size * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,24,35,0.85)';
      ctx.lineWidth = Math.max(1, size * 0.035);
      ctx.stroke();

      ctx.font = `${Math.max(10, size * 0.24)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👤', screen.x, screen.y - size * 0.12);

      ctx.beginPath();
      ctx.arc(screen.x + size * 0.16, screen.y - size * 0.25, size * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15,15,25,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();

      ctx.font = `${Math.max(8, size * 0.16)}px system-ui`;
      ctx.fillText(marker.glyph, screen.x + size * 0.16, screen.y - size * 0.25);
    }
  }
}
```

- [ ] **Step 4: Run renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/worked-tile-renderer.test.ts
```

Expected: PASS.

## Task 4: Wire Markers Into The Render Loop

**Files:**
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/renderer/render-loop-wrap.test.ts`

- [ ] **Step 1: Add render-loop wiring test**

In `tests/renderer/render-loop-wrap.test.ts`, extend the hoisted renderer mocks:

```ts
drawWorkedTileMarkers: vi.fn(),
```

Add this mock:

```ts
vi.mock('@/renderer/worked-tile-renderer', () => ({
  drawWorkedTileMarkers: rendererMocks.drawWorkedTileMarkers,
}));
```

Then add:

```ts
it('draws worked tile markers during map rendering', () => {
  rendererMocks.drawWorkedTileMarkers.mockReset();
  const loop = new RenderLoop(createCanvas());
  const state = {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: true, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: {},
    civilizations: {
      player: {
        color: '#4a90d9',
        visibility: { tiles: {} },
      },
    },
  } as unknown as GameState;

  loop.setGameState(state);
  (loop as unknown as { render: () => void }).render();

  expect(rendererMocks.drawWorkedTileMarkers).toHaveBeenCalledWith(
    expect.anything(),
    state,
    expect.anything(),
    'player',
  );
});
```

- [ ] **Step 2: Wire renderer**

In `src/renderer/render-loop.ts`, import:

```ts
import { drawWorkedTileMarkers } from './worked-tile-renderer';
```

After city drawing and before unit drawing, call:

```ts
drawWorkedTileMarkers(this.ctx, this.state, this.camera, this.state.currentPlayer);
```

This keeps markers above terrain/highlights and below fog overlays. Fog still covers markers because `drawFogOfWar` runs after cities, markers, and units today.

- [ ] **Step 3: Run renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/worked-tile-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: PASS.

## Task 5: Verification And Commit

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/city-focus-reminder-system.ts src/renderer/worked-tile-renderer.ts src/main.ts src/renderer/render-loop.ts
```

Expected: no rule violations.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-focus-reminder-system.test.ts tests/renderer/worked-tile-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Commit MR 1e**

Run:

```bash
git add src/systems/city-focus-reminder-system.ts src/renderer/worked-tile-renderer.ts src/main.ts src/renderer/render-loop.ts tests/systems/city-focus-reminder-system.test.ts tests/renderer/worked-tile-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
git commit -m "feat(city): show worked tile focus markers"
```
