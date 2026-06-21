import { describe, expect, it, vi } from 'vitest';

const rendererMocks = vi.hoisted(() => ({
  drawHexHighlight: vi.fn(),
  drawMinorCivTerritory: vi.fn(),
  drawUnitGlyph: vi.fn(),
  drawPirateHeadquarters: vi.fn(),
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
  drawUnitGlyph: rendererMocks.drawUnitGlyph,
}));

vi.mock('@/renderer/pirate-headquarters-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pirate-headquarters-presentation')>();
  return {
    ...actual,
    drawPirateHeadquartersMapPresentation: rendererMocks.drawPirateHeadquarters,
  };
});

import {
  RenderLoop,
  buildMovingUnitEntities,
  positionMovingPirateHeadquarters,
} from '@/renderer/render-loop';
import type { PirateHeadquartersMapEntity } from '@/renderer/pirate-headquarters-presentation';
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

  it('passes viewer-scoped pirate headquarters presentation into the map layer', () => {
    rendererMocks.drawPirateHeadquarters.mockReset();
    const loop = new RenderLoop(createCanvas());
    const state = {
      turn: 1,
      currentPlayer: 'player',
      map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {}, minorCivs: {}, cities: {}, units: {},
      pirates: { version: 1, factions: {}, history: [], pressure: { value: 0, suppression: [] }, intelByCiv: {}, nextSpawnCheckTurn: 1 },
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: {} } } },
    } as unknown as GameState;

    loop.setGameState(state);
    loop.setSelectedPirateFactionId('pirate-1');
    (loop as unknown as { render: () => void }).render();

    expect(rendererMocks.drawPirateHeadquarters).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ entities: expect.any(Array), regions: [] }),
      expect.anything(),
      state.map,
      expect.any(Set),
    );
    expect(rendererMocks.drawPirateHeadquarters).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ entities: [], regions: expect.any(Array) }),
      expect.anything(),
      state.map,
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

  it('drops a normal movement snapshot when the authoritative unit is deleted', () => {
    rendererMocks.drawUnitGlyph.mockReset();
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const loop = new RenderLoop(createCanvas());
    const unit = {
      id: 'deleted', owner: 'player', type: 'warrior', position: { q: 0, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false,
      hasActed: false, isResting: false,
    } as Unit;
    const state = {
      turn: 1,
      currentPlayer: 'player',
      map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {}, minorCivs: {}, cities: {}, units: {},
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '1,0': 'visible' } } } },
    } as unknown as GameState;
    let completed = false;

    loop.setGameState(state);
    loop.camera.isHexVisible = () => true;
    loop.animateUnitMove(unit, [{ q: 0, r: 0 }, { q: 1, r: 0 }], () => { completed = true; });
    nowSpy.mockReturnValue(100);
    (loop as unknown as { render: () => void }).render();

    expect(rendererMocks.drawUnitGlyph).not.toHaveBeenCalled();
    expect(completed).toBe(true);
    expect(loop.hasMovingUnit('deleted')).toBe(false);
    nowSpy.mockRestore();
  });

  it('keeps a detached boarding slide visible after cargo leaves authoritative map state', () => {
    rendererMocks.drawUnitGlyph.mockReset();
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const loop = new RenderLoop(createCanvas());
    const unit = {
      id: 'cargo', owner: 'player', type: 'warrior', position: { q: 0, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false,
      hasActed: false, isResting: false,
    } as Unit;
    const state = {
      turn: 1,
      currentPlayer: 'player',
      map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {}, minorCivs: {}, cities: {}, units: {},
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '1,0': 'visible' } } } },
    } as unknown as GameState;

    loop.setGameState(state);
    loop.camera.isHexVisible = () => true;
    loop.animateUnitSlide(unit, { q: 1, r: 0 });
    nowSpy.mockReturnValue(100);
    (loop as unknown as { render: () => void }).render();

    expect(rendererMocks.drawUnitGlyph).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('builds one interpolated DOM entity for a moving pirate without a stale endpoint duplicate', () => {
    const pirate = {
      id: 'pirate-ship', owner: 'pirate-1', type: 'pirate_corsair', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: true,
      hasActed: false, isResting: false,
    } as Unit;
    const map = { width: 6, height: 3, wrapsHorizontally: true, tiles: {}, rivers: [] } as GameState['map'];
    const state = { map, units: { [pirate.id]: pirate }, civilizations: {} } as unknown as GameState;
    const animation = {
      unit: pirate,
      path: [{ q: 0, r: 0 }, { q: 5, r: 0 }],
      renderPath: [{ q: 0, r: 0 }, { q: -1, r: 0 }],
      from: { q: 0, r: 0 }, to: { q: 5, r: 0 }, duration: 220, startTime: 0,
    };

    const entities = buildMovingUnitEntities(
      state,
      [animation],
      110,
      { 'pirate-1': '#8b2635' },
      { tiles: { '5,0': 'visible' }, lastSeen: {} },
    );

    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      id: 'pirate-ship', faction: 'pirates', state: 'walk', coord: { q: -0.5, r: 0 },
    });
  });

  it('does not place moving DOM sprites above fog on merely seen tiles', () => {
    const pirate = {
      id: 'hidden-pirate', owner: 'pirate-1', type: 'pirate_corsair', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: true,
      hasActed: false, isResting: false,
    } as Unit;
    const map = { width: 6, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] } as GameState['map'];
    const state = { map, units: { [pirate.id]: pirate }, civilizations: {} } as unknown as GameState;
    const animation = {
      unit: { ...pirate, position: { q: 0, r: 0 } },
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }], renderPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, duration: 220, startTime: 0,
    };

    expect(buildMovingUnitEntities(
      state,
      [animation],
      110,
      {},
      { tiles: { '1,0': 'fog' }, lastSeen: {} },
    )).toEqual([]);
  });

  it('moves a flotilla landmark with its flagship across the short wrapped path', () => {
    const pirate = {
      id: 'flagship', owner: 'pirate-1', type: 'pirate_mothership', position: { q: 5, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true,
      hasActed: true, isResting: false,
    } as Unit;
    const map = { width: 6, height: 3, wrapsHorizontally: true, tiles: {}, rivers: [] } as GameState['map'];
    const state = {
      map, units: { flagship: pirate }, civilizations: {},
      pirates: { factions: { 'pirate-1': { headquarters: { kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship' } } } },
    } as unknown as GameState;
    const entity = {
      id: 'pirate-headquarters-pirate-1', factionId: 'pirate-1', subtype: 'deep-sea-flotilla',
      coord: { q: 5, r: 0 }, stage: 5, tier: 3, mode: 'current', behaviorMode: 'blockade',
      damage: 0, selected: false, label: 'headquarters',
    } satisfies PirateHeadquartersMapEntity;
    const animation = {
      unit: { ...pirate, position: { q: 0, r: 0 } },
      path: [{ q: 0, r: 0 }, { q: 5, r: 0 }], renderPath: [{ q: 0, r: 0 }, { q: -1, r: 0 }],
      from: { q: 0, r: 0 }, to: { q: 5, r: 0 }, duration: 220, startTime: 0,
    };

    expect(positionMovingPirateHeadquarters(state, [entity], [animation], 110)[0]).toMatchObject({
      coord: { q: -0.5, r: 0 }, behaviorMode: 'relocating',
    });
  });
});
