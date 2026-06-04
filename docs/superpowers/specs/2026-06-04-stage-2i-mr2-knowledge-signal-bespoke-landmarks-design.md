# Stage 2I-MR2 Knowledge And Signal Bespoke Landmark Art Design

**Date:** 2026-06-04
**Status:** Reviewed for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 2G Legendary City Landmark Art Expansion, Stage 2I first bespoke landmark art, Stage 2K City Renderer Layer Architecture

## Purpose

Stage 2I-MR2 continues replacing generic legendary landmark token silhouettes with per-wonder bespoke Canvas drawings. The first Stage 2I slice proved the renderer-side `assetKey` registry with Oracle of Delphi, Grand Canal, and Sun Spire. MR2 should extend that same architecture to a coherent knowledge-and-signal batch:

- `world-archive`
- `starvault-observatory`
- `storm-signal-spire`
- `internet`

This slice should make late-game and knowledge-themed legendary landmarks more recognizable on the map while staying small enough to review. It must not change visibility, intel, gameplay, UI actions, audio, saves, PWA, Tauri, or renderer layer architecture.

## Goals

- Add typed `assetKey` metadata for the four MR2 wonders.
- Extend the existing bespoke landmark registry with four supported Canvas primitive drawings.
- Render completed visible landmarks for the four MR2 wonders through the bespoke path.
- Preserve generic Stage 2G silhouettes for every landmark without a supported `assetKey`.
- Preserve construction ghosts for all four MR2 wonders until a later slice explicitly designs bespoke construction variants.
- Add tests that fail if an authored `assetKey` does not resolve to a supported renderer entry.
- Add tests proving the four MR2 entries use bespoke renderer operations and unsupported/missing keys still fall back safely.
- Keep Stage 2J known-rival landmark privacy and Stage 2K city pass ordering unchanged.

## Non-Goals

- Do not implement bespoke art for the eight non-MR2 generic landmarks that remain after this slice: `moonwell-gardens`, `ironroot-foundry`, `tidecaller-bastion`, `whispering-exchange`, `hall-of-champions`, `gate-of-the-world`, `leviathan-drydock`, and `manhattan-project`.
- Do not add bitmap, SVG, external art, generated image, or downloaded assets.
- Do not add or change audio/SFX assets, audio triggers, mixer behavior, or audio attribution.
- Do not change gameplay rewards, production rules, quests, saves, AI, visibility gates, or rival intel.
- Do not add UI controls, labels, map actions, Codex actions, or panel behavior.
- Do not modify the city renderer pass architecture.
- Do not redesign medallions, slot rotation, overflow markers, reduced-motion behavior, or construction ghosts.
- Do not claim complete historical art-reference coverage for all legendary wonders in this slice.

## Bespoke Asset Scope

| Wonder | `assetKey` | Visual intent | Distinction requirement |
|---|---|---|---|
| `world-archive` | `world-archive-bespoke` | Layered archive shelves, tablets, or book spines around a central illuminated record | Must read as stored knowledge, not as the existing Oracle shrine or generic hall |
| `starvault-observatory` | `starvault-observatory-bespoke` | Observatory dome, lens, aperture, and star points | Must read as astronomy, not as Sun Spire's radiant sun disk |
| `storm-signal-spire` | `storm-signal-spire-bespoke` | Tall signal mast with beacon arcs, signal lines, or lightning-like pulses | Must read as broadcast/signal, not as generic spire or Sun Spire |
| `internet` | `internet-bespoke` | Network mesh with linked nodes around a central hub | Must read as distributed network, not as observatory stars or archive shelves |

All four drawings should use existing landmark metadata palettes so color, glow, reduced-motion, and future palette tuning stay centralized in `src/systems/legendary-wonder-landmark-catalog.ts`.

The `internet` glyph must be an abstract network diagram. It must not use a browser logo, company logo, wireless trademark mark, or real-world brand styling. This keeps the drawing gameplay-authored and avoids attribution or trademark confusion.

## Architecture

Keep the existing Stage 2I architecture:

- `src/systems/legendary-wonder-landmark-catalog.ts` owns optional `assetKey` metadata.
- `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` owns supported asset keys, resolver behavior, and per-key Canvas drawing functions.
- `src/renderer/wonders/legendary-wonder-renderer.ts` remains the integration point and asks the resolver whether a completed landmark has a supported bespoke asset.
- `src/renderer/city-render-passes.ts` and `src/renderer/city-renderer.ts` keep the Stage 2K layer pipeline unchanged.

MR2 should extend `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` with the four new keys and add entries to the existing registry. The resolver API should remain:

```ts
resolveLegendaryWonderBespokeAsset(assetKey: string | undefined): LegendaryWonderBespokeAsset | null
```

No UI, Codex, Atlas, city-panel, territory-inspection, or map-intel code should need to know which wonders are bespoke. Those surfaces already consume safe landmark presentation and map entries.

The existing catalog test named around "first-slice" asset keys should be updated rather than duplicated. After MR2, the exact approved bespoke key list is:

- `oracle-of-delphi` -> `oracle-of-delphi-bespoke`
- `grand-canal` -> `grand-canal-bespoke`
- `sun-spire` -> `sun-spire-bespoke`
- `world-archive` -> `world-archive-bespoke`
- `starvault-observatory` -> `starvault-observatory-bespoke`
- `storm-signal-spire` -> `storm-signal-spire-bespoke`
- `internet` -> `internet-bespoke`

## Rendering Contract

- Completed visible landmark with supported MR2 `assetKey`: draw the existing medallion, then draw the bespoke glyph.
- Completed visible landmark without `assetKey`: draw the existing generic family silhouette.
- Completed visible landmark with unsupported `assetKey`: draw the existing generic family silhouette; catalog tests must prevent unsupported authored keys from merging.
- Under-construction landmark with or without `assetKey`: draw the existing construction ghost, not completed bespoke art.
- Overflow `+N` medallions remain unchanged.
- Reduced-motion mode still draws static bespoke forms; it must not add motion-only meaning.
- Low zoom may simplify by scale, but the glyph must remain nonblank and distinguishable by operation coverage.
- Known-rival landmarks from Stage 2J use the same safe renderer path when they are already allowed to render; MR2 must not broaden when they render.

## UI, UX, And Audio Review

MR2 changes the glyph drawn inside already-existing medallions. That is player-visible, but it is not a new UI surface. The map, Codex, city panel, territory inspection, Atlas, buttons, labels, and actions should remain unchanged. The UX goal is recognition: a player who has earned visibility should be able to distinguish archive, observatory, signal, and network landmarks more easily than with generic token silhouettes.

The four glyphs must not visually imply new actions, statuses, alerts, or production states. In particular, signal arcs on `storm-signal-spire` and network nodes on `internet` are decorative identity marks only; they must not look like warning badges, notification pings, selected-tile markers, or audio indicators.

No SFX work is required for this MR. There are no new sounds, no new playback triggers, and no audio source attribution. Existing natural-wonder and mixer audio tests should not need updates for this slice.

## Visual Quality Guardrails

- Use simple Canvas primitives that remain readable in the existing medallion radius.
- Set fill/stroke styles inside each draw function rather than relying on prior pass state.
- Keep drawings centered around the provided `cx`, `cy`, and `radius`.
- Avoid tiny details that disappear at map scale.
- Avoid adding per-frame allocations beyond ordinary Canvas path work.
- Do not use `Math.random()` or any nondeterministic visual selection.
- Do not load assets, touch DOM APIs, read storage, or call platform capabilities from the renderer.

## Privacy And Gameplay

This is a presentation-only art slice. It must preserve existing visibility rules:

- Owned completed landmarks render when existing map presentation says they render.
- Owned active construction ghosts keep the existing progress gates.
- Rival completed intel alone does not reveal a host city, map marker, or landmark preview.
- Known-rival landmarks render only from the explicit Stage 2J paired host-location plus completed intel contract.
- Hot-seat viewers see only the current viewer's safe landmark entries.

MR2 does not change the data model for game state, saves, legendary wonder definitions, quests, rewards, or intel records.

## Testing Requirements

Catalog and registry tests:

- exact `assetKey` values are authored for `world-archive`, `starvault-observatory`, `storm-signal-spire`, and `internet`.
- first-slice keys from Stage 2I remain authored and supported.
- every non-empty authored `assetKey` resolves to `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`.
- no unexpected landmark receives an `assetKey` in this MR; the expected keyed set is exactly the original three plus the four MR2 wonders listed above.

Renderer tests:

- completed MR2 landmarks draw through `bespoke:<assetKey>` operations.
- completed first-slice landmarks still draw through bespoke operations.
- completed landmarks without `assetKey` still draw generic silhouettes.
- unsupported `assetKey` values still fall back to generic silhouettes.
- under-construction MR2 landmarks do not call bespoke operations and keep construction ghost drawing.
- reduced-motion MR2 rendering still draws nonblank bespoke glyphs.
- each MR2 bespoke draw function emits ordinary Canvas path operations in addition to its `bespoke:<assetKey>` sentinel, so tests catch accidental empty marker-only implementations.

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

- Four MR2 landmark metadata entries have supported bespoke `assetKey` values.
- The bespoke registry supports the original three Stage 2I keys plus the four MR2 keys.
- Completed World Archive, Starvault Observatory, Storm Signal Spire, and Internet landmarks use bespoke Canvas drawings.
- Generic Stage 2G rendering remains available for all non-bespoke legendary landmarks.
- Active construction ghosts and overflow medallions are unchanged.
- Unsupported authored asset keys fail tests before merge.
- No gameplay, save, UI action, audio/SFX, PWA, Tauri, or rival-intel behavior changes.
- Targeted tests, wonder regressions, build, and full tests pass before PR.
