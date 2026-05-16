# Audio Overhaul Spec 1 — Music Foundation — Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural-drone hum with a snapshot-driven layered music engine. Silent placeholder OGGs ship in MR1; real audio arrives via a curation MR series once all 4 MRs merge.

**Architecture:** `AudioSystem` (lifecycle owner) → `AudioMixer` (Web Audio graph) ← `MusicDirector` (event→mixer translator) ← `AudioLoader` (fetch+cache). Each MR is independently mergeable and always leaves the game buildable and playable.

**Tech stack:** TypeScript, Web Audio API, OGG Vorbis, vitest (node environment), MockAudioContext, ffmpeg (placeholder generation — run locally by the user, not in CI)

**Spec references:** All decisions locked in [`docs/superpowers/specs/2026-05-15-audio-overhaul-spec-1-music-foundation.md`](../specs/2026-05-15-audio-overhaul-spec-1-music-foundation.md) and its four subsection files.

---

## MR sequencing

All MRs are on the same branch and reviewed/merged in order. Each is independently green (`yarn build && yarn test` exit 0) before the next starts.

| MR | Plan file | Player-visible change | `yarn build` gate |
|---|---|---|---|
| **MR1** | [mr1-foundation](./2026-05-15-audio-overhaul-spec-1-mr1-foundation.md) | None — new files only | ✓ must pass |
| **MR2** | [mr2-infrastructure](./2026-05-15-audio-overhaul-spec-1-mr2-infrastructure.md) | None — new files only | ✓ must pass |
| **MR3** | [mr3-director](./2026-05-15-audio-overhaul-spec-1-mr3-director.md) | None — event enrichment, old audio still wired | ✓ must pass |
| **MR4** | [mr4-wiring](./2026-05-15-audio-overhaul-spec-1-mr4-wiring.md) | **Hum stops. Silence replaces it.** | ✓ must pass |

---

## Full file map

### New files

| File | MR | Responsibility |
|---|---|---|
| `tests/helpers/mock-audio-context.ts` | MR1 | Transcript-recording mock AudioContext for all audio unit tests |
| `src/audio/civ-audio-family.ts` | MR1 | `AudioFamily` type, `CIV_TO_AUDIO_FAMILY`, `MINOR_CIV_TO_AUDIO_FAMILY`, `getFamilyForCiv()` |
| `src/audio/audio-catalog.ts` | MR1 | `LoopPoints`, `TrackEntry`, `ERA_BASE`, `ACCENT`, `WAR_LAYER`, `STINGER`, `resolveEra()` |
| `public/audio/**/*.ogg` (34 files) | MR1 | Silent placeholder OGGs |
| `AUDIO-CREDITS.md` | MR1 | CC-BY attribution file (root level) |
| `src/audio/audio-loader.ts` | MR2 | fetch + decode AudioBuffers, in-memory cache, silent fallback |
| `src/audio/audio-mixer.ts` | MR2 | Web Audio graph, 5 buses, snapshot table, crossfade, mute, square-law volume |
| `src/audio/music-director.ts` | MR3 | Game-event → mixer-command translator; owns `intendedSnapshot` |
| `src/audio/audio-system.ts` | MR4 | Lifecycle: AudioContext, user-gesture resume, visibilitychange, EventBus wiring |
| `tests/audio/audio-catalog.test.ts` | MR1 | Catalog completeness + on-disk OGG integrity |
| `tests/audio/civ-audio-family.test.ts` | MR1 | Civ/minor-civ full coverage + fallback |
| `tests/audio/audio-loader.test.ts` | MR2 | Cache hits, silent fallback, preload error tolerance |
| `tests/audio/audio-mixer.test.ts` | MR2 | Bus topology, snapshot ramps, mute hard-override, square-law |
| `tests/audio/music-director.test.ts` | MR3 | Event-payload → mixer-call sequences; transition-event regressions |
| `tests/audio/audio-system.integration.test.ts` | MR4 | End-to-end Flows A–M with mock mixer |

### Modified files

| File | MR | What changes |
|---|---|---|
| `src/core/types.ts` | MR3 | Add `era:advanced`, `currentPlayer:changed-after-handoff` events; enrich `diplomacy:war-declared`, `diplomacy:peace-made`, `city:founded` |
| `src/systems/diplomacy-system.ts` | MR3 | Export `resolveOpponentKind()`; enrich `war-declared` and `peace-made` emits |
| `src/core/turn-manager.ts` | MR3 | Emit `era:advanced` after era increment |
| `src/main.ts` | MR3 (enrichments) + MR4 (wiring) | Enrich 3 emit sites in MR3; replace AudioManager + add AudioSystem calls in MR4 |
| `src/input/foreign-city-entry-flow.ts` | MR3 | Enrich `diplomacy:war-declared` emit |
| `src/ai/basic-ai.ts` | MR3 | Enrich 2 `diplomacy:war-declared` emits + 1 `city:founded` emit |
| `src/audio/sfx.ts` | MR4 | Add `routeSfxThrough(node)`; route `playTone` through mixer SFX bus |
| `public/sw.js` | MR4 | Add era-1 war layer to `PRECACHE_URLS` (pre-bundled per L2) |

### Deleted files

| File | MR | Reason |
|---|---|---|
| `src/audio/audio-manager.ts` | MR4 | Replaced by `AudioSystem` (R1) |
| `src/audio/music-generator.ts` | MR4 | Procedural drone bug being fixed (D1) |

---

## Key design decisions affecting implementation

**Audio file paths (important — Vite base URL):** The catalog stores paths as relative strings without a leading slash (e.g., `'audio/era/era1-base.ogg'`). `AudioLoader.get(path)` prepends `import.meta.env.BASE_URL` at runtime so the path resolves correctly in both dev (`localhost:5173/conquestoria/`) and production (`/conquestoria/`). On-disk tests use `path.join('public', entry.file)` which works because `'public/audio/era/era1-base.ogg'` exists after Task 4.

**`LoopPoints` type (dedup — C-4):** Defined once in `src/audio/audio-catalog.ts` and imported by `src/audio/audio-mixer.ts`. Do not redeclare it in the mixer.

**`remainingWars` in peace handler:** `MusicDirector.handlePeaceSigned()` takes a `remainingWars: number` field that `AudioSystem` computes by tracking a `warCount` counter (incremented on war-declared, decremented on peace-made, clamped to ≥ 0).

**`EventBus.on()` returns an unsubscribe function** (`() => void`). Use `this.unsubscribers.push(bus.on(...))` in `AudioSystem` and call all unsubscribers in `dispose()`.

**`WarDeclaredPayload` in director uses `aggressor/defender`** (semantic names). The `diplomacy:war-declared` event uses `attackerId/defenderId`. `AudioSystem.wireEvents()` maps between them.

**Test environment:** `vitest` runs in `node` environment (see `vite.config.ts`). `import.meta.env.BASE_URL` evaluates to `'/'` in tests. `MockAudioContext` replaces the browser `AudioContext` in all audio unit tests.

---

## Curation MR series (after all 4 MRs merge)

Per the [assets and curation doc](../specs/2026-05-15-audio-overhaul-spec-1-assets-and-curation.md): era bases first → war layers → civ accents → stingers → transition cues. Each curation MR replaces one or a few placeholder OGGs with real audio and adds an `AUDIO-CREDITS.md` entry. No code changes required — the catalog's `bpm`, `key`, and `loop` fields update to reflect real track metadata.
