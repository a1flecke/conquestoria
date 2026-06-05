# Stage 2I-MR3 Material And Maritime Bespoke Landmark Art Design

**Date:** 2026-06-05
**Status:** Reviewed for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 2G Legendary City Landmark Art Expansion, Stage 2I first bespoke landmark art, Stage 2I-MR2 Knowledge And Signal Bespoke Landmark Art, Stage 2K City Renderer Layer Architecture

## Purpose

Stage 2I-MR3 continues replacing generic legendary landmark token silhouettes with per-wonder bespoke Canvas drawings. MR1 proved the bespoke renderer registry with Oracle of Delphi, Grand Canal, and Sun Spire. MR2 extended that path to knowledge-and-signal landmarks: World Archive, Starvault Observatory, Storm Signal Spire, and Internet. MR3 should add a coherent material-and-maritime batch:

- `moonwell-gardens`
- `ironroot-foundry`
- `tidecaller-bastion`
- `leviathan-drydock`

This slice should make nature, craft, coastal defense, and shipbuilding achievements more recognizable on the map while staying small enough to review. It must not change visibility, intel, gameplay, UI actions, audio, saves, PWA, Tauri, sprites, or renderer layer architecture.

## Goals

- Add typed `assetKey` metadata for the four MR3 wonders.
- Extend the existing bespoke landmark registry with four supported Canvas primitive drawings.
- Render completed visible landmarks for the four MR3 wonders through the bespoke path.
- Preserve generic Stage 2G silhouettes for every landmark without a supported `assetKey`.
- Preserve construction ghosts for all four MR3 wonders until a later slice explicitly designs bespoke construction variants.
- Add tests that fail if an authored `assetKey` does not resolve to a supported renderer entry.
- Add tests proving the four MR3 entries use bespoke renderer operations and unsupported/missing keys still fall back safely.
- Keep Stage 2J known-rival landmark privacy and Stage 2K city pass ordering unchanged.

## Non-Goals

- Do not implement bespoke art for the four non-MR3 generic landmarks that remain after this slice: `whispering-exchange`, `hall-of-champions`, `gate-of-the-world`, and `manhattan-project`.
- Do not add bitmap, SVG, external art, generated image, downloaded assets, or sprite-catalog entries.
- Do not add or change audio/SFX assets, audio triggers, mixer behavior, or audio attribution.
- Do not change gameplay rewards, production rules, quests, saves, AI, visibility gates, or rival intel.
- Do not add UI controls, labels, map actions, Codex actions, or panel behavior.
- Do not modify the city renderer pass architecture.
- Do not redesign medallions, slot rotation, overflow markers, reduced-motion behavior, or construction ghosts.
- Do not claim complete historical art-reference coverage for all legendary wonders in this slice.

## Bespoke Asset Scope

| Wonder | `assetKey` | Visual intent | Distinction requirement |
|---|---|---|---|
| `moonwell-gardens` | `moonwell-gardens-bespoke` | Crescent moon over a round well basin, framed by leaves or a garden bed | Must read as moonlit garden/well, not as Oracle shrine, Sun Spire disk, or generic garden |
| `ironroot-foundry` | `ironroot-foundry-bespoke` | Compact forge or furnace held by root-like supports, with a bright ingot/hearth core | Must read as rooted foundry/craft, not as generic hall, drydock ribs, or military bastion |
| `tidecaller-bastion` | `tidecaller-bastion-bespoke` | Crenellated coastal fort with a wave line or tide mark beneath it | Must read as sea bastion, not as Grand Canal's horizontal waterworks or Leviathan Drydock |
| `leviathan-drydock` | `leviathan-drydock-bespoke` | Ship hull ribs, cradle, or drydock gantry enclosing a large vessel silhouette | Must read as shipbuilding/drydock, not as Tidecaller Bastion walls or Grand Canal arches |

All four drawings should use existing landmark metadata palettes so color, glow, reduced-motion, and future palette tuning stay centralized in `src/systems/legendary-wonder-landmark-catalog.ts`.

MR3 drawings are authored Canvas primitives inside the existing landmark medallion. They are not standalone sprites and do not require external art attribution. The visual language should be concrete, readable at the existing medallion radius, and distinct from MR1/MR2 bespoke glyphs.

The remaining final Stage 2I bespoke batch after MR3 should be the civic/endgame set: `whispering-exchange`, `hall-of-champions`, `gate-of-the-world`, and `manhattan-project`. MR3 tests should use one of those non-bespoke entries, preferably `whispering-exchange`, when proving generic fallback behavior after `moonwell-gardens` becomes bespoke.

## Architecture

Keep the existing Stage 2I architecture:

- `src/systems/legendary-wonder-landmark-catalog.ts` owns optional `assetKey` metadata.
- `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` owns supported asset keys, resolver behavior, and per-key Canvas drawing functions.
- `src/renderer/wonders/legendary-wonder-renderer.ts` remains the integration point and asks the resolver whether a completed landmark has a supported bespoke asset.
- `src/renderer/city-render-passes.ts` and `src/renderer/city-renderer.ts` keep the Stage 2K layer pipeline unchanged.

MR3 should extend `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` with the four new keys and add entries to the existing registry. The resolver API should remain:

```ts
resolveLegendaryWonderBespokeAsset(assetKey: string | undefined): LegendaryWonderBespokeAsset | null
```

No UI, Codex, Atlas, city-panel, territory-inspection, or map-intel code should need to know which wonders are bespoke. Those surfaces already consume safe landmark presentation and map entries.

After MR3, the exact approved bespoke key list is:

- `oracle-of-delphi` -> `oracle-of-delphi-bespoke`
- `grand-canal` -> `grand-canal-bespoke`
- `sun-spire` -> `sun-spire-bespoke`
- `world-archive` -> `world-archive-bespoke`
- `starvault-observatory` -> `starvault-observatory-bespoke`
- `storm-signal-spire` -> `storm-signal-spire-bespoke`
- `internet` -> `internet-bespoke`
- `moonwell-gardens` -> `moonwell-gardens-bespoke`
- `ironroot-foundry` -> `ironroot-foundry-bespoke`
- `tidecaller-bastion` -> `tidecaller-bastion-bespoke`
- `leviathan-drydock` -> `leviathan-drydock-bespoke`

## Rendering Contract

- Completed visible landmark with supported MR3 `assetKey`: draw the existing medallion, then draw the bespoke glyph.
- Completed visible landmark without `assetKey`: draw the existing generic family silhouette.
- Completed visible landmark with unsupported `assetKey`: draw the existing generic family silhouette; catalog tests must prevent unsupported authored keys from merging.
- Under-construction landmark with or without `assetKey`: draw the existing construction ghost, not completed bespoke art.
- Overflow `+N` medallions remain unchanged.
- Reduced-motion mode still draws static bespoke forms; it must not add motion-only meaning.
- Low zoom may simplify by scale, but the glyph must remain nonblank and distinguishable by operation coverage.
- Known-rival landmarks from Stage 2J use the same safe renderer path when they are already allowed to render; MR3 must not broaden when they render.

## UI, UX, And Audio Review

MR3 changes the glyph drawn inside already-existing medallions. That is player-visible, but it is not a new UI surface. The map, Codex, city panel, territory inspection, Atlas, buttons, labels, and actions should remain unchanged. The UX goal is recognition: a player who has earned visibility should be able to distinguish garden, foundry, sea fort, and drydock landmarks more easily than with generic token silhouettes.

The four glyphs must not visually imply new actions, statuses, alerts, production states, or audio states. In particular, Tidecaller Bastion waves are decorative identity marks only and must not look like selected-tile pings, warning badges, or active storm effects. Ironroot Foundry glow is landmark identity only and must not imply active production, fire damage, unrest, or a resource alert.

No SFX work is required for this MR. There are no new sounds, no new playback triggers, and no audio source attribution. Existing natural-wonder and mixer audio tests should not need updates for this slice.

## Visual Quality Guardrails

- Use simple Canvas primitives that remain readable in the existing medallion radius.
- Set fill/stroke styles inside each draw function rather than relying on prior pass state.
- Keep drawings centered around the provided `cx`, `cy`, and `radius`.
- Avoid tiny details that disappear at map scale.
- Avoid adding per-frame allocations beyond ordinary Canvas path work.
- Do not use `Math.random()` or any nondeterministic visual selection.
- Do not use `nowMs` to add pulsing, alert-like motion, or motion-only meaning.
- Do not load assets, touch DOM APIs, read storage, or call platform capabilities from the renderer.

## Privacy And Gameplay

This is a presentation-only art slice. It must preserve existing visibility rules:

- Owned completed landmarks render when existing map presentation says they render.
- Owned active construction ghosts keep the existing progress gates.
- Rival completed intel alone does not reveal a host city, map marker, or landmark preview.
- Known-rival landmarks render only from the explicit Stage 2J paired host-location plus completed intel contract.
- Hot-seat viewers see only the current viewer's safe landmark entries.

MR3 does not change the data model for game state, saves, legendary wonder definitions, quests, rewards, or intel records.

## Testing Requirements

Catalog and registry tests:

- exact `assetKey` values are authored for `moonwell-gardens`, `ironroot-foundry`, `tidecaller-bastion`, and `leviathan-drydock`.
- first-slice and MR2 keys remain authored and supported.
- every non-empty authored `assetKey` resolves to `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`.
- no unexpected landmark receives an `assetKey` in this MR; the expected keyed set is exactly the original three, the four MR2 wonders, and the four MR3 wonders listed above.
- generic fallback coverage should move to `whispering-exchange` because `moonwell-gardens` becomes bespoke in this slice.

Renderer tests:

- completed MR3 landmarks draw through `bespoke:<assetKey>` operations.
- completed first-slice and MR2 landmarks still draw through bespoke operations.
- completed landmarks without `assetKey` still draw generic silhouettes.
- unsupported `assetKey` values still fall back to generic silhouettes.
- under-construction MR3 landmarks do not call bespoke operations and keep construction ghost drawing.
- reduced-motion MR3 rendering still draws nonblank bespoke glyphs.
- each MR3 bespoke draw function emits ordinary Canvas path operations in addition to its `bespoke:<assetKey>` sentinel, so tests catch accidental empty marker-only implementations.
- MR3 glyph geometry profiles are distinct from each other and from the closest existing lookalikes: Grand Canal for waterworks, Sun Spire for moon/celestial shapes, and the existing bespoke archive/observatory/signal/network glyphs from MR2.

Regression tests:

- existing known-rival privacy tests still pass.
- existing city render pass ordering tests still pass.
- existing multi-wonder overflow and construction ghost tests still pass.

Verification:

- targeted catalog and legendary renderer tests
- `scripts/check-src-rule-violations.sh` for changed `src/` files
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`

## Acceptance Criteria

- Four MR3 landmark metadata entries have supported bespoke `assetKey` values.
- The bespoke registry supports the original three Stage 2I keys, the four MR2 keys, and the four MR3 keys.
- Completed Moonwell Gardens, Ironroot Foundry, Tidecaller Bastion, and Leviathan Drydock landmarks use bespoke Canvas drawings.
- Generic Stage 2G rendering remains available for `whispering-exchange`, `hall-of-champions`, `gate-of-the-world`, `manhattan-project`, unknown fallback IDs, and unsupported asset keys.
- Active construction ghosts and overflow medallions are unchanged.
- Unsupported authored asset keys fail tests before merge.
- No gameplay, save, UI action, audio/SFX, sprite, PWA, Tauri, or rival-intel behavior changes.
- Targeted tests, wonder regressions, build, and full tests pass before PR.
