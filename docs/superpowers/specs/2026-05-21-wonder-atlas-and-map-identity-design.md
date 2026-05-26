# Wonder Atlas And Map Identity Design

**Issue:** [#217 - Bug: legendary wonder ui off](https://github.com/a1flecke/conquestoria/issues/217)
**Date:** 2026-05-21

## Overview

Stage 1 of the wonder work made legendary wonder construction more visible from the city flow. Stage 2A makes wonders feel like a recognizable part of the world: discovered natural wonders get a visual identity on the map and in a global catalog, while legendary wonders get masked visual identity slots that set up later construction and completion spectacle.

This design is presentation-first. It does not change natural wonder placement, discovery rules, yields, legendary wonder eligibility, AI behavior, save format, or construction rules. It creates the shared visual and presentation foundations needed for later reveal moments, legendary ceremonies, Atlas expansion, and real video experiments.

---

## Goals

- Add a global **Wonder Atlas** where players can revisit discovered natural wonders and see masked legendary wonder slots from the normal game shell.
- Replace generic natural wonder map markers with distinctive, tile-integrated miniature landmarks.
- Give each natural wonder a medallion identity and short animated SVG/CSS vignette for the Atlas.
- Give each legendary wonder masked medallion metadata so the category feels intentional before Stage 2C spectacle.
- Keep all Atlas visibility viewer-safe for hot-seat and rival-intel scenarios.
- Keep the normal map usable: wonder art must not interfere with unit, city, selection, or tile inspection interactions.
- Respect reduced-motion preferences with static equivalents for vignettes and map animation.

## Non-Goals

- Stage 2A does not implement first-discovery reveal ceremonies.
- Stage 2A does not redesign legendary wonder construction, questing, race, completion, or reward rules.
- Stage 2A does not add real video assets.
- Stage 2A does not add full lore/history pages, filtering, rival records, or an empire legacy archive.
- Stage 2A does not reveal undiscovered natural wonder names, locations, counts, categories, or effects.
- Stage 2A does not add new natural wonders or alter existing natural wonder effects.

---

## Player Experience

The player gets a global **Wonder Atlas** entry point from the main game UI, added through the existing game shell rather than the city-scoped legendary wonder panel. The Atlas is a gameplay panel, not a marketing-style landing page. It should feel like a compact field journal that lets the player scan what they have discovered and inspect a wonder without leaving the strategy layer.

The first Stage 2A Atlas view includes:

- discovered natural wonders as vivid medallion entries
- undiscovered natural wonders omitted entirely
- legendary wonders as masked medallion slots

Selecting a discovered natural wonder opens a **Vignette Card** in the Atlas. The card shows:

- medallion identity
- animated SVG/CSS vignette
- human-readable wonder name
- discovered location
- yield or effect summary
- `View on map` action when the discovered coordinate can still be resolved

The vignette animation should be ambient and loopable. It is not a modal ceremony and should not block play.

On the map, discovered natural wonders render as tile-integrated miniature landmarks instead of a generic marker. Clicking or tapping a known wonder tile can deep-link into that Atlas entry, but only after normal unit, city, and tile-selection priorities are respected. Wonder deep-linking enriches tile inspection; it must not steal primary map controls.

Legendary wonders appear in Stage 2A as masked slots only. They should communicate that legendary wonders belong in the Atlas roadmap, but the rich construction and completion experience remains Stage 2C.

---

## UI And UX

The Atlas should be compact and scannable. It should use tabs or segmented filters for:

- `Known Natural`
- `Legendary`
- future `History` or `All` surfaces in Stage 2D

Natural wonder cards use the medallion as the primary visual anchor. A selected card expands into the animated vignette/detail area. Desktop may use a two-pane panel with catalog entries beside the selected detail. Mobile should use a stacked layout or selected-detail view that preserves reachability for every visible entry.

Unknown natural wonders must not appear as silhouettes or disabled cards. Hiding them entirely is required because showing silhouettes leaks count and category information. Legendary wonders may appear as masked slots because they are civilization-level aspirations rather than hidden map facts.

Map landmark art should remain readable at normal zoom and calm at low zoom. At close zoom, it can show miniature landmark shape and subtle ambient motion. At far zoom, it may simplify to a medallion-like marker or silhouette if the detailed landmark would become noisy. Labels should use existing hover, selection, or tile-inspection affordances instead of always-on map text.

UX requirements:

- Atlas is reachable globally, without selecting a city, through a styled touch-sized shell control with an accessible label/title.
- Every visible Atlas item is clickable or clearly disabled with a reason.
- Selecting an Atlas item updates the detail/vignette area immediately.
- `View on map` pans to or selects the correct discovered wonder tile without changing gameplay state.
- Reduced-motion users see static vignettes and non-animated map art.
- Atlas presentation never exposes undiscovered natural wonder names, locations, counts, categories, or effects.
- Closing and reopening the Atlas preserves ordinary game controls and does not leave map input in a special wonder mode.

---

## Architecture

The architecture uses shared definitions and viewer-safe presentation helpers, while keeping Canvas rendering, DOM rendering, and input handling in their own layers.

### Shared Visual Catalog

Add a shared visual catalog outside renderer internals. The default module path is:

```text
src/systems/wonder-visual-catalog.ts
```

The catalog defines presentation metadata used by both Canvas and DOM surfaces:

- wonder id
- wonder kind: natural or legendary
- medallion icon/emblem data
- palette tokens
- map landmark type
- vignette type
- animation capability
- reduced-motion fallback metadata
- masked placeholder metadata for legendary wonders

The visual catalog must not duplicate gameplay effects from `wonder-definitions` or legendary wonder definitions. Existing gameplay definitions remain authoritative for yields, requirements, construction, questing, and rewards.

The catalog should use typed drawing and vignette ids rather than storing large ad hoc HTML strings. Static SVG data may be generated from trusted catalog metadata, but game-generated names, locations, and effect text must still be inserted through DOM-safe text APIs.

### Viewer-Safe Atlas Presentation

Add a system-adjacent helper. The default module path is:

```text
src/systems/wonder-atlas-presentation.ts
```

This helper derives current-player Atlas entries from existing game state. It is responsible for viewer-safe masking:

- natural wonders are visible only when discovered by `state.currentPlayer`
- discovered natural wonders include safe static details such as name, known/discovered location, and effect summary
- undiscovered natural wonders are omitted, not greyed out
- legendary wonders appear as masked slots by default
- richer legendary state is included only when existing player-visible progress, eligibility, or earned intel allows it
- rival information is included only from viewer-scoped intel, never from raw live rival objects

UI panels should render Atlas entries from this helper instead of reading raw map or rival state directly.

For natural wonders, the helper should derive discovery from existing `wonderDiscoverers`/`discoveredWonders` state and resolve the matching wonder tile only to the extent needed to recover the discovered coordinate. It must not expose live terrain, unit, city, ownership, or rival activity from a tile that is outside the current player's current visibility. If a discovered wonder's coordinate cannot be resolved from existing state, the Atlas entry may show the wonder without `View on map`.

### Canvas Map Renderer

Add renderer-only helpers. The default module path is:

```text
src/renderer/wonders/natural-wonder-renderer.ts
```

This module draws tile-integrated natural wonder landmarks from:

- the tile presentation/snapshot already allowed by render visibility
- current-player render visibility context
- shared visual catalog metadata
- render time for ambient animation

The renderer must not decide discovery truth, eligibility, ownership truth, or Atlas visibility. It does not mutate game state. In fog or last-seen contexts, it must render only from the same viewer-safe tile presentation used by the rest of the map, not from richer live tile objects.

### Atlas UI

Add DOM UI modules. The default module paths are:

```text
src/ui/wonder-atlas-panel.ts
src/ui/wonder-vignette.ts
```

`wonder-atlas-panel.ts` owns the global Atlas panel, filters, entry list, selected detail state, and `View on map` callback wiring.

`wonder-vignette.ts` renders SVG/CSS vignette content for a selected Atlas entry. It consumes a viewer-safe Atlas entry plus visual catalog metadata. It should use DOM-safe APIs for dynamic text and avoid `innerHTML` for game-generated content.

The live game shell must delegate to `wonder-atlas-panel.ts` in the same implementation slice. A new Atlas module without a real shell entry point is incomplete.

### Map Deep-Link Intent

Wonder deep-link handling belongs outside the renderer. The default helper path is:

```text
src/input/wonder-atlas-intent.ts
```

If implementation finds an existing tile-intent module that already owns this exact responsibility, the plan may extend that module instead of adding the default file. The renderer must still remain uninvolved in input decisions.

The intent helper should run only after higher-priority unit and city interactions. It opens or focuses the Atlas only when the clicked/tapped tile contains a natural wonder already discovered by the current player and inspectable through the current tile presentation.

---

## Data Flow

Atlas flow:

1. Player opens the global Wonder Atlas.
2. UI requests Atlas entries for `state.currentPlayer`.
3. `wonder-atlas-presentation` reads existing natural wonder discovery state, legendary wonder state, and viewer-scoped intel.
4. The helper returns masked, viewer-safe entries.
5. `wonder-atlas-panel` renders the visible entries.
6. Selecting an entry renders the matching `wonder-vignette` detail.
7. `View on map` pans/selects the discovered coordinate through existing map control wiring without mutating gameplay state or exposing hidden live tile contents.

Map rendering flow:

1. Existing render visibility decides whether a tile's current content can be shown to `state.currentPlayer`.
2. The tile render path receives a viewer-safe tile presentation that contains a natural wonder.
3. `natural-wonder-renderer` draws the matching landmark using shared visual catalog metadata.
4. Ambient animation uses render time only and does not write to state.

Map deep-link flow:

1. Player clicks or taps a map tile.
2. Existing unit, city, selection, and tile-inspection priorities resolve first.
3. If the remaining tile intent is an inspectable natural wonder already discovered by the current player, the Atlas opens to that wonder entry.
4. If the wonder is unknown to the current player, no Atlas entry opens and no hidden information is exposed.

---

## Error Handling And Edge Cases

- Missing visual catalog metadata uses a safe fallback medallion and static marker rather than crashing.
- A natural wonder id that is not in the gameplay definitions should not render actionable Atlas details.
- A natural wonder tile outside current-player discovery must not appear in the Atlas.
- A natural wonder tile outside current-player render visibility must not draw current live details on the map.
- A discovered natural wonder whose tile can no longer be resolved should remain listed only if existing state preserves enough safe discovery data; otherwise omit `View on map`.
- Legendary masked slots must not imply construction availability unless the existing legendary presentation state says availability is visible.
- Reduced-motion mode uses `prefers-reduced-motion` at minimum and disables looping vignette and map landmark animation.
- Input deep-linking must not override selecting units, selecting cities, moving units, attacking, or other primary map actions.
- Hot-seat current-player switching must refresh Atlas visibility.
- The Atlas must handle an empty `Known Natural` tab with useful text and no fake unknown wonder cards.

---

## Testing Requirements

### System And Presentation Tests

Add mirrored or focused tests for the shared catalog and Atlas presentation:

- every natural wonder definition has visual catalog metadata
- every legendary wonder definition has masked medallion metadata
- Atlas presentation hides undiscovered natural wonders completely
- Atlas presentation shows discovered natural wonders with safe details
- Atlas presentation does not leak unknown natural wonder count, names, locations, categories, or effects
- Atlas presentation scopes visibility to `state.currentPlayer`
- Atlas presentation does not expose live hidden tile details for a discovered wonder outside current visibility
- Atlas presentation includes rival legendary information only when existing viewer-scoped intel allows it
- masked legendary slots do not imply buildability unless existing visible state supports it

### UI Tests

Add tests for the Atlas panel and vignette behavior:

- Atlas is globally reachable
- all visible Atlas entries render and are reachable
- the live shell entry point opens the real Atlas panel module
- selecting a visible entry updates the vignette/detail area immediately
- discovered natural wonder details show medallion, name, location, and effect summary
- undiscovered natural wonders do not render as hidden cards, silhouettes, or disabled placeholders
- legendary wonders render as masked medallion slots
- `View on map` invokes the correct pan/select callback for a discovered wonder
- `View on map` is absent or disabled when a discovered wonder lacks a resolvable coordinate
- reduced-motion rendering uses a static vignette state
- hot-seat current-player changes refresh the visible Atlas entries

### Renderer And Input Tests

Add targeted tests around map rendering and deep-link behavior:

- discovered natural wonder tiles invoke the natural wonder landmark renderer
- undiscovered or non-visible natural wonder tiles do not render current live details
- last-seen/fogged wonder rendering uses viewer-safe tile presentation rather than live tile state
- renderer fallback handles missing visual metadata safely
- ambient animation uses render time without mutating game state
- deep-link intent opens the Atlas for a discovered natural wonder tile
- deep-link intent does not fire for unknown natural wonders
- deep-link intent does not override unit or city interaction priority
- deep-link coordinates follow existing map wrapping/normalization behavior

### Required Checks

For Stage 2A implementation, run:

```bash
scripts/check-src-rule-violations.sh <changed src files>
./scripts/run-with-mise.sh yarn test --run <mirrored or smallest relevant tests>
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
```

Before push, PR creation, or merge, also run:

```bash
./scripts/run-with-mise.sh yarn test
```

---

## Acceptance Criteria

Stage 2A is complete when:

- a player can open a global Wonder Atlas
- the Atlas is opened through the live game shell, not only through an isolated test helper
- discovered natural wonders appear as medallion entries in the Atlas
- undiscovered natural wonders are absent from the Atlas
- legendary wonders appear as masked medallion slots
- selecting a discovered natural wonder shows an animated SVG/CSS vignette card with safe details
- reduced-motion users receive static equivalents
- discovered natural wonders render as distinctive tile-integrated map landmarks
- known wonder tiles can deep-link into the Atlas without breaking unit/city/map controls
- Atlas and map visibility are scoped to `state.currentPlayer`
- no gameplay rules, yields, discovery mechanics, AI behavior, or save format are changed
- catalog, presentation, UI, renderer, input, wonder regression, build, and full test checks pass

---

## Later Roadmap

### Stage 2B: Discovery Reveal Moments

Add short first-discovery reveal treatments for natural wonders. These should reuse Stage 2A medallions and vignette identity, while remaining separate from ordinary map scanning.

### Stage 2C: City-First Legendary Presence

Make city production the primary living surface for legendary wonders. This slice owns active construction identity, progress, ETA, milestone copy, lost-race recovery presentation, owner-only completion ceremonies, completed mini landmarks around host cities, deterministic multiple-wonder city slots, and minimal safe Atlas state labels.

### Stage 2D: Full 2D Atlas Expansion

Expand the Atlas into a full 2D Wonder Codex focused on fun, learning, story, and spectacle rather than gameplay efficiency. The existing Atlas entry point should open the Codex shell; do not maintain parallel old/new Atlas implementations.

Stage 2D owns:

- authored codex pages for every current natural and legendary wonder
- strict content coverage tests so new wonders fail until codex content exists
- viewer-safe presentation models for discovered natural wonders and owned legendary wonder states
- no undiscovered natural wonder silhouettes, disabled cards, count leaks, or placeholder pages
- no rival city, progress, reward, completion, host-city, or map-landmark details unless a later viewer-scoped intel model explicitly stores that knowledge
- desktop rich-reader layout and mobile catalog-first layout using the same browser/PWA and macOS/Tauri implementation path
- convention-driven related links with tests, not hand-maintained one-off links
- `View on Map` and `Open City` actions emitted through callbacks without mutating gameplay state inside codex UI
- no gameplay changes to wonder placement, yields, construction, questing, race rules, rewards, AI strategy, save semantics, or platform behavior

Architecture guardrails:

- Place codex content, source manifests, related-link derivation, and viewer-safe presentation helpers under `src/systems/wonder-codex/`.
- Keep DOM modules render-only under `src/ui/`; UI consumes view models and must not inspect raw rival project/completion state.
- Keep all browser/PWA and macOS/Tauri behavior shared. If a platform capability is needed later, route it through `src/platform/` rather than importing Tauri APIs from shared modules.
- Keep gameplay definitions authoritative for yields, effects, requirements, rewards, and placement.

Content and citation guardrails:

- Real-world facts must be accurate, middle-school appropriate, and traceable to reliable educational or institutional sources.
- Codex illustration slots must use real sourced images with documented reuse rights. Generated images are out of scope for Stage 2D.
- Maintain the human-readable source ledger at `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`.
- Add a typed source manifest in implementation, including factual sources and image sources with URL, creator/author when available, license, attribution, and local asset path.
- Store local codex images under `public/images/wonders/codex/`.

Testing guardrails:

- Add content contract tests for full natural and legendary wonder coverage, duplicate IDs, unknown IDs, empty strings, forbidden placeholder text, required tags, required status hooks, fact source IDs, and image source IDs.
- Add source tests proving every source ID resolves, every image asset exists locally, every source record has license/attribution metadata, and all source IDs appear in the source ledger.
- Add presentation privacy tests proving undiscovered natural wonders and rival legendary project/completion details stay hidden.
- Add rendered UI tests for catalog selection, desktop/mobile layout mode, sourced image rendering, attribution rendering, related links, safe actions, and current-player refresh.
- Run wonder regressions, build, and full tests before merge.

Deferred from Stage 2D:

- Stage 2E owns richer bespoke landmark silhouettes, animation variants, and per-wonder visual depth.
- Stage 2F owns explicit viewer-scoped rival legendary records from earned intel.
- Stage 3 owns real 3-5 second videos or loops, including asset-size, offline/PWA, macOS/Tauri, and maintenance review.

### Stage 2E: Landmark Art Expansion

Later art slice for richer bespoke landmark silhouettes, variants, and per-wonder visual depth after Stage 2C's generic-but-distinct around-city landmark slot model ships.

### Stage 2F: Atlas Intel Records

Add explicit viewer-scoped rival-known legendary records after the intel model stores that knowledge. This stage owns safe rival Atlas pages, known-rival completion records, and any rival host/progress/reward details that the player has actually earned through intel. Stage 2D must not infer those records from live hidden rival state.

### Stage 3: Real Video Spike

Prototype 3-5 second video or loop support for selected catalog entries. The spike should evaluate asset size, tooling, offline/PWA cost, macOS/Tauri behavior, and maintenance burden before any production commitment.
