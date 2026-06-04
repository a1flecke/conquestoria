# Stage 2K City Renderer Layer Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents unless the user explicitly authorizes them. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor city rendering into explicit, testable render passes while preserving current gameplay, UI, SFX, PWA, and visibility behavior.

**Architecture:** Keep `drawCities(...)` as the public renderer entry point. Build one viewer-safe `CityRenderItem` per visible city/render coordinate, then draw it through named pass helpers in `src/renderer/city-render-passes.ts`. Pass helpers draw only from the prepared item, emit test-only operation sentinels when the mock context exposes `operations`, and preserve the current visual contract except for test-backed objective layering fixes.

**Tech Stack:** TypeScript, Canvas 2D, Vitest, existing `Camera`, fog-of-war visibility, city-system production icons, minor-civ definitions, and legendary wonder map presentation helpers.

---

## Scope Check

Implement only the Stage 2K/C city renderer layer architecture pass:

- extract city base/icon/landmark/label/status/production/idle drawing into named pass helpers
- keep `drawCities(...)` as the live public entry point
- preserve `getProductionBadgeIcon(...)` as an exported helper from `src/renderer/city-renderer.ts`
- add tests for pass order, badge priority, fogged-city privacy, wrap rendering, and rival-intel privacy
- fix objective layer-order bugs only when backed by a focused regression

Do not implement:

- Stage 2J known-rival landmark visibility
- gameplay, save, production, fog-of-war, or legendary wonder intel rule changes
- UI controls, DOM panels, player actions, audio/SFX, attribution, PWA, service worker, Vite, Tauri, storage, or platform capability changes
- subjective city visual redesign, typography changes, icon art changes, badge repositioning, unit rendering, tile rendering, selection overlays, hover overlays, or debug overlays

## File Structure

- Create: `src/renderer/city-render-passes.ts`
  - Own `CityRenderItem`, `CityRenderProjection`, pass helpers, production badge icon/sprite helpers, and the ordered pass pipeline.
  - Draw only from prepared item data.
  - Emit `city-pass:<name>` operation sentinels only when the canvas context exposes the test-only `operations` array.
- Modify: `src/renderer/city-renderer.ts`
  - Keep `drawCities(...)` and `getCityRenderData(...)`.
  - Re-export `getProductionBadgeIcon(...)` from `city-render-passes.ts`.
  - Build `CityRenderItem[]` from viewer-safe state, visibility, wrap coordinates, and landmark entries.
  - Call `drawCityRenderItem(...)` for each item.
- Modify: `tests/renderer/city-renderer.test.ts`
  - Add pass order, privacy, badge priority, wrap, and rival-intel tests through the live `drawCities(...)` path.

## Player Truth Table

| Before | Action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Player city with completed landmark and production queue | Player views map | City base/icon, landmark, label, then production badge render in that order | City label and badge remain readable |
| Player city with completed landmark and idle production | Player views map | Idle badge renders after landmark and label | Idle gold/science state remains visible |
| Player city with breakaway/occupation/unrest | Player views map | Status badge renders after landmarks and follows existing priority | Breakaway/occupation/unrest signal remains visible |
| Fogged last-seen city with live city still in state | Player views fogged area | Last-seen label only; no live production, idle, status, or landmark detail leaks | Fogged city remains identifiable by last-seen data |
| Horizontally wrapped visible city copy | Player views seam copy | The mirrored render coordinate receives the same city pass sequence | Wrap rendering remains intact |
| Rival completed intel only | Player views map | No rival landmark renders from completed intel alone | Atlas/Codex intel remains separate and safe |

## Misleading UI Risks

- A pass split can make a no-op pass look like a feature change. Tests should assert visible text/operation order, not claim new UI behavior.
- Fogged cities may still pass through no-op helpers. That is acceptable only if no live city data, live badges, or landmarks draw.
- Pass sentinels are test-only mock operations. They must not create visible UI, audio, DOM output, saved state, or gameplay data.

## Interaction Replay Checklist

This MR adds no interactions. Existing replayable renderer surfaces must still work:

- opening/reopening the map render path
- changing current viewer in hot-seat
- moving camera across horizontal wrap seams
- toggling reduced motion through existing render options
- rendering city labels, production badges, idle badges, status badges, and landmarks on repeated frames

## Task 1: Add Failing City Pass Contract Tests

**Files:**

- Modify: `tests/renderer/city-renderer.test.ts`
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Add helper functions near `makeCamera()`**

Add these helpers after `makeCamera()`:

```ts
function operationIndex(ctx: CanvasRenderingContext2D, operation: string): number {
  return (ctx as unknown as MockCanvasContext).operations.findIndex(entry => entry === operation);
}

function expectOperationBefore(ctx: CanvasRenderingContext2D, before: string, after: string): void {
  const beforeIndex = operationIndex(ctx, before);
  const afterIndex = operationIndex(ctx, after);
  expect(beforeIndex, before).toBeGreaterThanOrEqual(0);
  expect(afterIndex, after).toBeGreaterThanOrEqual(0);
  expect(beforeIndex, `${before} before ${after}`).toBeLessThan(afterIndex);
}

function addVisiblePlayerCityWithWonder(state = createNewGame(undefined, 'city-pass-order', 'small')) {
  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map, state.idCounters);
  city.id = 'city-pass-order-city';
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
  };
  return { state, city };
}
```

- [ ] **Step 2: Add pass-order test for production badge**

Add this test inside `describe('city renderer', ...)` after the existing legendary landmark order test:

```ts
  it('draws explicit city passes in order for landmarks, labels, status, and production badges', () => {
    const { state, city } = addVisiblePlayerCityWithWonder();
    city.productionQueue = ['granary'];
    city.unrestLevel = 1;

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    expectOperationBefore(ctx, 'city-pass:base', 'city-pass:icon');
    expectOperationBefore(ctx, 'city-pass:icon', 'city-pass:landmarks');
    expectOperationBefore(ctx, 'city-pass:landmarks', 'city-pass:label');
    expectOperationBefore(ctx, 'city-pass:label', 'city-pass:status');
    expectOperationBefore(ctx, 'city-pass:status', 'city-pass:production');
    expectOperationBefore(ctx, 'city-pass:production', 'city-pass:idle');
    expectOperationBefore(ctx, 'city-pass:landmarks', `text:${city.name} (${city.population})`);
    expectOperationBefore(ctx, 'city-pass:landmarks', `text:${getProductionBadgeIcon(city)}`);
    expectOperationBefore(ctx, 'city-pass:landmarks', 'text:⚡');
  });
```

- [ ] **Step 3: Add pass-order test for idle badge**

Add:

```ts
  it('draws idle badge after legendary landmarks and labels', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-idle', 'small'));
    city.productionQueue = [];
    city.idleProduction = 'gold';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    expectOperationBefore(ctx, 'city-pass:landmarks', 'city-pass:idle');
    expectOperationBefore(ctx, `text:${city.name} (${city.population})`, 'text:💰');
  });
```

- [ ] **Step 4: Add status badge priority tests**

Add:

```ts
  it('preserves status badge priority: breakaway over occupation and unrest', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-breakaway-priority', 'small'));
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };
    city.unrestLevel = 2;
    state.civilizations.player.breakaway = {
      originOwnerId: 'ai-1',
      originCityId: city.id,
      status: 'secession',
      startedTurn: 10,
      establishesOnTurn: 60,
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).toContain('⛓');
    expect(texts).not.toContain('☹');
    expect(texts).not.toContain('🔥');
  });

  it('preserves status badge priority: occupation over ordinary unrest', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-occupation-priority', 'small'));
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };
    city.unrestLevel = 2;

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).toContain('☹');
    expect(texts).not.toContain('🔥');
  });
```

- [ ] **Step 5: Add fogged-city privacy regression**

Add:

```ts
  it('does not leak live production idle status or landmark data for fogged last-seen cities', () => {
    const state = createNewGame(undefined, 'city-pass-fogged-privacy', 'small');
    const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.id = 'fogged-live-city';
    city.name = 'Live Secret';
    city.productionQueue = ['warrior'];
    city.idleProduction = 'gold';
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 9 };
    city.unrestLevel = 2;
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
    };
    state.civilizations.player.visibility = {
      tiles: { [hexKey(city.position)]: 'fog' },
      lastSeen: {
        [hexKey(city.position)]: {
          coord: { ...city.position },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: 'player',
          hasRiver: false,
          wonder: null,
          city: { id: city.id, name: 'Old Public', owner: 'player', population: 2 },
        },
      },
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).toContain('Old Public (2)');
    expect(texts).not.toContain('Live Secret (1)');
    expect(texts).not.toContain('⚔️');
    expect(texts).not.toContain('💰');
    expect(texts).not.toContain('☹');
    expect(texts).not.toContain('🔥');
    expect((ctx as unknown as MockCanvasContext).operations).not.toContain('legendary-landmarks:start');
  });
```

- [ ] **Step 6: Add wrapped copy pass regression**

Add:

```ts
  it('draws the full city pass sequence for horizontally wrapped visible copies', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-wrap', 'small'));
    state.map.wrapsHorizontally = true;
    state.map.width = 5;
    city.position = { q: 0, r: 0 };
    city.productionQueue = ['granary'];
    state.civilizations.player.visibility.tiles = { '0,0': 'visible' };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: (coord: { q: number; r: number }) => coord.q === 5,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawCities(ctx, state, camera, 'player', { nowMs: 1000 });

    expect((ctx as unknown as MockCanvasContext).operations).toContain('city-pass:base');
    expect((ctx as unknown as MockCanvasContext).operations).toContain('city-pass:landmarks');
    expect((ctx as unknown as MockCanvasContext).operations).toContain(`text:${city.name} (${city.population})`);
    expect((ctx as unknown as MockCanvasContext).operations).toContain(`text:${getProductionBadgeIcon(city)}`);
  });
```

- [ ] **Step 7: Add rival-completed-intel privacy regression through renderer path**

Add:

```ts
  it('does not draw rival map landmarks from completed rival intel alone', () => {
    const state = createNewGame(undefined, 'city-pass-rival-intel', 'small');
    const aiSettler = Object.values(state.units).find(unit => unit.owner === 'ai-1' && unit.type === 'settler')!;
    const rivalCity = foundCity('ai-1', aiSettler.position, state.map, state.idCounters);
    rivalCity.id = 'rival-legendary-city';
    state.cities[rivalCity.id] = rivalCity;
    state.civilizations['ai-1'].cities.push(rivalCity.id);
    state.civilizations.player.visibility.tiles[hexKey(rivalCity.position)] = 'visible';
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'ai-1', cityId: rivalCity.id, turnCompleted: 20 },
    };
    state.legendaryWonderIntel = {
      player: [{
        kind: 'completed',
        eventId: 'completed:oracle-of-delphi:ai-1:20',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 20,
        learnedTurn: 20,
      }],
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    expect((ctx as unknown as MockCanvasContext).operations).not.toContain('legendary-landmarks:start');
  });
```

- [ ] **Step 8: Run tests and verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/renderer/city-renderer.test.ts
```

Expected: FAIL because `city-pass:*` operations are not emitted by the current inline renderer.

- [ ] **Step 9: Commit failing tests**

Run:

```bash
git add tests/renderer/city-renderer.test.ts
git commit -m "test(renderer): require explicit city render pass order"
```

## Task 2: Add City Render Pass Module

**Files:**

- Create: `src/renderer/city-render-passes.ts`
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Create the pass module**

Create `src/renderer/city-render-passes.ts` with this content:

```ts
import type { City, HexCoord } from '@/core/types';
import { getOccupiedCityMood } from '@/systems/city-occupation-system';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import type { LegendaryWonderMapEntry } from '@/systems/legendary-wonder-map-presentation';
import { drawLegendaryWonderLandmarks } from '@/renderer/wonders/legendary-wonder-renderer';
import { spriteCache } from '@/renderer/sprites/sprite-loader';

const CITY_ICON_EMOJI_Y_NUDGE_RATIO = 0.08;

export interface CityRenderProjection {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  isLive: boolean;
  liveCityId?: string;
}

export interface CityRenderItem {
  projection: CityRenderProjection;
  city?: City;
  screen: { x: number; y: number };
  size: number;
  ownerColor: string;
  playerCivId: string;
  isMinorCiv: boolean;
  minorCivIcon?: string;
  breakaway?: { status: 'secession' | 'established' };
  landmarkEntries: LegendaryWonderMapEntry[];
  lowZoom: boolean;
  reducedMotion: boolean;
  nowMs: number;
  turn: number;
}

export type CityRenderPassName =
  | 'base'
  | 'icon'
  | 'landmarks'
  | 'label'
  | 'status'
  | 'production'
  | 'idle';

export type CityRenderPass = {
  name: CityRenderPassName;
  draw: (ctx: CanvasRenderingContext2D, item: CityRenderItem) => void;
};

export function getProductionBadgeIcon(city: { productionQueue: string[] }): string | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return PRODUCTION_ICONS[id] ?? PRODUCTION_ICON_FALLBACK;
}

export function getProductionBadgeSprite(
  city: { productionQueue: string[] },
  civId: string,
): HTMLImageElement | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return spriteCache.getBuilding(id, civId) ?? null;
}

function markPass(ctx: CanvasRenderingContext2D, passName: CityRenderPassName): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`city-pass:${passName}`);
}

export function drawCityBasePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'base');
  ctx.beginPath();
  ctx.arc(item.screen.x, item.screen.y, item.size * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = item.ownerColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawCityIconPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'icon');
  ctx.font = `${item.size * 0.45}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    item.isMinorCiv ? item.minorCivIcon ?? '📜' : '🏛️',
    item.screen.x,
    item.screen.y + item.size * CITY_ICON_EMOJI_Y_NUDGE_RATIO,
  );
}

export function drawCityLandmarkPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'landmarks');
  if (item.landmarkEntries.length === 0) return;
  drawLegendaryWonderLandmarks({
    ctx,
    cx: item.screen.x,
    cy: item.screen.y,
    size: item.size,
    entries: item.landmarkEntries,
    reducedMotion: item.reducedMotion,
    lowZoom: item.lowZoom,
    turn: item.turn,
    nowMs: item.nowMs,
  });
}

export function drawCityLabelPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'label');
  ctx.font = `bold ${Math.max(9, item.size * 0.22)}px system-ui`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${item.projection.name} (${item.projection.population})`,
    item.screen.x,
    item.screen.y + item.size * 0.5,
  );
}

export function drawCityStatusBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'status');
  if (!item.projection.isLive || !item.city) return;

  const statusText = item.breakaway
    ? item.breakaway.status === 'secession' ? '⛓' : '👑'
    : item.city.occupation
      ? getOccupiedCityMood(item.city) === 2 ? '☹' : '⚡'
      : item.city.unrestLevel > 0
        ? item.city.unrestLevel === 2 ? '🔥' : '⚡'
        : null;
  if (!statusText) return;

  ctx.font = `${item.size * 0.28}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(statusText, item.screen.x + item.size * 0.45, item.screen.y - item.size * 0.45);
}

export function drawCityProductionBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'production');
  if (!item.projection.isLive || !item.city || item.city.owner !== item.playerCivId) return;

  const badgeSprite = item.lowZoom ? null : getProductionBadgeSprite(item.city, item.playerCivId);
  if (badgeSprite) {
    const badgeSize = item.size * 0.30;
    ctx.drawImage(
      badgeSprite,
      item.screen.x + item.size * 0.45 - badgeSize / 2,
      item.screen.y + item.size * 0.45 - badgeSize / 2,
      badgeSize,
      badgeSize,
    );
    return;
  }

  const buildIcon = getProductionBadgeIcon(item.city);
  if (!buildIcon) return;
  ctx.font = `${item.size * 0.28}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(buildIcon, item.screen.x + item.size * 0.45, item.screen.y + item.size * 0.45);
}

export function drawCityIdleBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'idle');
  if (
    !item.projection.isLive ||
    !item.city ||
    item.city.owner !== item.playerCivId ||
    item.city.productionQueue.length > 0 ||
    (item.city.idleProduction !== 'gold' && item.city.idleProduction !== 'science')
  ) {
    return;
  }

  const idleIcon = item.city.idleProduction === 'gold' ? '💰' : '🔬';
  ctx.font = `${item.size * 0.28}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(idleIcon, item.screen.x - item.size * 0.45, item.screen.y - item.size * 0.45);
}

export const CITY_RENDER_PASSES: CityRenderPass[] = [
  { name: 'base', draw: drawCityBasePass },
  { name: 'icon', draw: drawCityIconPass },
  { name: 'landmarks', draw: drawCityLandmarkPass },
  { name: 'label', draw: drawCityLabelPass },
  { name: 'status', draw: drawCityStatusBadgePass },
  { name: 'production', draw: drawCityProductionBadgePass },
  { name: 'idle', draw: drawCityIdleBadgePass },
];

export function drawCityRenderItem(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  for (const pass of CITY_RENDER_PASSES) {
    pass.draw(ctx, item);
  }
}
```

- [ ] **Step 2: Add `drawImage` to the test mock**

In `tests/renderer/city-renderer.test.ts`, add this method to `MockCanvasContext` after `fillText(...)`:

```ts
  drawImage(): void {
    this.operations.push('drawImage');
  }
```

- [ ] **Step 3: Run renderer tests and verify still RED**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/renderer/city-renderer.test.ts
```

Expected: FAIL because the pass module exists, but `drawCities(...)` still uses inline drawing and does not emit `city-pass:*` operations.

- [ ] **Step 4: Commit pass module**

Run:

```bash
git add src/renderer/city-render-passes.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(renderer): add city render pass module"
```

## Task 3: Wire `drawCities` To Render Pass Items

**Files:**

- Modify: `src/renderer/city-renderer.ts`
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Replace renderer imports and helper exports**

In `src/renderer/city-renderer.ts`, remove these imports and constants:

```ts
const CITY_ICON_EMOJI_Y_NUDGE_RATIO = 0.08;
import { getOccupiedCityMood } from '@/systems/city-occupation-system';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import { spriteCache } from './sprites/sprite-loader';
import { drawLegendaryWonderLandmarks } from '@/renderer/wonders/legendary-wonder-renderer';
```

Add this import block:

```ts
import {
  drawCityRenderItem,
  type CityRenderItem,
  type CityRenderProjection,
} from '@/renderer/city-render-passes';
```

Then add this re-export near the imports:

```ts
export { getProductionBadgeIcon } from '@/renderer/city-render-passes';
```

- [ ] **Step 2: Remove old production helper implementations**

Delete the old `getProductionBadgeIcon(...)` and `getProductionBadgeSprite(...)` function definitions from `src/renderer/city-renderer.ts`. They now live in `src/renderer/city-render-passes.ts`, and `getProductionBadgeIcon(...)` is re-exported to preserve existing imports.

- [ ] **Step 3: Remove the local `CityRenderProjection` interface**

Delete this local interface from `src/renderer/city-renderer.ts` because the shared type now lives in `src/renderer/city-render-passes.ts`:

```ts
interface CityRenderProjection {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  isLive: boolean;
  liveCityId?: string;
}
```

- [ ] **Step 4: Replace `drawCities(...)` with item-building orchestration**

Replace the body of `drawCities(...)` with:

```ts
export function drawCities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  playerCivId: string,
  options: CityRenderOptions | boolean = {},
): void {
  const items = createCityRenderItems(state, camera, playerCivId, options);
  for (const item of items) {
    drawCityRenderItem(ctx, item);
  }
}
```

- [ ] **Step 5: Add `createCityRenderItems(...)` below `drawCities(...)`**

Add this helper below `drawCities(...)`:

```ts
function createCityRenderItems(
  state: GameState,
  camera: Camera,
  playerCivId: string,
  options: CityRenderOptions | boolean,
): CityRenderItem[] {
  const reducedMotion = typeof options === 'boolean' ? options : options.reducedMotion ?? false;
  const nowMs = typeof options === 'boolean' ? state.turn * 1000 : options.nowMs ?? state.turn * 1000;
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return [];

  const landmarksByCity = new Map<string, LegendaryWonderMapEntry[]>();
  for (const entry of getLegendaryWonderMapEntries(state, playerCivId)) {
    landmarksByCity.set(entry.cityId, [...(landmarksByCity.get(entry.cityId) ?? []), entry]);
  }

  const items: CityRenderItem[] = [];
  for (const projection of getCityRenderProjection(state, playerCivId)) {
    const city = projection.liveCityId ? state.cities[projection.liveCityId] : undefined;
    const mcState = projection.isLive && projection.owner.startsWith('mc-')
      ? state.minorCivs?.[projection.owner]
      : null;
    const mcDef = mcState ? MINOR_CIV_DEFINITIONS.find(definition => definition.id === mcState.definitionId) : null;
    const ownerColor = mcDef?.color
      ?? state.civilizations[projection.owner]?.color
      ?? OWNER_COLORS[projection.owner]
      ?? '#888';
    const breakaway = projection.isLive ? state.civilizations[projection.owner]?.breakaway : undefined;
    const minorCivIcon = mcDef?.archetype === 'militaristic'
      ? '⚔️'
      : mcDef?.archetype === 'mercantile'
        ? '🪙'
        : '📜';

    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(projection.position, state.map.width, camera)
      : [projection.position];

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;

      const pixel = hexToPixel(renderCoord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom;
      const landmarkEntries = projection.liveCityId
        ? landmarksByCity.get(projection.liveCityId) ?? []
        : [];

      items.push({
        projection,
        city: projection.isLive ? city : undefined,
        screen,
        size,
        ownerColor,
        playerCivId,
        isMinorCiv: projection.isLive && projection.owner.startsWith('mc-'),
        minorCivIcon,
        breakaway: breakaway ? { status: breakaway.status } : undefined,
        landmarkEntries,
        lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
        reducedMotion,
        nowMs,
        turn: state.turn,
      });
    }
  }

  return items;
}
```

- [ ] **Step 6: Keep `getCityRenderProjection(...)` private and unchanged except type source**

Ensure `getCityRenderProjection(...)` still returns `CityRenderProjection[]`. The type now comes from `city-render-passes.ts`; the function logic should remain:

```ts
function getCityRenderProjection(state: GameState, playerCivId: string): CityRenderProjection[] {
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return [];

  const liveCities = Object.values(state.cities)
    .filter(city => getVisibility(vis, city.position) === 'visible')
    .map(city => ({
      name: city.name,
      position: city.position,
      population: city.population,
      owner: city.owner,
      isLive: true,
      liveCityId: city.id,
    }));

  const staleCities = Object.values(vis.lastSeen ?? {})
    .filter(snapshot => getVisibility(vis, snapshot.coord) === 'fog' && snapshot.city)
    .map(snapshot => ({
      name: snapshot.city!.name,
      position: snapshot.coord,
      population: snapshot.city!.population,
      owner: snapshot.city!.owner,
      isLive: false,
    }));

  return [...liveCities, ...staleCities];
}
```

- [ ] **Step 7: Run renderer tests and verify GREEN**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit city renderer wiring**

Run:

```bash
git add src/renderer/city-renderer.ts
git commit -m "refactor(renderer): route cities through render passes"
```

## Task 4: Review For Objective Layering Bugs And Tighten Tests

**Files:**

- Modify: `tests/renderer/city-renderer.test.ts` only if Step 2 finds an objective bug
- Modify: `src/renderer/city-render-passes.ts` only if Step 2 finds an objective bug
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Inspect committed diff for unintended behavior changes**

Run:

```bash
git diff origin/main...HEAD -- src/renderer/city-renderer.ts src/renderer/city-render-passes.ts tests/renderer/city-renderer.test.ts
```

Check these invariants manually:

- `drawCities(...)` signature did not change.
- `getProductionBadgeIcon(...)` remains importable from `@/renderer/city-renderer`.
- `getLegendaryWonderMapEntries(state, playerCivId)` is called once per `drawCities(...)` call through `createCityRenderItems(...)`.
- No DOM, PWA, Tauri, storage, audio, SFX, or platform imports were added.
- Pass helpers do not mutate `GameState`, `City`, visibility snapshots, or landmark entry arrays.

- [ ] **Step 2: If an objective bug is found, add a failing regression first**

Only use this step if review finds an actual objective layer/data bug. Add a focused test in `tests/renderer/city-renderer.test.ts` that follows this shape:

```ts
  it('describes the exact objective layer bug', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'exact-bug-seed', 'small'));
    // Arrange only the fields needed to reproduce the bug.

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    // Assert the visible text/operation order that was wrong.
  });
```

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/renderer/city-renderer.test.ts
```

Expected: FAIL for the exact bug.

- [ ] **Step 3: Fix only that objective bug**

Modify only the affected pass helper or item-building field. Do not move badge coordinates, change icons, or redesign visuals unless the failing test requires it.

- [ ] **Step 4: Run renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit review fix or record no-op**

If code/tests changed in this task, run:

```bash
git add src/renderer/city-render-passes.ts src/renderer/city-renderer.ts tests/renderer/city-renderer.test.ts
git commit -m "fix(renderer): preserve city layer contract"
```

If no objective bugs were found, do not create an empty commit. Note "Task 4 review found no additional objective bugs" in the final PR body.

## Task 5: Final Verification And PR

**Files:**

- All changed files

- [ ] **Step 1: Run source-rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/renderer/city-renderer.ts src/renderer/city-render-passes.ts
```

Expected: exit 0.

- [ ] **Step 2: Run targeted renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS. If the sandbox-only mise cache warning appears, note it only if the command exits 0.

- [ ] **Step 4: Run build and full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

Expected: both exit 0. Note the existing Vite large-chunk warning if it appears.

- [ ] **Step 5: Review branch and local diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check origin/main...HEAD
git status -sb
```

Expected:

- branch diff includes the Stage 2K spec, plan, city renderer pass module, city renderer wiring, and renderer tests
- local diff is empty
- no whitespace errors

- [ ] **Step 6: Rebase and verify fast-forward eligibility**

Run:

```bash
git fetch origin main
git rebase origin/main
git merge-base --is-ancestor origin/main HEAD
```

Expected: rebase succeeds, merge-base exits 0.

- [ ] **Step 7: Push branch and create draft PR**

Create `/private/tmp/conquestoria-stage-2k-pr-body.md` containing:

```markdown
## Summary

- Adds explicit city render passes for base, icon, landmarks, label, status, production, and idle badges.
- Keeps `drawCities(...)` as the public city-rendering entry point.
- Preserves fogged last-seen privacy, horizontal wrap rendering, status badge priority, production/idle badge behavior, and Stage 2G/2I landmark layering.

## Out of scope

- Stage 2J known-rival landmark visibility.
- Gameplay, save, fog-of-war, production, audio/SFX, PWA, Tauri, storage, platform, DOM UI, and subjective visual redesign changes.

## Why this is safe

This MR is a renderer architecture pass. It introduces no new player action, UI control, audio trigger, save data, or gameplay rule. The live renderer path still enters through `drawCities(...)`, and new tests prove labels, status badges, production badges, idle badges, fogged city privacy, wrap rendering, and rival-intel privacy remain intact.

## Verification

- `scripts/check-src-rule-violations.sh src/renderer/city-renderer.ts src/renderer/city-render-passes.ts`
- `./scripts/run-with-mise.sh yarn test --run tests/renderer/city-renderer.test.ts`
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`

## Rebase / merge readiness

- Rebased onto latest `origin/main`.
- `git merge-base --is-ancestor origin/main HEAD` exits 0.
- `git diff --stat` is empty.
- `git diff --check origin/main...HEAD` exits 0.
```

Then run:

```bash
git push -u origin codex/stage-2k-city-renderer-layers
gh pr create --draft --base main --head codex/stage-2k-city-renderer-layers --title "Stage 2K city renderer layer architecture" --body-file /private/tmp/conquestoria-stage-2k-pr-body.md
```

Expected: draft PR URL.

## Plan Self-Review

- Spec coverage: Tasks cover public API preservation, render item preparation, named pass helpers, layer order, badge priority, fogged privacy, wrap rendering, rival-intel privacy, performance constraints, no SFX/audio changes, no PWA/Tauri/platform changes, and final verification.
- Testing coverage: The plan adds tests before implementation for pass sentinel order, production/idle/status ordering, status priority, fogged privacy, wrap copies, and rival intel privacy. Existing city renderer tests remain in the same file and continue to exercise the live `drawCities(...)` path.
- Architecture: `drawCities(...)` remains the entry point. `city-render-passes.ts` owns drawing passes and helpers. `city-renderer.ts` owns viewer-safe item construction and state/visibility queries. This avoids pass helpers reaching into broad `GameState`.
- Performance: The plan groups landmarks once per draw call, computes owner/minor-civ data once per render item, and forbids per-frame DOM, network, storage, platform, audio, or asset-loading work.
- UI/UX: The plan preserves existing city visuals and only makes layer order explicit. It allows objective bug fixes only with focused regressions.
- SFX/audio: Explicitly out of scope in the spec, plan scope, and PR body.
- PWA/distribution: Explicitly out of scope; no service worker, Vite, Tauri, storage, or platform files are planned.
- Type consistency: `CityRenderProjection`, `CityRenderItem`, `CityRenderPassName`, `CITY_RENDER_PASSES`, `drawCityRenderItem`, and `getProductionBadgeIcon` are defined in Task 2 and used consistently in Task 3.
- Marker scan: No unresolved marker terms, vague cross-references, or unspecified test instructions remain; all planned tests include concrete code and commands.
