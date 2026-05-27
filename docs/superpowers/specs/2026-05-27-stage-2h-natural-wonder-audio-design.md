# Stage 2H: Natural Wonder Audio Design

**Date:** 2026-05-27
**Status:** Reviewed draft for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** `docs/superpowers/specs/2026-05-26-natural-wonder-spectacle-expansion-design.md`

## Purpose

Stage 2H makes natural wonders audible. Stage 2E already gave each natural wonder a visual spectacle recipe and required `soundMood` metadata without playback. Stage 2H fills that contract with real audio assets, playback rules, attribution, and tests.

This is a bespoke-audio series, not a placeholder pass. Every natural wonder eventually receives one discovery/replay stinger and one ambient loop. Work is delivered as complete wonder packages so each merged slice has a clear player benefit and no partially wired player-facing audio.

## Goals

- Add real audible natural-wonder discovery stingers and ambient loops.
- Source assets from approved CC0 or CC-BY-compatible sources only.
- Keep attribution complete in `AUDIO-CREDITS.md`.
- Map each natural wonder's Stage 2E `soundMood` to a concrete stinger and ambient loop.
- Route discovery/replay stingers through the existing stinger/music ducking path.
- Route ambient loops through an ambience path controlled by existing SFX settings so music mute does not silence environmental ambience, while SFX mute does.
- Play audio only from viewer-safe, current-human-player actions.
- Support partial rollout through explicit pending entries that fail closed by playing nothing.
- End the series with strict coverage requiring every natural wonder to have complete bespoke audio.
- Preserve browser/PWA and macOS/Tauri shared behavior.
- Avoid pre-caching the full wonder-audio set during PWA install; assets should load and cache on demand.

## Non-Goals

- No placeholder-only delivery for Stage 2H.
- No CC-BY-SA, CC-BY-NC, unclear-license, or generated audio assets.
- No gameplay changes to natural wonder placement, discovery, yields, rewards, AI, saves, or map visibility.
- No legendary wonder audio in 2H.
- No voice lines, unit SFX, combat SFX, or broader audio settings redesign.
- No persistent map ambience based on camera location alone.
- No audio hints for undiscovered, last-seen-only, fog-only, or rival-only natural wonders.
- No reuse of the existing single-source SFX bus state for long-lived ambience if that would cut off UI one-shots or synthesized SFX.

## Player Experience

When a human player discovers a natural wonder and the discovery ceremony starts, a short bespoke stinger plays with the existing music ducking behavior. The stinger should feel like a reveal accent for that specific wonder: volcanic impact for the Great Volcano, rustling life for the Ancient Forest, glassy resonance for Crystal Caverns, and so on.

When the player opens a discovered natural wonder in the Codex, a subtle ambient loop may play while the page remains active. The loop should sit below the music bed and feel environmental rather than foregrounded. When the player triggers `Replay animation`, the same wonder's stinger plays once and the ambient loop starts or refreshes for the replay moment.

When the player focuses or inspects a currently visible discovered natural wonder tile on the map, the wonder's ambient loop may play briefly as environmental ambience. This is a focus/inspection response, not continuous camera-scanning audio, and it should fade out automatically after a short duration.

Audio never reveals hidden information. Unknown wonders, fog-only memories, last-seen tiles, rival-only knowledge, and another hot-seat player's discoveries do not trigger natural-wonder audio.

## Asset Strategy

Every natural wonder gets a complete audio package:

- one discovery/replay stinger
- one ambient loop
- catalog metadata
- local OGG files
- source and license metadata
- `AUDIO-CREDITS.md` attribution
- tests proving the files and credits resolve

Approved source policy follows the existing audio roadmap:

- allowed: CC0, public domain, and CC-BY-compatible assets
- allowed source families: Freesound, Kenney, Sonniss, incompetech, soundimage, freepd, musopen, or another explicitly verified compatible source
- forbidden: NC, SA, unclear-license, AI-generated audio without explicit approved licensing, and assets that cannot be redistributed in browser/PWA and macOS/Tauri builds

Each asset MR must include listening/approval notes in the PR body or an adjacent source note. The project cannot prove subjective quality through tests, so human approval remains part of the asset workflow.

Add a typed source manifest for new wonder audio, colocated with the natural-wonder audio catalog or in a small adjacent module. `AUDIO-CREDITS.md` remains the human-facing attribution ledger, while the typed manifest gives tests a structured way to prove source IDs, licenses, authors, local paths, and credit text stay synchronized.

## Rollout Plan

Stage 2H ships as five complete-wonder MRs:

1. **2H-MR1: Infrastructure + first 3 wonders**
   - `great_volcano`
   - `ancient_forest`
   - `coral_reef`
   - Adds shared catalog, director, mixer wiring, UI hooks, and first real assets.

2. **2H-MR2: Sky and stone set**
   - `sacred_mountain`
   - `crystal_caverns`
   - `aurora_fields`

3. **2H-MR3: Ice, canyon, fossil set**
   - `frozen_falls`
   - `grand_canyon`
   - `dragon_bones`

4. **2H-MR4: Desert and ruins set**
   - `singing_sands`
   - `sunken_ruins`
   - `floating_islands`

5. **2H-MR5: Deep water and storm set + strict completion**
   - `bioluminescent_bay`
   - `bottomless_lake`
   - `eternal_storm`
   - Flips final coverage to require complete audio for every natural wonder.

Partial rollout is allowed before MR5 only when pending entries are explicit. Pending entries must play no fallback audio and must not be presented as complete in tests, catalog metadata, or PR language.

## Architecture

Stage 2H extends the existing audio system rather than creating a parallel player.

### Catalog

Add:

```text
src/audio/natural-wonder-audio-catalog.ts
```

The catalog defines entries with fields equivalent to:

- `wonderId`
- `soundMood`
- `status: 'complete' | 'pending'`
- `stinger` metadata with file path, duration hint, gain hint, and source ID
- `ambientLoop` metadata with file path, loop points, gain hint, fade timing, and source ID
- source IDs or credit IDs
- bundle metadata
- loop points for ambient loops
- optional quality notes

Complete entries must include both `stinger` and `ambientLoop`. Pending entries must include neither playable path nor fake fallback path.

The catalog must cross-check against Stage 2E recipe metadata so a natural wonder's audio entry and `soundMood` stay aligned.

### Director

Add:

```text
src/audio/natural-wonder-audio-director.ts
```

The director owns natural-wonder playback decisions:

- `playDiscoveryStinger(wonderId)`
- `playCodexReplay(wonderId)`
- `startCodexAmbient(wonderId)`
- `startMapFocusAmbient(wonderId)`
- `stopAmbient(reason)`

The director does not inspect raw game state. Callers pass already viewer-safe actions. If the catalog entry is pending or missing, the director does nothing.

Only one natural-wonder ambient loop may be active at a time. Starting another wonder's ambient loop fades out the previous one and fades in the new one. Restarting the same loop refreshes its lifetime rather than stacking duplicate sources. Map-focus ambience must have an explicit timeout; Codex ambience may continue while the eligible page remains active.

The director should track the active ambient wonder ID, source state, last-start time, and stop reason so page rerenders, hot-seat changes, panel closes, and rapid replay clicks do not create duplicate loops or stale fade timers.

### Audio System

`AudioSystem` wires natural-wonder audio into existing app flow through small explicit methods:

- `playNaturalWonderDiscovery(wonderId)`
- `playNaturalWonderReplay(wonderId)`
- `startNaturalWonderCodexAmbient(wonderId)`
- `startNaturalWonderMapFocusAmbient(wonderId)`
- `stopNaturalWonderAmbient(reason)`

Discovery stingers use the existing stinger/music ducking behavior from `MusicDirector` or a shared helper with the same semantics. The current ducking helper is private, so implementation must expose a small public method such as `playStingerWithDuck(path)` or move the shared stinger helper to a module that both directors can use. Do not duplicate duck/restore state machines.

Ambient loops route through an ambience path controlled by `sfxEnabled` and `sfxVolume`. `AudioSystem` must also stop or revalidate active natural-wonder ambience when `currentPlayer:changed-after-handoff`, `game:over`, and panel-close events make the current audio ineligible.

### Mixer

`AudioMixer` gains the minimum loop support needed for natural-wonder ambience:

- start a looped ambience source with fade-in
- fade out and stop the active ambience source
- replace active ambience without stacking
- obey SFX mute and volume
- remain independent from music mute
- keep ordinary UI/SFX one-shots working while ambience plays

The current SFX bus is a single `BusState` used as the routing node for synthesized UI sounds. Implementation must not drive long-lived ambience through `setBusSource('sfx', ...)` if that would replace or cross-cut UI SFX. Prefer a dedicated ambience source chain connected under the SFX master gain, or a separate `ambience` bus whose gain is controlled by `soundEnabled` and `sfxVolume`.

Mixer disposal must stop any active ambience source and clear pending fade timers.

### UI And Event Hooks

Use existing hooks where possible:

- `wonder-discovery-queue` already exposes `onRevealStarted`; 2H should play discovery stingers there.
- Codex replay should call an explicit audio callback when the player triggers `Replay animation`, before or alongside the existing visual replay state change.
- Codex page lifecycle should start and stop ambient loops for discovered natural wonder pages through panel-level callbacks. `createWonderCodexPage` currently has no teardown hook, so `createWonderCodexPanel` must stop the previous page's ambience before replacing reader DOM and stop ambience on close.
- Map focus or territory inspection should call audio only through a viewer-safe helper that proves the focused tile is a currently visible discovered natural wonder for the current human player.

UI code must not read hidden tile state or raw rival state to decide audio.

Add or extend a shared helper with behavior equivalent to:

```text
resolveNaturalWonderAudioFocus(state, viewerId, coord) -> { type: 'play'; wonderId } | { type: 'none' }
```

Unlike `resolveWonderAtlasIntent`, this helper must require live visibility. `resolveWonderAtlasIntent` intentionally allows last-seen discovered wonders for Atlas navigation, but audio focus must not play from last-seen memory because sound implies a current live place.

## Playback Rules

### Discovery Reveal

Play the wonder's stinger when the current human viewer's natural-wonder discovery ceremony starts.

Do not play when:

- the discovery belongs to AI
- the discovery belongs to another hot-seat player
- no ceremony is shown
- the catalog entry is pending
- music is muted
- the audio context is unavailable or still suspended; in that case fail quietly and do not block the ceremony

### Codex Replay

When the player triggers `Replay animation` for a discovered natural wonder:

- play the same stinger once
- start or refresh that wonder's ambient loop
- do not grant rewards
- do not add notifications
- do not mutate game state
- do not imply video playback
- do not create duplicate ambient loops on repeated rapid clicks

### Codex Ambient

When a discovered natural-wonder Codex page is active, start its ambient loop quietly. Stop or fade it when the page closes, the selected page changes, or the entry is no longer eligible for the current viewer.

Codex ambient is allowed for discovered natural wonders even if the map tile is not currently live visible, because Codex is a reference surface rather than live map intel.

Codex ambient must be quiet enough to read over. Initial guidance: use per-asset gain hints and start below the current SFX volume rather than at full SFX gain.

### Map Focus Ambient

When the player focuses or inspects a currently visible discovered natural wonder tile, start a short-lived ambient loop for that wonder.

Do not play map focus ambience for:

- undiscovered wonders
- unexplored tiles
- fog-only or last-seen memory
- rival-only knowledge
- hidden hot-seat state
- generic camera position without an explicit focus/inspection action

Map focus ambience should fade in quickly, stay audible briefly, then fade out automatically unless the same wonder is explicitly focused again. The implementation plan may tune exact values, but it must include tests for timeout/replacement behavior so ambience cannot run forever after a one-time map tap.

### Settings And Accessibility

Discovery and replay stingers respect `musicEnabled` and `musicVolume`.

Ambient loops respect `soundEnabled` and `sfxVolume`. Music mute does not silence ambient loops.

Reduced motion does not automatically mute audio. If a future reduced-audio setting exists, this feature should use it, but 2H does not add a new settings UI unless implementation discovers an existing reduced-audio preference to honor.

If `soundEnabled` changes while ambient audio is active, the active ambience gain must update immediately through the existing SFX mute/volume machinery.

## Privacy And Visibility

Natural-wonder audio must be at least as private as the surface that triggered it.

- Discovery audio is tied to the viewer-safe discovery ceremony.
- Codex audio is tied to discovered Codex entries only.
- Map focus audio is tied to current live visibility plus discovered status.
- Pending catalog entries play nothing.
- No sound mood, file path, asset identity, or playback behavior may reveal undiscovered natural wonders.

Hot-seat current-player changes must stop active natural-wonder ambience if the new viewer is not eligible for the currently playing wonder.

## PWA, Tauri, And Bundle Review

Audio assets live under `public/audio/wonders/`.

Implementation must confirm both release targets can load the assets through the same `AudioLoader` path:

- GitHub Pages/PWA uses the existing base URL behavior.
- macOS/Tauri uses relative asset paths through the existing shared frontend build.

Do not add all wonder audio files to the service worker pre-cache. The current service worker uses cache-first behavior for fetched files; 2H assets should load on demand and then cache. If an implementation slice changes service worker pre-cache rules, it must run the dual-release checks required by `AGENTS.md` and explicitly justify the install-size impact.

Every asset MR must include a bundle-size note. 2H should keep each complete-wonder MR small enough to review and should avoid one huge audio dump. If an asset candidate is too large, the MR pauses for a user decision: re-encode, trim, choose another source, or accept the size.

## Testing Requirements

### Catalog And Asset Tests

- Every complete entry references a valid natural wonder ID.
- Every complete entry's `soundMood` matches the Stage 2E spectacle recipe.
- Complete entries have stinger and ambient loop paths.
- Pending entries have no playable file paths.
- No duplicate wonder IDs.
- No unknown wonder IDs.
- Every complete path exists under `public/audio/wonders/`.
- Every complete file has OGG magic bytes.
- Ambient loop points are valid: `loopStart >= 0` and `loopEnd > loopStart`.
- Every complete source ID resolves in the typed audio source manifest.
- Every complete source record has title, creator, source URL, license, local path, and credit text.
- Every complete source's credit text appears in `AUDIO-CREDITS.md`.
- MR5 final coverage requires every natural wonder to be complete.

### Director And Mixer Tests

- Discovery stinger loads and plays the correct wonder stinger.
- Pending wonders do not play fallback audio.
- Codex replay plays stinger and starts ambient.
- Codex ambient starts and stops cleanly.
- Map focus ambient starts only from an eligible viewer-safe trigger.
- Ambient loops fade in and out.
- Starting a second ambient loop replaces the first instead of stacking.
- Restarting the same ambient loop refreshes it without duplicate sources.
- Ambient loops obey SFX mute and volume.
- Ambient loops continue to be controlled separately from music mute.
- Stingers obey music mute and use stinger ducking.
- UI/SFX one-shots still play while natural-wonder ambience is active.
- Disposing `AudioSystem` or `AudioMixer` stops active ambience.

### Privacy Tests

- AI discoveries do not play human discovery audio.
- Wrong hot-seat viewer discoveries do not play.
- Undiscovered Codex entries do not expose audio controls or play audio.
- Last-seen, fog-only, unexplored, or rival-only map state does not trigger ambience.
- Current-player change stops or revalidates active ambience.
- Atlas navigation may resolve a last-seen discovered wonder, but natural-wonder audio focus must not.

### UI Tests

- Discovery queue calls the audio hook at reveal start.
- Codex replay calls the replay audio callback only from player action.
- Codex page selection starts eligible ambient and stops previous ambient.
- Closing the Codex stops ambient.
- Replay button text remains `Replay animation` or equivalent and does not promise video playback.
- Rapid replay clicks refresh audio state without duplicated stingers beyond the deliberate one-shot behavior and without stacked ambience.

## Required Checks

For each 2H MR, run:

```bash
scripts/check-src-rule-violations.sh <changed src files>
./scripts/run-with-mise.sh yarn test --run <targeted audio/system/ui tests>
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
```

Before push, PR creation, or merge, also run:

```bash
./scripts/run-with-mise.sh yarn test
```

If a slice touches platform, service worker, Vite distribution config, or asset path behavior, also run the dual-release checks required by `AGENTS.md`.

## Acceptance Criteria

The Stage 2H series is complete when:

- all 15 natural wonders have real bespoke stinger and ambient loop assets
- every asset is licensed under an approved policy and credited
- every Stage 2E `soundMood` resolves to complete playable audio
- discovery reveal stingers play only for eligible current-human-player ceremonies
- Codex replay plays the correct stinger and ambient loop without gameplay side effects
- Codex ambient starts and stops from discovered natural-wonder pages
- map focus ambience plays only for visible discovered natural wonder tiles
- pending fallback behavior has been removed or replaced by strict full coverage
- audio privacy tests cover undiscovered, fog-only, last-seen, rival-only, AI, and hot-seat wrong-viewer cases
- PWA and Tauri asset loading paths remain shared
- targeted tests, wonder regressions, build, and full test suite pass
