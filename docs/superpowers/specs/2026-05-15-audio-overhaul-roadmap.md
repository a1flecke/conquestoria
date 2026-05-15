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
   - **G2** — on `game:ended`, fade music master to silence over **1.5s** (revised from 4s per UX-1). Defeat/victory stingers ship in Spec 3.
   - **G3** — `AudioSystem` subscribes to `document.visibilitychange`; suspends `AudioContext` when hidden, resumes when visible.
   - **G4** — pause menu = music continues at normal volume (no duck, no pause).
   - **A1** — era-base crossfade is triggered at stinger-end (duck-restore boundary), not at a hardcoded mid-stinger offset.
   - **A2** — `mixer.playOneShot()` is duck-neutral. Ducking is an explicit `mixer.setSnapshot('stinger-duck')` before the stinger and re-assertion of the intended snapshot after.
   - **A3** — `MusicDirector` owns the "intended" snapshot state (`peace` / `at-war`); mixer applies snapshots imperatively and is stateless w.r.t. game-domain state.
   - **A4** — Spec 1 scope includes wiring a `currentPlayer:changed-after-handoff` event from the handoff confirmation modal if it does not already emit one.
   - **A5** — director ignores events whose payload does not reference the current player (no per-civ era tracking).
   - **D-A9** — overlapping stingers (< 500ms apart): second stinger truncates the first via a 200ms cross-cut. Known edge; revisit if audible during curation.
   - **D-A10** — `mixer.setBusSource(bus, buffer, { loopStart, loopEnd }, fadeMs)` plumbs loop points from the catalog entry.

   **Spec 1 post-review additions (locked):**
   - **M-1** — mute semantics: `musicEnabled=false` sets master music gain to 0 (sources keep running; instant re-enable resumes current snapshot). `sfxEnabled=false` sets SFX bus to 0. Context never suspends due to mute. Stingers respect `musicEnabled` (they are music).
   - **M-2** — mute is a hard-override that wins against any in-flight fade (including the G2 game-end fade).
   - **W-Scope** — war snapshot triggers on at-war with **any** opponent (major civs, minor civs, barbarians). Tiered war music (different intensity for barbarian raid vs. major-civ war vs. minor-civ war) is deferred to **Spec 4 candidate W-Tier**.
   - **UX-2** — on hot-seat handoff that crosses an era boundary, play a **softened "transition cue"** (a single sustained chord, not the full era-advance stinger). Preserves privacy and gives the player an audible cue. Reuses the Stinger bus; new asset slot: `STINGER.eraTransitionCue`.
   - **UX-3** — `visibilitychange` resume is defensive: also re-attaches a one-time `pointerdown` resume listener on visibility-show so iOS Safari edge cases where the context re-suspends in the background are handled.
   - **UX-4** — first user gesture in the session resumes audio regardless of which screen the user is on (save-load deep-link case); pointerdown listener is registered on `document`, not on the "New Game" button.
   - **Au-2** — volume sliders use a perceptual square-law curve (`gain = v * v`) so the slider feels linear to the ear.

2. **Spec 2 — Combat & Action SFX** *(later)* — `2026-05-15-audio-overhaul-spec-2-combat-sfx.md`

   **Goal:** Per-unit-type sound effects (S3) — distinct audio identity for every unit on the battlefield.

   **Scope:**
   - **Per-unit-type SFX catalog**: ~60–80 sounds total. Per unit type: attack-swing, attack-impact (hit), death. For ranged units: ranged-loose, ranged-impact. For mounted units: hoofbeats movement loop. For naval units: row/sail movement loop.
   - **Movement audio**: per-locomotion-class loops (foot/horse/wheel/sail) gated by "unit is currently moving" state.
   - **Death audio**: per-unit-type death cry.
   - **New trigger points** in `src/systems/unit-movement-system.ts` (movement begin/end), `src/main.ts` combat resolution, unit-death cleanup branches.
   - **SFX catalog** at `src/audio/sfx-catalog.ts` following the same data-driven pattern as `audio-catalog.ts`. Catalog-on-disk integrity test extends from Spec 1.
   - **Asset budget**: ~2–3 MB total (60–80 short OGGs × ~30 KB each).
   - **Reuses Spec 1 infrastructure**: SFX bus is already wired through the mixer; `AudioLoader` already exists; mock-context test pattern carries forward.

   **Out of scope (Spec 2):** Music changes, voice lines, ambient looping audio (forest birds, ocean waves), UI-button sound redesign beyond what already exists.

3. **Spec 3 — Adaptive Music + Voice Lines** *(later)* — `2026-05-15-audio-overhaul-spec-3-adaptive-voice.md`

   **Goal:** Full A3 adaptive music + E3 voice lines + remaining stingers + per-channel mixer UI.

   **Scope:**
   - **Adaptive state expansion**: new snapshots `unrest` (low-happiness in any city), `golden-age` (civ is in a golden age), `brink-of-defeat` (current player has ≤ 1 city remaining). Each is a per-era tension layer crossfaded into the Adaptive bus.
   - **State observers**: `MusicDirector` extended with handlers for `civ:happiness-low`, `civ:happiness-recovered`, `civ:golden-age-started`, `civ:golden-age-ended`, `civ:near-defeat`, `civ:recovered-from-near-defeat`.
   - **Voice-line system**: short voiced advisor lines (~1–3s each) per major civ for key events. ~8–12 civs × ~10 events ≈ 80–120 clips. New mixer bus: `voice`. New AudioFamily-style mapping: `CIV_TO_VOICE_PACK`.
   - **Full stinger set (E2 completion)**: wonder-built, tech-researched (major), peace-signed, civ-defeated, victory, defeat. Added to `STINGER` catalog.
   - **Mixer UI**: per-channel volume sliders (master / music / sfx / voice / stinger). Replaces Spec 1's master-only UI.
   - **Voice + stinger ducking**: voice line plays → ducks music + stinger buses but not SFX. Stinger plays → ducks all but voice.
   - **Asset budget**: ~15–20 MB total (adaptive layers + voice + remaining stingers).

   **Out of scope (Spec 3):** Per-era × per-family accents (that is Spec 4 Ac2); voice-line localization to non-English; bar-locked musical transitions.

4. **Spec 4 — Audio Polish** *(candidate; create only if Spec 3 fills up)* — `2026-05-15-audio-overhaul-spec-4-polish.md`
   Reserved bucket for items pushed out of Specs 1–3.

   **Spec 4 candidate items:**
   - **Ac2 upgrade** — accent per (family × era), 60 loops total. Replaces Spec 1's Ac1.
   - **W-Tier — tiered war music** — split the binary `at-war` snapshot into `at-war-barbarian` (lower intensity), `at-war-minor` (medium), `at-war-major` (full). Each per era. Pulls W-Scope into proper hierarchy.
   - **Musical-time-aware transitions** — snap snapshot changes to bar boundaries instead of linear time fades (Spec 1 limitation M1).
   - **Audio quality tiers** — Low/Med/High OGG variants with runtime selection (Spec 1 limitation M2).
   - **Catalog ergonomics** — `defineEra({...})` helper to reduce per-era Record duplication (Spec 1 limitation M3).
   - **Voice-line localization** — non-English voice packs (deferred from Spec 3).
   - **Ambient looping audio** — forest birds, ocean waves, urban hubbub, gated by tile-type the camera is centered on.

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
