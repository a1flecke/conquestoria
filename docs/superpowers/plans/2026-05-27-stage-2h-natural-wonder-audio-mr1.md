# Stage 2H MR1 Natural Wonder Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add the reusable natural-wonder audio architecture plus complete, real Soundimage stinger and ambience assets for Great Volcano, Ancient Forest, and Coral Reef.

**Architecture:** Natural-wonder audio is viewer-safe and event/UI driven: discovery reveal plays a ducked stinger, live map focus can start a short ambience, and the Codex owns page-scoped ambience. A typed catalog records every natural wonder, marks this MR's three complete assets, and keeps remaining wonders explicitly pending so future asset MRs extend data rather than changing playback logic.

**Tech Stack:** TypeScript, Web Audio API, existing `AudioLoader`/`AudioMixer`/`MusicDirector`, DOM UI panels, Vitest, Soundimage MP3 sources converted to OGG Vorbis under `public/audio/wonders/`.

---

## Scope Check

The Stage 2H spec covers all 15 natural wonders, meaning 30 real clips plus playback architecture. This plan intentionally implements MR1 only:

- Complete architecture for all future natural-wonder audio.
- Complete authored audio entries and real files for:
  - `great_volcano`
  - `ancient_forest`
  - `coral_reef`
- Explicit `pending` catalog entries for the other 12 wonders.
- No PWA precache expansion; wonder audio remains loaded on demand through normal fetch/cache behavior.

Future MRs add only catalog entries, converted files, credits, and catalog-test completion list updates unless this MR's architecture proves insufficient.

## File Structure

Create:

- `src/audio/natural-wonder-audio-sources.ts`  
  Typed source/credit manifest for every real MR1 source track or sound effect.
- `src/audio/natural-wonder-audio-catalog.ts`  
  Typed natural-wonder audio catalog with complete and pending entries.
- `src/audio/natural-wonder-audio-director.ts`  
  Playback coordinator for discovery stingers, replay stingers, Codex ambience, map-focus ambience, timeout cleanup, and no-op pending entries.
- `src/input/natural-wonder-audio-focus.ts`  
  Viewer-safe helper that allows map ambience only for live visible, discovered natural-wonder tiles.
- `tests/audio/natural-wonder-audio-catalog.test.ts`
- `tests/audio/natural-wonder-audio-director.test.ts`
- `tests/input/natural-wonder-audio-focus.test.ts`
- `public/audio/wonders/great-volcano-stinger.ogg`
- `public/audio/wonders/great-volcano-ambient.ogg`
- `public/audio/wonders/ancient-forest-stinger.ogg`
- `public/audio/wonders/ancient-forest-ambient.ogg`
- `public/audio/wonders/coral-reef-stinger.ogg`
- `public/audio/wonders/coral-reef-ambient.ogg`

Modify:

- `AUDIO-CREDITS.md`  
  Add exact Soundimage credits and source URLs for the six MR1 files.
- `src/audio/audio-mixer.ts`  
  Add a dedicated ambience loop path routed through the SFX gain, separate from one-shot SFX and music buses.
- `src/audio/music-director.ts`  
  Make `playStingerWithDuck(path)` public so natural-wonder stingers reuse the existing ducking state machine.
- `src/audio/audio-system.ts`  
  Own `NaturalWonderAudioDirector`, expose natural-wonder audio methods, stop ambience on hot-seat handoff and game end.
- `src/main.ts`  
  Wire discovery reveal, map tap, territory inspection open/close, and Codex callbacks to `AudioSystem`.
- `src/ui/wonder-atlas-panel.ts`  
  Pass natural-wonder audio callbacks through to the Codex panel.
- `src/ui/wonder-codex-panel.ts`  
  Start/stop Codex ambience as selected natural-wonder pages become visible or hidden.
- `src/ui/wonder-codex-page.ts`  
  Trigger audio replay when the natural-wonder replay button is clicked and reduced motion is not active.
- `tests/audio/audio-mixer.test.ts`
- `tests/audio/music-director.test.ts`
- `tests/audio/audio-system.integration.test.ts`
- `tests/ui/wonder-atlas-panel.test.ts`
- `tests/ui/wonder-codex-panel.test.ts`
- `tests/ui/wonder-codex-page.test.ts`
- `tests/ui/wonder-discovery-queue.test.ts`

## Player Truth Table

| Before | Action | Internal change | Immediate visible/audio result | Must remain reachable |
|---|---|---|---|---|
| Movement reveal ceremony opens for `great_volcano` | Reveal starts | `wonder:discovered` item reaches queue `onRevealStarted` | Existing reveal visuals continue; Great Volcano stinger plays once through ducking | Open Atlas button and map highlight still work |
| Map shows a live visible discovered `coral_reef` tile | Player taps the tile | Atlas opens; focus helper authorizes audio because tile is live-visible and discovered by viewer | Codex opens on Coral Reef; short Coral Reef ambience starts | Tap SFX still plays; Codex close still works |
| Atlas can open a last-seen discovered wonder with hidden current tile | Player taps last-seen Atlas affordance | Atlas opens through existing intent; focus helper denies map ambience | No map-focus ambience leaks hidden live presence | Codex info remains visible because discovered Codex records are allowed |
| Territory inspection opens on a live visible `ancient_forest` tile | Player long-presses/inspects tile | Focus helper authorizes audio; panel open callback starts ambience | Territory panel appears; Ancient Forest ambience starts softly | Close button remains reachable |
| Codex reader shows `great_volcano` | Player selects `ancient_forest` from catalog | Panel hides previous natural page and shows new one | Great Volcano ambience fades out; Ancient Forest ambience fades in | Full catalog entries remain reachable |
| Codex reader shows a natural wonder | Player clicks `Replay animation` | Page replay callback asks audio system for replay | Existing animation replay occurs; stinger plays; page ambience restarts | Reduced-motion disabled state remains respected |
| Reduced motion is active | Player sees replay button disabled | No audio callback fires | No replay stinger or ambient restart | Static Codex content remains visible |
| Hot-seat handoff or game over occurs | Player continues flow | `AudioSystem` receives event | Any natural-wonder ambience stops | Existing music handoff/game-over behavior remains unchanged |

## Misleading UI Risks

- `resolveNaturalWonderAudioFocus` must require all of these: tile exists, tile has a natural wonder, viewer has discovered that wonder, and the current tile visibility is live-visible for the viewer.
- A discovered-but-hidden tile is Atlas-readable but not map-audible. The negative test must prove last-seen natural wonders return `null` for map audio.
- Pending audio catalog entries must not play fallback stingers or generic ambience. The negative director test must prove a pending wonder makes no loader or mixer calls.
- Codex ambient lifecycle must follow the visible reader, not merely the selected ID. Mobile catalog view must not keep hidden reader ambience running.

## Interaction Replay Checklist

- Discovery queue: first reveal plays one stinger; enqueuing a second item waits until its reveal starts; duplicate suppression still works.
- Map tap: repeat tapping the same live visible wonder restarts short ambience without stacking duplicate loops.
- Territory inspection: open starts authorized ambience; close stops it; reopening starts it again.
- Codex selection: natural-to-natural selection fades old ambience before starting new ambience.
- Codex selection: natural-to-legendary and mobile back-to-catalog stop natural ambience.
- Replay click: repeated clicks clear the existing visual timer and call audio replay each time; reduced-motion click does nothing because the button is disabled.

## Audio Asset Sources

Use these exact source URLs and credit all of them in `AUDIO-CREDITS.md`:

| Wonder | Output | Source title | Source URL |
|---|---|---|---|
| `great_volcano` | `great-volcano-stinger.ogg` | `Underwater Rumble` | `https://soundimage.org/wp-content/uploads/2019/11/Underwater-Rumble.mp3` |
| `great_volcano` | `great-volcano-ambient.ogg` | `Quiet Tension_Looping` | `https://soundimage.org/wp-content/uploads/2018/10/Quiet-Tension_Looping.mp3` |
| `ancient_forest` | `ancient-forest-stinger.ogg` | `Morning Dew` | `https://soundimage.org/wp-content/uploads/2014/02/Morning-Dew.mp3` |
| `ancient_forest` | `ancient-forest-ambient.ogg` | `Sunrise_Looping` | `https://soundimage.org/wp-content/uploads/2018/10/Sunrise_Looping.mp3` |
| `coral_reef` | `coral-reef-stinger.ogg` | `Life in a Drop` | `https://soundimage.org/wp-content/uploads/2014/02/Life-in-a-Drop.mp3` |
| `coral_reef` | `coral-reef-ambient.ogg` | `Underwater World_Looping` | `https://soundimage.org/wp-content/uploads/2016/11/Underwater-World_Looping.mp3` |

All six sources are by Eric Matyas / Soundimage.org. The source manifest must store `license: 'Soundimage.org free use with attribution'` and tests must verify the credits file contains the source titles and `soundimage.org`.

## Task 1: Add Typed Catalog, Source Manifest, and Failing Catalog Tests

**Files:**

- Create: `src/audio/natural-wonder-audio-sources.ts`
- Create: `src/audio/natural-wonder-audio-catalog.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Write the failing catalog tests**

Create `tests/audio/natural-wonder-audio-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FINAL_NATURAL_WONDER_AUDIO_COVERAGE,
  getCompleteNaturalWonderAudioEntry,
  getNaturalWonderAudioCatalog,
  MR1_NATURAL_WONDER_AUDIO_IDS,
} from '../../src/audio/natural-wonder-audio-catalog';
import { getNaturalWonderAudioSource } from '../../src/audio/natural-wonder-audio-sources';
import { getWonderSpectacleRecipe } from '../../src/systems/wonder-spectacle/presentation';
import { WONDER_DEFINITIONS } from '../../src/systems/wonder-definitions';

const repoRoot = resolve(__dirname, '../..');

function readMagic(path: string): Buffer {
  return readFileSync(resolve(repoRoot, 'public', path)).subarray(0, 4);
}

describe('natural wonder audio catalog', () => {
  it('has exactly one catalog entry for every natural wonder definition', () => {
    const catalog = getNaturalWonderAudioCatalog();
    expect(catalog.map(entry => entry.wonderId).sort()).toEqual(
      WONDER_DEFINITIONS.map(definition => definition.id).sort(),
    );
  });

  it('keeps MR1 wonders complete and all remaining wonders explicit pending entries', () => {
    const catalog = getNaturalWonderAudioCatalog();
    for (const entry of catalog) {
      if (MR1_NATURAL_WONDER_AUDIO_IDS.includes(entry.wonderId)) {
        expect(entry.status).toBe('complete');
      } else {
        expect(entry.status).toBe('pending');
      }
    }
    expect(FINAL_NATURAL_WONDER_AUDIO_COVERAGE).toBe(false);
  });

  it('aligns complete entry sound moods with spectacle recipes', () => {
    for (const wonderId of MR1_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      const recipe = getWonderSpectacleRecipe(wonderId);
      expect(entry?.soundMood).toBe(recipe?.soundMood);
    }
  });

  it('references source metadata and existing OGG files for complete entries', () => {
    for (const wonderId of MR1_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      expect(entry).not.toBeNull();
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        expect(getNaturalWonderAudioSource(clip.sourceId)).toBeDefined();
        expect(existsSync(resolve(repoRoot, 'public', clip.file))).toBe(true);
        expect(readMagic(clip.file).toString('utf8')).toBe('OggS');
      }
    }
  });

  it('keeps credits synchronized with source titles and local output paths', () => {
    const credits = readFileSync(resolve(repoRoot, 'AUDIO-CREDITS.md'), 'utf8');
    for (const wonderId of MR1_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        const source = getNaturalWonderAudioSource(clip.sourceId);
        expect(source).toBeDefined();
        expect(credits).toContain(source!.title);
        expect(credits).toContain(source!.sourceUrl);
        expect(credits).toContain(clip.file);
      }
    }
  });
});
```

- [ ] **Step 2: Run the catalog test and verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: FAIL because `src/audio/natural-wonder-audio-catalog.ts` and `src/audio/natural-wonder-audio-sources.ts` do not exist yet.

- [ ] **Step 3: Add the source manifest**

Create `src/audio/natural-wonder-audio-sources.ts`:

```ts
export interface NaturalWonderAudioSource {
  id: string;
  title: string;
  creator: 'Eric Matyas';
  site: 'Soundimage.org';
  sourceUrl: string;
  license: 'Soundimage.org free use with attribution';
}

export const NATURAL_WONDER_AUDIO_SOURCES: readonly NaturalWonderAudioSource[] = [
  {
    id: 'soundimage-underwater-rumble',
    title: 'Underwater Rumble',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2019/11/Underwater-Rumble.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-quiet-tension-looping',
    title: 'Quiet Tension_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Quiet-Tension_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-morning-dew',
    title: 'Morning Dew',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Morning-Dew.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-sunrise-looping',
    title: 'Sunrise_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Sunrise_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-life-in-a-drop',
    title: 'Life in a Drop',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Life-in-a-Drop.mp3',
    license: 'Soundimage.org free use with attribution',
  },
  {
    id: 'soundimage-underwater-world-looping',
    title: 'Underwater World_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2016/11/Underwater-World_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
  },
] as const;

export function getNaturalWonderAudioSource(sourceId: string): NaturalWonderAudioSource | undefined {
  return NATURAL_WONDER_AUDIO_SOURCES.find(source => source.id === sourceId);
}
```

- [ ] **Step 4: Add the catalog with complete and pending entries**

Create `src/audio/natural-wonder-audio-catalog.ts`:

```ts
import type { LoopPoints } from './audio-catalog';
import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';
import { getWonderSpectacleRecipe } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectacleRecipe } from '@/systems/wonder-spectacle/types';

export type NaturalWonderAudioStatus = 'complete' | 'pending';
export type NaturalWonderSoundMood = WonderSpectacleRecipe['soundMood'];

export interface NaturalWonderAudioClip {
  id: string;
  file: string;
  sourceId: string;
  gain: number;
}

export interface NaturalWonderAmbientLoopClip extends NaturalWonderAudioClip {
  loop: LoopPoints;
  fadeInMs: number;
  fadeOutMs: number;
  mapFocusTimeoutMs: number;
}

export interface CompleteNaturalWonderAudioEntry {
  wonderId: string;
  status: 'complete';
  soundMood: NaturalWonderSoundMood;
  stinger: NaturalWonderAudioClip;
  ambientLoop: NaturalWonderAmbientLoopClip;
}

export interface PendingNaturalWonderAudioEntry {
  wonderId: string;
  status: 'pending';
  soundMood: NaturalWonderSoundMood;
}

export type NaturalWonderAudioEntry = CompleteNaturalWonderAudioEntry | PendingNaturalWonderAudioEntry;

export const FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false;
export const MR1_NATURAL_WONDER_AUDIO_IDS = ['great_volcano', 'ancient_forest', 'coral_reef'] as const;

const COMPLETE_ENTRIES: Record<(typeof MR1_NATURAL_WONDER_AUDIO_IDS)[number], CompleteNaturalWonderAudioEntry> = {
  great_volcano: {
    wonderId: 'great_volcano',
    status: 'complete',
    soundMood: 'volcanic-breath',
    stinger: {
      id: 'great-volcano-stinger',
      file: 'audio/wonders/great-volcano-stinger.ogg',
      sourceId: 'soundimage-underwater-rumble',
      gain: 0.82,
    },
    ambientLoop: {
      id: 'great-volcano-ambient',
      file: 'audio/wonders/great-volcano-ambient.ogg',
      sourceId: 'soundimage-quiet-tension-looping',
      gain: 0.30,
      loop: { loopStart: 0, loopEnd: 84.0 },
      fadeInMs: 650,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  ancient_forest: {
    wonderId: 'ancient_forest',
    status: 'complete',
    soundMood: 'forest-whisper',
    stinger: {
      id: 'ancient-forest-stinger',
      file: 'audio/wonders/ancient-forest-stinger.ogg',
      sourceId: 'soundimage-morning-dew',
      gain: 0.72,
    },
    ambientLoop: {
      id: 'ancient-forest-ambient',
      file: 'audio/wonders/ancient-forest-ambient.ogg',
      sourceId: 'soundimage-sunrise-looping',
      gain: 0.28,
      loop: { loopStart: 0, loopEnd: 64.8 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  coral_reef: {
    wonderId: 'coral_reef',
    status: 'complete',
    soundMood: 'reef-glimmer',
    stinger: {
      id: 'coral-reef-stinger',
      file: 'audio/wonders/coral-reef-stinger.ogg',
      sourceId: 'soundimage-life-in-a-drop',
      gain: 0.72,
    },
    ambientLoop: {
      id: 'coral-reef-ambient',
      file: 'audio/wonders/coral-reef-ambient.ogg',
      sourceId: 'soundimage-underwater-world-looping',
      gain: 0.30,
      loop: { loopStart: 0, loopEnd: 20.0 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
};

function soundMoodFor(wonderId: string): NaturalWonderSoundMood {
  const recipe = getWonderSpectacleRecipe(wonderId);
  if (!recipe) throw new Error(`Missing natural wonder spectacle recipe for ${wonderId}`);
  return recipe.soundMood;
}

function cloneEntry(entry: NaturalWonderAudioEntry): NaturalWonderAudioEntry {
  if (entry.status === 'pending') return { ...entry };
  return {
    ...entry,
    stinger: { ...entry.stinger },
    ambientLoop: { ...entry.ambientLoop, loop: { ...entry.ambientLoop.loop } },
  };
}

export function getNaturalWonderAudioCatalog(): NaturalWonderAudioEntry[] {
  return WONDER_DEFINITIONS.map(definition => {
    const complete = COMPLETE_ENTRIES[definition.id as keyof typeof COMPLETE_ENTRIES];
    return cloneEntry(complete ?? {
      wonderId: definition.id,
      status: 'pending',
      soundMood: soundMoodFor(definition.id),
    });
  });
}

export function getNaturalWonderAudioEntry(wonderId: string): NaturalWonderAudioEntry | null {
  return getNaturalWonderAudioCatalog().find(entry => entry.wonderId === wonderId) ?? null;
}

export function getCompleteNaturalWonderAudioEntry(wonderId: string): CompleteNaturalWonderAudioEntry | null {
  const entry = getNaturalWonderAudioEntry(wonderId);
  return entry?.status === 'complete' ? entry : null;
}
```

- [ ] **Step 5: Run the catalog test and keep the expected asset/credit failures**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: catalog shape tests pass; file and credit tests fail until Task 5 adds OGG files and credits.

## Task 2: Add Dedicated Ambience Mixing and Reuse Stinger Ducking

**Files:**

- Modify: `src/audio/audio-mixer.ts`
- Modify: `src/audio/music-director.ts`
- Test: `tests/audio/audio-mixer.test.ts`
- Test: `tests/audio/music-director.test.ts`

- [ ] **Step 1: Add failing mixer ambience tests**

Append to `tests/audio/audio-mixer.test.ts`:

```ts
describe('AudioMixer natural wonder ambience', () => {
  it('routes ambience through the SFX path without occupying the one-shot SFX source', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 10 }, 500, 0.35);
    void mixer.playOneShot('sfx', makeBuf(ctx));

    expect(ctx.opsOf('start').length).toBe(2);
    const mixerAny = mixer as unknown as {
      ambienceSource: unknown;
      sfxBus: { source: unknown };
    };
    expect(mixerAny.ambienceSource).toBeTruthy();
    expect(mixerAny.sfxBus.source).toBeTruthy();
  });

  it('fades out the old ambience loop when a new one starts', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 10 }, 0, 0.35);
    ctx.clearTranscript();

    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 12 }, 600, 0.25);

    expect(ctx.opsOf('stop').length).toBe(1);
    expect(ctx.opsOf('linearRampToValueAtTime').some(entry => entry.args[0] === 0)).toBe(true);
    expect(ctx.opsOf('linearRampToValueAtTime').some(entry => entry.args[0] === 0.25)).toBe(true);
  });

  it('stops ambience on dispose', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setAmbienceLoop(makeBuf(ctx), { loopStart: 0, loopEnd: 10 }, 0, 0.35);
    ctx.clearTranscript();

    mixer.dispose();

    expect(ctx.opsOf('stop').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Add failing public ducking test**

Append to `tests/audio/music-director.test.ts`:

```ts
it('exposes ducked stinger playback for natural wonder stingers', async () => {
  const ctx = new MockAudioContext();
  const mixer = new AudioMixer(ctx as unknown as AudioContext);
  const loader = new AudioLoader(ctx as unknown as AudioContext);
  const director = new MusicDirector(mixer, loader);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('mock fetch')));

  director.initPeaceSnapshot();
  const promise = director.playStingerWithDuck('audio/wonders/great-volcano-stinger.ogg');
  await Promise.resolve();

  const mixerAny = mixer as unknown as {
    musicBuses: Record<string, { source: import('../helpers/mock-audio-context').MockBufferSourceNode | null }>;
  };
  mixerAny.musicBuses.stinger.source?.stop();

  await promise;
  expect(ctx.transcript.some(entry => entry.op === 'linearRampToValueAtTime')).toBe(true);

  vi.unstubAllGlobals();
});
```

- [ ] **Step 3: Run the targeted tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/audio-mixer.test.ts tests/audio/music-director.test.ts
```

Expected: FAIL because `setAmbienceLoop` does not exist and `playStingerWithDuck` is private.

- [ ] **Step 4: Implement ambience in `AudioMixer`**

Patch `src/audio/audio-mixer.ts`:

```ts
export class AudioMixer {
  private musicBuses: Record<MusicBusId, BusState>;
  private sfxBus: BusState;
  private ambienceGain: GainNode;
  private ambienceSourceGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  // existing fields stay unchanged

  constructor(private ctx: AudioContext) {
    // existing music and SFX bus setup stays unchanged
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.ambienceGain.connect(this.sfxBus.snapshotGain);
  }

  setAmbienceLoop(
    buffer: AudioBuffer | null,
    loopPoints: LoopPoints | null,
    fadeMs: number,
    gain = 0.35,
  ): void {
    const fadeS = Math.max(fadeMs / 1000, 0.001);
    const now = this.ctx.currentTime;

    if (this.ambienceSource && this.ambienceSourceGain) {
      const oldGain = this.ambienceSourceGain;
      const oldSource = this.ambienceSource;
      this.ambienceSource = null;
      this.ambienceSourceGain = null;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + fadeS);
      oldSource.stop(now + fadeS);
    }

    if (!buffer) return;

    const targetGain = Math.max(0, Math.min(1, gain));
    const sourceGain = this.ctx.createGain();
    sourceGain.gain.setValueAtTime(0, now);
    sourceGain.gain.linearRampToValueAtTime(targetGain, now + fadeS);
    sourceGain.connect(this.ambienceGain);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (loopPoints) {
      source.loopStart = loopPoints.loopStart;
      source.loopEnd = loopPoints.loopEnd;
    }
    source.connect(sourceGain);
    source.start();

    this.ambienceSourceGain = sourceGain;
    this.ambienceSource = source;
  }

  stopAmbience(fadeMs = 500): void {
    this.setAmbienceLoop(null, null, fadeMs);
  }

  dispose(): void {
    try {
      for (const bus of Object.values(this.musicBuses)) {
        bus.source?.stop();
      }
      this.sfxBus.source?.stop();
      this.ambienceSource?.stop();
    } catch {
      // Sources may already be stopped
    }
  }
}
```

When applying the patch, keep all existing methods and constructor setup intact; add the ambience gain after `this.sfxBus` is created so it routes under SFX mute and volume.

- [ ] **Step 5: Make `MusicDirector.playStingerWithDuck` public**

In `src/audio/music-director.ts`, change:

```ts
private async playStingerWithDuck(path: string): Promise<void> {
```

to:

```ts
async playStingerWithDuck(path: string): Promise<void> {
```

Do not duplicate the ducking state machine in natural-wonder code.

- [ ] **Step 6: Run the targeted audio tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/audio-mixer.test.ts tests/audio/music-director.test.ts
```

Expected: PASS.

## Task 3: Add Natural Wonder Audio Director and AudioSystem Integration

**Files:**

- Create: `src/audio/natural-wonder-audio-director.ts`
- Modify: `src/audio/audio-system.ts`
- Test: `tests/audio/natural-wonder-audio-director.test.ts`
- Test: `tests/audio/audio-system.integration.test.ts`

- [ ] **Step 1: Write failing director tests**

Create `tests/audio/natural-wonder-audio-director.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NaturalWonderAudioDirector } from '../../src/audio/natural-wonder-audio-director';

describe('NaturalWonderAudioDirector', () => {
  const mixer = {
    setAmbienceLoop: vi.fn(),
    stopAmbience: vi.fn(),
  };
  const loader = {
    get: vi.fn(async (path: string) => ({ path }) as unknown as AudioBuffer),
  };
  const playStingerWithDuck = vi.fn(async () => {});
  const timers = {
    setTimeout: vi.fn((_fn: () => void, _ms: number) => 7),
    clearTimeout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays a ducked discovery stinger for complete MR1 entries', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playDiscoveryStinger('great_volcano')).resolves.toBe(true);

    expect(playStingerWithDuck).toHaveBeenCalledWith('audio/wonders/great-volcano-stinger.ogg');
  });

  it('does nothing for pending entries', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playDiscoveryStinger('sacred_mountain')).resolves.toBe(false);
    await expect(director.startCodexAmbient('sacred_mountain')).resolves.toBe(false);

    expect(loader.get).not.toHaveBeenCalled();
    expect(playStingerWithDuck).not.toHaveBeenCalled();
    expect(mixer.setAmbienceLoop).not.toHaveBeenCalled();
  });

  it('starts Codex ambience through the ambience loop path', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.startCodexAmbient('coral_reef')).resolves.toBe(true);

    expect(loader.get).toHaveBeenCalledWith('audio/wonders/coral-reef-ambient.ogg');
    expect(mixer.setAmbienceLoop).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'audio/wonders/coral-reef-ambient.ogg' }),
      { loopStart: 0, loopEnd: 60 },
      700,
      0.30,
    );
  });

  it('starts map-focus ambience and schedules timeout cleanup', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await director.startMapFocusAmbient('ancient_forest');

    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 12000);
  });

  it('clears previous map-focus timeout when ambience changes or stops', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await director.startMapFocusAmbient('great_volcano');
    await director.startMapFocusAmbient('coral_reef');
    director.stopAmbient('panel-closed');

    expect(timers.clearTimeout).toHaveBeenCalledWith(7);
    expect(mixer.stopAmbience).toHaveBeenCalled();
  });

  it('replay plays a stinger and restarts ambient for complete entries', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playCodexReplay('ancient_forest')).resolves.toBe(true);

    expect(playStingerWithDuck).toHaveBeenCalledWith('audio/wonders/ancient-forest-stinger.ogg');
    expect(loader.get).toHaveBeenCalledWith('audio/wonders/ancient-forest-ambient.ogg');
  });
});
```

- [ ] **Step 2: Write failing AudioSystem integration tests**

Append to `tests/audio/audio-system.integration.test.ts`:

```ts
  it('plays natural wonder discovery through the public audio system method', async () => {
    system.start(makeState(), busHelper.bus);

    await system.playNaturalWonderDiscovery('great_volcano');

    expect(ctx.transcript.some(entry => entry.op === 'start')).toBe(true);
  });

  it('stops natural wonder ambience on hot-seat handoff and game over', async () => {
    system.start(makeState(), busHelper.bus);
    await system.startNaturalWonderCodexAmbient('coral_reef');
    ctx.clearTranscript();

    busHelper.emit('currentPlayer:changed-after-handoff', { civId: 'egypt' });
    busHelper.emit('game:over', { winnerId: 'egypt' });

    expect(ctx.transcript.some(entry => entry.op === 'stop')).toBe(true);
  });
```

- [ ] **Step 3: Run the director and integration tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-director.test.ts tests/audio/audio-system.integration.test.ts
```

Expected: FAIL because director and public `AudioSystem` methods do not exist.

- [ ] **Step 4: Implement `NaturalWonderAudioDirector`**

Create `src/audio/natural-wonder-audio-director.ts`:

```ts
import type { AudioLoader } from './audio-loader';
import type { AudioMixer } from './audio-mixer';
import { getCompleteNaturalWonderAudioEntry } from './natural-wonder-audio-catalog';

type TimerId = ReturnType<typeof setTimeout>;

export interface NaturalWonderAudioTimerFns {
  setTimeout: (callback: () => void, ms: number) => TimerId;
  clearTimeout: (id: TimerId) => void;
}

const DEFAULT_TIMERS: NaturalWonderAudioTimerFns = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: id => clearTimeout(id),
};

export type NaturalWonderAmbientStopReason =
  | 'codex-page-hidden'
  | 'map-focus-timeout'
  | 'panel-closed'
  | 'player-changed'
  | 'game-ended'
  | 'system-disposed';

export class NaturalWonderAudioDirector {
  private ambientTimer: TimerId | null = null;

  constructor(
    private readonly mixer: Pick<AudioMixer, 'setAmbienceLoop' | 'stopAmbience'>,
    private readonly loader: Pick<AudioLoader, 'get'>,
    private readonly playStingerWithDuck: (path: string) => Promise<void>,
    private readonly timers: NaturalWonderAudioTimerFns = DEFAULT_TIMERS,
  ) {}

  async playDiscoveryStinger(wonderId: string): Promise<boolean> {
    const entry = getCompleteNaturalWonderAudioEntry(wonderId);
    if (!entry) return false;
    await this.playStingerWithDuck(entry.stinger.file);
    return true;
  }

  async playCodexReplay(wonderId: string): Promise<boolean> {
    const stingerPlayed = await this.playDiscoveryStinger(wonderId);
    const ambientStarted = await this.startCodexAmbient(wonderId);
    return stingerPlayed || ambientStarted;
  }

  async startCodexAmbient(wonderId: string): Promise<boolean> {
    this.clearAmbientTimer();
    return this.startAmbient(wonderId);
  }

  async startMapFocusAmbient(wonderId: string): Promise<boolean> {
    this.clearAmbientTimer();
    const entry = getCompleteNaturalWonderAudioEntry(wonderId);
    if (!entry) return false;
    const started = await this.startAmbient(wonderId);
    if (!started) return false;
    this.ambientTimer = this.timers.setTimeout(() => {
      this.stopAmbient('map-focus-timeout');
    }, entry.ambientLoop.mapFocusTimeoutMs);
    return true;
  }

  stopAmbient(_reason: NaturalWonderAmbientStopReason): void {
    this.clearAmbientTimer();
    this.mixer.stopAmbience(550);
  }

  private async startAmbient(wonderId: string): Promise<boolean> {
    const entry = getCompleteNaturalWonderAudioEntry(wonderId);
    if (!entry) return false;
    const buffer = await this.loader.get(entry.ambientLoop.file);
    this.mixer.setAmbienceLoop(
      buffer,
      entry.ambientLoop.loop,
      entry.ambientLoop.fadeInMs,
      entry.ambientLoop.gain,
    );
    return true;
  }

  private clearAmbientTimer(): void {
    if (this.ambientTimer === null) return;
    this.timers.clearTimeout(this.ambientTimer);
    this.ambientTimer = null;
  }
}
```

- [ ] **Step 5: Wire `AudioSystem`**

Patch `src/audio/audio-system.ts`:

```ts
import { NaturalWonderAudioDirector } from './natural-wonder-audio-director';
```

Add field:

```ts
private naturalWonderDirector: NaturalWonderAudioDirector;
```

In the constructor after `this.director`:

```ts
this.naturalWonderDirector = new NaturalWonderAudioDirector(
  this.mixer,
  this.loader,
  path => this.director.playStingerWithDuck(path),
);
```

Add public methods:

```ts
playNaturalWonderDiscovery(wonderId: string): Promise<boolean> {
  return this.naturalWonderDirector.playDiscoveryStinger(wonderId);
}

playNaturalWonderReplay(wonderId: string): Promise<boolean> {
  return this.naturalWonderDirector.playCodexReplay(wonderId);
}

startNaturalWonderCodexAmbient(wonderId: string): Promise<boolean> {
  return this.naturalWonderDirector.startCodexAmbient(wonderId);
}

startNaturalWonderMapFocusAmbient(wonderId: string): Promise<boolean> {
  return this.naturalWonderDirector.startMapFocusAmbient(wonderId);
}

stopNaturalWonderAmbient(reason: Parameters<NaturalWonderAudioDirector['stopAmbient']>[0]): void {
  this.naturalWonderDirector.stopAmbient(reason);
}
```

In `currentPlayer:changed-after-handoff`, before or after music handling:

```ts
this.naturalWonderDirector.stopAmbient('player-changed');
```

In `game:over`:

```ts
this.naturalWonderDirector.stopAmbient('game-ended');
```

In `dispose()` before `this.mixer.dispose()`:

```ts
this.naturalWonderDirector.stopAmbient('system-disposed');
```

- [ ] **Step 6: Run the director and integration tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-director.test.ts tests/audio/audio-system.integration.test.ts
```

Expected: PASS.

## Task 4: Wire Viewer-Safe UI and Map Audio Hooks

**Files:**

- Create: `src/input/natural-wonder-audio-focus.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/wonder-atlas-panel.ts`
- Modify: `src/ui/wonder-codex-panel.ts`
- Modify: `src/ui/wonder-codex-page.ts`
- Test: `tests/input/natural-wonder-audio-focus.test.ts`
- Test: `tests/ui/wonder-atlas-panel.test.ts`
- Test: `tests/ui/wonder-codex-panel.test.ts`
- Test: `tests/ui/wonder-codex-page.test.ts`
- Test: `tests/ui/wonder-discovery-queue.test.ts`

- [ ] **Step 1: Write failing viewer-safe focus tests**

Create `tests/input/natural-wonder-audio-focus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/core/game-state';
import type { GameState, VisibilityMap } from '../../src/core/types';
import { hexKey } from '../../src/systems/hex-utils';
import { resolveNaturalWonderAudioFocus } from '../../src/input/natural-wonder-audio-focus';

function stateWithWonder(): GameState {
  const state = createNewGame(undefined, 'natural-wonder-audio-focus-test');
  for (const tile of Object.values(state.map.tiles)) tile.wonder = null;
  const coord = { q: 0, r: 0 };
  state.map.tiles[hexKey(coord)].wonder = 'great_volcano';
  state.discoveredWonders.great_volcano = 'player';
  state.wonderDiscoverers.great_volcano = ['player'];
  state.civilizations.player.visibility = {
    tiles: { [hexKey(coord)]: 'visible' },
  } as VisibilityMap;
  return state;
}

describe('resolveNaturalWonderAudioFocus', () => {
  it('allows audio for live visible discovered natural wonder tiles', () => {
    const state = stateWithWonder();

    expect(resolveNaturalWonderAudioFocus(state, 'player', { q: 0, r: 0 })).toEqual({
      wonderId: 'great_volcano',
    });
  });

  it('denies audio for discovered last-seen wonders that are not currently visible', () => {
    const state = stateWithWonder();
    state.civilizations.player.visibility = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'volcanic',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: 'great_volcano',
        },
      },
    } as VisibilityMap;

    expect(resolveNaturalWonderAudioFocus(state, 'player', { q: 0, r: 0 })).toBeNull();
  });

  it('denies audio when the viewer has not discovered the wonder', () => {
    const state = stateWithWonder();
    state.wonderDiscoverers.great_volcano = ['ai-1'];

    expect(resolveNaturalWonderAudioFocus(state, 'player', { q: 0, r: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Write failing UI callback tests**

Update `tests/ui/wonder-codex-page.test.ts` replay test so it asserts audio replay:

```ts
it('calls natural wonder replay audio when replay animation is clicked', () => {
  const onReplayNaturalWonder = vi.fn();
  const page = createWonderCodexPage(naturalPage(), {
    onAction: vi.fn(),
    onSelectRelated: vi.fn(),
    onReplayNaturalWonder,
  });

  click(page.querySelector('[data-codex-replay-animation]'));

  expect(onReplayNaturalWonder).toHaveBeenCalledWith('great_volcano');
});
```

Append to `tests/ui/wonder-codex-panel.test.ts`:

```ts
it('starts and stops natural wonder ambience as visible Codex pages change', () => {
  const state = makeState();
  state.discoveredWonders.great_volcano = 'player';
  state.wonderDiscoverers.great_volcano = ['player'];
  const onNaturalWonderPageShown = vi.fn();
  const onNaturalWonderPageHidden = vi.fn();

  const panel = createWonderCodexPanel(document.body, state, {
    initialWonderId: 'great_volcano',
    onViewOnMap: vi.fn(),
    onOpenCity: vi.fn(),
    onClose: vi.fn(),
    onNaturalWonderPageShown,
    onNaturalWonderPageHidden,
  });

  expect(onNaturalWonderPageShown).toHaveBeenCalledWith('great_volcano');

  click(panel.querySelector('[data-codex-close]'));

  expect(onNaturalWonderPageHidden).toHaveBeenCalledWith('great_volcano');
});
```

Update `tests/ui/wonder-atlas-panel.test.ts` public-entry test to pass callback spies and assert they flow through for `initialWonderId: 'great_volcano'`.

Append to `tests/ui/wonder-discovery-queue.test.ts`:

```ts
it('notifies when a reveal starts so audio can play in sync with the ceremony', async () => {
  const onRevealStarted = vi.fn();
  const queue = createWonderDiscoveryRevealQueue({
    present: async () => {},
    requestMapHighlight: vi.fn(),
    openAtlas: vi.fn(),
    onRevealStarted,
  });

  queue.enqueue(item('great_volcano', 2));
  await Promise.resolve();

  expect(onRevealStarted).toHaveBeenCalledWith(expect.objectContaining({ wonderId: 'great_volcano' }));
});
```

- [ ] **Step 3: Run UI/focus tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/input/natural-wonder-audio-focus.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-codex-panel.test.ts tests/ui/wonder-atlas-panel.test.ts tests/ui/wonder-discovery-queue.test.ts
```

Expected: FAIL because focus helper and callbacks are not implemented.

- [ ] **Step 4: Implement the focus helper**

Create `src/input/natural-wonder-audio-focus.ts`:

```ts
import { hexKey } from '@/systems/hex-utils';
import type { GameState, HexCoord } from '@/core/types';
import { getWonderDefinition } from '@/systems/wonder-definitions';

export interface NaturalWonderAudioFocus {
  wonderId: string;
}

export function resolveNaturalWonderAudioFocus(
  state: GameState,
  viewerId: string,
  coord: HexCoord,
): NaturalWonderAudioFocus | null {
  const key = hexKey(coord);
  const tile = state.map.tiles[key];
  const wonderId = tile?.wonder;
  if (!wonderId) return null;
  if (!getWonderDefinition(wonderId)) return null;
  if (!(state.wonderDiscoverers?.[wonderId] ?? []).includes(viewerId)) return null;
  if (state.civilizations[viewerId]?.visibility?.tiles?.[key] !== 'visible') return null;
  return { wonderId };
}
```

- [ ] **Step 5: Add Codex page replay callback**

Patch `src/ui/wonder-codex-page.ts`:

```ts
export interface WonderCodexPageOptions {
  mode?: WonderCodexResponsiveMode;
  reducedMotion?: boolean;
  onAction: (action: WonderCodexAction) => void;
  onSelectRelated: (wonderId: string) => void;
  onReplayNaturalWonder?: (wonderId: string) => void;
}
```

Inside the replay click handler, after the reduced-motion/vignette guard:

```ts
options.onReplayNaturalWonder?.(page.id);
```

- [ ] **Step 6: Add Codex panel lifecycle callbacks**

Patch `src/ui/wonder-codex-panel.ts`:

```ts
export interface WonderCodexPanelCallbacks {
  onViewOnMap: (coord: HexCoord, wonderId: string) => void;
  onOpenCity: (cityId: string) => void;
  onClose: () => void;
  initialWonderId?: string;
  mode?: WonderCodexResponsiveMode;
  reducedMotion?: boolean;
  onNaturalWonderPageShown?: (wonderId: string) => void;
  onNaturalWonderPageHidden?: (wonderId: string) => void;
  onNaturalWonderReplay?: (wonderId: string) => void;
}
```

Add:

```ts
let audibleNaturalWonderId: string | null = null;

function setAudibleNaturalWonder(nextWonderId: string | null): void {
  if (audibleNaturalWonderId === nextWonderId) return;
  if (audibleNaturalWonderId) callbacks.onNaturalWonderPageHidden?.(audibleNaturalWonderId);
  audibleNaturalWonderId = nextWonderId;
  if (audibleNaturalWonderId) callbacks.onNaturalWonderPageShown?.(audibleNaturalWonderId);
}
```

In the close handler, before `panel.remove()`:

```ts
setAudibleNaturalWonder(null);
```

When calling `createWonderCodexPage`, pass:

```ts
onReplayNaturalWonder: callbacks.onNaturalWonderReplay,
```

In `render()`, after `model` is computed and before returning/appending:

```ts
const nextAudibleNaturalWonderId =
  !mobileShowingCatalog && model.selectedPage?.kind === 'natural'
    ? model.selectedPage.id
    : null;
setAudibleNaturalWonder(nextAudibleNaturalWonderId);
```

This keeps mobile catalog view silent because the reader is hidden.

- [ ] **Step 7: Pass callbacks through Atlas wrapper**

Patch `src/ui/wonder-atlas-panel.ts` interfaces and wrapper call:

```ts
export interface WonderAtlasCallbacks {
  onViewOnMap: (coord: HexCoord, wonderId: string) => void;
  onClose: () => void;
  onOpenCity?: (cityId: string) => void;
  initialWonderId?: string;
  reducedMotion?: boolean;
  onNaturalWonderPageShown?: (wonderId: string) => void;
  onNaturalWonderPageHidden?: (wonderId: string) => void;
  onNaturalWonderReplay?: (wonderId: string) => void;
}
```

Pass the three new callbacks unchanged to `createWonderCodexPanel`.

- [ ] **Step 8: Wire live `main.ts` callbacks**

Patch imports in `src/main.ts`:

```ts
import { resolveNaturalWonderAudioFocus } from '@/input/natural-wonder-audio-focus';
```

When creating `wonderDiscoveryQueue`, add:

```ts
onRevealStarted: item => {
  void audio.playNaturalWonderDiscovery(item.wonderId);
},
```

In `openWonderAtlas(initialWonderId?: string)`, add callbacks:

```ts
onNaturalWonderPageShown: wonderId => {
  void audio.startNaturalWonderCodexAmbient(wonderId);
},
onNaturalWonderPageHidden: () => {
  audio.stopNaturalWonderAmbient('codex-page-hidden');
},
onNaturalWonderReplay: wonderId => {
  void audio.playNaturalWonderReplay(wonderId);
},
```

In `handleHexTap`, before or immediately after `openWonderAtlas(wonderAtlasIntent.wonderId)`:

```ts
const audioFocus = resolveNaturalWonderAudioFocus(gameState, gameState.currentPlayer, coord);
if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
```

In `openTerritoryInspectionPanel(coord)`, before creating the panel:

```ts
const audioFocus = resolveNaturalWonderAudioFocus(gameState, gameState.currentPlayer, coord);
if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
```

In that panel's close callback:

```ts
audio.stopNaturalWonderAmbient('panel-closed');
```

In `closeTerritoryInspectionPanel()`:

```ts
audio.stopNaturalWonderAmbient('panel-closed');
```

- [ ] **Step 9: Run UI/focus tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/input/natural-wonder-audio-focus.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-codex-panel.test.ts tests/ui/wonder-atlas-panel.test.ts tests/ui/wonder-discovery-queue.test.ts
```

Expected: PASS.

## Task 5: Add Real MR1 Audio Files and Credits

**Files:**

- Create: `public/audio/wonders/*.ogg`
- Modify: `AUDIO-CREDITS.md`
- Modify if measured durations differ materially: `src/audio/natural-wonder-audio-catalog.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Confirm conversion tools**

Run:

```bash
ffmpeg -version
ffprobe -version
```

Expected: both commands print version information. If `ffprobe` is missing but `ffmpeg` exists, use `ffmpeg -i public/audio/wonders/<file>.ogg` to read duration from stderr.

- [ ] **Step 2: Download approved Soundimage source files**

Run:

```bash
mkdir -p /private/tmp/conquestoria-2h-audio-src public/audio/wonders
curl -L 'https://soundimage.org/wp-content/uploads/2019/11/Underwater-Rumble.mp3' -o /private/tmp/conquestoria-2h-audio-src/great-volcano-stinger.mp3
curl -L 'https://soundimage.org/wp-content/uploads/2018/10/Quiet-Tension_Looping.mp3' -o /private/tmp/conquestoria-2h-audio-src/great-volcano-ambient.mp3
curl -L 'https://soundimage.org/wp-content/uploads/2014/02/Morning-Dew.mp3' -o /private/tmp/conquestoria-2h-audio-src/ancient-forest-stinger.mp3
curl -L 'https://soundimage.org/wp-content/uploads/2018/10/Sunrise_Looping.mp3' -o /private/tmp/conquestoria-2h-audio-src/ancient-forest-ambient.mp3
curl -L 'https://soundimage.org/wp-content/uploads/2014/02/Life-in-a-Drop.mp3' -o /private/tmp/conquestoria-2h-audio-src/coral-reef-stinger.mp3
curl -L 'https://soundimage.org/wp-content/uploads/2016/11/Underwater-World_Looping.mp3' -o /private/tmp/conquestoria-2h-audio-src/coral-reef-ambient.mp3
```

Expected: six non-empty MP3 files exist under `/private/tmp/conquestoria-2h-audio-src`.

- [ ] **Step 3: Convert to OGG Vorbis**

Run:

```bash
ffmpeg -y -i /private/tmp/conquestoria-2h-audio-src/great-volcano-stinger.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/great-volcano-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-audio-src/great-volcano-ambient.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/great-volcano-ambient.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-audio-src/ancient-forest-stinger.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/ancient-forest-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-audio-src/ancient-forest-ambient.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/ancient-forest-ambient.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-audio-src/coral-reef-stinger.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/coral-reef-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-audio-src/coral-reef-ambient.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/coral-reef-ambient.ogg
```

Expected: six OGG files exist under `public/audio/wonders`.

- [ ] **Step 4: Measure OGG durations and patch loop ends if needed**

Run:

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 public/audio/wonders/great-volcano-ambient.ogg public/audio/wonders/ancient-forest-ambient.ogg public/audio/wonders/coral-reef-ambient.ogg
```

Expected: durations are at least as long as the catalog loop ends. If a duration is shorter than its catalog `loopEnd`, patch the matching `ambientLoop.loop.loopEnd` to the measured duration rounded down to one decimal place.

- [ ] **Step 5: Update `AUDIO-CREDITS.md`**

Add this section:

```md
## Natural Wonder Audio

All Stage 2H MR1 natural wonder audio is by Eric Matyas / Soundimage.org and converted from MP3 to OGG Vorbis for in-game use.

- `public/audio/wonders/great-volcano-stinger.ogg` — "Underwater Rumble" by Eric Matyas, Soundimage.org. Source: https://soundimage.org/wp-content/uploads/2019/11/Underwater-Rumble.mp3
- `public/audio/wonders/great-volcano-ambient.ogg` — "Quiet Tension_Looping" by Eric Matyas, Soundimage.org. Source: https://soundimage.org/wp-content/uploads/2018/10/Quiet-Tension_Looping.mp3
- `public/audio/wonders/ancient-forest-stinger.ogg` — "Morning Dew" by Eric Matyas, Soundimage.org. Source: https://soundimage.org/wp-content/uploads/2014/02/Morning-Dew.mp3
- `public/audio/wonders/ancient-forest-ambient.ogg` — "Sunrise_Looping" by Eric Matyas, Soundimage.org. Source: https://soundimage.org/wp-content/uploads/2018/10/Sunrise_Looping.mp3
- `public/audio/wonders/coral-reef-stinger.ogg` — "Life in a Drop" by Eric Matyas, Soundimage.org. Source: https://soundimage.org/wp-content/uploads/2014/02/Life-in-a-Drop.mp3
- `public/audio/wonders/coral-reef-ambient.ogg` — "Underwater World_Looping" by Eric Matyas, Soundimage.org. Source: https://soundimage.org/wp-content/uploads/2016/11/Underwater-World_Looping.mp3
```

- [ ] **Step 6: Run catalog test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: PASS.

## Task 6: Verification, Rule Checks, Diff Review, and Commit

**Files:**

- All changed `src/**`, `tests/**`, `docs/**`, `public/audio/wonders/**`, `AUDIO-CREDITS.md`

- [ ] **Step 1: Run source rule checks for changed source files**

Run:

```bash
scripts/check-src-rule-violations.sh src/audio/natural-wonder-audio-sources.ts src/audio/natural-wonder-audio-catalog.ts src/audio/natural-wonder-audio-director.ts src/audio/audio-mixer.ts src/audio/music-director.ts src/audio/audio-system.ts src/input/natural-wonder-audio-focus.ts src/main.ts src/ui/wonder-atlas-panel.ts src/ui/wonder-codex-panel.ts src/ui/wonder-codex-page.ts
```

Expected: exits 0.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts tests/audio/audio-mixer.test.ts tests/audio/music-director.test.ts tests/audio/audio-system.integration.test.ts tests/input/natural-wonder-audio-focus.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-codex-panel.test.ts tests/ui/wonder-atlas-panel.test.ts tests/ui/wonder-discovery-queue.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: exits 0. A sandbox-only mise cache warning is acceptable only if the script exits 0.

- [ ] **Step 4: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: exits 0. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 5: Run full test suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 6: Review diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff -- src/audio src/input src/ui src/main.ts tests/audio tests/input tests/ui AUDIO-CREDITS.md docs/superpowers/plans/2026-05-27-stage-2h-natural-wonder-audio-mr1.md
```

Expected: diffs are scoped to Stage 2H MR1 audio architecture, three complete natural-wonder asset sets, credits, and tests.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git add AUDIO-CREDITS.md public/audio/wonders docs/superpowers/plans/2026-05-27-stage-2h-natural-wonder-audio-mr1.md src/audio src/input/natural-wonder-audio-focus.ts src/main.ts src/ui/wonder-atlas-panel.ts src/ui/wonder-codex-panel.ts src/ui/wonder-codex-page.ts tests/audio tests/input/natural-wonder-audio-focus.test.ts tests/ui/wonder-atlas-panel.test.ts tests/ui/wonder-codex-panel.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-queue.test.ts
git commit -m "feat(audio): add natural wonder audio foundation"
```

Expected: one implementation commit on `codex/stage-2h-natural-wonder-audio-design`.

## Plan Self-Review

- Spec coverage: MR1 covers the shared architecture, viewer-safe discovery/replay/map/Codex triggers, SFX-governed ambience, source manifest, credits, real files for three complete wonders, no hidden-tile audio leakage, no pending fallback playback, and no PWA precache expansion.
- Testing coverage: tests cover catalog completeness, asset existence and OGG signature, credits synchronization, mixer ambience isolation, ducking reuse, director no-op pending behavior, public `AudioSystem` methods, handoff/game-over cleanup, map focus visibility boundary, Codex lifecycle, replay callback, Atlas pass-through, and discovery reveal timing.
- Architecture review: audio state remains in `src/audio`; viewer-safe map logic is in `src/input`; UI panels only invoke callbacks; `main.ts` wires live user actions; no save format or gameplay state changes are introduced.
- UI/UX review: existing visual surfaces remain unchanged except replay now has matching audio; reduced motion keeps replay disabled; mobile hidden reader stops ambience; full catalog remains reachable.
- Audio review: ambience is separate from the existing one-shot SFX source, respects SFX mute/volume, avoids duplicated ducking code, stops on close/handoff/game end, and uses on-demand loading.
- Data review: remaining 12 natural wonders are explicit pending entries, not missing records; source titles, URLs, local files, and credits are checked together.
- Regression review: no gameplay mutation rules, service worker precache, or distribution-specific code are changed.
