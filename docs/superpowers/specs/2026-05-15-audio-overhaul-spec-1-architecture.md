# Spec 1 — Architecture and Component Contracts

Subsection of [Spec 1 — Music Foundation](./2026-05-15-audio-overhaul-spec-1-music-foundation.md). Read that index first.

## Mixer topology

A new `AudioMixer` replaces the current `AudioManager` + `MusicGenerator`. It owns a Web Audio graph with five labeled buses converging on a master gain:

```
                ┌─ Era Base bus ───────┐
                ├─ Civ Accent bus ─────┤
   Music ───────┤                      │
                ├─ Adaptive bus ───────┤
                │                      │
                └─ Stinger bus ────────┤
                                       ├──→ Master gain ──→ destination
   SFX  ──────── SFX bus ──────────────┘
```

Each bus is a `GainNode` fed by an `AudioBufferSourceNode` (looped for music buses, one-shot for stingers and SFX). The master gain is driven by `state.settings.musicVolume` through a square-law perceptual curve (`gain = v * v` per Au-2) so the slider feels linear to the ear. SFX volume routes through the SFX bus, also via the square-law curve. Spec 3 adds Voice and UI buses to this graph; they are not present in Spec 1.

## Snapshots

A snapshot is a named static gain preset across the music buses. The mixer holds the table; the director picks which snapshot is currently intended.

| Snapshot | Era Base | Civ Accent | Adaptive | Stinger |
|---|---|---|---|---|
| `silent` | 0.0 | 0.0 | 0.0 | 0.0 |
| `peace` | 1.0 | 0.7 | 0.0 | 1.0 |
| `at-war` | 1.0 | 0.5 | 0.8 | 1.0 |
| `stinger-duck` | 0.5 | 0.35 | 0.4 | 1.0 |

`setSnapshot(id, fadeMs)` ramps every music bus to its preset value simultaneously. The Stinger bus's gain stays at 1.0 across snapshots so when a stinger fires it plays at full volume; the duck attenuates the other three music buses, not the stinger itself. Outside an active `playOneShot`, the Stinger bus has no source so its 1.0 gain is silent — the value defines the envelope a stinger plays *into*, not a steady tone.

## Module map

```
src/audio/
  audio-system.ts       NEW — top-level: owns AudioContext, mixer, loader, director.
                            Single entry point that main.ts talks to.
                            Handles user-gesture resume and visibility suspend/resume.
  audio-mixer.ts        NEW — Web Audio graph + snapshots. Stateless beyond Web Audio internals.
                            AudioContext is a constructor dep.
  music-director.ts     NEW — pure event-payload handlers, no state-getter injection.
                            Owns the "intended" snapshot. Ignores non-current-player events.
  audio-loader.ts       NEW — fetch + decode AudioBuffers with in-memory cache.
                            Silent-buffer fallback on fetch failure.
  audio-catalog.ts      NEW — pure data: per-era and per-family TrackEntry tables.
  civ-audio-family.ts   NEW — pure data: CIV_TO_AUDIO_FAMILY + MINOR_CIV_TO_AUDIO_FAMILY.
  sfx.ts                MODIFIED — routes through mixer.sfx bus instead of ctx.destination.
                            Unchanged in playback semantics; Spec 2 redesigns the sound set.
  audio-manager.ts      DELETED — was the facade. Per CLAUDE.md no-backcompat-shims rule.
  music-generator.ts    DELETED — the procedural drone bug being fixed (D1).

public/audio/           NEW asset directory; silent placeholder OGGs initially.
AUDIO-CREDITS.md        NEW root-level CC-BY attribution file.
```

## Component contracts

### `AudioSystem` (`src/audio/audio-system.ts`)

Top-level lifecycle owner. The only object `main.ts` directly references.

```ts
class AudioSystem {
  constructor(eventBus: EventBus);
  async init(): Promise<void>;       // Creates suspended AudioContext; registers user-gesture resume listener; subscribes visibilitychange; wires eventBus → MusicDirector handlers.
  async start(state: GameState): Promise<void>; // Cold start or save-load: preload era/accent/war for current player, apply initial snapshot. Reads state directly only at this single entry point (Flows A and B).
  stop(): void;                       // Stops all sources; keeps context alive.
  setMusicEnabled(b: boolean): void;
  setSfxEnabled(b: boolean): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  dispose(): void;                    // Tears down on beforeunload.
}
```

Internally instantiates `AudioContext` (suspended), `AudioMixer`, `AudioLoader`, `MusicDirector`. Registers three listeners:

- One-time `pointerdown` on `document` → `ctx.resume()`. Self-removing.
- `visibilitychange` on `document` → `ctx.suspend()` when hidden, `ctx.resume()` when visible (G3).
- Subscriptions on the game `EventBus` for the events listed in the [data flow](./2026-05-15-audio-overhaul-spec-1-data-flow.md) doc. Each subscription routes the event's payload to the matching `MusicDirector` handler.

Per R2, event payloads carry the state slice each handler needs (`currentPlayerCivType`, `newEra`, `isAtWar`, etc.). If an existing game event does not natively carry the required slice, Spec 1 enriches it at the source — the director never reads `GameState` directly.

### `AudioMixer` (`src/audio/audio-mixer.ts`)

Pure Web Audio, knows nothing about game state.

```ts
type BusId = 'era' | 'accent' | 'adaptive' | 'stinger' | 'sfx';
type SnapshotId = 'silent' | 'peace' | 'at-war' | 'stinger-duck';

interface LoopPoints { loopStart: number; loopEnd: number; }

class AudioMixer {
  constructor(ctx: AudioContext);
  setBusSource(bus: BusId, buffer: AudioBuffer | null, loop: boolean, loopPoints: LoopPoints | null, fadeMs: number): void;
  playOneShot(bus: BusId, buffer: AudioBuffer): Promise<void>;  // Resolves when buffer playback ends. Duck-neutral (A2).
  setSnapshot(id: SnapshotId, fadeMs: number): void;
  setMasterMusicVolume(v: number, fadeMs?: number): void;       // For game-end fade (G2).
  setMusicEnabled(b: boolean): void;       // Per M-1: hard-overrides master music gain to 0 when false. Sources keep running.
  setSfxEnabled(b: boolean): void;         // Per M-1: hard-overrides SFX bus gain to 0 when false.
  getSfxRoutingNode(): AudioNode;          // Returned to sfx.ts so it can route through the SFX bus (H-3).
  dispose(): void;
}
```

The mixer tracks Web Audio source-node lifecycle internally (so it can crossfade them) but is stateless w.r.t. game-domain state. The snapshot table is a private constant in the mixer module. Mixer does not track which snapshot is "currently intended" — that ownership belongs to the director (A3).

**Mute behavior (M-1, M-2)**: `setMusicEnabled(false)` forces master music gain to 0 immediately, regardless of any in-flight fade (including the G2 game-end fade). Re-enabling restores master gain to the configured `musicVolume` and the currently-running snapshot continues from where it was — no buffer restart. Same for `setSfxEnabled`. The context is never suspended due to mute; only `visibilitychange` (G3) suspends the context.

### `MusicDirector` (`src/audio/music-director.ts`)

Translates game events into mixer commands. Event-payload handlers are pure functions of their payload (R2).

```ts
interface EraAdvancedPayload { civType: string; newEra: number; currentPlayerCivType: string; }
interface WarDeclaredPayload { aggressor: string; defender: string; currentPlayerCivType: string; }
interface PeaceSignedPayload { civA: string; civB: string; currentPlayerCivType: string; }
interface CityFoundedPayload { civType: string; currentPlayerCivType: string; }
interface CurrentPlayerChangedPayload { civType: string; era: number; isAtWar: boolean; }
interface GameEndedPayload { outcome: 'victory' | 'defeat' | 'tie'; }

class MusicDirector {
  constructor(mixer: AudioMixer, loader: AudioLoader, catalog: AudioCatalog);

  handleEraAdvance(p: EraAdvancedPayload): Promise<void>;       // No-op if civType !== currentPlayerCivType (A5).
  handleWarDeclared(p: WarDeclaredPayload): Promise<void>;
  handlePeaceSigned(p: PeaceSignedPayload): Promise<void>;
  handleCityFounded(p: CityFoundedPayload): Promise<void>;
  handleCurrentPlayerChanged(p: CurrentPlayerChangedPayload): Promise<void>;
  handleGameEnded(p: GameEndedPayload): Promise<void>;
}
```

Director owns a private `intendedSnapshot: SnapshotId`. After every `playOneShot` resolves, it re-asserts `mixer.setSnapshot(intendedSnapshot, fadeMs=600)` (A3).

### `AudioLoader` (`src/audio/audio-loader.ts`)

```ts
class AudioLoader {
  constructor(ctx: AudioContext);
  get(url: string): Promise<AudioBuffer>;       // Returns cached if seen; silent fallback on fetch failure.
  preload(urls: string[]): Promise<void>;       // Fire-and-forget warming; tolerates individual failures.
  isCached(url: string): boolean;
}
```

Same URL fetched twice → one `AudioBuffer`. Service Worker handles HTTP-layer caching (project already has a SW; Spec 1 adds a `/audio/*` cache-first rule).

### `AudioCatalog` (`src/audio/audio-catalog.ts`)

Pure data. No logic.

```ts
type EraId = 1 | 2 | 3 | 4 | 5;

interface TrackEntry {
  id: string;
  file: string;
  bpm: number;
  key: string;
  loop: LoopPoints;                        // Same shape as AudioMixer.LoopPoints (C-4 dedup).
  idealCrossfadeOutAt?: number;
  qualityTier?: 'low' | 'med' | 'high';    // Reserved for Spec 4; default 'med'.
}

export const ERA_BASE: Record<EraId, TrackEntry>;
export const ACCENT: Record<AudioFamily, TrackEntry>;
export const WAR_LAYER: Record<EraId, TrackEntry>;
export const STINGER: {
  eraAdvance: Record<EraId, TrackEntry>;
  eraTransitionCue: Record<EraId, TrackEntry>;  // Softened cue for cross-era hot-seat handoff (UX-2).
  cityFounded: TrackEntry;
  warDeclared: TrackEntry;
};

export function resolveEra(era: number): EraId;  // Clamps era >5 to 5 per Er2.
```

Initial values point at silent placeholder OGGs in `public/audio/`. Real files swap in via the curation MR series; code is unchanged.

The `eraTransitionCue` slot is new in this revision (UX-2). It is a short, sustained single-chord cue (~1.5s) used only when hot-seat handoff crosses an era boundary. It does not play on the real `era:advanced` event — that path uses the louder, more cinematic `eraAdvance` stinger. The cue preserves hot-seat privacy (no spoilers about the next player's tech progress) while giving an audible signal that the music is changing.

### `CivAudioFamily` (`src/audio/civ-audio-family.ts`)

```ts
export type AudioFamily =
  | 'east-asian' | 'south-asian' | 'middle-eastern' | 'mediterranean-antiquity'
  | 'western-european' | 'norse' | 'african' | 'mesoamerican' | 'steppe'
  | 'fantasy-high' | 'fantasy-dark' | 'fantasy-mystical';

export const CIV_TO_AUDIO_FAMILY: Record<string, AudioFamily>;
export const MINOR_CIV_TO_AUDIO_FAMILY: Record<string, AudioFamily>;

export function getFamilyForCiv(civType: string): AudioFamily;  // Falls back to 'mediterranean-antiquity' for unknown IDs.
```

Mapping table (29 major civs):

| Family | Civs |
|---|---|
| east-asian | china, japan |
| south-asian | india |
| middle-eastern | babylon, persia, ottoman |
| mediterranean-antiquity | rome, greece, egypt |
| western-european | england, france, germany, spain, russia |
| norse | viking |
| african | zulu, wakanda |
| mesoamerican | aztec |
| steppe | mongolia |
| fantasy-high | gondor, rohan, lothlorien, avalon, narnia, shire |
| fantasy-dark | isengard, annuvin |
| fantasy-mystical | atlantis, prydain |

**Minor civ mapping heuristic (H-5):** each minor civ maps to the audio family of its closest historical/cultural parent. For example: `carthage` → `mediterranean-antiquity`, `sparta` → `mediterranean-antiquity`, `byzantium` → `middle-eastern`, `tibet` → `east-asian`, `mali` → `african`, `inca` → `mesoamerican`. The implementation step enumerates all minor civs from `src/systems/minor-civ-definitions.ts` and assigns each one explicitly using this rule. Unknown/unmapped minor civs fall through to `getFamilyForCiv`'s default (`mediterranean-antiquity`), which is also the fallback for any civ ID not in either map.

## Existing files touched

- `src/main.ts` — replaces `new AudioManager()` and `audio.playProceduralMusic(era)` call sites with `new AudioSystem(eventBus)` plus an `audioSystem.start(gameState)` call when the game starts or a save is loaded. ~6 call sites total.
- `src/audio/sfx.ts` — refactored to route through the mixer's SFX bus. New shape: `sfx.ts` exports a `routeSfxThrough(node: AudioNode)` setup function called once by `AudioSystem` with `mixer.getSfxRoutingNode()`. The existing `playTone` helper changes from `gain.connect(ctx.destination)` to `gain.connect(routedNode)`. Sound set unchanged (Spec 2 redesigns it).
- Service Worker source — adds `/audio/*` to the cache-first list. Exact source-file location verified during plan-writing.
- `state.settings` — no schema change (existing `musicEnabled`, `sfxEnabled`, `musicVolume`, `sfxVolume` are sufficient for Spec 1 per U1). Saves do not contain audio system internals — confirmed by inspection (`AudioManager` state was always transient).
