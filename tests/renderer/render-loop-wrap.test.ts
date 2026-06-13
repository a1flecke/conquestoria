import { describe, expect, it, vi } from 'vitest';

const rendererMocks = vi.hoisted(() => ({
  drawHexHighlight: vi.fn(),
  drawMinorCivTerritory: vi.fn(),
}));

vi.mock('@/renderer/hex-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hex-renderer')>();
  return {
    ...actual,
    drawHexMap: vi.fn(),
    drawRivers: vi.fn(),
    drawHexHighlight: rendererMocks.drawHexHighlight,
    drawMinorCivTerritory: rendererMocks.drawMinorCivTerritory,
  };
});

vi.mock('@/renderer/fog-renderer', () => ({
  drawFogOfWar: vi.fn(),
}));

vi.mock('@/renderer/city-renderer', () => ({
  drawCities: vi.fn(),
}));

vi.mock('@/renderer/unit-renderer', () => ({
  drawUnits: vi.fn(),
  drawUnitPresentations: vi.fn(),
  drawUnitGlyph: vi.fn(),
}));

import { RenderLoop } from '@/renderer/render-loop';
import type { GameState, Unit } from '@/core/types';

function createCanvas(): HTMLCanvasElement {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  return {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  } as unknown as HTMLCanvasElement;
}

describe('render-loop wrap parity', () => {
  (globalThis as typeof globalThis & { window?: unknown }).window = { devicePixelRatio: 1 } as Window & typeof globalThis;

  it('mirrors movement highlights through the horizontal seam', () => {
    rendererMocks.drawHexHighlight.mockReset();
    const loop = new RenderLoop(createCanvas());
    const state = {
      turn: 1,
      currentPlayer: 'player',
      map: { width: 5, height: 3, wrapsHorizontally: true, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: {},
      civilizations: {
        player: {
          color: '#4a90d9',
          visibility: { tiles: {} },
        },
      },
    } as unknown as GameState;

    loop.setGameState(state);
    loop.setHighlights([{ coord: { q: 0, r: 0 }, type: 'move' }]);
    loop.camera.isHexVisible = (coord) => coord.q === 0 || coord.q === 5;

    (loop as unknown as { render: () => void }).render();

    expect(rendererMocks.drawHexHighlight).toHaveBeenCalledTimes(2);
  });

  it('mirrors minor-civ territory through the horizontal seam', () => {
    rendererMocks.drawMinorCivTerritory.mockReset();
    const loop = new RenderLoop(createCanvas());
    const state = {
      turn: 1,
      currentPlayer: 'player',
      map: { width: 5, height: 3, wrapsHorizontally: true, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {
        'mc-sparta': {
          id: 'mc-sparta',
          cityId: 'city-1',
          definitionId: 'sparta',
          isDestroyed: false,
        },
      },
      cities: {
        'city-1': {
          id: 'city-1',
          position: { q: 0, r: 0 },
        },
      },
      units: {},
      civilizations: {
        player: {
          color: '#4a90d9',
          visibility: { tiles: {} },
        },
      },
    } as unknown as GameState;

    loop.setGameState(state);
    (loop as unknown as { render: () => void }).render();

    expect(rendererMocks.drawMinorCivTerritory).toHaveBeenCalledWith(
      expect.anything(),
      { q: 0, r: 0 },
      expect.any(String),
      expect.anything(),
      5,
      true,
      state.civilizations.player.visibility,
      'player',
      'mc-sparta',
    );
  });

  it('runs movement completion callbacks after the unit leaves the moving set', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const loop = new RenderLoop(createCanvas());
    const unit = {
      id: 'u1',
      owner: 'player',
      type: 'warrior',
      position: { q: 0, r: 0 },
      movementPointsLeft: 1,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    const state = {
      turn: 1,
      currentPlayer: 'player',
      map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { u1: unit },
      civilizations: {
        player: {
          color: '#4a90d9',
          visibility: { tiles: { '1,0': 'visible' } },
        },
      },
    } as unknown as GameState;
    let callbackSawMoving = true;

    loop.setGameState(state);
    loop.camera.isHexVisible = () => true;
    loop.animateUnitMove(unit as Unit, [{ q: 0, r: 0 }, { q: 1, r: 0 }], () => {
      callbackSawMoving = loop.hasMovingUnit('u1');
    });
    nowSpy.mockReturnValue(1000);

    (loop as unknown as { render: () => void }).render();

    expect(callbackSawMoving).toBe(false);
    nowSpy.mockRestore();
  });
});
