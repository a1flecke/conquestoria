# Stage 2I Bespoke Legendary Landmark Art Design

**Date:** 2026-06-02
**Status:** Approved for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 2G Legendary City Landmark Art Expansion

## Purpose

Stage 2I begins replacing Stage 2G's generic legendary landmark token silhouettes with per-wonder bespoke Canvas drawings. This first MR uses the approved option A scope: establish a small renderer-side bespoke landmark registry and convert three visually distinct legendary wonders:

- `oracle-of-delphi`
- `grand-canal`
- `sun-spire`

The MR must prove the architecture without converting the entire legendary roster. It must also update the implementation plan with a discrete, detailed Stage 2K/C renderer-layer architecture step so the broader layer pass remains traceable and deliberately deferred.

## Goals

- Add typed `assetKey` metadata for the first three bespoke legendary landmarks.
- Add a renderer-side registry that maps supported `assetKey` values to Canvas drawing functions.
- Render bespoke drawings for completed owned visible landmarks through the existing Stage 2G city landmark path.
- Preserve generic Stage 2G token silhouettes for all legendary wonders without a supported `assetKey`.
- Preserve active construction ghosts for the first three wonders until a later MR explicitly designs bespoke construction variants.
- Add tests that fail if an authored `assetKey` does not resolve to a supported renderer entry.
- Add tests proving supported bespoke entries use the bespoke renderer path and unsupported entries fall back to the existing generic path.
- Record the deferred Stage 2K/C renderer-layer architecture step in the implementation plan with enough detail to execute later.

## Non-Goals

- Do not implement the Stage 2K renderer-layer architecture pass in this MR.
- Do not change rival legendary landmark visibility or host/location intel; that remains Stage 2J.
- Do not add bitmap, SVG, or external art assets.
- Do not change gameplay rewards, production rules, saves, AI, or visibility gates.
- Do not add UI controls, labels, or new player actions.
- Do not require every legendary wonder to have bespoke art yet.
- Do not claim historical/art-reference completeness for fantasy or invented wonders beyond source notes in this spec and plan.

## Architecture

`LegendaryWonderLandmarkMetadata.assetKey` already exists as an optional field. This MR should make it meaningful for three entries only.

Add a focused renderer module, for example `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`, responsible for:

- exporting the supported bespoke asset keys
- resolving an `assetKey` to a draw function
- drawing each bespoke form with Canvas primitives
- keeping all per-asset drawing logic out of the generic landmark slot/orbit code

`src/renderer/wonders/legendary-wonder-renderer.ts` remains the integration point. For completed landmarks, it should ask the bespoke registry whether `metadata.assetKey` resolves. If it does, draw the bespoke asset inside the existing medallion. If not, use the current generic silhouette path. Under-construction landmarks keep the existing ghost path even when metadata has an `assetKey`.

## Bespoke Asset Scope

| Wonder | `assetKey` | Visual intent | Reason for first MR |
|---|---|---|---|
| `oracle-of-delphi` | `oracle-of-delphi-bespoke` | Tripod/oracle shrine silhouette with central flame and side columns | Proves a tall sacred/cultural form distinct from the generic spire |
| `grand-canal` | `grand-canal-bespoke` | Broad canal lock or arched waterway with horizontal water bands | Proves a wide infrastructure form distinct from generic arch silhouettes |
| `sun-spire` | `sun-spire-bespoke` | Radiant spire with sun disk/rays and a vertical tower | Proves luminous/radial ornament while keeping low-zoom readability |

All three drawings should use existing metadata palettes so they stay compatible with Stage 2G medallions, reduced motion, and future palette tuning.

## Rendering Contract

- Completed owned visible landmark with supported `assetKey`: draw medallion, then draw bespoke asset.
- Completed owned visible landmark without `assetKey`: draw medallion, then draw existing generic family silhouette.
- Completed owned visible landmark with unsupported `assetKey`: draw medallion, then draw existing generic family silhouette; tests must catch unsupported catalog-authored keys before merge.
- Under-construction landmark with or without `assetKey`: draw existing construction ghost.
- Overflow medallions remain unchanged.
- Reduced motion disables only motion effects; static bespoke forms still draw.
- Low zoom may scale the bespoke drawing smaller, but it must remain nonblank.

## Visibility And Privacy

This MR must not change which landmarks are visible. It only changes how already-rendered owned visible landmarks are drawn. Rival completed intel must still not reveal host city, map location, or landmark preview. Known-rival landmark visibility remains Stage 2J.

## Testing Requirements

- Catalog validation test asserts the three first-slice wonders have exact `assetKey` values.
- Catalog validation test asserts every non-empty authored `assetKey` is supported by the renderer registry.
- Renderer test proves `oracle-of-delphi`, `grand-canal`, and `sun-spire` draw through the bespoke path.
- Renderer test proves a completed entry without `assetKey` still draws through the generic silhouette path.
- Renderer test proves under-construction entries with `assetKey` still draw the construction ghost, not the completed bespoke asset.
- Existing map/city/panel privacy tests should continue to pass without code changes.

## Stage 2K/C Plan Requirement

The Stage 2I implementation plan must include a discrete task or final section titled `Deferred Stage 2K/C Renderer Layer Architecture Step`. It must not implement that work, but it must define the future step clearly enough for a later MR:

- target files likely to be split or introduced
- render pass boundaries for city icon, labels, badges, overlays, selection, occupation/unrest/breakaway indicators, production badges, and landmark sublayers
- required ordering invariants, especially landmarks below labels and production/overlay badges
- regression tests needed for layer ordering and player-visible badge preservation
- explicit statement that 2I option A does not block or partially ship 2K

## Acceptance Criteria

- The first three `assetKey` entries are authored in landmark metadata.
- The bespoke renderer registry supports exactly those first three keys in this MR.
- Completed Oracle, Grand Canal, and Sun Spire landmarks use bespoke Canvas drawings.
- Generic Stage 2G rendering remains available for all other completed legendary landmarks.
- Active construction ghosts and overflow medallions are unchanged.
- Unsupported authored `assetKey` values fail tests.
- The implementation plan contains the detailed deferred 2K/C step.
- Targeted tests, wonder regressions, build, and full tests pass before PR.
