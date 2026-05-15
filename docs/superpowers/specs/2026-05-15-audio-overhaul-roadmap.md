# Audio Overhaul Roadmap — Index

**Origin:** GitHub issue [#3](https://github.com/a1flecke/conquestoria/issues/3) — "Music is not great. A lot of hum in the stone age. Can barely hear the other notes."

**Goal:** Replace the current procedural drone-based audio with great audio: music that matches era and civilization, SFX that match units and actions, milestone stingers, and civ-specific advisor voice lines.

This file is the **index**. Decisions and child specs live in sibling files; this index stays small to survive context compaction.

## Locked-in decisions

| Decision | Choice | Notes |
|---|---|---|
| Music architecture | **B3 — Layered** | Era base loop + civ accent loop, mixed at runtime |
| Adaptive music | **A3 — Multi-state** | Tension layers for war, unrest, golden age, brink-of-defeat |
| SFX depth | **S3 — Per-unit-type** | Distinct sounds for every unit type + movement + death |
| Stingers / voice | **E3 — Stingers + voice lines** | Civ-specific advisor lines for milestone events |
| Asset source | **CC-licensed pre-recorded** | incompetech, soundimage, freesound, kenney, sonniss, freepd, musopen — CC0/CC-BY only (no SA/NC) |
| Curation model | **User-in-the-loop** | Claude shortlists candidates; user listens and approves; commits include attribution |

## Decomposition — three sequential specs

Each spec is one brainstorm → plan → MR cycle. Ship in order.

1. **Spec 1 — Music Foundation** *(design in progress)* — `2026-05-15-audio-overhaul-spec-1-music-foundation.md`
   Layered music engine, era + civ accents, one adaptive layer (war), stinger architecture, asset-loading pipeline. Fixes the reported hum bug.

   **Spec 1 locked-in decisions:**
   - Eras: **Er2** — explicit configs for eras 1–5; era N>5 falls back to era 5 track.
   - Civ accents: **C2** — 12 cultural families (see Spec 1 doc for table); fantasy civs proxy Celtic/Nordic/dark-medieval source material.
   - Accent×era variation: **Ac1** for Spec 1 (one era-agnostic accent per family); **Ac2** (family × era matrix) is the long-term goal, deferred.
   - Hot-seat: **H2** — solo play uses human civ's accent persistently; in hot-seat, accent crossfades on `currentPlayer` rotation *after* the handoff screen (no spoilers).
   - Loading: **L2** — lazy fetch + Service Worker cache. War layer pre-bundled; era N+1 preloaded when civ approaches era advance.
   - War adaptive layer: **W1** — binary on `civilizations[currentPlayer].atWarWith.length > 0`; current-player-scoped; ~2s fade.
   - Stinger set: **St2** — era-advance (×5, era-flavored) + city-founded (generic) + war-declared (generic). Event-driven architecture; music ducks ~6 dB during stinger; queue if <500ms apart.
   - File format: **F1** — OGG Vorbis only.
   - Legacy code: **D1** — delete `src/audio/music-generator.ts` (it is the bug being fixed). Cold start = silence until first track loads (~1–2s).
   - Settings UI: **U1** — keep existing music/sfx toggles + volume sliders; no per-channel UI in Spec 1 (deferred to Spec 3).

   **Spec 1 design-review refinements (locked):**
   - **R1** — delete `audio-manager.ts` facade; update `main.ts` call sites directly to a new `AudioSystem` entry point.
   - **R2** — game events carry payload state; `MusicDirector` handlers are pure functions of their payload (no state-getter injection).
   - **R3** — `AudioSystem` owns `AudioContext` lifecycle: starts suspended, one-time `pointerdown` resume listener, single dep injected into `AudioMixer`.
   - **G1** — `AudioSystem.start(state)` runs identically on save-load and new-game cold-start.
   - **G2** — on `game:ended`, fade music master to silence over 4s (no asset; defeat/victory stingers ship in Spec 3).
   - **G3** — `AudioSystem` subscribes to `document.visibilitychange`; suspends `AudioContext` when hidden, resumes when visible.
   - **G4** — pause menu = music continues at normal volume (no duck, no pause).
   - **A1** — era-base crossfade is triggered at stinger-end (duck-restore boundary), not at a hardcoded mid-stinger offset.
   - **A2** — `mixer.playOneShot()` is duck-neutral. Ducking is an explicit `mixer.setSnapshot('stinger-duck')` before the stinger and re-assertion of the intended snapshot after.
   - **A3** — `MusicDirector` owns the "intended" snapshot state (`peace` / `at-war`); mixer applies snapshots imperatively and remains stateless beyond Web Audio internals.
   - **A4** — Spec 1 scope includes wiring a `currentPlayer:changed-after-handoff` event from the handoff confirmation modal if it does not already emit one.
   - **A5** — director ignores events whose payload does not reference the current player (no per-civ era tracking).
   - **D-A9** — overlapping stingers (< 500ms apart): second stinger truncates the first via a 200ms cross-cut. Known edge; revisit if audible during curation.
   - **D-A10** — `mixer.setBusSource(bus, buffer, { loopStart, loopEnd }, fadeMs)` plumbs loop points from the catalog entry.

2. **Spec 2 — Combat & Action SFX** *(later)* — `2026-05-15-audio-overhaul-spec-2-combat-sfx.md`
   Per-unit-type sounds, movement audio, death audio, new SFX trigger points.

3. **Spec 3 — Adaptive Music + Voice Lines** *(later)* — `2026-05-15-audio-overhaul-spec-3-adaptive-voice.md`
   Remaining adaptive states, voice-line system per civ, full stinger set, per-channel mixer UI.

4. **Spec 4 — Audio Polish** *(candidate; create only if Spec 3 fills up)* — `2026-05-15-audio-overhaul-spec-4-polish.md`
   Reserved bucket for items pushed out of Specs 1–3.

   **Spec 4 candidate items:**
   - **Ac2 upgrade** — accent per (family × era), 60 loops total. Replaces Spec 1's Ac1.
   - **Musical-time-aware transitions** — snap snapshot changes to bar boundaries instead of linear time fades (Spec 1 limitation M1).
   - **Audio quality tiers** — Low/Med/High OGG variants with runtime selection (Spec 1 limitation M2).
   - **Catalog ergonomics** — `defineEra({...})` helper to reduce per-era Record duplication (Spec 1 limitation M3).

## Cross-cutting deferred questions

Assigned to the spec that needs to answer them:

- **Bundle size cap** — Spec 1 sets a tentative target; Spec 3 confirms total. (Initial estimate: 40–65 MB total across all specs.)
- **Eras supported** — current audio config covers 1–4; game has 5+. Spec 1 fixes for music; Spec 2 for SFX.
- **Civilization accent list** — which playable factions get accent loops. Spec 1.
- **Hot-seat civ-switching music behavior** — `currentPlayer` rotates every turn; mix must handle frequent civ changes gracefully. Spec 1.
- **Mixer UI scope** — per-channel sliders deferred to Spec 3; Spec 1 keeps existing music/SFX toggles working.

## Curation workflow

Per-asset cycle:
1. Claude proposes shortlist with source URL, license, length, BPM/key, rationale.
2. User listens, approves/rejects, requests alternates.
3. Claude commits approved asset to repo and updates `AUDIO-CREDITS.md` (CC-BY attribution).

## Living-doc protocol

When a child spec is written, decision changes, or a deferred question is resolved — update this index. It is the single source of truth for what is locked in vs. open.
