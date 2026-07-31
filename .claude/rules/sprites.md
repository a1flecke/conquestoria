---
paths:
  - "src/renderer/sprites/**"
  - "src/renderer/terrain/**"
  - "src/renderer/improvements/**"
  - "src/renderer/hex-renderer.ts"
---

# Sprite & Terrain Visual System Rules

See `docs/sprite-design-system.md` for the full asset inventory, placeholder list, material palette, animation class reference, and GitHub raw URLs for Claude Design prompts.

---

## Extension Recipe — Unit or Building Sprite

1. Use the `generate-sprite-prompt` skill to produce a Claude Design prompt, or write the SVG yourself following the contracts in `docs/sprite-design-system.md`.
2. Copy the new `FooSprite` export function into `units.tsx` or `buildings.tsx`.
3. Signature must be:
   - Unit: `export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps): string`
   - Building: `export function FooSprite({ palette, svgOnly = false }: BuildingSpriteProps): string`
4. Faction color must flow through `palette.*` only — no hardcoded hex colors for civ identity.
5. Add one line to `UNIT_SPRITE_CATALOG` (wrapped in `withMotion`) or `BUILDING_SPRITE_CATALOG` in `sprite-catalog.ts`.
6. Done — loader, renderers, and catalog tests pick it up automatically.

## Extension Recipe — Terrain Tiles (new TerrainType or first-time tile set)

1. Use the `generate-sprite-prompt` skill (Part B) to produce a prompt, or write SVGs yourself.
2. Each terrain type needs **4 SVG string variants** in `src/renderer/terrain/terrain-tiles.ts`.
3. SVG format: `viewBox="0 0 128 111"`, internal `<clipPath id="hex">` with polygon `"64,0 128,27.75 128,83.25 64,111 0,83.25 0,27.75"`, all visible content in `<g clip-path="url(#hex)">`.
4. Variation index: `Math.abs(q * 7 + r * 13) % 4` — same tile always renders same variant.
5. Add the terrain type to `TERRAIN_TILES` in `terrain-tiles.ts` and verify `getTerrainTile` covers it.
6. Register a fallback color in `TERRAIN_COLORS` in `hex-renderer.ts` (used while tiles are loading or if tile is missing).
7. `preloadTerrainTiles()` must be called once during game init alongside `initSprites()`.

## Extension Recipe — Improvement Marker

1. Create `src/renderer/improvements/<name>-marker.ts` exporting a `const FOO_IMPROVEMENT_SVG: string`.
2. SVG format: `viewBox="0 0 48 48"`, no palette, no animation, `stroke-linecap="round"` throughout.
3. Replace the emoji entry in `IMPROVEMENT_ICONS` in `hex-renderer.ts` with an image-draw call using the new SVG (follow the `resource_outpost` pattern once it's implemented).

## Extension Recipe — Rail Segment (edge sprite, not a tile marker)

The rail segment (`src/renderer/improvements/rail-segment-marker.ts`) is the one visual asset in
this codebase that doesn't cleanly fit Unit/Building, Terrain Tile, or Improvement Marker. It is
closest to an Improvement Marker but differs in three ways — document any future edge-sprite the
same way:

1. **`viewBox 0 0 48 48`, no palette, no animation** — same as a standard Improvement Marker.
2. **Drawn per road *segment*, not per tile.** `hex-renderer.ts`'s `drawRailSegment` rotates and
   stretches the image along the line between two hex centers (`ctx.translate` to the segment
   midpoint, `ctx.rotate` by `Math.atan2(dy, dx)`, then `ctx.drawImage` sized to the segment
   length) — it is never drawn centered on a single hex the way `resource_outpost` is.
3. **Both-endpoints-required gate.** The sprite only renders when *both* tiles bounding the edge
   resolve `hasRail: true` (see `resolveTileHasRail` in `road-network.ts`); a segment with only
   one qualifying endpoint falls back to the plain road line — there is no half-rail asset. Any
   future edge sprite with a similar gated-pair condition should follow this same fallback
   pattern rather than rendering a degraded/partial variant.

---

## DOM-Overlay Live Fallback For Uncovered Unit Sprites

`getUnitSpriteV2` (`src/renderer/sprites/v2/index.ts`) no longer returns `null` for a unit type
with no hand-authored `UNIT_SPRITES` entry, or for a known unit type queried with a `faction`
string that doesn't match one of the 6 archetype-family keys (which happens for every minor-civ-
owned unit — `getFaction()` returns the raw owner id for any owner not in `state.civilizations`).
Instead it calls the live `UNIT_SPRITE_CATALOG` function directly (`{palette, svgOnly: true}`) and
wraps the result in the same `.cq-sprite-wrap.cq-v2` shell every pre-serialized sprite uses — see
`isV2NativeUnit(unitType)` to check which path a given unit takes.

**This is intentional and permanent — do not "fix" it by reverting to `null`.** It's what makes
"every unit animates via the DOM overlay" a structural guarantee (enforced by a test in
`tests/renderer/sprites/v2/index.test.ts` that loops over `UNIT_SPRITE_CATALOG` and asserts
`getUnitSpriteV2` is never `null`) instead of something that silently regresses whenever a new unit
ships without matching hand-authored v2 art — which is exactly what happened before issue #755.

- The inner `<svg>` this path produces is always `width="100%" height="100%"`, never a fixed pixel
  value — the DOM overlay's outer wrapper (sized from `camera.hexSize`) controls actual display
  size. A hook (`check-src-edit.sh`) blocks a hardcoded numeric width/height here.
- `data-kind` is deliberately omitted on fallback-tier sprites — no ambient-effect CSS class is
  `data-kind`-scoped, and guessing wrong risks triggering an unrelated body-plan animation rule.
- Fallback-tier units get ambient-effect animation (`.cq-glow`, `.cq-fire`, etc.) and idle motion,
  but not full limb-level walk-cycle art, weapon-pivot rotation, or secondary motion (capes,
  plumes, antennae). **Correction (found 2026-07-31, verified by reading
  `design/conquestoria-sprites/lib/units-v2.jsx` directly):** the 6 faction "archetypes" are
  **not** 6 separate hand-drawn body/armor illustrations — every v2-native sprite, including the
  file's own flagship example, uses `faction` only to derive 4-5 fill colors on one fixed shape,
  the same palette-recolor pattern the live catalog already uses. The real thing fallback-tier
  units are missing is the CSS-animation-hook wiring (`.cq-leg-l`/`.cq-leg-r`, `.cq-weapon` with
  pivot vars, `.cq-hit-spark`, etc.) — a rigging upgrade to the existing silhouette, not a
  redesign. Upgrading a specific unit to native v2 art is optional, incremental work — see the
  migration-backlog issue referenced in `docs/sprite-design-system.md`'s Units section for the
  recipe.
- Step 5 of the "Extension Recipe — Unit or Building Sprite" above (adding the catalog entry) is
  now sufficient by itself for a new unit to animate via the DOM overlay — writing v2-native
  archetype art is optional richness, not a required step.

---

## Hard Rules

**Units and buildings:**
- **Never import React or react-dom.** The custom JSX runtime in `jsx-runtime.ts` handles all JSX.
- **Never use `Object.assign(window, ...)`** in sprite files. All exports are named.
- **All civ color flows through `palette: FactionPalette`.** No hardcoded faction names or hex colors for civ identity.
- **`getUnit()` and `getBuilding()` return `null` for uncached keys** — never throw. Callers fall back to emoji.
- **`LOD_SPRITE_ZOOM_THRESHOLD` is exported from `sprite-system.tsx`** — import it there; do not redefine.
- **`SpriteFrame svgOnly={true}` omits the CSS `<style>` tag.** Browsers block CSS animations in SVG loaded as `<img>`.
- **Barbarians and minor civs are not preloaded.** `getUnit('warrior', 'barbarian')` returns `null` by design.
- **Never call `initSprites` per-turn or per-frame.** It is called once in `startGame()`.

**Terrain tiles:**
- **Never embed palette or faction color** in terrain tiles — they are faction-neutral.
- **Every TerrainType must have exactly 4 variants.** TypeScript enforces the tuple type `[string, string, string, string]`.
- **The `hex` clipPath id is local** to each SVG string — no cross-tile id collision risk since each is a standalone document.
- **Flat color fallback must always exist** in `TERRAIN_COLORS` for every terrain type; remove only when all 4 tile variants are confirmed loading.
- **Only these terrain types animate** (via inline SVG `<animate>` / `<animateTransform>`): ocean, coast, volcanic, snow, tundra, swamp. All others are static. See `docs/sprite-design-system.md` for the exact animation technique per type.

**Improvement markers:**
- **viewBox must be `0 0 48 48`** — the hex renderer draws them at a fixed size.
- **No animation** — improvement markers are drawn on Canvas 2D directly.
- **Use the game's earthy palette** (`#5e3f24`, `#8a6a3a`, `#d4a13c`, etc.) — not arbitrary colors.

**Sprite overlay sizing:**
- **NEVER hardcode a pixel size** for the DOM sprite wrapper in `sprite-overlay.ts`. Wrapper size MUST be derived from `camera.hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR`.
- The container applies `scale(camera.zoom)`, so children are in world-space units. At `zoom = 2`, unit sprites (128px native) render at their design size; at `zoom = 3`, building sprites (192px native) render at their design size.
- The `check-src-edit` hook blocks any literal `width:NNNpx` or `height:NNNpx` in `sprite-overlay.ts`.

**Faction ↔ civType contract:**
- `CIVTYPE_TO_FACTION` in `render-loop.ts` MUST use real `CivDefinition.id` values as keys (`rome`, `egypt`, `england`, etc.) — never internal sprite palette names (`imperials`, `vikings`, etc.) as keys.
- When adding a new `CivDefinition` to `civ-definitions.ts`, also add a corresponding entry to `CIVTYPE_TO_FACTION` in `render-loop.ts`.
- Tests that exercise faction resolution MUST use real civType IDs, not internal palette names. The test `every CivDefinition.id has an explicit entry in CIVTYPE_TO_FACTION` must stay passing — never weaken it.

---

## Catalog Test Contract

`tests/renderer/sprites/sprite-catalog.test.ts` asserts that every `UnitType` and every building ID in `BUILDINGS` has a `UNIT_SPRITE_CATALOG` or `BUILDING_SPRITE_CATALOG` entry. This test **will fail** if you add a new type without the catalog line. Fix by adding the catalog line — never by weakening the test.

A parallel test for terrain tiles (`tests/renderer/terrain/terrain-tiles.test.ts`) should assert that every `TerrainType` value has all 4 variants. `terrain-tiles.ts` exists but this test directory is currently missing — add it when making terrain changes.
