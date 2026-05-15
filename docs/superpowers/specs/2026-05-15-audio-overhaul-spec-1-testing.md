# Spec 1 — Testing Strategy and Verification

Subsection of [Spec 1 — Music Foundation](./2026-05-15-audio-overhaul-spec-1-music-foundation.md).

Two repo rules drive the test surface:

- `.claude/rules/end-to-end-wiring.md` — Transition-Events rule: every event handler fires exactly once per real state transition, never re-fires from steady-state scans. Each must have a regression test.
- `.claude/rules/spec-fidelity.md` — contract words (`fade`, `duck`, `crossfade`, `at-war`, `peace`, `silence`) in this spec are real requirements with assertions on the resulting audio-graph state.

## Mock AudioContext

JSDOM has no `AudioContext`. A `MockAudioContext` helper lives at `tests/helpers/mock-audio-context.ts`:

- Records every node creation (`createGain`, `createBufferSource`) and every operation (`gain.setValueAtTime`, `gain.linearRampToValueAtTime`, `gain.exponentialRampToValueAtTime`, `connect`, `start`, `stop`) on an ordered transcript.
- Advances a virtual `currentTime` under vitest's fake timers.
- Returns deterministic node identities so assertions can reference nodes by index or label.
- Supports `state` transitions (`suspended` / `running` / `closed`) so visibility tests can assert `ctx.suspend()` / `ctx.resume()` were called.

Tests assert *which mixer calls happen at which virtual time*, not Web Audio's internal correctness.

## Test files

| File | Coverage |
|---|---|
| `tests/audio/audio-mixer.test.ts` | Bus topology (5 buses + master), `setBusSource` schedules correct gain ramps, `setSnapshot` ramps all music buses simultaneously to preset values, `playOneShot` is duck-neutral (no snapshot side-effect), `setMasterMusicVolume` fades the master gain, loop points are passed to the source node correctly, `setMusicEnabled(false)` hard-zeros the master music gain (M-1, M-2) and overrides an in-flight `setMasterMusicVolume` fade, volume curve is square-law (`gain = v * v` per Au-2). |
| `tests/audio/music-director.test.ts` | Event-payload → mixer-call sequences for every Flow in the [data-flow doc](./2026-05-15-audio-overhaul-spec-1-data-flow.md). AI-only events produce zero mixer calls (Flows D, F). Director re-asserts intended snapshot after every `playOneShot`. Director ignores all non-current-player events (A5). Hot-seat handoff Flow I four sub-cases: no change, era only, family only, both. War-scope tests: `at-war` snapshot triggers when current player is at war with a major civ; also when at war with a minor civ; also when at war with barbarians (W-Scope). |
| `tests/audio/audio-loader.test.ts` | Same URL fetched twice → one `AudioBuffer` (cache hit). Failed `fetch` returns a silent fallback buffer rather than rejecting. `preload` tolerates per-URL failures and does not reject. |
| `tests/audio/audio-catalog.test.ts` | Every era 1–5 has `ERA_BASE`, `WAR_LAYER`, `STINGER.eraAdvance`, and `STINGER.eraTransitionCue` entries (UX-2). Every `AudioFamily` value has an `ACCENT` entry. `STINGER.cityFounded` and `STINGER.warDeclared` exist. Every catalog `file` path resolves to a file on disk in `public/audio/` (uses `fs.existsSync`). Every catalog file is a parseable OGG (magic bytes `OggS`; decoded ≥ 0 samples; silent placeholders pass). `resolveEra(6)` returns `5` (Er2 clamp). Every `TrackEntry` has valid `loop.loopStart < loop.loopEnd`. |
| `tests/audio/civ-audio-family.test.ts` | Every civ ID in `src/systems/civ-definitions.ts` has an entry in `CIV_TO_AUDIO_FAMILY`. Every minor civ in `src/systems/minor-civ-definitions.ts` has an entry in `MINOR_CIV_TO_AUDIO_FAMILY`. Every mapped value is one of the 12 `AudioFamily` literals. `getFamilyForCiv('unknown-civ-id')` returns `'mediterranean-antiquity'`. |
| `tests/audio/audio-system.integration.test.ts` | End-to-end flows from the data-flow doc with mock mixer: cold start (Flow A) preloads correct files and applies initial snapshot; save load (Flow B) equivalent to Flow A; deep-link save load with no prior user gesture stays silent until first `pointerdown` (UX-4); era advance (Flow C) sequence; war declared (Flow E) sequence including barbarian and minor-civ variants; hot-seat handoff (Flow I) four sub-cases; game ended (Flow J) → master fades to 0 over **1.5s** (UX-1); visibility hide → `ctx.suspend` called, visibility show → `ctx.resume` called, and if `ctx.state` stays `'suspended'` after 100ms a new `pointerdown` listener is registered (UX-3); mute mid-game (Flow M) zeros master gain instantly and survives an in-flight game-end fade. |

## Transition-event regressions

Explicit regressions enforcing the once-and-only-once rule:

- Re-render the same `GameState` 20× without firing any event → stingers fire 0 times, snapshots change 0 times.
- Fire `era:advanced` once, then re-render 20× at the new era → exactly one era-advance stinger; subsequent renders trigger zero additional stingers.
- Fire `war:declared` once, then re-render 20× while still at war → exactly one war-declared stinger; snapshot stays at `at-war` without re-applying transitions.
- Fire `peace:signed` to end the only war → snapshot transitions to `peace` exactly once; subsequent peaceful re-renders trigger zero transitions.
- Fire `city:founded` for an AI civ → zero stingers (Flow short-circuit).
- Fire `currentPlayer:changed-after-handoff` when next player is in the same audio family → zero accent swaps.

## Catalog-on-disk test

Critical for the placeholder-OGG strategy: ensures no code path points at a missing file.

```ts
// tests/audio/audio-catalog.test.ts (excerpt)
it('every catalog file exists on disk and is a parseable OGG', () => {
  const allEntries = [
    ...Object.values(ERA_BASE),
    ...Object.values(ACCENT),
    ...Object.values(WAR_LAYER),
    ...Object.values(STINGER.eraAdvance),
    STINGER.cityFounded,
    STINGER.warDeclared,
  ];
  for (const entry of allEntries) {
    const path = `public${entry.file}`;
    expect(fs.existsSync(path)).toBe(true);
    const head = fs.readFileSync(path).slice(0, 4);
    expect(head.toString('ascii')).toBe('OggS');  // OGG magic bytes
  }
});
```

## Spec 2 hook

Every test file above carries forward to Spec 2:

- `MockAudioContext` is reused for SFX tests.
- The catalog-on-disk pattern extends to the SFX catalog Spec 2 adds.
- The event-flow assertion pattern extends to per-unit SFX events.
- The transition-event regression pattern catches SFX duplicate-fire bugs.

This is intentional architectural reuse so Spec 2 spends zero time rebuilding test scaffolding.

## Accessibility verification (G-3)

Stingers and adaptive music are *additive* cues; they must not be the **only** signal for any gameplay event. Before claiming Spec 1 complete, verify:

- War declared → existing notification system shows a visual notification card AND a player-targeted log entry. Stinger is an additional cue, not the primary one.
- City founded → existing city-foundation feedback (the new city appears on the map, side panel updates) is the primary cue. Stinger is additional.
- Era advance → existing era-advance UI (panel reveal, tech-tree update) is the primary cue. Stinger is additional.
- Game ended → end-of-game screen is the primary cue. Music fade is additional.

This is a one-pass code-reading check during plan-writing: confirm the visual notification pathway exists for every event the audio system reacts to. No new UI work expected in Spec 1.

## Verification gate before claiming Spec 1 complete

Per `.claude/rules/end-to-end-wiring.md` and `superpowers:verification-before-completion`:

1. `yarn build` exits 0 (TypeScript compiles).
2. `yarn test` exits 0 (vitest + hook smoke tests pass, including all new audio test files).
3. Manual browser smoke (CLAUDE.md UI testing rule): `yarn dev`, play a new game, verify:
   - No hum. Procedural drone is gone.
   - Silent placeholder OGGs load without console errors.
   - Era advance fires once per advance; subsequent turns at the new era do not re-fire.
   - War declared → at-war snapshot applied; accent attenuates per snapshot table.
   - Peace signed (only war) → returns to peace snapshot.
   - End game → music master fades to 0 over **1.5s** (UX-1); SFX still functional under post-game screen.
   - Tab unfocus → audio suspends. Refocus → audio resumes (and re-arms `pointerdown` if needed per UX-3).
   - Hot-seat handoff → accent crossfades only after the handoff confirm tap, never during the modal; cross-era handoff plays the soft transition cue (UX-2), not the full advance stinger.
   - Mute music mid-war → instant silence. Re-enable → music resumes at current snapshot.

No debug logging is added to the production code path. All assertions about call ordering live in the mock-context transcript inside tests (D-3).

## Test approach honesty

- We are not testing audio quality — that's the curation MR series, evaluated by the user's ear.
- We are testing that **the right files are loaded** at **the right times** with **the right gain ramps** in response to **the right events**.
- Tests run with silent placeholder OGGs and a mock `AudioContext`. They will pass in CI even before any real audio is curated. This is intentional: code correctness is decoupled from asset quality.
