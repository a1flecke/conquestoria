# Stage 2E Natural Wonder Spectacle Expansion Design

**Date:** 2026-05-26
**Status:** Approved for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`

## Purpose

Stage 2E makes discovered natural wonders feel more alive across the surfaces that already exist: map, Codex, and discovery reveal. The goal is wonder, spectacle, and world magic, not gameplay efficiency.

The slice is natural-wonder first. Legendary city landmark spectacle is explicitly deferred to Stage 2G, natural-wonder audio playback is deferred to Stage 2H, and real video/loop work remains Stage 3.

Stage 2E must distinguish between map truth and Codex presentation. Map spectacle is current-visibility gated because it can imply live world state. Codex and replay spectacle is allowed for already discovered natural wonders because it is a player-controlled reference presentation, not map intel.

## Player Experience

Natural wonders should feel like places with energy. A volcano breathes heat, auroras drift, water glints and flows, storms flash, forests sparkle with small life, sands ripple, and ruins shimmer with age.

The strongest spectacle belongs in discovery and player-triggered replay moments. The map can be bold, but it must stay readable during normal strategy play. The Codex can feel alive, but it must keep facts, source images, attribution, and actions easy to read.

## Scope

In scope:

- Big spectacle effects for currently live visible natural wonder map landmarks.
- Shared per-wonder visual recipes composed from reusable primitives.
- Codex/vignette accents using the same recipes.
- Player-triggered Codex replay of the amplified recipe animation.
- Amplified 3-5 second discovery reveal variants using the same recipes.
- Required per-wonder sound mood metadata with no audio playback yet.
- Convention-enforcing tests that fail when future natural wonders are missing required spectacle fields.

Out of scope:

- Legendary city landmark art or spectacle.
- Actual natural-wonder audio playback, stingers, loops, or audio assets.
- Real video files, video loops, or generated video assets.
- New gallery/debug surfaces.
- Gameplay changes to placement, yields, discovery, AI, rewards, quests, race rules, saves, or platform behavior.

## Architecture

Create a shared natural-wonder spectacle recipe catalog. The catalog is presentation-only: gameplay never reads from it, and it never mutates game state.

Proposed modules:

- `src/systems/wonder-spectacle/types.ts` defines primitives, palette keys, surface support, reduced-motion fallbacks, reveal variants, timing hints, affinity tags, and sound mood keys.
- `src/systems/wonder-spectacle/recipes.ts` defines one recipe for every natural wonder ID.
- `src/systems/wonder-spectacle/presentation.ts` exposes recipe lookup and shared render-mode helpers such as `getWonderSpectacleRenderMode`.
- `src/systems/wonder-spectacle/validation.ts` exposes recipe coverage and support-table helpers used by tests.
- `src/renderer/wonders/natural-wonder-effects-renderer.ts` adapts recipes to Canvas map effects.
- `src/ui/wonder-spectacle-vignette.ts` adapts recipes to SVG/CSS Codex and discovery reveal effects.

Data flow:

1. Existing visibility and tile presentation code decides whether a wonder tile is live, last-seen, low zoom, or reduced motion.
2. Renderer/UI requests the recipe by `wonderId`.
3. Each surface asks the shared presentation helper whether animation is allowed for its current mode.
4. The recipe supplies primitives, palette, timing hints, and fallback metadata.
5. Surface adapters draw the recipe with Canvas or SVG/CSS.

Recipes are authored by wonder ID for art quality, but include affinity metadata so tests can catch obvious mismatches with existing wonder/Codex identity. Renderers must not derive spectacle directly from yields, rewards, or gameplay effects.

Render-mode policy must be shared, not duplicated inside each adapter. The map, Codex, and discovery reveal can have different allowed modes, but the decision should be explicit and testable:

- `map-animated` only for live visible natural wonder tiles at non-low zoom and non-reduced motion.
- `map-static` for low zoom, last-seen memory, reduced motion, or unknown recipes.
- `codex-ambient` for discovered natural wonder Codex pages when motion is allowed.
- `codex-static` for reduced motion or missing recipes.
- `reveal-amplified` for discovery reveal and player-triggered Codex replay when motion is allowed.
- `reveal-static` for reduced motion or missing recipes.

## Visual Recipe Model

Each natural wonder has one recipe with shared primitives and per-surface primitive lists.

Initial primitive vocabulary:

- `heatGlow`
- `smokePlume`
- `embers`
- `waterFlow`
- `sparkle`
- `lightBands`
- `mist`
- `lightning`
- `fireflies`
- `leafDrift`
- `sandRipple`
- `stonePulse`
- `crystalGleam`
- `fossilDust`
- `deepWaterAura`
- `ruinGlimmer`

Each recipe includes:

- `wonderId`
- `paletteKey`
- `affinityTags`
- `surfaceSupport`
- `mapPrimitives`
- `codexPrimitives`
- `revealPrimitives`
- `intensity: 'spectacle'`
- `reducedMotionFallback`
- required `soundMood`
- optional timing hints such as `slow`, `pulse`, `drift`, or `flicker`

Example:

```ts
{
  wonderId: 'great_volcano',
  paletteKey: 'fire',
  affinityTags: ['fire', 'stone', 'danger'],
  surfaceSupport: ['map', 'codex', 'reveal'],
  mapPrimitives: ['heatGlow', 'smokePlume', 'embers'],
  codexPrimitives: ['heatGlow', 'embers'],
  revealPrimitives: ['heatGlow', 'smokePlume', 'embers', 'stonePulse'],
  intensity: 'spectacle',
  reducedMotionFallback: 'static-aura',
  soundMood: 'volcanic-breath',
}
```

The discovery reveal amplifies the recipe. It may draw larger glows, stronger bands, and staged pulses, but it must not introduce a separate reveal-only art language.

## UI And UX Guardrails

Map:

- Spectacle appears only on currently live visible natural wonder tiles.
- Low zoom renders static landmarks only.
- Last-seen remembered wonder tiles render static landmarks only.
- Reduced motion renders static landmark or static aura only.
- Effects are decorative and non-interactive.
- Effects must stay centered on or near the wonder tile.
- Effects must not hide units, cities, borders, fog, selection highlights, or UI overlays.
- Effects must not create a new click or hover target; existing tile input rules remain authoritative.

Layer order:

1. terrain/base tile
2. wonder aura/effects behind the landmark
3. natural wonder landmark shape
4. units, cities, borders, and selection above spectacle
5. DOM/UI overlays above everything

Codex:

- Natural wonder pages show an animated recipe accent/vignette.
- Codex spectacle is available for natural wonders the viewer has discovered, even if the map tile is not currently live visible.
- Animation must not compete with source images, educational facts, attribution, related links, or actions.
- Codex includes a small replay icon/button near the spectacle vignette.
- The replay control must be named as a visual replay such as `Replay animation`, not `Play video`, because Stage 2E does not add real video.
- Replay is player-triggered only and replays the 3-5 second amplified recipe variant.
- Replay must not replay discovery rewards, notifications, audio, or gameplay events.
- Replay state is local UI state only. It must not write to `GameState`, saves, history, notifications, or audio state.
- Reduced motion disables animation; replay should show the static hero state or be disabled with accessible explanatory text.
- The replay control should be architected so Stage 3 can later replace or augment it with real short video/loop playback if that spike succeeds.

Discovery reveal:

- Discovery reveal uses the amplified recipe variant for 3-5 seconds.
- Primary/default action remains continue.
- Atlas/Codex remains a secondary option.
- Reduced motion uses a static hero composition.

Fun guardrail:

The map can be visually bold, but the biggest "wow" is reserved for discovery reveal and Codex replay. This prevents constant map spectacle from becoming background noise.

## Privacy And Visibility

Recipes are safe content, but rendering is visibility-gated.

- Undiscovered natural wonders must not show spectacle, silhouettes, disabled cards, counts, recipe hints, or sound mood hints.
- Hot-seat rendering must use `state.currentPlayer` through existing presentation paths.
- Last-seen memory must not animate because animation implies current live visibility.
- Discovered-but-not-currently-visible natural wonders may animate in the Codex/replay context only, because the Codex is a reference surface rather than a live map-state surface.
- Rival or other-player legendary city landmark spectacle is out of scope for 2E.

## PWA, Tauri, And Performance

Stage 2E must not add bitmap/image particle assets or runtime network dependencies.

- Map effects use Canvas primitives.
- Codex and discovery reveal effects use SVG/CSS generated from recipe metadata.
- No new PWA cache asset category is needed for spectacle particles.
- The same shared code path must work in browser/PWA and macOS/Tauri.
- Reduced motion should honor existing app reduced-motion detection and CSS `prefers-reduced-motion` where relevant.
- Canvas map effects should avoid per-frame object churn and expensive full-map calculations.
- Canvas adapters should expose deterministic primitive support tables so tests can prove every recipe primitive has a supported map/UI/static rendering path.
- Low zoom disables spectacle to reduce visual noise and draw cost.

## Future Legendary Extension

Stage 2E should define primitives generically enough for Stage 2G to reuse them for legendary city landmark art, but Stage 2E must only ship natural-wonder recipes.

To support future extension, recipe types should not bake in `natural`-only assumptions beyond the Stage 2E recipe collection. Primitives may include metadata such as supported surfaces and future-compatible categories, so Stage 2G can reuse or reject primitives deliberately.

Stage 2G will own:

- completed legendary city landmark silhouettes and spectacle
- multiple-wonder city readability
- richer per-wonder legendary city art
- any legend-specific map/Codex/city integration

## Sound Metadata

Every natural wonder spectacle recipe must include a required `soundMood` key. Stage 2E does not play sound and does not add sound assets.

Stage 2H will own:

- mapping sound mood keys to real natural-wonder stingers or loops
- playback rules
- mute/reduced-audio behavior
- offline/PWA and macOS/Tauri audio asset review
- tests proving audio metadata and assets stay in sync

## Testing Requirements

Add future-extension contract tests, not only current behavior tests.

Recipe coverage:

- Every `WONDER_DEFINITIONS` natural wonder has exactly one spectacle recipe.
- Every recipe references a valid natural wonder ID.
- Every recipe has valid `paletteKey`, `affinityTags`, `surfaceSupport`, `mapPrimitives`, `codexPrimitives`, `revealPrimitives`, `reducedMotionFallback`, and required `soundMood`.
- Every recipe primitive is known.
- Every used primitive is supported by declared Canvas map adapter, SVG/CSS UI adapter, and reduced-motion fallback support tables.
- Recipe affinities align with existing natural wonder/Codex identity enough to catch obvious mismatches.
- Shared render-mode helpers have negative tests for live map without animation permission, last-seen memory, low zoom, reduced motion, undiscovered natural wonders, and Codex discovered-but-not-live-visible pages.

Renderer behavior:

- Live visible natural wonders use spectacle.
- Last-seen natural wonders use static rendering.
- Low zoom uses static rendering.
- Reduced motion uses static rendering.
- Undiscovered natural wonders do not render spectacle.
- Hot-seat/current-player visibility does not leak effects.

Codex behavior:

- Natural wonder Codex pages render a spectacle accent/vignette from the recipe.
- Replay control is visible, accessible, and player-triggered.
- Replay changes only visual animation state.
- Replay does not trigger rewards, notifications, audio, gameplay events, or state mutation.
- Replay control text/label must not promise video playback in Stage 2E.
- Discovered natural wonders can replay Codex spectacle even when the map tile is not currently live visible.
- Undiscovered natural wonders never expose Codex replay, spectacle recipe names, primitive names, or sound mood metadata.
- Reduced motion disables or replaces replay with a static equivalent.

Discovery reveal behavior:

- Discovery reveal consumes the same recipe and amplified variant.
- Continue remains the primary/default action.
- Atlas/Codex remains secondary.
- Reduced motion uses the static hero path.

Required verification before merge:

- `scripts/check-src-rule-violations.sh` for changed `src/` files
- targeted mirrored tests for changed systems/UI/renderer files
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn build:tauri`
- `./scripts/run-with-mise.sh yarn test`

## Non-Goals

- No new player-facing gallery or developer gallery.
- No new gameplay affordance on wonder tiles.
- No change to map input priority.
- No sound playback.
- No video playback.
- No legendary city landmark spectacle.
- No platform-specific branch for browser versus Tauri.
