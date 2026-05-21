import { describe, expect, it, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { RenderLoop } from '@/renderer/render-loop';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';

function canvas(): HTMLCanvasElement {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    lineWidth: 0,
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D;

  return {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  } as unknown as HTMLCanvasElement;
}

function state(): GameState {
  return {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: {},
    civilizations: {
      player: {
        color: '#4a90d9',
        visibility: { tiles: { '2,0': 'visible' } },
      },
    },
  } as unknown as GameState;
}

describe('wonder discovery highlight', () => {
  (globalThis as typeof globalThis & { window?: unknown }).window = { devicePixelRatio: 1 } as Window & typeof globalThis;

  it('centers the camera and schedules an animated pulse at the event coordinate', () => {
    const loop = new RenderLoop(canvas());
    loop.setGameState(state());
    const add = vi.spyOn(loop.animations, 'add');
    const center = vi.spyOn(loop.camera, 'centerOn');

    loop.requestWonderDiscoveryHighlight({ q: 2, r: 0 }, getWonderVisualDefinition('great_volcano'), { reducedMotion: false });

    expect(center).toHaveBeenCalledWith({ q: 2, r: 0 });
    expect(add).toHaveBeenCalledWith(
      'wonder-discovery-pulse',
      900,
      expect.objectContaining({ accent: expect.any(String), glow: expect.any(String) }),
    );
  });

  it('uses a static highlight for reduced motion without replacing selection highlights', () => {
    const loop = new RenderLoop(canvas());
    loop.setGameState(state());
    loop.setHighlights([{ coord: { q: 1, r: 0 }, type: 'move' }]);
    const add = vi.spyOn(loop.animations, 'add');

    loop.requestWonderDiscoveryHighlight({ q: 2, r: 0 }, getWonderVisualDefinition('great_volcano'), { reducedMotion: true });

    expect(add).toHaveBeenCalledWith(
      'wonder-discovery-static-highlight',
      900,
      expect.objectContaining({ accent: expect.any(String) }),
    );
    expect((loop as unknown as { highlights: unknown[] }).highlights).toEqual([{ coord: { q: 1, r: 0 }, type: 'move' }]);
  });
});
