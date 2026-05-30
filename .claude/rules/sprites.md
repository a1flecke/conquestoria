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

---

## Catalog Test Contract

`tests/renderer/sprites/sprite-catalog.test.ts` asserts that every `UnitType` and every building ID in `BUILDINGS` has a `UNIT_SPRITE_CATALOG` or `BUILDING_SPRITE_CATALOG` entry. This test **will fail** if you add a new type without the catalog line. Fix by adding the catalog line — never by weakening the test.

A parallel test for terrain tiles (`tests/renderer/terrain/terrain-tiles.test.ts`) should assert that every `TerrainType` value has all 4 variants. Add this test when `terrain-tiles.ts` is first created.
