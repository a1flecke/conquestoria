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
   SFX  ──────── SFX bus ──────────────┤
                                       │
   (Voice/UI buses reserved for Spec 3)┘
```

Each bus is a `GainNode` fed by an `AudioBufferSourceNode` (looped for music buses, one-shot for stingers and SFX). The master gain is driven by `state.settings.musicVolume`. SFX volume routes through the SFX bus, governed by `state.settings.sfxVolume`.

## Snapshots

A snapshot is a named static gain preset across the music buses. The mixer holds the table; the director picks which snapshot is currently intended.

| Snapshot | Era Base | Civ Accent | Adaptive | Stinger |
|---|---|---|---|---|
| `silent` | 0.0 | 0.0 | 0.0 | 0.0 |
| `peace` | 1.0 | 0.7 | 0.0 | 1.0 |
| `at-war` | 1.0 | 0.5 | 0.8 | 1.0 |
| `stinger-duck` | 0.5 | 0.35 | 0.4 | 1.0 |

`setSnapshot(id, fadeMs)` ramps every music bus to its preset value simultaneously. The Stinger bus's gain stays at 1.0 across snapshots so stingers are always full-volume; the duck attenuates the other three music buses, not the stinger itself.

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
  setMusicEnabled(b: boolean): void;
  setSfxEnabled(b: boolean): void;
  dispose(): void;
}
```

Snapshot table is a private constant in the mixer module. Mixer does not track which snapshot is "current" beyond the running gain ramps — that ownership belongs to the director (A3).

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
  loopStart: number;
  loopEnd: number;
  idealCrossfadeOutAt?: number;
  qualityTier?: 'low' | 'med' | 'high';  // Reserved for Spec 4; default 'med'.
}

export const ERA_BASE: Record<EraId, TrackEntry>;
export const ACCENT: Record<AudioFamily, TrackEntry>;
export const WAR_LAYER: Record<EraId, TrackEntry>;
export const STINGER: {
  eraAdvance: Record<EraId, TrackEntry>;
  cityFounded: TrackEntry;
  warDeclared: TrackEntry;
};

export function resolveEra(era: number): EraId;  // Clamps era >5 to 5 per Er2.
```

Initial values point at silent placeholder OGGs in `public/audio/`. Real files swap in via the curation MR series; code is unchanged.

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

Minor civ mapping is decided per-civ during implementation by reading `src/systems/minor-civ-definitions.ts`.

## Existing files touched

- `src/main.ts` — replaces `new AudioManager()` and `audio.playProceduralMusic(era)` call sites with `new AudioSystem(bus, () => gameState)` and event-driven control. ~6 call sites total.
- `src/audio/sfx.ts` — replaces `getContext()`/`ctx.destination` plumbing with a routing function provided by `AudioSystem` so SFX go through `mixer.sfx`. No change to the sound set itself.
- Service Worker source — adds `/audio/*` to the cache-first list. Exact file location verified during plan-writing.
- `state.settings` — no schema change (existing `musicEnabled`, `sfxEnabled`, `musicVolume`, `sfxVolume` are sufficient for Spec 1 per U1).
