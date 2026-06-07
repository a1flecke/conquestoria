import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, HexTile, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { hexKey } from '@/systems/hex-utils';
import {
  canLoadUnitOntoTransport,
  getTransportCargoUsed,
  getUnloadDestinations,
  loadUnitOntoTransport,
  removeTransportAndCargo,
  unloadUnitFromTransport,
} from '@/systems/transport-system';

function tile(coord: HexCoord, terrain: HexTile['terrain'] = 'grassland', owner: string | null = null): HexTile {
  return {
    coord,
    terrain,
    elevation: terrain === 'mountain' ? 'mountain' : 'lowland',
    resource: null,
    improvement: 'none',
    owner,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function unit(overrides: Partial<Unit>): Unit {
  return {
    id: 'unit-1',
    type: 'warrior',
    owner: 'player',
    position: { q: 0, r: 0 },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    ...overrides,
  };
}

function city(overrides: Partial<City>): City {
  return {
    id: 'city-1',
    name: 'Harbor',
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [{ q: 0, r: 0 }],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    grid: Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => null)),
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    ...overrides,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  const map: GameMap = {
    width: 5,
    height: 5,
    wrapsHorizontally: false,
    rivers: [],
    tiles: {
      '0,0': tile({ q: 0, r: 0 }, 'grassland', 'player'),
      '1,0': tile({ q: 1, r: 0 }, 'coast'),
      '0,1': tile({ q: 0, r: 1 }, 'grassland', 'player'),
      '1,-1': tile({ q: 1, r: -1 }, 'grassland', 'player'),
      '2,-1': tile({ q: 2, r: -1 }, 'coast'),
    },
  };

  const warrior = unit({ id: 'warrior-1', type: 'warrior', position: { q: 0, r: 0 } });
  const worker = unit({ id: 'worker-1', type: 'worker', position: { q: 0, r: 0 } });
  const transport = unit({
    id: 'transport-1',
    type: 'transport',
    position: { q: 1, r: 0 },
    movementPointsLeft: 3,
    cargoUnitIds: [],
  });

  return {
    turn: 1,
    era: 1,
    gameId: 'transport-test',
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map,
    units: {
      [warrior.id]: warrior,
      [worker.id]: worker,
      [transport.id]: transport,
    },
    cities: { 'city-1': city({}) },
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'generic',
        cities: ['city-1'],
        units: [warrior.id, worker.id, transport.id],
        techState: { completed: ['galleys'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        knownCivilizations: [],
        score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    pendingDiplomacyRequests: [],
    ...overrides,
  };
}

describe('transport system', () => {
  it('loads a friendly land unit without consuming the transport turn', () => {
    const start = state();

    const result = loadUnitOntoTransport(start, 'warrior-1', 'transport-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units['transport-1']).toMatchObject({
      movementPointsLeft: 3,
      hasMoved: false,
      hasActed: false,
      cargoUnitIds: ['warrior-1'],
    });
    expect(result.state.units['warrior-1']).toMatchObject({
      transportId: 'transport-1',
      position: { q: 1, r: 0 },
      hasMoved: true,
      hasActed: true,
      movementPointsLeft: 0,
    });
  });

  it('rejects cargo that would exceed transport capacity', () => {
    // Transport now has capacity=2 (2 infantry slots). Fill both, then a third fails.
    const start = state();
    // Add a second adjacent land unit so we can fill the hold
    const scout = { ...start.units['worker-1'], id: 'scout-1', type: 'scout' as const };
    start.units['scout-1'] = scout;

    const step1 = loadUnitOntoTransport(start, 'warrior-1', 'transport-1');
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    expect(getTransportCargoUsed(step1.state, 'transport-1')).toBe(1);

    const step2 = loadUnitOntoTransport(step1.state, 'worker-1', 'transport-1');
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    expect(getTransportCargoUsed(step2.state, 'transport-1')).toBe(2);

    // Hold is now full (2/2); third unit must be rejected
    const result = canLoadUnitOntoTransport(step2.state, 'scout-1', 'transport-1');
    expect(result).toEqual({ ok: false, reason: 'no-capacity', message: 'No room on this Transport' });
  });

  it('rejects loading a land unit that has no action left', () => {
    const start = state();
    start.units['warrior-1'] = {
      ...start.units['warrior-1'],
      hasActed: true,
      movementPointsLeft: 0,
    };

    const result = canLoadUnitOntoTransport(start, 'warrior-1', 'transport-1');

    expect(result).toEqual({ ok: false, reason: 'no-action', message: 'Unit needs movement left to load' });
  });

  it('unloads cargo onto an adjacent passable unoccupied land tile', () => {
    const loaded = loadUnitOntoTransport(state(), 'warrior-1', 'transport-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const readyState = {
      ...loaded.state,
      units: {
        ...loaded.state.units,
        'warrior-1': {
          ...loaded.state.units['warrior-1'],
          hasMoved: false,
          hasActed: false,
          movementPointsLeft: 2,
        },
      },
    };
    const destinations = getUnloadDestinations(readyState, 'transport-1', 'warrior-1').map(hexKey);
    expect(destinations).toContain('0,1');

    const result = unloadUnitFromTransport(readyState, 'transport-1', 'warrior-1', { q: 0, r: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units['transport-1']?.cargoUnitIds).toEqual([]);
    expect(result.state.units['transport-1']).toMatchObject({ movementPointsLeft: 3, hasMoved: false, hasActed: false });
    expect(result.state.units['warrior-1']?.transportId).toBeUndefined();
    expect(result.state.units['warrior-1']).toMatchObject({
      position: { q: 0, r: 1 },
      hasMoved: true,
      hasActed: true,
      movementPointsLeft: 0,
    });
  });

  it('rejects same-turn unload after the cargo spent its action loading', () => {
    const loaded = loadUnitOntoTransport(state(), 'warrior-1', 'transport-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(getUnloadDestinations(loaded.state, 'transport-1', 'warrior-1')).toEqual([]);
    expect(unloadUnitFromTransport(loaded.state, 'transport-1', 'warrior-1', { q: 0, r: 1 })).toMatchObject({
      ok: false,
      reason: 'no-action',
    });
  });

  it('loads from a coastal city across the horizontal map wrap', () => {
    const start = state();
    start.map = {
      ...start.map,
      wrapsHorizontally: true,
      tiles: {
        '0,0': tile({ q: 0, r: 0 }, 'grassland', 'player'),
        '4,0': tile({ q: 4, r: 0 }, 'coast'),
      },
    };
    start.units['transport-1'] = {
      ...start.units['transport-1'],
      position: { q: 4, r: 0 },
    };
    delete start.units['worker-1'];
    start.civilizations.player.units = start.civilizations.player.units.filter(unitId => unitId !== 'worker-1');
    start.cities['city-1'] = city({ position: { q: 0, r: 0 }, ownedTiles: [{ q: 0, r: 0 }] });

    const result = loadUnitOntoTransport(start, 'warrior-1', 'transport-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units['warrior-1']).toMatchObject({
      transportId: 'transport-1',
      position: { q: 4, r: 0 },
    });
  });

  it('unloads cargo onto wrapped adjacent land', () => {
    const start = state();
    start.map = {
      ...start.map,
      wrapsHorizontally: true,
      tiles: {
        '0,0': tile({ q: 0, r: 0 }, 'grassland', 'player'),
        '4,0': tile({ q: 4, r: 0 }, 'coast'),
      },
    };
    start.units['transport-1'] = {
      ...start.units['transport-1'],
      position: { q: 4, r: 0 },
    };
    delete start.units['worker-1'];
    start.civilizations.player.units = start.civilizations.player.units.filter(unitId => unitId !== 'worker-1');
    start.cities['city-1'] = city({ position: { q: 0, r: 0 }, ownedTiles: [{ q: 0, r: 0 }] });
    const loaded = loadUnitOntoTransport(start, 'warrior-1', 'transport-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const readyState = {
      ...loaded.state,
      units: {
        ...loaded.state.units,
        'warrior-1': {
          ...loaded.state.units['warrior-1'],
          hasMoved: false,
          hasActed: false,
          movementPointsLeft: 2,
        },
      },
    };

    expect(getUnloadDestinations(readyState, 'transport-1', 'warrior-1').map(hexKey)).toContain('0,0');
    const result = unloadUnitFromTransport(readyState, 'transport-1', 'warrior-1', { q: 0, r: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units['warrior-1']).toMatchObject({ position: { q: 0, r: 0 } });
  });

  it('destroys cargo when the transport is destroyed', () => {
    const loaded = loadUnitOntoTransport(state(), 'warrior-1', 'transport-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const next = removeTransportAndCargo(loaded.state, 'transport-1');

    expect(next.units['transport-1']).toBeUndefined();
    expect(next.units['warrior-1']).toBeUndefined();
    expect(next.civilizations.player.units).not.toContain('transport-1');
    expect(next.civilizations.player.units).not.toContain('warrior-1');
  });

  it('destroys cargo linked by transportId even if the Transport cargo list drifted', () => {
    const start = state();
    start.units['warrior-1'] = {
      ...start.units['warrior-1'],
      transportId: 'transport-1',
      position: { ...start.units['transport-1'].position },
    };
    start.units['transport-1'] = {
      ...start.units['transport-1'],
      cargoUnitIds: [],
    };

    const next = removeTransportAndCargo(start, 'transport-1');

    expect(next.units['transport-1']).toBeUndefined();
    expect(next.units['warrior-1']).toBeUndefined();
    expect(next.civilizations.player.units).not.toContain('warrior-1');
  });

  it('cleans spy records when a Transport carrying a spy is destroyed', () => {
    const start = state();
    const spy = unit({ id: 'spy-1', type: 'spy_scout', position: { q: 0, r: 0 } });
    start.units = {
      'transport-1': start.units['transport-1'],
      'spy-1': spy,
    };
    start.civilizations.player.units = ['transport-1', 'spy-1'];
    const spyState = createSpyFromUnit(createEspionageCivState(), 'spy-1', 'player', 'spy_scout', 'spy-cargo-seed').state;
    start.espionage = { player: spyState };
    const loaded = loadUnitOntoTransport(start, 'spy-1', 'transport-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const next = removeTransportAndCargo(loaded.state, 'transport-1');

    expect(next.units['spy-1']).toBeUndefined();
    expect(next.espionage?.player.spies['spy-1']).toBeUndefined();
  });
});

describe('higher-tier transport ships (carrack / galleon / steamship / troop_transport)', () => {
  function stateWithShip(shipType: 'carrack' | 'galleon' | 'steamship' | 'troop_transport'): ReturnType<typeof state> {
    const s = state();
    s.units['transport-1'] = {
      ...s.units['transport-1'],
      type: shipType,
      cargoUnitIds: [],
    };
    return s;
  }

  it.each(['carrack', 'galleon', 'steamship', 'troop_transport'] as const)(
    '%s is recognised as a transport and accepts cargo',
    (shipType) => {
      const result = loadUnitOntoTransport(stateWithShip(shipType), 'warrior-1', 'transport-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.units['warrior-1'].transportId).toBe('transport-1');
    },
  );

  it('load / unload messages use the actual ship name', () => {
    const loaded = loadUnitOntoTransport(stateWithShip('galleon'), 'warrior-1', 'transport-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.message).toContain('Galleon');

    const readyState = {
      ...loaded.state,
      units: {
        ...loaded.state.units,
        'warrior-1': { ...loaded.state.units['warrior-1'], hasMoved: false, hasActed: false, movementPointsLeft: 2 },
      },
    };
    const unloaded = unloadUnitFromTransport(readyState, 'transport-1', 'warrior-1', { q: 0, r: 1 });
    expect(unloaded.ok).toBe(true);
    if (!unloaded.ok) return;
    expect(unloaded.message).toContain('Galleon');
  });
});

describe('multi-slot cargo (horseman=2, catapult=3)', () => {
  function stateWithHorseman(): ReturnType<typeof state> {
    const s = state();
    // replace warrior-1 with a horseman
    s.units['warrior-1'] = { ...s.units['warrior-1'], type: 'horseman' };
    return s;
  }

  function stateWithCatapult(): ReturnType<typeof state> {
    const s = state();
    s.units['warrior-1'] = { ...s.units['warrior-1'], type: 'catapult' };
    return s;
  }

  function galleonState(): ReturnType<typeof state> {
    const s = state();
    s.units['transport-1'] = { ...s.units['transport-1'], type: 'galleon', cargoUnitIds: [] };
    return s;
  }

  it('horseman (2 slots) fills a Transport (cap 2) completely', () => {
    const result = loadUnitOntoTransport(stateWithHorseman(), 'warrior-1', 'transport-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getTransportCargoUsed(result.state, 'transport-1')).toBe(2);
  });

  it('catapult (3 slots) is rejected by a Transport (cap 2)', () => {
    const result = canLoadUnitOntoTransport(stateWithCatapult(), 'warrior-1', 'transport-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-capacity' });
  });

  it('catapult (3 slots) is rejected by a Carrack (cap 3) that already has one warrior aboard', () => {
    const s = state();
    s.units['transport-1'] = { ...s.units['transport-1'], type: 'carrack', cargoUnitIds: [] };
    s.units['warrior-1'] = { ...s.units['warrior-1'], type: 'catapult' };
    // first load a regular warrior (worker-1) to use 1 slot
    const step1 = loadUnitOntoTransport(s, 'worker-1', 'transport-1');
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    expect(getTransportCargoUsed(step1.state, 'transport-1')).toBe(1);
    // now catapult needs 3 slots but only 2 remain — must reject
    const result = canLoadUnitOntoTransport(step1.state, 'warrior-1', 'transport-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-capacity' });
  });

  it('catapult (3 slots) fits into an empty Galleon (cap 4)', () => {
    const s = galleonState();
    s.units['warrior-1'] = { ...s.units['warrior-1'], type: 'catapult' };
    const result = loadUnitOntoTransport(s, 'warrior-1', 'transport-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getTransportCargoUsed(result.state, 'transport-1')).toBe(3);
  });

  it('two horsemen (2+2=4 slots) fill a Galleon (cap 4) completely', () => {
    const s = galleonState();
    s.units['warrior-1'] = { ...s.units['warrior-1'], type: 'horseman' };
    s.units['worker-1'] = { ...s.units['worker-1'], type: 'horseman' };
    const step1 = loadUnitOntoTransport(s, 'warrior-1', 'transport-1');
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    const step2 = loadUnitOntoTransport(step1.state, 'worker-1', 'transport-1');
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    expect(getTransportCargoUsed(step2.state, 'transport-1')).toBe(4);
    // a third horseman has nowhere to go
    const extra = unit({ id: 'horseman-3', type: 'horseman', position: { q: 0, r: 0 } });
    step2.state.units['horseman-3'] = extra;
    expect(canLoadUnitOntoTransport(step2.state, 'horseman-3', 'transport-1')).toMatchObject({ ok: false, reason: 'no-capacity' });
  });
});
