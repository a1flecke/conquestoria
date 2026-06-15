import { describe, expect, it, vi } from 'vitest';
import { drawUnitGlyph, drawUnits } from '@/renderer/unit-renderer';
import type { GameState, Unit, VisibilityMap } from '@/core/types';
import type { Camera } from '@/renderer/camera';
import { spriteCache } from '@/renderer/sprites/sprite-loader';

function createContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    drawImage: vi.fn(),
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
  it('does not shrink a sprite when it belongs to a stack', () => {
    const ctx = createContext();
    const sprite = {} as HTMLImageElement;
    const state = { civilizations: {} } as unknown as GameState;
    const stacked = {
      id: 'stacked', owner: 'player', type: 'warrior', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false,
      hasActed: false, isResting: false,
    } as Unit;

    drawUnitGlyph(ctx, state, stacked, 100, 100, 50, { player: '#4a90d9' }, {
      stackSize: 4,
      stackIndex: 0,
      spriteOverride: sprite,
    });

    expect(ctx.drawImage).toHaveBeenCalledWith(sprite, 77.5, 77.5, 45, 45);
  });

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

  it('draws a count badge when multiple visible units share a tile', () => {
    const ctx = createContext();
    const units: Record<string, Unit> = {
      warrior: {
        id: 'warrior',
        owner: 'player',
        type: 'warrior',
        position: { q: 1, r: 1 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
      worker: {
        id: 'worker',
        owner: 'player',
        type: 'worker',
        position: { q: 1, r: 1 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
    };
    const visibility: VisibilityMap = { tiles: { '1,1': 'visible' } };
    const state = {
      map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
    } as unknown as GameState;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawUnits(ctx, units, camera, visibility, state, 'player', { player: '#4a90d9' });

    expect(ctx.fillText).toHaveBeenCalledWith('2', expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith('⚔️', expect.any(Number), expect.any(Number));
    expect(ctx.fillText).not.toHaveBeenCalledWith('👷', expect.any(Number), expect.any(Number));
  });
});

describe('fortified unit badge', () => {
  function makeCamera(): Camera {
    return {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;
  }

  function makeState(): GameState {
    return {
      map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] },
      civilizations: {},
    } as unknown as GameState;
  }

  it('draws a 🛡️ badge for a fortified unit', () => {
    const ctx = createContext();
    const units: Record<string, Unit> = {
      'unit-1': {
        id: 'unit-1', owner: 'player', type: 'warrior',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
        isFortified: true,
      } as unknown as Unit,
    };
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };

    drawUnits(ctx, units, makeCamera(), visibility, makeState(), 'player', { player: '#4a90d9' });

    expect(ctx.fillText).toHaveBeenCalledWith('🛡️', expect.any(Number), expect.any(Number));
  });

  it('does not draw a 🛡️ badge for a non-fortified unit', () => {
    const ctx = createContext();
    const units: Record<string, Unit> = {
      'unit-1': {
        id: 'unit-1', owner: 'player', type: 'warrior',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
      } as unknown as Unit,
    };
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };

    drawUnits(ctx, units, makeCamera(), visibility, makeState(), 'player', { player: '#4a90d9' });

    const fillTextCalls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls as [string, ...unknown[]][];
    expect(fillTextCalls.some(([text]) => text === '🛡️')).toBe(false);
  });
});

describe('unit role markers', () => {
  function makeCamera(): Camera {
    return {
      zoom: 0.2,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;
  }

  function makeState(): GameState {
    return {
      map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] },
      civilizations: {},
    } as unknown as GameState;
  }

  it('draws a chevron marker for barbarian units', () => {
    const ctx = createContext();
    const units: Record<string, Unit> = {
      barb: {
        id: 'barb', owner: 'barbarian', type: 'warrior',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
      },
    };

    drawUnits(ctx, units, makeCamera(), { tiles: { '0,0': 'visible' } }, makeState(), 'player', { barbarian: '#8b4513' });

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('draws a diamond marker for minor-civ units', () => {
    const ctx = createContext();
    const units: Record<string, Unit> = {
      minor: {
        id: 'minor', owner: 'mc-sparta', type: 'warrior',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
      },
    };

    drawUnits(ctx, units, makeCamera(), { tiles: { '0,0': 'visible' } }, makeState(), 'player', { 'mc-sparta': '#8a6f2a' });

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('requests an uncached neutral unit sprite palette when sprites are enabled', () => {
    const ctx = createContext();
    const ensureSpy = vi.spyOn(spriteCache, 'ensureCiv').mockImplementation(() => undefined);
    const unit: Unit = {
      id: 'minor', owner: 'mc-renderer-cache-test', type: 'warrior',
      position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
      experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };

    drawUnitGlyph(ctx, makeState(), unit, 24, 24, 48, { 'mc-renderer-cache-test': '#8a6f2a' }, {
      stackSize: 1,
      stackIndex: 0,
      useSprites: true,
    });

    expect(ensureSpy).toHaveBeenCalledWith('mc-renderer-cache-test', '#8a6f2a');
    ensureSpy.mockRestore();
  });

  it('keeps low zoom on fallback glyphs even when a sprite override is available', () => {
    const ctx = createContext();
    const ensureSpy = vi.spyOn(spriteCache, 'ensureCiv').mockImplementation(() => undefined);
    const unit: Unit = {
      id: 'warrior', owner: 'player', type: 'warrior',
      position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
      experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };

    drawUnitGlyph(ctx, makeState(), unit, 24, 24, 48, { player: '#4a90d9' }, {
      stackSize: 1,
      stackIndex: 0,
      useSprites: false,
      spriteOverride: {} as HTMLImageElement,
    });

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('⚔️', expect.any(Number), expect.any(Number));
    expect(ensureSpy).not.toHaveBeenCalled();
    ensureSpy.mockRestore();
  });
});

describe('moving unit rendering', () => {
  it('does not draw stationary copy for hidden moving unit ids', () => {
    const ctx = createContext();
    const units: Record<string, Unit> = {
      mover: {
        id: 'mover', owner: 'player', type: 'warrior',
        position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
      },
    };
    const state = {
      map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] },
      civilizations: {},
    } as unknown as GameState;
    const camera = {
      zoom: 0.2,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawUnits(ctx, units, camera, { tiles: { '0,0': 'visible' } }, state, 'player', { player: '#4a90d9' }, {
      hiddenUnitIds: new Set(['mover']),
    });

    expect(ctx.fillText).not.toHaveBeenCalledWith('⚔️', expect.any(Number), expect.any(Number));
  });
});
