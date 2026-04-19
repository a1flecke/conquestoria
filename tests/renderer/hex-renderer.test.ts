import { describe, expect, it } from 'vitest';
import type { Camera } from '@/renderer/camera';
import { drawHexMap, drawMinorCivTerritory } from '@/renderer/hex-renderer';
import type { GameMap, VisibilityMap } from '@/core/types';

class MockCanvasContext {
  strokeCalls: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha = 1;
  shadowColor = '';
  shadowBlur = 0;

  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  fill(): void {}
  fillText(): void {}
  stroke(): void {
    this.strokeCalls.push(this.strokeStyle);
  }
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
      },
      '1,0': {
        coord: { q: 1, r: 0 },
        terrain: 'grassland',
        elevation: 'flat',
        movementCost: 1,
        owner: 'ai-1',
        improvement: 'none',
        improvementTurnsLeft: 0,
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

describe('hex renderer privacy', () => {
  it('draws foreign ownership borders on visible tiles', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'visible' } };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).toContain('rgba(217,74,74,0.5)');
  });

  it('does not draw foreign ownership borders on fogged tiles', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'fog' } };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).not.toContain('rgba(217,74,74,0.5)');
  });

  it('keeps player ownership borders on fogged tiles', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'fog', '1,0': 'unexplored' } };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).toContain('rgba(74,144,217,0.5)');
  });

  it('draws only visible minor-civ territory hexes', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = {
      tiles: {
        '0,0': 'visible',
        '1,0': 'visible',
        '-1,0': 'fog',
        '0,1': 'fog',
        '0,-1': 'unexplored',
      },
    };

    drawMinorCivTerritory(
      ctx,
      { q: 0, r: 0 },
      '#ccaa44',
      makeCamera(),
      10,
      false,
      visibility,
      'player',
      'mc-sparta',
    );

    expect((ctx as unknown as MockCanvasContext).strokeCalls.length).toBeGreaterThan(0);
    expect((ctx as unknown as MockCanvasContext).strokeCalls.length).toBeLessThan(19);
  });
});
