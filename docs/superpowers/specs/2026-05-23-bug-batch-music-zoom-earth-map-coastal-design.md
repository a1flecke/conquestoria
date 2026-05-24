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
  const blocked = ['ocean', 'coast', 'mountain', 'volcano'];
  return !blocked.includes(tile.terrain);
}

export function hasWorkableSurroundings(
  coord: HexCoord,
  mapTiles: GameMap['tiles'],
  minWorkable = 2,
): boolean {
  const neighbors = hexNeighbors(coord);    // existing helper in hex-utils.ts
  const unworkable = ['ocean', 'mountain', 'volcano', 'desert'];
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

**Step 4 — Runtime guard in geo-map-loader or map generator**

At civ placement time (when units and cities are spawned at game start), wrap each starting coord:

```ts
const safeStart = findNearestValidStart(rawStart, state.map.tiles);
if (safeStart.q !== rawStart.q || safeStart.r !== rawStart.r) {
  console.warn(`[map] Starting position for ${civId} adjusted from`, rawStart, 'to', safeStart);
}
// use safeStart for unit placement
```

This is a silent fallback — the player never sees it. It prevents a future data mistake from stranding a civ on water.

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

**File:** `src/systems/city-system.ts` — guard inside `processCity`, after the tech-filter block and before calling `completeCityProductionItem`. `processCity` already receives the `map` argument, so `isCityCoastal` can be called directly:

```ts
// Drop queued coastal building if city is no longer coastal
if (newQueue.length > 0) {
  const headItem = newQueue[0];
  const headBuilding = BUILDINGS[headItem];
  if (headBuilding?.coastalRequired && !isCityCoastal(city, map.tiles)) {
    newQueue.shift();
    newProgress = 0;
    // Caller (turn-manager) emits a notification via result.droppedBuilding
  }
}
```

Add `droppedBuilding: string | null` to `CityProcessResult` so `turn-manager.ts` can emit a player notification: `"<City>: <Building> removed — city is no longer coastal."` This surfaces the change to the player rather than silently eating their production progress.

### Tests (`tests/systems/city-system.test.ts`)

- `getAvailableBuildings` does not include `harbor` for a non-coastal city.
- `getAvailableBuildings` does not include `dock` for a non-coastal city.
- `getAvailableBuildings` includes both `harbor` and `dock` for a coastal city.
- `processCity` dequeues a `harbor` (coastalRequired) when the city is not coastal, and does not produce the building.
- `processCity` completes a `harbor` normally when the city is coastal.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/audio/audio-system.ts` | Snapshot init for era-1; gesture resume listener |
| `src/renderer/camera.ts` | `setMinZoomForMap()` method |
| `src/main.ts` | Call `setMinZoomForMap` after game state loads |
| `src/systems/map-validation.ts` | New — `isValidStartTile`, `hasWorkableSurroundings`, `findNearestValidStart` |
| `src/systems/earth-map-data.ts` | Corrected starting coordinates for all civs/map sizes |
| `src/systems/geo-map-loader.ts` | Runtime `findNearestValidStart` guard at civ placement |
| `src/systems/city-system.ts` | `coastalRequired: true` on `harbor`; coastal guard + `droppedBuilding` in `processCity` |
| `src/core/turn-manager.ts` | Emit notification when `result.droppedBuilding` is set |
| `tests/audio/audio-system.test.ts` | 3 new tests for #246 |
| `tests/renderer/camera.test.ts` | 3 new tests for #247 |
| `tests/systems/earth-map-starting-positions.test.ts` | New — full audit regression |
| `tests/systems/map-validation.test.ts` | New — unit tests for validation helpers |
| `tests/systems/city-system.test.ts` | 5 new tests for #253 |
