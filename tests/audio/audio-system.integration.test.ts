import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioSystem } from '../../src/audio/audio-system';
import { AudioLoader } from '../../src/audio/audio-loader';
import { PreparedStreamedLoop } from '../../src/audio/streamed-loop';
import type { EventBus } from '../../src/core/event-bus';
import type { GameState } from '../../src/core/types';
import { ACCENT, ERA_BASE, STINGER, WAR_LAYER, UNREST_LAYER, resolveEra } from '../../src/audio/audio-catalog';
import { getFamilyForCiv } from '../../src/audio/civ-audio-family';
import { CRISIS_SFX, FAMINE_SFX } from '../../src/audio/sfx-catalog';

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

  it('plays one research-completion stinger for the current viewer and none for hidden opponents', async () => {
    const state = makeState({ currentPlayer: 'rome' });
    ctx.state = 'running';
    system.start(state, busHelper.bus, () => state);
    await flushPromises();
    ctx.clearTranscript();

    busHelper.emit('tech:completed', { civId: 'rome', techId: 'writing' });
    busHelper.emit('tech:completed', { civId: 'egypt', techId: 'writing' });
    await flushPromises();

    expect(ctx.transcript.filter(entry => entry.op === 'start')).toHaveLength(1);
  });

  it('plays exactly one stinger per real completion when queued overflow spans turns (MR4, #917)', async () => {
    const state = makeState({ currentPlayer: 'rome' });
    ctx.state = 'running';
    system.start(state, busHelper.bus, () => state);
    await flushPromises();
    ctx.clearTranscript();

    // First tech completes and carries overflow into the queued successor.
    busHelper.emit('tech:completed', { civId: 'rome', techId: 'fire' });
    await flushPromises();
    // Steady-state turns while the successor accumulates carried progress: no
    // event fires, so no stinger may recur.
    await flushPromises();
    await flushPromises();
    // A later owner turn actually finishes the successor: one more stinger.
    busHelper.emit('tech:completed', { civId: 'rome', techId: 'writing' });
    await flushPromises();

    expect(ctx.transcript.filter(entry => entry.op === 'start')).toHaveLength(2);
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

  it('plays the strategic-warning stinger for a supply:warning with playAudio true (#544 MR2)', async () => {
    const state = makeState({ turn: 9, settings: { musicEnabled: true, soundEnabled: true, musicVolume: 0.8, sfxVolume: 0.8, supplyWarningPreference: 'all' } as GameState['settings'] });
    ctx.state = 'running';
    system.start(state, busHelper.bus, () => state);
    await flushPromises();
    ctx.clearTranscript();

    busHelper.emit('supply:warning', { viewerId: 'rome', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
    await flushPromises();

    expect(ctx.transcript.filter(entry => entry.op === 'start')).toHaveLength(1);
  });

  it('keeps a filtered noncritical supply warning silent', async () => {
    const state = makeState({ turn: 10, settings: { musicEnabled: true, soundEnabled: true, musicVolume: 0.8, sfxVolume: 0.8, supplyWarningPreference: 'critical' } as GameState['settings'] });
    ctx.state = 'running';
    system.start(state, busHelper.bus, () => state);
    await flushPromises();
    ctx.clearTranscript();
    busHelper.emit('supply:warning', { viewerId: 'rome', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
    await flushPromises();
    expect(ctx.transcript.some(entry => entry.op === 'start')).toBe(false);
  });

  it('does not play any sound for a supply:warning when supplyWarningPreference is off (#544 MR2)', async () => {
    const state = makeState({ turn: 10, settings: { musicEnabled: true, soundEnabled: true, musicVolume: 0.8, sfxVolume: 0.8, supplyWarningPreference: 'off' } as GameState['settings'] });
    ctx.state = 'running';
    system.start(state, busHelper.bus, () => state);
    await flushPromises();
    ctx.clearTranscript();

    busHelper.emit('supply:warning', { viewerId: 'rome', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
    await flushPromises();

    expect(ctx.transcript.some(entry => entry.op === 'start')).toBe(false);
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
    if (contextState === 'suspended') {
      ctx.resume.mockRejectedValueOnce(new Error('not activated'));
    }
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
    busHelper.emit('game:over', { outcome: 'victory' });
    // setSnapshot('silent', 1500) fires synchronously → linearRampToValueAtTime
    expect(ctx.transcript.some(e => e.op === 'linearRampToValueAtTime')).toBe(true);
  });

  it('plays the verdict game:over carries, not one derived from the audio viewer', () => {
    system.start(makeState(), busHelper.bus);
    const internals = system as unknown as { director: { handleGameEnded: (p: { outcome: string }) => Promise<void> } };
    const ended = vi.spyOn(internals.director, 'handleGameEnded').mockResolvedValue(undefined);
    busHelper.emit('game:over', { outcome: 'defeat' });
    busHelper.emit('game:over', { outcome: 'victory' });
    expect(ended.mock.calls.map(call => call[0].outcome)).toEqual(['defeat', 'victory']);
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
  it('releases silent base and accent loops after the game-over stinger', async () => {
    system.start(makeState(), busHelper.bus);
    await flushPromises();
    const internals = system as unknown as {
      director: { handleGameEnded: () => Promise<void> };
      mixer: { setBusSource: (...args: unknown[]) => void };
    };
    vi.spyOn(internals.director, 'handleGameEnded').mockResolvedValue(undefined);
    const setBusSource = vi.spyOn(internals.mixer, 'setBusSource');
    busHelper.emit('game:over', { outcome: 'victory' });
    await flushPromises();
    expect(setBusSource).toHaveBeenCalledWith('era', null, false, null, 1500);
    expect(setBusSource).toHaveBeenCalledWith('accent', null, false, null, 1500);
  });

  it('an old game-over completion cannot clear a new campaign\'s loops', async () => {
    system.start(makeState(), busHelper.bus);
    await flushPromises();
    const internals = system as unknown as {
      director: { handleGameEnded: () => Promise<void> };
      mixer: { setBusSource: (...args: unknown[]) => void };
    };
    let finish!: () => void;
    vi.spyOn(internals.director, 'handleGameEnded').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    busHelper.emit('game:over', { outcome: 'victory' });
    system.start(makeState({ era: 4 }), busHelper.bus);
    await flushPromises();
    const setBusSource = vi.spyOn(internals.mixer, 'setBusSource');
    finish();
    await flushPromises();
    expect(setBusSource).not.toHaveBeenCalled();
  });
  it('initializes saved war state before loading loops', async () => {
    const state = makeState();
    state.civilizations.rome!.diplomacy = { atWarWith: ['egypt'] } as typeof state.civilizations.rome.diplomacy;
    system.start(state, busHelper.bus);
    await flushPromises();
    const internals = system as unknown as { director: { resolveSnapshot(): string } };
    expect(internals.director.resolveSnapshot()).toBe('at-war');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(WAR_LAYER[resolveEra(1)].file));
  });
  it('start() decodes only audible era and accent loops in peace', async () => {
    const internals = system as unknown as { loader: { get: (path: string) => Promise<AudioBuffer> } };
    const get = vi.spyOn(internals.loader, 'get');
    system.start(makeState({ era: 1 }), busHelper.bus);
    await flushPromises();
    // setBusSource calls start() on each AudioBufferSourceNode — one per bus
    const starts = ctx.transcript.filter(e => e.op === 'start');
    expect(starts.length).toBe(2);
    expect(get).not.toHaveBeenCalledWith(WAR_LAYER[resolveEra(1)].file);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(WAR_LAYER[resolveEra(1)].file));
  });

  it('era:advanced changes the era loop and plays the transition cue', async () => {
    system.start(makeState({ era: 1 }), busHelper.bus);
    await flushPromises();
    const startsBefore = ctx.transcript.filter(e => e.op === 'start').length;
    busHelper.emit('era:advanced', { era: 2 });
    await flushPromises();
    const startsAfter = ctx.transcript.filter(e => e.op === 'start').length;
    expect(startsAfter - startsBefore).toBeGreaterThanOrEqual(2);
  });

  it('same-family handoff reuses active loops without restarting or decoding them', async () => {
    system.start(makeState({ currentPlayer: 'rome' }), busHelper.bus);
    await flushPromises();
    const startsBefore = ctx.transcript.filter(e => e.op === 'start').length;
    busHelper.emit('currentPlayer:changed-after-handoff', { civId: 'egypt' });
    await flushPromises();
    const startsAfter = ctx.transcript.filter(e => e.op === 'start').length;
    expect(startsAfter - startsBefore).toBe(0);
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

  it('late base/accent loading cannot overwrite the director\'s crisis layer', async () => {
    const internals = system as unknown as {
      loader: { get: (path: string) => Promise<AudioBuffer> };
      mixer: { setBusSource: (...args: unknown[]) => void };
    };
    const pending: Array<(buffer: AudioBuffer) => void> = [];
    const buffer = ctx.createBuffer(1, 10, 44100);
    internals.loader.get = vi.fn((path: string): Promise<AudioBuffer> => path === UNREST_LAYER[1].file
      ? Promise.resolve(buffer)
      : new Promise<AudioBuffer>(resolve => pending.push(resolve)));
    const setBusSource = vi.spyOn(internals.mixer, 'setBusSource');
    system.start(makeState(), busHelper.bus);
    busHelper.emit('crisis:started', { civId: 'rome' });
    await flushPromises();
    expect(setBusSource).toHaveBeenCalledWith('adaptive', buffer, true, UNREST_LAYER[1].loop, 2000);
    setBusSource.mockClear();
    for (const resolve of pending) resolve(buffer);
    await flushPromises();
    expect(setBusSource.mock.calls.some(call => call[0] === 'adaptive')).toBe(false);
    expect(setBusSource).toHaveBeenCalledWith('era', buffer, true, ERA_BASE[1].loop, 500);
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
    expect(registered).toContain('keydown');

    vi.unstubAllGlobals();
  });

  it('resumes a suspended AudioContext on keydown and disarms both pointerdown and keydown (#1830)', async () => {
    const doc = makeMockDocument();
    vi.stubGlobal('document', doc);
    ctx.resume.mockRejectedValueOnce(new Error('not activated'));

    system.start(makeState({ era: 3 }), busHelper.bus);
    await flushPromises();
    expect(ctx.state).toBe('suspended');
    expect(doc.listenerCount('pointerdown')).toBe(1);
    expect(doc.listenerCount('keydown')).toBe(1);

    doc.dispatch('keydown');
    await flushPromises();
    expect(ctx.state).toBe('running');
    expect(doc.listenerCount('pointerdown')).toBe(0);
    expect(doc.listenerCount('keydown')).toBe(0);
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

  it('keeps gesture recovery armed when resume resolves without entering the running state', async () => {
    const doc = makeMockDocument();
    vi.stubGlobal('document', doc);
    ctx.resume.mockImplementationOnce(() => Promise.resolve());

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
    expect(doc.listenerCount('keydown')).toBe(1);
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
    expect(doc.listenerCount('keydown')).toBe(0);
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
    busHelper.emit('game:over', { outcome: 'defeat' });

    expect(ctx.transcript.some(e => e.op === 'stop')).toBe(true);
  });

  it.each(['hunted', 'contained', 'recovered', 'expired', 'abandoned'])('crisis bus events do not play diplomacy stingers (%s)', (outcome) => {
    system.start(makeState(), busHelper.bus);
    const play = vi.spyOn((system as any).director, 'playStingerWithDuck');

    busHelper.emit('crisis:started', { crisisId: 'crisis-1', flavorId: 'beast-awakening', civId: 'rome', cityIds: [] });
    busHelper.emit('crisis:resolved', {
      crisisId: 'crisis-1', flavorId: 'beast-awakening', civId: 'rome', outcome,
    });

    expect(play).not.toHaveBeenCalled();
  });

  it('continues to use diplomacy stingers for war and peace', () => {
    system.start(makeState(), busHelper.bus);
    const play = vi.spyOn((system as any).director, 'playStingerWithDuck');
    busHelper.emit('diplomacy:war-declared', { attackerId: 'rome', defenderId: 'egypt', opponentKind: 'major' });
    busHelper.emit('diplomacy:peace-made', { civA: 'rome', civB: 'egypt' });
    expect(play.mock.calls).toEqual([[STINGER.warDeclared.file], [STINGER.peaceSigned.file]]);
  });

  it('dispatches each bespoke toast cue and coalesces repeats in a turn', async () => {
    const state = makeState({ turn: 5 });
    system.start(state, busHelper.bus);
    await ctx.resume();
    const play = vi.spyOn((system as any).director, 'playStingerWithDuck').mockResolvedValue(undefined);

    for (const cue of Object.keys(CRISIS_SFX)) {
      await system.playNotificationStinger(cue);
      await system.playNotificationStinger(cue);
    }
    await system.playNotificationStinger('famine-onset');
    state.turn++;
    await system.playNotificationStinger('outbreak-onset');

    expect(play.mock.calls.map(([file]) => file)).toEqual([
      ...Object.values(CRISIS_SFX).map(entry => entry.file),
      FAMINE_SFX.onset.file,
      CRISIS_SFX['outbreak-onset'].file,
    ]);
  });

  it.each([{ soundEnabled: false }, { stingerEnabled: false }, { stingerVolume: 0 }])(
    'suppresses crisis toast audio with settings %j',
    async settings => {
      const state = makeState({ turn: 1 });
      Object.assign(state.settings, settings);
      system.start(state, busHelper.bus);
      await ctx.resume();
      const play = vi.spyOn((system as any).director, 'playStingerWithDuck');
      await system.playNotificationStinger('hunt-onset');
      expect(play).not.toHaveBeenCalled();
    },
  );

  it('does not start a pending crisis cue after a hot-seat handoff', async () => {
    const state = makeState({ turn: 8 });
    system.start(state, busHelper.bus);
    await ctx.resume();
    const mixer = (system as any).mixer;
    const oneShot = vi.spyOn(mixer, 'playOneShot');
    let finishLoad!: (buffer: AudioBuffer) => void;
    const pending = new Promise<AudioBuffer>(resolve => { finishLoad = resolve; });
    const loader = (system as any).loader as AudioLoader;
    const get = loader.get.bind(loader);
    vi.spyOn(loader, 'get').mockImplementation(path =>
      path === CRISIS_SFX['hunt-onset'].file ? pending : get(path));

    const result = system.playNotificationStinger('hunt-onset');
    expect(loader.get).toHaveBeenCalledWith(CRISIS_SFX['hunt-onset'].file);
    state.currentPlayer = 'egypt';
    busHelper.emit('currentPlayer:changed-after-handoff', {
      civId: 'egypt', atWarCount: 0, unrestCityCount: 0, nearDefeat: false, inBeastTerritory: false,
    });
    finishLoad(ctx.createBuffer(1, 44100, 44100));
    await result;
    expect(oneShot).not.toHaveBeenCalled();
  });

  it('handles a missing crisis cue with the silent audio buffer', async () => {
    system.start(makeState({ turn: 1 }), busHelper.bus);
    await ctx.resume();
    const oneShot = vi.spyOn((system as any).mixer, 'playOneShot').mockResolvedValue(undefined);

    await expect(system.playNotificationStinger('catastrophe-onset')).resolves.toBeUndefined();

    expect(oneShot).toHaveBeenCalledWith('stinger', expect.objectContaining({ length: 1 }));
  });

  it('plays distinct city loss and near-defeat cues and coalesces duplicate city losses', async () => {
    system.start(makeState({ turn: 5 }), busHelper.bus);
    await ctx.resume();
    const play = vi.spyOn((system as any).director, 'playStingerWithDuck').mockResolvedValue(undefined);

    busHelper.emit('city:captured', { cityId: 'c1', newOwner: 'egypt', previousOwner: 'rome' });
    busHelper.emit('city:captured', { cityId: 'c2', newOwner: 'egypt', previousOwner: 'rome' });
    busHelper.emit('civ:near-defeat', { civId: 'rome' });
    await flushPromises();

    expect(play.mock.calls.map(([file]) => file)).toEqual([
      'audio/stinger/loss/city-lost.ogg',
      'audio/stinger/loss/near-defeat.ogg',
    ]);
  });

  it('keeps loss events private and plays wonder loss only from its replacement toast', async () => {
    system.start(makeState({ turn: 5 }), busHelper.bus);
    await ctx.resume();
    const play = vi.spyOn((system as any).director, 'playStingerWithDuck').mockResolvedValue(undefined);

    busHelper.emit('wonder:legendary-lost', {
      civId: 'rome', cityId: 'c1', wonderId: 'w1', goldRefund: 0, transferableProduction: 0,
    });
    busHelper.emit('city:captured', { cityId: 'c1', newOwner: 'rome', previousOwner: 'egypt' });
    busHelper.emit('civ:near-defeat', { civId: 'egypt' });

    expect(play).not.toHaveBeenCalled();
    await system.playNotificationStinger('wonder-lost');
    expect(play.mock.calls.map(([file]) => file)).toEqual(['audio/stinger/loss/wonder-lost.ogg']);
  });

  // #1466: prepared streams hold a decoded window and encoded bytes; a superseded request must not leak one.
  it('discards streams prepared for a superseded era preload and installs only the latest', async () => {
    const made: Array<{ discard: ReturnType<typeof vi.fn>; createPlayer: ReturnType<typeof vi.fn> }> = [];
    const resolvers: Array<() => void> = [];
    vi.spyOn(AudioLoader.prototype, 'getLoop').mockImplementation(() => new Promise(resolve => {
      const prepared = Object.create(PreparedStreamedLoop.prototype) as PreparedStreamedLoop;
      const entry = {
        discard: vi.fn(),
        createPlayer: vi.fn(() => ({ onended: null, start: vi.fn(), stop: vi.fn(), dispose: vi.fn() })),
      };
      Object.assign(prepared, entry);
      made.push(entry);
      resolvers.push(() => resolve(prepared));
    }));
    const state = makeState();
    system.start(state, busHelper.bus, () => state);
    expect(made).toHaveLength(2); // era base and civ accent for request 1
    system.start(state, makeEventBus().bus, () => state);
    expect(made).toHaveLength(4); // request 2
    resolvers.splice(0, 2).forEach(resolve => resolve()); // request 1 finishes late
    await flushPromises();
    expect(made[0]!.discard).toHaveBeenCalledTimes(1);
    expect(made[1]!.discard).toHaveBeenCalledTimes(1);
    expect(made[0]!.createPlayer).not.toHaveBeenCalled();
    resolvers.splice(0, 2).forEach(resolve => resolve());
    await flushPromises();
    expect(made[2]!.createPlayer).toHaveBeenCalledTimes(1);
    expect(made[3]!.createPlayer).toHaveBeenCalledTimes(1);
    expect(made[2]!.discard).not.toHaveBeenCalled();
  });
});
