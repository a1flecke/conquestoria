# Bug Batch: Music / Zoom / Earth Map Starts / Coastal Buildings

**Issues:** #246, #247, #251, #253  
**Date:** 2026-05-23  
**PR strategy:** Single "bug batch" PR

---

## #246 — Era-1 Music Not Playing

### Root causes

Two stacked bugs both prevent music from playing on a fresh (era-1) game:

1. **Suspended AudioContext.** `new AudioContext()` is called at module load before any user gesture, so the browser suspends the context. `armIosResume()` currently only listens for `visibilitychange` (iOS background/foreground), not the initial tap or click that starts the game.

2. **Snapshot never leaves 'silent'.** In `audio-system.ts start()`, the comment block that restores snapshot state is guarded by `if (state.era > 1)`. For era-1 games the mixer snapshot stays at `'silent'` permanently — all bus gains are 0, so even if the context resumes the audio is inaudible.

### Fix

**File:** `src/audio/audio-system.ts`

**Snapshot fix** — split the existing `if (state.era > 1)` block into an if/else:

```ts
if (state.era > 1) {
  this.director.handleEraAdvanced({ era: state.era, civType: this.currentCivType });
} else {
  this.mixer.setSnapshot('peace', 0);   // era-1: transition to peace, no stinger
}
```

`setSnapshot` is synchronous and sets gain targets on the mixer's GainNodes. When `preloadForEra` resolves and `setBusSource` starts the audio sources, they play at the correct 'peace' gain level immediately.

> **Known limitation:** War state is not persisted in the audio system. A saved game at era=1 that had an active war will play peace music on load until the next war/peace event fires. This is pre-existing behaviour (era > 1 saves have the same gap) and out of scope for this fix.

**Gesture resume fix** — add a `gestureResumeHandler` field and extend `armIosResume` / `disarmIosResume`:

```ts
private gestureResumeHandler: (() => void) | null = null;

private armIosResume(): void {
  if (typeof document === 'undefined') return;
  const visHandler = () => void this.tryResume();
  this.iosResumeListeners.push(visHandler);
  document.addEventListener('visibilitychange', visHandler);

  this.gestureResumeHandler = () => {
    void this.tryResume();
    document.removeEventListener('pointerdown', this.gestureResumeHandler!);
    this.gestureResumeHandler = null;
  };
  document.addEventListener('pointerdown', this.gestureResumeHandler);
}

private disarmIosResume(): void {
  if (typeof document === 'undefined') return;
  for (const handler of this.iosResumeListeners) {
    document.removeEventListener('visibilitychange', handler);
  }
  this.iosResumeListeners = [];
  if (this.gestureResumeHandler) {
    document.removeEventListener('pointerdown', this.gestureResumeHandler);
    this.gestureResumeHandler = null;
  }
}
```

### Tests (`tests/audio/audio-system.test.ts`)

- `start()` with `state.era === 1` calls `mixer.setSnapshot('peace', 0)` and does NOT call `handleEraAdvanced`.
- `start()` with `state.era === 2` calls `handleEraAdvanced` and does NOT call `setSnapshot` directly.
- `armIosResume` registers a `pointerdown` listener (verify via spy on `document.addEventListener`).

---

## #247 — Zoom Out Duplicates Map

### Root cause

`Camera.minZoom` is hardcoded at `0.3` regardless of map dimensions. At that zoom level, `camera.width / camera.zoom` (the visible world width) exceeds the map's pixel span. `getHorizontalWrapRenderCoords` in `wrap-rendering.ts` then computes `minOffset` / `maxOffset` values spanning more than one full map copy, causing the full map to render side-by-side 2–3 times.

### Fix

**File:** `src/renderer/camera.ts` — new method:

```ts
setMinZoomForMap(mapWidthPx: number): void {
  if (mapWidthPx <= 0 || this.width <= 0) return;
  this.minZoom = this.width / mapWidthPx;
  if (this.zoom < this.minZoom) {
    this.zoom = this.minZoom;
    this.targetZoom = this.minZoom;
  }
}
```

**File:** `src/main.ts` — call site alongside `audio.start()` after game state is loaded:

```ts
// Compute map pixel span (same formula as wrap-rendering.ts wrapSpan)
const mapWidthPx = hexToPixel({ q: gameState.map.width, r: 0 }, renderLoop.camera.hexSize).x;
renderLoop.camera.setMinZoomForMap(mapWidthPx);
```

`hexToPixel` is already imported in `main.ts`. The formula matches the `wrapSpan` calculation in `wrap-rendering.ts` exactly — `hexToPixel({q: mapWidth, r:0}, hexSize).x - hexToPixel({q:0, r:0}, hexSize).x` which simplifies to `hexToPixel({q: mapWidth, r:0}, hexSize).x` since origin is 0.

This needs to be called once per game load (new game and load-from-save). Both paths go through the same `init()` function, so a single call site covers both.

### Tests (`tests/renderer/camera.test.ts`)

- `setMinZoomForMap(mapWidthPx)` sets `minZoom` to `camera.width / mapWidthPx`.
- `setZoom` below the computed `minZoom` is clamped to `minZoom`.
- If current `zoom` already exceeds the new `minZoom`, it is unchanged.

---

## #251 — Earth Map Starting Positions (Full Audit)

### Root causes

- On the **small** map, England, France, and Germany all share `{q:15, r:5}` — a copy-paste error.
- At least England's position resolves to a water or otherwise invalid tile on one or more map sizes.
- No validation exists to catch future data drift.

### Fix

**Step 1 — `findNearestValidStart` helper**

New file: `src/systems/map-validation.ts`

```ts
export function isValidStartTile(tile: MapTile | undefined): boolean {
  if (!tile) return false;
  // Matches the isLandTerrain() exclusion list in map-generator.ts:
  // ocean and coast are water, mountain and snow are impassable/unlivable, volcanic is a lava field.
  const blocked: TerrainType[] = ['ocean', 'coast', 'mountain', 'snow', 'volcanic'];
  return !blocked.includes(tile.terrain);
}

export function hasWorkableSurroundings(
  coord: HexCoord,
  mapTiles: GameMap['tiles'],
  minWorkable = 2,
): boolean {
  const neighbors = hexNeighbors(coord);    // existing helper in hex-utils.ts
  const unworkable: TerrainType[] = ['ocean', 'mountain', 'volcanic', 'desert', 'snow'];
  const workableCount = neighbors.filter(n => {
    const t = mapTiles[hexKey(n)];
    return t && !unworkable.includes(t.terrain);
  }).length;
  return workableCount >= minWorkable;
}

export function findNearestValidStart(
  coord: HexCoord,
  mapTiles: GameMap['tiles'],
): HexCoord {
  // BFS outward from coord; returns first tile passing both validity checks
  const visited = new Set<string>();
  const queue: HexCoord[] = [coord];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = hexKey(current);
    if (visited.has(key)) continue;
    visited.add(key);
    const tile = mapTiles[key];
    if (isValidStartTile(tile) && hasWorkableSurroundings(current, mapTiles)) {
      return current;
    }
    for (const n of hexNeighbors(current)) {
      if (!visited.has(hexKey(n))) queue.push(n);
    }
  }
  return coord; // fallback: return original if nothing found (should never happen)
}
```

**Step 2 — Audit test (build-time regression)**

New file: `tests/systems/earth-map-starting-positions.test.ts`

For every civ on every map size (`small`, `medium`, `large`), assert:
1. `isValidStartTile(mapTiles[hexKey(startCoord)])` is `true`.
2. `hasWorkableSurroundings(startCoord, mapTiles)` is `true`.
3. No two civs share the same `{q, r}` on the same map size.

If this test passes, `findNearestValidStart` returns the original coord unchanged — the static data is already correct.

**Step 3 — Correct `earth-map-data.ts`**

Run the audit test to identify all failing positions. Fix each one to the geographically accurate land tile:
- England (small): correct to a tile in the British Isles region (not shared with France/Germany).
- England (medium/large): verify and correct if needed.
- All other civs: correct any that fail the validity checks.

**Step 4 — Runtime guard in `map-generator.ts` (`findStartPositions` Pass 1)**

`geo-map-loader.ts` only builds `GameMap` tiles — civ placement flows through `findStartPositions` in `map-generator.ts`. In Pass 1, precomputed geo positions are already discarded if the tile doesn't exist (`!map.tiles[hexKey(precomputed)]`), but they are NOT discarded if the tile exists but is water. Extend that guard to also reject invalid start tiles:

```ts
// In findStartPositions Pass 1, replace the existing tile-existence check with:
const precomputed = table[civTypeIds[i]];
const precomputedTile = precomputed ? map.tiles[hexKey(precomputed)] : undefined;
if (!precomputed || !precomputedTile || !isValidStartTile(precomputedTile)) continue;
// (falls through to Pass 2 greedy, which already requires isLandTerrain)
```

A `console.warn` logs the adjustment so bad data is visible in development. Invalid precomputed positions fall silently through to the existing greedy Pass 2, which already enforces land terrain and workable neighbourhood count ≥ 10 — so the fallback is already good. No separate BFS call is needed here; `findNearestValidStart` is for the audit test only.

> **Note:** The spec's `isValidStartTile` must be importable from `map-validation.ts` and used by both `findStartPositions` and the audit test.

### Tests

- `tests/systems/earth-map-starting-positions.test.ts` — full audit (see above); all assertions must pass after the data corrections.
- `tests/systems/map-validation.test.ts` — unit tests for `isValidStartTile`, `hasWorkableSurroundings`, and `findNearestValidStart` (BFS finds nearest valid tile when origin is invalid).

---

## #253 — Dock / Harbor on Non-Coastal Cities

### Root cause

`dock` already has `coastalRequired: true` and `getAvailableBuildings` filters it correctly. `harbor` lacks the flag — an inland city can build a Harbor despite it being a sea-trade building. Additionally, there is no guard in `processCity` (turn-manager) to prevent a queued coastal building from completing if data was corrupted or the rule was bypassed.

### Fix

**File:** `src/systems/city-system.ts`

Add `coastalRequired: true` to the `harbor` building definition:

```ts
harbor: {
  id: 'harbor', name: 'Harbor', category: 'economy',
  yields: { food: 1, production: 0, gold: 3, science: 0 },
  productionCost: 80,
  description: 'Enables sea trade',
  techRequired: 'harbor-tech',
  coastalRequired: true,   // ← added
  adjacencyBonuses: [],
},
```

**File:** `src/systems/city-system.ts` — guard inside `processCity`, placed **after the tech-filter block and before the `newProgress += productionYield` line**. Placing it before production accumulation means the city doesn't waste a turn's production on a building it is about to lose. `processCity` already receives the `map` argument, so `isCityCoastal` can be called directly:

```ts
// After tech-filter, BEFORE newProgress += productionYield:
let droppedBuilding: string | null = null;
if (newQueue.length > 0) {
  const headItem = newQueue[0];
  const headBuilding = BUILDINGS[headItem];
  if (headBuilding?.coastalRequired && !isCityCoastal(city, map.tiles)) {
    newQueue.shift();
    newProgress = 0;
    droppedBuilding = headItem;
  }
}
```

Add `droppedBuilding: string | null` to `CityProcessResult` (always populated; `null` when nothing was dropped) so `turn-manager.ts` can emit a player notification: `"<City>: <Building> removed — city is no longer coastal."` This surfaces the change to the player rather than silently eating their production progress.

### Tests (`tests/systems/city-system.test.ts`)

- `getAvailableBuildings` does not include `harbor` for a non-coastal city.
- `getAvailableBuildings` does not include `dock` for a non-coastal city.
- `getAvailableBuildings` includes both `harbor` and `dock` for a coastal city.
- `processCity` dequeues a `harbor` when the city is not coastal: building is not added, `result.droppedBuilding === 'harbor'`, and no production is wasted (progress stays 0).
- `processCity` completes a `harbor` normally when the city is coastal: `result.completedBuilding === 'harbor'`, `result.droppedBuilding === null`.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/audio/audio-system.ts` | Snapshot init for era-1; gesture resume listener |
| `src/renderer/camera.ts` | `setMinZoomForMap()` method |
| `src/main.ts` | Call `setMinZoomForMap` after game state loads |
| `src/systems/map-validation.ts` | New — `isValidStartTile`, `hasWorkableSurroundings`, `findNearestValidStart` |
| `src/systems/earth-map-data.ts` | Corrected starting coordinates for all civs/map sizes |
| `src/systems/map-generator.ts` | Extend Pass 1 `isValidStartTile` guard in `findStartPositions` |
| `src/systems/city-system.ts` | `coastalRequired: true` on `harbor`; coastal guard + `droppedBuilding` in `processCity` |
| `src/core/turn-manager.ts` | Emit notification when `result.droppedBuilding` is set |
| `tests/audio/audio-system.test.ts` | 3 new tests for #246 |
| `tests/renderer/camera.test.ts` | 3 new tests for #247 |
| `tests/systems/earth-map-starting-positions.test.ts` | New — full audit regression |
| `tests/systems/map-validation.test.ts` | New — unit tests for validation helpers |
| `tests/systems/city-system.test.ts` | 5 new tests for #253 |
