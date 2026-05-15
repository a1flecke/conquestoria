# Spec 1 — Data Flow

Subsection of [Spec 1 — Music Foundation](./2026-05-15-audio-overhaul-spec-1-music-foundation.md). Read the [architecture](./2026-05-15-audio-overhaul-spec-1-architecture.md) doc first.

These flows are the contracts that tests assert. Every flow must comply with the Transition-Events rule from `.claude/rules/end-to-end-wiring.md`: each event fires exactly once per real state transition, never re-fires from steady-state scans.

## Flow A — Cold start (new game)

1. `main.ts` boots, instantiates `new AudioSystem(eventBus)`.
2. `audioSystem.init()` runs: creates suspended `AudioContext`, registers one-time `pointerdown` resume listener on `document` (UX-4 — listener is global, not bound to the "New Game" button), registers `visibilitychange` listener (G3, UX-3).
3. Player taps **anywhere** — `pointerdown` fires, `ctx.resume()` runs, listener self-removes.
4. After game state initializes, `audioSystem.start(state)` is called by `main.ts`. Reads `state.era`, `getFamilyForCiv(state.civilizations[state.currentPlayer].civType)`, and the **W-Scope** check: `isAtWar(state.civilizations[state.currentPlayer])` returns true if `atWarWith.length > 0` (any opponent: major civ, minor civ, or barbarian).
5. `AudioLoader.preload([eraBase, civAccent, warLayer])` kicks off three parallel fetches. War layer is pre-bundled (L2), so it resolves immediately; era and accent fetch over network on first cold start, cached thereafter.
6. As each buffer resolves, `AudioMixer.setBusSource(...)` fades the bus in from 0 over 500ms.
7. `MusicDirector` selects initial snapshot: `peace` if `isAtWar` is false, else `at-war`. `mixer.setSnapshot(initial, fadeMs=500)`.
8. Result: brief silence (~1–2s while OGGs decode and `pointerdown` resume completes), then era base + civ accent fade in at the chosen snapshot's gains.

## Flow B — Save load

Same as Flow A. `audioSystem.start(state)` is the single entry point for both new-game and save-load. The flow re-reads `state.era`, current player, war status from the loaded state. No save-format change in Spec 1.

**Deep-link / fresh-tab save-load edge case (UX-4):** if a user opens the app from a bookmark and a save auto-resumes before any user interaction, the `AudioContext` is still suspended (browser autoplay policy). The `pointerdown` listener on `document` is still registered, so the *first* gesture anywhere — tapping a unit, clicking the menu, tapping the map — resumes audio. Until that first gesture, the player hears silence. This is honest behavior per browser policy; no warning UI is added in Spec 1.

## Flow C — Era advance (current player)

1. Turn manager fires `era:advanced` with payload `{ civType, newEra, currentPlayerCivType }`. Fires once per civ-era transition.
2. `MusicDirector.handleEraAdvance(payload)`:
   - If `payload.civType !== payload.currentPlayerCivType`, no-op (A5).
   - Otherwise: `loader.preload([ERA_BASE[newEra].file, WAR_LAYER[newEra].file])` kicks off background load. Accent unchanged per Ac1.
3. Director awaits the era-advance stinger buffer via `loader.get(STINGER.eraAdvance[newEra].file)`.
4. Director calls `mixer.setSnapshot('stinger-duck', fadeMs=300)`.
5. Director calls `mixer.playOneShot('stinger', stingerBuf)` and `await`s it.
6. When the one-shot resolves:
   - Director calls `mixer.setBusSource('era', newEraBuf, true, eraLoopPoints, fadeMs=2000)` — old era fades out, new era fades in simultaneously.
   - If war is active, `mixer.setBusSource('adaptive', newWarBuf, true, warLoopPoints, fadeMs=2000)` — war layer swaps to the new era's war variant.
   - Director re-asserts intended snapshot: `mixer.setSnapshot(intendedSnapshot, fadeMs=600)`.

Per A1, the base-loop crossfade is triggered at stinger-end, not at a magic mid-stinger offset. Duck-restore and base crossfade happen at the same moment.

## Flow D — Era advance (non-current-player civ)

1. `era:advanced` fires with `civType !== currentPlayerCivType`.
2. Director's handler short-circuits at the first check (A5). No mixer calls. No stinger. No bus swaps.

This is the explicit "director is stateless across non-current-player events" rule. No per-civ era tracking.

## Flow E — War declared (current player involved)

**War scope (W-Scope):** the `at-war` snapshot triggers on `atWarWith.length > 0` for **any** opponent — major civ, minor civ (city-state), or barbarian. Tiered war music (different intensity per opponent type) is deferred to Spec 4 (W-Tier candidate). For Spec 1, all wars sound the same.

1. Diplomacy system (or barbarian-spawn / minor-civ-hostility system) fires `war:declared` with payload `{ aggressor, defender, currentPlayerCivType, opponentKind }`, where `opponentKind ∈ {'major', 'minor', 'barbarian'}`. Fires once per declaration. Bilateral state update happens in the diplomacy system itself (existing repo rule).
2. `MusicDirector.handleWarDeclared(payload)`:
   - If neither `payload.aggressor === payload.currentPlayerCivType` nor `payload.defender === payload.currentPlayerCivType`, no-op.
   - Otherwise: `director.intendedSnapshot = 'at-war'`.
3. Director: `mixer.setSnapshot('stinger-duck', fadeMs=300)` → `mixer.playOneShot('stinger', warDeclaredStinger)` → await.
4. After one-shot resolves: `mixer.setSnapshot('at-war', fadeMs=2000)`. War layer fades up to 0.8, accent attenuates from 0.7 to 0.5, era base stays at 1.0.

The `opponentKind` field is captured in the event payload now (no extra cost) so Spec 4's W-Tier work can dispatch to per-kind snapshots without revisiting the emitter sites.

**Pre-existing barbarian aggression on game start:** if `atWarWith` already contains a barbarian entry at `audioSystem.start(state)` time (Flow A), the initial snapshot is `at-war` per W-Scope. This is intentional: a player surrounded by hostile barbarians from turn one *is* in a combat-music situation.

## Flow F — War declared (two AI civs, current player uninvolved)

1. `war:declared` fires; neither side matches `currentPlayerCivType`.
2. Director short-circuits. No mixer calls. (H2 — music speaks to the active player only.)

## Flow G — Peace signed

1. Diplomacy fires `peace:signed` with payload `{ civA, civB, currentPlayerCivType }`.
2. Director:
   - If neither side is current player, no-op.
   - Otherwise: re-evaluate the current player's full war list from state. If `atWarWith.length === 0` after this peace, `intendedSnapshot = 'peace'` and `mixer.setSnapshot('peace', fadeMs=2000)`. War layer fades out.
   - If still at war with someone else, no snapshot change.
3. No stinger for peace in Spec 1 (St2 set excludes peace; Spec 3 adds it).

## Flow H — City founded (by current player)

1. City system fires `city:founded` with payload `{ civType, currentPlayerCivType }`.
2. Director:
   - If `payload.civType !== payload.currentPlayerCivType`, no-op.
   - Otherwise: `setSnapshot('stinger-duck', 300)` → `playOneShot('stinger', cityFoundedStinger)` → await → `setSnapshot(intendedSnapshot, 600)`.

## Flow I — Hot-seat handoff

**Stinger suppression on handoff (Cf-2):** the loud, cinematic `eraAdvance` stinger fires only on the real `era:advanced` event path (Flow C). On hot-seat handoff that crosses an era boundary, the softened `eraTransitionCue` plays instead (UX-2). This preserves hot-seat privacy (no spoiling the next player's tech progress) while still giving an audible cue.

1. End-of-turn UI shows the handoff modal ("Pass to <name>"). Music continues at the *previous* player's mix during the modal — accent, era base, and snapshot all unchanged (preserves privacy — accent does not pre-announce the next civ).
2. Player taps "Continue" — handoff modal fires `currentPlayer:changed-after-handoff` with payload `{ civType, era, isAtWar }`. (Per A4: if this event does not already exist, Spec 1 adds it at the handoff-confirm callsite.)
3. `MusicDirector.handleCurrentPlayerChanged(payload)`:
   - Determine `newFamily = getFamilyForCiv(payload.civType)`, `eraChanged = payload.era !== currentEra`, `familyChanged = newFamily !== currentAccentFamily`, `warStateChanged = payload.isAtWar !== currentIsAtWar`.
   - **If neither family nor era changes**, only re-evaluate snapshot. If `warStateChanged`, `mixer.setSnapshot(payload.isAtWar ? 'at-war' : 'peace', fadeMs=2000)`. Otherwise: no mixer calls.
   - **If `eraChanged` only**: preload `ERA_BASE[payload.era]` and `WAR_LAYER[payload.era]`. Play the `eraTransitionCue` (Flow C-style: duck → playOneShot the cue → restore). At cue-end, crossfade era base over 2s; if war is active, crossfade war layer over 2s in parallel.
   - **If `familyChanged` only**: `loader.get(ACCENT[newFamily].file)` → `mixer.setBusSource('accent', accentBuf, true, ACCENT[newFamily].loop, fadeMs=1500)`.
   - **If both `eraChanged` and `familyChanged`**: play `eraTransitionCue` once. At cue-end, crossfade era base, war layer (if active), and accent in parallel over 2s. Single transition moment, not two stacked transitions.
4. After any transitions complete, director re-asserts `intendedSnapshot` from `payload.isAtWar`.

## Flow J — Game ended (G2, UX-1)

1. Win/loss system fires `game:ended` with payload `{ outcome }`.
2. Director: `mixer.setMasterMusicVolume(0, fadeMs=1500)`. Master music fades to silent over **1.5 seconds** (revised from 4s per UX-1 to align with the post-game screen reveal).
3. SFX bus is unaffected — UI sounds on the post-game screen still play.
4. No defeat/victory stinger in Spec 1 (St2 set excludes them; Spec 3 adds them).

## Flow K — Tab hidden / visible (G3, UX-3)

1. `document.visibilitychange` fires; `document.hidden` is true.
2. `AudioSystem` calls `ctx.suspend()`. All scheduled audio pauses. Game logic is unaffected.
3. User returns; `visibilitychange` fires with `document.hidden === false`.
4. `AudioSystem` calls `ctx.resume()`. **Defensive iOS Safari handling (UX-3):** if `ctx.state` does not transition to `'running'` within 100ms (some iOS versions re-suspend after long backgrounding), `AudioSystem` re-registers the one-time `pointerdown` resume listener. The next user gesture anywhere in the app resumes the context. The user does not see any UI indicator; audio simply comes back when they next interact.

## Flow M — Mute toggle (M-1, M-2)

1. User toggles music off in settings (or via keyboard shortcut, if one exists).
2. `audioSystem.setMusicEnabled(false)` → `mixer.setMusicEnabled(false)`.
3. Mixer immediately forces the master music gain to 0 — no fade, no ramp. Active source buffers continue playing into a silent gain node (so the buffer position keeps advancing).
4. **Hard override during in-flight fades:** if a game-end fade (Flow J) was in progress, the mute hard-sets to 0 regardless. The fade is canceled. When music is re-enabled, master gain returns to the configured volume *but* the underlying source nodes have continued playing — re-enabling does not "rewind" the music.
5. User toggles music back on. `setMusicEnabled(true)` restores master gain to `musicVolume * musicVolume` (Au-2 square-law). Currently-running snapshot is unchanged; the player hears the music pick up wherever the playhead has advanced to.

Same flow for SFX toggle, except the SFX bus is the target. Stingers respect `musicEnabled` (they are music): if the user mutes music mid-stinger, the stinger goes silent immediately.

## Flow L — Overlapping stingers (D-A9)

1. Two stinger events fire within 500ms of each other (e.g., `war:declared` then `era:advanced`).
2. Director starts the second stinger via `playOneShot`. The mixer's stinger bus already has an active source.
3. Mixer's `playOneShot`: cross-cuts the existing source over 200ms (fade out old + fade in new) before fully playing the new buffer. Both ducks remain stacked; the snapshot restore happens after the *second* one-shot resolves.

This is the simple rule per Q11; revisit if curation makes truncations audible.

## What does NOT trigger a music change

For test coverage clarity — these gameplay events do not affect music in Spec 1:

- Unit moved, attacked, killed, healed (Spec 2 will add SFX, not music)
- Building constructed (Spec 3 may add a stinger)
- Tech researched (Spec 3 may add a stinger for major techs)
- City captured (Spec 3 will consider stinger; for now silent)
- AI-vs-AI diplomatic events not involving the current player
- Era advance by non-current-player civ (Flow D explicit no-op)
- Pause menu open/close (G4 — music continues unchanged)
- Settings panel open/close

Tests assert zero mixer calls when these events fire.
