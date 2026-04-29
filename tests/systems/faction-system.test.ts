import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState, City, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import {
  canGarrisonCity,
  computeUnrestPressure,
  getCityAppeaseCost,
  getUnrestYieldMultiplier,
  isCityProductionLocked,
  processFactionTurn,
} from '@/systems/faction-system';

function makeCity(id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  return {
    id,
    name: id,
    owner,
    position,
    population: 4,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    grid: [[null]],
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    ...overrides,
  };
}

function makeState({
  cityCount = 1,
  cityPosition = { q: 0, r: 0 },
  capitalPosition = { q: 0, r: 0 },
  conquestTurn,
  unrestLevel = 0,
  unrestTurns = 0,
  spyUnrestBonus = 0,
  atWarCount = 0,
  unitPositions = [] as HexCoord[],
  era = 2,
}: {
  cityCount?: number;
  cityPosition?: HexCoord;
  capitalPosition?: HexCoord;
  conquestTurn?: number;
  unrestLevel?: 0 | 1 | 2;
  unrestTurns?: number;
  spyUnrestBonus?: number;
  atWarCount?: number;
  unitPositions?: HexCoord[];
  era?: number;
} = {}): GameState {
  const civId = 'player';
  const city: City = makeCity('city-1', civId, cityPosition, {
    conquestTurn,
    unrestLevel,
    unrestTurns,
    spyUnrestBonus,
  });
  const capital: City = makeCity('capital', civId, capitalPosition, {
    name: 'Capital',
  });

  const cities: Record<string, City> = {
    [capital.id]: capital,
    [city.id]: city,
  };

  for (let i = 2; i <= cityCount; i++) {
    cities[`city-${i}`] = makeCity(`city-${i}`, civId, { q: i * 2, r: 0 });
  }

  const units: Record<string, GameState['units'][string]> = {};
  unitPositions.forEach((position, idx) => {
    units[`unit-${idx + 1}`] = {
      id: `unit-${idx + 1}`,
      type: 'warrior',
      owner: civId,
      position,
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
  });

  return {
    turn: 10,
    era,
    currentPlayer: civId,
    gameOver: false,
    winner: null,
    map: {
      width: 20,
      height: 20,
      tiles: Object.fromEntries([
        [hexKey(capital.position), {
          coord: capital.position,
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: civId,
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        }],
        [hexKey(city.position), {
          coord: city.position,
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: civId,
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        }],
      ]),
      wrapsHorizontally: false,
      rivers: [],
    },
    units,
    cities,
    civilizations: {
      [civId]: {
        id: civId,
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: Object.keys(cities),
        units: Object.keys(units),
        techState: {
          completed: [],
          currentResearch: null,
          researchProgress: 0,
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          ...createDiplomacyState(['player', 'ai-1'], 'player'),
          atWarWith: Array.from({ length: atWarCount }, (_, i) => `ai-${i + 1}`),
        },
      },
      'ai-1': {
        id: 'ai-1',
        name: 'Opponent',
        color: '#d94a4a',
        isHuman: false,
        civType: 'rome',
        cities: [],
        units: [],
        techState: {
          completed: [],
          currentResearch: null,
          researchProgress: 0,
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState(['player', 'ai-1'], 'ai-1'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
  } as GameState;
}

function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

describe('faction-system', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('computes unrest pressure from overextension, distance, conquest, war weariness, and spy pressure', () => {
    const state = makeState({
      cityCount: 21,
      cityPosition: { q: 10, r: 0 },
      capitalPosition: { q: 0, r: 0 },
      conquestTurn: 0,
      spyUnrestBonus: 7,
      atWarCount: 3,
    });

    expect(computeUnrestPressure('city-1', state)).toBe(96);
  });

  it('starts unrest when pressure crosses the trigger threshold', () => {
    const state = makeState({
      cityCount: 1,
      conquestTurn: 0,
      spyUnrestBonus: 20,
    });

    const events: Array<{ type: string; cityId: string }> = [];
    bus.on('faction:unrest-started', payload => events.push({ type: 'unrest-started', cityId: payload.cityId }));

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].unrestLevel).toBe(1);
    expect(result.cities['city-1'].unrestTurns).toBe(0);
    expect(events).toEqual([{ type: 'unrest-started', cityId: 'city-1' }]);
  });

  it('does not start unrest in Era 1 even when pressure is critical', () => {
    const state = makeState({
      era: 1,
      cityCount: 21,
      conquestTurn: 0,
      spyUnrestBonus: 30,
      atWarCount: 3,
    });

    const events: string[] = [];
    bus.on('faction:unrest-started', payload => events.push(payload.cityId));
    bus.on('faction:revolt-started', payload => events.push(payload.cityId));
    bus.on('faction:breakaway-started', payload => events.push(payload.cityId));

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].unrestLevel).toBe(0);
    expect(result.cities['city-1'].unrestTurns).toBe(0);
    expect(events).toEqual([]);
  });

  it('clears existing unrest state in Era 1 instead of preserving penalties from saves', () => {
    const state = makeState({
      era: 1,
      unrestLevel: 2,
      unrestTurns: 7,
      spyUnrestBonus: 15,
    });

    const events: string[] = [];
    bus.on('faction:critical-status', payload => events.push(payload.cityId));
    bus.on('faction:unrest-resolved', payload => events.push(payload.cityId));

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1']).toMatchObject({
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    });
    expect(events).toEqual([]);
  });

  it('emits a recurring critical status for an ongoing unrest city', () => {
    const state = makeState({
      cityCount: 21,
      unrestLevel: 1,
      unrestTurns: 1,
      spyUnrestBonus: 20,
      atWarCount: 2,
    });

    const events: Array<{ cityId: string; owner: string; status: string }> = [];
    bus.on('faction:critical-status', event => events.push(event));

    processFactionTurn(state, bus);

    expect(events).toEqual([
      { cityId: 'city-1', owner: 'player', status: 'unrest' },
    ]);
  });

  it('does not emit recurring critical status when unrest stabilizes that turn', () => {
    const state = makeState({
      cityCount: 1,
      unrestLevel: 1,
      unrestTurns: 3,
      spyUnrestBonus: 0,
    });

    const criticalEvents: string[] = [];
    const resolvedEvents: string[] = [];
    bus.on('faction:critical-status', payload => criticalEvents.push(payload.cityId));
    bus.on('faction:unrest-resolved', payload => resolvedEvents.push(payload.cityId));

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].unrestLevel).toBe(0);
    expect(resolvedEvents).toEqual(['city-1']);
    expect(criticalEvents).toEqual([]);
  });

  it('emits recurring critical status for a revolt only when it remains unresolved', () => {
    const state = makeState({
      cityCount: 21,
      cityPosition: { q: 3, r: 3 },
      unrestLevel: 2,
      unrestTurns: 0,
      spyUnrestBonus: 20,
      atWarCount: 2,
    });

    const events: Array<{ cityId: string; owner: string; status: string }> = [];
    bus.on('faction:critical-status', event => events.push(event));

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].unrestLevel).toBe(2);
    expect(events).toEqual([
      { cityId: 'city-1', owner: 'player', status: 'revolt' },
    ]);
  });

  it('escalates unrest to revolt after enough turns and spawns rebel units', () => {
    const cityPos = { q: 5, r: 5 };
    const state = makeState({
      cityCount: 21,
      cityPosition: cityPos,
      unrestLevel: 1,
      unrestTurns: 4,
      spyUnrestBonus: 7,
      atWarCount: 1,
    });

    for (const coord of [
      { q: 6, r: 5 },
      { q: 4, r: 5 },
      { q: 5, r: 6 },
      { q: 5, r: 4 },
      { q: 6, r: 4 },
      { q: 4, r: 6 },
    ]) {
      state.map.tiles[hexKey(coord)] = {
        coord,
        terrain: 'plains',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }

    const events: string[] = [];
    bus.on('faction:revolt-started', payload => events.push(payload.cityId));

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].unrestLevel).toBe(2);
    expect(result.cities['city-1'].unrestTurns).toBe(0);
    expect(events).toEqual(['city-1']);
    const rebelUnits = Object.values(result.units).filter(unit => unit.owner === 'rebels');
    expect(rebelUnits.length).toBeGreaterThan(0);
    for (const unit of rebelUnits) {
      const dq = Math.abs(unit.position.q - cityPos.q);
      const dr = Math.abs(unit.position.r - cityPos.r);
      expect(dq + dr).toBeLessThanOrEqual(2);
    }
  });

  it('resolves revolt once rebel pressure is gone and the city pressure drops', () => {
    const state = makeState({
      cityCount: 2,
      cityPosition: { q: 3, r: 3 },
      unrestLevel: 2,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    });

    const events: string[] = [];
    const criticalEvents: string[] = [];
    bus.on('faction:unrest-resolved', payload => events.push(payload.cityId));
    bus.on('faction:critical-status', payload => criticalEvents.push(payload.cityId));

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].unrestLevel).toBe(0);
    expect(events).toEqual(['city-1']);
    expect(criticalEvents).toEqual([]);
  });

  it('does not resolve revolt from a garrison alone while pressure remains high', () => {
    const state = makeState({
      cityCount: 21,
      cityPosition: { q: 3, r: 3 },
      unrestLevel: 2,
      unrestTurns: 0,
      spyUnrestBonus: 20,
      atWarCount: 2,
      unitPositions: [{ q: 3, r: 3 }],
    });

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].unrestLevel).toBe(2);
  });

  it('hands an unresolved revolt to breakaway creation instead of leaving it permanent', () => {
    const state = makeState({
      cityCount: 14,
      unrestLevel: 2,
      unrestTurns: 10,
      cityPosition: { q: 6, r: 6 },
    });

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].owner).not.toBe('player');
  });

  it('clears conquestTurn after the unrest window expires', () => {
    const state = makeState({
      conquestTurn: 0,
    });
    state.turn = 15;

    const result = processFactionTurn(state, bus);

    expect(result.cities['city-1'].conquestTurn).toBeUndefined();
  });

  it('reports helper values for appease cost and production penalties', () => {
    const stable = makeCity('stable', 'player', { q: 0, r: 0 });
    const unrest = { ...stable, unrestLevel: 1 as const };
    const revolt = { ...stable, unrestLevel: 2 as const };

    expect(getCityAppeaseCost(stable)).toBe(60);
    expect(getUnrestYieldMultiplier(stable)).toBe(1);
    expect(getUnrestYieldMultiplier(unrest)).toBe(0.75);
    expect(getUnrestYieldMultiplier(revolt)).toBe(0.5);
    expect(isCityProductionLocked(stable)).toBe(false);
    expect(isCityProductionLocked(unrest)).toBe(false);
    expect(isCityProductionLocked(revolt)).toBe(true);
  });

  it('detects a garrisoned city', () => {
    const state = makeState({
      unitPositions: [{ q: 0, r: 0 }],
    });

    expect(canGarrisonCity('city-1', state)).toBe(true);
  });
});
