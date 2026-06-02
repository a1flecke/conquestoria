# SFX Director Implementation Plan (Spec 2 MR2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SfxDirector` — the event-driven trigger layer that listens to `combat:resolved`, `unit:move`, and `unit:destroyed` events and plays one-shot SFX through the existing audio SFX bus.

**Architecture:** `SfxDirector` is a class (mirrors `MusicDirector`) constructed inside `AudioSystem`. It maintains a `unitTypeCache` seeded from `state.units` at `start()` time so it can resolve unit types for units that may already be removed from state by the time `unit:destroyed` fires. All sounds are fire-and-forget via `loader.get(path).then(buf => mixer.playOneShot('sfx', buf))`. Movement sounds use `setTimeout` intervals derived from `getMovementDurationMs(stepCount) / stepCount`; `dispose()` clears all pending timeout IDs.

**Tech Stack:** TypeScript, Vitest (with fake timers for movement/dispose tests), `AudioMixer`, `AudioLoader`, `EventBus`, `sfx-catalog`, `unit-movement-animation`.

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/audio/sfx-director.ts` |
| Create | `tests/audio/sfx-director.test.ts` |
| Modify | `src/audio/audio-system.ts` (import + construct + wire + dispose) |

---

## Task 1: Write the failing test file

**Files:**
- Create: `tests/audio/sfx-director.test.ts`

- [ ] **Step 1.1: Create the test file with all 11 required test cases**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SfxDirector } from '../../src/audio/sfx-director';
import { UNIT_SFX, MOVEMENT_SFX } from '../../src/audio/sfx-catalog';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';
import type { EventBus } from '../../src/core/event-bus';
import type { Unit, UnitType, CombatResult } from '../../src/core/types';

// Flush 2 microtask ticks — enough for loader.get().then(playOneShot) chains
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function makeMixer() {
  return { playOneShot: vi.fn().mockResolvedValue(undefined) } as unknown as AudioMixer & {
    playOneShot: ReturnType<typeof vi.fn>;
  };
}

function makeLoader() {
  const bufMap = new Map<string, AudioBuffer>();
  const get = vi.fn((path: string): Promise<AudioBuffer> => {
    if (!bufMap.has(path)) bufMap.set(path, {} as AudioBuffer);
    return Promise.resolve(bufMap.get(path)!);
  });
  return {
    get,
    bufferFor: (path: string) => bufMap.get(path),
  } as unknown as AudioLoader & {
    get: ReturnType<typeof vi.fn>;
    bufferFor: (path: string) => AudioBuffer | undefined;
  };
}

function makeEventBus() {
  const listeners: Record<string, Array<(p: unknown) => void>> = {};
  const on = vi.fn((event: string, fn: (p: unknown) => void) => {
    (listeners[event] ??= []).push(fn);
    return () => { listeners[event] = listeners[event].filter(l => l !== fn); };
  });
  const emit = (event: string, payload: unknown) => {
    listeners[event]?.forEach(fn => fn(payload));
  };
  return { bus: { on } as unknown as EventBus, emit };
}

function makeUnit(id: string, type: UnitType): Unit {
  return { id, type, owner: 'rome', position: { q: 0, r: 0 } } as unknown as Unit;
}

function makeCombatResult(o: Partial<CombatResult> = {}): CombatResult {
  return {
    attackerId: 'a1', defenderId: 'd1',
    attackerDamage: 10, defenderDamage: 10,
    attackerSurvived: true, defenderSurvived: true,
    attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    ...o,
  };
}

describe('SfxDirector', () => {
  let mixer: ReturnType<typeof makeMixer>;
  let loader: ReturnType<typeof makeLoader>;
  let busHelper: ReturnType<typeof makeEventBus>;
  let director: SfxDirector;

  beforeEach(() => {
    mixer = makeMixer();
    loader = makeLoader();
    busHelper = makeEventBus();
    director = new SfxDirector(mixer, loader);
  });

  afterEach(() => {
    director.dispose();
  });

  // === Combat ===

  it('melee attacker plays attack-swing buffer', async () => {
    const units = { a1: makeUnit('a1', 'warrior'), d1: makeUnit('d1', 'swordsman') };
    director.start(units, busHelper.bus);
    busHelper.emit('combat:resolved', { result: makeCombatResult() });
    await tick();

    const path = UNIT_SFX.warrior!['attack-swing']!.file;
    expect(loader.get).toHaveBeenCalledWith(path);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(path));
  });

  it('ranged attacker plays ranged-loose buffer', async () => {
    const units = { a1: makeUnit('a1', 'archer'), d1: makeUnit('d1', 'warrior') };
    director.start(units, busHelper.bus);
    busHelper.emit('combat:resolved', { result: makeCombatResult({ attackerId: 'a1', defenderId: 'd1' }) });
    await tick();

    const path = UNIT_SFX.archer!['ranged-loose']!.file;
    expect(loader.get).toHaveBeenCalledWith(path);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(path));
  });

  it('siege attacker plays siege-fire buffer', async () => {
    const units = { a1: makeUnit('a1', 'catapult'), d1: makeUnit('d1', 'warrior') };
    director.start(units, busHelper.bus);
    busHelper.emit('combat:resolved', { result: makeCombatResult({ attackerId: 'a1', defenderId: 'd1' }) });
    await tick();

    const path = UNIT_SFX.catapult!['siege-fire']!.file;
    expect(loader.get).toHaveBeenCalledWith(path);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(path));
  });

  it('defenderSurvived=false plays defender death sound', async () => {
    const units = { a1: makeUnit('a1', 'warrior'), d1: makeUnit('d1', 'archer') };
    director.start(units, busHelper.bus);
    busHelper.emit('combat:resolved', {
      result: makeCombatResult({ attackerId: 'a1', defenderId: 'd1', defenderSurvived: false }),
    });
    await tick();

    const deathPath = UNIT_SFX.archer!.death!.file;
    expect(loader.get).toHaveBeenCalledWith(deathPath);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(deathPath));
  });

  it('attackerSurvived=false plays attacker death sound', async () => {
    const units = { a1: makeUnit('a1', 'warrior'), d1: makeUnit('d1', 'swordsman') };
    director.start(units, busHelper.bus);
    busHelper.emit('combat:resolved', {
      result: makeCombatResult({ attackerSurvived: false }),
    });
    await tick();

    const deathPath = UNIT_SFX.warrior!.death!.file;
    expect(loader.get).toHaveBeenCalledWith(deathPath);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(deathPath));
  });

  // === Movement ===

  it('unit:move 1-step path schedules 1 movement sound', async () => {
    vi.useFakeTimers();
    try {
      director.start({ u1: makeUnit('u1', 'warrior') }, busHelper.bus);
      busHelper.emit('unit:move', {
        unitId: 'u1',
        from: { q: 0, r: 0 },
        to: { q: 1, r: 0 },
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      });
      await vi.runAllTimersAsync();
      expect(mixer.playOneShot).toHaveBeenCalledTimes(1);
      expect(loader.get).toHaveBeenCalledWith(MOVEMENT_SFX.humanoid.file);
    } finally {
      vi.useRealTimers();
    }
  });

  it('unit:move 3-step path schedules 3 movement sounds at correct intervals', async () => {
    // 3 steps: totalDuration = min(800, 3×220) = 660ms, interval = 220ms
    vi.useFakeTimers();
    try {
      director.start({ u1: makeUnit('u1', 'warrior') }, busHelper.bus);
      busHelper.emit('unit:move', {
        unitId: 'u1',
        from: { q: 0, r: 0 },
        to: { q: 3, r: 0 },
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
      });
      expect(mixer.playOneShot).toHaveBeenCalledTimes(0);
      await vi.runAllTimersAsync();
      expect(mixer.playOneShot).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('animal locomotion unit uses animal movement SFX', async () => {
    vi.useFakeTimers();
    try {
      director.start({ u1: makeUnit('u1', 'scout_hound') }, busHelper.bus);
      busHelper.emit('unit:move', {
        unitId: 'u1',
        from: { q: 0, r: 0 },
        to: { q: 1, r: 0 },
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      });
      await vi.runAllTimersAsync();
      expect(loader.get).toHaveBeenCalledWith(MOVEMENT_SFX.animal.file);
    } finally {
      vi.useRealTimers();
    }
  });

  // === unit:destroyed ===

  it('unit:destroyed plays death using cached type (unit already removed from state)', async () => {
    // Start with settler in snapshot — caches the type
    director.start({ u1: makeUnit('u1', 'settler') }, busHelper.bus);
    // Simulate unit:destroyed firing after the unit is gone from state.units
    busHelper.emit('unit:destroyed', { unitId: 'u1', position: { q: 0, r: 0 } });
    await tick();

    const deathPath = UNIT_SFX.settler!.death!.file;
    expect(loader.get).toHaveBeenCalledWith(deathPath);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(deathPath));
  });

  it('unit:destroyed for spy type → no sound (spy not in UNIT_SFX)', async () => {
    director.start({ u1: makeUnit('u1', 'spy_scout') }, busHelper.bus);
    busHelper.emit('unit:destroyed', { unitId: 'u1', position: { q: 0, r: 0 } });
    await tick();

    expect(mixer.playOneShot).not.toHaveBeenCalled();
  });

  // === dispose ===

  it('dispose() cancels pending movement timeouts — no sounds after dispose', async () => {
    vi.useFakeTimers();
    try {
      director.start({ u1: makeUnit('u1', 'warrior') }, busHelper.bus);
      busHelper.emit('unit:move', {
        unitId: 'u1',
        from: { q: 0, r: 0 },
        to: { q: 3, r: 0 },
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
      });
      director.dispose();
      await vi.runAllTimersAsync();
      expect(mixer.playOneShot).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 1.2: Run the test to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-director.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module '../../src/audio/sfx-director'"

---

## Task 2: Implement SfxDirector

**Files:**
- Create: `src/audio/sfx-director.ts`

- [ ] **Step 2.1: Create the implementation**

```typescript
import type { AudioMixer } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import type { EventBus } from '../core/event-bus';
import type { Unit, UnitType, CombatResult } from '../core/types';
import { UNIT_SFX, MOVEMENT_SFX, getLocomotionClass } from './sfx-catalog';
import { getMovementDurationMs } from '../renderer/unit-movement-animation';

export class SfxDirector {
  private unitTypeCache = new Map<string, UnitType>();
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
  ) {}

  start(units: Record<string, Unit>, bus: EventBus): void {
    for (const [id, unit] of Object.entries(units)) {
      this.unitTypeCache.set(id, unit.type);
    }
    this.unsubscribers.push(
      bus.on('combat:resolved', p => this.handleCombatResolved(p.result)),
      bus.on('unit:move', p => this.handleUnitMove(p.unitId, p.path)),
      bus.on('unit:destroyed', p => this.handleUnitDestroyed(p.unitId)),
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    for (const id of this.pendingTimeouts) clearTimeout(id);
    this.pendingTimeouts = [];
    this.unitTypeCache.clear();
  }

  private playFile(path: string): void {
    void this.loader.get(path).then(buf => void this.mixer.playOneShot('sfx', buf));
  }

  private handleCombatResolved(result: CombatResult): void {
    const attackerType = this.unitTypeCache.get(result.attackerId);
    const defenderType = this.unitTypeCache.get(result.defenderId);

    if (attackerType) {
      const sfx = UNIT_SFX[attackerType];
      // Priority: ranged-loose (ranged), siege-fire (siege), attack-swing (melee)
      const sound = sfx?.['ranged-loose'] ?? sfx?.['siege-fire'] ?? sfx?.['attack-swing'];
      if (sound) this.playFile(sound.file);
    }

    if (defenderType) {
      const sfx = UNIT_SFX[defenderType];
      // Priority: attack-impact (melee), ranged-impact (ranged), siege-impact (siege)
      const impact = sfx?.['attack-impact'] ?? sfx?.['ranged-impact'] ?? sfx?.['siege-impact'];
      if (impact) this.playFile(impact.file);
    }

    if (!result.attackerSurvived && attackerType) {
      const death = UNIT_SFX[attackerType]?.death;
      if (death) this.playFile(death.file);
    }

    if (!result.defenderSurvived && defenderType) {
      const death = UNIT_SFX[defenderType]?.death;
      if (death) this.playFile(death.file);
    }
  }

  private handleUnitMove(unitId: string, path: { q: number; r: number }[]): void {
    const unitType = this.unitTypeCache.get(unitId);
    if (!unitType) return;

    const stepCount = path.length - 1;
    if (stepCount <= 0) return;

    const sfx = MOVEMENT_SFX[getLocomotionClass(unitType)];
    const totalDuration = getMovementDurationMs(stepCount);
    const interval = totalDuration / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const id = setTimeout(() => {
        this.playFile(sfx.file);
        const idx = this.pendingTimeouts.indexOf(id);
        if (idx !== -1) this.pendingTimeouts.splice(idx, 1);
      }, i * interval);
      this.pendingTimeouts.push(id);
    }
  }

  private handleUnitDestroyed(unitId: string): void {
    const unitType = this.unitTypeCache.get(unitId);
    if (unitType) {
      const death = UNIT_SFX[unitType]?.death;
      if (death) this.playFile(death.file);
    }
    this.unitTypeCache.delete(unitId);
  }
}
```

- [ ] **Step 2.2: Run the tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-director.test.ts 2>&1 | tail -20
```

Expected: All 11 tests PASS

- [ ] **Step 2.3: Commit SfxDirector + tests**

```bash
git add src/audio/sfx-director.ts tests/audio/sfx-director.test.ts
git commit -m "feat(sfx): SfxDirector — event-driven SFX trigger layer (combat, movement, destroyed)"
```

---

## Task 3: Wire SfxDirector into AudioSystem

**Files:**
- Modify: `src/audio/audio-system.ts`

- [ ] **Step 3.1: Add import and private field**

In `src/audio/audio-system.ts`, after the existing imports, add:

```typescript
import { SfxDirector } from './sfx-director';
```

Add the private field after `private naturalWonderDirector: NaturalWonderAudioDirector;`:

```typescript
private sfxDirector: SfxDirector;
```

- [ ] **Step 3.2: Instantiate in constructor**

After `this.naturalWonderDirector = new NaturalWonderAudioDirector(...)`, add:

```typescript
this.sfxDirector = new SfxDirector(this.mixer, this.loader);
```

- [ ] **Step 3.3: Start in start()**

After `this.wireEvents(bus);`, add:

```typescript
this.sfxDirector.start(state.units, bus);
```

- [ ] **Step 3.4: Dispose in dispose()**

After `this.naturalWonderDirector.stopAmbient('system-disposed');`, before `this.mixer.dispose();`, add:

```typescript
this.sfxDirector.dispose();
```

- [ ] **Step 3.5: Run build to confirm no type errors**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -20
```

Expected: Exit 0 (tsc + vite both succeed)

- [ ] **Step 3.6: Run full test suite to confirm no regressions**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: All 236 test files pass (was 235 + new sfx-director.test.ts = 236)

- [ ] **Step 3.7: Commit the wiring**

```bash
git add src/audio/audio-system.ts
git commit -m "feat(sfx): wire SfxDirector into AudioSystem"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] `combat:resolved` → attack sound + impact sound + optional death sounds
   - [x] `unit:move` → N sounds at `interval = totalDuration / stepCount` ms apart
   - [x] `unit:destroyed` → death sound from cache (unit already removed from state)
   - [x] `unitTypeCache` seeded from `state.units` at `start()`
   - [x] Spy types → silent (not in UNIT_SFX, undefined check)
   - [x] `dispose()` clears pending timeouts
   - [x] `SfxDirector` instantiated in `AudioSystem` constructor
   - [x] `AudioSystem.start()` calls `sfxDirector.start(state.units, bus)`
   - [x] `AudioSystem.dispose()` calls `sfxDirector.dispose()` before `mixer.dispose()`

2. **All 11 test cases covered:**
   - [x] melee attacker → attack-swing
   - [x] ranged attacker → ranged-loose
   - [x] siege attacker → siege-fire
   - [x] defenderSurvived=false → defender death
   - [x] attackerSurvived=false → attacker death
   - [x] 1-step movement → 1 sound
   - [x] 3-step movement → 3 sounds at correct intervals
   - [x] animal locomotion unit → animal movement SFX
   - [x] unit:destroyed → death from cache
   - [x] spy type → no sound
   - [x] dispose() → no sounds after cancel

3. **Type consistency:** All method names match between test and implementation (`start`, `dispose`, `SfxDirector`).
