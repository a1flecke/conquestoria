# Stage 2G: Legendary City Landmark Art Expansion Design

**Date:** 2026-05-26
**Status:** Draft for review
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`

## Purpose

Stage 2G upgrades completed legendary wonders from small hash-assigned mini icons into an authored, convention-tested landmark system around host cities. The goal is a visible district of achievement: readable at map scale, fun to watch over time, extensible for future bespoke art, and safe for hot-seat/privacy.

This slice remains presentation-first. It does not change legendary wonder costs, rewards, eligibility, quests, race rules, AI strategy, save semantics, or Atlas intel rules. It improves how already-owned legendary achievements and late-stage owned construction appear on map, city panel, Codex, and inspection surfaces.

## Goals

- Replace hash-based legendary landmark assignment with explicit authored metadata for every current legendary wonder.
- Use the Medallion Ring Upgrade as the 2G base direction: deterministic around-city slots with richer silhouettes, palette, aura, motion, and overflow behavior.
- Support all current legendary wonders with explicit metadata, while allowing related wonders to share families/variants where bespoke art is not yet available.
- Add subtle owned-city motion now through data-driven motion tokens.
- Make future bespoke Canvas drawings or sprites easy to plug in per wonder through optional asset/renderer keys.
- Show active owned construction ghosts in panels immediately and on the map only after major progress.
- Keep more-than-six landmark cities readable with deterministic 5-turn rotation plus a stable overflow marker.
- Add compact landmark previews to the host city panel and owned completed Codex pages.
- Keep map landmarks decorative and non-interactive; use existing inspection/city/Codex surfaces for names and details.
- Include targeted city-renderer layer extraction so landmark ordering is explicit and testable.
- Strengthen convention tests so future legendary wonders cannot merge without valid landmark metadata and renderer support.

## Non-Goals

- No bespoke per-wonder Canvas drawings, sprites, or historically referenced art assets in 2G. That is Stage 2I.
- No external art-source/citation ledger requirement in 2G because token silhouettes/effects are abstract UI art.
- No rival legendary map landmarks, host-city reveal, or location-intel display in 2G. That is Stage 2J.
- No full city-renderer architecture rewrite in 2G. This slice performs only the targeted extraction needed for landmark layering; the broader pass is Stage 2K.
- No new player-facing debug/gallery surface.
- No direct map click target for landmark medallions or overflow.
- No natural-wonder audio, legendary audio, video, or real loop playback.
- No gameplay, AI, reward, quest, build-cost, or save-format changes.

## Player Experience

Owned completed legendary wonders appear as solid medallion-ring landmarks around the visible host city. The ring should feel like a small legendary district: each wonder has a deliberate silhouette family, motif, palette, scale, aura, and restrained motion.

The map stays strategic first. Landmarks must not obscure unit sprites, city labels, health bars, production badges, occupation/unrest/breakaway indicators, borders, selection highlights, or touch-critical selection visuals. At low zoom or small/mobile map scale, landmarks collapse to compact/static forms.

Active owned legendary construction gets a preview:

- City panel and Codex preview show an unfinished construction ghost as soon as the project is building.
- The map shows a faint owned scaffold/outline only after major progress, using the existing `Final works` threshold (`>= 60%` progress).
- Construction ghosts are labeled `Under construction`.
- Ghosts are never counted as completed landmarks.
- Ghosts disappear if the project is lost, abandoned, completed, or no longer building.

When one city has more than six completed legendary wonders:

- The map renders five landmark slots plus a stable `+N` overflow medallion.
- The visible five rotate every 5 game turns using deterministic completion-order windows.
- Ordering is by completion turn, then wonder ID.
- The rotation seed is `Math.floor(state.turn / 5)`, not wall-clock time.
- Reduced motion does not disable this rotation because it changes only with game state, not animation.
- Existing city/tile inspection and safe city/Codex surfaces list all completed wonders, including those hidden behind `+N`.

## UI And UX Rules

### Map

- Render owned completed landmarks only for owned host cities that are currently visible to the viewer.
- Render active owned construction ghosts on the map only for owned visible host cities at `>= 60%` progress.
- Do not render rival completed landmarks, rival active ghosts, or known-rival location markers in 2G.
- Keep landmark medallions decorative. City selection, unit selection, movement, attack, tile inspection, and existing input priority remain authoritative.
- Low zoom uses compact/static markers.
- Reduced motion disables continuous pulse/glint/aura animation and uses static fallbacks.
- Normal zoom may show subtle motion tokens such as glow or glint when reduced motion is off.

### City Panel

- Add a compact `Legendary landmarks` preview for the selected owned city.
- Completed wonders render as solid preview items.
- Active owned construction renders as an unfinished ghost preview and `Under construction`.
- The preview is not a new management surface. Existing production/wonder controls remain the action surfaces.
- If more wonders exist than fit comfortably, the panel lists all names textually or uses a compact overflow line while keeping every item reachable/readable.

### Codex

- Owned completed legendary Codex pages show a compact city landmark preview using the same metadata and adapters as the map/city panel.
- Owned active construction pages may show the same unfinished ghost preview with `Under construction`.
- Rival intel pages from Stage 2F do not show map landmarks, host-city previews, or location details unless future Stage 2J intel explicitly permits location/host knowledge.

### Inspection

- Existing city/tile inspection text lists all completed legendary wonders in a safely visible owned city.
- The inspection surface is the explanation path for overflow, not a new landmark map target.

## Data Model And Metadata

Create an explicit legendary landmark metadata catalog. Do not derive known legendary visual identity from hashes.

Every current legendary wonder must have metadata with fields equivalent to:

- `wonderId`
- `family`
- `variant`
- `motif`
- `palette`
- `scale`
- `aura`
- `motion`
- `constructionGhost`
- optional future `assetKey`

The catalog is presentation-only. It must not duplicate gameplay effects, rewards, requirements, quest rules, yields, AI values, or save data.

Runtime may retain a defensive fallback for corrupted saves or unknown IDs, but development tests must fail when a real legendary definition lacks metadata.

## Rendering Architecture

Use token-based adapters now and leave a clean replacement path for bespoke art later.

- `family`, `variant`, `motif`, `palette`, `aura`, `motion`, and `constructionGhost` are domain-level tokens.
- A resolver maps legendary-facing tokens such as `dedicationGlow`, `bannerGlint`, `foundationPulse`, `civicAura`, or `processionSpark` to supported shared Canvas/SVG primitives.
- Each token must have map, panel/Codex, static, and reduced-motion support.
- If a future `assetKey` or bespoke renderer exists, the adapter may use it instead of token primitives for that wonder.

2G includes a targeted city-renderer layer extraction:

- Separate the landmark drawing pass enough that layer order is explicit.
- Put landmark aura/ghost elements behind the city label and selection-critical overlays.
- Put final readable labels, production badges, unit sprites, and critical indicators above landmark decoration where needed.
- Add renderer tests that prove the intended operation order.

Do not perform the full city renderer cleanup in 2G. Stage 2K owns broader composable render passes for city icon, labels, badges, overlays, selection, occupation/unrest/breakaway indicators, production badges, and landmark sublayers.

## Privacy And Visibility

2G renders owned landmarks only.

The current Stage 2F completed rival intel means the viewer knows a rival completed a wonder. It does not reveal host city, map location, or landmark placement. Therefore:

- hidden rival completions must not create map entries
- Stage 2F completed intel alone must not create map entries
- visible rival cities alone must not create legendary landmark entries in 2G
- rival active projects must not create construction ghosts

Future Stage 2J may add `relationship: 'known-rival'` map entries only through explicit host/location intel. That work must include negative tests proving completed intel alone is insufficient.

## Testing Requirements

Stage 2G must be convention-enforced.

Metadata tests:

- every current legendary wonder definition has exactly one landmark metadata record
- metadata IDs match real legendary wonder IDs
- no duplicate metadata IDs
- no unknown metadata IDs
- no hash-based assignment is used for known legendary wonders
- every family, variant, motif, palette, aura, motion, construction ghost, and future `assetKey` token is known
- every token has map, panel/Codex, static, and reduced-motion renderer support

Renderer tests:

- every family/variant emits nonblank Canvas operations in test fixture renderers
- completed landmarks render nonblank Canvas operations
- active construction ghosts emit expected scaffold/outline operations
- low zoom renders compact/static output
- reduced motion suppresses continuous animation tokens
- operation order keeps landmark decoration below labels, badges, units, and selection-critical overlays where required

System/presentation tests:

- owned completed map entries are produced only for visible owned host cities
- owned active ghost entries are produced only for visible owned host cities at `>= 60%` progress
- active ghost entries are not produced below the major-progress threshold
- more-than-six cities render five visible landmarks plus `+N`
- overflow rotation changes deterministically every 5 game turns
- all completed wonders remain listed in inspection/city/Codex text even when not currently visible in the five-slot map window
- city panel compact preview renders completed and active ghost states from the same metadata
- owned Codex page compact preview renders from the same metadata

Privacy tests:

- hidden rival completions do not produce map landmarks
- Stage 2F completed rival intel does not produce map landmarks
- rival active projects do not produce construction ghosts
- hot-seat current-player/viewer changes do not leak another player's owned landmarks

Verification:

- targeted metadata, presentation, renderer, UI, and inspection tests
- `scripts/check-src-rule-violations.sh` for changed `src/` files
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`

## Authoring Guide Requirement

2G must add two authoring references:

- a short section in this spec explaining the product and privacy contract
- catalog-adjacent code documentation or README explaining exactly how to add/modify legendary landmark metadata

The guide must be enforced by tests rather than relying on memory. Future agents should be able to add a legendary wonder by following the guide and running the convention tests; missing metadata, missing renderer support, unknown tokens, or missing assets must fail before merge.

## Deferred Decisions

These deferred decisions must also be recorded in the canonical wonder roadmap.

- `2G-DEF-ART-01` -> **Stage 2I: Legendary Wonder Bespoke Art Pass**. Replace token silhouettes with per-wonder bespoke Canvas drawings or sprites as assets become available.
- `2G-DEF-SOURCE-01` -> **Stage 2I: Legendary Wonder Bespoke Art Pass**. Add art reference/citation notes and enforcement for historically inspired bespoke drawings/sprites. 2G token art does not require citations.
- `2G-DEF-INTEL-01` -> **Stage 2J: Legendary Landmark Intel Visibility**. Add known-rival landmark visibility only when explicit host/location intel exists. Completed rival intel alone remains insufficient.
- `2G-DEF-RENDER-01` -> **Stage 2K: City Renderer Layer Architecture Pass**. Expand 2G's targeted layer extraction into broader city-renderer composable passes.

## Acceptance Criteria

- Every current legendary wonder has explicit authored landmark metadata.
- Known legendary landmark identity is not hash-assigned.
- Owned visible completed legendary wonders render richer medallion-ring landmarks around host cities.
- Owned active legendary construction previews render in panels immediately and on the map only at `>= 60%` progress.
- More-than-six completed wonder cities show five visible landmarks plus `+N`, with deterministic 5-turn rotation.
- City/tile inspection, city panel, and owned Codex pages keep all completed wonders understandable even when the map ring overflows.
- Reduced motion and low zoom use static/compact fallbacks.
- Renderer layering keeps landmark art from obscuring critical city/unit/UI information.
- Rival completions, rival completed intel, and rival active projects do not create map landmarks or construction ghosts in 2G.
- The overall wonder roadmap names 2I, 2J, and 2K so deferred work is easy to rediscover.
