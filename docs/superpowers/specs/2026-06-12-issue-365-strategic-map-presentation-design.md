# Issue 365 Strategic Map Presentation Design

**Date:** 2026-06-12
**Status:** Revised after architecture review; awaiting final approval
**Issue:** [#365](https://github.com/a1flecke/conquestoria/issues/365)
**Supersedes in part:** `2026-06-06-sprite-overlay-renderer-design.md` for ordinary building and improvement map entities; `2026-05-26-stage-2g-legendary-city-landmarks-design.md` for the strategic-map multi-wonder ring only
**Builds on:** `2026-06-04-stage-2k-city-renderer-layer-architecture-design.md`

## Purpose

Issue 365 is not one isolated sprite-size bug. The screenshots show a strategic-map presentation model that has lost a consistent visual hierarchy:

- completed buildings appear as full-size independent objects on the city hex
- embedded building labels overlap terrain, city labels, and other map information
- building completion makes the map progressively busier instead of making the city feel more developed
- some improvements, especially farms, read as unrelated icons rather than changes to the land
- stationary units, moving units, fallback units, and stacked units can use different render paths and different scales
- a unit can shrink during movement or remain in the smaller fallback presentation afterward

The implementation has four distinct root causes that must be corrected together:

1. ordinary buildings are modeled as independent strategic-map sprite entities even though gameplay stores them inside a city
2. DOM unit sprites and Canvas unit sprites use different bounding boxes, anchors, and stack scaling
3. overlay ownership can become stale when LOD, reduced motion, movement, or missing sprites switch the active renderer
4. terrain labels, building labels, city labels, landmarks, and status badges have no shared visual budget

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
- High-zoom idle units may use the DOM overlay, but movement remains in the fog-safe Canvas path and uses the exact same layout metrics.

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
  memberIds: string[];
  leadUnitId: string;
  coord: HexCoord;
  displaySize: number;
  stackCount: number;
  renderMode: 'dom-sprite' | 'canvas-sprite' | 'canvas-glyph';
}
```

These objects are renderer inputs only. They must not mutate gameplay state.

### 2. Canonical Civilization Era

City architecture must not use global `state.era`. The global era advances when any civilization crosses the advancement threshold, so using it would visually modernize civilizations that have not researched the relevant technology.

Add one canonical `resolveCivilizationEra(completedTechIds)` helper beside the technology advancement definitions. It must use the same advancement rule as the game:

1. Begin at era 1.
2. For each later era in order, read `getEraAdvancementTechs(era)`.
3. Advance only when the civilization has completed at least 60 percent of those technologies.
4. Stop at the first unmet era so progression remains contiguous.
5. Ignore technologies with `countsForEraAdvancement: false`.
6. Clamp the result to the supported art range.

`checkEraAdvancement(...)` must delegate its per-civilization threshold decision to this helper rather than retaining a second copy of the 60-percent rule. Global era remains the maximum era reached by any civilization under the existing turn-flow behavior; city art reads the owning civilization's resolved era.

All cities owned by that civilization share the architecture language. This lets a recently founded city look culturally and technologically current without pretending it already has a large population, while preventing one isolated technology from modernizing the entire skyline.

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

Add one canonical capital helper that preserves the game's existing rule exactly: the capital ID is `civilization.cities[0]`, or no capital when the list is empty. If that ID is missing or violates the ownership invariant, gameplay and presentation return no usable capital rather than silently promoting a later city. Migrate capital-sensitive gameplay and renderer callers to the helper in the same implementation slice so the map cannot disagree with unrest, espionage, or unit-return behavior. Do not add `City.isCapital` save state solely for rendering.

Capital identity is shown with a small integrated standard, finial, or crown treatment. It does not add a second label.

#### Breakaway capitals

While the city remains owned by the breakaway civilization, `BreakawayMetadata.originCityId` is its capital identity. This remains stable even if the breakaway later acquires more cities.

Breakaway identity uses a distinct flag/roofline treatment plus the existing viewer-safe status badge. The current behavior that marks every breakaway-owned city as though it were the capital must not continue.

#### Legendary-wonder cities

`getLegendaryWonderMapEntries(...)` remains the viewer-safe source of wonder presentation.

A city has one integrated strategic-map wonder slot:

1. An owned active construction ghost at or above the existing 60-percent map threshold has priority.
2. Otherwise, show the completed entry with the greatest viewer-safe `turnCompleted`, breaking ties by wonder ID. For owned wonders this is completion time; for known rivals it remains the map helper's privacy-safe learned time.
3. Known-rival entries can show completed wonders only; they never show construction ghosts.
4. When additional completed wonders exist, show a compact `+N` count attached to the wonder slot.
5. Every completed and active wonder remains listed in the city panel, Codex, and existing inspection surfaces.

This rule intentionally supersedes Stage 2G's strategic-map six-slot medallion ring and five-turn rotation. It does not remove Stage 2G metadata, bespoke wonder art, construction thresholds, viewer-intel rules, panel/Codex previews, or complete textual lists. Existing slot tests must be replaced or narrowed to any remaining non-map consumers; strategic-map regressions must assert one primary slot plus the correct overflow count.

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

### 8. Hard City Visual Budget

The 75-percent footprint limit applies to the complete city composition, including its integrated wonder and specialization art. It does not apply only to the base building.

The city has these fixed presentation regions:

- **center silhouette:** population mass and architecture family/era
- **silhouette accents:** at most two specializations, expressed as materials or attached forms rather than separate icons
- **skyline identity:** at most one of breakaway-capital treatment or ordinary-capital treatment; breakaway wins
- **wonder slot:** at most one primary wonder or construction ghost, with an attached `+N` count when needed
- **northeast badge:** at most one critical status, preserving breakaway/occupation/unrest priority
- **northwest activity badge:** production when a queue exists, otherwise idle production; these states are mutually exclusive
- **banner zone:** one owner-colored name/population banner below the silhouette

No other map label or badge may be added without assigning it to one of these regions and proving it does not overlap every supported population tier, zoom tier, and long-name fixture. Capital identity, wonder identity, and specialization must not each add independent orbiting objects.

### 9. Fog And Last-Seen Cities

Fogged last-seen city snapshots currently provide name, population, owner, and position, not a complete historical record of buildings, owner technology, status, or wonders.

Therefore a last-seen city renders:

- owner color from the snapshot owner when available
- settlement mass derived from snapshotted population
- a generic architecture silhouette
- the compact last-seen name/population banner

It does not render live specializations, production, unrest, occupation, breakaway status, or live wonder changes. No save migration is required.

### 10. Terrain Labels And Contrast

Terrain labels are supporting information and must not render through higher-priority map objects. The render loop prepares a viewer-safe set of coordinates where terrain labels are suppressed.

Suppress a terrain label when the presented tile contains any of the following:

- a live or last-seen city
- a visible, non-transported unit stack
- a completed or under-construction improvement
- a visible resource icon
- a natural wonder
- a tribal village or beast lair marker

This suppression affects labels only, not terrain art or inspection. It must use the same live/last-seen presentation data as the tile renderer so it cannot leak hidden units, resources, cities, or improvements.

The city banner uses a solid or strongly translucent owner-colored backplate, a contrasting border, and measured text. Population is always preserved. Long names truncate with an ellipsis to the available width; the full name remains in city inspection.

### 11. Level Of Detail

Map zoom controls detail, not entity scale relationships.

- Low zoom: owner-colored city silhouette, lead unit silhouette/glyph, and essential count/status marks only.
- Medium zoom: architecture era, population mass, one strongest specialization, and primary special-city treatment.
- High zoom: both specializations, restrained animation, health/production details, and compact secondary badges.

Crossing an LOD threshold may simplify internal detail, but it does not select a different world-size constant. At a fixed camera transform, switching renderer or LOD mode may shift a unit center by no more than 0.5 CSS pixels and its bounds by no more than 2 percent. City simplification remains inside the same configured footprint and banner regions. Tests compare normalized world bounds rather than screenshots taken at different zoom values.

## Canonical Unit Presentation

### Shared Unit Layout Contract

Add one pure `getUnitLayoutMetrics(hexSize)` helper used by both renderers. It returns the world-space display rectangle, center anchor, depth offsets, count-badge anchor, role-marker anchor, selection ring, fortified marker, and health-bar rectangle. The normal lead-unit display size is fixed at `0.9 * hexSize`; stack membership and renderer choice never modify it.

The DOM wrapper bounds and Canvas destination rectangle must be derived from these exact metrics. Unit rendering must no longer use `SPRITE_OVERLAY_WORLD_SIZE_FACTOR = 2` or any independent scale constant. At a fixed camera and zoom, the two paths must agree within 0.5 CSS pixels for center and bounds. If visual tuning changes the constant, it changes once in this helper and its tests.

### Prepared Static Stack Presentations

The render loop prepares one viewer-safe `UnitMapPresentation` per visible static stack, rather than one independent DOM entity for every member on the same hex. Transported cargo, concealed or hidden units, and units currently participating in movement interpolation are excluded before grouping.

Lead selection is deterministic and preserves gameplay meaning:

1. For a player-owned stack, use the selected unit when it belongs to the stack.
2. Otherwise, use the first unit from the existing stack-picker readiness ordering.
3. For a hostile stack, use `selectDefenderForAttack(...)`, the same choice combat would target.
4. For any relationship without an applicable gameplay ordering, fall back to stable unit ID order.

The lead renders at normal size. Up to two restrained offset silhouettes communicate depth, and one compact badge communicates total count. The presentation carries every `memberId`, and tapping the piece or badge opens the existing stack picker so every member remains reachable. Selection and combat continue to act on canonical unit IDs, never decorative silhouettes.

When one DOM element represents a stack, overlay ownership covers all of its `memberIds` only after that element is successfully created and visible. Canvas skips that prepared stack only when the overlay confirms ownership of all presented members.

### Fog-Safe Canvas Movement

Movement interpolation remains in the Canvas unit pass, below the existing Canvas fog pass. A moving unit has no DOM map node and is excluded from both origin and authoritative-destination static stack presentations until movement completes. This prevents the state mutation to the final coordinate from creating a duplicate or prematurely changing the destination stack.

The movement renderer uses the same unit visual resolver, sprite ownership rules, `getUnitLayoutMetrics(...)`, role/status anchors, and wrap-aware `renderPath` coordinates as the idle renderer. It changes position and optional walk-frame state only; it never changes the piece's display bounds. `animateUnitSlide(...)` follows this contract. `animateUnitAppear(...)` may add a transient effect for unloading, but it must not render a second persistent piece.

On completion, interruption, deletion, capture, loading into a transport, unloading, loss of visibility, or state reload, animation presentation is discarded and the next frame is derived from authoritative state. There is no persistent movement-scale flag in gameplay or save data.

### Unit Status Decoration

High-zoom DOM rendering must preserve the player information currently supplied by Canvas: selected state, health, fortified state, role marker, and stack count. DOM and Canvas may style those marks differently, but both use the normalized anchors from `getUnitLayoutMetrics(...)` and expose equivalent information. Decorative wounds or animation frames do not replace the numeric health bar.

### Overlay State Contract

`SpriteOverlay.getActiveIds()` must describe sprites actually visible through the overlay in the current frame.

- If LOD or reduced-motion logic hides the overlay, active IDs are cleared so Canvas fallbacks render.
- A pinch may defer pool mutation only while the overlay container and retained pooled sprites remain visible; otherwise active IDs are cleared.
- Missing sprite lookup results never enter active IDs.
- Deleted, captured, hidden, embarked, unloaded, or no-longer-visible units are culled.
- A stack ID becomes active only after its visible DOM element has been updated successfully for that frame.
- Completing or interrupting movement returns immediately to an authoritative static stack presentation at normal scale.

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

## Art Production Strategy

The city system is compositional rather than a cross-product of bespoke city images. Runtime Canvas drawing combines:

- five population layouts controlling mass and number of structures
- five era profiles controlling materials, rooflines, and silhouette complexity
- a small civilization-family style catalog with a deliberate generic fallback
- reusable specialization accents for military, food, production, economy, science, culture, and espionage
- the existing bespoke legendary-wonder art in the single wonder slot

The first implementation plan must inventory civilization types and map each one to a tested visual-family token in a shared catalog. Rendering code must not keep an unrelated private civilization-to-faction mapping in `render-loop.ts`. Missing catalog entries use the explicit generic family and fail a catalog-coverage test rather than silently producing an undefined style.

Population layouts, era profiles, and accents are deterministic vector primitives or reusable small assets. They are not generated per frame and do not use randomness. Existing full-size building sprites remain available for panels and previews but are not scaled down and piled onto the strategic map.

Before producing every family treatment, visually validate two contrasting families across all five eras and population tiers. That checkpoint confirms the compositional grammar remains readable before catalog completion.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| City has no dominant specialization | Complete the first military building | The existing city diorama gains a restrained military accent without adding another object or label |
| City shows military and food accents | Complete enough economy buildings to outrank food | The same footprint rerenders with military and economy accents; the city panel still lists every building |
| Population crosses a canonical threshold | Process city growth | The settlement gains mass appropriate to the next population tier without changing its civilization architecture era |
| Civilization crosses the canonical later-era technology threshold | Complete qualifying research | All currently visible cities of that civilization use the later architecture language; city footprint still follows each city's population |
| Unit is idle | Move the unit along a path | The same-size unit moves smoothly below fog through the Canvas movement pass; it does not disappear, duplicate, leak visibility, or shrink |
| Unit finishes or movement is interrupted | Animation completes, visibility changes, or state reloads | One normally sized unit appears at the authoritative position |
| One unit joins another on a hex | Complete movement into the stack | The lead unit remains normal size and a stack count appears |
| Player selects another member of a friendly stack | Change stack selection | The selected member becomes the normal-size lead without changing stack bounds or hiding the other members from the picker |
| Worker completes a farm | Complete worker action | The hex gains field treatment beneath entities; no tree-like full-size marker or text label appears |
| City has several completed legendary wonders | Complete or inspect another wonder | The deterministic primary wonder and `+N` count update; all wonders remain available in the city panel, Codex, and inspection surfaces |
| A labeled terrain tile gains a visible city, unit, resource, improvement, wonder, village, or lair | Render the occupied tile | The terrain label is suppressed while terrain art and inspection remain available |
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
- A moving unit must not move into a DOM layer above Canvas fog.
- A terrain label must not render through a city, unit, resource, improvement, wonder, village, or lair.
- A renderer-only capital inference must not disagree with `civilization.cities[0]` gameplay behavior.

## Performance And Distribution

- Use the shared web/Tauri renderer path with no platform branching.
- Do not add per-frame network, storage, DOM measurement, or asset-generation work.
- Resolve definitions through indexed maps or prepared lookups rather than repeated full catalog scans for every pass where practical.
- Keep city presentation helpers pure and deterministic so their results may be memoized later if profiling justifies it.
- Reuse existing sprite caches and viewer-safe wonder helpers.
- Do not add persistent caches unless profiling demonstrates a need and invalidation is explicit.

## Testing Requirements

### City presentation

- civilization architecture advances at the same contiguous 60-percent qualifying-tech threshold as canonical era advancement
- a civilization below that threshold does not advance, and technologies with `countsForEraAdvancement: false` do not contribute
- owner-specific architecture era does not follow a more advanced rival or global `state.era`
- population thresholds produce all five visual tiers
- architecture era and population tier vary independently
- specialization ranking uses completed categorized buildings only
- specialization ties resolve deterministically
- no more than two specializations are returned
- capital helper returns exactly the valid city at `civilization.cities[0]`; an empty, missing, or incorrectly owned first ID returns no capital and never promotes a later city
- gameplay and renderer callers agree on capital identity after founding, capture, transfer, and razing
- breakaway capital uses `originCityId`, not every city owned by the breakaway
- wonder priority is active owned construction at or above 60 percent, then greatest viewer-safe `turnCompleted` with ID tie-break
- known rivals never receive construction ghosts, and multiple wonders produce one primary landmark plus the correct completed-wonder count
- every wonder remains reachable through the city panel, Codex, and inspection surfaces after the map ring is removed
- minor civilizations use archetype presentation
- fogged last-seen cities do not receive live specializations, statuses, or wonder changes

### City rendering

- completing a building changes the existing city composition without adding a building overlay entity
- city footprint remains within the configured bounds at supported zoom levels, including a long-name city with capital/breakaway identity, two specializations, wonder overflow, critical status, and production or idle state
- compact banner contains city name and population once
- city pass ordering preserves landmarks, labels, statuses, production, idle state, and wrap copies
- low, medium, and high LODs expose only their permitted details
- production and idle badges are mutually exclusive, and breakaway-capital treatment wins the single skyline-identity region
- terrain labels are suppressed for every specified presented object and remain visible on an otherwise empty equivalent tile
- label suppression uses viewer-safe live or last-seen data and does not reveal a hidden object

### Unit presentation

- DOM and Canvas derive numerically identical center and bounds from `getUnitLayoutMetrics(...)` within the specified tolerance
- idle and moving presentations use the same display size, anchor, and normalized status positions
- moving units render only in the Canvas movement pass below fog and are absent from origin and destination static stacks until completion
- movement completion and interruption leave one normal-size unit at authoritative state position
- entering or leaving a stack does not change lead-unit size
- stack count remains correct for more than three units
- friendly selected-unit lead, friendly readiness fallback, hostile combat-defender lead, and stable neutral fallback match their canonical orderings
- one DOM stack presentation owns every member ID only while visible, and the existing stack picker can still reach every member
- low zoom and reduced motion clear overlay ownership and visibly render Canvas fallback
- missing v2 sprite lookup, hidden overlay container, deferred pinch, and failed element creation never leave stale active IDs
- fog, forest concealment, wrap ghosts, transports, loading, unloading, deletion, capture, and state reload preserve visibility and authoritative-position rules
- selection, health, fortified, and role markers remain attached to the canonical layout
- moving across a wrap boundary follows the existing wrap-aware render path without a size or center discontinuity

### Improvements

- every supported improvement has a terrain treatment
- farm presentation is visually distinct from forest/tree markers
- improvements remain beneath units, cities, fog, and interaction highlights
- no improvement adds a full-size overlay entity or embedded label

### Saved-game and browser regression

Add a deterministic saved-game fixture representing the reported crowded state: a visible city, recently completed building, multi-wonder pressure, overlapping map labels, nearby unit stack, and a unit whose movement has just started or completed. Seed it through the existing `conquestoria-autosave` local-storage key and load it through the real Continue flow.

The Playwright regression runs at desktop and mobile-sized viewports with animations and time made deterministic. It must:

1. load the fixture through Continue rather than constructing renderer helpers in isolation
2. capture reviewed screenshots for the crowded city before and after building completion
3. assert the live strategic map contains no building-overlay children and no building sprite labels
4. measure the high-zoom idle DOM unit bounds
5. trigger movement and use renderer test instrumentation or a pure layout assertion to prove the Canvas movement rectangle matches those bounds
6. verify terrain text does not paint through occupied tiles while an empty control tile remains labeled
7. repeat the scale and fallback assertions with reduced motion enabled

The fixture is checked into `tests/fixtures/` and contains only deterministic, migration-valid game data. Screenshot baselines are reviewed as product evidence, not used as the sole proof of geometry or information privacy.

### Manual visual replay

At minimum, verify on desktop and a mobile-sized viewport:

1. found a city, grow through multiple population thresholds, and complete buildings in at least three categories
2. compare a newly founded technologically advanced city with an older populous low-tech rival city
3. move single units, stacked units, transports, and unloaded cargo at low and high zoom
4. interrupt or complete movement, pan, pinch, toggle reduced motion, and reload a saved game
5. complete a building while the city is visible and confirm the map becomes more informative, not busier
6. build farms and other improvements and confirm they read as worked land
7. inspect a capital, breakaway capital, minor city, and multi-wonder city
8. select different members of a friendly stack and initiate combat against a hostile stack; confirm the visible lead agrees with the picker and defender target
9. replay both reported crowded-map scenarios from the deterministic fixture and confirm no independent building, terrain label, or duplicate text competes with the city composition

### Required implementation verification

- run source-rule checks for every changed `src/` file
- run all mirrored renderer, system, UI, save-fixture, and Playwright tests identified by the final implementation plan
- run `./scripts/run-wonder-regressions.sh` when changing the strategic-map wonder presentation
- run `./scripts/run-with-mise.sh yarn test:web-smoke`
- run `./scripts/run-with-mise.sh yarn build`
- run `./scripts/run-with-mise.sh yarn test`
- inspect both `origin/main...HEAD` and uncommitted diffs before completion

## Likely Implementation Boundaries

Expected areas include:

- `src/systems/tech-definitions.ts` or a nearby canonical civilization-era helper
- `src/systems/minor-civ-system.ts` to delegate global era checks to that helper
- the existing capital-sensitive system, AI, and UI callers migrated to one preserving helper
- `src/renderer/city-renderer.ts`
- `src/renderer/city-render-passes.ts`
- a small city presentation helper under `src/renderer/` or `src/systems/`
- `src/renderer/render-loop.ts`
- `src/renderer/unit-renderer.ts`
- `src/renderer/unit-movement-animation.ts`
- `src/renderer/sprite-overlay.ts`
- `src/renderer/hex-renderer.ts` or a dedicated improvement subpass
- `src/input/unit-stack-selection.ts` only if needed to expose, not duplicate, its canonical ordering
- mirrored renderer/system/UI tests and a deterministic browser fixture

The implementation plan should divide this into reviewable slices:

1. **Renderer invariants:** shared unit metrics, prepared stack presentations, fog-safe Canvas movement, truthful overlay IDs, removal of live building overlay entities, and terrain-label suppression.
2. **City truth and composition:** canonical civilization-era and capital helpers, fixed city regions, specialization ranking, special-city treatments, and the one-slot wonder rule.
3. **Terrain and visual completion:** integrated improvement treatments, civilization-family catalog completion, saved-game Playwright screenshots, and final mobile/reduced-motion polish.

Each slice must leave the live renderer coherent. No intermediate slice may keep duplicate city/building rendering, hide stack members, fork capital or era semantics, or remove a complete wonder/action catalog before its replacement inspection surface is verified.

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
- no change to the gameplay meaning of capital order or era advancement thresholds

## Acceptance Criteria

- Completing an ordinary building never adds another independent strategic-map building object or label.
- Each city is one bounded, era-aware, population-scaled diorama with at most two specialization accents.
- Capitals, legendary-wonder cities, breakaway capitals, and minor cities are visually distinct within the same footprint budget.
- A city renders no more than the fixed regional budget: one center silhouette, two specialization accents, one skyline identity, one wonder slot with optional `+N`, one critical badge, one activity badge, and one compact banner.
- Fogged city presentation does not leak live information.
- Units remain approximately half-hex pieces and do not change scale because of movement, renderer fallback, stack membership, LOD, pinch, or animation completion.
- High-zoom idle units may use the DOM overlay; moving units use the Canvas pass below fog with the exact same layout metrics and no static duplicate.
- Friendly and hostile stack leads reflect selection/readiness and combat-defender ordering while every member remains reachable.
- Improvements read as worked terrain and never as full-size labeled buildings.
- Terrain labels do not paint through higher-priority presented objects or leak hidden information.
- Civilization architecture and capital identity use canonical gameplay helpers rather than renderer-local approximations.
- A multi-wonder city shows one deterministic strategic-map landmark plus `+N`, while all wonder details remain reachable elsewhere.
- No new persisted gameplay state or save migration is introduced.
- Existing city pass, wonder visibility, wrap, fog, selection, transport, and unit concealment behavior remains covered.
- The deterministic saved-game Playwright regression covers the reported crowded-city and shrinking-unit failures at desktop, mobile, and reduced-motion settings.
- Targeted tests, wonder regressions, web smoke, source-rule checks, build, and full tests pass before the implementation is reported complete.
