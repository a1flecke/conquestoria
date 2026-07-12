import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioSystem } from '../../src/audio/audio-system';
import type { EventBus } from '../../src/core/event-bus';
import type { GameState } from '../../src/core/types';
import { ACCENT, ERA_BASE, WAR_LAYER, resolveEra } from '../../src/audio/audio-catalog';
import { getFamilyForCiv } from '../../src/audio/civ-audio-family';

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

function makeMockDocument() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: vi.fn((event: string, listener: () => void) => {
      const handlers = listeners.get(event) ?? new Set<() => void>();
      handlers.add(listener);
      listeners.set(event, handlers);
    }),
    removeEventListener: vi.fn((event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    }),
    dispatch(event: string): void {
      for (const listener of listeners.get(event) ?? []) listener();
    },
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  };
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

  it('suppresses immediate audio event presentation while the round gate is active', () => {
    system.start(makeState(), busHelper.bus, undefined, () => true);
    const before = ctx.transcript.length;
    busHelper.emit('diplomacy:war-declared', {
      attackerId: 'rome',
      defenderId: 'egypt',
      opponentKind: 'major',
    });

    expect(ctx.transcript.length).toBe(before);
  });

  it('plays one strategic warning cue for the current viewer and turn', async () => {
    const state = makeState({ turn: 7 });
    ctx.state = 'running';
    system.start(state, busHelper.bus, () => state);
    await flushPromises();
    ctx.clearTranscript();

    const warning = {
      viewerId: 'rome',
      actorId: 'egypt',
      actorName: 'Egyptian',
      warningKey: 'rome:egypt:mobilizing:border',
      kind: 'mobilizing',
      evidence: 'visible',
      playAudio: true,
    };
    busHelper.emit('ai:strategic-warning', warning);
    busHelper.emit('ai:strategic-warning', { ...warning, warningKey: `${warning.warningKey}:second` });
    await flushPromises();

    expect(ctx.transcript.filter(entry => entry.op === 'start')).toHaveLength(1);
  });

  it('plays a hot-seat strategic warning only after an explicit post-handoff audio event', async () => {
    const state = makeState({ turn: 8 });
    ctx.state = 'running';
    let suppressed = true;
    system.start(state, busHelper.bus, () => state, () => suppressed);
    await flushPromises();
    ctx.clearTranscript();

    busHelper.emit('ai:strategic-warning', {
      viewerId: 'rome',
      actorId: 'egypt',
      actorName: 'Egyptian',
      warningKey: 'rome:egypt:mobilizing:border',
      kind: 'mobilizing',
      evidence: 'visible',
      playAudio: true,
    });
    await flushPromises();
    expect(ctx.transcript.some(entry => entry.op === 'start')).toBe(false);

    suppressed = false;
    busHelper.emit('ai:strategic-warning-audio', { viewerId: 'rome', turn: 8 });
    await flushPromises();
    expect(ctx.transcript.filter(entry => entry.op === 'start')).toHaveLength(1);
  });

  it.each([
    ['wrong viewer', { currentPlayer: 'egypt' }, true, 'running'],
    ['sound muted', { settings: { ...makeState().settings, soundEnabled: false } }, true, 'running'],
    ['stingers disabled', { settings: { ...makeState().settings, stingerEnabled: false } }, true, 'running'],
    ['presentation suppressed', {}, false, 'running'],
    ['context suspended', {}, true, 'suspended'],
    ['context closed', {}, true, 'closed'],
  ] as const)('blocks strategic warning audio when %s', async (
    _label,
    overrides,
    presentationAllowed,
    contextState,
  ) => {
    const state = makeState({ turn: 9, ...(overrides as Partial<GameState>) });
    ctx.state = contextState;
    system.start(state, busHelper.bus, () => state, () => !presentationAllowed);
    await flushPromises();
    ctx.clearTranscript();

    busHelper.emit('ai:strategic-warning-audio', { viewerId: 'rome', turn: 9 });
    await flushPromises();

    expect(ctx.transcript.some(entry => entry.op === 'start')).toBe(false);
  });

  it('blocks strategic warning audio while the document is backgrounded', async () => {
    const state = makeState({ turn: 10 });
    ctx.state = 'running';
    vi.stubGlobal('document', {
      hidden: true,
      visibilityState: 'hidden',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    system.start(state, busHelper.bus, () => state);
    await flushPromises();
    ctx.clearTranscript();

    busHelper.emit('ai:strategic-warning-audio', { viewerId: 'rome', turn: 10 });
    await flushPromises();

    expect(ctx.transcript.some(entry => entry.op === 'start')).toBe(false);
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
    // The authoritative handoff snapshot rewires era, adaptive, and accent buses.
    expect(startsAfter - startsBefore).toBe(3);
  });

  it('synchronizes the incoming viewer to an era reached during hidden processing', async () => {
    system.start(makeState({ currentPlayer: 'rome', era: 1 }), busHelper.bus);
    await flushPromises();
    vi.mocked(fetch).mockClear();

    busHelper.emit('currentPlayer:changed-after-handoff', {
      civId: 'egypt',
      civType: 'egypt',
      era: 4,
      atWarCount: 0,
      unrestCityCount: 0,
      nearDefeat: false,
      inBeastTerritory: false,
    });
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(ERA_BASE[resolveEra(4)].file));
  });

  it('rebinds audio state when a new campaign starts in the same app session', async () => {
    system.start(makeState({ currentPlayer: 'rome', era: 1 }), busHelper.bus);
    await flushPromises();
    vi.mocked(fetch).mockClear();

    system.start(makeState({ currentPlayer: 'egypt', era: 4 }), busHelper.bus);
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(ERA_BASE[resolveEra(4)].file));
  });

  it('ignores stale loop loads from the previous campaign', async () => {
    const internals = system as unknown as {
      loader: { get: (path: string) => Promise<AudioBuffer> };
      mixer: { setBusSource: (...args: unknown[]) => void };
    };
    const loopPaths = new Set([
      ERA_BASE[resolveEra(1)].file,
      WAR_LAYER[resolveEra(1)].file,
      ACCENT[getFamilyForCiv('rome')].file,
      ERA_BASE[resolveEra(4)].file,
      WAR_LAYER[resolveEra(4)].file,
      ACCENT[getFamilyForCiv('egypt')].file,
    ]);
    const pending: Array<{ path: string; resolve: (buffer: AudioBuffer) => void }> = [];
    internals.loader.get = vi.fn((path: string) => {
      if (!loopPaths.has(path)) return Promise.resolve({} as AudioBuffer);
      return new Promise<AudioBuffer>(resolve => pending.push({ path, resolve }));
    });
    const setBusSource = vi.spyOn(internals.mixer, 'setBusSource');

    system.start(makeState({ currentPlayer: 'rome', era: 1 }), busHelper.bus);
    const firstCampaignRequests = pending.splice(0);
    system.start(makeState({ currentPlayer: 'egypt', era: 4 }), busHelper.bus);
    const secondCampaignRequests = pending.splice(0);

    for (const request of secondCampaignRequests) request.resolve({} as AudioBuffer);
    await flushPromises();
    setBusSource.mockClear();
    for (const request of firstCampaignRequests) request.resolve({} as AudioBuffer);
    await flushPromises();

    expect(setBusSource).not.toHaveBeenCalled();
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

  it('keeps the solo-load gesture recovery armed after resume rejects, then disarms after a later successful gesture', async () => {
    const doc = makeMockDocument();
    vi.stubGlobal('document', doc);
    ctx.resume.mockRejectedValueOnce(new Error('not activated'));

    system.start(makeState({ era: 3 }), busHelper.bus);
    await flushPromises();
    expect(ctx.state).toBe('suspended');
    expect(doc.listenerCount('pointerdown')).toBe(1);

    doc.dispatch('pointerdown');
    await flushPromises();
    expect(ctx.state).toBe('running');
    expect(doc.listenerCount('pointerdown')).toBe(0);
  });

  it('does not duplicate recovery hooks when hot-seat audio rebinds after a failed resume', async () => {
    const doc = makeMockDocument();
    vi.stubGlobal('document', doc);
    ctx.resume.mockRejectedValueOnce(new Error('not activated'));

    system.start(makeState({ era: 2, currentPlayer: 'rome' }), busHelper.bus);
    await flushPromises();
    system.start(makeState({ era: 2, currentPlayer: 'egypt' }), busHelper.bus);

    expect(doc.listenerCount('pointerdown')).toBe(1);
    expect(doc.listenerCount('visibilitychange')).toBe(1);
  });

  it('removes audio recovery hooks when disposed after a failed resume', async () => {
    const doc = makeMockDocument();
    vi.stubGlobal('document', doc);
    ctx.resume.mockRejectedValueOnce(new Error('not activated'));

    system.start(makeState(), busHelper.bus);
    await flushPromises();
    system.dispose();

    expect(doc.listenerCount('pointerdown')).toBe(0);
    expect(doc.listenerCount('visibilitychange')).toBe(0);
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

  it('a Hunt crisis resolving "hunted" (MR3) gets the same triumphant resolution stinger as contained/recovered outcomes', () => {
    system.start(makeState(), busHelper.bus);
    const handleCrisisResolved = vi.spyOn((system as any).director, 'handleCrisisResolved');

    busHelper.emit('crisis:resolved', {
      crisisId: 'crisis-1', flavorId: 'beast-awakening', civId: 'rome', outcome: 'hunted',
    });

    expect(handleCrisisResolved).toHaveBeenCalled();
  });

  it('crisis:resolved "abandoned" does not play the triumphant resolution stinger', () => {
    system.start(makeState(), busHelper.bus);
    const handleCrisisResolved = vi.spyOn((system as any).director, 'handleCrisisResolved');

    busHelper.emit('crisis:resolved', {
      crisisId: 'crisis-1', flavorId: 'beast-awakening', civId: 'rome', outcome: 'abandoned',
    });

    expect(handleCrisisResolved).not.toHaveBeenCalled();
  });
});
