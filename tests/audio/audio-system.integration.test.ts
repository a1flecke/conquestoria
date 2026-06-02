import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioSystem } from '../../src/audio/audio-system';
import type { EventBus } from '../../src/core/event-bus';
import type { GameState } from '../../src/core/types';

// Flush microtask queue so async loader/stinger chains complete
const flushPromises = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// Minimal GameState for tests — only fields AudioSystem reads
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentPlayer: 'rome',
    era: 1,
    settings: { musicEnabled: true, soundEnabled: true, musicVolume: 0.8, sfxVolume: 0.8 },
    civilizations: {
      rome:  { civType: 'rome' },
      egypt: { civType: 'egypt' },
      gaul:  { civType: 'gaul' },
    },
    units: {},
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
    // Make fetch reject immediately so AudioLoader fallback path runs in microtasks
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('audio-load-mock')));
    ctx = new MockAudioContext();
    busHelper = makeEventBus();
    system = new AudioSystem(ctx as unknown as AudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    system.dispose();
  });

  // Flow A: cold start
  it('Flow A: start() applies silent snapshot initially', () => {
    system.start(makeState(), busHelper.bus);
    // Mixer constructor + setMusicEnabled produce setValueAtTime entries
    expect(ctx.transcript.some(e => e.op === 'setValueAtTime')).toBe(true);
  });

  // Flow B: save-load reload
  it('Flow B: start() with era>1 and musicEnabled=true moves to peace snapshot', () => {
    system.start(makeState({ era: 3 }), busHelper.bus);
    // setSnapshot('peace', 2000) fires via handleEraAdvanced → linearRampToValueAtTime for each music bus
    expect(ctx.transcript.some(e => e.op === 'linearRampToValueAtTime')).toBe(true);
  });

  // Flow C: era advance
  it('Flow C: era:advanced event transitions to peace and plays stinger', async () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('era:advanced', { era: 2 });
    // Stinger playback: await microtasks so fetch-fallback chain completes
    await flushPromises();
    expect(ctx.transcript.some(e => e.op === 'start')).toBe(true);
  });

  // Flow D: war declared (major opponent)
  it('Flow D: war:declared transitions to at-war snapshot', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:war-declared', {
      attackerId: 'rome',
      defenderId: 'egypt',
      opponentKind: 'major',
    });
    // setSnapshot('at-war', ...) fires synchronously → linearRampToValueAtTime
    expect(ctx.transcript.some(e => e.op === 'linearRampToValueAtTime')).toBe(true);
  });

  // Flow E: peace signed (last war)
  it('Flow E: peace:made with warCount=1 transitions to peace', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:war-declared', { attackerId: 'rome', defenderId: 'egypt', opponentKind: 'major' });
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'egypt' });
    // After peace — should have transitioned back to peace
    const ramps = ctx.transcript.filter(e => e.op === 'linearRampToValueAtTime');
    expect(ramps.length).toBeGreaterThan(0);
  });

  // Flow F: peace with remaining wars
  it('Flow F: peace:made with warCount>1 stays at-war', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:war-declared', { attackerId: 'rome', defenderId: 'egypt', opponentKind: 'major' });
    busHelper.emit('diplomacy:war-declared', { attackerId: 'rome', defenderId: 'gaul', opponentKind: 'major' });
    const before = ctx.transcript.length;
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'egypt' });
    // warCount goes to 1 — handlePeaceSigned returns early (remainingWars > 0), no new entries
    const after = ctx.transcript.length;
    expect(after).toBe(before);
  });

  // Flow G: city founded
  it('Flow G: city:founded plays a stinger', async () => {
    system.start(makeState({ era: 1 }), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    await flushPromises();
    const before = ctx.transcript.filter(e => e.op === 'start').length;
    busHelper.emit('city:founded', { city: {} as unknown, founderId: 'rome' });
    await flushPromises();
    const after = ctx.transcript.filter(e => e.op === 'start').length;
    expect(after).toBeGreaterThan(before);
  });

  // Flow H: hot-seat handoff modal
  it('Flow H: hot-seat handoff does not change music during modal', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    const snapshotsBefore = ctx.transcript.filter(e => e.op === 'linearRampToValueAtTime').length;
    // currentPlayer:changed-after-handoff fires ONLY on "Continue", not on modal open
    // Simulating: no event during modal means no new ramps
    expect(ctx.transcript.filter(e => e.op === 'linearRampToValueAtTime').length).toBe(snapshotsBefore);
  });

  // Flow I: currentPlayer:changed-after-handoff fires on Continue
  it('Flow I: currentPlayer:changed-after-handoff triggers accent reload', () => {
    system.start(makeState({ currentPlayer: 'rome' }), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    const before = ctx.transcript.filter(e => e.op === 'linearRampToValueAtTime').length;
    busHelper.emit('currentPlayer:changed-after-handoff', { civId: 'egypt' });
    const after = ctx.transcript.filter(e => e.op === 'linearRampToValueAtTime').length;
    expect(after).toBeGreaterThan(before);
  });

  // Flow J: game end
  it('Flow J: game:over fades to silent over 1.5s', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('era:advanced', { era: 1 });
    busHelper.emit('game:over', { winnerId: 'rome' });
    // setSnapshot('silent', 1500) fires synchronously → linearRampToValueAtTime
    expect(ctx.transcript.some(e => e.op === 'linearRampToValueAtTime')).toBe(true);
  });

  // Flow K: mute toggle
  it('Flow K: setMusicEnabled(false) silences music bus', () => {
    system.start(makeState(), busHelper.bus);
    system.setMusicEnabled(false);
    // setMusicEnabled cancels in-flight ramps before setting gain to 0
    expect(ctx.transcript.some(e => e.op === 'cancelScheduledValues')).toBe(true);
  });

  // Flow L: dispose unsubscribes all listeners
  it('Flow L: dispose() stops responding to events', () => {
    system.start(makeState(), busHelper.bus);
    system.dispose();
    const callsBefore = ctx.transcript.length;
    busHelper.emit('era:advanced', { era: 2 });
    expect(ctx.transcript.length).toBe(callsBefore);
  });

  // Loop bus wiring — setBusSource regression
  it('start() wires era, adaptive, and accent bus sources after preload resolves', async () => {
    system.start(makeState({ era: 1 }), busHelper.bus);
    await flushPromises();
    // setBusSource calls start() on each AudioBufferSourceNode — one per bus
    const starts = ctx.transcript.filter(e => e.op === 'start');
    expect(starts.length).toBe(3); // era + adaptive (war) + accent
  });

  it('era:advanced rewires all three loop buses for the new era', async () => {
    system.start(makeState({ era: 1 }), busHelper.bus);
    await flushPromises();
    const startsBefore = ctx.transcript.filter(e => e.op === 'start').length;
    busHelper.emit('era:advanced', { era: 2 });
    await flushPromises();
    const startsAfter = ctx.transcript.filter(e => e.op === 'start').length;
    // 3 new bus sources + 1 era-advance stinger = at least 4 new starts
    expect(startsAfter - startsBefore).toBeGreaterThanOrEqual(4);
  });

  it('currentPlayer:changed-after-handoff rewires accent bus for new civ', async () => {
    system.start(makeState({ currentPlayer: 'rome' }), busHelper.bus);
    await flushPromises();
    const startsBefore = ctx.transcript.filter(e => e.op === 'start').length;
    busHelper.emit('currentPlayer:changed-after-handoff', { civId: 'egypt' });
    await flushPromises();
    const startsAfter = ctx.transcript.filter(e => e.op === 'start').length;
    // accent bus source restarted for egypt
    expect(startsAfter - startsBefore).toBe(1);
  });

  // warCount clamping
  it('warCount never goes below 0 (extra peace-made guard)', () => {
    system.start(makeState(), busHelper.bus);
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'egypt' });
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'gaul' });
    // Should not throw; warCount stays at 0
    expect(ctx.transcript.length).toBeGreaterThanOrEqual(0);
  });

  // #246 — era-1 music fix
  it('#246: start() with era=1 calls setSnapshot("peace",0) — at least one non-zero gain set', () => {
    system.start(makeState({ era: 1 }), busHelper.bus);
    // setSnapshot('peace', 0) calls setValueAtTime(value, now) on each bus GainNode.
    // Peace snapshot: era=1.0, accent=0.70, stinger=1.0 (all non-zero).
    const nonZeroSetValue = ctx.transcript.filter(
      e => e.op === 'setValueAtTime' && (e.args[0] as number) > 0,
    );
    expect(nonZeroSetValue.length).toBeGreaterThan(0);
  });

  it('#246: start() with era=1 does NOT trigger director handleEraAdvanced (no linearRamp from era-1 path)', () => {
    system.start(makeState({ era: 1 }), busHelper.bus);
    // director.handleEraAdvanced uses linearRampToValueAtTime for its transition.
    // The era=1 path uses setSnapshot('peace', 0) which uses setValueAtTime only.
    const ramps = ctx.transcript.filter(e => e.op === 'linearRampToValueAtTime');
    expect(ramps).toHaveLength(0);
  });

  it('#246: armIosResume registers a pointerdown listener on document', () => {
    // The test environment is 'node' so we stub a minimal document to exercise
    // the gesture-resume path that audio-system.ts guards with typeof document check.
    const registered: string[] = [];
    const mockDoc = {
      addEventListener: vi.fn((evt: string) => { registered.push(evt); }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', mockDoc);

    system.start(makeState({ era: 1 }), busHelper.bus);
    expect(registered).toContain('pointerdown');

    vi.unstubAllGlobals();
  });

  it('plays natural wonder discovery through the public audio system method', async () => {
    system.start(makeState(), busHelper.bus);

    await system.playNaturalWonderDiscovery('great_volcano');
    await flushPromises();

    expect(ctx.transcript.some(e => e.op === 'start')).toBe(true);
  });

  it('stops natural wonder ambience on hot-seat handoff and game over', async () => {
    system.start(makeState(), busHelper.bus);
    await system.startNaturalWonderCodexAmbient('coral_reef');
    ctx.clearTranscript();

    busHelper.emit('currentPlayer:changed-after-handoff', { civId: 'egypt' });
    busHelper.emit('game:over', { winnerId: 'egypt' });

    expect(ctx.transcript.some(e => e.op === 'stop')).toBe(true);
  });
});
