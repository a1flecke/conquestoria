import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState, City, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import {
  REVOLT_UNREST_TURNS,
  BREAKAWAY_REVOLT_TURNS,
  CONCESSION_IMMUNITY_TURNS,
  appeaseFaction,
  canGarrisonCity,
  computeUnrestPressure,
  concedeToMovement,
  getCityAppeaseCost,
  getConcessionCost,
  getContagionSpread,
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
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
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
  it('REVOLT_UNREST_TURNS is exported and equals 5', () => {
    expect(REVOLT_UNREST_TURNS).toBe(5);
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
    // cityCount:10 → 11 total cities → empire pressure (11-5)*3=18; 3 wars → 24; total 42 > 40
    // City starts at unrestLevel 1, era 2 — processFactionTurn should NOT zero it out
    const state = makeState({ era: 2, unrestLevel: 1, unrestTurns: 1, atWarCount: 3, cityCount: 10 });
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
      const state = makeState({ unrestLevel: 2 });
      const city = state.cities['city-1'];
      expect(getConcessionCost(state, city)).toBe(getCityAppeaseCost(city) * 2);
    });

    it('halves to 1x when the owner has completed a current-era civics tech', () => {
      let state = makeState({ era: 3, unrestLevel: 2 });
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: {
            ...state.civilizations['player'],
            techState: { ...state.civilizations['player'].techState, completed: ['civil-service'] },
          },
        },
      };
      const city = state.cities['city-1'];
      expect(getConcessionCost(state, city)).toBe(getCityAppeaseCost(city));
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
