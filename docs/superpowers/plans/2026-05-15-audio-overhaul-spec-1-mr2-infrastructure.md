# MR2 — Infrastructure: AudioLoader and AudioMixer

Part of [Audio Overhaul Spec 1 Plan](./2026-05-15-audio-overhaul-spec-1-index.md). Requires MR1 to be merged first.

**Goal:** Add the two infrastructure modules that MusicDirector (MR3) and AudioSystem (MR4) depend on. No changes to `main.ts`. Game unchanged after merge.

**Why this is safe to merge partial:** All changes are new files. Nothing in the production code path imports or instantiates these modules yet.

---

## Task 5: AudioLoader + tests

**Files:**
- Create: `src/audio/audio-loader.ts`
- Create: `tests/audio/audio-loader.test.ts`

`AudioLoader` is a fetch-and-cache wrapper. It fetches OGG files, decodes them via the Web Audio API, and caches by URL. On fetch failure, it returns a silent 1-frame buffer (not a rejection) so the rest of the audio system degrades gracefully.

- [ ] **Step 1: Write the failing test**

```ts
// tests/audio/audio-loader.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioLoader } from '../../src/audio/audio-loader';

function makeLoader() {
  const ctx = new MockAudioContext();
  return { ctx, loader: new AudioLoader(ctx as unknown as AudioContext) };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOk() {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response);
}

function mockFetchFail() {
  vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network error'));
}

describe('AudioLoader.get()', () => {
  it('fetches and returns an AudioBuffer on the first call', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    const buf = await loader.get('audio/era/era1-base.ogg');

    expect(buf).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('caches: same URL called twice → only one fetch', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    await loader.get('audio/era/era1-base.ogg');
    await loader.get('audio/era/era1-base.ogg');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('isCached() returns true after a successful fetch', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    expect(loader.isCached('audio/era/era1-base.ogg')).toBe(false);
    await loader.get('audio/era/era1-base.ogg');
    expect(loader.isCached('audio/era/era1-base.ogg')).toBe(true);
  });

  it('returns a silent fallback buffer (not a rejection) when fetch fails', async () => {
    mockFetchFail();
    const { loader } = makeLoader();

    const result = await loader.get('audio/missing.ogg');

    expect(result).toBeTruthy();
  });

  it('does not cache failed fetches (can retry)', async () => {
    mockFetchFail();
    const { loader } = makeLoader();

    await loader.get('audio/flaky.ogg');
    await loader.get('audio/flaky.ogg');

    // Two attempts for a failed URL is acceptable
    expect(loader.isCached('audio/flaky.ogg')).toBe(false);
  });

  it('concurrent fetches for the same URL share one inflight Promise', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    // Start two fetches simultaneously
    const [a, b] = await Promise.all([
      loader.get('audio/era/era1-base.ogg'),
      loader.get('audio/era/era1-base.ogg'),
    ]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});

describe('AudioLoader.preload()', () => {
  it('does not reject when individual URLs fail', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response)
      .mockRejectedValueOnce(new Error('gone'));

    const { loader } = makeLoader();

    await expect(
      loader.preload(['audio/era/era1-base.ogg', 'audio/missing.ogg']),
    ).resolves.toBeUndefined();
  });

  it('caches successful URLs from preload', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    await loader.preload(['audio/era/era1-base.ogg', 'audio/era/era2-base.ogg']);

    expect(loader.isCached('audio/era/era1-base.ogg')).toBe(true);
    expect(loader.isCached('audio/era/era2-base.ogg')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-loader.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../../src/audio/audio-loader'`

- [ ] **Step 3: Write `src/audio/audio-loader.ts`**

```ts
export class AudioLoader {
  private cache = new Map<string, AudioBuffer>();
  private inflight = new Map<string, Promise<AudioBuffer>>();

  constructor(private ctx: AudioContext) {}

  get(path: string): Promise<AudioBuffer> {
    const cached = this.cache.get(path);
    if (cached) return Promise.resolve(cached);

    const existing = this.inflight.get(path);
    if (existing) return existing;

    const url = (import.meta.env?.BASE_URL ?? '/') + path;

    const promise = fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => this.ctx.decodeAudioData(buf))
      .then(decoded => {
        this.cache.set(path, decoded);
        this.inflight.delete(path);
        return decoded;
      })
      .catch(() => {
        this.inflight.delete(path);
        // Silent 1-frame fallback — keeps the audio graph valid without throwing
        return this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      });

    this.inflight.set(path, promise);
    return promise;
  }

  async preload(paths: string[]): Promise<void> {
    await Promise.allSettled(paths.map(p => this.get(p)));
  }

  isCached(path: string): boolean {
    return this.cache.has(path);
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-loader.test.ts
```

Expected: PASS

- [ ] **Step 5: Confirm build still passes**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/audio/audio-loader.ts tests/audio/audio-loader.test.ts
git commit -m "feat(audio): add AudioLoader — in-memory cache, BASE_URL-aware fetch, silent fallback"
```

---

## Task 6: AudioMixer + tests

**Files:**
- Create: `src/audio/audio-mixer.ts`
- Create: `tests/audio/audio-mixer.test.ts`

`AudioMixer` owns the Web Audio graph. It knows nothing about game state — that belongs to `MusicDirector`. It holds five bus `GainNode`s (era, accent, adaptive, stinger, sfx), a music master `GainNode`, and a snapshot table mapping named presets to per-bus gain values.

**Key design:**
- Each music bus has a `snapshotGain` (controlled by `setSnapshot`) and a per-source `sourceGain` (fades in/out per `setBusSource` call). This enables true overlapping crossfades.
- `setSnapshot` ramps `snapshotGain` values for the 4 music buses simultaneously.
- `setMusicEnabled(false)` hard-zeros the music master gain immediately and cancels any in-flight ramp (M-1, M-2).
- Volume sliders use square-law: `gain = v × v` (Au-2).
- `LoopPoints` is imported from `audio-catalog.ts` — do not redeclare it here (C-4).

- [ ] **Step 1: Write the failing test**

```ts
// tests/audio/audio-mixer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioMixer, type SnapshotId } from '../../src/audio/audio-mixer';

function makeCtx() {
  return new MockAudioContext();
}

function makeMixer(ctx: MockAudioContext) {
  return new AudioMixer(ctx as unknown as AudioContext);
}

function makeBuf(ctx: MockAudioContext) {
  return ctx.createBuffer(2, 4410, 44100);
}

describe('AudioMixer construction', () => {
  it('creates at least 6 GainNodes (5 buses + music master)', () => {
    const ctx = makeCtx();
    makeMixer(ctx);
    // 4 music buses + 1 sfx bus + 1 musicMasterGain = 6 minimum
    // Plus per-source gains created by setBusSource
    expect(ctx.opsOf('createGain').length).toBeGreaterThanOrEqual(6);
  });
});

describe('AudioMixer.setSnapshot()', () => {
  const SNAPSHOT_CASES: { id: SnapshotId; era: number; accent: number; adaptive: number }[] = [
    { id: 'silent',       era: 0.0, accent: 0.00, adaptive: 0.0 },
    { id: 'peace',        era: 1.0, accent: 0.70, adaptive: 0.0 },
    { id: 'at-war',       era: 1.0, accent: 0.50, adaptive: 0.8 },
    { id: 'stinger-duck', era: 0.5, accent: 0.35, adaptive: 0.4 },
  ];

  for (const { id, era, accent, adaptive } of SNAPSHOT_CASES) {
    it(`'${id}' snapshot sets correct gain values`, () => {
      const ctx = makeCtx();
      const mixer = makeMixer(ctx);
      ctx.clearTranscript();

      mixer.setSnapshot(id, 0);  // fadeMs=0 → immediate setValueAtTime

      const allValues = ctx.opsOf('setValueAtTime').map(e => e.args[0] as number);
      expect(allValues, `${id} era bus`).toContain(era);
      expect(allValues, `${id} accent bus`).toContain(accent);
      expect(allValues, `${id} adaptive bus`).toContain(adaptive);
    });
  }

  it('uses linearRampToValueAtTime when fadeMs > 0', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setSnapshot('peace', 1000);

    expect(ctx.opsOf('linearRampToValueAtTime').length).toBeGreaterThan(0);
  });
});

describe('AudioMixer.setBusSource()', () => {
  it('creates a new buffer source node', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 2, loopEnd: 28 }, 0);

    expect(ctx.opsOf('createBufferSource').length).toBe(1);
  });

  it('starts the source node', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 0);

    expect(ctx.opsOf('start').length).toBe(1);
  });

  it('schedules gain ramps for the new source when fadeMs > 0', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 500);

    expect(ctx.opsOf('linearRampToValueAtTime').length).toBeGreaterThan(0);
  });

  it('schedules stop for the old source when replacing', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 0);
    ctx.clearTranscript();

    // Replace with a new source
    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 500);

    expect(ctx.opsOf('stop').length).toBe(1);
  });

  it('accepts null buffer (clears the bus)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);

    mixer.setBusSource('era', makeBuf(ctx), true, { loopStart: 0, loopEnd: 30 }, 0);
    ctx.clearTranscript();

    expect(() => mixer.setBusSource('era', null, false, null, 500)).not.toThrow();
  });
});

describe('AudioMixer.playOneShot()', () => {
  it('resolves when the source ends (duck-neutral)', async () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    const buf = makeBuf(ctx);
    const promise = mixer.playOneShot('stinger', buf);

    // The MockBufferSourceNode's stop() triggers onended synchronously.
    // Find the source that was just created and stop it to resolve the promise.
    const sources = ctx.opsOf('createBufferSource');
    expect(sources.length).toBe(1);

    // Access the MockBufferSourceNode that was just created
    const allNodes = (ctx as unknown as { transcript: import('../helpers/mock-audio-context').TranscriptEntry[] }).transcript;
    void allNodes;

    // Trigger resolution by finding the source node via the internal mixer state
    // We rely on MockBufferSourceNode's stop() triggering onended synchronously
    const mixerAny = mixer as unknown as Record<string, unknown>;
    const musicBuses = mixerAny['musicBuses'] as Record<string, { source: import('../helpers/mock-audio-context').MockBufferSourceNode | null }>;
    const stingerSrc = musicBuses['stinger']?.source;
    if (stingerSrc) stingerSrc.stop();

    await expect(promise).resolves.toBeUndefined();
  });

  it('is duck-neutral (no snapshot setValueAtTime called during playOneShot)', async () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setSnapshot('peace', 0);
    ctx.clearTranscript();

    const buf = makeBuf(ctx);
    const promise = mixer.playOneShot('stinger', buf);

    const mixerAny = mixer as unknown as Record<string, unknown>;
    const musicBuses = mixerAny['musicBuses'] as Record<string, { source: import('../helpers/mock-audio-context').MockBufferSourceNode | null }>;
    musicBuses['stinger']?.source?.stop();
    await promise;

    // No snapshot values (0.7, 0.8, 0.5, etc.) set during the playOneShot itself
    const snapshotValues = [0.0, 0.7, 0.8, 0.5, 0.35, 0.4, 1.0];
    const ramps = ctx.opsOf('setValueAtTime').filter(e => snapshotValues.includes(e.args[0] as number));
    expect(ramps.length).toBe(0);
  });
});

describe('AudioMixer mute (M-1, M-2)', () => {
  it('setMusicEnabled(false) calls cancelScheduledValues and sets gain to 0 immediately', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();

    mixer.setMusicEnabled(false);

    expect(ctx.opsOf('cancelScheduledValues').length).toBeGreaterThan(0);
    const zeros = ctx.opsOf('setValueAtTime').filter(e => e.args[0] === 0);
    expect(zeros.length).toBeGreaterThan(0);
  });

  it('setMusicEnabled(true) restores square-law volume (Au-2)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    mixer.setMusicVolume(0.5);  // currentMusicVolume = 0.5; gain = 0.25
    ctx.clearTranscript();

    mixer.setMusicEnabled(false);
    mixer.setMusicEnabled(true);

    const restores = ctx.opsOf('setValueAtTime').filter(
      e => Math.abs((e.args[0] as number) - 0.25) < 0.001,
    );
    expect(restores.length).toBeGreaterThan(0);
  });
});

describe('AudioMixer.setMasterMusicVolume()', () => {
  it('schedules a linear ramp to the target volume over fadeMs (for game-end fade)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    ctx.clearTranscript();
    ctx.currentTime = 0;

    mixer.setMasterMusicVolume(0, 1500);

    const ramps = ctx.opsOf('linearRampToValueAtTime').filter(e => e.args[0] === 0);
    expect(ramps.length).toBeGreaterThan(0);
    expect(ramps[0].args[1] as number).toBeCloseTo(1.5, 1);
  });
});

describe('AudioMixer.getSfxRoutingNode()', () => {
  it('returns a node (H-3)', () => {
    const ctx = makeCtx();
    const mixer = makeMixer(ctx);
    expect(mixer.getSfxRoutingNode()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-mixer.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../../src/audio/audio-mixer'`

- [ ] **Step 3: Write `src/audio/audio-mixer.ts`**

```ts
import type { LoopPoints } from './audio-catalog';

export type BusId = 'era' | 'accent' | 'adaptive' | 'stinger' | 'sfx';
export type SnapshotId = 'silent' | 'peace' | 'at-war' | 'stinger-duck';

type MusicBusId = Exclude<BusId, 'sfx'>;

// Re-export for consumers that need the type without importing audio-catalog
export type { LoopPoints };

const SNAPSHOTS: Record<SnapshotId, Record<MusicBusId, number>> = {
  silent:         { era: 0.0, accent: 0.00, adaptive: 0.0, stinger: 0.0 },
  peace:          { era: 1.0, accent: 0.70, adaptive: 0.0, stinger: 1.0 },
  'at-war':       { era: 1.0, accent: 0.50, adaptive: 0.8, stinger: 1.0 },
  'stinger-duck': { era: 0.5, accent: 0.35, adaptive: 0.4, stinger: 1.0 },
};

interface BusState {
  snapshotGain: GainNode;    // Controlled by setSnapshot — always reflects current snapshot value
  sourceGain: GainNode | null; // Per-active-source fade envelope; null when no source playing
  source: AudioBufferSourceNode | null;
}

export class AudioMixer {
  private musicBuses: Record<MusicBusId, BusState>;
  private sfxBus: BusState;
  private musicMasterGain: GainNode;
  private currentMusicVolume = 1.0;
  private musicEnabled = true;

  constructor(private ctx: AudioContext) {
    this.musicMasterGain = ctx.createGain();
    this.musicMasterGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.musicMasterGain.connect(ctx.destination);

    const makeMusicBus = (): BusState => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.connect(this.musicMasterGain);
      return { snapshotGain: g, sourceGain: null, source: null };
    };

    this.musicBuses = {
      era:      makeMusicBus(),
      accent:   makeMusicBus(),
      adaptive: makeMusicBus(),
      stinger:  makeMusicBus(),
    };

    // SFX bus bypasses musicMasterGain — routes directly to destination so muting music doesn't silence SFX
    const sfxGain = ctx.createGain();
    sfxGain.gain.setValueAtTime(1.0, ctx.currentTime);
    sfxGain.connect(ctx.destination);
    this.sfxBus = { snapshotGain: sfxGain, sourceGain: null, source: null };
  }

  private getBus(id: BusId): BusState {
    return id === 'sfx' ? this.sfxBus : this.musicBuses[id as MusicBusId];
  }

  setBusSource(
    bus: BusId,
    buffer: AudioBuffer | null,
    loop: boolean,
    loopPoints: LoopPoints | null,
    fadeMs: number,
  ): void {
    const b = this.getBus(bus);
    const fadeS = fadeMs / 1000;
    const now = this.ctx.currentTime;

    // Fade out and stop the existing source if any
    if (b.source && b.sourceGain) {
      const oldGain = b.sourceGain;
      const oldSrc = b.source;
      b.source = null;
      b.sourceGain = null;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + Math.max(fadeS, 0.001));
      oldSrc.stop(now + Math.max(fadeS, 0.001));
    }

    if (!buffer) return;

    // Fade in the new source via its own gain envelope
    const srcGain = this.ctx.createGain();
    srcGain.gain.setValueAtTime(0, now);
    srcGain.gain.linearRampToValueAtTime(1, now + Math.max(fadeS, 0.001));
    srcGain.connect(b.snapshotGain);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    if (loop && loopPoints) {
      src.loopStart = loopPoints.loopStart;
      src.loopEnd = loopPoints.loopEnd;
    }
    src.connect(srcGain);
    src.start();

    b.sourceGain = srcGain;
    b.source = src;
  }

  playOneShot(bus: BusId, buffer: AudioBuffer): Promise<void> {
    return new Promise<void>(resolve => {
      const b = this.getBus(bus);

      // Cross-cut an existing source if one is playing (D-A9: 200ms cross-cut)
      if (b.source) {
        b.source.stop(this.ctx.currentTime + 0.2);
        b.source = null;
        b.sourceGain = null;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = false;
      src.connect(b.snapshotGain);
      src.onended = () => resolve();
      src.start();
      b.source = src;
    });
  }

  setSnapshot(id: SnapshotId, fadeMs: number): void {
    const now = this.ctx.currentTime;
    const preset = SNAPSHOTS[id];
    for (const [busId, target] of Object.entries(preset) as [MusicBusId, number][]) {
      const gain = this.musicBuses[busId].snapshotGain.gain;
      if (fadeMs === 0) {
        gain.setValueAtTime(target, now);
      } else {
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(target, now + fadeMs / 1000);
      }
    }
  }

  setMasterMusicVolume(v: number, fadeMs = 0): void {
    const now = this.ctx.currentTime;
    const gain = this.musicMasterGain.gain;
    if (fadeMs === 0) {
      gain.setValueAtTime(v, now);
    } else {
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(v, now + fadeMs / 1000);
    }
  }

  setMusicVolume(v: number): void {
    this.currentMusicVolume = Math.max(0, Math.min(1, v));
    if (this.musicEnabled) {
      const perceptual = this.currentMusicVolume * this.currentMusicVolume;
      this.musicMasterGain.gain.setValueAtTime(perceptual, this.ctx.currentTime);
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    const now = this.ctx.currentTime;
    // M-2: cancel any in-flight ramp (e.g., game-end fade) before overriding
    this.musicMasterGain.gain.cancelScheduledValues(now);
    if (enabled) {
      const perceptual = this.currentMusicVolume * this.currentMusicVolume;
      this.musicMasterGain.gain.setValueAtTime(perceptual, now);
    } else {
      this.musicMasterGain.gain.setValueAtTime(0, now);
    }
  }

  setSfxEnabled(enabled: boolean): void {
    const sfxLevel = enabled ? 1.0 : 0;
    this.sfxBus.snapshotGain.gain.setValueAtTime(sfxLevel, this.ctx.currentTime);
  }

  setSfxVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.sfxBus.snapshotGain.gain.setValueAtTime(clamped * clamped, this.ctx.currentTime);
  }

  getSfxRoutingNode(): AudioNode {
    return this.sfxBus.snapshotGain;
  }

  dispose(): void {
    try {
      for (const bus of Object.values(this.musicBuses)) {
        bus.source?.stop();
      }
      this.sfxBus.source?.stop();
    } catch {
      // Sources may already be stopped
    }
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-mixer.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
eval "$(mise activate bash)" && yarn build && yarn test
```

Expected: both exit 0

- [ ] **Step 6: Commit**

```bash
git add src/audio/audio-mixer.ts tests/audio/audio-mixer.test.ts
git commit -m "feat(audio): add AudioMixer — 5-bus Web Audio graph with snapshots, crossfade, and mute hard-override"
```

---

## MR2 merge checklist

Before opening the MR:
- [ ] `yarn build` exits 0
- [ ] `yarn test` exits 0 (includes MR1 catalog tests)
- [ ] No existing test files modified
- [ ] No changes to `src/main.ts`, `src/core/`, or any non-audio source file
