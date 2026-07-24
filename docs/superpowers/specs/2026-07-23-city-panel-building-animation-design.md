# City Panel Building Animation — Design

Status: approved (post self-review), ready for implementation planning.

## Problem

`BUILDING_SPRITE_CATALOG` has 116 hand-authored, animatable SVG building sprites. As of #659,
they're used exactly once in the live game: a small static (non-animated) badge showing whatever
is currently queued for production, drawn via Canvas `drawImage`. The city panel's own **Buildings**
section — a plain text list of every building the city has actually completed (name, description,
upkeep) — has no icon or image at all. Nothing in the game shows a *built* building's sprite, animated
or otherwise.

## Goal

Add a small, genuinely animated sprite (idle breathing, `.cq-peek`, `.cq-glow`, `.cq-fire`, whatever
each sprite already defines) next to every row in the city panel's Buildings list. Every one of the
116 catalog sprites already supports this — no new art, no new catalog.

## Scope

- **In scope:** all buildings in `BUILDINGS` (city-system.ts) that a city has completed.
- **Out of scope:**
  - The map's diorama (buildings still don't appear on the map itself — that's a much larger,
    separate redesign of the abstract tier-based city visual, not touched here).
  - Siege-damage tiers / building-specific death animation — buildings have no per-building health
    state anywhere in this codebase (sieges affect the city as a whole), so there is no real data
    to drive a damage tier. A prototype of this CSS exists in an exploratory review harness but is
    explicitly not wired to anything live; it stays that way until a health-tracking feature exists.
  - Extending the v2 pre-serialization pipeline (`scripts/serialize-sprites.mjs` / `v2/index.ts`) —
    that pipeline only covers 34 of 116 buildings today and exists to solve a render-hot-path
    performance problem the city panel doesn't have (it renders once per panel-open, not per frame).
  - City-panel build-**chooser**/queue thumbnails — the picker UI shown *before* a building exists.
    Flagged as a separate follow-up in #659; this spec is about buildings that already exist.

## Design

### Visual

36px square icon, leading each row; current row layout, height, and text content unchanged.
Confirmed via an interactive mockup using the real Bank sprite's idle-breathe animation at three
candidate sizes (36 / 64 / 20px) — 36px was chosen as large enough for the ambient detail to
actually register without meaningfully growing the list's scroll length.

**Correction from the approved mockup:** the mockup used a hand-trimmed version of the Bank sprite
for speed and omitted two elements that the real `BuildingFrame`/`SpriteFrame` pipeline always
includes and that individual building-sprite functions cannot suppress via their public
`{ palette, svgOnly }` contract:
- `HexBase` — a translucent dashed hex-ring background, meant to visually anchor a sprite sitting
  on a map tile. Meaningless (and potentially visually muddy) inside a flat list row.
- The `CATEGORY_TINTS` ring `BuildingFrame` draws behind every sprite.

Rather than changing the shared sprite-prop contract (which would touch all 116 `FooSprite`
signatures for a purely cosmetic concern in one new caller), the fix lives entirely at the new call
site: render the returned SVG inside a fixed-size `overflow: hidden` box, scaled/positioned so the
building's own silhouette fills the crop and the ring — which sits at a known, fixed location in
every sprite's 192×192 viewBox, being emitted by the same shared `BuildingFrame`/`HexBase` call —
falls outside it. **This needs a visual re-check once actually built** — it wasn't part of what was
approved in the mockup, since the mockup didn't include it. If cropping still reads as busy at 36px,
revisit sizing (not the crop approach) before touching shared sprite code.

Palette is the city's *current* owner's civ color via the existing `derivePalette()` export — a
captured city's buildings immediately reflect the new owner's colors, consistent with the map and
production badge.

### Technical approach

When `city-panel.ts` builds `buildingPlaceholders`, for each `city.buildings[idx]`:

1. Look up `BUILDING_SPRITE_CATALOG[bid]` — **do not call it unconditionally** (see Bug 1 below).
2. If present, call it with `{ palette, svgOnly: true }` to get raw SVG (no wrapping div, no old
   v1 `<style>` tag — confirmed from `SpriteFrame`'s implementation).
3. Namespace every `id="..."` / `url(#...)"` / `href="#...">` in that string with a per-row suffix
   (see Bug 2 below) before inlining.
4. Wrap the result in `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="building"
   style="--phase:X">`, matching exactly how the map's DOM overlay wraps sprites so it picks up
   `sprite-animations-v2.css` for free. `X = (hashCode(`${city.id}:${bid}`) % 100) / 100`, reusing
   the already-exported `hashCode()` from `sprite-overlay.ts` rather than a new implementation —
   keyed by city id + building id so the same building type desyncs across different cities, not
   just within one city's list.
5. Inject that markup directly ahead of the existing text block in the row's HTML string.

`data-kind="building"` has **no behavioral effect on today's CSS** — no `data-kind="building"`-scoped
rule exists yet, so idle breathing works today purely from the generic (kind-unqualified)
`.cq-v2[data-state="idle"] .cq-sprite-figure` rule. It's included anyway because it's already a
documented value in `sprite-animations-v2.css`'s own taxonomy comment (`civilian | melee | ranged |
naval | hound | spy | building`) — correct now for forward-compatibility, not because anything
currently depends on it.

Building SVG markup returned by the catalog is programmatically generated from trusted TypeScript
sprite functions, not player- or game-state-derived text — inlining it via string concatenation
(the same pattern the panel already uses for its own structural HTML) is the same trust category
`sprite-overlay.ts` already documents inline ("svgHtml is our own serialized content — safe to use
innerHTML"), not the "never innerHTML with game-generated strings" case the UI rules warn about
(that rule targets dynamic *text*, which this panel already correctly routes through
`data-text="..."` + `textContent`, unchanged by this work).

Reduced-motion needs no new handling — it's already covered globally by
`sprite-animations-v2.css`'s `@media (prefers-reduced-motion: reduce)` block.

### Bugs found in the original design (fixed here)

**Bug 1 — crash on any city with completed legendary wonders.** `city.buildings` isn't limited to
`BUILDINGS` catalog entries: legendary wonders land there too, through a separate completion path
(`legendary-wonder-system.ts`, not `completeCityProductionItem`'s `BUILDINGS[itemId]` branch). There
are 74 legendary wonder ids; only 5 (`pyramids`, `colosseum`, `great_library`, `lighthouse`,
`wright-flyer`) have `BUILDING_SPRITE_CATALOG` entries. The sprite-catalog completeness test only
iterates `Object.keys(BUILDINGS)`, so this gap is expected/by-design, not itself a bug — but
originally-proposed code (`BUILDING_SPRITE_CATALOG[bid](...)` called unconditionally) would throw
a TypeError the first time a player's city panel renders a city that's completed any of the other
69 wonders. **Fix:** guard the lookup (`BUILDING_SPRITE_CATALOG[bid]?.(...)`) and fall back to
`PRODUCTION_ICON_FALLBACK` when absent — the same "unknown item falls back to the generic icon"
convention already used elsewhere (terrain tiles, improvement markers, the production badge itself).

**Bug 2 — cross-sprite SVG `id` collisions.** Every building sprite goes through `BuildingFrame`,
which unconditionally emits a `<defs>` block with fixed ids (`thatchPattern`, `tilePattern`,
`stoneTexture`). That specific trio is harmless to duplicate — the definitions are byte-identical
across every sprite, so a browser resolving `url(#thatchPattern)` to the *first* one in the document
still renders correctly. But individual sprite functions can and do define their own bespoke,
non-namespaced ids beyond that — confirmed example: `StockExchangeSprite`'s
`<clipPath id="tickerClip">`, used to clip its scrolling ticker text. The terrain-tile system
explicitly documents why this has never mattered there ("no cross-tile id collision risk since each
is a standalone document") — that isolation does not hold here, because this feature inlines
multiple *different* building types as sibling elements in the *same* DOM document for the first
time anywhere in this codebase. If any two building types happen to reuse the same bespoke id, the
second one silently resolves to the first one's definition. **Fix:** namespace every `id`/`url(#…)`/
`href="#…"` pair in each building's returned markup with a per-row suffix before inlining (a small
regex transform — precedented by `applyFactionCivColor`'s existing string-transform-before-insert
pattern in `sprite-overlay.ts`, which already does string surgery on serialized SVG before DOM
insertion for a different reason).

### Testing (extends `tests/ui/city-panel.test.ts`)

- Renders `.cq-sprite-wrap.cq-v2[data-kind="building"][data-state="idle"]` for a built ordinary
  building (e.g. `granary`).
- Palette reflects the city's **current** owner, not the original founder — a captured-city
  regression, matching this codebase's established concern about owner-attribution leaks.
- A `city.buildings` entry with no `BUILDING_SPRITE_CATALOG` coverage (a legendary wonder id such
  as `'grand-canal'`) does not throw, falls back to the generic production icon, and the rest of
  that row (name/description/upkeep) still renders correctly. Directly protects Bug 1.
- No duplicate SVG `id` attribute values across a panel render containing multiple buildings whose
  sprites are known to define bespoke ids (e.g. a city with both `stock_exchange` and another
  `<defs>`-using building). Directly protects Bug 2.
- `yarn build` and `yarn test` stay green; the existing sprite-catalog completeness test
  (`tests/renderer/sprites/sprite-catalog.test.ts`) is untouched — this feature adds no new catalog
  entries or contract changes, only a new consumer of the existing one.

### Manual QA (before merge)

- Re-verify the 36px crop against the *real* sprite output (hex ring + category ring included,
  unlike the approved mockup) — confirm it still reads clearly; adjust the crop or, only if that's
  insufficient, revisit sizing.
- A city with several buildings, at least one of which uses bespoke SVG defs (stock exchange, if
  built), to visually confirm no id-collision artifacts.
- A captured city, to confirm the palette switches to the new owner.
- Reduced-motion OS setting on, to confirm animation stops per the existing global CSS.
