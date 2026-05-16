# MR3 — Director: Event Enrichment and MusicDirector

Part of [Audio Overhaul Spec 1 Plan](./2026-05-15-audio-overhaul-spec-1-index.md). Requires MR1 and MR2 to be merged first.

**Goal:** Enrich game events with the fields MusicDirector needs, add `resolveOpponentKind()` to diplomacy-system, and implement the MusicDirector class with full test coverage. No changes to the audio wiring in `main.ts`. Old AudioManager still runs; new music code is unreachable at runtime.

**Why this is safe to merge partial:** `MusicDirector` is not imported or instantiated anywhere in production code. All event-payload changes are additive (new optional fields), so existing consumers compile without modification. `resolveOpponentKind` is an export on an existing module — no callers yet.

---

## Task 7: Event type enrichment + emit sites (atomic)

This task MUST be committed atomically. Adding `era:advanced` to `types.ts` without updating `turn-manager.ts` breaks `tsc`. All 7 file edits go in one commit.

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/diplomacy-system.ts`
- Modify: `src/main.ts`
- Modify: `src/input/foreign-city-entry-flow.ts`
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Extend `GameEvents` in `src/core/types.ts`**

Add the two new events and extend the three enriched events. Open `src/core/types.ts`, find the `GameEvents` interface, and make these changes:

```ts
// ADD these two new events to GameEvents:
'era:advanced': { era: number };
'currentPlayer:changed-after-handoff': { civId: string };

// REPLACE the existing diplomacy:war-declared entry:
'diplomacy:war-declared': {
  attackerId: string;
  defenderId: string;
  opponentKind: 'major' | 'minor' | 'barbarian';
};

// REPLACE the existing diplomacy:peace-made entry:
'diplomacy:peace-made': { civA: string; civB: string };
// (peace-made payload is unchanged — no enrichment needed for MusicDirector)

// REPLACE the existing city:founded entry:
'city:founded': {
  city: City;
  founderId: string;
};
```

- [ ] **Step 2: Verify `tsc` fails (types without emit)**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | head -40
```

Expected: compile errors in `turn-manager.ts`, `diplomacy-system.ts`, `main.ts`, `foreign-city-entry-flow.ts`, `basic-ai.ts` — every emit site that uses the affected events.

- [ ] **Step 3: Add `resolveOpponentKind()` to `src/systems/diplomacy-system.ts`**

Add this helper near the top of the file (after imports, before the first exported function). It needs access to the list of minor civ IDs — import `MINOR_CIV_DEFINITIONS` if not already imported:

```ts
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';

export function resolveOpponentKind(civId: string): 'major' | 'minor' | 'barbarian' {
  if (civId.startsWith('barbarian')) return 'barbarian';
  if (MINOR_CIV_DEFINITIONS.some(d => d.id === civId)) return 'minor';
  return 'major';
}
```

- [ ] **Step 4: Enrich `war-declared` emits in `src/systems/diplomacy-system.ts`**

Find every `bus.emit('diplomacy:war-declared', ...)` call in the file (there is one inside `acceptDiplomaticRequest` or similar). Add `opponentKind` to each:

```ts
// BEFORE:
bus.emit('diplomacy:war-declared', { attackerId: ..., defenderId: ... });

// AFTER (repeat for every war-declared emit in this file):
bus.emit('diplomacy:war-declared', {
  attackerId: ...,
  defenderId: ...,
  opponentKind: resolveOpponentKind(defenderId),
});
```

- [ ] **Step 5: Emit `era:advanced` in `src/core/turn-manager.ts`**

Find the era-check block (around line 701–708). It reads something like:

```ts
if (newEra > newState.era) {
  newState.era = newEra;
}
```

Add the event emit directly after `newState.era = newEra`:

```ts
if (newEra > newState.era) {
  newState.era = newEra;
  bus.emit('era:advanced', { era: newEra });
}
```

If `bus` is not a parameter of this function, thread it through: add `bus: EventBus` as the last parameter and update the one call site in `main.ts`.

- [ ] **Step 6: Enrich `city:founded` and `war-declared` emits in `src/main.ts`**

Search for all `bus.emit('city:founded'` and `bus.emit('diplomacy:war-declared'` calls in `main.ts`. Update each:

```ts
// city:founded (around line 1402):
// BEFORE:
bus.emit('city:founded', { city });
// AFTER:
bus.emit('city:founded', { city, founderId: state.currentPlayer });

// diplomacy:war-declared (around line 1459):
// BEFORE:
bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId });
// AFTER:
bus.emit('diplomacy:war-declared', {
  attackerId: cp,
  defenderId: targetCivId,
  opponentKind: resolveOpponentKind(targetCivId),
});
```

Import `resolveOpponentKind` at the top of `main.ts`:

```ts
import { resolveOpponentKind } from './systems/diplomacy-system';
```

- [ ] **Step 7: Enrich emit in `src/input/foreign-city-entry-flow.ts`**

Find `bus?.emit('diplomacy:war-declared', ...)` (around line 39):

```ts
// BEFORE:
bus?.emit('diplomacy:war-declared', { attackerId: attackerCivId, defenderId });
// AFTER:
bus?.emit('diplomacy:war-declared', {
  attackerId: attackerCivId,
  defenderId,
  opponentKind: resolveOpponentKind(defenderId),
});
```

Import `resolveOpponentKind` at the top of this file:

```ts
import { resolveOpponentKind } from '../systems/diplomacy-system';
```

- [ ] **Step 8: Enrich emits in `src/ai/basic-ai.ts`**

Find the two `bus.emit('diplomacy:war-declared', ...)` calls and one `bus.emit('city:founded', ...)` call:

```ts
// war-declared (each occurrence, around lines ~301 and ~573):
// BEFORE:
bus.emit('diplomacy:war-declared', { attackerId: ..., defenderId: ... });
// AFTER:
bus.emit('diplomacy:war-declared', {
  attackerId: ...,
  defenderId: ...,
  opponentKind: resolveOpponentKind(defenderId),
});

// city:founded (around line ~338):
// BEFORE:
bus.emit('city:founded', { city: newCity });
// AFTER:
bus.emit('city:founded', { city: newCity, founderId: civId });
```

Import `resolveOpponentKind` at the top of `basic-ai.ts`:

```ts
import { resolveOpponentKind } from './diplomacy-system';
```

- [ ] **Step 9: Verify build passes**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | tail -5
```

Expected: exits 0. If any type error remains, fix it before continuing.

- [ ] **Step 10: Run tests**

```bash
eval "$(mise activate bash)" && yarn test 2>&1 | tail -20
```

Expected: all tests pass. The `city:founded` and `war-declared` payload changes are additive — existing test fixtures that don't include `founderId` or `opponentKind` will need those fields added if your test utilities create those events directly.

- [ ] **Step 11: Commit**

```bash
git add src/core/types.ts src/core/turn-manager.ts src/systems/diplomacy-system.ts \
        src/main.ts src/input/foreign-city-entry-flow.ts src/ai/basic-ai.ts
git commit -m "feat(audio): enrich game events + resolveOpponentKind for MusicDirector"
```

---

## Task 8: MusicDirector + tests

**Files:**
- Create: `src/audio/music-director.ts`
- Create: `tests/audio/music-director.test.ts`

`MusicDirector` translates game events into mixer commands. It owns `intendedSnapshot` (the desired mixer state) and decides when to transition. It never touches the DOM, EventBus, or AudioContext — those belong to `AudioSystem`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/audio/music-director.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicDirector } from '../../src/audio/music-director';
import type { AudioMixer } from '../../src/audio/audio-mixer';

function makeMixer(): AudioMixer {
  return {
    applySnapshot: vi.fn(),
    playOneShot: vi.fn(),
    setMusicEnabled: vi.fn(),
    setSfxEnabled: vi.fn(),
    setMusicVolume: vi.fn(),
    setSfxVolume: vi.fn(),
    connectSfxNode: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AudioMixer;
}

describe('MusicDirector', () => {
  let mixer: AudioMixer;
  let director: MusicDirector;

  beforeEach(() => {
    mixer = makeMixer();
    director = new MusicDirector(mixer);
  });

  // --- handleEraAdvanced ---

  it('transitions to peace snapshot when era advances from silent', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    expect(mixer.applySnapshot).toHaveBeenCalledWith('peace', expect.any(Number));
  });

  it('stays at-war when era advances while at war', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    vi.mocked(mixer.applySnapshot).mockClear();
    director.handleEraAdvanced({ era: 2, civType: 'rome' });
    expect(mixer.applySnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('plays era-transition stinger when era advances', () => {
    director.handleEraAdvanced({ era: 2, civType: 'rome' });
    expect(mixer.playOneShot).toHaveBeenCalledWith(
      expect.stringContaining('stinger'),
      expect.any(Number),
    );
  });

  // --- handleWarDeclared ---

  it('transitions to at-war snapshot on war declared', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    expect(mixer.applySnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('plays war-stinger on war declared', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    expect(mixer.playOneShot).toHaveBeenCalledWith(
      expect.stringContaining('stinger'),
      expect.any(Number),
    );
  });

  it('minor opponent triggers at-war snapshot', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'sparta', opponentKind: 'minor' });
    expect(mixer.applySnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('barbarian opponent triggers at-war snapshot', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'barbarian-1', opponentKind: 'barbarian' });
    expect(mixer.applySnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  // --- handlePeaceSigned ---

  it('transitions to peace when last war ends', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    director.handlePeaceSigned({ remainingWars: 0 });
    expect(mixer.applySnapshot).toHaveBeenLastCalledWith('peace', expect.any(Number));
  });

  it('stays at-war when peace signed but other wars remain', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'a', opponentKind: 'major' });
    director.handleWarDeclared({ aggressor: 'player', defender: 'b', opponentKind: 'major' });
    vi.mocked(mixer.applySnapshot).mockClear();
    director.handlePeaceSigned({ remainingWars: 1 });
    expect(mixer.applySnapshot).not.toHaveBeenCalledWith('peace', expect.any(Number));
  });

  // --- handleCityFounded ---

  it('plays city-founded stinger', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    director.handleCityFounded({ civType: 'rome' });
    expect(mixer.playOneShot).toHaveBeenCalledWith(
      expect.stringContaining('stinger'),
      expect.any(Number),
    );
  });

  it('city-founded stinger does not change snapshot', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    vi.mocked(mixer.applySnapshot).mockClear();
    director.handleCityFounded({ civType: 'rome' });
    expect(mixer.applySnapshot).not.toHaveBeenCalled();
  });

  // --- handlePlayerChanged ---

  it('reloads current music context without changing snapshot', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    vi.mocked(mixer.applySnapshot).mockClear();
    director.handlePlayerChanged({ civType: 'egypt' });
    // Snapshot re-applied to reload the correct accent track for the new civ
    expect(mixer.applySnapshot).toHaveBeenCalledWith('peace', expect.any(Number));
  });

  // --- handleGameEnded ---

  it('transitions to silent on game end', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    director.handleGameEnded({ outcome: 'victory' });
    expect(mixer.applySnapshot).toHaveBeenLastCalledWith('silent', expect.any(Number));
  });

  // --- transition-event regressions ---

  it('regression: war then peace then war returns to at-war (not peace)', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    director.handleWarDeclared({ aggressor: 'player', defender: 'a', opponentKind: 'major' });
    director.handlePeaceSigned({ remainingWars: 0 });
    director.handleWarDeclared({ aggressor: 'player', defender: 'b', opponentKind: 'major' });
    const lastCall = vi.mocked(mixer.applySnapshot).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe('at-war');
  });

  it('regression: overlapping stinger duck resolves correctly', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    // Two stingers fired in succession — second should still duck to stinger-duck
    director.handleWarDeclared({ aggressor: 'p', defender: 'a', opponentKind: 'major' });
    director.handleCityFounded({ civType: 'rome' });
    // After second stinger, snapshot returns to at-war (not peace)
    const snapshotCalls = vi.mocked(mixer.applySnapshot).mock.calls.map(c => c[0]);
    expect(snapshotCalls).toContain('at-war');
    expect(snapshotCalls.at(-1)).not.toBe('peace');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/music-director.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../../src/audio/music-director'`.

- [ ] **Step 3: Implement `src/audio/music-director.ts`**

```ts
// src/audio/music-director.ts
import type { AudioMixer } from './audio-mixer';
import { CATALOG } from './audio-catalog';
import { getFamilyForCiv } from './civ-audio-family';

export type SnapshotId = 'silent' | 'peace' | 'at-war' | 'stinger-duck';

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

export interface PlayerChangedPayload {
  civType: string;
}

export interface GameEndedPayload {
  outcome: 'victory' | 'defeat' | 'tie';
}

const CROSSFADE_S = 2.0;
const STINGER_DUCK_RESUME_DELAY_S = 3.5;

export class MusicDirector {
  private intendedSnapshot: SnapshotId = 'silent';
  private currentEra = 1;
  private currentCivType = 'rome';

  constructor(private readonly mixer: AudioMixer) {}

  handleEraAdvanced(p: EraAdvancedPayload): void {
    this.currentEra = p.era;
    this.currentCivType = p.civType;
    const target = this.intendedSnapshot === 'at-war' ? 'at-war' : 'peace';
    this.intendedSnapshot = target;
    this.mixer.applySnapshot(target, CROSSFADE_S);
    this.playStingerWithDuck(this.resolveStingerPath('eraTransitionCue'));
  }

  handleWarDeclared(p: WarDeclaredPayload): void {
    this.intendedSnapshot = 'at-war';
    this.mixer.applySnapshot('at-war', CROSSFADE_S);
    this.playStingerWithDuck(this.resolveStingerPath('warFanfare'));
  }

  handlePeaceSigned(p: PeaceSignedPayload): void {
    if (p.remainingWars > 0) return;
    this.intendedSnapshot = 'peace';
    this.mixer.applySnapshot('peace', CROSSFADE_S);
  }

  handleCityFounded(p: CityFoundedPayload): void {
    this.playStingerWithDuck(this.resolveStingerPath('cityFounded'));
  }

  handlePlayerChanged(p: PlayerChangedPayload): void {
    this.currentCivType = p.civType;
    this.mixer.applySnapshot(this.intendedSnapshot, CROSSFADE_S);
  }

  handleGameEnded(p: GameEndedPayload): void {
    this.mixer.applySnapshot('silent', 1.5);
  }

  private resolveStingerPath(key: keyof typeof CATALOG.stingers): string {
    return CATALOG.stingers[key].file;
  }

  private playStingerWithDuck(path: string): void {
    this.mixer.applySnapshot('stinger-duck', 0.1);
    this.mixer.playOneShot(path, 1.0);
    // Resume intended snapshot after duck window
    setTimeout(() => {
      this.mixer.applySnapshot(this.intendedSnapshot, 1.0);
    }, STINGER_DUCK_RESUME_DELAY_S * 1000);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
eval "$(mise activate bash)" && yarn test tests/audio/music-director.test.ts 2>&1 | tail -30
```

Expected: all tests pass. If any fail, fix the implementation to match the test expectations — the tests define the contract.

- [ ] **Step 5: Run full test suite + build**

```bash
eval "$(mise activate bash)" && yarn build && yarn test 2>&1 | tail -20
```

Expected: exits 0. Fix any type errors before committing.

- [ ] **Step 6: Commit**

```bash
git add src/audio/music-director.ts tests/audio/music-director.test.ts
git commit -m "feat(audio): add MusicDirector with full event-to-snapshot logic"
```

---

## MR3 verification gate

Before marking MR3 done:

```bash
eval "$(mise activate bash)" && yarn build && yarn test
```

Both must exit 0. Game behavior is unchanged — AudioManager still runs. `MusicDirector` exists but is not wired.
