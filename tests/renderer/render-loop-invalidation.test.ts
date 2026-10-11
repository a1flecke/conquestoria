import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RenderLoop } from '@/renderer/render-loop';
import { notifyCanvasAssetReady } from '@/renderer/canvas-asset-ready';
import type { GameState } from '@/core/types';

function createCanvas(): HTMLCanvasElement {
  const ctx = new Proxy({}, { get: () => vi.fn(), set: () => true });
  return {
    id: 'game-canvas',
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  } as unknown as HTMLCanvasElement;
}

function minimalState(): GameState {
  return {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {}, minorCivs: {}, cities: {}, units: {},
    civilizations: { player: { color: '#4a90d9', visibility: { tiles: {} }, techState: { completed: [] } } },
  } as unknown as GameState;
}

describe('RenderLoop observes its own inputs (#1439)', () => {
  beforeEach(() => { vi.stubGlobal('window', { devicePixelRatio: 1, matchMedia: undefined }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function setup() {
    const loop = new RenderLoop(createCanvas());
    loop.setGameState(minimalState());
    return { loop, gen: () => loop.renderGeneration };
  }

  it.each([
    ['camera pan', (l: RenderLoop) => l.camera.pan(5, 5)],
    ['camera zoom', (l: RenderLoop) => { l.camera.zoom = 2; }],
    ['fling velocity written by the touch handler', (l: RenderLoop) => { l.camera.vx = 4; }],
    ['setGameState', (l: RenderLoop) => l.setGameState(minimalState())],
    ['selected unit', (l: RenderLoop) => l.setSelectedUnitId('u1')],
    ['selected pirate faction', (l: RenderLoop) => l.setSelectedPirateFactionId('f1')],
    ['highlights', (l: RenderLoop) => l.setHighlights([{ coord: { q: 0, r: 0 }, type: 'move' }])],
    ['clearHighlights', (l: RenderLoop) => l.clearHighlights()],
    ['journey path', (l: RenderLoop) => l.setJourneyPath([{ q: 0, r: 0 }, { q: 1, r: 0 }])],
    ['strategic launch preview', (l: RenderLoop) => l.setStrategicLaunchPreview(null)],
    ['air defense overlay toggle', (l: RenderLoop) => { l.toggleAirDefenseOverlay(); }],
    ['supply overlay toggle', (l: RenderLoop) => { l.toggleSupplyOverlay(); }],
    ['resize', (l: RenderLoop) => l.resizeCanvas()],
    ['timed effect', (l: RenderLoop) => l.playEffect('combat-flash', 400, { coord: { q: 1, r: 0 } })],
    ['unit movement', (l: RenderLoop) => l.animateUnitMove(
      { id: 'u', owner: 'player', type: 'warrior', position: { q: 0, r: 0 } } as never,
      [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    )],
  ])('%s invalidates without any caller-side refresh', (_name, mutate) => {
    const { loop, gen } = setup();
    const before = gen();
    mutate(loop);
    expect(gen()).toBeGreaterThan(before);
  });

  it('asset readiness invalidates (coalesced) and stops after dispose', async () => {
    const { loop, gen } = setup();
    const before = gen();
    notifyCanvasAssetReady();
    notifyCanvasAssetReady();
    await Promise.resolve();
    expect(gen()).toBe(before + 1);
    loop.dispose();
    notifyCanvasAssetReady();
    await Promise.resolve();
    expect(gen()).toBe(before + 1);
  });

  it('dispose unsubscribes from the camera', () => {
    const { loop, gen } = setup();
    loop.dispose();
    const before = gen();
    loop.camera.pan(5, 5);
    expect(gen()).toBe(before);
  });

  it('playEffect keeps exact completion callback timing', () => {
    const { loop } = setup();
    const done = vi.fn();
    loop.playEffect('combat-flash', 400, { coord: { q: 1, r: 0 } }, done);
    (loop as unknown as { render: () => void }).render();
    expect(done).not.toHaveBeenCalled();
  });

  it('does not expose a writable effect queue', () => {
    const { loop } = setup();
    expect((loop as unknown as { animations?: unknown }).animations).toBeUndefined();
  });
});
