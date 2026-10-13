import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '@/renderer/camera';
import {
  drawHexHighlight,
  drawHexMap,
  getFortMarkerTierForPresentation,
  drawMinorCivTerritory,
  IMPROVEMENT_ICONS,
} from '@/renderer/hex-renderer';
import { beginPaintTracking, paintAmbientRegion, paintWasTimeVarying, type PaintBounds } from '@/renderer/paint-clock';
import type { GameMap, HexTile, TerrainType, VisibilityMap } from '@/core/types';

vi.mock('@/renderer/improvements/rail-segment-loader', () => ({
  getRailSegmentImage: () => ({} as HTMLImageElement),
}));

class MockCanvasContext {
  strokeCalls: string[] = [];
  textCalls: string[] = [];
  fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  drawImageCalls = 0;
  fillCalls: string[] = [];
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
  translate(): void {}
  rotate(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  arc(): void {}
  ellipse(): void {}
  closePath(): void {}
  fill(): void {
    this.fillCalls.push(this.fillStyle);
  }
  drawImage(): void {
    this.drawImageCalls += 1;
  }
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
  it('derives a visible Citadel marker from the Fort owner, not the viewer', () => {
    const tile: HexTile = { ...makeMap().tiles['1,0'], improvement: 'fort', owner: 'ai-1' };

    expect(getFortMarkerTierForPresentation(tile, 'live', { player: ['fortification-engineering'], 'ai-1': [] })).toBe('fort');
    expect(getFortMarkerTierForPresentation(tile, 'live', { player: [], 'ai-1': ['fortification-engineering'] })).toBe('citadel');
  });

  it('does not update a fogged Fort marker from unearned owner research', () => {
    const tile: HexTile = { ...makeMap().tiles['1,0'], improvement: 'fort', owner: 'ai-1' };

    expect(getFortMarkerTierForPresentation(tile, 'last-seen', { 'ai-1': ['fortification-engineering'] })).toBe('fort');
  });

  it('draws foreign ownership borders on visible tiles', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'visible' } };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).toContain('rgba(217,74,74,0.5)');
  });

  it('does not draw foreign ownership borders on fogged tiles', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'fog' } };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, undefined, 'player', visibility);

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

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).toContain('rgba(74,144,217,0.5)');
  });

  it('does not draw the old generic star glyph for natural wonders', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeMap();
    map.tiles['0,0'].wonder = 'great_volcano';
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'visible' } };

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('✦');
  });

  it('does not reveal the current beast-lair marker through fog without stored lair intel', () => {
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
          owner: null,
          hasRiver: false,
          wonder: null,
        },
      },
    };

    drawHexMap(
      ctx,
      makeMap(),
      makeCamera(),
      undefined,
      new Map([['0,0', '🐾']]),
      'player',
      visibility,
    );

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🐾');
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

describe('hex highlight rendering', () => {
  it('adds a high-contrast outline when the highlight style supplies one', () => {
    const mock = new MockCanvasContext();

    drawHexHighlight(
      mock as unknown as CanvasRenderingContext2D,
      50,
      50,
      48,
      'rgba(245, 184, 73, 0.55)',
      '#fff0a8',
    );

    expect(mock.fillStyle).toBe('rgba(245, 184, 73, 0.55)');
    expect(mock.strokeCalls).toEqual(['#fff0a8']);
    expect(mock.lineWidth).toBe(3);
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

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', visibleAll, new Set(['gathering']));

    expect((ctx as unknown as MockCanvasContext).textCalls).toContain('🪨');
  });

  it('does not draw resource icon when viewer lacks the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', visibleAll, new Set());

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });

  it('draws resource icon at top-left corner when a completed improvement is present', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone', improvement: 'mine', improvementTurnsLeft: 0 });

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', visibleAll, new Set(['gathering']));

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

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', visibleAll, new Set(['gathering']));

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
    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', unexplored, new Set(['gathering']));

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

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', fog, new Set(['gathering']));

    // Player remembers what they last saw — resource shows if they have the tech
    expect((ctx as unknown as MockCanvasContext).textCalls).toContain('🪨');
  });

  it('does not draw resource icon when tile has a wonder (wonder visual takes priority)', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    map.tiles['0,0'].wonder = 'great_volcano';

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', visibleAll, new Set(['gathering']));

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });

  it('draws resource icon at top-left corner when tile has a village', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    // Pass coord as a village position — the village glyph would occupy the center
    const villagePositions = new Set(['0,0']);

    drawHexMap(ctx, map, makeCamera(), villagePositions, undefined, 'player', visibleAll, new Set(['gathering']));

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

    drawHexMap(ctx, map, makeCamera(), undefined, undefined, 'player', fog, new Set());

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });
});

describe('terrain label hierarchy', () => {
  const visibleAll: VisibilityMap = { tiles: { '0,0': 'visible' } };

  it('keeps an empty control tile labeled', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;

    drawHexMap(ctx, makeResourceMap(), makeCamera(), undefined, undefined, 'player', visibleAll);

    expect((ctx as unknown as MockCanvasContext).textCalls).toContain('Mtn');
  });

  it('suppresses only the terrain label when the canonical coordinate is occupied', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;

    drawHexMap(
      ctx,
      makeResourceMap(),
      makeCamera(),
      undefined,
      undefined,
      'player',
      visibleAll,
      new Set(),
      new Set(['0,0']),
    );

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('Mtn');
  });

  it('uses terrain geometry rather than full-size improvement emoji, including during construction', () => {
    const completedCtx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawHexMap(
      completedCtx,
      makeResourceMap({ improvement: 'farm' }),
      makeCamera(),
      undefined,
      undefined,
      'player',
      visibleAll,
    );

    const buildingCtx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawHexMap(
      buildingCtx,
      makeResourceMap({ improvement: 'farm', improvementTurnsLeft: 2 }),
      makeCamera(),
      undefined,
      undefined,
      'player',
      visibleAll,
    );

    expect((completedCtx as unknown as MockCanvasContext).textCalls).not.toContain('🌾');
    expect((buildingCtx as unknown as MockCanvasContext).textCalls).not.toContain('🔨');
    expect((buildingCtx as unknown as MockCanvasContext).textCalls).toContain('2t');
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

  it('has a Fort inspection icon', () => {
    expect(IMPROVEMENT_ICONS['fort']).toBe('🏰');
  });

  it('does not have an entry for none', () => {
    expect(IMPROVEMENT_ICONS['none']).toBeUndefined();
  });
});

describe('drawRoads', () => {
  it('draws one segment between two adjacent road tiles, including wrap-around ghost tiles', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const map: GameMap = {
      width: 4,
      height: 1,
      wrapsHorizontally: true,
      rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: false },
        '3,0': { coord: { q: 3, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
      },
    } as unknown as GameMap;
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawRoads(ctx, map, makeCamera(), new Set());
    expect((ctx as unknown as MockCanvasContext).strokeCalls.length).toBeGreaterThan(0);
  });

  it('draws a seam-crossing road pair as short stubs on both sides, never a full-map line', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const map: GameMap = {
      width: 6,
      height: 1,
      wrapsHorizontally: true,
      rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
        '5,0': { coord: { q: 5, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
      },
    } as unknown as GameMap;
    const segments: Array<{ fromX: number; toX: number }> = [];
    let penX = 0;
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    (ctx as unknown as { moveTo: (x: number) => void }).moveTo = (x: number) => { penX = x; };
    (ctx as unknown as { lineTo: (x: number) => void }).lineTo = (x: number) => {
      segments.push({ fromX: penX, toX: x });
      penX = x;
    };

    const camera = makeCamera();
    drawRoads(ctx, map, camera, new Set());

    // Both sides of the seam get a stub (base pass + ghost pass).
    expect(segments.length).toBeGreaterThanOrEqual(2);
    const hexStep = Math.sqrt(3) * camera.hexSize;
    for (const segment of segments) {
      expect(Math.abs(segment.toX - segment.fromX)).toBeLessThanOrEqual(hexStep * 1.5);
    }
  });

  it('draws a road segment into a city tile even without hasRoad on the city hex', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const map: GameMap = {
      width: 2,
      height: 1,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: false },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
      },
    } as unknown as GameMap;
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawRoads(ctx, map, makeCamera(), new Set(['0,0']));
    expect((ctx as unknown as MockCanvasContext).strokeCalls.length).toBeGreaterThan(0);
  });

  it('draws nothing when no tile has a road (negative)', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const map = makeMap();
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawRoads(ctx, map, makeCamera(), new Set());
    expect((ctx as unknown as MockCanvasContext).strokeCalls.length).toBe(0);
  });
});

describe('drawRoads rail visual', () => {
  function makeRailMap(secondTileOwner: string | null, secondTileHasRoad: boolean): GameMap {
    return {
      width: 2,
      height: 1,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: secondTileOwner, improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: secondTileHasRoad },
      },
    } as unknown as GameMap;
  }

  it('draws rail art (drawImage) when both segment endpoints are rail', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawRoads(ctx, makeRailMap('player', true), makeCamera(), new Set(), undefined, {
      player: ['railway-expansion'],
    });
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.drawImageCalls).toBeGreaterThan(0);
    expect(mockCtx.strokeCalls.length).toBe(0);
  });

  it('falls back to the plain road line when only one endpoint qualifies (mixed-tech boundary, negative)', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    // '1,0' has no road at all, so it can never be rail regardless of tech.
    drawRoads(ctx, makeRailMap('player', false), makeCamera(), new Set(['1,0']), undefined, {
      player: ['railway-expansion'],
    });
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.drawImageCalls).toBe(0);
    expect(mockCtx.strokeCalls.length).toBeGreaterThan(0);
  });

  it('falls back to the plain road line when neither tile has a road at all (negative)', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const map = makeMap();
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawRoads(ctx, map, makeCamera(), new Set(['0,0', '1,0']), undefined, { player: ['railway-expansion'] });
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.drawImageCalls).toBe(0);
  });

  it('renders rail art identically on the wrap-ghost pass on a wrapping map', async () => {
    const { drawRoads } = await import('@/renderer/hex-renderer');
    const wrapMap: GameMap = {
      width: 2,
      height: 1,
      wrapsHorizontally: true,
      rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null, hasRoad: true },
      },
    } as unknown as GameMap;
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawRoads(ctx, wrapMap, makeCamera(), new Set(), undefined, { player: ['railway-expansion'] });
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.drawImageCalls).toBeGreaterThan(0);
    expect(mockCtx.strokeCalls.length).toBe(0);
  });
});

describe('devastated tile tint (MR2 catastrophe crises)', () => {
  function makeDevastationMap(devastatedUntilTurn: number | undefined): GameMap {
    return {
      width: 2,
      height: 1,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
          resource: null, improvement: 'none', owner: 'player',
          improvementTurnsLeft: 0, hasRiver: false, wonder: null,
          devastatedUntilTurn,
        },
      },
    } as unknown as GameMap;
  }

  it('draws the devastation tint on a live, currently-devastated tile', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };
    drawHexMap(ctx, makeDevastationMap(50), makeCamera(), undefined, undefined, 'player', visibility, new Set(), new Set(), 40);
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.fillCalls).toContain('rgba(40,30,20,0.45)');
  });

  it('does not tint a tile whose devastation has already passed', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };
    drawHexMap(ctx, makeDevastationMap(40), makeCamera(), undefined, undefined, 'player', visibility, new Set(), new Set(), 40);
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.fillCalls).not.toContain('rgba(40,30,20,0.45)');
  });

  it('does not tint a non-devastated tile', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };
    drawHexMap(ctx, makeDevastationMap(undefined), makeCamera(), undefined, undefined, 'player', visibility, new Set(), new Set(), 40);
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.fillCalls).not.toContain('rgba(40,30,20,0.45)');
  });

  it('never reveals a devastated tile through fog (last-seen presentation has no devastation field)', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
          resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0,
          hasRiver: false, wonder: null,
        } as any,
      },
    };
    drawHexMap(ctx, makeDevastationMap(50), makeCamera(), undefined, undefined, 'player', visibility, new Set(), new Set(), 40);
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(mockCtx.fillCalls).not.toContain('rgba(40,30,20,0.45)');
  });
});

/**
 * #1439 phase 6 clip-aware terrain culling. During an ambient-only paint the canvas is clipped to
 * the animated region(s), so a terrain tile whose whole drawing footprint lies outside every
 * region cannot put a pixel on screen and can be skipped. These tests pin the geometry contract:
 * conservative overdraw margins (a culled tile is a no-op, a wrongly-kept one costs a little work,
 * but a wrongly-skipped one leaves stale pixels), wrapping, fog, zoom and the time-varying wonder
 * mark that must survive culling.
 */
describe('ambient-region terrain culling (#1439 phase 6)', () => {
  // A small hex so tile centres are easy to reason about: on r=0 centres sit at q·√3·size and the
  // conservative cull half-extent is (√3/2 + margin)·size wide.
  const HEX_SIZE = 10;

  function makeSizedCamera(zoom = 1): Camera {
    return {
      hexSize: HEX_SIZE,
      zoom,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;
  }

  interface TileSpec {
    q: number;
    terrain?: TerrainType;
    improvement?: string;
    wonder?: string | null;
  }

  function makeTiledMap(specs: TileSpec[], options: { width?: number; wrapsHorizontally?: boolean } = {}): GameMap {
    const tiles: Record<string, HexTile> = {};
    for (const spec of specs) {
      tiles[`${spec.q},0`] = {
        coord: { q: spec.q, r: 0 },
        terrain: spec.terrain ?? 'grassland',
        elevation: 'lowland',
        movementCost: 1,
        owner: null,
        improvement: spec.improvement ?? 'none',
        improvementTurnsLeft: 0,
        resource: null,
        hasRiver: false,
        wonder: spec.wonder ?? null,
      } as unknown as HexTile;
    }
    return {
      width: options.width ?? specs.length,
      height: 1,
      wrapsHorizontally: options.wrapsHorizontally ?? false,
      rivers: [],
      tiles,
    } as unknown as GameMap;
  }

  function visibleMap(...keys: string[]): VisibilityMap {
    return { tiles: Object.fromEntries(keys.map(key => [key, 'visible'])) };
  }

  function renderedLabels(ctx: CanvasRenderingContext2D): string[] {
    return (ctx as unknown as MockCanvasContext).textCalls;
  }

  it('draws every tile when no ambient region is supplied (full paint path)', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawHexMap(
      ctx, makeTiledMap([{ q: 0 }, { q: 1 }, { q: 2 }]), makeSizedCamera(),
      undefined, undefined, 'player', visibleMap('0,0', '1,0', '2,0'),
    );
    expect((ctx as unknown as MockCanvasContext).fillCalls).toHaveLength(3);
  });

  it('skips terrain entirely outside the region and keeps intersecting terrain', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    // Centres at 0 / 17.32 / 34.64 / 51.96 px; region [45, 60] excludes q=0, q=1.
    const region: PaintBounds[] = [{ x0: 45, y0: -6, x1: 60, y1: 6 }];
    drawHexMap(
      ctx,
      makeTiledMap([{ q: 0, terrain: 'mountain' }, { q: 1, terrain: 'desert' }, { q: 2, terrain: 'tundra' }, { q: 3, terrain: 'snow' }]),
      makeSizedCamera(),
      undefined, undefined, 'player', visibleMap('0,0', '1,0', '2,0', '3,0'),
      new Set(), new Set(), undefined, {}, region,
    );
    const labels = renderedLabels(ctx);
    expect(labels).toContain('Tundra');
    expect(labels).toContain('Snow');
    expect(labels).not.toContain('Mtn');
    expect(labels).not.toContain('Desert');
  });

  it('keeps a tile whose centre is outside the region but whose artwork overlaps it', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    // q=1 centre (17.32) is left of region [25, 30], but its half-width reaches 33.5.
    const region: PaintBounds[] = [{ x0: 25, y0: -6, x1: 30, y1: 6 }];
    drawHexMap(
      ctx,
      makeTiledMap([{ q: 0, terrain: 'grassland' }, { q: 1, terrain: 'mountain' }]),
      makeSizedCamera(),
      undefined, undefined, 'player', visibleMap('0,0', '1,0'),
      new Set(), new Set(), undefined, {}, region,
    );
    const labels = renderedLabels(ctx);
    expect(labels).toContain('Mtn');
    expect(labels).not.toContain('Grass');
  });

  it('keeps a tile in each of several disjoint regions and culls the gap between them', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const region: PaintBounds[] = [
      { x0: -6, y0: -6, x1: 6, y1: 6 },
      { x0: 167, y0: -6, x1: 179, y1: 6 },
    ];
    drawHexMap(
      ctx,
      makeTiledMap([{ q: 0, terrain: 'grassland' }, { q: 10, terrain: 'desert' }]),
      makeSizedCamera(),
      undefined, undefined, 'player', visibleMap('0,0', '10,0'),
      new Set(), new Set(), undefined, {}, region,
    );
    const labels = renderedLabels(ctx);
    expect(labels).toContain('Grass');
    expect(labels).toContain('Desert');
    expect((ctx as unknown as MockCanvasContext).fillCalls).toHaveLength(2);
  });

  it('culls a wrapped copy outside the region while drawing the copy inside it', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const region: PaintBounds[] = [{ x0: -6, y0: -6, x1: 6, y1: 6 }];
    // Wrapping map width 4: tile q=0 renders at q=-4, 0 and 4 (centres -69.28, 0, 69.28).
    drawHexMap(
      ctx,
      makeTiledMap([{ q: 0 }], { width: 4, wrapsHorizontally: true }),
      makeSizedCamera(),
      undefined, undefined, 'player', visibleMap('0,0'),
      new Set(), new Set(), undefined, {}, region,
    );
    expect((ctx as unknown as MockCanvasContext).fillCalls).toHaveLength(1);
  });

  it('draws a seam-adjacent tile through the wrapped copy that lands in the region', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const region: PaintBounds[] = [{ x0: -20, y0: -6, x1: -14, y1: 6 }];
    // Tile q=3 on a width-4 map renders at q=-1, 3, 7; only the seam ghost (-17.32) is in region.
    drawHexMap(
      ctx,
      makeTiledMap([{ q: 3, terrain: 'snow' }], { width: 4, wrapsHorizontally: true }),
      makeSizedCamera(),
      undefined, undefined, 'player', visibleMap('3,0'),
      new Set(), new Set(), undefined, {}, region,
    );
    const mockCtx = ctx as unknown as MockCanvasContext;
    expect(renderedLabels(ctx)).toContain('Snow');
    expect(mockCtx.fillCalls).toHaveLength(1);
  });

  it('culls by geometry alone, independent of fog, last-seen or unexplored visibility', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const region: PaintBounds[] = [{ x0: 18, y0: -6, x1: 18.3, y1: 6 }];
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'visible', '1,0': 'fog', '2,0': 'unexplored' },
      lastSeen: {
        '1,0': {
          coord: { q: 1, r: 0 }, terrain: 'desert', elevation: 'lowland',
          resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0,
          hasRiver: false, wonder: null,
        } as any,
      },
    };
    drawHexMap(
      ctx,
      makeTiledMap([{ q: 0, terrain: 'mountain' }, { q: 1 }, { q: 2 }]),
      makeSizedCamera(),
      undefined, undefined, 'player', visibility,
      new Set(), new Set(), undefined, {}, region,
    );
    const labels = renderedLabels(ctx);
    // The fogged tile inside the region is processed (its last-seen look is drawn) ...
    expect(labels).toContain('Desert');
    // ... while its visible and unexplored neighbours, outside the region, are not.
    expect(labels).not.toContain('Mtn');
    expect(labels).not.toContain('Grass');
    expect((ctx as unknown as MockCanvasContext).fillCalls).toHaveLength(1);
  });

  it('scales the cull footprint with zoom', () => {
    const region: PaintBounds[] = [{ x0: 40, y0: -6, x1: 45, y1: 6 }];
    const specs: TileSpec[] = [{ q: 0 }, { q: 1 }, { q: 2 }];

    const zoomedOut = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawHexMap(zoomedOut, makeTiledMap(specs), makeSizedCamera(1), undefined, undefined, 'player', visibleMap('0,0', '1,0', '2,0'), new Set(), new Set(), undefined, {}, region);
    const closer = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawHexMap(closer, makeTiledMap(specs), makeSizedCamera(2), undefined, undefined, 'player', visibleMap('0,0', '1,0', '2,0'), new Set(), new Set(), undefined, {}, region);

    // At zoom 2 the same tile footprint is twice as large, so q=1 comes into range.
    expect((zoomedOut as unknown as MockCanvasContext).fillCalls).toHaveLength(1);
    expect((closer as unknown as MockCanvasContext).fillCalls).toHaveLength(2);
  });

  it('interprets the region in CSS pixels, independent of devicePixelRatio', () => {
    const region: PaintBounds[] = [{ x0: 45, y0: -6, x1: 60, y1: 6 }];
    const run = (): number => {
      const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
      drawHexMap(ctx, makeTiledMap([{ q: 0 }, { q: 1 }, { q: 2 }, { q: 3 }]), makeSizedCamera(), undefined, undefined, 'player', visibleMap('0,0', '1,0', '2,0', '3,0'), new Set(), new Set(), undefined, {}, region);
      return (ctx as unknown as MockCanvasContext).fillCalls.length;
    };

    const dpr1 = run();
    const globals = globalThis as unknown as { window?: unknown };
    const previous = globals.window;
    globals.window = { devicePixelRatio: 3 };
    try {
      expect(run()).toBe(dpr1);
    } finally {
      globals.window = previous;
    }
  });

  it('skips an off-region improvement overlay and keeps an in-region one', () => {
    const specs: TileSpec[] = [{ q: 0, improvement: 'mine' }, { q: 1, terrain: 'desert' }];
    // Region over q=1 only: q=0's mine rocks must not be drawn.
    const offRegion = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawHexMap(offRegion, makeTiledMap(specs), makeSizedCamera(), undefined, undefined, 'player', visibleMap('0,0', '1,0'), new Set(), new Set(), undefined, {}, [{ x0: 20, y0: -6, x1: 40, y1: 6 }]);
    expect((offRegion as unknown as MockCanvasContext).strokeCalls).not.toContain('rgba(45,40,34,0.65)');
    expect(renderedLabels(offRegion)).toContain('Desert');

    // Region over q=0 only: the mine rocks are drawn.
    const inRegion = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawHexMap(inRegion, makeTiledMap(specs), makeSizedCamera(), undefined, undefined, 'player', visibleMap('0,0', '1,0'), new Set(), new Set(), undefined, {}, [{ x0: -25, y0: -6, x1: 0, y1: 6 }]);
    expect((inRegion as unknown as MockCanvasContext).strokeCalls).toContain('rgba(45,40,34,0.65)');
    expect(renderedLabels(inRegion)).not.toContain('Desert');
  });

  it('does not lose a bounded time-varying wonder mark when off-region terrain is culled', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const centerX = 2 * HEX_SIZE * Math.sqrt(3); // q=2 centre
    const region: PaintBounds[] = [{ x0: 35, y0: -6, x1: 45, y1: 6 }];
    beginPaintTracking();
    drawHexMap(
      ctx,
      makeTiledMap([{ q: 0, terrain: 'mountain' }, { q: 1, terrain: 'desert' }, { q: 2, wonder: 'great_volcano' }]),
      makeSizedCamera(),
      undefined, undefined, 'player', visibleMap('0,0', '1,0', '2,0'),
      new Set(), new Set(), undefined, {}, region,
    );

    // Only the wonder tile is drawn, but its animation still reports to the paint clock, with a
    // bounded region that keeps the next ambient frame alive.
    expect(renderedLabels(ctx)).not.toContain('Mtn');
    expect(paintWasTimeVarying()).toBe(true);
    const bounds = paintAmbientRegion();
    expect(bounds).not.toBeNull();
    expect(bounds![0]!.x0).toBeCloseTo(centerX - 2 * HEX_SIZE);
    expect(bounds![0]!.y0).toBeCloseTo(-2 * HEX_SIZE);
    expect(bounds![0]!.x1).toBeCloseTo(centerX + 2 * HEX_SIZE);
    expect(bounds![0]!.y1).toBeCloseTo(2 * HEX_SIZE);
  });

  it('treats the ambient region as an immutable descriptor', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const region: PaintBounds[] = [{ x0: 45, y0: -6, x1: 60, y1: 6 }];
    const snapshot = region.map(bounds => ({ ...bounds }));
    drawHexMap(ctx, makeTiledMap([{ q: 0 }, { q: 2 }]), makeSizedCamera(), undefined, undefined, 'player', visibleMap('0,0', '2,0'), new Set(), new Set(), undefined, {}, region);
    expect(region).toEqual(snapshot);
  });
});
