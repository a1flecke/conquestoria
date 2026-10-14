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

## PNG Spritesheet Units (run beside the SVG sprites)

A unit may be drawn from a **painted PNG** instead of serialized SVG. Both renderers coexist: a unit is PNG exactly when it
has a row in `PNG_UNIT_SPRITES` (`src/renderer/sprites/png/png-sprite-catalog.ts`); every other unit keeps its SVG sprite.
Migrating a unit is one catalog row plus its generated manifest; migrating it back is deleting the row.

- **Pipeline:** `scripts/sprite-puppet/puppet.py build <rig.json>` turns one source PNG into `public/images/units/<id>/{sheet,mask}.png`
  plus `src/renderer/sprites/png/generated/<id>.manifest.ts`. Recipe, rig-spec reference and limits:
  `scripts/sprite-puppet/README.md`; operating procedure (incl. SpriteCook spending rules): `.claude/skills/png-unit-sprite.md`.
  Never hand-edit a generated manifest or sheet.
- **Civ colour is runtime, not baked.** The sheet keeps the tinted region as a grey ramp and `mask.png` says how much of each pixel
  takes the owner's colour. The DOM overlay tints with a CSS mask + `mix-blend-mode: multiply`
  (`src/assets/png-sprite-animations.css`); the Canvas layer bakes the same result (`png-sprite-canvas.ts`). So a PNG unit works for
  any civ colour; the source image's faction-coloured cloth must be saturated red and nothing else red.
- **Same overlay contract as SVG sprites:** root `.cq-sprite-wrap.cq-png`, state via `data-state`, phase via `--phase`. The PNG player
  is deliberately **not** `.cq-v2`, so SVG animation selectors can never touch it. `getUnitSpriteV2` is the single dispatch point.
- **The SVG sprite stays.** A PNG unit keeps its `UNIT_SPRITE_CATALOG` entry: it is the fallback when the Canvas bake fails (no 2D
  canvas, sheet missing) and what a rollback returns to. `tests/renderer/sprites/png/` enforces this, plus manifest/file/rig-spec/provenance.
- **Provenance is mandatory:** every source image has `design/png-sprites/sources/<id>.provenance.json` (tool, model, prompt, asset id, date,
  licence note). A generated source is never committed without it.
- **Hard rules:** never put a free-form string in a PNG sprite style attribute (colours pass `resolvePngTint`'s hex check); no hardcoded
  pixel size (the overlay's wrapper size still comes from `camera.hexSize`); `hurt`/`death`/`work` reuse the idle row (CSS filter) — do not
  add a state without a manifest row; keep ~560 KB/unit in mind before migrating the whole roster (see the README's size note).

---

## Legendary Wonder Production Art (#613)

A legendary wonder can have a painted PNG that replaces its canvas drawing everywhere it is shown, with the canvas drawing kept as the
fallback. The wonder's id in `LEGENDARY_WONDER_ART_IDS` (`src/renderer/wonders/legendary-wonder-art-catalog.ts`) is the single switch;
the map badge, the city production badge, the city-panel chooser/queue, the wonder panel and the Codex hero all read it, so nothing
else is edited per wonder.

**Adding art for another wonder:**
1. Generate a 128×128 transparent isometric PNG (square landmark, restrained period palette, no text/logos, readable at ~30 px) and save
   it as `public/images/wonders/art/<wonder-id>.png` (≤ 24 KB, RGBA, transparent corners).
2. Write `design/wonder-art/<wonder-id>.provenance.json` (tool, prompt, generation id, date, a licence note the owner has confirmed).
3. Add the id to `LEGENDARY_WONDER_ART_IDS`. `tests/renderer/wonders/legendary-wonder-art.test.ts` then checks the file, size,
   dimensions, transparency and provenance; add the id to the in-scope list in `tests/e2e/issue-613-wonder-art.spec.ts`.
4. Delete that wonder's `TODO(art)` line in `legendary-wonder-bespoke-assets.ts` and leave the draw function as the fallback.

**Hard rules:** never hard-code `/images/…` — build the URL with `resolveAppAssetUrl` (`src/renderer/asset-url.ts`); panels get the art
through `src/ui/legendary-wonder-icon.ts` (the one UI-layer entry; do not import `src/renderer/wonders/*` from another panel);
`under-construction` never draws finished art; art appears only where the wonder's name is already shown to the viewer; a failed load
must leave the canvas fallback in effect and be retried by the next `preloadLegendaryWonderArt()`.

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
- **`getUnit()`, `getUnitMotion()` and `getBuilding()` return `null` for uncached keys** — never throw — **and request the missing pair** (#1439 phase 5), so the next paint after the canvas is notified finds it. Callers fall back to emoji meanwhile.
- **`LOD_SPRITE_ZOOM_THRESHOLD` is exported from `sprite-system.tsx`** — import it there; do not redefine.
- **`SpriteFrame svgOnly={true}` omits the CSS `<style>` tag.** Browsers block CSS animations in SVG loaded as `<img>`.
- **Neutral owners (barbarians, minor civs) have no palette until the unit renderer supplies one** (`spriteCache.ensureUnit(type, ownerId, color)`, called when a sprite is missing); `getUnit('warrior', 'barbarian')` returns `null` until then.
- **Never call `initSprites` per-turn or per-frame.** It is called once in `startGame()`, with `collectSpriteDemand(state)` (the sprites the starting state needs). **Sprites are created on demand (#1439 phase 5):** an (id, civ) pair is built the first time something asks for it, never the whole catalog per civilization (that was ~500 images and ~0.4-0.8 GB of renderer memory per civ). A new sprite consumer reads through `getUnit`/`getUnitMotion`/`getBuilding` and needs no registration; a new place that knows what it will draw next may seed it through `SpriteDemandItem`. Never iterate the catalogs to preload.
- **Sprite images load through `spriteLoadQueue`, never as a burst (#1439 phase 4).** Creating many sprite images at once (a whole civilization was ~500) kept the main thread busy for seconds after the first paint (first input ~3.2 s later on a 2-civ save; scales with civ count). A new sprite loader schedules each image via `spriteLoadQueue.schedule(priority, work)`: `SPRITE_LOAD_CONCURRENCY` bounds how many are in flight, the SVG string is generated inside `work` (lazily, when its turn comes), and `SPRITE_PRIORITY` orders what is drawn at rest (`visible`: idle frames, buildings) before pirates and walk frames (`motion`). The queue starts work on a microtask so a synchronous burst is sorted first. `SpriteCache.request(id, civ)` resolves when that pair is cached, and the canvas is notified once its at-rest frames are ready and again at the end. Pinned by `tests/renderer/sprites/sprite-load-queue.test.ts`; measured by `yarn test:web-smoke:campaign-start` (see `docs/renderer-idle-redraw-audit.md` section 12).

- **The sprite cache outlives a campaign; images are tied to the palette they were built for (#1439 follow-up).** `startGame()` runs for a new game, a loaded save and hot-seat entry in one page session, and `createNewGame` reuses `player` as a civ id with a new colour. `SpriteCache` keeps one `CivSprites` bucket per civ id *and colour*: `registerCiv` with a different colour replaces the bucket (never serving the old art), and every queued/async step checks that its bucket is still the current one before decoding and before committing, so a late load from a replaced or released campaign is dropped (blob already revoked) and does not announce itself to the canvas. `initSprites` -> `beginCampaign`: unchanged civs+colours are idempotent (no repeat sprite or pirate work, neutral-owner art kept); a different campaign releases civs it no longer has; failed loads retry once per start, never per frame (`ensurePirates` likewise). Never add a cache keyed only by `(id, civId)` or a commit that does not re-check its bucket. Pinned by `tests/renderer/sprites/sprite-cache-lifecycle.test.ts`; `getSpriteCacheStats()` exposes entry counts.

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
