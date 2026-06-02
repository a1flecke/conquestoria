import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SfxDirector } from '../../src/audio/sfx-director';
import { UNIT_SFX, MOVEMENT_SFX } from '../../src/audio/sfx-catalog';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';
import type { EventBus } from '../../src/core/event-bus';
import type { Unit, UnitType, CombatResult } from '../../src/core/types';

// Flush 2 microtask ticks — enough for loader.get().then(playOneShot) chains to resolve
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

  it('unit:move 3-step path schedules 3 movement sounds at 220ms intervals', async () => {
    // 3 steps: totalDuration = min(800, 3×220) = 660ms, interval = 660/3 = 220ms
    // Sounds should fire at: 0ms, 220ms, 440ms
    vi.useFakeTimers();
    try {
      director.start({ u1: makeUnit('u1', 'warrior') }, busHelper.bus);
      busHelper.emit('unit:move', {
        unitId: 'u1',
        from: { q: 0, r: 0 },
        to: { q: 3, r: 0 },
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
      });

      expect(mixer.playOneShot).toHaveBeenCalledTimes(0); // no sounds yet

      await vi.advanceTimersByTimeAsync(0);               // fire delay=0ms timer
      expect(mixer.playOneShot).toHaveBeenCalledTimes(1); // step 1

      await vi.advanceTimersByTimeAsync(220);             // fire delay=220ms timer
      expect(mixer.playOneShot).toHaveBeenCalledTimes(2); // step 2

      await vi.advanceTimersByTimeAsync(220);             // fire delay=440ms timer
      expect(mixer.playOneShot).toHaveBeenCalledTimes(3); // step 3
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

  it('unit:destroyed for spy type plays death sound', async () => {
    director.start({ u1: makeUnit('u1', 'spy_scout') }, busHelper.bus);
    busHelper.emit('unit:destroyed', { unitId: 'u1', position: { q: 0, r: 0 } });
    await tick();

    const deathPath = UNIT_SFX.spy_scout!.death!.file;
    expect(loader.get).toHaveBeenCalledWith(deathPath);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(deathPath));
  });

  it('unit:created mid-game caches type so death sound plays later', async () => {
    // Start with empty snapshot — spy trained after game start
    director.start({}, busHelper.bus);
    busHelper.emit('unit:created', { unit: makeUnit('s1', 'spy_scout') });
    busHelper.emit('unit:destroyed', { unitId: 's1', position: { q: 0, r: 0 } });
    await tick();

    const deathPath = UNIT_SFX.spy_scout!.death!.file;
    expect(loader.get).toHaveBeenCalledWith(deathPath);
    expect(mixer.playOneShot).toHaveBeenCalledWith('sfx', loader.bufferFor(deathPath));
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
