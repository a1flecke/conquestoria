import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const rendererMocks = vi.hoisted(() => ({
  drawHexMap: vi.fn(),
  drawRivers: vi.fn(),
  drawHexHighlight: vi.fn(),
  drawMinorCivTerritory: vi.fn(),
  drawUnitGlyph: vi.fn(),
  drawPirateHeadquarters: vi.fn(),
  drawStrategicLaunchPreviewOverlay: vi.fn(),
  drawSupplyOverlay: vi.fn(),
  drawAirDefenseOverlay: vi.fn(),
}));

vi.mock('@/renderer/hex-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hex-renderer')>();
  return {
    ...actual,
    drawHexMap: rendererMocks.drawHexMap,
    drawRivers: rendererMocks.drawRivers,
    drawHexHighlight: rendererMocks.drawHexHighlight,
    drawMinorCivTerritory: rendererMocks.drawMinorCivTerritory,
  };
});

vi.mock('@/renderer/fog-renderer', () => ({ drawFogOfWar: vi.fn() }));

vi.mock('@/renderer/city-renderer', () => ({ drawCities: vi.fn() }));

vi.mock('@/renderer/unit-renderer', () => ({
  drawUnits: vi.fn(),
  drawUnitPresentations: vi.fn(),
  drawUnitGlyph: rendererMocks.drawUnitGlyph,
}));

vi.mock('@/renderer/pirate-headquarters-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pirate-headquarters-presentation')>();
  return {
    ...actual,
    drawPirateHeadquartersMapPresentation: rendererMocks.drawPirateHeadquarters,
  };
});

vi.mock('@/renderer/strategic-launch-overlay-renderer', () => ({
  drawStrategicLaunchPreviewOverlay: rendererMocks.drawStrategicLaunchPreviewOverlay,
}));

vi.mock('@/renderer/supply-overlay-renderer', () => ({
  drawSupplyOverlay: rendererMocks.drawSupplyOverlay,
}));

vi.mock('@/renderer/air-defense-overlay', () => ({
  drawAirDefenseOverlay: rendererMocks.drawAirDefenseOverlay,
}));

import { RenderLoop } from '@/renderer/render-loop';
import { AnimationSystem } from '@/renderer/animation-system';
import { spriteCache } from '@/renderer/sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from '@/renderer/sprites/sprite-system';
import { drawCities } from '@/renderer/city-renderer';
import type { GameState, Unit } from '@/core/types';

function createCanvas(rect = { width: 320, height: 240 }): HTMLCanvasElement {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  };
  return {
    id: 'game-canvas',
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => rect,
  } as unknown as HTMLCanvasElement;
}

function minimalState(overrides: Record<string, unknown> = {}): GameState {
  return {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: {},
    civilizations: {
      player: { color: '#4a90d9', visibility: { tiles: { '1,0': 'visible' } } },
    },
    ...overrides,
  } as unknown as GameState;
}

function renderOnce(loop: RenderLoop): void {
  (loop as unknown as { render: () => void }).render();
}

interface ScheduledFrame { id: number; callback: FrameRequestCallback }
let scheduledFrames: ScheduledFrame[] = [];
let nextFrameId = 1;
let rafSpy: ReturnType<typeof vi.fn>;
let cafSpy: ReturnType<typeof vi.fn>;
interface RenderLoopGlobals {
  window?: unknown;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
}
const globals = globalThis as unknown as RenderLoopGlobals;

beforeEach(() => {
  // The hoisted renderer mocks are module-level; every test starts from a
  // clean call history so call counts describe one scenario.
  Object.values(rendererMocks).forEach(mock => mock.mockReset());
  globals.window = { devicePixelRatio: 1 } as Window & typeof globalThis;
  scheduledFrames = [];
  nextFrameId = 1;
  rafSpy = vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    scheduledFrames.push({ id, callback });
    return id;
  });
  cafSpy = vi.fn((id: number) => {
    scheduledFrames = scheduledFrames.filter(frame => frame.id !== id);
  });
  globals.requestAnimationFrame = rafSpy as unknown as (callback: FrameRequestCallback) => number;
  globals.cancelAnimationFrame = cafSpy as unknown as (handle: number) => void;
});

afterEach(() => {
  delete globals.requestAnimationFrame;
  delete globals.cancelAnimationFrame;
  vi.restoreAllMocks();
});

/** Deliver the next queued animation frame the way the browser would. */
function runNextFrame(): void {
  const next = scheduledFrames.shift();
  next?.callback(performance.now());
}

describe('render-loop lifecycle (#1439 characterization)', () => {
  it('start() paints the first frame immediately, goes idle, and repaints on the next invalidation', () => {
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());

    loop.start();

    expect(rendererMocks.drawHexMap).toHaveBeenCalledTimes(1);
    expect(rafSpy).not.toHaveBeenCalled(); // nothing is changing: no perpetual frame chain
    expect(scheduledFrames).toHaveLength(0);

    loop.setSelectedUnitId('u1');
    expect(scheduledFrames).toHaveLength(1);
    runNextFrame();

    expect(rendererMocks.drawHexMap).toHaveBeenCalledTimes(2);
    expect(scheduledFrames).toHaveLength(0);

    loop.stop();
  });

  it('start() is idempotent while the loop is already running', () => {
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());

    loop.start();
    loop.start();

    expect(rendererMocks.drawHexMap).toHaveBeenCalledTimes(1);
    expect(scheduledFrames).toHaveLength(0);

    loop.stop();
  });

  it('stop() cancels the pending frame so a queued callback paints nothing', () => {
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());

    loop.start();
    loop.setSelectedUnitId('u1');
    expect(scheduledFrames).toHaveLength(1);
    loop.stop();

    expect(cafSpy).toHaveBeenCalledTimes(1);
    expect(scheduledFrames).toHaveLength(0);

    runNextFrame(); // a frame delivered after stop() must be inert
    expect(rendererMocks.drawHexMap).toHaveBeenCalledTimes(1);
  });

  it('applies camera inertia before each scheduled paint', () => {
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    loop.camera.vx = 500;
    loop.camera.vy = 0;
    const startX = loop.camera.x;

    loop.start();

    // tick() orders applyInertia() before render(): one fling frame moves the
    // camera before the paint, so inertia needs its own continuation logic in
    // any future frame-skipping scheduler.
    expect(loop.camera.x).toBe(startX - 500);
    expect(rendererMocks.drawHexMap).toHaveBeenCalledTimes(1);

    runNextFrame();
    // friction 0.9 keeps moving while |vx| > 0.1
    expect(loop.camera.x).toBeLessThan(startX - 500);

    loop.stop();
  });

  it('resume after stop() schedules a fresh frame', () => {
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());

    loop.start();
    loop.stop();
    loop.start();

    expect(rendererMocks.drawHexMap).toHaveBeenCalledTimes(2); // resume paints immediately
    loop.setSelectedUnitId('u1');
    expect(scheduledFrames).toHaveLength(1);

    loop.stop();
  });
});

describe('render-loop state publication (#1439 characterization)', () => {
  it('renders from the latest published state after setGameState', () => {
    const loop = new RenderLoop(createCanvas());
    const first = minimalState();
    loop.setGameState(first);
    renderOnce(loop);

    // drawHexMap(ctx, map, camera, villagePositions, beastLairGlyphs, viewerId,
    // viewerVisibility, viewerTechs, suppressedCoords, turn, completedTechsByCiv)
    expect(rendererMocks.drawHexMap).toHaveBeenLastCalledWith(
      expect.anything(),
      first.map,
      expect.anything(),
      expect.anything(),
      undefined, // no beasts in this fixture state
      'player',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      first.turn,
      expect.anything(),
    );

    const second = minimalState({ turn: 42 });
    loop.setGameState(second);
    renderOnce(loop);

    expect(rendererMocks.drawHexMap).toHaveBeenLastCalledWith(
      expect.anything(),
      second.map,
      expect.anything(),
      expect.anything(),
      undefined, // no beasts in this fixture state
      'player',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      42,
      expect.anything(),
    );
  });

  it('resizeCanvas propagates the new viewport into the camera and resets the DPR transform', () => {
    const canvas = createCanvas({ width: 800, height: 600 });
    const loop = new RenderLoop(canvas);
    const ctx = canvas.getContext('2d') as unknown as { setTransform: ReturnType<typeof vi.fn> };

    loop.resizeCanvas();

    expect(loop.camera.width).toBe(800);
    expect(loop.camera.height).toBe(600);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
  });
});

describe('render-loop presentation setters (#1439 characterization)', () => {
  it('draws the strategic-launch preview overlay only while a preview is set', () => {
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());

    renderOnce(loop);
    expect(rendererMocks.drawStrategicLaunchPreviewOverlay).not.toHaveBeenCalled();

    loop.setStrategicLaunchPreview({} as unknown as Parameters<RenderLoop['setStrategicLaunchPreview']>[0]);
    renderOnce(loop);
    expect(rendererMocks.drawStrategicLaunchPreviewOverlay).toHaveBeenCalledTimes(1);

    loop.setStrategicLaunchPreview(null);
    renderOnce(loop);
    expect(rendererMocks.drawStrategicLaunchPreviewOverlay).toHaveBeenCalledTimes(1);
  });

  it('suppresses the disembark flash when the viewer prefers reduced motion', () => {
    (globals.window as { matchMedia?: unknown }).matchMedia = (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    });
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    const add = vi.spyOn(AnimationSystem.prototype, 'add');

    loop.animateUnitAppear({ q: 1, r: 0 });

    expect(add).not.toHaveBeenCalled();
  });

  it('schedules the disembark flash when motion is allowed', () => {
    (globals.window as { matchMedia?: unknown }).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    });
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    const add = vi.spyOn(AnimationSystem.prototype, 'add');

    loop.animateUnitAppear({ q: 1, r: 0 });

    expect(add).toHaveBeenCalledWith('disembark-flash', 500, { coord: { q: 1, r: 0 } }, undefined);
  });
});

describe('render-loop animation completion (#1439 characterization)', () => {
  it('fires a timed effect callback exactly once after its duration elapses', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    loop.camera.isHexVisible = () => true;
    const onComplete = vi.fn();

    loop.playEffect('combat-flash', 400, { coord: { q: 1, r: 0 } }, onComplete);

    nowSpy.mockReturnValue(1_400); // exactly past the 400ms effect
    renderOnce(loop);
    expect(onComplete).toHaveBeenCalledTimes(1);

    renderOnce(loop);
    expect(onComplete).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('does not fire a timed effect callback before its duration elapses', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    loop.camera.isHexVisible = () => true;
    const onComplete = vi.fn();

    loop.playEffect('combat-flash', 400, { coord: { q: 1, r: 0 } }, onComplete);

    nowSpy.mockReturnValue(1_300); // 300ms into a 400ms effect
    renderOnce(loop);

    expect(onComplete).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('fires a movement completion callback exactly once across repeated renders', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const loop = new RenderLoop(createCanvas());
    const unit = {
      id: 'u1', owner: 'player', type: 'warrior', position: { q: 0, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false,
      hasActed: false, isResting: false,
    } as Unit;
    loop.setGameState(minimalState({ units: { u1: unit } }));
    loop.camera.isHexVisible = () => true;
    const onComplete = vi.fn();

    loop.animateUnitMove(unit, [{ q: 0, r: 0 }, { q: 1, r: 0 }], onComplete);

    nowSpy.mockReturnValue(1_000); // past the 220ms slide
    renderOnce(loop);
    renderOnce(loop);
    renderOnce(loop);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(loop.hasMovingUnit('u1')).toBe(false);
    nowSpy.mockRestore();
  });

  it('fires a movement callback synchronously when no state is published yet', () => {
    const loop = new RenderLoop(createCanvas());
    const unit = {
      id: 'u1', owner: 'player', type: 'warrior', position: { q: 0, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false,
      hasActed: false, isResting: false,
    } as Unit;
    const onComplete = vi.fn();

    loop.animateUnitMove(unit, [{ q: 0, r: 0 }, { q: 1, r: 0 }], onComplete);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(loop.hasMovingUnit('u1')).toBe(false);
  });

  it('passes a cached motion sprite to the glyph draw, or null while the cache is empty', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const loop = new RenderLoop(createCanvas());
    const unit = {
      id: 'u1', owner: 'player', type: 'warrior', position: { q: 0, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false,
      hasActed: false, isResting: false,
    } as Unit;
    loop.setGameState(minimalState({ units: { u1: unit } }));
    loop.camera.isHexVisible = () => true;
    loop.camera.zoom = LOD_SPRITE_ZOOM_THRESHOLD + 0.1;

    const missingSprite = vi.spyOn(spriteCache, 'getUnitMotion').mockReturnValue(null);
    loop.animateUnitMove(unit, [{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    nowSpy.mockReturnValue(100);
    renderOnce(loop);

    expect(rendererMocks.drawUnitGlyph).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.anything(),
      expect.objectContaining({ useSprites: true, spriteOverride: null }),
    );

    // Once the async sprite cache has an image for the motion frame, the very
    // same draw path must pick it up -- today this only works because the loop
    // repaints unconditionally every frame (issue #1439).
    const cachedSprite = {} as HTMLImageElement;
    missingSprite.mockReturnValue(cachedSprite);
    loop.animateUnitMove(unit, [{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    nowSpy.mockReturnValue(100);
    renderOnce(loop);

    expect(rendererMocks.drawUnitGlyph).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.anything(),
      expect.objectContaining({ useSprites: true, spriteOverride: cachedSprite }),
    );
    missingSprite.mockRestore();
    nowSpy.mockRestore();
  });
});

type ChangeListener = () => void;

interface MediaQueryEntry {
  query: string;
  listeners: Set<ChangeListener>;
}

/**
 * A minimal window.matchMedia double. `matches` is remembered per query string, so a fresh
 * `matchMedia(query)` call (how the renderer reads the live preference) sees the value a test set.
 */
function createMediaQueryController(api: 'modern' | 'legacy' = 'modern') {
  const matchesByQuery = new Map<string, boolean>();
  const entries: MediaQueryEntry[] = [];
  const matchMedia = vi.fn((query: string) => {
    if (!matchesByQuery.has(query)) matchesByQuery.set(query, false);
    const entry: MediaQueryEntry = { query, listeners: new Set<ChangeListener>() };
    entries.push(entry);
    const mql: Record<string, unknown> = {
      media: query,
      get matches() { return matchesByQuery.get(query) ?? false; },
      dispatchEvent: () => false,
      onchange: null,
    };
    if (api === 'modern') {
      mql.addEventListener = (type: string, listener: ChangeListener) => {
        if (type === 'change') entry.listeners.add(listener);
      };
      mql.removeEventListener = (type: string, listener: ChangeListener) => {
        if (type === 'change') entry.listeners.delete(listener);
      };
    } else {
      mql.addListener = (listener: ChangeListener) => entry.listeners.add(listener);
      mql.removeListener = (listener: ChangeListener) => entry.listeners.delete(listener);
    }
    return mql;
  });
  const matching = (text: string) => entries.filter(entry => entry.query.includes(text));
  return {
    matchMedia,
    setMatches(text: string, value: boolean) {
      for (const query of matchesByQuery.keys()) if (query.includes(text)) matchesByQuery.set(query, value);
    },
    listenerCount(text: string): number {
      return matching(text).reduce((count, entry) => count + entry.listeners.size, 0);
    },
    emit(text: string): void {
      for (const entry of matching(text)) for (const listener of [...entry.listeners]) listener();
    },
  };
}

/** A synchronous ResizeObserver double; `disconnect()` makes later `emit()` a no-op like the real one. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets: unknown[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: unknown): void { this.targets.push(target); }
  unobserve(): void {}
  disconnect(): void { this.disconnected = true; }
  emit(): void { if (!this.disconnected) this.callback([], this as unknown as ResizeObserver); }
}

describe('render-loop runtime observers (#1439)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).ResizeObserver;
    FakeResizeObserver.instances = [];
  });

  it('wakes an idle renderer for one bounded repaint when reduced motion flips', () => {
    const media = createMediaQueryController();
    (globals.window as { matchMedia?: unknown }).matchMedia = media.matchMedia;
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    loop.start();
    expect(scheduledFrames).toHaveLength(0); // idle: nothing is changing

    media.setMatches('prefers-reduced-motion', true);
    media.emit('prefers-reduced-motion');

    expect(scheduledFrames).toHaveLength(1); // exactly one wake, not a loop
    runNextFrame();
    expect(scheduledFrames).toHaveLength(0); // and it goes idle again
    expect(vi.mocked(drawCities)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'player',
      expect.objectContaining({ reducedMotion: true }),
    );
    loop.stop();
  });

  it('subscribes to reduced motion with exactly one callback on the modern API', () => {
    const media = createMediaQueryController('modern');
    (globals.window as { matchMedia?: unknown }).matchMedia = media.matchMedia;
    const loop = new RenderLoop(createCanvas());

    expect(media.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(media.listenerCount('prefers-reduced-motion')).toBe(1);

    loop.start();
    loop.start(); // restarting must not add a second subscription
    expect(media.listenerCount('prefers-reduced-motion')).toBe(1);
    loop.stop();
  });

  it('falls back to the legacy addListener API when addEventListener is absent', () => {
    const media = createMediaQueryController('legacy');
    (globals.window as { matchMedia?: unknown }).matchMedia = media.matchMedia;
    const loop = new RenderLoop(createCanvas());

    expect(media.listenerCount('prefers-reduced-motion')).toBe(1);
    loop.dispose();
    expect(media.listenerCount('prefers-reduced-motion')).toBe(0);
  });

  it('observes canvas size changes that never fire a window resize event', () => {
    (globalThis as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
    const rect = { width: 320, height: 240 };
    const canvas = createCanvas(rect);
    const loop = new RenderLoop(canvas);
    loop.setGameState(minimalState());
    loop.start();
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0]!.targets).toContain(canvas);

    rect.height = 400;
    FakeResizeObserver.instances[0]!.emit();

    expect(scheduledFrames).toHaveLength(1);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(400);
    runNextFrame();
    expect(scheduledFrames).toHaveLength(0);
    loop.stop();
  });

  it('falls back to a window resize listener when ResizeObserver is unavailable', () => {
    delete (globalThis as Record<string, unknown>).ResizeObserver;
    const rect = { width: 320, height: 240 };
    const resizeListeners: ChangeListener[] = [];
    (globals.window as { addEventListener?: unknown }).addEventListener = (_type: string, listener: ChangeListener) => {
      resizeListeners.push(listener);
    };
    (globals.window as { removeEventListener?: unknown }).removeEventListener = vi.fn();
    const canvas = createCanvas(rect);
    const loop = new RenderLoop(canvas);
    loop.setGameState(minimalState());
    loop.start();
    expect(resizeListeners).toHaveLength(1);

    rect.width = 500;
    resizeListeners[0]!();
    expect(scheduledFrames).toHaveLength(1);
    expect(canvas.width).toBe(500);
    loop.stop();
  });

  it('does not repaint for repeated canvas-size notifications with unchanged dimensions', () => {
    (globalThis as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
    const loop = new RenderLoop(createCanvas({ width: 320, height: 240 }));
    loop.setGameState(minimalState());
    loop.start();
    const before = loop.renderGeneration;

    FakeResizeObserver.instances[0]!.emit();
    FakeResizeObserver.instances[0]!.emit();

    expect(loop.renderGeneration).toBe(before);
    expect(scheduledFrames).toHaveLength(0);
    loop.stop();
  });

  it('keeps the backing store and transform aligned across a 1 -> 2 -> 1 DPR change', () => {
    const canvas = createCanvas({ width: 320, height: 240 });
    const loop = new RenderLoop(canvas);
    const ctx = canvas.getContext('2d') as unknown as {
      setTransform: ReturnType<typeof vi.fn>;
      scale: ReturnType<typeof vi.fn>;
    };

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);

    (globals.window as { devicePixelRatio: number }).devicePixelRatio = 2;
    loop.resizeCanvas();
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);

    (globals.window as { devicePixelRatio: number }).devicePixelRatio = 1;
    loop.resizeCanvas();
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
    expect(ctx.scale).not.toHaveBeenCalled(); // never compounds the scale
    loop.stop();
  });

  it('re-arms the DPR media query so a density change repaints with the new backing store', () => {
    const media = createMediaQueryController();
    (globals.window as { matchMedia?: unknown }).matchMedia = media.matchMedia;
    const canvas = createCanvas({ width: 320, height: 240 });
    const loop = new RenderLoop(canvas);
    expect(media.matchMedia).toHaveBeenCalledWith('(resolution: 1dppx)');
    loop.setGameState(minimalState());
    loop.start();
    expect(scheduledFrames).toHaveLength(0);

    (globals.window as { devicePixelRatio: number }).devicePixelRatio = 2;
    media.emit('resolution: 1dppx');

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(media.matchMedia).toHaveBeenCalledWith('(resolution: 2dppx)');
    expect(media.listenerCount('resolution: 1dppx')).toBe(0); // the stale query is released
    expect(media.listenerCount('resolution: 2dppx')).toBe(1);
    expect(scheduledFrames).toHaveLength(1);
    loop.stop();
  });

  it('disposes every runtime observer so leftovers cannot redraw a disposed renderer', () => {
    const media = createMediaQueryController();
    (globals.window as { matchMedia?: unknown }).matchMedia = media.matchMedia;
    (globalThis as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
    const rect = { width: 320, height: 240 };
    const loop = new RenderLoop(createCanvas(rect));
    loop.setGameState(minimalState());
    loop.start();
    const before = loop.renderGeneration;

    loop.dispose();

    expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true);
    expect(media.listenerCount('prefers-reduced-motion')).toBe(0);

    media.emit('prefers-reduced-motion');
    rect.width = 640;
    FakeResizeObserver.instances[0]!.emit();

    expect(loop.renderGeneration).toBe(before);
    expect(scheduledFrames).toHaveLength(0);
  });

  it('does not attach a second set of observers when the loop restarts', () => {
    const media = createMediaQueryController();
    (globals.window as { matchMedia?: unknown }).matchMedia = media.matchMedia;
    (globalThis as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    loop.start();
    loop.stop();
    loop.start();

    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(media.listenerCount('prefers-reduced-motion')).toBe(1);
    loop.stop();
  });
});
