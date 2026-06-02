import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, HexTile, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
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
    const loaded = loadUnitOntoTransport(state(), 'warrior-1', 'transport-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const result = canLoadUnitOntoTransport(loaded.state, 'worker-1', 'transport-1');

    expect(result).toEqual({ ok: false, reason: 'no-capacity', message: 'No room on this Transport' });
    expect(getTransportCargoUsed(loaded.state, 'transport-1')).toBe(1);
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
    const destinations = getUnloadDestinations(loaded.state, 'transport-1').map(hexKey);
    expect(destinations).toContain('0,1');

    const result = unloadUnitFromTransport(loaded.state, 'transport-1', 'warrior-1', { q: 0, r: 1 });

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
});
