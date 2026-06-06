# Sprite Overlay Renderer — Design Spec

**Date:** 2026-06-06  
**Status:** Approved (rev 2 — post code-review)  
**Scope:** DOM overlay layer for v2 animated sprites (units, buildings, improvements)  
**Delivery:** 4 independent MRs  

---

## Background

The v2 sprite system (`src/renderer/sprites/v2/`) contains pre-serialized SVG strings for **18 of 29 units** and **23 of 33 buildings**, with CSS animation class hooks (`cq-leg-l/r`, `cq-arm-l/r`, `cq-weapon`, `cq-fire`, etc.) driven by `src/assets/sprite-animations-v2.css`. The remaining 11 units (axeman, spearman, horseman, cavalry, knight, crossbowman, catapult, ballista, caravan, expedition, transport) and 10 buildings were never serialized and must be generated via `scripts/serialize-sprites.mjs` before they can be wired into the overlay. The 4 legendary wonder sprites (Pyramids, Colosseum, Great Library, Lighthouse) have no v2 equivalents and remain on the canvas path indefinitely.

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

**Fog-of-war note:** The overlay sits *above* the canvas fog layer. Sprites must never be added to the overlay for entities in fog or unexplored hexes — this is enforced by entity filtering in `RenderLoop` before `sync()` is called (see [Entity filtering](#entity-filtering)).

### sprite-overlay CSS

```css
#sprite-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  overflow: visible;           /* REQUIRED — sprites are positioned outside the 0×0 box */
  pointer-events: none;
  transform-origin: top left;
  contain: layout style;       /* isolates subtree layout/style — omit 'paint': paint containment
                                  clips to the 0×0 border box and makes all sprites invisible */
  will-change: transform;      /* one GPU layer for the whole overlay — NEVER on individual sprites */
}
```

**`will-change` discipline:** `will-change: transform` goes on `#sprite-overlay` only, promoting the entire overlay to a single GPU texture. It must never be applied to individual sprite wrapper elements — excessive layer promotion exhausts VRAM on mobile devices (confirmed by Chrome hardware acceleration docs and MDN).

**`contain: paint` is explicitly excluded.** The element's layout box is 0×0 with `overflow: visible` — `paint` containment would clip all rendering to that box, making every sprite invisible.

### Camera synchronization

Each frame, a single style write syncs the overlay to the camera:

```
container.style.transform = `scale(${zoom}) translate(${-camX}px, ${-camY}px)`
```

Sprites are positioned at **world pixel coordinates** (`left: hexToPixel(coord, camera.hexSize).x`, `top: hexToPixel(coord, camera.hexSize).y`). The `camera.hexSize` value must always be used — not a hardcoded constant. The container transform is applied by the browser compositor — this is mathematically identical to `camera.worldToScreen()`:

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
  state:   'idle' | 'walk' | 'attack';     // v2 animation vocabulary — see Motion Vocabulary below
  faction: string;                          // 'imperials' | 'vikings' | … | 'neutral' (improvements)
}
```

### Motion vocabulary — v1 vs v2

Two motion vocabularies coexist in the codebase and must not be conflated:

| System | Type | Values |
|---|---|---|
| v1 canvas | `UnitSpriteMotion` | `'idle' \| 'move-a' \| 'move-b'` |
| v2 CSS | `SpriteEntity.state` | `'idle' \| 'walk' \| 'attack'` |

`RenderLoop` is responsible for translating: when a unit's `UnitSpriteMotion` is `'move-a'` or `'move-b'`, the corresponding `SpriteEntity.state` is `'walk'`. The CSS animation keyframes key off `data-state="walk"` on the `cq-sprite-wrap` element.

### Pool entry

```typescript
interface PoolEntry {
  el:          HTMLDivElement;    // the positional wrapper div (world-space left/top)
  spriteWrapEl: HTMLElement;      // the inner .cq-sprite-wrap.cq-v2 element — animation root
  phase:       number;            // 0–1, set once at creation on spriteWrapEl, never recalculated
}
```

`spriteWrapEl` is the element that carries `class="cq-sprite-wrap cq-v2"`, `data-state`, and `--phase`. It is the root the CSS animation selectors key off (`.cq-v2[data-state="idle"]`). It is NOT the outer positional wrapper and NOT the `<svg>` element inside it.

### Phase hash

```typescript
// djb2 hash — deterministic, no external dependency
function hashCode(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;  // unsigned 32-bit
}

// Usage: phase ∈ [0, 1), unique per entity.id
const phase = (hashCode(entity.id) % 100) / 100;
```

Defined in `src/renderer/sprite-overlay.ts`. Not exposed publicly.

---

## SpriteOverlay Class

### Public API

```typescript
class SpriteOverlay {
  // Mounts container into mountPoint, inserts layer divs
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

**`reducedMotion` in opts:** When `true`, the overlay hides itself (`display: none`) and falls back to the canvas path entirely. CSS `prefers-reduced-motion` already pauses animation keyframes, but hiding the overlay ensures canvas glyphs (which don't animate) render instead of static frozen SVGs.

### sync() — frame-by-frame steps

1. **LOD gate** — if `camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD` or `opts.reducedMotion`, set `container.style.display = 'none'` and return. Canvas glyph fallbacks take over.

2. **Camera transform** — always runs, even during pinch:
   ```
   container.style.transform = `scale(${zoom}) translate(${-camX}px, ${-camY}px)`
   ```

3. **Pinch guard** — if `opts.isPinching`, return here. DOM adds/removes are deferred until the gesture ends. This prevents paint from competing with the compositor's zoom animation (confirmed mobile perf pattern).

4. **Entity → DOM** — for each entity:
   - Call `getHorizontalWrapRenderCoords()` to get render coords (including ghosts)
   - For each coord, key = `${entity.id}:${ghostIndex}`
   - Pool hit: `spriteWrapEl.setAttribute('data-state', entity.state)` — no node replacement
   - Pool miss: create element, parse SVG once via `innerHTML`, store `{ el, spriteWrapEl, phase }` in pool

5. **Cull stale** — remove from DOM and pool any entry not seen this frame. Update `activeIds`.

### Element creation

```typescript
// Positional wrapper — world-space coordinates, centered on hex
const wrapper = document.createElement('div');
wrapper.style.cssText = 'position:absolute;width:128px;height:128px;transform:translate(-50%,-50%)';
// NO will-change here — only the container gets it

wrapper.innerHTML = svgHtml;  // parse once at creation only
// svgHtml is our own generated content — safe; no user-generated strings

// spriteWrapEl is the .cq-sprite-wrap.cq-v2 div inserted by innerHTML
const spriteWrapEl = wrapper.firstElementChild as HTMLElement;

// Override the baked style="--phase:0" with the entity's deterministic phase
// setProperty on the same element wins over the baked inline style
spriteWrapEl.style.setProperty('--phase', String(phase));

pool.set(key, { el: wrapper, spriteWrapEl, phase });
layerDiv.appendChild(wrapper);
```

**Why `spriteWrapEl`, not `wrapper`:** The v2 SVG strings are serialized as:
```
<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="..." style="--phase:0">
  <svg ...>...</svg>
</div>
```
The CSS animation selectors are `.cq-v2[data-state="idle"] .cq-sprite-figure` etc. — they key off the `cq-sprite-wrap` div, not the outer positional wrapper or the `<svg>`. All state updates and phase overrides must target `spriteWrapEl` (the first child of `wrapper`).

**Phase desync:** Set once at element creation by calling `spriteWrapEl.style.setProperty('--phase', ...)` which overrides the baked `style="--phase:0"`. CSS custom properties on the same element: inline `setProperty` wins. Phase is deterministic from entity ID via `hashCode()` — never recalculated, survives pool reuse.

**State transitions:** `spriteWrapEl.setAttribute('data-state', state)` only. Never replace the DOM node — replacement resets the CSS animation timer, causing walking to restart from frame 0.

### Entity filtering (fog-of-war and movement animations) {#entity-filtering}

`RenderLoop` builds `SpriteEntity[]` before calling `sync()`. Two filters are mandatory:

**Fog gate:** Only include entities whose hex is `'visible'` in the viewer's visibility map. `'fog'` and `'unexplored'` hexes must be excluded. The overlay sits above the canvas fog layer — any sprite passed to `sync()` will be visible to the player regardless of fog state.

```typescript
// In RenderLoop.render(), before building unitEntities:
const visibleUnits = getVisibleUnitsForPlayer(state.units, state, viewerId)
  .filter(u => getVisibility(viewerVisibility, u.position) === 'visible');
```

**Movement animation gate:** Units currently in a canvas movement animation are hidden from the static `drawUnits` call via `hiddenUnitIds`. They must also be excluded from the `SpriteEntity[]` to avoid showing a static overlay sprite at the origin hex while the canvas animation plays the interpolated position.

```typescript
const movingIds = new Set(getMovingUnitIds(this.unitMovementAnimations));
const unitEntities = visibleUnits
  .filter(u => !movingIds.has(u.id))
  .map(u => toSpriteEntity(u, state, colorLookup));
```

### isPinching — TouchHandler API

`TouchHandler` must expose a public getter:

```typescript
class TouchHandler {
  private _isPinching = false;

  get isPinching(): boolean { return this._isPinching; }
  // ... existing implementation sets _isPinching in touch event handlers
}
```

`RenderLoop` reads `this.touchHandler.isPinching` at the start of each `render()` call and passes it through to `sync()`.

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
- `src/renderer/render-loop.ts` — instantiate SpriteOverlay; call `sync()` with empty entity list; read `touchHandler.isPinching` each frame
- `src/input/touch-handler.ts` — add `get isPinching(): boolean` public getter

**Tests:** `tests/renderer/sprite-overlay.test.ts` — camera math, ghost count, pinch guard (no DOM mutations while pinching), pool lifecycle, LOD gate, state transition via setAttribute only (no node replacement), `reducedMotion` hides overlay.

**Safe to merge because:** Overlay is invisible (empty entity list). All existing canvas rendering untouched.

---

### MR 2 — Unit sprites (29 total; 18 existing + 11 serialized in this MR)

v2 files exist today for 18 units. The remaining 11 (axeman, spearman, horseman, cavalry, knight, crossbowman, catapult, ballista, caravan, expedition, transport) must be serialized first by running `node scripts/serialize-sprites.mjs` with the missing types added to the design JSX in `design/conquestoria-sprites/lib/units-v2.jsx`. This serialization step is part of MR 2.

**Modified files:**
- `src/renderer/render-loop.ts` — build `SpriteEntity[]` from visible, non-moving units only; apply fog gate and movement animation gate; pass to `sync()`
- `src/renderer/unit-renderer.ts` — skip `ctx.drawImage` if `activeIds.has(unit.id)`
- `src/renderer/sprites/v2/index.ts` — wire `getUnitSpriteV2()`
- `src/renderer/sprites/v2/*.svg.ts` — add serialized files for all 11 remaining unit types

**Tests:** `tests/renderer/unit-renderer-overlay.test.ts`:
- Canvas skips drawImage for overlay-managed units
- Barbarians always canvas (never in activeIds)
- Wrap ghost count correct at seam
- Unit in fog hex excluded from entity list
- Moving unit excluded from entity list (no double-render at origin hex)
- data-state='walk' set during movement animation (while unit is NOT in movingIds — i.e. after animation completes)

**Safe to merge because:** Canvas falls back to drawImage → glyph for barbarians and any type the overlay can't serve. Wonder sprites always stay on canvas.

---

### MR 3 — Building sprites (33 total; 23 existing + 10 serialized in this MR)

v2 files exist today for 23 buildings. The remaining 10 must be serialized as part of this MR using `scripts/serialize-sprites.mjs`. The 4 legendary wonder sprites (Pyramids, Colosseum, Great Library, Lighthouse) have no v2 equivalents and remain on the canvas path — they are explicitly out of scope.

**Modified files:**
- `src/renderer/render-loop.ts` — add building entity list from visible cities; apply fog gate
- `src/renderer/city-renderer.ts` — skip building `drawImage` if in `activeIds`
- `src/renderer/sprites/v2/index.ts` — wire `getBuildingSpriteV2()`
- `src/renderer/sprites/v2/*.svg.ts` — add serialized files for all 10 remaining building types

**Tests:** Building in overlay at city hex; canvas does not double-draw; wrap ghost correct; buildings not in v2 catalog (including wonders) fall back to canvas; building in fog city excluded.

**Safe to merge because:** Same fallback chain as MR 2. Wonder sprites explicitly excluded.

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
| `tests/renderer/sprite-overlay.test.ts` | Camera math, ghost count, pinch guard, pool lifecycle, LOD gate, reducedMotion, state transition via setAttribute, invalidateFaction |
| `tests/renderer/sprites/v2/index.test.ts` | Lookup returns non-null for all catalog types × known factions; unknown returns null |
| `tests/renderer/unit-renderer-overlay.test.ts` | Canvas skips drawImage for active IDs; barbarians always canvas; fog-gated units excluded; moving units excluded |

### Existing tests that cover the hard parts

| Existing test | Relevance |
|---|---|
| `tests/renderer/wrap-rendering.test.ts` | `getHorizontalWrapRenderCoords()` viewport-awareness — overlay delegates to this |
| `tests/renderer/sprites/sprite-catalog.test.ts` | All UnitTypes + buildings have catalog entries — guarantees v2 lookup succeeds |
| `tests/renderer/render-loop-wrap.test.ts` | Full render loop wrap integration |

### What is not unit-tested

- **CSS animation visual output** — keyframe correctness validated by running the game and the v2 artboard (`design/conquestoria-sprites/`)
- **Compositor thread behavior** — GPU layer promotion and 60fps validated by manual testing on iPhone + macOS desktop
- **Phase desync appearance** — `hashCode()` is tested for distribution; timing perception is not

---

## Known Limitations

### Baked faction colors

v2 SVG strings have faction hex colors serialized at build time (e.g. Imperials `#b53026`, Vikings `#1d4a8c`). If a civ's color changes mid-session, call `spriteOverlay.invalidateFaction(faction)` to evict and recreate that faction's elements. This is acceptable because faction colors are assigned at game-start and do not change during a session.

Future work: if runtime palette swapping is needed, the v2 serialization script (`scripts/serialize-sprites.mjs`) can be extended to emit CSS custom property placeholders instead of baked hex values.

### IntersectionObserver — deferred

`sprite-animations-v2.css` contains:
```css
/* Pause when the sprite is offscreen (set by IntersectionObserver in the runtime) */
[data-visible="false"] * { animation-play-state: paused !important; }
```

This comment references an IntersectionObserver that sets `data-visible="false"` on off-screen sprites to pause their animations (a meaningful battery/CPU optimization on mobile). This observer is **not implemented** as of this spec. The CSS rule is harmless without it. Implementing it is a follow-up task: add an IntersectionObserver in `SpriteOverlay` that sets/removes `data-visible` on each sprite wrapper element when it enters/leaves the viewport. The existing `camera.isHexVisible()` check in entity building already prevents most off-screen sprites from being in the pool, so this optimization's impact is bounded to sprites near the viewport edge.

---

## Research References

- [DOM Sprites: a Viable Alternative to Canvas — Build New Games](http://buildnewgames.com/dom-sprites/): world-space container pattern, browser compositor handling
- [Planning for Performance — O'Reilly Using SVG](https://oreillymedia.github.io/Using_SVG/extras/ch19-performance.html): GPU layer limits, inline SVG requirement for CSS animations, `contain: paint` interaction with overflow
- [Hardware-Accelerated Animations — Chrome for Developers](https://developer.chrome.com/blog/hardware-accelerated-animations): transform + opacity as the only compositor-thread properties
- [Optimizing canvas — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas): layered rendering pattern
- [Game UI Animation Optimization — Zigpoll](https://www.zigpoll.com/content/how-can-the-frontend-developer-optimize-the-ui-animations-to-maintain-smooth-performance-without-compromising-visual-quality-on-both-desktop-and-mobile-game-interfaces): will-change discipline, mobile VRAM limits
