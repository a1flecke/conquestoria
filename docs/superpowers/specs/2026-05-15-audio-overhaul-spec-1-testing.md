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
| `tests/audio/audio-mixer.test.ts` | Bus topology (5 buses + master), `setBusSource` schedules correct gain ramps, `setSnapshot` ramps all music buses simultaneously to preset values, `playOneShot` is duck-neutral (no snapshot side-effect), `setMasterMusicVolume` fades the master gain, loop points are passed to the source node correctly. |
| `tests/audio/music-director.test.ts` | Event-payload → mixer-call sequences for every Flow in the [data-flow doc](./2026-05-15-audio-overhaul-spec-1-data-flow.md). AI-only events produce zero mixer calls (Flows D, F). Director re-asserts intended snapshot after every `playOneShot`. Director ignores all non-current-player events (A5). |
| `tests/audio/audio-loader.test.ts` | Same URL fetched twice → one `AudioBuffer` (cache hit). Failed `fetch` returns a silent fallback buffer rather than rejecting. `preload` tolerates per-URL failures and does not reject. |
| `tests/audio/audio-catalog.test.ts` | Every era 1–5 has `ERA_BASE`, `WAR_LAYER`, and `STINGER.eraAdvance` entries. Every `AudioFamily` value has an `ACCENT` entry. `STINGER.cityFounded` and `STINGER.warDeclared` exist. Every catalog `file` path resolves to a file on disk in `public/audio/` (uses `fs.existsSync`). Every catalog file is a parseable OGG (decoded ≥ 0 samples; silent placeholders pass). `resolveEra(6)` returns `5` (Er2 clamp). |
| `tests/audio/civ-audio-family.test.ts` | Every civ ID in `src/systems/civ-definitions.ts` has an entry in `CIV_TO_AUDIO_FAMILY`. Every minor civ in `src/systems/minor-civ-definitions.ts` has an entry in `MINOR_CIV_TO_AUDIO_FAMILY`. Every mapped value is one of the 12 `AudioFamily` literals. `getFamilyForCiv('unknown-civ-id')` returns `'mediterranean-antiquity'`. |
| `tests/audio/audio-system.integration.test.ts` | End-to-end flows from the data-flow doc with mock mixer: cold start (Flow A) preloads correct files and applies initial snapshot; save load (Flow B) is equivalent to Flow A; era advance (Flow C) sequence; war declared (Flow E) sequence; hot-seat handoff (Flow I); game ended (Flow J) → master fades to 0 over 4s; visibility hide → `ctx.suspend` called, visibility show → `ctx.resume` called (Flow K). |

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

## Verification gate before claiming Spec 1 complete

Per `.claude/rules/end-to-end-wiring.md` and `superpowers:verification-before-completion`:

1. `yarn build` exits 0 (TypeScript compiles).
2. `yarn test` exits 0 (vitest + hook smoke tests pass, including all new audio test files).
3. Manual browser smoke (CLAUDE.md UI testing rule): `yarn dev`, play a new game, verify:
   - No hum. Procedural drone is gone.
   - Silent placeholder OGGs load without console errors.
   - Era advance → console reports stinger triggered + base-loop swap scheduled (debug logging during the MR series; removed before final merge).
   - War declared → at-war snapshot applied; accent attenuates per snapshot table.
   - Peace signed (only war) → returns to peace snapshot.
   - End game → music master fades to 0 over 4s; SFX still functional under post-game screen.
   - Tab unfocus → audio suspends. Refocus → audio resumes.
   - Hot-seat handoff → accent crossfades only after the handoff confirm tap, never during the modal.

## Test approach honesty

- We are not testing audio quality — that's the curation MR series, evaluated by the user's ear.
- We are testing that **the right files are loaded** at **the right times** with **the right gain ramps** in response to **the right events**.
- Tests run with silent placeholder OGGs and a mock `AudioContext`. They will pass in CI even before any real audio is curated. This is intentional: code correctness is decoupled from asset quality.
