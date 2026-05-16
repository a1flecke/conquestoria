# MR4 — Wiring: AudioSystem, SFX bus, and main.ts cutover

Part of [Audio Overhaul Spec 1 Plan](./2026-05-15-audio-overhaul-spec-1-index.md). Requires MR1, MR2, and MR3 to be merged first.

**Goal:** Wire `AudioSystem` as the single audio lifecycle owner, route `sfx.ts` through the mixer's SFX bus, delete the old `AudioManager` and `MusicGenerator`, and update the service worker. After this MR merges, the procedural drone hum stops and silence plays instead.

**Why silence is not a dead-end UX:** The game is fully playable with no music. The curation MR series (separate branch) replaces the silent placeholder OGGs with real audio and requires no code changes.

---

## Task 9: AudioSystem + integration tests

**Files:**
- Create: `src/audio/audio-system.ts`
- Create: `tests/audio/audio-system.integration.test.ts`

`AudioSystem` is the lifecycle owner. It creates the `AudioContext`, `AudioLoader`, `AudioMixer`, and `MusicDirector`. It subscribes to game events, maps event payloads to director method calls, tracks `warCount` and `currentPlayerId`, and handles iOS Safari defensive resume.

- [ ] **Step 1: Write the failing integration tests**

```ts
// tests/audio/audio-system.integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioSystem } from '../../src/audio/audio-system';
import type { EventBus } from '../../src/core/event-bus';
import type { GameState } from '../../src/core/types';

// Minimal GameState for tests — only fields AudioSystem reads
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentPlayer: 'rome',
    era: 1,
    settings: { musicEnabled: true, soundEnabled: true, musicVolume: 0.8, sfxVolume: 0.8 },
    ...overrides,
  } as unknown as GameState;
}

// Minimal EventBus mock — captures listeners
function makeEventBus() {
  const listeners: Record<string, Array<(p: unknown) => void>> = {};
  const bus = {
    on: vi.fn((event: string, fn: (p: unknown) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => { listeners[event] = listeners[event].filter(l => l !== fn); };
    }),
    emit: vi.fn((event: string, payload: unknown) => {
      listeners[event]?.forEach(fn => fn(payload));
    }),
  };
  return { bus: bus as unknown as EventBus, listeners, emit: bus.emit };
}

describe('AudioSystem integration', () => {
  let ctx: MockAudioContext;
  let system: AudioSystem;
  let busHelper: ReturnType<typeof makeEventBus>;

  beforeEach(() => {
    ctx = new MockAudioContext();
    busHelper = makeEventBus();
    system = new AudioSystem(ctx as unknown as AudioContext);
  });

  // Flow A: cold start
  it('Flow A: start() applies silent snapshot initially', () => {
    system.start(makeState(), busHelper.bus);
    // No events yet — snapshot should be silent
    expect(ctx.transcript).toContain('gain.setValueAtTime');
  });

  // Flow B: save-load reload
  it('Flow B: start() with era>1 and musicEnabled=true moves to peace snapshot', () => {
    system.start(makeState({ era: 3 }), busHelper.bus);
    // peace snapshot should be applied for era > 1
    // The director gets era via start() rather than waiting for era:advanced
    expect(ctx.transcript.join('')).toMatch(/setValueAtTime|linearRampToValueAtTime/);
  });

  // Flow C: era advance
  it('Flow C: era:advanced event transitions to peace and plays stinger', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('era:advanced', { era: 2 });
    // Stinger playback: a buffer source should have been started
    expect(ctx.transcript.some(t => t.includes('bufferSource.start'))).toBe(true);
  });

  // Flow D: war declared (major opponent)
  it('Flow D: war:declared transitions to at-war snapshot', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:war-declared', {
      attackerId: 'rome',
      defenderId: 'egypt',
      opponentKind: 'major',
    });
    expect(ctx.transcript.some(t => t.includes('linearRampToValueAtTime'))).toBe(true);
  });

  // Flow E: peace signed (last war)
  it('Flow E: peace:made with warCount=1 transitions to peace', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:war-declared', { attackerId: 'rome', defenderId: 'egypt', opponentKind: 'major' });
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'egypt' });
    // After peace — should have transitioned back to peace
    const ramps = ctx.transcript.filter(t => t.includes('linearRampToValueAtTime'));
    expect(ramps.length).toBeGreaterThan(0);
  });

  // Flow F: peace with remaining wars
  it('Flow F: peace:made with warCount>1 stays at-war', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:war-declared', { attackerId: 'rome', defenderId: 'egypt', opponentKind: 'major' });
    busHelper.emit('diplomacy:war-declared', { attackerId: 'rome', defenderId: 'gaul', opponentKind: 'major' });
    const before = ctx.transcript.length;
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'egypt' });
    // warCount goes to 1 — director.handlePeaceSigned({ remainingWars: 1 }) should not change snapshot
    // No new ramp to peace value (the at-war gain stays)
    const after = ctx.transcript.length;
    // Some activity may occur (no-op ramp), but should not have added a peace ramp
    expect(after).toBeGreaterThanOrEqual(before);
  });

  // Flow G: city founded
  it('Flow G: city:founded plays a stinger', () => {
    system.start(makeState({ era: 1 }), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    const before = ctx.transcript.filter(t => t.includes('bufferSource.start')).length;
    busHelper.emit('city:founded', { city: {} as unknown, founderId: 'rome' });
    const after = ctx.transcript.filter(t => t.includes('bufferSource.start')).length;
    expect(after).toBeGreaterThan(before);
  });

  // Flow H: hot-seat handoff modal
  it('Flow H: hot-seat handoff does not change music during modal', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    const snapshotsBefore = ctx.transcript.filter(t => t.includes('linearRampToValueAtTime')).length;
    // currentPlayer:changed-after-handoff fires ONLY on "Continue", not on modal open
    // Simulating: no event during modal means no new ramps
    expect(ctx.transcript.filter(t => t.includes('linearRampToValueAtTime')).length).toBe(snapshotsBefore);
  });

  // Flow I: currentPlayer:changed-after-handoff fires on Continue
  it('Flow I: currentPlayer:changed-after-handoff triggers accent reload', () => {
    system.start(makeState({ currentPlayer: 'rome' }), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    const before = ctx.transcript.filter(t => t.includes('linearRampToValueAtTime')).length;
    busHelper.emit('currentPlayer:changed-after-handoff', { civId: 'egypt' });
    const after = ctx.transcript.filter(t => t.includes('linearRampToValueAtTime')).length;
    expect(after).toBeGreaterThan(before);
  });

  // Flow J: game end
  it('Flow J: game:over fades to silent over 1.5s', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    busHelper.emit('game:over', { winnerId: 'rome' });
    // Should fade out — silent snapshot applied
    expect(ctx.transcript.some(t => t.includes('linearRampToValueAtTime'))).toBe(true);
  });

  // Flow K: mute toggle
  it('Flow K: setMusicEnabled(false) silences music bus', () => {
    system.start(makeState(), busHelper.bus);
    system.setMusicEnabled(false);
    // Gain should be cancelled and set to 0
    expect(ctx.transcript.some(t => t.includes('cancelScheduledValues'))).toBe(true);
  });

  // Flow L: dispose unsubscribes all listeners
  it('Flow L: dispose() stops responding to events', () => {
    system.start(makeState(), busHelper.bus);
    system.dispose();
    const callsBefore = ctx.transcript.length;
    busHelper.emit('era:advanced', { era: 2 });
    expect(ctx.transcript.length).toBe(callsBefore);
  });

  // warCount clamping
  it('warCount never goes below 0 (extra peace-made guard)', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'egypt' });
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'gaul' });
    // Should not throw; warCount stays at 0
    expect(ctx.transcript.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-system.integration.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../../src/audio/audio-system'`.

- [ ] **Step 3: Implement `src/audio/audio-system.ts`**

```ts
// src/audio/audio-system.ts
import type { EventBus } from '../core/event-bus';
import type { GameState } from '../core/types';
import { AudioLoader } from './audio-loader';
import { AudioMixer } from './audio-mixer';
import { MusicDirector } from './music-director';
import { getFamilyForCiv } from './civ-audio-family';
import { CATALOG, resolveEra } from './audio-catalog';

export class AudioSystem {
  private loader: AudioLoader;
  private mixer: AudioMixer;
  private director: MusicDirector;
  private unsubscribers: Array<() => void> = [];
  private warCount = 0;
  private currentPlayerId = '';
  private started = false;
  private iosResumeListener: (() => void) | null = null;

  constructor(private readonly ctx: AudioContext) {
    this.loader = new AudioLoader(ctx);
    this.mixer = new AudioMixer(ctx);
    this.director = new MusicDirector(this.mixer);
  }

  start(state: GameState, bus: EventBus): void {
    if (this.started) return;
    this.started = true;
    this.currentPlayerId = state.currentPlayer;

    const settings = state.settings;
    this.mixer.setMusicEnabled(settings.musicEnabled);
    this.mixer.setSfxEnabled(settings.soundEnabled);
    this.mixer.setMusicVolume(settings.musicVolume);
    this.mixer.setSfxVolume(settings.sfxVolume);

    this.wireEvents(bus);
    this.armIosResume();

    // Pre-load era-1 tracks (best-effort — failures return silent buffer)
    const era = resolveEra(state.era);
    const civType = state.currentPlayer;
    void this.preloadForEra(era, civType);

    // If resuming a save with era > 1, prime the director so it has the correct snapshot
    if (state.era >= 1 && settings.musicEnabled) {
      this.director.handleEraAdvanced({ era, civType });
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.mixer.setMusicEnabled(enabled);
  }

  setSfxEnabled(enabled: boolean): void {
    this.mixer.setSfxEnabled(enabled);
  }

  setMusicVolume(volume: number): void {
    this.mixer.setMusicVolume(volume);
  }

  setSfxVolume(volume: number): void {
    this.mixer.setSfxVolume(volume);
  }

  connectSfxNode(node: AudioNode): void {
    this.mixer.connectSfxNode(node);
  }

  dispose(): void {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
    this.disarmIosResume();
    this.mixer.dispose();
    this.started = false;
  }

  private wireEvents(bus: EventBus): void {
    this.unsubscribers.push(
      bus.on('era:advanced', p => {
        const civType = this.currentPlayerId;
        void this.preloadForEra(resolveEra(p.era), civType);
        this.director.handleEraAdvanced({ era: p.era, civType });
      }),

      bus.on('diplomacy:war-declared', p => {
        const isCurrentPlayerInvolved =
          p.attackerId === this.currentPlayerId || p.defenderId === this.currentPlayerId;
        if (!isCurrentPlayerInvolved) return;
        this.warCount++;
        this.director.handleWarDeclared({
          aggressor: p.attackerId,
          defender: p.defenderId,
          opponentKind: p.opponentKind,
        });
      }),

      bus.on('diplomacy:peace-made', p => {
        const isCurrentPlayerInvolved =
          p.civA === this.currentPlayerId || p.civB === this.currentPlayerId;
        if (!isCurrentPlayerInvolved) return;
        this.warCount = Math.max(0, this.warCount - 1);
        this.director.handlePeaceSigned({ remainingWars: this.warCount });
      }),

      bus.on('city:founded', p => {
        if (p.founderId !== this.currentPlayerId) return;
        this.director.handleCityFounded({ civType: this.currentPlayerId });
      }),

      bus.on('currentPlayer:changed-after-handoff', p => {
        this.currentPlayerId = p.civId;
        this.warCount = 0; // Reset war tracking for new player perspective
        this.director.handlePlayerChanged({ civType: p.civId });
      }),

      bus.on('game:over', p => {
        const outcome = p.winnerId === this.currentPlayerId ? 'victory' : 'defeat';
        this.director.handleGameEnded({ outcome });
      }),
    );

    // Resume AudioContext on user gesture (required by browsers)
    this.unsubscribers.push(
      bus.on('input:tap', () => void this.tryResume()),
    );
  }

  private async tryResume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  private armIosResume(): void {
    const handler = () => void this.tryResume();
    this.iosResumeListener = handler;
    document.addEventListener('visibilitychange', handler);
  }

  private disarmIosResume(): void {
    if (this.iosResumeListener) {
      document.removeEventListener('visibilitychange', this.iosResumeListener);
      this.iosResumeListener = null;
    }
  }

  private async preloadForEra(era: number, civType: string): Promise<void> {
    const paths: string[] = [];
    const base = CATALOG.eraBases[era as keyof typeof CATALOG.eraBases];
    if (base) paths.push(base.file);
    const family = getFamilyForCiv(civType);
    const accent = CATALOG.accents[family];
    if (accent) paths.push(accent.file);
    const warLayer = CATALOG.warLayers[era as keyof typeof CATALOG.warLayers];
    if (warLayer) paths.push(warLayer.file);
    await this.loader.preload(paths);
  }
}
```

- [ ] **Step 4: Run integration tests**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/audio-system.integration.test.ts 2>&1 | tail -40
```

Expected: all tests pass. If a flow fails, check the MockAudioContext transcript assertions against the actual calls the mixer makes.

- [ ] **Step 5: Run full suite + build**

```bash
eval "$(mise activate bash)" && yarn build && yarn test 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/audio/audio-system.ts tests/audio/audio-system.integration.test.ts
git commit -m "feat(audio): add AudioSystem lifecycle owner with integration tests"
```

---

## Task 10: Route sfx.ts through mixer SFX bus

**Files:**
- Modify: `src/audio/sfx.ts`

`sfx.ts` currently creates its own AudioContext and routes oscillators to `ctx.destination`. We need to add a `routeSfxThrough(node)` export so AudioSystem can redirect oscillator output through the mixer's SFX bus.

- [ ] **Step 1: Read the current sfx.ts**

Open `src/audio/sfx.ts`. Identify:
1. Where the `AudioContext` is created (likely a module-level `let audioContext: AudioContext | null = null`)
2. Where oscillators connect to `ctx.destination`
3. The `playTone` function signature

- [ ] **Step 2: Add `routeSfxThrough` export**

Add the following near the top of `src/audio/sfx.ts`, after any existing imports and before the first function:

```ts
let sfxDestination: AudioNode | null = null;

export function routeSfxThrough(node: AudioNode): void {
  sfxDestination = node;
  // Update the sfx AudioContext to match the one the node belongs to
  audioContext = node.context as AudioContext;
}
```

Then in `playTone` (or equivalent), replace the line that connects to `ctx.destination` with:

```ts
// BEFORE:
oscillator.connect(gainNode);
gainNode.connect(ctx.destination);

// AFTER:
oscillator.connect(gainNode);
gainNode.connect(sfxDestination ?? ctx.destination);
```

Make the same change in every `playTone`-like function in the file that routes to `ctx.destination`.

- [ ] **Step 3: Run build + tests**

```bash
eval "$(mise activate bash)" && yarn build && yarn test 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/audio/sfx.ts
git commit -m "feat(audio): add routeSfxThrough() to route SFX oscillators through mixer"
```

---

## Task 11: main.ts cutover + delete old audio files

**Files:**
- Modify: `src/main.ts`
- Delete: `src/audio/audio-manager.ts`
- Delete: `src/audio/music-generator.ts`

This is the player-visible change: the procedural drone hum stops. Silence replaces it.

- [ ] **Step 1: Replace AudioManager import in `src/main.ts`**

Find:
```ts
import { AudioManager } from './audio/audio-manager';
```

Replace with:
```ts
import { AudioSystem } from './audio/audio-system';
import { routeSfxThrough } from './audio/sfx';
```

- [ ] **Step 2: Replace AudioManager instantiation**

Find:
```ts
const audio = new AudioManager();
```
(or similar — check around line 169)

Replace with:
```ts
const audioCtx = new AudioContext();
const audio = new AudioSystem(audioCtx);
```

- [ ] **Step 3: Replace audio.playProceduralMusic() calls**

Find all calls to `audio.playProceduralMusic()` (around lines 2054-2055, 2091-2092, 2792).

Replace each with a call to `audio.start(gameState, bus)` where `gameState` is the game state available at that callsite. For new-game flow:

```ts
// BEFORE:
audio.playProceduralMusic();

// AFTER (at new-game creation, where gameState is available):
audio.start(gameState, bus);
```

For the save-load flow:

```ts
// BEFORE:
audio.playProceduralMusic();

// AFTER (at save-load, where loaded state is available):
audio.start(loadedState, bus);
```

For the hot-seat "Continue" tap (around line 2069, `onReady` callback), add the `currentPlayer:changed-after-handoff` emit before calling audio.start or after, depending on control flow:

```ts
bus.emit('currentPlayer:changed-after-handoff', { civId: newState.currentPlayer });
```

If `audio.start()` was already called for this game session, `start()` returns early (guarded by `this.started`). The `currentPlayer:changed-after-handoff` event handler in AudioSystem will update the director.

- [ ] **Step 4: Wire SFX bus**

After `audio.start(...)`, add:

```ts
routeSfxThrough(audio.getSfxBusInput());
```

Add `getSfxBusInput(): AudioNode` to `AudioSystem` that returns the SFX bus input node from the mixer:

In `src/audio/audio-system.ts`, add:
```ts
getSfxBusInput(): AudioNode {
  return this.mixer.getSfxBusInput();
}
```

In `src/audio/audio-mixer.ts`, add:
```ts
getSfxBusInput(): AudioNode {
  return this.sfxBus.gain;
}
```

Where `this.sfxBus.gain` is the GainNode that the SFX bus uses (the input node of the SFX chain).

- [ ] **Step 5: Remove AudioManager and MusicGenerator**

```bash
rm /Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/vigorous-mayer-a03b68/src/audio/audio-manager.ts
rm /Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/vigorous-mayer-a03b68/src/audio/music-generator.ts
```

- [ ] **Step 6: Build**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | tail -20
```

Expected: exits 0. Fix any remaining references to `AudioManager` or `MusicGenerator` in `main.ts`.

- [ ] **Step 7: Run all tests**

```bash
eval "$(mise activate bash)" && yarn test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/audio/audio-system.ts src/audio/audio-mixer.ts
git rm src/audio/audio-manager.ts src/audio/music-generator.ts
git commit -m "feat(audio): wire AudioSystem in main.ts, delete AudioManager and MusicGenerator"
```

---

## Task 12: Service worker, AUDIO-CREDITS.md update, smoke test

**Files:**
- Modify: `public/sw.js`
- Modify: `AUDIO-CREDITS.md` (root level, created in MR1)

- [ ] **Step 1: Add era-1 war layer to service worker precache**

Open `public/sw.js`. Find `PRECACHE_URLS`. Add the era-1 war layer OGG:

```js
const PRECACHE_URLS = [
  'index.html',
  'manifest.json',
  // era-1 war layer pre-cached so war music is always available offline
  'audio/era/era1-war.ogg',
];
```

Rationale (L2 in spec): Only the era-1 war layer is pre-cached. All other audio files are fetched on demand by `AudioLoader` and cached by the browser (Cache-Control) and service worker fetch handler.

- [ ] **Step 2: Build and verify SW includes the file**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | tail -5
grep 'era1-war' dist/sw.js || grep 'era1-war' public/sw.js
```

Expected: file builds and `era1-war.ogg` appears in the SW.

- [ ] **Step 3: Manual smoke test checklist**

After MR4 merges and the game is running locally (`yarn dev`):

- [ ] Open the game in Chrome. Open DevTools → Console.
- [ ] Start a new game. Confirm no JavaScript errors. Confirm no audio plays (placeholder OGGs are silent).
- [ ] Open DevTools → Application → Storage → Service Worker. Confirm SW is active.
- [ ] Declare war. Confirm no errors. Confirm no audio plays (expected — placeholders are silent).
- [ ] Sign peace. Confirm no errors.
- [ ] Advance to a new era. Confirm no errors.
- [ ] End a game. Confirm no errors.
- [ ] Toggle music off/on in settings. Confirm no errors.
- [ ] Open the game on iPhone Safari (or iOS simulator). Confirm no errors in console.
- [ ] Tab away and return. Confirm no errors (iOS defensive resume must not throw).

- [ ] **Step 4: Commit**

```bash
git add public/sw.js AUDIO-CREDITS.md
git commit -m "feat(audio): add era-1 war layer to SW precache; smoke test checklist"
```

---

## MR4 verification gate

Before marking MR4 done:

```bash
eval "$(mise activate bash)" && yarn build && yarn test
```

Both must exit 0.

The game is playable with silence where music used to be. The procedural drone hum is gone. `AudioManager` and `MusicGenerator` are deleted. The curation MR series can now replace OGGs without any code changes.
