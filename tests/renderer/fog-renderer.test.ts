import { describe, expect, it, vi } from 'vitest';
import type { GameMap, VisibilityMap } from '@/core/types';
import { drawFogOfWar } from '@/renderer/fog-renderer';
import { Camera } from '@/renderer/camera';
import { hexKey } from '@/systems/hex-utils';

function createWrappedMap(width: number, height: number): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      tiles[hexKey({ q, r })] = {
        coord: { q, r },
        terrain: 'grassland',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }

  return {
    width,
    height,
    wrapsHorizontally: true,
    tiles,
    rivers: [],
  };
}

function createVisibility(map: GameMap): VisibilityMap {
  const visibility: VisibilityMap = { tiles: {} };
  for (const key of Object.keys(map.tiles)) {
    visibility.tiles[key] = 'unexplored';
  }
  return visibility;
}

function createContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('drawFogOfWar', () => {
  it('renders fog overlays for visible wrap ghost tiles at the horizontal edge', () => {
    const map = createWrappedMap(5, 3);
    const visibility = createVisibility(map);
    const ctx = createContext();
    const camera = new Camera();
    camera.setViewport(320, 240);
    camera.centerOn({ q: 5, r: 1 });

    drawFogOfWar(ctx, visibility, map.width, map.height, camera, map.wrapsHorizontally);

    expect(ctx.fill).toHaveBeenCalled();
    expect((ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(6);
  });
});
