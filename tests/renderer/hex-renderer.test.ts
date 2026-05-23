import { describe, expect, it } from 'vitest';
import type { Camera } from '@/renderer/camera';
import { drawHexMap, drawMinorCivTerritory, IMPROVEMENT_ICONS } from '@/renderer/hex-renderer';
import type { GameMap, VisibilityMap } from '@/core/types';

class MockCanvasContext {
  strokeCalls: string[] = [];
  textCalls: string[] = [];
  fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha = 1;
  shadowColor = '';
  shadowBlur = 0;

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  arc(): void {}
  closePath(): void {}
  fill(): void {}
  fillText(text: string, x: number = 0, y: number = 0): void {
    this.textCalls.push(text);
    this.fillTextCalls.push({ text, x, y });
  }
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
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'fog', '1,0': 'unexplored' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'grassland',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: 'player',
          hasRiver: false,
          wonder: null,
        },
      },
    };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).toContain('rgba(74,144,217,0.5)');
  });

  it('does not draw the old generic star glyph for natural wonders', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeMap();
    map.tiles['0,0'].wonder = 'great_volcano';
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'visible' } };

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('✦');
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

function makeResourceMap(opts: {
  resource?: string | null;
  improvement?: string;
  improvementTurnsLeft?: number;
} = {}): GameMap {
  return {
    width: 1,
    height: 1,
    wrapsHorizontally: false,
    rivers: [],
    tiles: {
      '0,0': {
        coord: { q: 0, r: 0 },
        terrain: 'mountain',
        elevation: 'highland',
        movementCost: 2,
        owner: null,
        improvement: opts.improvement ?? 'none',
        improvementTurnsLeft: opts.improvementTurnsLeft ?? 0,
        resource: opts.resource ?? null,
        hasRiver: false,
        wonder: null,
      },
    },
  } as unknown as GameMap;
}

describe('resource icon rendering', () => {
  const visibleAll: VisibilityMap = { tiles: { '0,0': 'visible' } };

  it('draws resource icon when viewer has the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set(['gathering']));

    expect((ctx as unknown as MockCanvasContext).textCalls).toContain('🪨');
  });

  it('does not draw resource icon when viewer lacks the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set());

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });

  it('draws resource icon at top-left corner when a completed improvement is present', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone', improvement: 'mine', improvementTurnsLeft: 0 });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set(['gathering']));

    // For tile at q=0,r=0: hexToPixel gives {x:0,y:0}; worldToScreen is identity.
    // scaledSize = hexSize(48) * zoom(1) = 48.
    // Corner position: cx - size*0.3 = 0 - 14.4 = -14.4
    const mockCtx = ctx as unknown as MockCanvasContext;
    const call = mockCtx.fillTextCalls.find(c => c.text === '🪨');
    expect(call).toBeDefined();
    expect(call!.x).toBeCloseTo(-14.4);
    expect(call!.y).toBeCloseTo(-14.4);
  });

  it('draws resource icon at center when improvement is still under construction', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    // improvementTurnsLeft > 0 means construction in progress — improvement icon is NOT shown
    const map = makeResourceMap({ resource: 'stone', improvement: 'mine', improvementTurnsLeft: 2 });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set(['gathering']));

    // No completed improvement visible → resource draws centered at cx=0, cy=0
    const mockCtx = ctx as unknown as MockCanvasContext;
    const call = mockCtx.fillTextCalls.find(c => c.text === '🪨');
    expect(call).toBeDefined();
    expect(call!.x).toBeCloseTo(0);
    expect(call!.y).toBeCloseTo(0);
  });

  it('does not draw resource icon for unexplored tiles (presentation layer nullifies resource)', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    const unexplored: VisibilityMap = { tiles: { '0,0': 'unexplored' } };

    // viewerTechs has 'gathering' — but the presentation tile has resource:null from unknownTile()
    drawHexMap(ctx, map, makeCamera(), undefined, 'player', unexplored, new Set(['gathering']));

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });

  it('draws resource icon on last-seen tile when viewer has the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    const fog: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'mountain',
          elevation: 'highland',
          resource: 'stone',
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: null,
        },
      },
    };

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', fog, new Set(['gathering']));

    // Player remembers what they last saw — resource shows if they have the tech
    expect((ctx as unknown as MockCanvasContext).textCalls).toContain('🪨');
  });

  it('does not draw resource icon when tile has a wonder (wonder visual takes priority)', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    map.tiles['0,0'].wonder = 'great_volcano';

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set(['gathering']));

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });

  it('draws resource icon at top-left corner when tile has a village', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    // Pass coord as a village position — the village glyph would occupy the center
    const villagePositions = new Set(['0,0']);

    drawHexMap(ctx, map, makeCamera(), villagePositions, 'player', visibleAll, new Set(['gathering']));

    // Village causes corner layout: cx - size*0.3 = 0 - 14.4 = -14.4
    const mockCtx = ctx as unknown as MockCanvasContext;
    const call = mockCtx.fillTextCalls.find(c => c.text === '🪨');
    expect(call).toBeDefined();
    expect(call!.x).toBeCloseTo(-14.4);
    expect(call!.y).toBeCloseTo(-14.4);
  });

  it('does not draw resource icon on last-seen tile when viewer lacks the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    const fog: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'mountain',
          elevation: 'highland',
          resource: 'stone',
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: null,
        },
      },
    };

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', fog, new Set());

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });
});

describe('IMPROVEMENT_ICONS', () => {
  it('has entries for all 4 original improvement types', () => {
    expect(IMPROVEMENT_ICONS['farm']).toBe('🌾');
    expect(IMPROVEMENT_ICONS['mine']).toBe('⛏️');
    expect(IMPROVEMENT_ICONS['lumber_camp']).toBe('🪵');
    expect(IMPROVEMENT_ICONS['watermill']).toBe('💧');
  });

  it('has entries for all 4 new improvement types', () => {
    expect(IMPROVEMENT_ICONS['plantation']).toBe('🌿');
    expect(IMPROVEMENT_ICONS['pasture']).toBe('🐂');
    expect(IMPROVEMENT_ICONS['camp']).toBe('⛺');
    expect(IMPROVEMENT_ICONS['quarry']).toBe('⚒️');
  });

  it('does not have an entry for none', () => {
    expect(IMPROVEMENT_ICONS['none']).toBeUndefined();
  });
});
