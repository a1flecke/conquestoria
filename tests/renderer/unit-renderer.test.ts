import { describe, expect, it, vi } from 'vitest';
import { drawUnits } from '@/renderer/unit-renderer';
import type { GameState, Unit, VisibilityMap } from '@/core/types';
import type { Camera } from '@/renderer/camera';

function createContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  } as unknown as CanvasRenderingContext2D;
}

describe('unit renderer wrap parity', () => {
  it('renders wrapped ghost units at the horizontal seam when only the mirrored copy is on screen', () => {
    const ctx = createContext();
    const units: Record<string, Unit> = {
      'unit-1': {
        id: 'unit-1',
        owner: 'player',
        type: 'warrior',
        position: { q: 0, r: 0 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
    };
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'visible' },
    };
    const state = {
      map: { width: 5, height: 3, wrapsHorizontally: true, tiles: {}, rivers: [] },
    } as unknown as GameState;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: (coord: { q: number; r: number }) => coord.q === 5,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawUnits(ctx, units, camera, visibility, state, 'player', { player: '#4a90d9' });

    expect(ctx.fillText).toHaveBeenCalledWith('⚔️', expect.any(Number), expect.any(Number));
  });
});
