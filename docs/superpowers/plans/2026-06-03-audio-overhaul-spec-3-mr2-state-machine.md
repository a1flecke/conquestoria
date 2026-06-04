# Spec 3 MR2 — State Machine + Stinger Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MusicDirector`'s single `intendedSnapshot` variable with three boolean flags and a `resolveSnapshot()` method; add handlers for `faction:unrest-started`, `faction:revolt-started`, `faction:unrest-resolved`, `civ:near-defeat`, `civ:recovered-from-near-defeat`; wire 4 new stingers (`wonderBuilt`, `techResearched`, `peaceSigned`, `civDefeated`); revise `handleGameEnded` to play a stinger before silencing; emit the 3 new game events from `main.ts` on city capture and city founding.

**Architecture:** `MusicDirector` becomes flag-driven. `resolveSnapshot()` is public so `VoiceDirector` (MR3) can call it via injected callback. `AudioSystem` passes the extended `currentPlayer:changed-after-handoff` payload to `handlePlayerChanged`. The new `currentStingerPromise` property on `MusicDirector` lets the voice sequencing layer (MR3) await stinger completion before playing a voice line.

**Prerequisite:** MR1 merged. `SnapshotId` includes `'unrest'` and `'brink-of-defeat'`. `types.ts` has `civ:near-defeat`, `civ:eliminated`, `civ:recovered-from-near-defeat`, and the extended handoff payload.

**Tech Stack:** TypeScript, Vite, Web Audio API, Vitest.

---

## File map

| Action | Path |
|---|---|
| Modify | `src/audio/music-director.ts` |
| Modify | `src/audio/audio-system.ts` |
| Modify | `src/main.ts` (emit 3 new events after city capture and city founding) |
| Modify | `tests/audio/music-director.test.ts` |

---

## Background: current `MusicDirector`

`music-director.ts` has a single `private intendedSnapshot: SnapshotId = 'silent'`. `handleWarDeclared` sets it to `'at-war'`; `handlePeaceSigned` sets it back to `'peace'`. `playStingerWithDuck()` restores `this.intendedSnapshot` after each stinger.

After this MR: three boolean flags (`atWar`, `inUnrest`, `nearDefeat`) + `unrestCityCount` integer. `resolveSnapshot()` computes the winning snapshot from those flags. All stinger restores call `resolveSnapshot()` instead of reading a stored snapshot ID.

---

## Task 1: Rewrite `music-director.ts`

**Files:**
- Modify: `src/audio/music-director.ts`

Read the current file before editing. It has `handleEraAdvanced`, `handleWarDeclared`, `handlePeaceSigned`, `handleCityFounded`, `handlePlayerChanged`, `handleGameEnded`, `playStingerWithDuck`.

- [ ] **Step 1.1: Update payload interfaces**

At the top of `src/audio/music-director.ts`, update interfaces and add new ones:

```typescript
export interface WarDeclaredPayload {
  aggressor: string;
  defender: string;
  opponentKind: 'major' | 'minor' | 'barbarian';
}

export interface PeaceSignedPayload {
  remainingWars: number;
}

export interface EraAdvancedPayload {
  era: number;
  civType: string;
}

export interface CityFoundedPayload {
  civType: string;
}

// Extended for Spec 3 — includes hot-seat drift state
export interface PlayerChangedPayload {
  civType: string;
  atWar: boolean;
  unrestCityCount: number;
  nearDefeat: boolean;
}

export interface GameEndedPayload {
  outcome: 'victory' | 'defeat' | 'tie';
}

// New Spec 3 payloads
export interface UnrestChangedPayload {
  owner: string;   // civ ID — only act if this matches currentCivId
}

export interface CivNearDefeatPayload {
  civId: string;
}
```

- [ ] **Step 1.2: Replace class body**

Replace the entire `MusicDirector` class:

```typescript
const CROSSFADE_MS = 2000;
const STINGER_DUCK_FADE_MS = 100;
const STINGER_RESTORE_MS = 1000;
const GAME_END_FADE_MS = 1500;

export class MusicDirector {
  // Adaptive state flags — set by event handlers
  private atWar = false;
  private inUnrest = false;
  private nearDefeat = false;
  private unrestCityCount = 0;
  private currentCivId = '';
  private currentEra = 1;

  // Exposed so AudioSystem (MR3) can chain voice lines after stingers
  public currentStingerPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
  ) {}

  /** Priority: brink-of-defeat > at-war > unrest > peace */
  public resolveSnapshot(): SnapshotId {
    if (this.nearDefeat) return 'brink-of-defeat';
    if (this.atWar)      return 'at-war';
    if (this.inUnrest)   return 'unrest';
    return 'peace';
  }

  private applySnapshot(fadeMs = CROSSFADE_MS): void {
    this.mixer.setSnapshot(this.resolveSnapshot(), fadeMs);
    this.updateAdaptiveBusSource();
  }

  /** Switch the Adaptive bus source to match the resolved snapshot. */
  private updateAdaptiveBusSource(): void {
    // Imported at top of file — add these imports:
    // import { UNREST_LAYER, DEFEAT_LAYER, WAR_LAYER, resolveEra } from './audio-catalog';
    const era = resolveEra(this.currentEra);
    const snapshot = this.resolveSnapshot();
    let entry: TrackEntry | null = null;
    if (snapshot === 'unrest')            entry = UNREST_LAYER[era];
    else if (snapshot === 'at-war')       entry = WAR_LAYER[era];
    else if (snapshot === 'brink-of-defeat') entry = DEFEAT_LAYER[era];

    if (entry) {
      void this.loader.get(entry.file).then(buf => {
        this.mixer.setBusSource('adaptive', buf, true, entry!.loop, CROSSFADE_MS);
      });
    } else {
      // peace / silent — adaptive bus silent (snapshot gain = 0)
      this.mixer.setBusSource('adaptive', null, false, null, CROSSFADE_MS);
    }
  }

  initPeaceSnapshot(): void {
    this.mixer.setSnapshot('peace', 0);
  }

  handleEraAdvanced(p: EraAdvancedPayload): void {
    this.currentEra = p.era;
    this.applySnapshot(CROSSFADE_MS);
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.eraTransitionCue[resolveEra(p.era)].file)
      .then(() => this.playStingerWithDuck(STINGER.eraAdvance[resolveEra(p.era)].file));
  }

  handleWarDeclared(_p: WarDeclaredPayload): void {
    this.atWar = true;
    this.applySnapshot(CROSSFADE_MS);
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.warDeclared.file);
  }

  handlePeaceSigned(p: PeaceSignedPayload): void {
    if (p.remainingWars > 0) return;
    this.atWar = false;
    this.applySnapshot(CROSSFADE_MS);
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.peaceSigned.file);
  }

  handleCityFounded(_p: CityFoundedPayload): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.cityFounded.file);
  }

  handleWonderBuilt(): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.wonderBuilt.file);
  }

  handleTechResearched(): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.techResearched.file);
  }

  handleCivDefeated(): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.civDefeated.file);
  }

  handleUnrestStarted(p: UnrestChangedPayload): void {
    if (p.owner !== this.currentCivId) return;
    this.unrestCityCount++;
    this.inUnrest = true;
    this.applySnapshot(CROSSFADE_MS);
  }

  // faction:revolt-started counts as unrest — increment the same counter
  handleRevoltStarted(p: UnrestChangedPayload): void {
    this.handleUnrestStarted(p);
  }

  handleUnrestResolved(p: UnrestChangedPayload): void {
    if (p.owner !== this.currentCivId) return;
    this.unrestCityCount = Math.max(0, this.unrestCityCount - 1);
    this.inUnrest = this.unrestCityCount > 0;
    this.applySnapshot(CROSSFADE_MS);
  }

  handleNearDefeat(p: CivNearDefeatPayload): void {
    if (p.civId !== this.currentCivId) return;
    this.nearDefeat = true;
    this.applySnapshot(CROSSFADE_MS);
  }

  handleRecoveredFromNearDefeat(p: CivNearDefeatPayload): void {
    if (p.civId !== this.currentCivId) return;
    this.nearDefeat = false;
    this.applySnapshot(CROSSFADE_MS);
  }

  handlePlayerChanged(p: PlayerChangedPayload): void {
    this.currentCivId = p.civType;  // Note: AudioSystem passes civType; currentCivId stores it
    // Reset all flags from the authoritative payload — prevents hot-seat drift
    this.atWar = p.atWar;
    this.unrestCityCount = p.unrestCityCount;
    this.inUnrest = p.unrestCityCount > 0;
    this.nearDefeat = p.nearDefeat;
    this.applySnapshot(CROSSFADE_MS);
  }

  /** Returns a Promise that resolves after the stinger + post-stinger silence fade.
   *  AudioSystem awaits this before playing the victory voice line. */
  handleGameEnded(p: GameEndedPayload): Promise<void> {
    const stingerFile = p.outcome === 'victory' ? STINGER.victory.file : STINGER.defeat.file;
    this.mixer.setSnapshot('stinger-duck', STINGER_DUCK_FADE_MS);
    this.currentStingerPromise = this.loader.get(stingerFile)
      .then(buffer => this.mixer.playOneShot('stinger', buffer))
      .then(() => { this.mixer.setSnapshot('silent', GAME_END_FADE_MS); });
      // Deliberately does NOT call resolveSnapshot() — game is over, music must not resume.
    return this.currentStingerPromise;
  }

  async playStingerWithDuck(path: string): Promise<void> {
    this.mixer.setSnapshot('stinger-duck', STINGER_DUCK_FADE_MS);
    const buffer = await this.loader.get(path);
    await this.mixer.playOneShot('stinger', buffer);
    this.mixer.setSnapshot(this.resolveSnapshot(), STINGER_RESTORE_MS);
  }
}
```

- [ ] **Step 1.3: Update imports at top of `music-director.ts`**

The file needs these imports:

```typescript
import type { AudioMixer, SnapshotId } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { STINGER, UNREST_LAYER, DEFEAT_LAYER, WAR_LAYER, resolveEra, type TrackEntry } from './audio-catalog';
```

- [ ] **Step 1.4: Run build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -20
```

Expected: TypeScript errors in `audio-system.ts` where `handlePlayerChanged` is called with old payload shape `{ civType: string }` only — fix in Task 2. Potentially also errors for `PlayerChangedPayload` consumers.

- [ ] **Step 1.5: Commit skeleton (may not compile yet)**

```bash
git add src/audio/music-director.ts
git commit -m "feat(spec3-mr2): rewrite MusicDirector with flag-based resolver, unrest/near-defeat handlers, new stingers"
```

---

## Task 2: Update `audio-system.ts` event wiring

**Files:**
- Modify: `src/audio/audio-system.ts`

- [ ] **Step 2.1: Update `handlePlayerChanged` call with extended payload**

In `audio-system.ts`, find the `currentPlayer:changed-after-handoff` subscription:

```typescript
bus.on('currentPlayer:changed-after-handoff', p => {
  this.currentPlayerId = p.civId;
  this.currentCivType = this.civTypeById[p.civId] ?? p.civId;
  this.warCount = 0;
  this.naturalWonderDirector.stopAmbient('player-changed');
  this.director.handlePlayerChanged({ civType: this.currentCivType });
  void this.reloadAccent(this.currentCivType);
}),
```

Replace with:

```typescript
bus.on('currentPlayer:changed-after-handoff', p => {
  this.currentPlayerId = p.civId;
  this.currentCivType = this.civTypeById[p.civId] ?? p.civId;
  // warCount is now tracked inside MusicDirector via flags — remove local counter
  this.naturalWonderDirector.stopAmbient('player-changed');
  this.director.handlePlayerChanged({
    civType: this.currentCivType,
    atWar: p.atWar,
    unrestCityCount: p.unrestCityCount,
    nearDefeat: p.nearDefeat,
  });
  void this.reloadAccent(this.currentCivType);
}),
```

- [ ] **Step 2.2: Remove `warCount` field from `AudioSystem`**

`warCount` was used to track remaining wars for `handlePeaceSigned`. `MusicDirector` now tracks `atWar` as a boolean (not a count). `AudioSystem` must still pass `remainingWars` to `handlePeaceSigned`. Keep it for peace-signed only:

```typescript
// Keep private warCount for peace-signed only (MusicDirector needs remainingWars to determine if all wars are over)
private warCount = 0;
```

The `war-declared` and `peace-made` subscriptions remain unchanged — `warCount` is still used there.

- [ ] **Step 2.3: Wire new stinger events**

Inside `wireEvents()`, add new subscriptions after the existing ones:

```typescript
      bus.on('wonder:legendary-completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleWonderBuilt();
      }),

      bus.on('tech:completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleTechResearched();
      }),

      bus.on('civ:eliminated', p => {
        if (p.eliminatedBy !== this.currentPlayerId) return;
        this.director.handleCivDefeated();
      }),

      bus.on('faction:unrest-started', p => {
        this.director.handleUnrestStarted({ owner: p.owner });
      }),

      bus.on('faction:revolt-started', p => {
        this.director.handleRevoltStarted({ owner: p.owner });
      }),

      bus.on('faction:unrest-resolved', p => {
        this.director.handleUnrestResolved({ owner: p.owner });
      }),

      bus.on('civ:near-defeat', p => {
        this.director.handleNearDefeat({ civId: p.civId });
      }),

      bus.on('civ:recovered-from-near-defeat', p => {
        this.director.handleRecoveredFromNearDefeat({ civId: p.civId });
      }),
```

- [ ] **Step 2.4: Update `game:over` subscription to await stinger**

The `game:over` handler currently calls `handleGameEnded` and ignores the return value. Update it to also preload voice lines for victory (MR3 will add actual voice playback, but the stinger-first flow is tested here):

```typescript
      bus.on('game:over', p => {
        const outcome = p.winnerId === this.currentPlayerId ? 'victory' : 'defeat';
        this.naturalWonderDirector.stopAmbient('game-ended');
        // handleGameEnded returns a Promise for MR3's voice chaining — fire and forget here
        void this.director.handleGameEnded({ outcome });
      }),
```

- [ ] **Step 2.5: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 2.6: Commit**

```bash
git add src/audio/audio-system.ts
git commit -m "feat(spec3-mr2): wire unrest/near-defeat/new-stinger events in AudioSystem"
```

---

## Task 3: Emit new game events from `main.ts`

**Files:**
- Modify: `src/main.ts`

The three new events must fire from the appropriate places:
- `civ:near-defeat` — after a city is captured and the previous owner has ≤ 1 city
- `civ:recovered-from-near-defeat` — when a near-defeat civ gains a city (capture or found)
- `civ:eliminated` — when a civ's last city is captured (cities.length === 0)

The `Civilization.nearDefeat` flag (added to types.ts in MR1) tracks the state. This must be set/cleared in sync with the events.

- [ ] **Step 3.1: Emit events after city capture in `finalizePendingCityCaptureChoice`**

In `main.ts`, find `finalizePendingCityCaptureChoice` (line ~1875). After `bus.emit('city:captured', ...)`, add:

```typescript
    // Spec 3: emit near-defeat / eliminated / recovered events
    const prevCiv = gameState.civilizations[previousOwner];
    if (prevCiv) {
      const prevCivCityCount = Object.values(gameState.cities).filter(c => c.owner === previousOwner).length;

      if (prevCivCityCount === 0) {
        // Eliminated
        prevCiv.nearDefeat = false;
        bus.emit('civ:eliminated', { civId: previousOwner, eliminatedBy: gameState.currentPlayer });
      } else if (prevCivCityCount === 1 && !prevCiv.nearDefeat) {
        // Just entered near-defeat
        prevCiv.nearDefeat = true;
        bus.emit('civ:near-defeat', { civId: previousOwner });
      }
    }

    // Check if the capturing civ was near-defeat and just gained a city (city recaptured)
    const capturingCiv = gameState.civilizations[gameState.currentPlayer];
    if (capturingCiv?.nearDefeat) {
      const capturingCityCount = Object.values(gameState.cities).filter(c => c.owner === gameState.currentPlayer).length;
      if (capturingCityCount > 1) {
        capturingCiv.nearDefeat = false;
        bus.emit('civ:recovered-from-near-defeat', { civId: gameState.currentPlayer });
      }
    }
```

- [ ] **Step 3.2: Emit `civ:recovered-from-near-defeat` on city founding**

In `main.ts`, find the `city:founded` event emission (search for `bus.emit('city:founded'`). After it, add:

```typescript
    // Spec 3: founding a city lifts near-defeat if the civ previously had ≤ 1 city
    const founderCiv = gameState.civilizations[founderId];
    if (founderCiv?.nearDefeat) {
      const founderCityCount = Object.values(gameState.cities).filter(c => c.owner === founderId).length;
      if (founderCityCount > 1) {
        founderCiv.nearDefeat = false;
        bus.emit('civ:recovered-from-near-defeat', { civId: founderId });
      }
    }
```

- [ ] **Step 3.3: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 3.4: Commit**

```bash
git add src/main.ts
git commit -m "feat(spec3-mr2): emit civ:near-defeat, civ:recovered-from-near-defeat, civ:eliminated from main.ts city capture and founding"
```

---

## Task 4: Extend `music-director.test.ts`

**Files:**
- Modify: `tests/audio/music-director.test.ts`

Read the existing test file before editing. It uses `makeMixer()` and `makeLoader()` helpers with `vi.fn()` mocks.

- [ ] **Step 4.1: Update `makeMixer()` mock to include new methods**

In the test file, find `makeMixer()` and add the new mixer methods:

```typescript
function makeMixer(): AudioMixer {
  return {
    setSnapshot: vi.fn(),
    playOneShot: vi.fn().mockResolvedValue(undefined),
    setBusSource: vi.fn(),
    setMasterMusicVolume: vi.fn(),
    setMasterVolume: vi.fn(),          // NEW
    setMusicVolume: vi.fn(),
    setMusicEnabled: vi.fn(),
    setSfxVolume: vi.fn(),
    setSfxEnabled: vi.fn(),
    setVoiceVolume: vi.fn(),           // NEW
    setVoiceEnabled: vi.fn(),          // NEW
    setStingerVolume: vi.fn(),         // NEW
    setStingerEnabled: vi.fn(),        // NEW
    getSfxRoutingNode: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AudioMixer;
}
```

- [ ] **Step 4.2: Update `handlePlayerChanged` calls in existing tests**

The existing test calls `director.handlePlayerChanged({ civType: 'egypt' })`. These now need the full payload:

```typescript
// Find and replace ALL handlePlayerChanged calls in the test file:
director.handlePlayerChanged({ civType: 'egypt', atWar: false, unrestCityCount: 0, nearDefeat: false })
```

- [ ] **Step 4.3: Update `handleGameEnded` test**

The existing test `'transitions to silent on game end'` calls `director.handleGameEnded({ outcome: 'victory' })`. This now returns a Promise. Update:

```typescript
it('transitions to silent on game end after stinger', async () => {
  director.handleEraAdvanced({ era: 1, civType: 'rome' });
  await director.handleGameEnded({ outcome: 'victory' });
  // setSnapshot('silent') called after stinger resolves
  const snapshotCalls = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
  expect(snapshotCalls).toContain('silent');
  // stinger-duck comes before silent
  const duckIdx = snapshotCalls.lastIndexOf('stinger-duck');
  const silentIdx = snapshotCalls.lastIndexOf('silent');
  expect(duckIdx).toBeLessThan(silentIdx);
});

it('does NOT call resolveSnapshot after game-over stinger (no music resume)', async () => {
  director.initPeaceSnapshot();
  vi.mocked(mixer.setSnapshot).mockClear();
  await director.handleGameEnded({ outcome: 'defeat' });
  const snapshots = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
  // Only 'stinger-duck' and 'silent' — NOT 'peace' or 'at-war'
  expect(snapshots).not.toContain('peace');
  expect(snapshots).not.toContain('at-war');
  expect(snapshots).toContain('silent');
});
```

- [ ] **Step 4.4: Add priority chain tests**

```typescript
describe('resolveSnapshot — priority chain', () => {
  function makeDirectorWithState(atWar: boolean, inUnrest: boolean, nearDefeat: boolean): MusicDirector {
    const d = new MusicDirector(makeMixer(), makeLoader());
    d.handlePlayerChanged({ civType: 'rome', atWar, unrestCityCount: inUnrest ? 1 : 0, nearDefeat });
    return d;
  }

  it('nearDefeat alone → brink-of-defeat', () => {
    const d = makeDirectorWithState(false, false, true);
    expect(d.resolveSnapshot()).toBe('brink-of-defeat');
  });

  it('nearDefeat + atWar → brink-of-defeat (nearDefeat wins)', () => {
    const d = makeDirectorWithState(true, false, true);
    expect(d.resolveSnapshot()).toBe('brink-of-defeat');
  });

  it('nearDefeat + inUnrest → brink-of-defeat (nearDefeat wins)', () => {
    const d = makeDirectorWithState(false, true, true);
    expect(d.resolveSnapshot()).toBe('brink-of-defeat');
  });

  it('nearDefeat + atWar + inUnrest → brink-of-defeat (nearDefeat wins)', () => {
    const d = makeDirectorWithState(true, true, true);
    expect(d.resolveSnapshot()).toBe('brink-of-defeat');
  });

  it('atWar alone → at-war', () => {
    const d = makeDirectorWithState(true, false, false);
    expect(d.resolveSnapshot()).toBe('at-war');
  });

  it('atWar + inUnrest → at-war (atWar wins over unrest)', () => {
    const d = makeDirectorWithState(true, true, false);
    expect(d.resolveSnapshot()).toBe('at-war');
  });

  it('inUnrest alone → unrest', () => {
    const d = makeDirectorWithState(false, true, false);
    expect(d.resolveSnapshot()).toBe('unrest');
  });

  it('all false → peace', () => {
    const d = makeDirectorWithState(false, false, false);
    expect(d.resolveSnapshot()).toBe('peace');
  });
});
```

- [ ] **Step 4.5: Add unrest counter tests**

```typescript
describe('unrest counter', () => {
  let director: MusicDirector;
  beforeEach(() => {
    director = new MusicDirector(makeMixer(), makeLoader());
    director.handlePlayerChanged({ civType: 'rome', atWar: false, unrestCityCount: 0, nearDefeat: false });
  });

  it('two unrest-started events → inUnrest = true, count = 2', () => {
    director.handleUnrestStarted({ owner: 'rome' });
    director.handleUnrestStarted({ owner: 'rome' });
    expect(director.resolveSnapshot()).toBe('unrest');
  });

  it('two started then one resolved → still unrest (count = 1)', () => {
    director.handleUnrestStarted({ owner: 'rome' });
    director.handleUnrestStarted({ owner: 'rome' });
    director.handleUnrestResolved({ owner: 'rome' });
    expect(director.resolveSnapshot()).toBe('unrest');
  });

  it('two started then two resolved → peace (count = 0)', () => {
    director.handleUnrestStarted({ owner: 'rome' });
    director.handleUnrestStarted({ owner: 'rome' });
    director.handleUnrestResolved({ owner: 'rome' });
    director.handleUnrestResolved({ owner: 'rome' });
    expect(director.resolveSnapshot()).toBe('peace');
  });

  it('revolt-started counts the same as unrest-started', () => {
    director.handleRevoltStarted({ owner: 'rome' });
    expect(director.resolveSnapshot()).toBe('unrest');
  });

  it('unrest events from other civs are ignored', () => {
    director.handleUnrestStarted({ owner: 'egypt' });  // different civ
    expect(director.resolveSnapshot()).toBe('peace');
  });

  it('counter never goes below 0 (extra resolves are idempotent)', () => {
    director.handleUnrestResolved({ owner: 'rome' }); // no prior started
    director.handleUnrestResolved({ owner: 'rome' });
    expect(director.resolveSnapshot()).toBe('peace');
  });
});
```

- [ ] **Step 4.6: Add hot-seat drift reset tests**

```typescript
describe('handlePlayerChanged — hot-seat drift reset', () => {
  let director: MusicDirector;
  beforeEach(() => {
    director = new MusicDirector(makeMixer(), makeLoader());
    director.handlePlayerChanged({ civType: 'rome', atWar: false, unrestCityCount: 0, nearDefeat: false });
  });

  it('handoff with atWar:true resets to at-war regardless of prior state', () => {
    // Prior state: peace
    director.handlePlayerChanged({ civType: 'egypt', atWar: true, unrestCityCount: 0, nearDefeat: false });
    expect(director.resolveSnapshot()).toBe('at-war');
  });

  it('handoff with nearDefeat:true resets to brink-of-defeat', () => {
    director.handlePlayerChanged({ civType: 'viking', atWar: false, unrestCityCount: 0, nearDefeat: true });
    expect(director.resolveSnapshot()).toBe('brink-of-defeat');
  });

  it('handoff clears prior unrest — incoming player is at peace', () => {
    // Rome had 2 cities in unrest
    director.handleUnrestStarted({ owner: 'rome' });
    director.handleUnrestStarted({ owner: 'rome' });
    // Hand off to egypt which has no unrest
    director.handlePlayerChanged({ civType: 'egypt', atWar: false, unrestCityCount: 0, nearDefeat: false });
    expect(director.resolveSnapshot()).toBe('peace');
  });

  it('handoff with unrestCityCount:2 resolves to unrest', () => {
    director.handlePlayerChanged({ civType: 'aztec', atWar: false, unrestCityCount: 2, nearDefeat: false });
    expect(director.resolveSnapshot()).toBe('unrest');
  });
});
```

- [ ] **Step 4.7: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/music-director.test.ts 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4.8: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```

Expected: all pass, 0 failures.

- [ ] **Step 4.7b: Add stinger sequencing test (spec §7.5)**

`currentStingerPromise` must resolve BEFORE voice code can proceed (this is the sequencing contract MR3 relies on). Test it here so MR3 can trust it:

```typescript
describe('currentStingerPromise — stinger sequencing contract', () => {
  it('resolves immediately when no stinger is active (initial state)', async () => {
    const director = new MusicDirector(makeMixer(), makeLoader());
    // currentStingerPromise starts as Promise.resolve() — should resolve in the same microtask turn
    let resolved = false;
    void director.currentStingerPromise.then(() => { resolved = true; });
    await flushPromises();
    expect(resolved).toBe(true);
  });

  it('resolves after playStingerWithDuck completes', async () => {
    const mixer = makeMixer();
    // Make playOneShot take one macrotask (simulates async stinger)
    let resolveOneShot!: () => void;
    vi.mocked(mixer.playOneShot).mockReturnValue(
      new Promise<void>(r => { resolveOneShot = r; }),
    );
    const loader = makeLoader();
    const director = new MusicDirector(mixer, loader);
    director.initPeaceSnapshot();

    // Kick off a stinger
    director.handleCityFounded({ civType: 'rome' });

    let stingerDone = false;
    void director.currentStingerPromise.then(() => { stingerDone = true; });

    // Before stinger resolves — promise not yet done
    await flushPromises();
    expect(stingerDone).toBe(false);

    // Resolve the stinger
    resolveOneShot();
    await flushPromises();
    expect(stingerDone).toBe(true);
  });
});
```

- [ ] **Step 4.9: Commit**

```bash
git add tests/audio/music-director.test.ts
git commit -m "test(spec3-mr2): add priority chain, unrest counter, hot-seat reset, game-over stinger, sequencing contract tests"
```

---

## Task 5: Final MR2 verification

- [ ] **Step 5.1: Full test suite + build**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -5
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

Expected: both clean.

- [ ] **Step 5.2: Verify event subscription completeness**

```bash
grep -n "bus.on\|bus.emit" src/audio/audio-system.ts | grep -E "unrest|revolt|near.defeat|eliminated|wonder.*completed|tech.*completed|civ.*eliminated"
```

Expected: all 8 new event subscriptions appear.

- [ ] **Step 5.3: Verify new event emissions in main.ts**

```bash
grep -n "civ:near-defeat\|civ:eliminated\|civ:recovered" src/main.ts
```

Expected: 3 distinct emit calls.
