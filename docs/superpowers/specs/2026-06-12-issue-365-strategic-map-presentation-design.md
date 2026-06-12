# Issue 365 Strategic Map Presentation Design

**Date:** 2026-06-12
**Status:** Approved for implementation planning
**Issue:** [#365](https://github.com/a1flecke/conquestoria/issues/365)
**Supersedes in part:** `2026-06-06-sprite-overlay-renderer-design.md` for ordinary building and improvement map entities, and for transferring moving units between DOM and Canvas renderers
**Builds on:** `2026-06-04-stage-2k-city-renderer-layer-architecture-design.md`

## Purpose

Issue 365 is not one isolated sprite-size bug. The screenshots show a strategic-map presentation model that has lost a consistent visual hierarchy:

- completed buildings appear as full-size independent objects on the city hex
- embedded building labels overlap terrain, city labels, and other map information
- building completion makes the map progressively busier instead of making the city feel more developed
- some improvements, especially farms, read as unrelated icons rather than changes to the land
- stationary units, moving units, fallback units, and stacked units can use different render paths and different scales
- a unit can shrink during movement or remain in the smaller fallback presentation afterward

The redesign gives each strategic-map concept one visual responsibility:

- a city is one evolving city diorama
- a unit is one consistently sized military piece
- an improvement is part of its terrain
- labels and badges communicate only information that cannot be communicated by shape, color, or placement

This is a presentation redesign. It must not change gameplay outcomes, saved gameplay state, combat rules, movement rules, production rules, city yields, technology progression, fog rules, or AI behavior.

## Player Goals

The design must work for three distinct play styles in the same family:

- The 7-year-old builder should see cities become visibly richer, recognize friendly cooperation, understand transports and small battles, and identify barbarians without reading dense labels.
- The 10-year-old battle-focused player should be able to scan armies, movement, threats, and targets quickly.
- The 12-year-old empire builder should see army concentration, city growth, specialization, and rival development at a glance.

The shared requirement is legibility. More progress should produce clearer identity, not more overlapping objects.

## Genre Lessons

The design uses a deliberate mix of conventions from comparable strategy games:

- Civilization uses changing city silhouettes, owner color, population, and special landmarks to communicate progress without rendering every constructed building as a separate full-size map object.
- Rise of Nations makes the city the territorial and economic anchor while keeping armies visually separate from city development.
- Age of Empires and Warcraft make unit silhouettes and army movement immediately readable, while individual base buildings belong to a different spatial scale than the world map used by Conquestoria.
- Civilization VI districts are not copied because Conquestoria does not allocate ordinary buildings to separate strategic-map hexes. Drawing them as though it did would imply gameplay that does not exist.

The resulting model is an evolving city diorama, not a miniature real-time-strategy base and not a pile of recently completed building sprites.

## Approved Visual Contract

### City

- Each city renders as exactly one bounded diorama centered on its city hex.
- Ordinary completed buildings never create independent strategic-map entities.
- The city diorama changes through four inputs: civilization architecture era, population tier, up to two building specializations, and special-city identity.
- The diorama occupies no more than approximately 75 percent of the hex width at ordinary zoom.
- A single compact owner-colored banner beneath the diorama shows city name and population.
- The banner is capped to the city hex width. Long names truncate while population remains visible; the full name remains available through city inspection.
- Building completion may change specialization accents, but it must not expand the city's footprint or add another label.

### Unit

- An unstacked unit occupies approximately half the hex width.
- The same unit uses the same anchor and display box while idle, selected, fortified, moving, attacking, embarked, or recovering from an interrupted animation.
- Movement changes position and animation state only. It never changes scale.
- A stack keeps one full-size lead unit and communicates quantity with restrained depth/offset treatment and a count badge. Stack membership never shrinks the lead unit.

### Improvement

- Farms, mines, pastures, plantations, camps, quarries, lumber camps, and watermills are terrain treatments.
- They do not use full-size DOM sprite wrappers or embedded text labels.
- Improvement art stays below units, cities, fog, highlights, and interaction badges.

## Architecture

### 1. Derived Presentation, No New Save State

The renderer derives map presentation from existing canonical state. No visual-era, specialization, city-style, or unit-size field is persisted.

Relevant existing state includes:

- `City.population`
- `City.buildings`
- `City.maturity`
- `Civilization.techState.completed`
- `Building.category`
- civilization city ordering
- `BreakawayMetadata.originCityId`
- viewer-safe legendary wonder map entries

The implementation should introduce small pure presentation helpers rather than adding fields to `GameState`.

Suggested outputs:

```typescript
interface CityMapPresentation {
  architectureEra: number;
  populationTier: CityMaturity;
  specializations: BuildingCategory[];
  ownerColor: string;
  isCapital: boolean;
  isBreakawayCapital: boolean;
  primaryWonder?: LegendaryWonderMapEntry;
  wonderCount: number;
  isMinorCiv: boolean;
  visibilityMode: 'live' | 'last-seen';
}

interface UnitMapPresentation {
  worldPosition: { x: number; y: number };
  displaySize: number;
  motion: UnitMotionState;
  stackCount: number;
  isLeadUnit: boolean;
  renderMode: 'dom-sprite' | 'canvas-sprite' | 'canvas-glyph';
}
```

These objects are renderer inputs only. They must not mutate gameplay state.

### 2. Civilization-Specific Architecture Era

City architecture must not use global `state.era`. The global era advances when any civilization crosses the advancement threshold, so using it would visually modernize civilizations that have not researched the relevant technology.

Architecture era is derived per civilization from its completed city-maturity technologies:

1. Inspect the owner's completed technologies.
2. Keep technologies accepted by `isCityMaturityTech(...)`.
3. Use the highest technology era represented, clamped to the supported city-art range.
4. Fall back to era 1.

All cities owned by that civilization share the architecture language. This lets a recently founded city look culturally and technologically current without pretending it already has a large population.

The architecture family uses the owner's existing civilization-to-faction art mapping where available (`imperials`, `vikings`, `pharaohs`, `hellenes`, `khanate`, or `shogunate`) with a generic fallback. The family controls recognizable rooflines, materials, and ornament; owner color remains the strongest allegiance cue. A captured city adopts its current owner's abstract map style rather than adding founder-culture save state.

### 3. Population Controls Settlement Mass

Population controls the amount of settlement visible in the diorama. It is intentionally independent from architectural era.

The presentation reuses the population thresholds in `CITY_MATURITY_DEFINITIONS`:

| Population | Presentation tier |
|---:|---|
| 1-2 | outpost |
| 3-4 | village |
| 5-7 | town |
| 8-11 | city |
| 12+ | metropolis |

The renderer must read these thresholds from the canonical definitions rather than duplicating magic numbers.

`City.maturity` remains the gameplay maturity value, which combines population and technology. The map presentation uses the same tier names but derives visual mass from population alone so era and physical size remain independently legible.

### 4. Building Specializations

Completed ordinary buildings affect the city through category accents. They never appear as full-size building art on the strategic map.

Specialization ranking is deterministic:

1. Group completed building IDs by `Building.category`.
2. Ignore missing definitions and uncategorized buildings.
3. Rank categories by completed-building count.
4. Break count ties by summed production cost, representing greater investment.
5. Break remaining ties with this fixed category order stored beside the helper: military, food, production, economy, science, culture, espionage.
6. Return at most two categories with at least one completed building.

The two accents are integrated into the city footprint. Examples include fields or granary forms for food, walls or standards for military, workshops or chimneys for production, market awnings for economy, towers or domes for science, civic ornament for culture, and a restrained signal/shadow motif for espionage.

Specializations are clues, not exhaustive inventories. The city panel remains the complete building catalog.

### 5. Special Cities

Special-city identity modifies the diorama without creating another map entity.

#### Capitals

Use a shared helper to resolve the first extant, correctly owned city in a civilization's `cities` array. Do not add `City.isCapital` save state solely for rendering.

Capital identity is shown with a small integrated standard, finial, or crown treatment. It does not add a second label.

#### Breakaway capitals

While the city remains owned by the breakaway civilization, `BreakawayMetadata.originCityId` is its capital identity. This remains stable even if the breakaway later acquires more cities.

Breakaway identity uses a distinct flag/roofline treatment plus the existing viewer-safe status badge. The current behavior that marks every breakaway-owned city as though it were the capital must not continue.

#### Legendary-wonder cities

`getLegendaryWonderMapEntries(...)` remains the viewer-safe source of wonder presentation.

A city displays one primary wonder silhouette integrated behind or above its skyline. If multiple viewer-visible wonders belong to the city, use the existing deterministic entry order to choose the primary and show a compact count badge. All wonders remain inspectable through the city/wonder UI.

This one-primary-wonder rule intentionally replaces an unbounded collection of large landmark objects on a single city hex.

### 6. Minor Civilizations

Minor civilizations use a smaller fixed settlement family keyed by their existing archetype:

- militaristic
- mercantile
- cultural

They retain owner color and archetype readability, but they do not use the complete major-civilization specialization system. This prevents minor-city art from implying production and technology systems they do not possess.

### 7. City Renderer Ownership

Cities remain owned by the Canvas city renderer and its explicit pass pipeline.

The existing base and icon passes become a bounded city-diorama pass. The rest of the pipeline remains explicit:

1. diorama and ownership treatment
2. primary legendary-wonder silhouette
3. compact city banner
4. status badge
5. production badge
6. idle-production badge

Pass helpers receive prepared viewer-safe data. They do not query broad game state, load assets, read DOM layout, or mutate state.

`buildBuildingEntities(...)` and building-kind use in `SpriteOverlay` are removed from the live strategic-map path. Existing full-size building sprites may still be used in city panels, production previews, catalogs, or other close-up UI.

### 8. Fog And Last-Seen Cities

Fogged last-seen city snapshots currently provide name, population, owner, and position, not a complete historical record of buildings, owner technology, status, or wonders.

Therefore a last-seen city renders:

- owner color from the snapshot owner when available
- settlement mass derived from snapshotted population
- a generic architecture silhouette
- the compact last-seen name/population banner

It does not render live specializations, production, unrest, occupation, breakaway status, or live wonder changes. No save migration is required.

### 9. Level Of Detail

Map zoom controls detail, not entity scale relationships.

- Low zoom: owner-colored city silhouette, lead unit silhouette/glyph, and essential count/status marks only.
- Medium zoom: architecture era, population mass, one strongest specialization, and primary special-city treatment.
- High zoom: both specializations, restrained animation, health/production details, and compact secondary badges.

Crossing an LOD threshold may simplify art, but the city and unit bounding boxes remain stable enough that objects do not appear to jump or shrink.

## Canonical Unit Presentation

### High-Zoom DOM Path

At high zoom with motion enabled, a v2-capable unit remains in the DOM sprite overlay for its entire visible lifetime, including movement:

- retain the same pooled DOM node
- update its world position from the movement interpolation each frame
- set `data-state="walk"` during movement and return to `idle` afterward
- keep one canonical display box and anchor throughout
- do not exclude the moving unit from overlay entities and redraw it through Canvas

This removes the current mid-action ownership transfer that causes scale and anchor discontinuities.

### Canvas Fallback Path

Canvas remains the complete fallback for low zoom, reduced motion, missing v2 sprites, unsupported owners, and test environments.

Canvas and DOM use the same layout helper for:

- world anchor
- unstacked display size
- stack treatment
- role marker position
- health bar position
- wrap-copy coordinates

The approximate normal display size is `0.9 * camera.hexSize`, which is about half the width of a pointy-top hex. The implementation may tune the exact constant during visual verification, but there must be one shared constant and test contract.

### Stack Contract

- The first visible unit is the full-size lead unit.
- Up to two restrained offset silhouettes may communicate depth.
- A compact badge communicates total stack count.
- Neither the lead unit nor every unit in the stack is scaled down because `stackCount > 1`.
- Selection and combat targeting continue to operate on canonical unit IDs, not decorative stack silhouettes.

### Overlay State Contract

`SpriteOverlay.getActiveIds()` must describe sprites actually visible through the overlay in the current frame.

- If LOD or reduced-motion logic hides the overlay, active IDs are cleared so Canvas fallbacks render.
- A pinch may defer pool mutation while visible pooled sprites remain active, but it must not strand hidden IDs.
- Missing sprite lookup results never enter active IDs.
- Deleted, captured, hidden, embarked, unloaded, or no-longer-visible units are culled.
- Completing or interrupting movement returns immediately to the authoritative unit position and normal scale.

There is no persistent "small", "moving", or fallback visual mode in gameplay state.

## Terrain Improvements

Improvement rendering belongs in the Canvas terrain pass or a dedicated Canvas subpass immediately above base terrain.

Each improvement has a low-profile terrain treatment:

- farm: field rows, plots, or crop bands
- mine/quarry: exposed rock cuts, spoil piles, or worked faces
- pasture: fence lines and grazing marks
- plantation: ordered crop rows or orchard geometry
- lumber camp: cut logs, stumps, or managed tree rows
- camp: tents, traps, or a small fire mark
- watermill: a bank-side wheel aligned to adjacent water where possible

Improvement treatments must remain visually subordinate to resource icons and entities. They carry no baked building label.

The prior plan to render improvements as generic full-size `SpriteOverlay` entities is superseded.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| City has no dominant specialization | Complete the first military building | The existing city diorama gains a restrained military accent without adding another object or label |
| City shows military and food accents | Complete enough economy buildings to outrank food | The same footprint rerenders with military and economy accents; the city panel still lists every building |
| Population crosses a canonical threshold | Process city growth | The settlement gains mass appropriate to the next population tier without changing its civilization architecture era |
| Civilization completes a qualifying later-era city technology | Complete research | All currently visible cities of that civilization use the later architecture language; city footprint still follows each city's population |
| Unit is idle | Move the unit along a path | The same-size unit moves smoothly and uses walking motion; it does not disappear, duplicate, or shrink |
| Unit finishes or movement is interrupted | Animation completes, visibility changes, or state reloads | One normally sized unit appears at the authoritative position |
| One unit joins another on a hex | Complete movement into the stack | The lead unit remains normal size and a stack count appears |
| Worker completes a farm | Complete worker action | The hex gains field treatment beneath entities; no tree-like full-size marker or text label appears |
| Visible city becomes fogged | Move vision away | Only last-seen-safe city presentation remains; live specializations and status changes are not revealed |

## Misleading Presentation Risks

- A category is not a specialization unless the city has at least one completed categorized building in it.
- Production queue items do not count as completed specialization buildings.
- Global era must not modernize every civilization's architecture.
- High population must not imply advanced architecture without owner technology.
- Advanced technology must not imply a metropolis when population is low.
- A breakaway-owned city is not automatically the breakaway capital.
- A fogged city must not reveal live building completion, wonder completion, production, or unrest.
- A full-size recent-building sprite must not survive beside the new city diorama.
- An overlay ID must not suppress Canvas fallback when its DOM sprite is hidden or absent.
- A stack must not communicate quantity by making the military piece harder to see.

## Performance And Distribution

- Use the shared web/Tauri renderer path with no platform branching.
- Do not add per-frame network, storage, DOM measurement, or asset-generation work.
- Resolve definitions through indexed maps or prepared lookups rather than repeated full catalog scans for every pass where practical.
- Keep city presentation helpers pure and deterministic so their results may be memoized later if profiling justifies it.
- Reuse existing sprite caches and viewer-safe wonder helpers.
- Do not add persistent caches unless profiling demonstrates a need and invalidation is explicit.

## Testing Requirements

### City presentation

- owner-specific architecture era does not follow a more advanced rival or global `state.era`
- population thresholds produce all five visual tiers
- architecture era and population tier vary independently
- specialization ranking uses completed categorized buildings only
- specialization ties resolve deterministically
- no more than two specializations are returned
- capital helper skips missing or incorrectly owned city IDs
- breakaway capital uses `originCityId`, not every city owned by the breakaway
- multiple wonders produce one primary landmark plus the correct count
- minor civilizations use archetype presentation
- fogged last-seen cities do not receive live specializations, statuses, or wonder changes

### City rendering

- completing a building changes the existing city composition without adding a building overlay entity
- city footprint remains within the configured bounds at supported zoom levels
- compact banner contains city name and population once
- city pass ordering preserves landmarks, labels, statuses, production, idle state, and wrap copies
- low, medium, and high LODs expose only their permitted details

### Unit presentation

- idle and moving presentations use the same display size and anchor
- high-zoom movement retains one DOM node and switches motion state without Canvas duplication
- movement completion and interruption leave one normal-size unit at authoritative state position
- entering or leaving a stack does not change lead-unit size
- stack count remains correct for more than three units
- low zoom and reduced motion clear overlay ownership and visibly render Canvas fallback
- missing v2 sprite lookup uses Canvas without disappearing
- fog, forest concealment, wrap ghosts, transports, loading, and unloading preserve visibility rules
- selection, health, fortified, and role markers remain attached to the canonical layout

### Improvements

- every supported improvement has a terrain treatment
- farm presentation is visually distinct from forest/tree markers
- improvements remain beneath units, cities, fog, and interaction highlights
- no improvement adds a full-size overlay entity or embedded label

### Manual visual replay

At minimum, verify on desktop and a mobile-sized viewport:

1. found a city, grow through multiple population thresholds, and complete buildings in at least three categories
2. compare a newly founded technologically advanced city with an older populous low-tech rival city
3. move single units, stacked units, transports, and unloaded cargo at low and high zoom
4. interrupt or complete movement, pan, pinch, toggle reduced motion, and reload a saved game
5. complete a building while the city is visible and confirm the map becomes more informative, not busier
6. build farms and other improvements and confirm they read as worked land
7. inspect a capital, breakaway capital, minor city, and multi-wonder city

## Likely Implementation Boundaries

Expected areas include:

- `src/renderer/city-renderer.ts`
- `src/renderer/city-render-passes.ts`
- a small city presentation helper under `src/renderer/` or `src/systems/`
- `src/renderer/render-loop.ts`
- `src/renderer/unit-renderer.ts`
- `src/renderer/unit-movement-animation.ts`
- `src/renderer/sprite-overlay.ts`
- `src/renderer/hex-renderer.ts` or a dedicated improvement subpass
- mirrored renderer tests

The implementation plan should divide this into reviewable slices. City composition, canonical unit rendering, and terrain-integrated improvements are distinct behavioral areas and should not be forced into one oversized merge request.

## Non-Goals

- no gameplay balance changes
- no changes to city production, building availability, yields, or upkeep
- no changes to unit movement cost, stacking rules, combat, transport capacity, or embarkation rules
- no new city-grid or district placement mechanic
- no per-building strategic-map placement
- no save-format migration solely for visual presentation
- no replacement of the Canvas renderer with WebGL
- no removal of detailed building art from city panels and catalogs
- no change to the full catalog of actions available to the player

## Acceptance Criteria

- Completing an ordinary building never adds another independent strategic-map building object or label.
- Each city is one bounded, era-aware, population-scaled diorama with at most two specialization accents.
- Capitals, legendary-wonder cities, breakaway capitals, and minor cities are visually distinct within the same footprint budget.
- Fogged city presentation does not leak live information.
- Units remain approximately half-hex pieces and do not change scale because of movement, renderer fallback, stack membership, LOD, pinch, or animation completion.
- High-zoom moving units remain on the same DOM presentation path; Canvas fallback uses the same layout metrics.
- Improvements read as worked terrain and never as full-size labeled buildings.
- No new persisted gameplay state or save migration is introduced.
- Existing city pass, wonder visibility, wrap, fog, selection, transport, and unit concealment behavior remains covered.
- Targeted tests, source-rule checks, build, and full tests pass before the implementation is reported complete.
