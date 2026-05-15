# Spec 1 — Data Flow

Subsection of [Spec 1 — Music Foundation](./2026-05-15-audio-overhaul-spec-1-music-foundation.md). Read the [architecture](./2026-05-15-audio-overhaul-spec-1-architecture.md) doc first.

These flows are the contracts that tests assert. Every flow must comply with the Transition-Events rule from `.claude/rules/end-to-end-wiring.md`: each event fires exactly once per real state transition, never re-fires from steady-state scans.

## Flow A — Cold start (new game)

1. `main.ts` boots, instantiates `new AudioSystem(eventBus, () => gameState)`.
2. `audioSystem.init()` runs: creates suspended `AudioContext`, registers one-time `pointerdown` resume listener, registers `visibilitychange` listener.
3. Player taps "New Game" — `pointerdown` fires, `ctx.resume()` runs, listener self-removes.
4. After game state initializes, `audioSystem.start(state)` is called by `main.ts`. Reads `state.era`, `getFamilyForCiv(state.civilizations[state.currentPlayer].civType)`, and `state.civilizations[state.currentPlayer].atWarWith.length > 0`.
5. `AudioLoader.preload([eraBase, civAccent, warLayer])` kicks off three parallel fetches. War layer is pre-bundled (L2), so it resolves immediately; era and accent fetch over network on first cold start, cached thereafter.
6. As each buffer resolves, `AudioMixer.setBusSource(...)` fades the bus in from 0 over 500ms.
7. `MusicDirector` selects initial snapshot: `peace` if `atWarWith.length === 0`, else `at-war`. `mixer.setSnapshot(initial, fadeMs=500)`.
8. Result: brief silence (~1–2s while OGGs decode and `pointerdown` resume completes), then era base + civ accent fade in at the chosen snapshot's gains.

## Flow B — Save load

Same as Flow A. `audioSystem.start(state)` is the single entry point for both new-game and save-load. The flow re-reads `state.era`, current player, war status from the loaded state. No save-format change in Spec 1.

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

1. Diplomacy system fires `war:declared` with payload `{ aggressor, defender, currentPlayerCivType }`. Fires once per declaration. Bilateral state update happens in the diplomacy system itself (existing repo rule).
2. `MusicDirector.handleWarDeclared(payload)`:
   - If neither `payload.aggressor === payload.currentPlayerCivType` nor `payload.defender === payload.currentPlayerCivType`, no-op.
   - Otherwise: `director.intendedSnapshot = 'at-war'`.
3. Director: `mixer.setSnapshot('stinger-duck', fadeMs=300)` → `mixer.playOneShot('stinger', warDeclaredStinger)` → await.
4. After one-shot resolves: `mixer.setSnapshot('at-war', fadeMs=2000)`. War layer fades up to 0.8, accent attenuates from 0.7 to 0.5, era base stays at 1.0.

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

1. End-of-turn UI shows the handoff modal ("Pass to <name>"). Music continues at previous player's mix during the modal (preserves privacy — accent doesn't pre-announce the next civ).
2. Player taps "Continue" — handoff modal fires `currentPlayer:changed-after-handoff` with payload `{ civType, era, isAtWar }`. (Per A4: if this event does not already exist, Spec 1 adds it at the handoff-confirm callsite.)
3. `MusicDirector.handleCurrentPlayerChanged(payload)`:
   - New family = `getFamilyForCiv(payload.civType)`.
   - If new family === current accent family: no accent swap.
   - Otherwise: `loader.get(ACCENT[newFamily].file)` → `mixer.setBusSource('accent', accentBuf, true, accentLoopPoints, fadeMs=1500)`.
   - If `payload.era !== currentEra`: same as Flow C for the era base (but typically no stinger on handoff — Spec 1 design suppresses era stingers when triggered by handoff rather than actual era advance; era stinger is reserved for the `era:advanced` event path).
   - Director re-evaluates `intendedSnapshot` from `payload.isAtWar`. If different from current, `mixer.setSnapshot(new, fadeMs=2000)`.

## Flow J — Game ended (G2)

1. Win/loss system fires `game:ended` with payload `{ outcome }`.
2. Director: `mixer.setMasterMusicVolume(0, fadeMs=4000)`. Master music fades to silent over 4 seconds.
3. SFX bus is unaffected — UI sounds on the post-game screen still play.
4. No defeat/victory stinger in Spec 1 (St2 set excludes them; Spec 3 adds them).

## Flow K — Tab hidden / visible (G3)

1. `document.visibilitychange` fires; `document.hidden` is true.
2. `AudioSystem` calls `ctx.suspend()`. All scheduled audio pauses. Game logic is unaffected.
3. User returns; `visibilitychange` fires with `document.hidden === false`.
4. `AudioSystem` calls `ctx.resume()`. Audio continues from where it paused.

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
