# Stage 2K City Renderer Layer Architecture Design

**Date:** 2026-06-04
**Status:** Approved for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 2G Legendary City Landmark Art Expansion and Stage 2I Bespoke Legendary Landmark Art

## Purpose

Stage 2K turns the city renderer's implicit drawing order into an explicit, testable layer architecture. The current `drawCities(...)` path already renders city bases, icons, legendary landmarks, labels, status badges, production badges, idle badges, fogged last-seen cities, and horizontal wrap copies. The work is valuable because future legendary landmark art and intel features need a stable place to render without accidentally covering city labels, production indicators, or privacy-sensitive fogged city surfaces.

This is a behavior-preserving architecture pass. It may fix objective layering bugs found during extraction, but only with focused regression coverage.

## Goals

- Keep `drawCities(...)` as the public city-rendering entry point.
- Extract the current city renderer into named pass helpers or an equivalent explicit pass pipeline.
- Build one prepared render item per visible city/render coordinate before drawing passes.
- Preserve live-city versus fogged last-seen city privacy boundaries.
- Make the layer order readable in code and enforced by tests.
- Keep legendary landmarks below city labels and badges.
- Preserve current badge priority: breakaway first, then occupation, then unrest.
- Preserve player-owned production and idle badge behavior.
- Preserve horizontal wrap rendering by applying the same pass sequence to each visible render coordinate.
- Allow test-backed fixes for objective layering bugs found during extraction.

## Non-Goals

- Do not change gameplay, saves, production rules, fog-of-war rules, legendary wonder intel, or map visibility.
- Do not implement Stage 2J known-rival landmark visibility.
- Do not add or change audio/SFX assets, audio triggers, or attribution.
- Do not add new UI controls or player actions.
- Do not redesign city visuals, icon art, badge art, typography, or badge positions for subjective polish.
- Do not refactor unit rendering, tile rendering, selection overlays, hover overlays, or debug overlays unless the existing city-renderer call boundary already owns them.
- Do not change the public call shape of `drawCities(...)` unless a later implementation review proves it is necessary and all live callers are updated in the same MR.

## Architecture

`drawCities(...)` remains the orchestration entry point used by the render loop. Inside it, the implementation should prepare a `CityRenderItem` for each visible city/render-coordinate pair, then pass each item through named drawing passes in a fixed order.

Recommended pass order:

1. City base and ownership ring.
2. City icon.
3. Legendary landmark sublayer.
4. City label.
5. Status badge: breakaway, occupation, or unrest.
6. Production badge.
7. Idle-production badge.

The pass helpers should draw only. They should not query broad game state or re-run visibility logic. If a pass needs data, the prepared render item should carry that data explicitly. This keeps each helper small, understandable, and independently testable without forcing every pass to know the entire `GameState` shape.

## Data Flow

`drawCities(...)` should continue to own the high-level viewer-safe data flow:

- read the current viewer's visibility from `state.civilizations[playerCivId]`
- collect live visible city projections
- collect fogged last-seen city projections
- collect viewer-safe legendary landmark entries through `getLegendaryWonderMapEntries(state, playerCivId)`
- expand horizontal wrap render coordinates when the map wraps
- convert hex coordinates to screen coordinates
- create one `CityRenderItem` per visible render coordinate
- draw each item through the pass pipeline

The prepared render item should distinguish live and fogged cities. A live item may carry the live `city` object and live-only fields such as occupation, unrest, production queue, idle production, breakaway state, and landmark entries. A fogged last-seen item must not carry the live `city` object, live production queue, unrest, occupation, breakaway state, or legendary landmark entries unless an existing viewer-safe presentation helper explicitly supplies that information.

Suggested item fields:

- projection name, position, population, owner, `isLive`, and optional live city id
- optional live city object for live visible cities only
- screen position and rendered size
- owner color
- minor-civ archetype or icon choice if applicable
- viewer id
- landmark entries already filtered for the viewer
- `lowZoom`, `reducedMotion`, and `nowMs`

If this item builder becomes nontrivial, it should be exported for focused tests. If it stays small, tests may exercise it through `drawCities(...)` only.

## Bug Fix Policy

This MR may fix objective rendering bugs discovered during extraction when both are true:

- the bug is directly related to city layer order, live/fogged data separation, or badge preservation
- the fix includes a focused regression proving the exact behavior

Examples of allowed fixes:

- a production badge renders below or inside a landmark and becomes unreadable
- an unrest, occupation, or breakaway badge is drawn before landmarks and can be covered
- a fogged last-seen city accidentally receives a live production, unrest, occupation, breakaway, or landmark pass
- a wrapped city copy skips a city pass that the primary copy receives

Examples of out-of-scope changes:

- moving badges for subjective aesthetics
- changing icon art or typography
- adding new status categories
- changing what rival intel can reveal
- adding audio/SFX feedback for city or landmark rendering

## Layer Contract

The implementation must preserve these ordering and visibility rules:

- city base and icon render before legendary landmarks
- legendary landmarks render before city labels
- legendary landmarks render before production and idle badges
- legendary landmarks render before breakaway, occupation, and unrest badges
- breakaway badge takes priority over occupation and unrest
- occupation badge takes priority over ordinary unrest
- production badges render only for live player-owned cities with a non-empty queue
- idle badges render only for live player-owned cities with an empty queue and `idleProduction` set to `gold` or `science`
- fogged last-seen cities render their last-seen label only and do not leak live city badges or landmarks
- horizontal wrap copies receive the same pass sequence as primary visible coordinates

## Testing Requirements

Use the live `drawCities(...)` path for the core regressions so tests prove the real renderer contract. Add lower-level tests only for extracted helpers that contain meaningful branching.

Required tests:

- operation order proves legendary landmarks render before city labels and production badges
- operation order proves legendary landmarks render before idle badges
- operation order proves legendary landmarks render before breakaway, occupation, and unrest badges
- badge-priority coverage proves breakaway wins over occupation/unrest, and occupation wins over ordinary unrest
- fogged last-seen city coverage proves live production, idle, unrest, occupation, breakaway, and landmark passes do not run
- wrapped city coverage proves the visible mirrored coordinate still receives the city pass sequence
- privacy coverage proves rival completed intel alone still does not create map landmarks
- regression coverage for any objective layering bug fixed during extraction

Existing tests in `tests/renderer/city-renderer.test.ts` should remain the first target. If the pass helpers become a separate module such as `src/renderer/city-render-passes.ts`, add `tests/renderer/city-render-passes.test.ts` only for helper-specific branching that is awkward to prove through `drawCities(...)`.

## Implementation Boundaries

Likely file changes:

- modify `src/renderer/city-renderer.ts`
- optionally create `src/renderer/city-render-passes.ts`
- modify `tests/renderer/city-renderer.test.ts`
- optionally create `tests/renderer/city-render-passes.test.ts`

The implementation plan should avoid a broad renderer rewrite. It should move only city-rendering responsibilities needed to make the pass order explicit and tested.

## Acceptance Criteria

- `drawCities(...)` remains the public city-rendering entry point.
- City rendering is organized into named pass helpers or an explicit pass pipeline.
- Prepared render items preserve live versus fogged data boundaries.
- Landmark, label, status badge, production badge, and idle badge order is regression-tested.
- Fogged last-seen city privacy behavior is preserved.
- Horizontal wrap city rendering remains intact.
- No new gameplay, save, UI action, audio/SFX, or rival intel behavior is introduced.
- Any layering bug fixed during the pass split has focused regression coverage.
- Targeted renderer tests, source-rule checks for changed `src/` files, wonder regressions, build, and full tests pass before PR.
