# #81 — Map wrapping duplicates cities

**See [README.md](README.md) for shared diagnosis context.**

**Direct cause:** `src/renderer/wrap-rendering.ts` returns one wrap copy per visible-world span. When zoomed out far enough that visible world width > one map width in pixels, ≥ 2 copies are rendered. Cities/units appear duplicated.

**Hex math (verified from `src/systems/hex-utils.ts:73-77`, pointy-top hexes):**

```
hexToPixel({q, r=0}, size).x = size * sqrt(3) * q
```

So for an N-wide map at hex size `H`, one full wrap of horizontal pixels = `N * H * sqrt(3)`. Visible world width at zoom Z = `camera.width / Z`. To prevent showing > one full wrap, require `Z >= camera.width / (N * H * sqrt(3))`.

**Fix:** Add `setMapBounds(widthHexes, heightHexes)` to `Camera` that updates `minZoom` to the floor above. Apply only on wrapping maps. `Camera.setZoom` already clamps to `[minZoom, maxZoom]` (line 38), so updating `minZoom` is sufficient.

---

## Task 1: Camera zoom-clamp regression (RED)

**Files:**
- Create: `tests/renderer/camera-zoom-clamp.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { Camera } from '@/renderer/camera';
import { getHorizontalWrapRenderCoords } from '@/renderer/wrap-rendering';

describe('camera zoom clamp on wrapping maps', () => {
  it('setMapBounds raises minZoom so visible world cannot exceed one map width', () => {
    const cam = new Camera();
    cam.setViewport(1000, 600);
    cam.hexSize = 32;
    const mapWidth = 40;
    cam.setMapBounds(mapWidth, 30);

    // Try to zoom out way past the floor; centerX/Y arguments are required by setZoom signature
    cam.setZoom(0.0001, 500, 300);

    const mapPixelWidth = mapWidth * cam.hexSize * Math.sqrt(3);
    // visible world width = camera.width / camera.zoom
    expect(cam.width / cam.zoom).toBeLessThanOrEqual(mapPixelWidth + 1e-6);
  });

  it('returns at most 2 copies for any in-range zoom on a wrapping map', () => {
    const cam = new Camera();
    cam.setViewport(1000, 600);
    cam.hexSize = 32;
    const mapWidth = 40;
    cam.setMapBounds(mapWidth, 30);

    // At the minimum allowed zoom
    cam.setZoom(cam.minZoom, 500, 300);
    const coordsAtMin = getHorizontalWrapRenderCoords({ q: 0, r: 0 }, mapWidth, cam);
    expect(coordsAtMin.length).toBeLessThanOrEqual(2);

    // At a generous mid-zoom
    cam.setZoom(1, 500, 300);
    const coordsMid = getHorizontalWrapRenderCoords({ q: 0, r: 0 }, mapWidth, cam);
    expect(coordsMid.length).toBeLessThanOrEqual(2);
  });

  it('does not change minZoom on non-wrapping maps if setMapBounds is not called', () => {
    const cam = new Camera();
    cam.setViewport(1000, 600);
    // Default minZoom from camera.ts
    expect(cam.minZoom).toBe(0.3);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
yarn test tests/renderer/camera-zoom-clamp.test.ts
```

Expected: FAIL — `setMapBounds` is not a function.

---

## Task 2: Implement `setMapBounds` (GREEN)

**Files:**
- Modify: `src/renderer/camera.ts`

- [ ] **Step 1: Add bounds and recompute minZoom**

Add to the `Camera` class (after the existing field declarations, alongside `setViewport`):

```ts
mapPixelWidth: number | null = null;

setMapBounds(widthHexes: number, _heightHexes: number): void {
  // Pointy-top hex pixel width per column = hexSize * sqrt(3) (see hexToPixel)
  this.mapPixelWidth = widthHexes * this.hexSize * Math.sqrt(3);
  this.recomputeMinZoom();
}

setViewport(width: number, height: number): void {
  this.width = width;
  this.height = height;
  this.recomputeMinZoom();
}

private recomputeMinZoom(): void {
  if (this.mapPixelWidth && this.mapPixelWidth > 0 && this.width > 0) {
    // Clamp so visible world width (camera.width / zoom) <= mapPixelWidth
    const floor = this.width / this.mapPixelWidth;
    this.minZoom = Math.max(0.3, floor);
    if (this.zoom < this.minZoom) {
      this.zoom = this.minZoom;
      this.targetZoom = this.minZoom;
    }
  }
}
```

(The existing `setViewport` body already sets width/height; replace it as above so `recomputeMinZoom` runs whenever the viewport changes — important for window resize.)

`Camera.setZoom` (line 38) already does `Math.max(this.minZoom, ...)`, so the new floor takes effect automatically.

- [ ] **Step 2: Wire bounds at game start**

Find where the camera is constructed and the game state is first attached. Search:

```bash
grep -n "new Camera\|camera\.setViewport\|setMapBounds" src/renderer/render-loop.ts src/main.ts
```

Wherever the camera receives its viewport on game start (likely `render-loop.ts` or `main.ts`), immediately after, add:

```ts
if (state.map.wrapsHorizontally) {
  camera.setMapBounds(state.map.width, state.map.height);
}
```

(Use the actual variable names from the file — `camera`, `gameState`, `state`, etc. Confirm the field is `state.map.width` by checking `src/core/types.ts` for `WorldMap` / `state.map` shape.)

- [ ] **Step 3: Run regression + full suite + build**

```bash
yarn test tests/renderer/camera-zoom-clamp.test.ts
yarn test
yarn build
```

All must pass.

- [ ] **Step 4: Manual smoke test**

```bash
yarn dev
```

1. Start a wrapping-map game (any default game generates one — confirm by checking `state.map.wrapsHorizontally` in console if unsure).
2. Pinch / scroll-wheel to zoom out as far as possible.
3. **Verify cities, units, and resource icons render exactly once — no visible duplicates.**
4. Pan horizontally across the seam — ghost tiles at the edge should still render smoothly (this is the legitimate purpose of wrap rendering and must not regress).

If duplicates persist at minimum zoom, the floor is too low — recheck the math (`mapPixelWidth = widthHexes * hexSize * sqrt(3)`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/camera.ts src/renderer/render-loop.ts src/main.ts tests/renderer/camera-zoom-clamp.test.ts
git commit -m "$(cat <<'EOF'
fix(renderer): clamp min zoom to one map width to stop wrap duplication (#81)

Wrap rendering returns one copy per visible-world span. Zooming out
past one map width caused cities and units to draw at every wrap
copy. Cap minimum zoom by mapPixelWidth so the viewport can never
show more than one full wrap of the world.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-check
- Does the regression assert `cam.width / cam.zoom <= mapPixelWidth` (the actual invariant)?
- Did you keep the `0.3` lower bound so non-wrapping maps still behave the same?
- Does `setViewport` call `recomputeMinZoom` so window resizes don't break the clamp?
