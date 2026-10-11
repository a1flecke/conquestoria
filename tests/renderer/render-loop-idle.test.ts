import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const paintProbe = vi.hoisted(() => ({ timeVarying: false }));

vi.mock('@/renderer/hex-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hex-renderer')>();
  const { markTimeVaryingPaint } = await import('@/renderer/paint-clock');
  return {
    ...actual,
    drawHexMap: vi.fn(() => { if (paintProbe.timeVarying) markTimeVaryingPaint(); }),
  };
});

import { RenderLoop } from '@/renderer/render-loop';
import { notifyCanvasAssetReady } from '@/renderer/canvas-asset-ready';
import type { GameState } from '@/core/types';

interface Counting {
  canvas: HTMLCanvasElement;
  calls: Map<string, ReturnType<typeof vi.fn>>;
  paints: () => number;
}

function createCanvas(): Counting {
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  const ctx = new Proxy({}, {
    get: (_t, prop: string) => {
      if (!calls.has(prop)) calls.set(prop, vi.fn());
      return calls.get(prop);
    },
    set: () => true,
  });
  const canvas = {
    id: 'game-canvas',
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  } as unknown as HTMLCanvasElement;
  return { canvas, calls, paints: () => calls.get('clearRect')?.mock.calls.length ?? 0 };
}

function state(): GameState {
  return {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {}, minorCivs: {}, cities: {},
    units: { u1: { id: 'u1', owner: 'player', type: 'warrior', position: { q: 1, r: 0 }, health: 100 } },
    civilizations: {
      player: { color: '#4a90d9', visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } }, techState: { completed: [] } },
    },
  } as unknown as GameState;
}

let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextId = 1;
const g = globalThis as unknown as Record<string, unknown>;

function runFrame(): void {
  const next = frames.shift();
  next?.cb(performance.now());
}

function drain(max = 400): number {
  let n = 0;
  while (frames.length && n < max) { runFrame(); n++; }
  return n;
}

beforeEach(() => {
  paintProbe.timeVarying = false;
  frames = [];
  nextId = 1;
  g.window = { devicePixelRatio: 1 };
  g.requestAnimationFrame = (cb: FrameRequestCallback) => { frames.push({ id: nextId, cb }); return nextId++; };
  g.cancelAnimationFrame = (id: number) => { frames = frames.filter(f => f.id !== id); };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  vi.restoreAllMocks();
});

function makeLoop() {
  const c = createCanvas();
  const loop = new RenderLoop(c.canvas);
  loop.setGameState(state());
  return { loop, ...c };
}

describe('idle-aware render scheduling (#1439)', () => {
  it('paints once on start, then queues no further frames when nothing changes', () => {
    const { loop, paints } = makeLoop();
    loop.start();
    expect(paints()).toBe(1);
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(10_000);
    expect(frames).toHaveLength(0);
    loop.stop();
  });

  it('repaints exactly once per burst of changes, then returns to idle', () => {
    const { loop, paints } = makeLoop();
    loop.start();
    loop.camera.pan(5, 5);
    loop.setSelectedUnitId('u1');
    loop.setHighlights([]);
    expect(frames).toHaveLength(1);
    runFrame();
    expect(paints()).toBe(2);
    expect(frames).toHaveLength(0);
    loop.stop();
  });

  it('keeps an invalidation raised during a paint', () => {
    const { loop, calls } = makeLoop();
    loop.start();
    let fired = false;
    calls.get('fillRect')!.mockImplementation(() => {
      if (!fired) { fired = true; loop.setSelectedUnitId('late'); }
    });
    loop.camera.pan(1, 1);
    runFrame(); // this paint raises another invalidation mid-flight
    expect(frames).toHaveLength(1);
    runFrame();
    expect(frames).toHaveLength(0);
    loop.stop();
  });

  it('runs frames through fling inertia and goes idle once it settles', () => {
    const { loop, paints } = makeLoop();
    loop.start();
    loop.camera.vx = 40;
    const ran = drain();
    expect(ran).toBeGreaterThan(5);
    expect(loop.camera.vx).toBe(0);
    expect(frames).toHaveLength(0);
    expect(paints()).toBeGreaterThan(5);
    loop.stop();
  });

  it('repaints on canvas asset readiness only', async () => {
    const { loop, paints } = makeLoop();
    loop.start();
    notifyCanvasAssetReady();
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    runFrame();
    expect(paints()).toBe(2);
    expect(frames).toHaveLength(0);
    loop.stop();
  });

  it('keeps painting while a visible paint reports time-varying content', () => {
    const { loop, paints } = makeLoop();
    paintProbe.timeVarying = true;
    loop.start();
    expect(frames).toHaveLength(1);
    runFrame(); runFrame(); runFrame();
    expect(paints()).toBe(4);
    expect(frames).toHaveLength(1);
    paintProbe.timeVarying = false;
    runFrame();
    expect(frames).toHaveLength(0);
    loop.stop();
  });

  it('drives a movement to completion with frames, callback exactly once, then idles', () => {
    const { loop } = makeLoop();
    loop.start();
    const done = vi.fn();
    loop.animateUnitMove(state().units.u1!, [{ q: 0, r: 0 }, { q: 1, r: 0 }], done);
    expect(loop.hasMovingUnit('u1')).toBe(true);
    for (let i = 0; i < 40 && frames.length; i++) { vi.advanceTimersByTime(16); runFrame(); }
    expect(done).toHaveBeenCalledTimes(1);
    expect(loop.hasMovingUnit('u1')).toBe(false);
    expect(frames).toHaveLength(0);
    loop.stop();
  });

  it('completes a movement on time even if no animation frame is ever delivered', () => {
    const { loop } = makeLoop();
    loop.start();
    const done = vi.fn();
    loop.animateUnitMove(state().units.u1!, [{ q: 0, r: 0 }, { q: 1, r: 0 }], done);
    frames = []; // hidden tab: the browser never calls back
    vi.advanceTimersByTime(5_000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(loop.hasMovingUnit('u1')).toBe(false);
    loop.stop();
  });

  it('completes a timed effect on time without frames, exactly once', () => {
    const { loop } = makeLoop();
    loop.start();
    const done = vi.fn();
    loop.playEffect('combat-flash', 400, { coord: { q: 1, r: 0 } }, done);
    frames = [];
    vi.advanceTimersByTime(1_000);
    expect(done).toHaveBeenCalledTimes(1);
    drain();
    expect(done).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('wakes a repaint when a combat transient expires, with no state publication', () => {
    const { loop, paints } = makeLoop();
    loop.start();
    loop.applyCombatVisual({
      attackerId: 'u1', defenderId: 'x', attackerSurvived: true, defenderSurvived: true,
    } as never, performance.now());
    drain();
    const before = paints();
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(2_000); // past the attack transient
    expect(frames).toHaveLength(1);
    runFrame();
    expect(paints()).toBe(before + 1);
    expect(frames).toHaveLength(0);
    loop.stop();
  });

  it('stop() cancels frames and timers; invalidation while stopped schedules nothing; start() repaints', () => {
    const { loop, paints } = makeLoop();
    loop.start();
    loop.playEffect('combat-flash', 400, { coord: { q: 1, r: 0 } });
    loop.stop();
    expect(frames).toHaveLength(0);
    loop.camera.pan(1, 1);
    expect(frames).toHaveLength(0);
    vi.advanceTimersByTime(5_000);
    expect(frames).toHaveLength(0);
    const before = paints();
    loop.start();
    expect(paints()).toBe(before + 1);
    loop.stop();
  });

  it('start() is idempotent and a second start paints nothing extra', () => {
    const { loop, paints } = makeLoop();
    loop.start();
    loop.start();
    expect(paints()).toBe(1);
    loop.stop();
  });

  it('repaints when a pinch gesture ends', () => {
    const { loop, paints } = makeLoop();
    let listener: (() => void) | null = null;
    const touch = { isPinching: true, onPinchChange: (l: () => void) => { listener = l; return () => { listener = null; }; } };
    loop.setTouchHandler(touch);
    loop.start();
    drain();
    const before = paints();
    touch.isPinching = false;
    listener!();
    expect(frames).toHaveLength(1);
    runFrame();
    expect(paints()).toBe(before + 1);
    loop.dispose();
    expect(listener).toBeNull();
  });

  it('does not rewrite the DOM sprite overlay on frames kept alive only by an ambient canvas animation', () => {
    const { loop } = makeLoop();
    const sync = vi.fn();
    (loop as unknown as { spriteOverlay: unknown }).spriteOverlay = { sync, getActiveIds: () => new Set<string>() };
    paintProbe.timeVarying = true;
    loop.start();
    runFrame(); runFrame(); runFrame();
    expect(sync).toHaveBeenCalledTimes(1);
    loop.camera.pan(3, 3); // a real input: the overlay must follow
    runFrame();
    expect(sync).toHaveBeenCalledTimes(2);
    paintProbe.timeVarying = false;
    drain();
    loop.stop();
  });

  it('syncs the DOM sprite overlay on every frame of a live movement', () => {
    const { loop } = makeLoop();
    const sync = vi.fn();
    (loop as unknown as { spriteOverlay: unknown }).spriteOverlay = { sync, getActiveIds: () => new Set<string>() };
    loop.start();
    loop.animateUnitMove(state().units.u1!, [{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    const before = sync.mock.calls.length;
    vi.advanceTimersByTime(16); runFrame();
    vi.advanceTimersByTime(16); runFrame();
    expect(sync.mock.calls.length).toBe(before + 2);
    loop.stop();
  });
});
