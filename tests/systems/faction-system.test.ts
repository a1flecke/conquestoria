import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState, City, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import {
  REVOLT_UNREST_TURNS,
  BREAKAWAY_REVOLT_TURNS,
  CONCESSION_IMMUNITY_TURNS,
  CONCESSION_COST_MULTIPLIER,
  CONCESSION_COST_MULTIPLIER_CIVICS,
  appeaseFaction,
  canGarrisonCity,
  computeUnrestPressure,
  concedeToMovement,
  getCityAppeaseCost,
  getConcessionCost,
  getContagionSpread,
  getCityHappinessFromBuildings,
  UNREST_RELIEF_SOURCES,
  getUnrestPressureBreakdown,
  getUnrestYieldMultiplier,
  isCityProductionLocked,
  processFactionTurn,
  BUREAUCRACY_TECH_ID,
  BUREAUCRACY_MAX_RELIEF,
  OVEREXTENSION_FREE_CITIES,
} from '@/systems/faction-system';
import { BUILDINGS } from '@/systems/city-system';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';

function completedTechsForEra(era: number): string[] {
  return Array.from({ length: Math.max(0, era - 1) }, (_, index) => index + 2)
    .flatMap(candidate => {
      const techs = getEraAdvancementTechs(candidate);
      const required = Math.ceil(techs.length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55));
      return techs.slice(0, required).map(tech => tech.id);
    });
}

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
          completed: completedTechsForEra(era),
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
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;
}

function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

function addBuilding(state: GameState, cityId: string, buildingId: string): GameState {
  const city = state.cities[cityId];
  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...city, buildings: [...city.buildings, buildingId] },
    },
  };
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

  it('ignores treasury strain before Era 3 so the early game stays forgiving', () => {
    const state = makeState({ era: 2 });
    state.economyStatusByCiv = {
      player: {
        turn: state.turn,
        grossGoldIncome: 0,
        buildingMaintenance: 0,
        unitMaintenance: 30,
        netGoldPerTurn: -30,
        unpaidMaintenance: 30,
        strainLevel: 'critical',
      },
    };

    expect(computeUnrestPressure('city-1', state)).toBe(0);
  });

  it('adds treasury strain pressure from Era 3 onward', () => {
    const state = makeState({ era: 3 });
    state.economyStatusByCiv = {
      player: {
        turn: state.turn,
        grossGoldIncome: 0,
        buildingMaintenance: 0,
        unitMaintenance: 30,
        netGoldPerTurn: -30,
        unpaidMaintenance: 30,
        strainLevel: 'critical',
      },
    };

    expect(computeUnrestPressure('city-1', state)).toBe(20);
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
      unrestTurns: REVOLT_UNREST_TURNS - 1,
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

  describe('#524 MR2 — constitutional-law reduces recent-conquest unrest', () => {
    it('halves the Recent conquest pressure row when the owner has constitutional-law', () => {
      const state = makeState({ conquestTurn: 0 });
      const stateWithTech: GameState = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: {
            ...state.civilizations['player'],
            techState: { ...state.civilizations['player'].techState, completed: ['constitutional-law'] },
          },
        },
      };

      const withoutTech = getUnrestPressureBreakdown('city-1', state).find(r => r.label === 'Recent conquest');
      const withTech = getUnrestPressureBreakdown('city-1', stateWithTech).find(r => r.label === 'Recent conquest');

      expect(withoutTech?.amount).toBe(25);
      expect(withTech?.amount).toBe(13);
    });

    it('does not reduce Recent conquest pressure for a different civ\'s tech', () => {
      const state = makeState({ conquestTurn: 0 });
      const stateWithOtherCivTech: GameState = {
        ...state,
        civilizations: {
          ...state.civilizations,
          'ai-1': {
            ...state.civilizations['ai-1'],
            techState: { ...state.civilizations['ai-1'].techState, completed: ['constitutional-law'] },
          },
        },
      };

      const rows = getUnrestPressureBreakdown('city-1', stateWithOtherCivTech);
      expect(rows.find(r => r.label === 'Recent conquest')?.amount).toBe(25);
    });

    it('changes the actual unrest-escalation outcome at the trigger boundary', () => {
      // Recent conquest (25) + war weariness (2 wars * 8 = 16) = 41 > UNREST_TRIGGER_PRESSURE (40):
      // crosses the trigger without the tech. With constitutional-law, Recent conquest
      // halves to 13, so 13 + 16 = 29 stays under the trigger — proving the row-value
      // change actually flips processFactionTurn's real escalation decision, not just
      // the isolated breakdown number.
      const stateWithoutTech = makeState({ conquestTurn: 0, atWarCount: 2 });
      const resultWithoutTech = processFactionTurn(stateWithoutTech, bus);
      expect(resultWithoutTech.cities['city-1'].unrestLevel).toBe(1);

      const stateWithTech: GameState = {
        ...stateWithoutTech,
        civilizations: {
          ...stateWithoutTech.civilizations,
          player: {
            ...stateWithoutTech.civilizations['player'],
            techState: { ...stateWithoutTech.civilizations['player'].techState, completed: ['constitutional-law'] },
          },
        },
      };
      const resultWithTech = processFactionTurn(stateWithTech, bus);
      expect(resultWithTech.cities['city-1'].unrestLevel).toBe(0);
    });
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

describe('#927 Regional Capital unrest relief', () => {
  it('keeps the capital distance row while adding bounded nearest-seat relief', () => {
    const state = makeState({ cityPosition: { q: 10, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 4 });
    state.cities.seat = makeCity('seat', 'player', { q: 9, r: 0 }, { buildings: ['regional_capital'] });
    state.civilizations.player.cities.push('seat');
    state.builtNationalProjects = {
      'player:regional_capital': { civId: 'player', cityId: 'seat', eraBuilt: 4 },
    };

    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows).toContainEqual({ label: 'Distance from capital', amount: 10 });
    expect(rows).toContainEqual({ label: 'Regional Capital administration', amount: -8 });
  });
});

describe('#927 Bureaucracy unrest relief', () => {
  function withCompleted(state: GameState, techIds: string[]): GameState {
    return {
      ...state,
      civilizations: {
        ...state.civilizations,
        player: {
          ...state.civilizations.player,
          techState: { ...state.civilizations.player.techState, completed: techIds },
        },
      },
    };
  }

  it('adds no Bureaucratic administration row without the tech, even in a wide empire', () => {
    // cityCount 8 -> 9 total cities -> overextension (9-6)*3 = 9.
    const state = withCompleted(makeState({ cityCount: 8, cityPosition: { q: 0, r: 0 }, era: 6 }), []);
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows).toContainEqual({ label: 'Empire overextension', amount: 9 });
    expect(rows.find(r => r.label === 'Bureaucratic administration')).toBeUndefined();
  });

  it('adds no relief when the empire is still within the base free-city allowance', () => {
    // Default cityCount=1 -> 2 total cities -> no Empire overextension row at all.
    const state = withCompleted(makeState({ cityPosition: { q: 0, r: 0 }, era: 6 }), [BUREAUCRACY_TECH_ID]);
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows.find(r => r.label === 'Empire overextension')).toBeUndefined();
    expect(rows.find(r => r.label === 'Bureaucratic administration')).toBeUndefined();
  });

  it('grants bounded relief once researched, leaving a residual floor and the base row untouched', () => {
    // 9 total cities -> overextension = 9. With the tech, hypothetical allowance is
    // OVEREXTENSION_FREE_CITIES + 3 = 9, so hypothetical overextension = 0 and raw
    // relief = 9, capped by the shared 2-point sprawl floor: min(9, 9, 9-2) = 7.
    const state = withCompleted(makeState({ cityCount: 8, cityPosition: { q: 0, r: 0 }, era: 6 }), [BUREAUCRACY_TECH_ID]);
    expect(state.civilizations.player.cities.length).toBe(OVEREXTENSION_FREE_CITIES + 3);
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows).toContainEqual({ label: 'Empire overextension', amount: 9 });
    expect(rows).toContainEqual({ label: 'Bureaucratic administration', amount: -7 });
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    expect(total).toBeGreaterThanOrEqual(2); // residual sprawl floor
  });

  it('never grants more than BUREAUCRACY_MAX_RELIEF across a sweep of wide empire sizes', () => {
    for (const cityCount of [6, 8, 10, 14, 20, 30]) {
      const state = withCompleted(makeState({ cityCount, cityPosition: { q: 0, r: 0 }, era: 6 }), [BUREAUCRACY_TECH_ID]);
      const rows = getUnrestPressureBreakdown('city-1', state);
      const relief = -(rows.find(r => r.label === 'Bureaucratic administration')?.amount ?? 0);
      expect(relief).toBeLessThanOrEqual(BUREAUCRACY_MAX_RELIEF);
    }
  });

  it('leaves the positive Distance from capital row unchanged and does not relieve it', () => {
    const state = withCompleted(
      makeState({ cityCount: 8, cityPosition: { q: 10, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 6 }),
      [BUREAUCRACY_TECH_ID],
    );
    const rows = getUnrestPressureBreakdown('city-1', state);
    // Distance row: min(20, max(0,(10-5)*2)) = 10, unaffected by Bureaucracy.
    expect(rows).toContainEqual({ label: 'Distance from capital', amount: 10 });
    expect(rows).toContainEqual({ label: 'Empire overextension', amount: 9 });
    expect(rows).toContainEqual({ label: 'Bureaucratic administration', amount: -9 });
  });

  it('does not touch war weariness or recent conquest', () => {
    const state = withCompleted(
      makeState({ cityCount: 8, cityPosition: { q: 0, r: 0 }, era: 6, atWarCount: 2, conquestTurn: 9 }),
      [BUREAUCRACY_TECH_ID],
    );
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows).toContainEqual({ label: 'War weariness', amount: 16 });
    expect(rows).toContainEqual({ label: 'Recent conquest', amount: 25 });
    expect(rows.filter(r => r.label === 'Bureaucratic administration')).toHaveLength(1);
  });

  it('an unrelated era-6 tech grants no relief', () => {
    const state = withCompleted(makeState({ cityCount: 8, cityPosition: { q: 0, r: 0 }, era: 6 }), ['parliamentary-reform']);
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows.find(r => r.label === 'Bureaucratic administration')).toBeUndefined();
  });

  it('stacks with Courthouse without erasing all overextension pressure (shared residual floor)', () => {
    let state = withCompleted(makeState({ cityCount: 8, cityPosition: { q: 0, r: 0 }, era: 6 }), [BUREAUCRACY_TECH_ID]);
    state = { ...state, cities: { ...state.cities, 'city-1': { ...state.cities['city-1'], buildings: ['courthouse'] } } };
    const rows = getUnrestPressureBreakdown('city-1', state);
    const overextension = rows.find(r => r.label === 'Empire overextension')!.amount;
    const totalRelief = rows.filter(r => r.amount < 0).reduce((sum, r) => sum + r.amount, 0);
    expect(overextension + totalRelief).toBeGreaterThanOrEqual(2);
  });

  it('is owner-scoped: a same-sized second civ without the tech gets no relief (hot-seat isolation)', () => {
    let state = withCompleted(makeState({ cityCount: 8, cityPosition: { q: 0, r: 0 }, era: 6 }), [BUREAUCRACY_TECH_ID]);
    // Give ai-1 an equally wide, equally overextended empire but no researched tech.
    const aiCities: Record<string, City> = {};
    for (let i = 1; i <= 9; i++) {
      aiCities[`ai1-city-${i}`] = makeCity(`ai1-city-${i}`, 'ai-1', { q: i * 3, r: 5 });
    }
    state = {
      ...state,
      cities: { ...state.cities, ...aiCities },
      civilizations: {
        ...state.civilizations,
        'ai-1': { ...state.civilizations['ai-1'], cities: Object.keys(aiCities) },
      },
    };

    const playerRows = getUnrestPressureBreakdown('city-1', state);
    expect(playerRows.find(r => r.label === 'Bureaucratic administration')).toBeDefined();

    const aiRows = getUnrestPressureBreakdown('ai1-city-1', state);
    expect(aiRows).toContainEqual({ label: 'Empire overextension', amount: 9 });
    expect(aiRows.find(r => r.label === 'Bureaucratic administration')).toBeUndefined();
  });
});

describe('appeaseFaction', () => {
  it('deducts gold, resets spyUnrestBonus, reduces unrestTurns by 2 (floor 0), downgrades unrestLevel 2→1', () => {
    const state = makeState({ unrestLevel: 2, unrestTurns: 1, spyUnrestBonus: 8 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(true);
    const city = result.state.cities['city-1'];
    expect(city.unrestLevel).toBe(1);
    expect(city.unrestTurns).toBe(0);
    expect(city.spyUnrestBonus).toBe(0);
    expect(result.state.civilizations['player'].gold).toBe(100 - getCityAppeaseCost(city));
  });

  it('does not downgrade unrestLevel below 1 (matches existing AI behavior: 2→1 only, never →0)', () => {
    const state = makeState({ unrestLevel: 1, unrestTurns: 3 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(true);
    expect(result.state.cities['city-1'].unrestLevel).toBe(1);
  });

  it('fails and returns unchanged state when city has no unrest', () => {
    const state = makeState({ unrestLevel: 0 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(false);
    expect(result.state).toBe(state);
  });

  it('fails and returns unchanged state when civ cannot afford the cost', () => {
    const state = makeState({ unrestLevel: 1, unrestTurns: 2 });
    state.civilizations['player'].gold = 10; // cost is 60 at default population 4
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(false);
    expect(result.state).toBe(state);
  });

  it('fails on a second call the same turn (spam-click guard) even though unrest and gold both still qualify', () => {
    const state = makeState({ unrestLevel: 2, unrestTurns: 5 });
    const first = appeaseFaction(state, 'city-1', 'player');
    expect(first.success).toBe(true);
    const second = appeaseFaction(first.state, 'city-1', 'player');
    expect(second.success).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('sets appeasedOnTurn to the current turn on success', () => {
    const state = makeState({ unrestLevel: 1, unrestTurns: 2 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.state.cities['city-1'].appeasedOnTurn).toBe(state.turn);
  });

  it('allows appeasing again on a later turn', () => {
    const state = makeState({ unrestLevel: 2, unrestTurns: 5 });
    const first = appeaseFaction(state, 'city-1', 'player');
    expect(first.success).toBe(true);
    // Re-fund and re-trigger unrest so the second call has both gold and a
    // reason to appease — isolates the turn-guard behavior from affordability.
    const laterState = {
      ...first.state,
      turn: first.state.turn + 1,
      civilizations: {
        ...first.state.civilizations,
        player: { ...first.state.civilizations['player'], gold: 1000 },
      },
      cities: {
        ...first.state.cities,
        'city-1': { ...first.state.cities['city-1'], unrestLevel: 1 as const },
      },
    };
    const second = appeaseFaction(laterState, 'city-1', 'player');
    expect(second.success).toBe(true);
  });
});

describe('faction-system constant exports and era-gating', () => {
  it('REVOLT_UNREST_TURNS is exported and equals 10', () => {
    expect(REVOLT_UNREST_TURNS).toBe(10);
  });

  it('BREAKAWAY_REVOLT_TURNS is exported and equals 10', () => {
    expect(BREAKAWAY_REVOLT_TURNS).toBe(10);
  });

  it('processFactionTurn clears unrest in era 1 (era-gating active)', () => {
    const bus = new EventBus();
    const state = makeState({ era: 1, unrestLevel: 1, unrestTurns: 3 });
    const result = processFactionTurn(state, bus);
    expect(result.cities['city-1']?.unrestLevel).toBe(0);
    expect(result.cities['city-1']?.unrestTurns).toBe(0);
  });

  it('processFactionTurn does NOT clear unrest in era 2 (era-gating lifts)', () => {
    const bus = new EventBus();
    // cityCount:12 → 13 total cities → empire pressure (13-6)*3=21; 3 wars → 24; total 45 > 40
    // (#919 MR2 raised the overextension free-city allowance to 6, so cityCount was bumped
    // 10 → 12 to keep this fixture above the trigger.)
    // City starts at unrestLevel 1, era 2 — processFactionTurn should NOT zero it out
    const state = makeState({ era: 2, unrestLevel: 1, unrestTurns: 1, atWarCount: 3, cityCount: 12 });
    const result = processFactionTurn(state, bus);
    // With pressure > 40 and no garrison, city stays in unrest (not cleared by clearEraOneUnrest)
    expect(result.cities['city-1']?.unrestLevel).not.toBe(0);
  });
});

describe('faction-system — MR4 uprising contagion + concession', () => {
  // city-1 sits at {q:0,r:0}; adds a same-owner neighbor at {q:2,r:0} (hex distance 2,
  // within CONTAGION_GROUP_RANGE=3) already in revolt, so city-1 is the contagion receiver.
  function withRevoltingNeighbor(state: GameState, overrides: Partial<City> = {}): GameState {
    const neighbor: City = {
      id: 'city-2',
      name: 'city-2',
      owner: 'player',
      position: { q: 2, r: 0 },
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
      unrestLevel: 2,
      unrestTurns: 5,
      spyUnrestBonus: 0,
      ...overrides,
    };
    return {
      ...state,
      cities: { ...state.cities, [neighbor.id]: neighbor },
      civilizations: {
        ...state.civilizations,
        player: { ...state.civilizations['player'], cities: [...state.civilizations['player'].cities, neighbor.id] },
      },
    };
  }

  describe('getContagionSpread / computeUnrestPressure contagion term', () => {
    it('adds pressure from a same-owner revolting neighbor within range', () => {
      const state = withRevoltingNeighbor(makeState({ era: 2 }));
      const spread = getContagionSpread('city-1', state);
      expect(spread.pressure).toBeGreaterThan(0);
      expect(spread.nearestCityId).toBe('city-2');
      // standard challenge: 8 * 1.0 multiplier = 8
      expect(spread.pressure).toBe(8);
    });

    it('is skipped entirely when the receiving city is garrisoned', () => {
      const state = withRevoltingNeighbor(
        makeState({ era: 2, unitPositions: [{ q: 0, r: 0 }] }),
      );
      const spread = getContagionSpread('city-1', state);
      expect(spread.pressure).toBe(0);
      expect(spread.nearestCityId).toBeNull();
    });

    it('is skipped entirely during concession immunity', () => {
      let state = withRevoltingNeighbor(makeState({ era: 2 }));
      state = {
        ...state,
        cities: {
          ...state.cities,
          'city-1': { ...state.cities['city-1'], concessionImmunityUntilTurn: state.turn + 5 },
        },
      };
      const spread = getContagionSpread('city-1', state);
      expect(spread.pressure).toBe(0);
      expect(spread.nearestCityId).toBeNull();
    });

    it('halves the term for an explorer-challenge owner', () => {
      let state = withRevoltingNeighbor(makeState({ era: 2 }));
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: { ...state.civilizations['player'], challenge: 'explorer' },
        },
      };
      const spread = getContagionSpread('city-1', state);
      // explorer multiplier 0.5: 8 * 0.5 = 4
      expect(spread.pressure).toBe(4);
    });

    it('resolves AI-owned cities to the game-wide challenge, not a per-civ setting', () => {
      let state = withRevoltingNeighbor(makeState({ era: 2 }), { owner: 'ai-1' });
      state = {
        ...state,
        cities: {
          ...state.cities,
          'city-1': { ...state.cities['city-1'], owner: 'ai-1' },
        },
        opponentChallenge: 'veteran',
      };
      const spread = getContagionSpread('city-1', state);
      // ai-1 is not human, so it must resolve to state.opponentChallenge ('veteran': 1.3x)
      // rather than any per-civ `challenge` field, even if one were set on it.
      expect(spread.pressure).toBeCloseTo(8 * 1.3, 5);
    });

    it('contributes to computeUnrestPressure total', () => {
      const withNeighbor = withRevoltingNeighbor(makeState({ era: 2 }));
      const withoutNeighbor = makeState({ era: 2 });
      expect(computeUnrestPressure('city-1', withNeighbor)).toBe(
        computeUnrestPressure('city-1', withoutNeighbor) + 8,
      );
    });

    it('emits faction:contagion-spread exactly once on crossing into unrest, not every turn', () => {
      const bus = new EventBus();
      const events: Array<{ fromCityId: string; toCityId: string }> = [];
      bus.on('faction:contagion-spread', payload => events.push(payload));

      // conquestTurn:0 + spyUnrestBonus:20 alone already crosses the trigger threshold
      // (same recipe as the "starts unrest" test above: 25 + 20 = 45 > 40); contagion
      // (+8) rides along on the same crossing rather than being required to cause it.
      const state = withRevoltingNeighbor(
        makeState({ era: 2, conquestTurn: 0, spyUnrestBonus: 20 }),
      );
      const afterFirstTurn = processFactionTurn(state, bus);
      expect(afterFirstTurn.cities['city-1'].unrestLevel).toBe(1);
      expect(events).toEqual([{ fromCityId: 'city-2', toCityId: 'city-1', owner: 'player' }]);

      // Second turn: city-1 is already at unrestLevel 1 (not crossing from 0), so no
      // second contagion-spread event should fire even though the neighbor still radiates.
      const afterSecondTurn = processFactionTurn(afterFirstTurn, bus);
      expect(afterSecondTurn.cities['city-1'].unrestLevel).not.toBe(0);
      expect(events).toEqual([{ fromCityId: 'city-2', toCityId: 'city-1', owner: 'player' }]);
    });

    it('blocks new unrest from starting entirely while a city is under concession immunity', () => {
      const bus = new EventBus();
      let state = makeState({ era: 2, conquestTurn: 0, spyUnrestBonus: 20 });
      state = {
        ...state,
        cities: {
          ...state.cities,
          'city-1': { ...state.cities['city-1'], concessionImmunityUntilTurn: state.turn + 5 },
        },
      };
      const result = processFactionTurn(state, bus);
      expect(result.cities['city-1'].unrestLevel).toBe(0);
    });
  });

  describe('getConcessionCost / concedeToMovement', () => {
    it('costs 2x the appeasement cost by default', () => {
      const state = makeState({ era: 1, unrestLevel: 2 });
      const city = state.cities['city-1'];
      expect(CONCESSION_COST_MULTIPLIER).toBe(2);
      expect(getConcessionCost(state, city)).toBe(getCityAppeaseCost(city) * CONCESSION_COST_MULTIPLIER);
    });

    it('discounts toward — but never to parity with — Appease when the owner has a current-era civics tech (#918)', () => {
      let state = makeState({ era: 3, unrestLevel: 2 });
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: {
            ...state.civilizations['player'],
            techState: { ...state.civilizations['player'].techState, completed: [...completedTechsForEra(3), 'civil-service'] },
          },
        },
      };
      const city = state.cities['city-1'];
      const appease = getCityAppeaseCost(city);
      // 1.5x appease: civics investment is rewarded (25% off the 2x base) but
      // Concede must still cost strictly more than Appease so the two stay a
      // real choice — see #918.
      expect(CONCESSION_COST_MULTIPLIER_CIVICS).toBeGreaterThan(1);
      expect(CONCESSION_COST_MULTIPLIER_CIVICS).toBeLessThan(CONCESSION_COST_MULTIPLIER);
      expect(getConcessionCost(state, city)).toBe(Math.round(appease * CONCESSION_COST_MULTIPLIER_CIVICS));
      expect(getConcessionCost(state, city)).toBeGreaterThan(appease);
      expect(getConcessionCost(state, city)).toBeLessThan(appease * CONCESSION_COST_MULTIPLIER);
    });

    it('does not discount for a civics tech from a different era', () => {
      let state = makeState({ era: 2, unrestLevel: 2 });
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          // civil-service is era 3, but the civ is currently era 2
          player: {
            ...state.civilizations['player'],
            techState: { ...state.civilizations['player'].techState, completed: ['civil-service'] },
          },
        },
      };
      const city = state.cities['city-1'];
      expect(getConcessionCost(state, city)).toBe(getCityAppeaseCost(city) * 2);
    });

    it('never costs the same as or less than Appease for any city size, discounted or not (#918)', () => {
      const populations = [1, 2, 3, 5, 8];

      // Undiscounted (no current-era civics tech): 2x appease.
      for (const population of populations) {
        let state = makeState({ era: 1, unrestLevel: 2 });
        state = { ...state, cities: { ...state.cities, 'city-1': { ...state.cities['city-1'], population } } };
        const city = state.cities['city-1'];
        expect(getConcessionCost(state, city)).toBeGreaterThan(getCityAppeaseCost(city));
      }

      // Discounted (current-era civics tech): 1.5x appease — still strictly above parity.
      for (const population of populations) {
        let state = makeState({ era: 3, unrestLevel: 2 });
        state = {
          ...state,
          civilizations: {
            ...state.civilizations,
            player: {
              ...state.civilizations['player'],
              techState: {
                ...state.civilizations['player'].techState,
                completed: [...completedTechsForEra(3), 'civil-service'],
              },
            },
          },
          cities: { ...state.cities, 'city-1': { ...state.cities['city-1'], population } },
        };
        const city = state.cities['city-1'];
        expect(getConcessionCost(state, city)).toBeGreaterThan(getCityAppeaseCost(city));
      }
    });

    it('fully clears unrest and sets immunity on success', () => {
      let state = makeState({ unrestLevel: 2, unrestTurns: 8, spyUnrestBonus: 12 });
      // Concession costs 2x appeasement (120 for a pop-4 city) — the default 100 gold isn't enough.
      state = { ...state, civilizations: { ...state.civilizations, player: { ...state.civilizations['player'], gold: 1000 } } };
      const result = concedeToMovement(state, 'city-1', 'player');
      expect(result.success).toBe(true);
      const city = result.state.cities['city-1'];
      expect(city.unrestLevel).toBe(0);
      expect(city.unrestTurns).toBe(0);
      expect(city.spyUnrestBonus).toBe(0);
      expect(city.concessionImmunityUntilTurn).toBe(state.turn + CONCESSION_IMMUNITY_TURNS);
    });

    it('fails with no unrest to concede', () => {
      const state = makeState({ unrestLevel: 0 });
      const result = concedeToMovement(state, 'city-1', 'player');
      expect(result.success).toBe(false);
    });

    it('charges exactly the civics-discounted cost when the owner has a current-era civics tech (#918)', () => {
      let state = makeState({ era: 3, unrestLevel: 2 });
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: {
            ...state.civilizations['player'],
            gold: 1000,
            techState: { ...state.civilizations['player'].techState, completed: [...completedTechsForEra(3), 'civil-service'] },
          },
        },
      };
      const discounted = getConcessionCost(state, state.cities['city-1']);
      // Sanity: this really is the discounted path, strictly above the Appease cost.
      expect(discounted).toBe(Math.round(getCityAppeaseCost(state.cities['city-1']) * CONCESSION_COST_MULTIPLIER_CIVICS));
      expect(discounted).toBeGreaterThan(getCityAppeaseCost(state.cities['city-1']));

      // Exactly affordable → succeeds and deducts exactly the discounted amount.
      const exact = { ...state, civilizations: { ...state.civilizations, player: { ...state.civilizations['player'], gold: discounted } } };
      const ok = concedeToMovement(exact, 'city-1', 'player');
      expect(ok.success).toBe(true);
      expect(ok.state.civilizations['player'].gold).toBe(0);

      // One gold short → fails, no charge.
      const short = { ...state, civilizations: { ...state.civilizations, player: { ...state.civilizations['player'], gold: discounted - 1 } } };
      const fail = concedeToMovement(short, 'city-1', 'player');
      expect(fail.success).toBe(false);
      expect(fail.state.civilizations['player'].gold).toBe(discounted - 1);
    });

    it('fails when the civ cannot afford the cost', () => {
      let state = makeState({ unrestLevel: 2 });
      state = {
        ...state,
        civilizations: { ...state.civilizations, player: { ...state.civilizations['player'], gold: 0 } },
      };
      const result = concedeToMovement(state, 'city-1', 'player');
      expect(result.success).toBe(false);
    });

    it('prevents new unrest from starting again while immunity is active (integration)', () => {
      const bus = new EventBus();
      let state = makeState({ unrestLevel: 2, unrestTurns: 8, cityCount: 21, atWarCount: 3 });
      state = { ...state, civilizations: { ...state.civilizations, player: { ...state.civilizations['player'], gold: 1000 } } };
      const conceded = concedeToMovement(state, 'city-1', 'player');
      expect(conceded.success).toBe(true);
      const result = processFactionTurn(conceded.state, bus);
      expect(result.cities['city-1'].unrestLevel).toBe(0);
    });

    it('leaves appeasement available and unchanged (still suppresses, not permanent)', () => {
      const state = makeState({ unrestLevel: 2, unrestTurns: 5 });
      const result = appeaseFaction(state, 'city-1', 'player');
      expect(result.success).toBe(true);
      // Appease only downgrades revolt to unrest — it does not fully clear it or set immunity.
      expect(result.state.cities['city-1'].unrestLevel).toBe(1);
      expect(result.state.cities['city-1'].concessionImmunityUntilTurn).toBeUndefined();
    });
  });
});

describe('building happiness (#552)', () => {
  it('a temple reduces its own city\'s pressure by 2', () => {
    const state = makeState({ cityCount: 6 }); // cityCount 6 gives nonzero overextension pressure so the -2 delta is observable above the 0-floor clamp
    const base = computeUnrestPressure('city-1', state, 0);
    const withTemple = computeUnrestPressure('city-1', addBuilding(state, 'city-1', 'temple'), 0);
    expect(base - withTemple).toBe(2);
  });

  it('building happiness is per-city, not empire-wide', () => {
    const state = makeState({ cityCount: 6 });
    const next = addBuilding(state, 'city-1', 'temple');
    expect(computeUnrestPressure('city-2', next, 0)).toBe(computeUnrestPressure('city-2', state, 0));
  });

  it('every building that claims happiness in its description has a happiness value, and vice versa', () => {
    for (const b of Object.values(BUILDINGS)) {
      const claims = /happiness/i.test(b.description);
      const has = (b.happiness ?? 0) > 0;
      expect(claims, `${b.id}: description claims happiness=${claims}, field has happiness=${has}`).toBe(has);
    }
  });

  it('all four designated culture buildings grant +1 happiness', () => {
    for (const id of ['temple', 'amphitheater', 'monastery', 'concert_hall']) {
      expect(BUILDINGS[id].happiness).toBe(1);
    }
  });

  it('sacred_grove (a national project) does not have a per-city happiness field', () => {
    expect(BUILDINGS['sacred_grove'].happiness).toBeUndefined();
  });

  it('getCityHappinessFromBuildings sums multiple happiness buildings', () => {
    const state = makeState({ cityCount: 1 });
    let next = addBuilding(state, 'city-1', 'temple');
    next = addBuilding(next, 'city-1', 'amphitheater');
    expect(getCityHappinessFromBuildings(next.cities['city-1'])).toBe(2);
  });

  it('a pre-MR-4 saved city with temple in buildings gets happiness on load with no migration', () => {
    // load-shaped test: buildings array is id-based, so an old save with
    // 'temple' already in city.buildings picks up the new effect automatically.
    const state = makeState({ cityCount: 6 });
    const legacyCity = addBuilding(state, 'city-1', 'temple').cities['city-1'];
    expect(getCityHappinessFromBuildings(legacyCity)).toBe(1);
  });
});

describe('unrest pressure breakdown (#552)', () => {
  it('breakdown rows sum to the pressure total (pre-clamp) for varied cities', () => {
    const state = makeState({ cityCount: 6, atWarCount: 2, unrestLevel: 0 });
    for (const cityId of Object.keys(state.cities)) {
      const rows = getUnrestPressureBreakdown(cityId, state, 0);
      const sum = rows.reduce((total, row) => total + row.amount, 0);
      expect(Math.min(100, Math.max(0, sum))).toBe(computeUnrestPressure(cityId, state, 0));
    }
  });

  it('includes an Uprising contagion row when a same-owner city nearby is in revolt', () => {
    // city-1 sits at {q:0,r:0}; add a same-owner neighbor at {q:2,r:0} (hex
    // distance 2, within CONTAGION_GROUP_RANGE=3) already in revolt, matching
    // the withRevoltingNeighbor idiom used elsewhere in this file.
    const state = makeState({ era: 2 });
    const neighbor: City = {
      ...state.cities['city-1'],
      id: 'city-2',
      name: 'city-2',
      position: { q: 2, r: 0 },
      unrestLevel: 2,
      unrestTurns: 5,
    };
    const revolting: GameState = {
      ...state,
      cities: { ...state.cities, [neighbor.id]: neighbor },
      civilizations: {
        ...state.civilizations,
        player: { ...state.civilizations['player'], cities: [...state.civilizations['player'].cities, neighbor.id] },
      },
    };
    const rows = getUnrestPressureBreakdown('city-1', revolting, 0);
    const contagionRow = rows.find(r => r.label === 'Uprising contagion');
    expect(contagionRow).toBeDefined();
    expect(contagionRow!.amount).toBeGreaterThan(0);
  });

  it('includes a Happiness buildings row with a negative amount when the city has one', () => {
    const state = makeState({ cityCount: 6 });
    const withTemple = addBuilding(state, 'city-1', 'temple');
    const rows = getUnrestPressureBreakdown('city-1', withTemple, 0);
    const row = rows.find(r => r.label === 'Happiness buildings');
    expect(row).toBeDefined();
    expect(row!.amount).toBe(-2);
  });

  describe('#591 MR4 — Religious serenity boon row', () => {
    it('adds a -2 Religious serenity row when the city follows its own civ\'s serenity-boon faith', () => {
      const state = makeState({ cityCount: 1 });
      const withFaith: GameState = {
        ...state,
        religions: { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', boon: 'serenity', foundedTurn: 1 } },
        cityFaith: { 'city-1': { religionId: 'religion-player' } },
      };
      const rows = getUnrestPressureBreakdown('city-1', withFaith, 0);
      const row = rows.find(r => r.label === 'Religious serenity');
      expect(row).toBeDefined();
      expect(row!.amount).toBe(-2);
    });

    it('does not add the row when the boon is not serenity', () => {
      const state = makeState({ cityCount: 1 });
      const withFaith: GameState = {
        ...state,
        religions: { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', boon: 'tithes', foundedTurn: 1 } },
        cityFaith: { 'city-1': { religionId: 'religion-player' } },
      };
      const rows = getUnrestPressureBreakdown('city-1', withFaith, 0);
      expect(rows.find(r => r.label === 'Religious serenity')).toBeUndefined();
    });

    it('does not add the row when the city follows a foreign civ\'s serenity faith', () => {
      const state = makeState({ cityCount: 1 });
      const withFaith: GameState = {
        ...state,
        religions: { 'religion-rival': { id: 'religion-rival', name: 'Order of Rival', ownerCivId: 'rival', boon: 'serenity', foundedTurn: 1 } },
        cityFaith: { 'city-1': { religionId: 'religion-rival' } },
      };
      const rows = getUnrestPressureBreakdown('city-1', withFaith, 0);
      expect(rows.find(r => r.label === 'Religious serenity')).toBeUndefined();
    });

    it('does not add the row when the city has no faith at all', () => {
      const state = makeState({ cityCount: 1 });
      const rows = getUnrestPressureBreakdown('city-1', state, 0);
      expect(rows.find(r => r.label === 'Religious serenity')).toBeUndefined();
    });
  });

  describe('#593 MR6 — Foreign faith pressure unrest row (human immunity)', () => {
    function withBorderingRival(state: GameState): GameState {
      const city = { ...state.cities['city-1'], position: { q: 0, r: 0 }, ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }] };
      const rivalTile: HexCoord = { q: 2, r: 0 };
      return {
        ...state,
        cities: { ...state.cities, [city.id]: city },
        map: {
          ...state.map,
          tiles: {
            ...state.map.tiles,
            '0,0': { ...state.map.tiles[hexKey(city.position)], coord: { q: 0, r: 0 }, owner: 'player' },
            '1,0': { coord: { q: 1, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
            '2,0': { coord: rivalTile, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          },
        },
      };
    }

    it('adds a +2 "Foreign faith pressure" row for a human city bordering a foreign faith owner', () => {
      const state = withBorderingRival(makeState({ cityCount: 1 }));
      const withFaith: GameState = {
        ...state,
        cityFaith: { 'city-1': { religionId: 'religion-ai-1' } },
        religions: { 'religion-ai-1': { id: 'religion-ai-1', name: 'Rival Faith', ownerCivId: 'ai-1', foundedTurn: 1 } },
      };
      const rows = getUnrestPressureBreakdown('city-1', withFaith, 0);
      expect(rows).toContainEqual({ label: 'Foreign faith pressure', amount: 2 });
    });

    it('does not add the row when the city follows its own civ faith', () => {
      const state = withBorderingRival(makeState({ cityCount: 1 }));
      const withFaith: GameState = {
        ...state,
        cityFaith: { 'city-1': { religionId: 'religion-player' } },
        religions: { 'religion-player': { id: 'religion-player', name: 'Own', ownerCivId: 'player', foundedTurn: 1 } },
      };
      const rows = getUnrestPressureBreakdown('city-1', withFaith, 0);
      expect(rows.find(r => r.label === 'Foreign faith pressure')).toBeUndefined();
    });

    it('does not add the row when territory does not border the foreign faith owner', () => {
      const state = makeState({ cityCount: 1 }); // no bordering rival tile
      const withFaith: GameState = {
        ...state,
        cityFaith: { 'city-1': { religionId: 'religion-ai-1' } },
        religions: { 'religion-ai-1': { id: 'religion-ai-1', name: 'Rival Faith', ownerCivId: 'ai-1', foundedTurn: 1 } },
      };
      const rows = getUnrestPressureBreakdown('city-1', withFaith, 0);
      expect(rows.find(r => r.label === 'Foreign faith pressure')).toBeUndefined();
    });
  });

  describe('#919 MR2 — overextension free-city allowance', () => {
    it('a 6-city civ has no overextension row (allowance is 6)', () => {
      // makeState creates cityCount + 1 civ cities (capital + city-1..city-cityCount).
      // cityCount: 5 -> 6 civ cities -> (6 - 6) * 3 = 0 -> no row.
      const state = makeState({ cityCount: 5 });
      const rows = getUnrestPressureBreakdown('city-1', state, 0);
      expect(rows.find(r => r.label === 'Empire overextension')).toBeUndefined();
    });

    it('a 7-city civ pays exactly one extra-city slope of overextension', () => {
      // cityCount: 6 -> 7 civ cities -> (7 - 6) * 3 = 3.
      const state = makeState({ cityCount: 6 });
      const rows = getUnrestPressureBreakdown('city-1', state, 0);
      expect(rows.find(r => r.label === 'Empire overextension')?.amount).toBe(3);
    });
  });
});

describe('#919 MR2 — Courthouse unrest relief row', () => {
  // makeState: civ has (cityCount + 1) cities. city-1 at cityPosition, capital at capitalPosition.
  // Post-nudge positive rows: overext = min(30, max(0, (cityCount + 1 - 6) * 3));
  //                           dist   = min(20, max(0, (hexDistance(city, capital) - 5) * 2)).
  // Courthouse row (from the already-built positive rows):
  //   rawSprawl = distRow + overextRow
  //   uncapped  = round(0.5 * distRow) + min(3, overextRow)
  //   relief    = min(uncapped, max(0, rawSprawl - 2))
  //   row       = { label: 'Courthouse', amount: -relief }  (omitted if relief === 0)

  function courthouseRowAmount(state: GameState, cityId = 'city-1'): number | undefined {
    const rows = getUnrestPressureBreakdown(cityId, addBuilding(state, cityId, 'courthouse'), 0);
    return rows.find(r => r.label === 'Courthouse')?.amount;
  }

  it('8 cities, city 9 hexes out -> Courthouse -7', () => {
    // cityCount 7 -> 8 civ cities -> overext (8-6)*3 = 6.
    // hexDistance 9 from capital -> dist (9-5)*2 = 8. rawSprawl 14.
    // uncapped round(4) + min(3,6) = 7. relief min(7, 14-2) = 7.
    const state = makeState({ cityCount: 7, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    expect(courthouseRowAmount(state)).toBe(-7);
  });

  it('12 cities, city 6 hexes out -> Courthouse -4', () => {
    // cityCount 11 -> 12 civ cities -> overext (12-6)*3 = 18.
    // hexDistance 6 -> dist (6-5)*2 = 2. rawSprawl 20.
    // uncapped round(1) + min(3,18) = 4. relief min(4, 18) = 4.
    const state = makeState({ cityCount: 11, cityPosition: { q: 6, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    expect(courthouseRowAmount(state)).toBe(-4);
  });

  it('20 cities, city 12 hexes out -> Courthouse -10 (overext row capped at 30)', () => {
    // cityCount 19 -> 20 civ cities -> overext min(30, (20-6)*3=42) = 30.
    // hexDistance 12 -> dist min(20, (12-5)*2=14) = 14. rawSprawl 44.
    // uncapped round(7) + min(3,30) = 10. relief min(10, 42) = 10.
    const state = makeState({ cityCount: 19, cityPosition: { q: 12, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    expect(courthouseRowAmount(state)).toBe(-10);
  });

  it('7 cities, city <=5 hexes out -> Courthouse -1 (residual floor leaves net sprawl 2)', () => {
    // cityCount 6 -> 7 civ cities -> overext (7-6)*3 = 3. dist row absent (<=5 hexes). rawSprawl 3.
    // uncapped round(0) + min(3,3) = 3. relief min(3, max(0, 3-2)) = 1. net sprawl 3 - 1 = 2.
    const state = makeState({ cityCount: 6, cityPosition: { q: 3, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    expect(courthouseRowAmount(state)).toBe(-1);
  });

  it('NEGATIVE: the same city without a courthouse gets no Courthouse row and full sprawl pressure', () => {
    const state = makeState({ cityCount: 7, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const rows = getUnrestPressureBreakdown('city-1', state, 0);
    expect(rows.find(r => r.label === 'Courthouse')).toBeUndefined();
    const sprawl = (rows.find(r => r.label === 'Empire overextension')?.amount ?? 0)
      + (rows.find(r => r.label === 'Distance from capital')?.amount ?? 0);
    expect(sprawl).toBe(14); // 6 + 8, unrelieved
  });

  it('NEGATIVE: a courthouse in a 6-city civ with no distance row emits no Courthouse row', () => {
    // cityCount 5 -> 6 civ cities -> overext 0. city at capital -> no dist row. rawSprawl 0 -> relief 0 -> row omitted.
    const state = makeState({ cityCount: 5, cityPosition: { q: 0, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    expect(courthouseRowAmount(state)).toBeUndefined();
  });

  it('residual floor: a courthoused city that had sprawl pressure never nets below 2, and relief never exceeds sprawl', () => {
    for (let cityCount = 6; cityCount <= 25; cityCount++) {
      for (const dist of [0, 6, 9, 12, 20]) {
        const state = makeState({ cityCount, cityPosition: { q: dist, r: 0 }, capitalPosition: { q: 0, r: 0 } });
        const rows = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'), 0);
        const overext = rows.find(r => r.label === 'Empire overextension')?.amount ?? 0;
        const distRow = rows.find(r => r.label === 'Distance from capital')?.amount ?? 0;
        const relief = -(rows.find(r => r.label === 'Courthouse')?.amount ?? 0);
        const rawSprawl = overext + distRow;
        if (rawSprawl > 0) expect(rawSprawl - relief).toBeGreaterThanOrEqual(2);
        expect(relief).toBeLessThanOrEqual(rawSprawl);
      }
    }
  });

  it('computeUnrestPressure stays within [0,100] when the Courthouse row would otherwise drive a city negative', () => {
    const state = makeState({ cityCount: 7, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const p = computeUnrestPressure('city-1', addBuilding(state, 'city-1', 'courthouse'), 40);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});

describe('#926 — Military Administration unrest relief row', () => {
  function militaryAdministrationRowAmount(state: GameState): number | undefined {
    return getUnrestPressureBreakdown(
      'city-1', addBuilding(state, 'city-1', 'military-administration'), 0,
    ).find(row => row.label === 'Military Administration')?.amount;
  }

  it('relieves maximum war and fresh-conquest pressure by at most 18', () => {
    const state = makeState({ conquestTurn: 0, atWarCount: 3 });
    const rows = getUnrestPressureBreakdown(
      'city-1', addBuilding(state, 'city-1', 'military-administration'), 0,
    );
    expect(rows.find(row => row.label === 'War weariness')?.amount).toBe(24);
    expect(rows.find(row => row.label === 'Recent conquest')?.amount).toBe(25);
    expect(rows.find(row => row.label === 'Military Administration')?.amount).toBe(-18);
  });

  it('preserves the war and conquest residual floors after Constitutional Law', () => {
    const state = makeState({ conquestTurn: 0, atWarCount: 1 });
    const withLaw: GameState = {
      ...state,
      civilizations: {
        ...state.civilizations,
        player: {
          ...state.civilizations.player,
          techState: { ...state.civilizations.player.techState, completed: ['constitutional-law'] },
        },
      },
    };
    const rows = getUnrestPressureBreakdown(
      'city-1', addBuilding(withLaw, 'city-1', 'military-administration'), 0,
    );
    expect(rows.find(row => row.label === 'Military Administration')?.amount).toBe(-9);
    const remaining = (rows.find(row => row.label === 'War weariness')?.amount ?? 0)
      + (rows.find(row => row.label === 'Recent conquest')?.amount ?? 0)
      + (rows.find(row => row.label === 'Military Administration')?.amount ?? 0);
    expect(remaining).toBe(12);
  });

  it('emits no relief row when neither target pressure row exists', () => {
    expect(militaryAdministrationRowAmount(makeState())).toBeUndefined();
  });

  it('changes the real faction escalation decision at the war-and-conquest boundary', () => {
    const base = makeState({ conquestTurn: 0, atWarCount: 2 });
    const relieved = addBuilding(base, 'city-1', 'military-administration');
    const bus = new EventBus();
    expect(processFactionTurn(base, bus).cities['city-1'].unrestLevel).toBe(1);
    expect(processFactionTurn(relieved, bus).cities['city-1'].unrestLevel).toBe(0);
  });
});

describe('#927 — Road & Post Network unrest relief row', () => {
  function addOwnedRoadChain(state: GameState, endQ: number): void {
    for (let q = 1; q < endQ; q++) {
      state.map.tiles[`${q},0`] = {
        coord: { q, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null,
        improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false,
        wonder: null, hasRoad: true,
      };
    }
  }

  it('keeps raw distance visible and emits bounded relief for an owned connected road chain', () => {
    const state = makeState({ cityPosition: { q: 12, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 4 });
    addOwnedRoadChain(state, 12);
    state.civilizations.player!.techState.completed = ['military-logistics'];
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows.find(row => row.label === 'Distance from capital')?.amount).toBe(14);
    expect(rows.find(row => row.label === 'Road & Post Network')?.amount).toBe(-5);
  });

  it('requires Military Logistics and a complete currently-owned land route (negative)', () => {
    const state = makeState({ cityPosition: { q: 12, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 4 });
    addOwnedRoadChain(state, 12);
    state.civilizations.player!.techState.completed = [];
    expect(getUnrestPressureBreakdown('city-1', state)
      .find(row => row.label === 'Road & Post Network')).toBeUndefined();

    state.civilizations.player!.techState.completed = ['military-logistics'];
    state.map.tiles['6,0'] = { ...state.map.tiles['6,0']!, owner: 'ai-1' };
    expect(getUnrestPressureBreakdown('city-1', state)
      .find(row => row.label === 'Road & Post Network')).toBeUndefined();

    state.map.tiles['6,0'] = { ...state.map.tiles['6,0']!, owner: 'player', terrain: 'coast' };
    expect(getUnrestPressureBreakdown('city-1', state)
      .find(row => row.label === 'Road & Post Network')).toBeUndefined();
  });

  it('exposes no AI research value for a city without a qualifying current or buildable route', () => {
    const state = makeState({ cityPosition: { q: 12, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 4 });
    addOwnedRoadChain(state, 12);
    state.civilizations.player!.techState.completed = ['road-building', 'tactics'];
    const source = UNREST_RELIEF_SOURCES.find(candidate => candidate.id === 'road-post-network')!;
    expect(source.isPotentiallyUseful?.(state.cities['city-1']!, state, { connectedOwnedRoadCityIdsByCivId: new Map() }))
      .toBe(true);

    state.map.tiles['6,0'] = { ...state.map.tiles['6,0']!, owner: 'ai-1' };
    expect(source.isPotentiallyUseful?.(state.cities['city-1']!, state, { connectedOwnedRoadCityIdsByCivId: new Map() }))
      .toBe(false);
  });

  it('stacks after Courthouse without changing the raw rows or violating their residual floors', () => {
    const state = makeState({ cityCount: 12, cityPosition: { q: 11, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 4 });
    addOwnedRoadChain(state, 11);
    state.civilizations.player!.techState.completed = ['military-logistics'];
    const roadOnly = getUnrestPressureBreakdown('city-1', state);
    const withCourthouse = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'));
    const rawDistance = roadOnly.find(row => row.label === 'Distance from capital')?.amount ?? 0;
    const rawOverextension = roadOnly.find(row => row.label === 'Empire overextension')?.amount ?? 0;
    const relief = withCourthouse
      .filter(row => row.label === 'Courthouse' || row.label === 'Road & Post Network')
      .reduce((total, row) => total - row.amount, 0);

    expect(withCourthouse.find(row => row.label === 'Distance from capital')?.amount).toBe(rawDistance);
    expect(withCourthouse.find(row => row.label === 'Empire overextension')?.amount).toBe(rawOverextension);
    expect(relief).toBeLessThanOrEqual(rawDistance + rawOverextension - 2);
    expect(withCourthouse.find(row => row.label === 'Road & Post Network')?.amount).toBeLessThanOrEqual(0);
  });

  it('is keyed to the city owner rather than the hot-seat viewer', () => {
    const base = makeState({ cityPosition: { q: 12, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 4 });
    addOwnedRoadChain(base, 12);
    const owner = 'ai-1';
    const cities = Object.fromEntries(
      Object.entries(base.cities).map(([id, city]) => [id, { ...city, owner }]),
    );
    for (const tile of Object.values(base.map.tiles)) tile.owner = owner;
    const hotSeatState: GameState = {
      ...base,
      currentPlayer: owner,
      cities,
      civilizations: {
        ...base.civilizations,
        player: { ...base.civilizations.player, cities: [] },
        [owner]: {
          ...base.civilizations[owner],
          isHuman: true,
          cities: base.civilizations.player.cities,
          techState: { ...base.civilizations.player.techState, completed: ['military-logistics'] },
        },
      },
    };

    const row = getUnrestPressureBreakdown('city-1', hotSeatState)
      .find(candidate => candidate.label === 'Road & Post Network');
    const otherViewerRow = getUnrestPressureBreakdown(
      'city-1', { ...hotSeatState, currentPlayer: 'player' },
    ).find(candidate => candidate.label === 'Road & Post Network');

    expect(row?.amount).toBeLessThan(0);
    expect(otherViewerRow).toEqual(row);
  });
});

describe('#927 Rung 5 — Railway Administration unrest relief', () => {
  function addOwnedRoadChain(state: GameState, endQ: number): void {
    for (let q = 1; q < endQ; q++) {
      state.map.tiles[`${q},0`] = {
        coord: { q, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null,
        improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false,
        wonder: null, hasRoad: true,
      };
    }
  }

  function connectedRailState(techs: string[]): GameState {
    const state = makeState({ cityPosition: { q: 20, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    addOwnedRoadChain(state, 20);
    state.civilizations.player!.techState.completed = techs;
    return state;
  }

  it('adds no relief without Railway Expansion, even with an active Road & Post connection', () => {
    const rows = getUnrestPressureBreakdown('city-1', connectedRailState(['military-logistics']));
    expect(rows.find(r => r.label === 'Road & Post Network')?.amount).toBeLessThan(0);
    expect(rows.find(r => r.label === 'Railway Administration')).toBeUndefined();
  });

  it('adds no relief without Military Logistics, even with Railway Expansion researched (must upgrade an active Road & Post connection, not substitute for it)', () => {
    const rows = getUnrestPressureBreakdown('city-1', connectedRailState(['railway-expansion']));
    expect(rows.find(r => r.label === 'Road & Post Network')).toBeUndefined();
    expect(rows.find(r => r.label === 'Railway Administration')).toBeUndefined();
  });

  it('adds no relief when the city is not actually connected by owned road', () => {
    const state = makeState({ cityPosition: { q: 20, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    state.civilizations.player!.techState.completed = ['military-logistics', 'railway-expansion'];
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows.find(r => r.label === 'Railway Administration')).toBeUndefined();
  });

  it('grants bounded relief once fully active, leaving Distance from capital unchanged', () => {
    const rows = getUnrestPressureBreakdown('city-1', connectedRailState(['military-logistics', 'railway-expansion']));
    // Distance: min(20, max(0,(20-5)*2)) = 20 (capped).
    expect(rows.find(r => r.label === 'Distance from capital')?.amount).toBe(20);
    // Road & Post: min(round(0.35*20)=7, 6, max(0,20-4)=16, max(0,20-2)=18) = 6.
    expect(rows.find(r => r.label === 'Road & Post Network')?.amount).toBe(-6);
    // Railway: raw = min(round(0.2*20)=4, 4) = 4; cap = max(0, 20-2-6) = 12; relief = 4.
    expect(rows.find(r => r.label === 'Railway Administration')?.amount).toBe(-4);
  });

  it('does not touch Empire overextension, war weariness, or recent conquest', () => {
    const state = connectedRailState(['military-logistics', 'railway-expansion']);
    state.civilizations.player!.diplomacy.atWarWith = ['ai-1'];
    state.cities['city-1']!.conquestTurn = 9;
    const rows = getUnrestPressureBreakdown('city-1', state);
    expect(rows.find(r => r.label === 'War weariness')?.amount).toBe(8);
    expect(rows.find(r => r.label === 'Recent conquest')?.amount).toBe(25);
    expect(rows.filter(r => r.label === 'Railway Administration')).toHaveLength(1);
  });

  it('an unrelated era-7 tech grants no relief', () => {
    const rows = getUnrestPressureBreakdown('city-1', connectedRailState(['military-logistics', 'colonial-railways']));
    expect(rows.find(r => r.label === 'Railway Administration')).toBeUndefined();
  });

  it('stacks with Courthouse and Road & Post Network without dropping below the shared residual floor', () => {
    const state = addBuilding(connectedRailState(['military-logistics', 'railway-expansion']), 'city-1', 'courthouse');
    const rows = getUnrestPressureBreakdown('city-1', state);
    const distance = rows.find(r => r.label === 'Distance from capital')!.amount;
    const totalRelief = rows.filter(r => r.amount < 0).reduce((sum, r) => sum + r.amount, 0);
    expect(distance + totalRelief).toBeGreaterThanOrEqual(2);
    expect(rows.find(r => r.label === 'Railway Administration')?.amount).toBeLessThan(0);
  });

  it('a broken route removes the relief, and repairing it brings the relief back', () => {
    const state = connectedRailState(['military-logistics', 'railway-expansion']);
    expect(getUnrestPressureBreakdown('city-1', state).find(r => r.label === 'Railway Administration')?.amount)
      .toBeLessThan(0);

    const breakLink = { ...state, map: { ...state.map, tiles: { ...state.map.tiles, '10,0': { ...state.map.tiles['10,0']!, hasRoad: false } } } };
    expect(getUnrestPressureBreakdown('city-1', breakLink).find(r => r.label === 'Railway Administration')).toBeUndefined();

    const repaired = { ...breakLink, map: { ...breakLink.map, tiles: { ...breakLink.map.tiles, '10,0': { ...breakLink.map.tiles['10,0']!, hasRoad: true } } } };
    expect(getUnrestPressureBreakdown('city-1', repaired).find(r => r.label === 'Railway Administration')?.amount)
      .toBeLessThan(0);
  });

  it('is keyed to the city owner rather than the hot-seat viewer', () => {
    const base = connectedRailState(['military-logistics', 'railway-expansion']);
    const owner = 'ai-1';
    const cities = Object.fromEntries(Object.entries(base.cities).map(([id, city]) => [id, { ...city, owner }]));
    for (const tile of Object.values(base.map.tiles)) tile.owner = owner;
    const hotSeatState: GameState = {
      ...base,
      currentPlayer: owner,
      cities,
      civilizations: {
        ...base.civilizations,
        player: { ...base.civilizations.player, cities: [] },
        [owner]: {
          ...base.civilizations[owner],
          isHuman: true,
          cities: base.civilizations.player.cities,
          techState: { ...base.civilizations.player.techState, completed: ['military-logistics', 'railway-expansion'] },
        },
      },
    };

    const row = getUnrestPressureBreakdown('city-1', hotSeatState).find(r => r.label === 'Railway Administration');
    const otherViewerRow = getUnrestPressureBreakdown('city-1', { ...hotSeatState, currentPlayer: 'player' })
      .find(r => r.label === 'Railway Administration');

    expect(row?.amount).toBeLessThan(0);
    expect(otherViewerRow).toEqual(row);
  });
});

describe('#919 MR2 — save compatibility and hot-seat', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new EventBus(); });

  it('an existing city at unrestLevel 1 de-escalates after the retune with no migration', () => {
    // Pre-retune: 11 civ cities -> overext (11-5)*3 = 18; +war 24 = 42 > 40 trigger.
    // Post-retune: overext (11-6)*3 = 15; +24 = 39 <= 40 -> the city falls back to calm.
    const state = makeState({
      cityCount: 10, unrestLevel: 1, unrestTurns: 3, atWarCount: 3,
      cityPosition: { q: 0, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 2,
    });
    const result = processFactionTurn(state, bus);
    expect(result.cities['city-1'].unrestLevel).toBe(0);
  });

  it("'courthouse' is a plain new city.buildings value — no migration, processFactionTurn recomputes and de-escalates further", () => {
    const state = makeState({
      cityCount: 12, unrestLevel: 1, unrestTurns: 3,
      cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 2,
    });
    const withCh = addBuilding(state, 'city-1', 'courthouse');
    expect(() => processFactionTurn(withCh, bus)).not.toThrow();
    expect(computeUnrestPressure('city-1', withCh, 0))
      .toBeLessThan(computeUnrestPressure('city-1', state, 0));
  });

  it('the Courthouse relief row is computed from city.owner, not state.currentPlayer (hot-seat)', () => {
    // Re-home the whole fixture onto the second civ and make it the active player.
    const base = makeState({
      cityCount: 12, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 }, era: 2,
    });
    const p2 = 'ai-1';
    const cities = Object.fromEntries(
      Object.entries(base.cities).map(([id, city]) => [id, { ...city, owner: p2 }]),
    );
    const player2Active: GameState = {
      ...base,
      currentPlayer: p2,
      cities,
      civilizations: {
        ...base.civilizations,
        player: { ...base.civilizations['player'], cities: [] },
        [p2]: {
          ...base.civilizations[p2],
          isHuman: true,
          cities: base.civilizations['player'].cities,
          techState: base.civilizations['player'].techState,
        },
      },
    };
    const withCh = addBuilding(player2Active, 'city-1', 'courthouse');
    const row = getUnrestPressureBreakdown('city-1', withCh, 0).find(r => r.label === 'Courthouse');
    expect(row?.amount).toBeLessThan(0);

    // Flipping currentPlayer back does not change the per-city, owner-driven breakdown.
    const rowPlayer1Active = getUnrestPressureBreakdown(
      'city-1', { ...withCh, currentPlayer: 'player' }, 0,
    ).find(r => r.label === 'Courthouse');
    expect(rowPlayer1Active).toEqual(row);
  });

  it('#926: Military Administration relief is computed from city.owner, not the hot-seat viewer', () => {
    const base = makeState({ conquestTurn: 0, atWarCount: 2 });
    const p2 = 'ai-1';
    const cities = Object.fromEntries(
      Object.entries(base.cities).map(([id, city]) => [id, { ...city, owner: p2 }]),
    );
    const player2Active: GameState = {
      ...base,
      currentPlayer: p2,
      cities,
      civilizations: {
        ...base.civilizations,
        player: { ...base.civilizations.player, cities: [] },
        [p2]: {
          ...base.civilizations[p2],
          isHuman: true,
          cities: base.civilizations.player.cities,
          diplomacy: { ...base.civilizations[p2].diplomacy, atWarWith: ['player', 'ai-2'] },
        },
      },
    };
    const withAdministration = addBuilding(player2Active, 'city-1', 'military-administration');
    const row = getUnrestPressureBreakdown('city-1', withAdministration, 0)
      .find(candidate => candidate.label === 'Military Administration');
    const otherViewerRow = getUnrestPressureBreakdown(
      'city-1', { ...withAdministration, currentPlayer: 'player' }, 0,
    ).find(candidate => candidate.label === 'Military Administration');

    expect(row?.amount).toBeLessThan(0);
    expect(otherViewerRow).toEqual(row);
  });
});
