# Sprite Overlay Renderer — Design Spec

**Date:** 2026-06-06  
**Status:** Approved  
**Scope:** DOM overlay layer for v2 animated sprites (units, buildings, improvements)  
**Delivery:** 4 independent MRs  

---

## Background

The v2 sprite system (`src/renderer/sprites/v2/`) contains pre-serialized SVG strings for **18 of 26 units** and **23 of 33 buildings**, with CSS animation class hooks (`cq-leg-l/r`, `cq-arm-l/r`, `cq-weapon`, `cq-fire`, etc.) driven by `src/assets/sprite-animations-v2.css`. The remaining 8 units (axeman, spearman, horseman, cavalry, knight, crossbowman, catapult, ballista, caravan, expedition, transport) and 10 buildings were never serialized and must be generated via `scripts/serialize-sprites.mjs` before they can be wired into the overlay. The 4 legendary wonder sprites (Pyramids, Colosseum, Great Library, Lighthouse) have no v2 equivalents and remain on the canvas path indefinitely.

These animations require **live DOM SVG elements** — browsers block CSS animations inside SVGs loaded as `<img src="...">`, which is how the current Canvas 2D renderer loads sprites.

The current renderer rasterizes sprites by decoding SVG strings to `HTMLImageElement` and calling `ctx.drawImage()`. This is correct for static images but kills all CSS animation.

This spec defines a DOM overlay layer that sits above the canvas, provides live SVG elements with working CSS animations, and is designed to be delivered incrementally without breaking the existing rendering path.

---

## Goals

- Animated unit sprites (walking gait, weapon swing, phase desync)
- Animated building sprites (forge fire, smoke plumes, bank glow)
- Proper SVG improvement markers replacing 8 emoji fallbacks
- Mobile-first: works on iOS Safari and Android Chrome
- Incremental delivery: 4 MRs, each safe to ship independently
- Extensible: new units/buildings are a one-line addition; future effects (sparks, weather) slot in as sibling layers

---

## Non-Goals

- WebGL rendering (not needed; CSS transform + compositor thread is sufficient)
- Runtime faction palette swapping (faction colors are baked into v2 SVGs at serialization time; fixed per game session — see Known Limitations)
- OffscreenCanvas (not supported on iOS Safari)
- SMIL animations (deprecated in Chrome)

---

## Architecture

### Layer stack (index.html)

```html
<div id="app">                          <!-- position: relative -->
  <canvas id="game-canvas">            <!-- existing, unchanged -->
  <div id="sprite-overlay">            <!-- NEW — see CSS below -->
  <div id="ui-layer">                  <!-- existing, unchanged -->
</div>
```

`#sprite-overlay` sits between the canvas and the UI layer. It has `pointer-events: none` so all touch and mouse input continues to reach the canvas unmodified.

### sprite-overlay CSS

```css
#sprite-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  overflow: visible;
  pointer-events: none;
  transform-origin: top left;
  contain: layout style paint;   /* isolates subtree — pool mutations don't trigger page reflow */
  will-change: transform;        /* one GPU layer for the whole overlay — NEVER on individual sprites */
}
```

**`will-change` discipline:** `will-change: transform` goes on `#sprite-overlay` only, promoting the entire overlay to a single GPU texture. It must never be applied to individual sprite wrapper elements — excessive layer promotion exhausts VRAM on mobile devices (confirmed by Chrome hardware acceleration docs and MDN).

### Camera synchronization

Each frame, a single style write syncs the overlay to the camera:

```
container.style.transform = `scale(${zoom}) translate(${-camX}px, ${-camY}px)`
```

Sprites are positioned at **world pixel coordinates** (`left: hexToPixel(coord).x`, `top: hexToPixel(coord).y`). The container transform is applied by the browser compositor — this is mathematically identical to `camera.worldToScreen()`:

```
Canvas:  screenX = (worldX - camX) * zoom
DOM:     (worldX - camX) * zoom  ← same equation, proved by transform order
```

Because both paths share the same `Camera` instance, drift between canvas and DOM positions is impossible by construction.

### Wrap ghost management

The overlay calls `getHorizontalWrapRenderCoords(coord, map.width, camera)` — the same shared function used by every canvas renderer. For each coord in the returned array, the overlay creates one sprite element. The overlay has **no wrap logic of its own**: it is a consumer of the shared function, exactly like `unit-renderer.ts`, `city-renderer.ts`, and `fog-renderer.ts`.

This means:
- Ghost count is always identical between canvas and overlay (same function call)
- Off-viewport ghosts are pruned by the existing viewport-awareness in `getHorizontalWrapRenderCoords`
- Input handling is unaffected (`pointer-events: none`)

---

## Data Model

### SpriteEntity

Built by `RenderLoop` from `GameState`. `SpriteOverlay` never reads `GameState` directly.

```typescript
interface SpriteEntity {
  id:      string;                          // unit.id | `${cityId}:${buildingType}` | `${q},${r}:${improvement}`
  kind:    'unit' | 'building' | 'improvement';
  subtype: string;                          // UnitType | building key | improvement type
  coord:   HexCoord;
  state:   'idle' | 'walk' | 'attack';     // drives data-state on inner SVG
  faction: string;                          // 'imperials' | 'vikings' | … | 'neutral' (improvements)
}
```

### Pool entry

```typescript
interface PoolEntry {
  el:    HTMLDivElement;   // the 128×128 wrapper div
  svgEl: Element;          // reference to the inner element with data-state — for O(1) setAttribute
  phase: number;           // 0–1, set once at creation, never recalculated
}
```

---

## SpriteOverlay Class

### Public API

```typescript
class SpriteOverlay {
  // Mounts #sprite-overlay into mountPoint, inserts layer divs
  constructor(mountPoint: HTMLElement)

  // Called every rAF from RenderLoop.render()
  sync(
    camera:   Camera,
    entities: SpriteEntity[],
    map:      { width: number; wrapsHorizontally: boolean },
    opts:     { isPinching: boolean; reducedMotion: boolean }
  ): void

  // Canvas renderers call this to skip drawImage for overlay-managed entities
  getActiveIds(): ReadonlySet<string>

  // Evicts and recreates all elements for a faction (baked-color limitation)
  invalidateFaction(faction: string): void
}
```

### sync() — frame-by-frame steps

1. **LOD gate** — if `camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD`, set `container.style.display = 'none'` and return. Canvas glyph fallbacks take over.

2. **Camera transform** — always runs, even during pinch:
   ```
   container.style.transform = `scale(${zoom}) translate(${-camX}px, ${-camY}px)`
   ```

3. **Pinch guard** — if `opts.isPinching`, return here. DOM adds/removes are deferred until the gesture ends. This prevents paint from competing with the compositor's zoom animation (confirmed mobile perf pattern).

4. **Entity → DOM** — for each entity:
   - Call `getHorizontalWrapRenderCoords()` to get render coords (including ghosts)
   - For each coord, key = `${entity.id}:ghostIndex`
   - Pool hit: call `svgEl.setAttribute('data-state', entity.state)` — no node replacement
   - Pool miss: create element, parse SVG once via `innerHTML`, store `{ el, svgEl, phase }` in pool

5. **Cull stale** — remove from DOM and pool any entry not seen this frame. Update `activeIds`.

### Element creation

```typescript
// Wrapper div — world-space positioned, centered on hex
wrapper.style.cssText = 'position:absolute;width:128px;height:128px;transform:translate(-50%,-50%)';
wrapper.style.setProperty('--phase', String(phase));  // set once, never updated
wrapper.innerHTML = svgHtml;                           // parse once at creation only
```

**Phase desync:** `phase = Math.abs(hashCode(entity.id) % 100) / 100` — deterministic from entity ID, produces different values for every unit even of the same type, set once at element creation.

**State transitions:** Unit animation state (idle/walk/attack) is updated via `svgEl.setAttribute('data-state', state)` only. The DOM node is never replaced — replacement would reset the CSS animation timer, causing the walking cycle to restart from frame 0.

### Layer structure inside #sprite-overlay

```html
<div id="sprite-overlay">          <!-- gets camera transform -->
  <div id="unit-sprites">          <!-- MR 2: unit pool -->
  <div id="building-sprites">      <!-- MR 3: building pool -->
  <div id="improvement-sprites">   <!-- MR 4: improvement pool -->
  <div id="effects">               <!-- Future MR 5: transient effects -->
</div>
```

Each layer div is a separate pool. Sibling divs inherit the camera transform for free. Future effects use the same world-space coordinate system — fire-and-forget elements that self-remove on `animationend`.

---

## Sprite Lookup

### New file: src/renderer/sprites/v2/index.ts

Imports all v2 `.svg.ts` files (41 today, growing to full catalog coverage across MR 2 + MR 3) and exposes typed lookup functions:

```typescript
export function getUnitSpriteV2(unitType: string, faction: string): string | null
export function getBuildingSpriteV2(buildingType: string, faction: string): string | null
export function getImprovementSpriteV2(improvementType: string): string | null
```

All functions return `null` (not throw) for unknown type/faction. Callers fall back to the existing canvas path.

---

## Canvas Renderer Integration

### Coordination contract

`SpriteOverlay.getActiveIds()` returns the set of entity IDs currently rendered by the overlay. Canvas renderers check this set before drawing:

```typescript
// unit-renderer.ts
if (spriteOverlay.getActiveIds().has(unit.id)) return; // overlay handles it
ctx.drawImage(sprite, ...);  // existing path
```

This keeps canvas renderers independent from SpriteOverlay internals — they only need the ID set.

### Fallback chain

For every entity type, the fallback chain is:

```
overlay SVG element → canvas drawImage (v1 sprite) → canvas glyph (emoji/circle)
```

No entity ever disappears. If the overlay can't serve a sprite (barbarian unit, unknown building, sprite not yet in v2 catalog), the canvas path activates automatically.

### Barbarian and minor civ units

Barbarian and minor civ unit sprites are not preloaded in the v2 system by design (see `sprites.md` rules). They always fall through to the canvas path. The overlay never has their IDs in `activeIds`.

---

## MR Delivery Plan

### MR 1 — Infrastructure (no player-visible change)

**New files:**
- `src/renderer/sprite-overlay.ts` — full SpriteOverlay class, empty entity list
- `src/renderer/sprites/v2/index.ts` — unified lookup (imports all 41 v2 files)

**Modified files:**
- `index.html` — add `#sprite-overlay` div with CSS
- `src/renderer/render-loop.ts` — instantiate SpriteOverlay; call `sync()` with empty entity list
- `src/input/touch-handler.ts` — expose `isPinching: boolean` flag

**Tests:** `tests/renderer/sprite-overlay.test.ts` — camera math, ghost count, pinch guard, pool lifecycle, LOD gate, state transition via setAttribute.

**Safe to merge because:** Overlay is invisible (empty entity list). All existing canvas rendering untouched.

---

### MR 2 — Unit sprites (18 of 26 animated; remainder serialized in this MR)

v2 files exist today for 18 units. The remaining 8 (axeman, spearman, horseman, cavalry, knight, crossbowman, catapult, ballista) and 3 transport units (caravan, expedition, transport) must be serialized first by running `node scripts/serialize-sprites.mjs` with the missing types added to the design JSX. This serialization is part of MR 2.

**Modified files:**
- `src/renderer/render-loop.ts` — build `SpriteEntity[]` from visible units; pass to `sync()`
- `src/renderer/unit-renderer.ts` — skip `ctx.drawImage` if `activeIds.has(unit.id)`
- `src/renderer/sprites/v2/index.ts` — wire `getUnitSpriteV2()`
- `src/renderer/sprites/v2/*.svg.ts` — add serialized files for all remaining unit types

**Tests:** `tests/renderer/unit-renderer-overlay.test.ts` — canvas skips drawImage for overlay-managed units; barbarians always canvas; wrap ghost count correct.

**Safe to merge because:** Canvas falls back to drawImage → glyph for barbarians and any type the overlay can't serve. Wonder sprites (Pyramids, Colosseum, Great Library, Lighthouse) always stay on canvas — they have no v2 files and are not expected to.

---

### MR 3 — Building sprites (23 of 33 animated; remainder serialized in this MR)

v2 files exist today for 23 buildings. The remaining 10 must be serialized as part of this MR using `scripts/serialize-sprites.mjs`. The 4 legendary wonder sprites (Pyramids, Colosseum, Great Library, Lighthouse) have no v2 equivalents and remain on the canvas path — they are explicitly out of scope.

**Modified files:**
- `src/renderer/render-loop.ts` — add building entity list from visible cities
- `src/renderer/city-renderer.ts` — skip building `drawImage` if in `activeIds`
- `src/renderer/sprites/v2/index.ts` — wire `getBuildingSpriteV2()`
- `src/renderer/sprites/v2/*.svg.ts` — add serialized files for all remaining building types

**Tests:** Building in overlay at city hex; canvas does not double-draw; wrap ghost correct; buildings not in v2 catalog (including wonders) fall back to canvas.

**Safe to merge because:** Same fallback chain as MR 2. Wonder sprites explicitly excluded and always canvas.

---

### MR 4 — Improvement markers (8 new SVG + resource_outpost migration)

**New files:** `src/renderer/improvements/{farm,mine,lumber_camp,watermill,plantation,pasture,camp,quarry}-marker.ts` — SVG strings following the `resource-outpost-marker.ts` pattern (`viewBox="0 0 48 48"`, no faction color, no animation, earthy palette).

Use the `generate-sprite-prompt` skill to produce Claude Design prompts for each marker.

**Modified files:**
- `src/renderer/render-loop.ts` — add improvement entity list
- `src/renderer/hex-renderer.ts` — skip emoji icon if improvement in `activeIds`
- `src/renderer/sprites/v2/index.ts` — wire `getImprovementSpriteV2()`

**Tests:** Marker in overlay at correct hex; canvas does not draw emoji; resource_outpost migrated; unknown type falls back to emoji.

---

### Future MR 5+ — Effects layer

A sibling `<div id="effects">` inside `#sprite-overlay` inherits the camera transform. Transient effects (battle sparks, capture flash, wonder discovery glow) are created programmatically, play their CSS keyframe animation, and self-remove on `animationend`. No pool needed — fire-and-forget. One new file: `src/renderer/effects-overlay.ts`. Zero changes to `SpriteOverlay`.

---

## Testing Strategy

### New test files

| File | Covers |
|---|---|
| `tests/renderer/sprite-overlay.test.ts` | Camera math, ghost count, pinch guard, pool lifecycle, LOD gate, state transition via setAttribute, invalidateFaction |
| `tests/renderer/sprites/v2/index.test.ts` | Lookup returns non-null for all catalog types × known factions; unknown returns null |
| `tests/renderer/unit-renderer-overlay.test.ts` | Canvas skips drawImage for active IDs; barbarians always canvas |

### Existing tests that cover the hard parts

| Existing test | Relevance |
|---|---|
| `tests/renderer/wrap-rendering.test.ts` | `getHorizontalWrapRenderCoords()` viewport-awareness — overlay delegates to this |
| `tests/renderer/sprites/sprite-catalog.test.ts` | All UnitTypes + buildings have catalog entries — guarantees v2 lookup succeeds |
| `tests/renderer/render-loop-wrap.test.ts` | Full render loop wrap integration |

### What is not unit-tested

- **CSS animation visual output** — keyframe correctness validated by running the game and the v2 artboard (`design/conquestoria-sprites/`)
- **Compositor thread behavior** — GPU layer promotion and 60fps validated by manual testing on iPhone + macOS desktop
- **Phase desync appearance** — hash function is tested; timing perception is not

---

## Known Limitations

### Baked faction colors

v2 SVG strings have faction hex colors serialized at build time (e.g. Imperials `#b53026`, Vikings `#1d4a8c`). If a civ's color changes mid-session, call `spriteOverlay.invalidateFaction(faction)` to evict and recreate that faction's elements. This is acceptable because faction colors are assigned at game-start and do not change during a session.

Future work: if runtime palette swapping is needed, the v2 serialization script (`scripts/serialize-sprites.mjs`) can be extended to emit CSS custom property placeholders instead of baked hex values.

---

## Research References

- [DOM Sprites: a Viable Alternative to Canvas — Build New Games](http://buildnewgames.com/dom-sprites/): world-space container pattern, browser compositor handling
- [Planning for Performance — O'Reilly Using SVG](https://oreillymedia.github.io/Using_SVG/extras/ch19-performance.html): GPU layer limits, inline SVG requirement for CSS animations
- [Hardware-Accelerated Animations — Chrome for Developers](https://developer.chrome.com/blog/hardware-accelerated-animations): transform + opacity as the only compositor-thread properties
- [Optimizing canvas — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas): layered rendering pattern
- [Game UI Animation Optimization — Zigpoll](https://www.zigpoll.com/content/how-can-the-frontend-developer-optimize-the-ui-animations-to-maintain-smooth-performance-without-compromising-visual-quality-on-both-desktop-and-mobile-game-interfaces): will-change discipline, mobile VRAM limits
