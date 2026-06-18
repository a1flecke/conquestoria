import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, HexTile, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { hexKey } from '@/systems/hex-utils';
import {
  canLoadUnitOntoTransport,
  getTransportCargoUsed,
  getUnloadDestinations,
  loadUnitOntoTransport,
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

  // --- Gap 1: capacity tests for the 4 new transport types ---

  describe('capacity limits for all transport types', () => {
    function shipState(
      shipType: 'carrack' | 'galleon' | 'steamship' | 'troop_transport',
      preloadedCount: number,
    ): GameState {
      const base = state();
      const shipId = `${shipType}-1`;
      const cargoIds: string[] = [];
      const units: Record<string, Unit> = {};

      for (let i = 0; i < preloadedCount; i++) {
        const id = `cargo-${i}`;
        cargoIds.push(id);
        units[id] = unit({
          id, type: 'warrior', position: { q: 1, r: 0 },
          transportId: shipId, hasMoved: true, hasActed: true, movementPointsLeft: 0,
        });
      }
      units[shipId] = unit({ id: shipId, type: shipType, position: { q: 1, r: 0 }, movementPointsLeft: 3, cargoUnitIds: cargoIds });
      units['fill'] = unit({ id: 'fill', type: 'warrior', position: { q: 0, r: 0 } });
      units['over'] = unit({ id: 'over', type: 'warrior', position: { q: 0, r: 0 } });

      return {
        ...base,
        units,
        civilizations: {
          ...base.civilizations,
          player: { ...base.civilizations.player, units: Object.keys(units) },
        },
      };
    }

    it.each([
      { shipType: 'carrack' as const, capacity: 3 },
      { shipType: 'galleon' as const, capacity: 4 },
      { shipType: 'steamship' as const, capacity: 5 },
      { shipType: 'troop_transport' as const, capacity: 6 },
    ])('$shipType accepts up to $capacity warrior slots and rejects one over cap', ({ shipType, capacity }) => {
      const s = shipState(shipType, capacity - 1);
      const shipId = `${shipType}-1`;

      expect(canLoadUnitOntoTransport(s, 'fill', shipId)).toEqual({ ok: true });

      const loaded = loadUnitOntoTransport(s, 'fill', shipId);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(getTransportCargoUsed(loaded.state, shipId)).toBe(capacity);

      expect(canLoadUnitOntoTransport(loaded.state, 'over', shipId)).toEqual({
        ok: false,
        reason: 'no-capacity',
        message: 'No room on this Transport',
      });
    });
  });

  // --- Gap 2: multi-slot cargo tests ---

  it('cavalry (2 slots) + warrior (1 slot) fills carrack (cap 3); second warrior is rejected', () => {
    const base = state();
    const units: Record<string, Unit> = {
      'cavalry-1': unit({
        id: 'cavalry-1', type: 'cavalry', position: { q: 1, r: 0 },
        transportId: 'carrack-1', hasMoved: true, hasActed: true, movementPointsLeft: 0,
      }),
      'carrack-1': unit({ id: 'carrack-1', type: 'carrack', position: { q: 1, r: 0 }, movementPointsLeft: 3, cargoUnitIds: ['cavalry-1'] }),
      'warrior-a': unit({ id: 'warrior-a', type: 'warrior', position: { q: 0, r: 0 } }),
      'warrior-b': unit({ id: 'warrior-b', type: 'warrior', position: { q: 0, r: 0 } }),
    };
    const s = { ...base, units, civilizations: { ...base.civilizations, player: { ...base.civilizations.player, units: Object.keys(units) } } };

    expect(getTransportCargoUsed(s, 'carrack-1')).toBe(2);

    const step1 = loadUnitOntoTransport(s, 'warrior-a', 'carrack-1');
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    expect(getTransportCargoUsed(step1.state, 'carrack-1')).toBe(3);

    expect(canLoadUnitOntoTransport(step1.state, 'warrior-b', 'carrack-1')).toEqual({
      ok: false, reason: 'no-capacity', message: 'No room on this Transport',
    });
  });

  it('catapult (3 slots) on galleon (cap 4) uses 3 slots; cavalry (2 slots) is rejected with 1 slot remaining', () => {
    const base = state();
    const units: Record<string, Unit> = {
      'catapult-1': unit({
        id: 'catapult-1', type: 'catapult', position: { q: 1, r: 0 },
        transportId: 'galleon-1', hasMoved: true, hasActed: true, movementPointsLeft: 0,
      }),
      'galleon-1': unit({ id: 'galleon-1', type: 'galleon', position: { q: 1, r: 0 }, movementPointsLeft: 3, cargoUnitIds: ['catapult-1'] }),
      'cavalry-1': unit({ id: 'cavalry-1', type: 'cavalry', position: { q: 0, r: 0 } }),
    };
    const s = { ...base, units, civilizations: { ...base.civilizations, player: { ...base.civilizations.player, units: Object.keys(units) } } };

    expect(getTransportCargoUsed(s, 'galleon-1')).toBe(3);

    expect(canLoadUnitOntoTransport(s, 'cavalry-1', 'galleon-1')).toEqual({
      ok: false, reason: 'no-capacity', message: 'No room on this Transport',
    });
  });

  it('troop_transport (cap 6) with two cavalry (4 slots total) rejects a catapult (3 slots; would be 7)', () => {
    const base = state();
    const units: Record<string, Unit> = {
      'cavalry-1': unit({
        id: 'cavalry-1', type: 'cavalry', position: { q: 1, r: 0 },
        transportId: 'troop_transport-1', hasMoved: true, hasActed: true, movementPointsLeft: 0,
      }),
      'cavalry-2': unit({
        id: 'cavalry-2', type: 'cavalry', position: { q: 1, r: 0 },
        transportId: 'troop_transport-1', hasMoved: true, hasActed: true, movementPointsLeft: 0,
      }),
      'troop_transport-1': unit({
        id: 'troop_transport-1', type: 'troop_transport', position: { q: 1, r: 0 },
        movementPointsLeft: 3, cargoUnitIds: ['cavalry-1', 'cavalry-2'],
      }),
      'catapult-1': unit({ id: 'catapult-1', type: 'catapult', position: { q: 0, r: 0 } }),
    };
    const s = { ...base, units, civilizations: { ...base.civilizations, player: { ...base.civilizations.player, units: Object.keys(units) } } };

    expect(getTransportCargoUsed(s, 'troop_transport-1')).toBe(4);

    expect(canLoadUnitOntoTransport(s, 'catapult-1', 'troop_transport-1')).toEqual({
      ok: false, reason: 'no-capacity', message: 'No room on this Transport',
    });
  });

  it('transport (cap 2) accepts cavalry (2 slots) when empty; rejects cavalry after a warrior is aboard', () => {
    const base = state();

    const emptyUnits: Record<string, Unit> = {
      'transport-e': unit({ id: 'transport-e', type: 'transport', position: { q: 1, r: 0 }, movementPointsLeft: 3, cargoUnitIds: [] }),
      'cavalry-1': unit({ id: 'cavalry-1', type: 'cavalry', position: { q: 0, r: 0 } }),
    };
    const emptyState = {
      ...base,
      units: emptyUnits,
      civilizations: { ...base.civilizations, player: { ...base.civilizations.player, units: Object.keys(emptyUnits) } },
    };
    expect(canLoadUnitOntoTransport(emptyState, 'cavalry-1', 'transport-e')).toEqual({ ok: true });

    const partialUnits: Record<string, Unit> = {
      'warrior-aboard': unit({
        id: 'warrior-aboard', type: 'warrior', position: { q: 1, r: 0 },
        transportId: 'transport-p', hasMoved: true, hasActed: true, movementPointsLeft: 0,
      }),
      'transport-p': unit({ id: 'transport-p', type: 'transport', position: { q: 1, r: 0 }, movementPointsLeft: 3, cargoUnitIds: ['warrior-aboard'] }),
      'cavalry-1': unit({ id: 'cavalry-1', type: 'cavalry', position: { q: 0, r: 0 } }),
    };
    const partialState = {
      ...base,
      units: partialUnits,
      civilizations: { ...base.civilizations, player: { ...base.civilizations.player, units: Object.keys(partialUnits) } },
    };
    expect(getTransportCargoUsed(partialState, 'transport-p')).toBe(1);
    expect(canLoadUnitOntoTransport(partialState, 'cavalry-1', 'transport-p')).toEqual({
      ok: false, reason: 'no-capacity', message: 'No room on this Transport',
    });
  });

});
