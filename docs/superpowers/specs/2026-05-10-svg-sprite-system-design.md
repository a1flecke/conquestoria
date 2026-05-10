# SVG Sprite System Design

**Issue:** [#9 — Units are currently just symbols](https://github.com/a1flecke/conquestoria/issues/9)
**Date:** 2026-05-10

## Overview

Replace the emoji-in-circle unit rendering and emoji production badges with purpose-built SVG sprites — one per unit type, one per building type — drawn in a Civ-3-era top-down 3/4 style. Sprites recolor automatically for any civilization by deriving a 4-stop palette ramp from each civ's existing hex color. The emoji symbols become the LOD-0 fallback when zoomed far out.

The design source is the Claude Design export in `conquestoria-sprites/` (already extracted to `/tmp/conquestoria-sprites/`). It provides fully-authored JSX sprite components for all 18 unit types and 23 building types.

---

## Architecture: Approach A — SVG-to-Image Preloader

At game start, each sprite component is rendered to an SVG string via `flushSync` + `ReactDOM`, converted to a `Blob URL`, loaded as an `HTMLImageElement`, and stored in a cache keyed by `${type}:${civId}`. The Canvas renderers do a cache lookup and call `ctx.drawImage()` where they previously drew emoji. This preserves the existing Canvas architecture with zero rendering-model changes.

```
TSX component (faction palette prop)
  └── flushSync render → DOM node
        └── XMLSerializer → SVG string
              └── Blob URL → HTMLImageElement
                    └── cache[`${type}:${civId}`]
                          └── ctx.drawImage() in unit-renderer / city-renderer
```

**Why not react-dom/server:** `renderToStaticMarkup` requires importing the server bundle in browser code, adding ~50 KB. The `flushSync` DOM approach uses only `react-dom/client`, which is already in the bundle.

**Why not SVG string templates:** Every new Claude Design export would require manual JSX-to-template conversion. Dynamic palette injection (below) becomes harder. Template literals are not diffable against the design source.

---

## Section 1 — Dynamic Palette Injection

Each civ in the game already has a `color` hex string (e.g. `"#4a90d9"`). Rather than mapping civs to one of the six hardcoded design factions, we derive a 4-stop faction palette from that single color at preload time.

### Derivation

Given `civColor: string` (a CSS hex color):

1. Parse to HSL.
2. **dark** = `hsl(H, S, max(L - 40, 8%))` — very saturated shadow
3. **mid** = `hsl(H, S, L)` — the civ's own color (used for banners, shields, sails)
4. **bright** = `hsl(H, min(S + 10, 100), min(L + 30, 92%))` — highlight
5. **trim** = `hsl((H + 180) % 360, 20, 88%)` — near-neutral complement for pennant detail

The derivation intentionally preserves hue identity. A blue civ gets blue shields; a red civ gets red shields.

The helper lives in `src/renderer/sprites/sprite-system.tsx`:

```typescript
export function derivePalette(civColor: string): FactionPalette {
  // civColor → { dark, mid, bright, trim }
}
```

`FactionPalette` is the type both unit and building components accept as a prop. It replaces the design's hardcoded `faction: string` prop, so components never need to know civ names.

---

## Section 2 — File Structure

```
src/renderer/sprites/
  sprite-system.tsx      # palette derivation, shared primitives (HexBase, Banner, Humanoid, etc.)
  units.tsx              # 19 unit sprite components
  buildings.tsx          # 23 building sprite components
  sprite-catalog.ts      # maps UnitType / building id → component + metadata
  sprite-loader.ts       # SpriteCache, initSprites(), getUnitSprite(), getBuildingSprite()
```

Design source files (read-only reference):
```
/tmp/conquestoria-sprites/project/lib/
  sprite-system.jsx  →  src/renderer/sprites/sprite-system.tsx
  units.jsx          →  src/renderer/sprites/units.tsx
  buildings.jsx      →  src/renderer/sprites/buildings.tsx
```

---

## Section 3 — sprite-system.tsx

Port of `lib/sprite-system.jsx`. Key changes from the design source:

- `Object.assign(window, ...)` → named exports
- `faction: string` prop on Banner/SpriteFrame → `palette: FactionPalette` prop (the 4-stop ramp)
- `SpriteFrame` gains `svgOnly?: boolean` prop: when true, renders as bare `<svg>` (no wrapper `<div>`, no label) — used by the preloader to serialize cleanly
- CSS animation class `cq-anim-idle` is included in the SVG's `<style>` block for DOM rendering contexts; Canvas rendering ignores it (static image)

Exports:

```typescript
export type FactionPalette = { dark: string; mid: string; bright: string; trim: string };
export function derivePalette(civColor: string): FactionPalette;
export const MATERIAL_PALETTE: { skin, cloth, metal, wood, stone, thatch, ground, ink, hud };
export const CATEGORY_TINTS: Record<string, string>; // category → hud color
export function HexBase(props): JSX.Element;
export function Banner(props: { x, y, palette, scale?, shape? }): JSX.Element;
export function Shadow(props): JSX.Element;
export function Humanoid(props): JSX.Element;
export function SpriteFrame(props: { size?, svgOnly?, hex?, hexTint?, label?, sub?, animate?, children }): JSX.Element;
export function BuildingPlinth(props): JSX.Element;
```

---

## Section 4 — units.tsx

Port of `lib/units.jsx`. Each component's signature changes from:

```tsx
function WarriorSprite({ faction = 'imperials', animate = 'idle' })
```
to:
```tsx
export function WarriorSprite({ palette, svgOnly = false }: UnitSpriteProps)
```

`UnitSpriteProps`:
```typescript
export type UnitSpriteProps = { palette: FactionPalette; svgOnly?: boolean };
```

All 18 unit components are exported by name:
`SettlerSprite`, `WorkerSprite`, `ScoutSprite`, `ScoutHoundSprite`, `WarHoundSprite`, `ShadowWardenSprite`, `WarriorSprite`, `SwordsmanSprite`, `PikemanSprite`, `ArcherSprite`, `MusketeerSprite`, `GalleySprite`, `TriremeSprite`, `SpyScoutSprite`, `SpyInformantSprite`, `SpyAgentSprite`, `SpyOperativeSprite`, `SpyHackerSprite`.

Unit sprites render at **128×128 viewBox** (design standard). The `HexBase` shadow is rendered with `hex={false}` in preloader mode — the Canvas hex tile already provides the ground plane.

---

## Section 5 — buildings.tsx

Port of `lib/buildings.jsx`. Signature changes from faction string to palette:

```tsx
export function BarracksSprite({ palette, svgOnly = false }: BuildingSpriteProps)
```

All 23 building components are exported:

**Food:** `GranarySprite`, `HerbalistSprite`, `AqueductSprite`
**Production:** `WorkshopSprite`, `ForgeSprite`, `LumbermillSprite`, `QuarrySprite`
**Science:** `LibrarySprite`, `ArchiveSprite`, `ObservatorySprite`
**Economy:** `MarketplaceSprite`, `HarborSprite`
**Military:** `BarracksSprite`, `WallsSprite`, `StableSprite`
**Culture:** `TempleSprite`, `MonumentSprite`, `AmphitheaterSprite`, `ShrineSprite`, `ForumSprite`
**Espionage:** `SafehouseSprite`, `IntelAgencySprite`, `SecurityBureauSprite`

Building sprites render at **192×192 viewBox**.

---

## Section 6 — sprite-catalog.ts

Maps game identifiers to sprite components. This is the single place to register a new sprite.

```typescript
import type { UnitType } from '@/core/types';
import type { UnitSpriteProps, BuildingSpriteProps } from './units';
import type React from 'react';

export type UnitSpriteComponent = React.ComponentType<UnitSpriteProps>;
export type BuildingSpriteComponent = React.ComponentType<BuildingSpriteProps>;

export const UNIT_SPRITE_CATALOG: Record<UnitType, UnitSpriteComponent> = {
  settler: SettlerSprite,
  worker: WorkerSprite,
  // ... all 19
};

export const BUILDING_SPRITE_CATALOG: Record<string, BuildingSpriteComponent> = {
  granary: GranarySprite,
  herbalist: HerbalistSprite,
  // ... all 23; building IDs match BUILDINGS keys in city-system.ts
  'quarry-building': QuarrySprite,
  'intelligence-agency': IntelAgencySprite,
  'security-bureau': SecurityBureauSprite,
};

// Sizes for drawImage
export const UNIT_SPRITE_SIZE = 128;
export const BUILDING_SPRITE_SIZE = 192;
```

When a new unit or building is added to the game, the developer adds one line here. No other sprite code changes.

---

## Section 7 — sprite-loader.ts

```typescript
import { flushSync } from 'react-dom';
import ReactDOM from 'react-dom/client';
import React from 'react';
import { derivePalette } from './sprite-system';
import { UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG } from './sprite-catalog';
import type { UnitType } from '@/core/types';

class SpriteCache {
  private units = new Map<string, HTMLImageElement>();
  private buildings = new Map<string, HTMLImageElement>();

  async loadCiv(civId: string, civColor: string): Promise<void>;
  getUnit(type: UnitType, civId: string): HTMLImageElement | null;
  getBuilding(buildingId: string, civId: string): HTMLImageElement | null;
}

export const spriteCache = new SpriteCache();

export async function initSprites(civColors: Record<string, string>): Promise<void> {
  // civColors: { [civId]: hexColor }
  // For each civ, derive palette and preload all unit + building sprites
}
```

### Render mechanism

```typescript
function renderToSVGString(element: React.ReactElement): string {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;pointer-events:none';
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  flushSync(() => root.render(element));
  const svg = container.querySelector('svg');
  const result = svg ? new XMLSerializer().serializeToString(svg) : '';
  root.unmount();
  document.body.removeChild(container);
  return result;
}

function svgStringToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}
```

### Cache key convention

`units: "${unitType}:${civId}"` and `buildings: "${buildingId}:${civId}"`

Preloading is parallelized with `Promise.all` per civ. At 19 units + 23 buildings = 42 images per civ, with 4 civs = 168 total images. On a modern browser, this completes in under 500ms.

### Fallback

`getUnit()` and `getBuilding()` return `null` if the sprite hasn't loaded yet. Callers fall back to the current emoji rendering path.

---

## Section 8 — LOD Strategy

| Camera zoom | Unit rendering | Building badge |
|---|---|---|
| < 0.4 | Emoji circle (current) | Emoji (current) |
| ≥ 0.4 | SVG sprite via `ctx.drawImage` | SVG sprite (small) |

The design documents three tiers (symbol, simplified, detailed). For v1 we implement two: emoji fallback and full sprite. The simplified 64px tier is a future extension — the catalog and loader already support it (just add a `size` parameter to `loadCiv`).

Unit sprite draw size = `camera.hexSize * camera.zoom * 0.9` (slightly smaller than the hex to leave a gap between stacked units and the hex border). This matches how the emoji circles are sized today (`size * 0.35` radius × 2 ≈ 0.7 of hex size).

---

## Section 9 — unit-renderer.ts Changes

`drawUnits` receives the existing `colorLookup` parameter. Add a new optional `civIdLookup?: Record<string, string>` (maps unit owner → civ ID, needed for sprite cache key) or derive it from `state.civilizations`.

For each unit in the draw loop:
1. Compute `sprite = spriteCache.getUnit(unit.type, unit.owner)` (owner IS the civ ID in game state)
2. If `sprite && camera.zoom >= 0.4`:
   - Replace the circle + emoji with `ctx.drawImage(sprite, unitX - drawSize/2, unitY - drawSize/2, drawSize, drawSize)`
3. Else: existing emoji circle path (unchanged)

Health bar, fortify badge, and stack count badge are drawn identically in both paths — they sit above the sprite or emoji.

No other changes to `drawUnits` signature or callers.

---

## Section 10 — city-renderer.ts Changes

`getProductionBadgeIcon()` returns a string emoji today. Add a parallel `getProductionBadgeSprite()`:

```typescript
export function getProductionBadgeSprite(
  city: { productionQueue: string[] },
  civId: string,
): HTMLImageElement | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return spriteCache.getBuilding(id, civId) ?? null;
}
```

In `drawCities`, when drawing the production badge:
1. If `buildingSprite && camera.zoom >= 0.4`: draw a small version of the building sprite (24×24px) as the badge
2. Else: existing emoji path

City circle itself (the owner-colored disc with `🏛️`) is unchanged in v1. Building sprites appear only in the production badge slot.

---

## Section 11 — Initialization in main.ts

After game state is initialized (new game or load):

```typescript
import { initSprites } from '@/renderer/sprites/sprite-loader';

// Build civColor map from state
const civColors: Record<string, string> = {};
for (const [civId, civ] of Object.entries(state.civilizations)) {
  civColors[civId] = civ.color;
}
initSprites(civColors); // fire-and-forget: renderers fall back to emoji while loading
```

`initSprites` is non-blocking. The game renders normally during preload — units show as emoji, then switch to sprites once the cache warms (next render frame after `loadCiv` resolves). No loading screen required.

Civs not present in `state.civilizations` (e.g., barbarians, if stored separately) are not preloaded. `getUnit('warrior', 'barbarian')` returns `null`, and the renderer falls back to the emoji circle. This is intentional — barbarians don't need faction-colored sprites.

Hot-seat: call `initSprites` once at game start with all civ colors. No per-turn re-init needed.

---

## Section 12 — Testing

### `tests/renderer/sprites/sprite-catalog.test.ts`
- All 19 `UnitType` values from `types.ts` have an entry in `UNIT_SPRITE_CATALOG`
- All building IDs from `BUILDINGS` in `city-system.ts` have an entry in `BUILDING_SPRITE_CATALOG` (legendary wonders excluded — they use fallback)

### `tests/renderer/sprites/sprite-loader.test.ts`
- `getUnit` returns `null` before `initSprites` is called
- After `initSprites({ 'player': '#4a90d9' })`, `getUnit('warrior', 'player')` returns an `HTMLImageElement`
- After `initSprites`, `getBuilding('granary', 'player')` returns an `HTMLImageElement`
- Requesting an uncached civ returns `null` (no throw)

### `tests/renderer/sprites/sprite-system.test.ts`
- `derivePalette('#4a90d9')` returns an object with `dark`, `mid`, `bright`, `trim` all valid CSS hex strings
- `derivePalette` with a red input returns a palette whose `mid` is within ±15° hue of red

No snapshot tests — SVG string output is too brittle to snapshot across minor JSX formatting changes.

---

## Section 13 — Extension Recipe (for future units/buildings)

1. Design the sprite in Claude Design; export the bundle.
2. Copy the new `FooSprite` component from the exported JSX into `units.tsx` or `buildings.tsx`.
3. Change `faction: string` → `palette: FactionPalette` in the component props (use `MATERIAL_PALETTE` for neutral colors, `palette.*` only for civ-specific accents).
4. Add one line to `UNIT_SPRITE_CATALOG` or `BUILDING_SPRITE_CATALOG` in `sprite-catalog.ts`.
5. Done. The loader, renderers, and tests all pick it up automatically.

No renderer code changes. No new tests unless new behavior is introduced.

---

## Out of Scope (future work)

- **Simplified (64px) LOD tier** — mid-zoom simplified sprites. Deferred until full-res sprites ship and zoom performance is measured.
- **Canvas idle animation** — sinusoidal y-offset float synchronized to a global timer. Deferred.
- **City circle building sprite** — replacing the `🏛️` glyph on the city circle with a full building SVG. Deferred; the city circle rendering is more complex (clipping, labels, unrest indicators).
- **Wonder sprites** — legendary wonders. Out of scope; they use `PRODUCTION_ICON_FALLBACK` by design.
