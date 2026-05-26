import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '@/renderer/camera';
import type { GameMap, VisibilityMap } from '@/core/types';
import { drawHexMap } from '@/renderer/hex-renderer';

vi.mock('@/renderer/wonders/natural-wonder-renderer', () => ({
  drawNaturalWonderLandmark: vi.fn(),
}));

class MockCanvasContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha = 1;

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  arc(): void {}
  closePath(): void {}
  fill(): void {}
  fillText(): void {}
  stroke(): void {}
}

function makeMap(): GameMap {
  return {
    width: 2,
    height: 1,
    wrapsHorizontally: false,
    rivers: [],
    tiles: {
      '0,0': {
        coord: { q: 0, r: 0 },
        terrain: 'grassland',
        elevation: 'flat',
        movementCost: 1,
        owner: 'player',
        improvement: 'none',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      },
      '1,0': {
        coord: { q: 1, r: 0 },
        terrain: 'grassland',
        elevation: 'flat',
        movementCost: 1,
        owner: 'ai-1',
        improvement: 'none',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      },
    },
  } as unknown as GameMap;
}

function makeCamera(): Camera {
  return {
    hexSize: 48,
    zoom: 1,
    isHexVisible: () => true,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  } as unknown as Camera;
}

describe('hex renderer wonder spectacle integration', () => {
  it('passes low zoom state to natural wonder rendering', async () => {
    const { drawNaturalWonderLandmark } = await import('@/renderer/wonders/natural-wonder-renderer');
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeMap();
    map.tiles['0,0'].wonder = 'great_volcano';
    const camera = { ...makeCamera(), zoom: 0.35 };
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'visible' } };

    drawHexMap(ctx, map, camera as Camera, undefined, 'player', visibility);

    expect(drawNaturalWonderLandmark).toHaveBeenCalledWith(expect.objectContaining({
      wonderId: 'great_volcano',
      lowZoom: true,
      presentationKind: 'live',
    }));
  });
});
