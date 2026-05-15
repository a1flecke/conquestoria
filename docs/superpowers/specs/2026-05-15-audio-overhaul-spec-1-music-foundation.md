# Spec 1 — Music Foundation (Audio Overhaul)

Part of the audio overhaul series. Parent index: [2026-05-15-audio-overhaul-roadmap.md](./2026-05-15-audio-overhaul-roadmap.md).

## What this spec ships

A layered, snapshot-driven music engine that replaces the current procedural drone. Eras 1–5 have flavored base loops; civilizations are grouped into 12 cultural families with their own accent loops; war is the first adaptive state; three event stingers (era advance, city founded, war declared) sit on top of a ducking mixer. Asset loading is lazy with Service Worker caching.

The user-visible improvement on merge is the **removal of the hum** (deletion of `src/audio/music-generator.ts`). Real audio assets land via a follow-up MR series in collaboration with the user; Spec 1 ships with silent placeholder OGGs so the architecture can merge before curation completes.

## Locked-in decisions

Captured in the roadmap, summarized here so this file stands alone:

- **B3** layered music (era base + civ accent mixed at runtime)
- **Er2** explicit configs for eras 1–5, fallback to era 5 for era 6+
- **C2** 12 cultural families covering 29 major civs + 12 minor civs
- **Ac1** one era-agnostic accent per family (Ac2 deferred to Spec 4)
- **H2** solo play stable on human civ; hot-seat accent rotates after handoff confirm
- **L2** lazy fetch + Service Worker cache, war layer pre-bundled
- **W1** binary war adaptive layer, current-player-scoped, 2s fade
- **St2** stingers: era advance (×5, era-flavored), city founded, war declared
- **F1** OGG Vorbis only
- **D1** delete `music-generator.ts` outright
- **U1** keep existing music/sfx toggles + volume sliders (per-channel UI deferred to Spec 3)
- **R1–R3, G1–G4, A1–A5, D-A9, D-A10** — first-pass design-review refinements; see roadmap for full text
- **M-1, M-2** — mute semantics: `musicEnabled=false` zeros master music gain instantly, sources keep running, hard-overrides in-flight fades
- **W-Scope** — war snapshot triggers on at-war with any opponent (major civ, minor civ, barbarian); tiered split deferred to Spec 4 (W-Tier)
- **UX-1** — game-end music fade is **1.5s** (revised from 4s) to align with post-game screen reveal
- **UX-2** — cross-era hot-seat handoff plays a softened single-chord transition cue, not the full advance stinger; new asset slot `STINGER.eraTransitionCue`
- **UX-3** — defensive iOS Safari resume: if context fails to resume on `visibilitychange`, re-arm a `pointerdown` listener
- **UX-4** — `pointerdown` resume listener is on `document` (not bound to "New Game"), handles deep-link save-load with no prior user gesture
- **Au-2** — volume sliders use a square-law perceptual curve (`gain = v * v`)
- **H-3** — SFX routing: `sfx.ts` exports a `routeSfxThrough(node)` setup function called once by `AudioSystem` with `mixer.getSfxRoutingNode()`
- **H-5** — minor civ family heuristic: each minor civ maps to the audio family of its closest historical/cultural parent
- **H-6** — bundle caps: initial install ≤ 5 MB, full cache ≤ 25 MB, per-file ≤ 2.5 MB
- **C-4** — `TrackEntry.loop: LoopPoints` (deduplicated with mixer's loop-point type)
- **Cf-2** — era-stinger suppression on handoff is its own locked rule, not a parenthetical

## Subsection files

This index intentionally stays small. The full design lives in four focused subsection files:

1. **[Architecture and component contracts](./2026-05-15-audio-overhaul-spec-1-architecture.md)** — module map, class APIs, mixer bus topology, snapshot model, dependency wiring.

2. **[Data flow](./2026-05-15-audio-overhaul-spec-1-data-flow.md)** — end-to-end traces for the five player-visible moments: cold start, save load, era advance, war declared, hot-seat handoff, game end, tab visibility. These are the contracts tests assert.

3. **[Asset catalog and curation workflow](./2026-05-15-audio-overhaul-spec-1-assets-and-curation.md)** — asset inventory, musical constraints, curation order, source preferences, collaboration protocol with the user, attribution file, placeholder-OGG strategy.

4. **[Testing strategy](./2026-05-15-audio-overhaul-spec-1-testing.md)** — mock `AudioContext` pattern, per-module test responsibilities, transition-event regressions, catalog-on-disk integrity, verification gate before claiming complete.

## Out of scope

These belong to later specs and must not be touched in Spec 1:

- Per-unit-type SFX, movement audio, death audio → **Spec 2**
- Adaptive states beyond war (unrest, golden age, brink-of-defeat) → **Spec 3**
- Voice-line system → **Spec 3**
- Full stinger set (wonder, tech, peace, defeated, victory) → **Spec 3**
- Per-channel mixer UI → **Spec 3**
- Per-era × per-family accents (Ac2), bar-locked transitions, audio quality tiers → **Spec 4 candidate bucket**
