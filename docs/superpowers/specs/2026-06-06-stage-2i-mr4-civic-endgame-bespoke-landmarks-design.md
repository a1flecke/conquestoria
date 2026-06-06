# Stage 2I-MR4 Civic And Endgame Bespoke Landmark Art Design

**Date:** 2026-06-06
**Status:** Reviewed for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 2G Legendary City Landmark Art Expansion, Stage 2I MR1, Stage 2I-MR2 Knowledge And Signal Bespoke Landmark Art, Stage 2I-MR3 Material And Maritime Bespoke Landmark Art

## Purpose

Stage 2I-MR4 completes the Legendary Wonder Bespoke Art Pass for all current legendary city landmarks. MR1 added Oracle of Delphi, Grand Canal, and Sun Spire. MR2 added World Archive, Starvault Observatory, Storm Signal Spire, and Internet. MR3 added Moonwell Gardens, Ironroot Foundry, Tidecaller Bastion, and Leviathan Drydock.

MR4 adds the final civic and endgame batch:

- `whispering-exchange`
- `hall-of-champions`
- `gate-of-the-world`
- `manhattan-project`

This slice should make the remaining current legendary wonders visually recognizable in completed city landmark medallions. It must not change gameplay, saves, audio, UI actions, map actions, Codex actions, Stage 2J rival intel rules, PWA, Tauri, sprites, or Stage 2K renderer layer architecture.

## Goals

- Add typed `assetKey` metadata for the four MR4 wonders.
- Extend the existing bespoke landmark registry with four supported Canvas primitive drawings.
- Render completed visible landmarks for the four MR4 wonders through the bespoke path.
- Complete bespoke coverage for every current legendary wonder definition.
- Preserve generic Stage 2G fallback rendering for unknown wonder IDs and unsupported ad hoc asset keys.
- Preserve construction ghosts for all four MR4 wonders until a later slice explicitly designs bespoke construction variants.
- Add tests that fail if any authored `assetKey` does not resolve to a supported renderer entry.
- Add tests proving all current legendary wonders now have supported bespoke keys.
- Add tests proving the four MR4 entries use bespoke renderer operations and unsupported/missing keys still fall back safely.
- Keep Stage 2J known-rival landmark privacy and Stage 2K city pass ordering unchanged.

## Non-Goals

- Do not add new legendary wonders.
- Do not change the visual metadata family, variant, motif, palette, aura, motion, or construction-ghost tokens except to add `assetKey`.
- Do not add bitmap, SVG, external art, generated image, downloaded assets, or sprite-catalog entries.
- Do not add or change audio/SFX assets, audio triggers, mixer behavior, or audio attribution.
- Do not change gameplay rewards, production rules, quests, saves, AI, visibility gates, or rival intel.
- Do not add UI controls, labels, map actions, Codex actions, or panel behavior.
- Do not modify city renderer pass architecture or landmark layer ordering.
- Do not redesign medallions, slot rotation, overflow markers, reduced-motion behavior, or construction ghosts.
- Do not use literal disaster, blast, or mushroom-cloud imagery for `manhattan-project`.

## Bespoke Asset Scope

| Wonder | `assetKey` | Visual intent | Distinction requirement |
|---|---|---|---|
| `whispering-exchange` | `whispering-exchange-bespoke` | A compact exchange stall, ledger, or coin pair with subtle whisper arcs | Must read as trade/intel exchange, not Internet network, Grand Canal bridge, or generic market noise |
| `hall-of-champions` | `hall-of-champions-bespoke` | A civic hall facade with columns plus laurel or champion mark | Must read as victory hall, not Oracle shrine, World Archive stacks, or generic government building |
| `gate-of-the-world` | `gate-of-the-world-bespoke` | A gateway arch framing a horizon/world-line | Must read as world gate, not Grand Canal arch, Tidecaller Bastion wall, or city gate badge |
| `manhattan-project` | `manhattan-project-bespoke` | Abstract atom/laboratory geometry, such as orbital arcs around a compact lab core | Must read as scientific endgame project, not Internet network, Starvault Observatory, warning icon, or explosion |

All four drawings use existing landmark metadata palettes so color, glow, reduced-motion, and future palette tuning remain centralized in `src/systems/legendary-wonder-landmark-catalog.ts`.

MR4 drawings are authored Canvas primitives inside the existing landmark medallion. They are not standalone sprites and do not require external art attribution. Existing Codex image/source attribution remains governed by the source ledger. MR4 does not add external art assets, generated images, audio, or sampled media.

After MR4, every current legendary wonder should have a supported bespoke `assetKey`. Generic rendering must still exist for unknown/future wonder IDs and unsupported ad hoc keys so the renderer remains safe and extensible.

## Architecture

Keep the existing Stage 2I architecture:

- `src/systems/legendary-wonder-landmark-catalog.ts` owns optional `assetKey` metadata.
- `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` owns supported asset keys, resolver behavior, and per-key Canvas drawing functions.
- `src/renderer/wonders/legendary-wonder-renderer.ts` remains the integration point and asks the resolver whether a completed landmark has a supported bespoke asset.
- `src/renderer/city-render-passes.ts` and `src/renderer/city-renderer.ts` keep the Stage 2K layer pipeline unchanged.

MR4 should extend `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` with the four final current keys and add entries to the existing registry. The resolver API remains:

```ts
resolveLegendaryWonderBespokeAsset(assetKey: string | undefined): LegendaryWonderBespokeAsset | null
```

No UI, Codex, Atlas, city-panel, territory-inspection, or map-intel code should know which wonders are bespoke. Those surfaces already consume safe landmark presentation and map entries.

After MR4, the exact approved bespoke key list is:

- `oracle-of-delphi` -> `oracle-of-delphi-bespoke`
- `grand-canal` -> `grand-canal-bespoke`
- `sun-spire` -> `sun-spire-bespoke`
- `world-archive` -> `world-archive-bespoke`
- `moonwell-gardens` -> `moonwell-gardens-bespoke`
- `ironroot-foundry` -> `ironroot-foundry-bespoke`
- `tidecaller-bastion` -> `tidecaller-bastion-bespoke`
- `starvault-observatory` -> `starvault-observatory-bespoke`
- `whispering-exchange` -> `whispering-exchange-bespoke`
- `hall-of-champions` -> `hall-of-champions-bespoke`
- `gate-of-the-world` -> `gate-of-the-world-bespoke`
- `leviathan-drydock` -> `leviathan-drydock-bespoke`
- `storm-signal-spire` -> `storm-signal-spire-bespoke`
- `manhattan-project` -> `manhattan-project-bespoke`
- `internet` -> `internet-bespoke`

The list order above follows `getLegendaryWonderLandmarkMetadataCatalog()` order, because tests use that order to detect accidental omissions or surprise keyed entries.

## Rendering Contract

- Completed visible landmark with supported MR4 `assetKey`: draw the existing medallion, then draw the bespoke glyph.
- Completed visible landmark with no `assetKey`: draw the existing generic family silhouette. This path remains for unknown/future IDs after MR4.
- Completed visible landmark with unsupported `assetKey`: draw the existing generic family silhouette; catalog tests must prevent unsupported authored keys from merging.
- Under-construction landmark with or without `assetKey`: draw the existing construction ghost, not completed bespoke art.
- Overflow `+N` medallions remain unchanged.
- Reduced-motion mode still draws static bespoke forms; it must not add motion-only meaning.
- Low zoom may simplify by scale, but each glyph must remain nonblank and distinguishable by operation coverage.
- Known-rival landmarks from Stage 2J use the same safe renderer path only when they are already allowed to render; MR4 must not broaden when they render.

## UI, UX, Gameplay, And Audio Review

MR4 changes only the glyph drawn inside existing completed landmark medallions. The map, Codex, Atlas, city panel, territory inspection, buttons, labels, actions, saves, AI, and gameplay rules remain unchanged.

The UX goal is recognition: a player who has earned visibility should be able to distinguish trade exchange, champion hall, world gate, and late scientific project landmarks more easily than with generic token silhouettes.

The glyphs must not visually imply new actions, statuses, alerts, production states, combat states, or audio states:

- `whispering-exchange-bespoke` whisper arcs are identity marks only, not sound-wave meters, notification pings, or espionage-action prompts.
- `hall-of-champions-bespoke` laurels and hall columns are identity marks only, not victory-progress meters or selectable award buttons.
- `gate-of-the-world-bespoke` horizon marks are identity marks only, not map-edge portals, movement actions, or route overlays.
- `manhattan-project-bespoke` atom/lab marks are identity marks only, not warning icons, explosion indicators, damage markers, or active research controls.

No SFX work is required. There are no new sounds, no new playback triggers, no audio source attribution, and no mixer changes. Existing audio tests should not need updates for this slice.

## Visual Quality Guardrails

- Use simple Canvas primitives that remain readable in the existing medallion radius.
- Set fill/stroke styles inside each draw function rather than relying on prior pass state.
- Keep drawings centered around the provided `cx`, `cy`, and `radius`.
- Avoid tiny details that disappear at map scale.
- Avoid adding per-frame allocations beyond ordinary Canvas path work.
- Do not use `Math.random()` or any nondeterministic visual selection.
- Do not use `nowMs` to add pulsing, alert-like motion, or motion-only meaning.
- Do not load assets, touch DOM APIs, read storage, or call platform capabilities from the renderer.
- Use abstract Manhattan Project symbolism. Do not draw a mushroom cloud, bomb silhouette, blast wave, casualty symbol, skull, or fallout warning sign.

## Privacy And Gameplay

This is a presentation-only art slice. It must preserve existing visibility rules:

- Owned completed landmarks render when existing map presentation says they render.
- Owned active construction ghosts keep the existing progress gates.
- Rival completed intel alone does not reveal a host city, map marker, or landmark preview.
- Known-rival landmarks render only from the explicit Stage 2J paired host-location plus completed intel contract.
- Hot-seat viewers see only the current viewer's safe landmark entries.

MR4 does not change game state, save format, legendary wonder definitions, quests, rewards, or intel records.

## Testing Requirements

Catalog and registry tests:

- exact `assetKey` values are authored for `whispering-exchange`, `hall-of-champions`, `gate-of-the-world`, and `manhattan-project`.
- every current legendary wonder definition has one supported bespoke `assetKey` after MR4.
- every non-empty authored `assetKey` resolves to `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`.
- no unexpected landmark receives an unsupported or duplicate `assetKey`.
- generic fallback coverage uses an unknown/future wonder ID or cloned metadata without a supported key, because all current legendary wonders are bespoke after MR4.

Renderer tests:

- completed MR4 landmarks draw through `bespoke:<assetKey>` operations.
- completed MR1, MR2, and MR3 landmarks still draw through bespoke operations.
- unknown completed landmarks without `assetKey` still draw generic silhouettes.
- unsupported `assetKey` values still fall back to generic silhouettes.
- under-construction MR4 landmarks do not call bespoke operations and keep construction ghost drawing.
- reduced-motion MR4 rendering still draws nonblank bespoke glyphs.
- each MR4 bespoke draw function emits ordinary Canvas path operations in addition to its `bespoke:<assetKey>` sentinel.
- MR4 glyph geometry profiles are distinct from each other and from close existing lookalikes: Grand Canal for arches, Internet for network lines, Starvault Observatory for orbital/celestial arcs, World Archive for hall/archive rectangles, Oracle of Delphi for shrine columns, and Tidecaller Bastion for wall-like shapes.

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

- Four MR4 landmark metadata entries have supported bespoke `assetKey` values.
- Every current legendary wonder has a supported bespoke `assetKey`.
- Completed Whispering Exchange, Hall of Champions, Gate of the World, and Manhattan Project landmarks use bespoke Canvas drawings.
- Generic Stage 2G rendering remains available for unknown/future IDs, cloned metadata without an `assetKey`, and unsupported ad hoc asset keys.
- Active construction ghosts and overflow medallions are unchanged.
- Unsupported authored asset keys fail tests before merge.
- No gameplay, save, UI action, audio/SFX, sprite, PWA, Tauri, rival-intel, or city-render-pass behavior changes.
- Targeted tests, wonder regressions, build, and full tests pass before PR.
