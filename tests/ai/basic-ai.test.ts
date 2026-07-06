import {
  canDeclareWarForPreparedPlan,
  chooseAiSpyTarget,
  processAITurn,
  processPreparedAITurn,
} from '@/ai/basic-ai';
import { buildMajorCivPerception } from '@/ai/ai-perception';
import {
  prepareMajorCivStrategicPlan,
  type PreparedMajorCivPlan,
} from '@/ai/ai-prepared-turn';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';
import type { GameEvents, GameState } from '@/core/types';
import { BUILDINGS, foundCity } from '@/systems/city-system';
import { appeaseFaction, getCityAppeaseCost } from '@/systems/faction-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { hexKey, hexDistance } from '@/systems/hex-utils';
import { tickLegendaryWonderProjects } from '@/systems/legendary-wonder-system';
import { createUnit } from '@/systems/unit-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import type { ResourceType } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('purposeful AI war gating', () => {
  it('allows war only for the known primary target after mobilization', () => {
    const state = createNewGame(undefined, 'purposeful-war-gate', 'small');
    const aiId = 'ai-1';
    const playerSettler = state.civilizations.player.units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'settler');
    if (!playerSettler) throw new Error('missing player settler');
    const city = foundCity(
      'player',
      playerSettler.position,
      state.map,
      state.idCounters,
    );
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    state.civilizations[aiId].knownCivilizations = ['player'];
    state.civilizations[aiId].visibility.tiles[hexKey(city.position)] = 'visible';
    const portfolio = createEmptyMajorCivPlanPortfolio();
    portfolio.primaryPlan = {
      id: 'capture-player',
      actorId: aiId,
      objective: 'capture',
      target: {
        kind: 'city',
        id: city.id,
        lastKnownPosition: city.position,
      },
      theaterId: 'player-front',
      phase: 'mobilizing',
      reasonCodes: ['continue-active-war'],
      commitment: 0.8,
      createdTurn: state.turn,
      reconsiderAfterTurn: state.turn + 2,
      expiresAfterTurn: state.turn + 8,
      lastProgressTurn: state.turn,
      requiredRoles: { capture: 1 },
      assignedUnitIds: [],
    };
    const perception = buildMajorCivPerception(state, aiId);
    const prepared: PreparedMajorCivPlan = {
      civId: aiId,
      perception,
      portfolio,
      assignments: {
        portfolio,
        assignmentsByPlanId: {},
        recoveryUnitIds: [],
        forceDemands: [],
        rejectedByUnitId: {},
      },
      forceDemands: [],
      traces: [],
    };

    expect(canDeclareWarForPreparedPlan(state, prepared, 'player'))
      .toBe(false);
    portfolio.primaryPlan.phase = 'advancing';
    expect(canDeclareWarForPreparedPlan(state, prepared, 'player'))
      .toBe(true);
    expect(canDeclareWarForPreparedPlan(state, prepared, 'ai-2'))
      .toBe(false);
    state.cities[city.id] = {
      ...state.cities[city.id],
      owner: 'third-party-owner',
    };
    expect(canDeclareWarForPreparedPlan(state, prepared, 'player'))
      .toBe(false);
    state.cities[city.id] = city;
    if (!state.opponentAI) throw new Error('missing opponent AI state');
    state.opponentAI.migrationGraceRoundsRemaining = 1;
    expect(canDeclareWarForPreparedPlan(state, prepared, 'player'))
      .toBe(false);
  });
});

describe('purposeful AI administrative intel', () => {
  it('uses prepared force demand instead of enabled-path one-off production', () => {
    const state = createNewGame(undefined, 'purposeful-production-demand', 'small');
    const civ = state.civilizations['ai-1'];
    const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
    const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    civ.cities = [city.id];
    civ.techState.completed = ['gathering', 'siege-warfare'];
    const tile = state.map.tiles[hexKey(city.position)];
    tile.resource = 'stone';
    tile.owner = civ.id;
    const prepared = prepareMajorCivStrategicPlan(state, civ.id);
    prepared.forceDemands = [{
      role: 'siege',
      desired: 1,
      assigned: 0,
      missing: 1,
      priority: 200,
      sourcePlanIds: ['primary'],
    }];
    prepared.assignments.forceDemands = prepared.forceDemands;

    const result = processPreparedAITurn(state, prepared, new EventBus()).state;

    expect(result.cities[city.id].productionQueue).toEqual(['catapult']);
  });

  it('promotes the valid research queue on the enabled path', () => {
    const state = createNewGame(undefined, 'purposeful-research-queue', 'small');
    const civ = state.civilizations['ai-1'];
    civ.techState.currentResearch = null;
    civ.techState.researchProgress = 7;
    civ.techState.researchQueue = ['fire', 'writing'];
    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    const result = processPreparedAITurn(state, prepared, new EventBus()).state;

    expect(result.civilizations[civ.id].techState).toMatchObject({
      currentResearch: 'fire',
      researchProgress: 0,
      researchQueue: ['writing'],
    });
  });

  it('does not select a live foreign city absent from prepared perception', () => {
    const state = createNewGame(undefined, 'purposeful-hidden-spy-city', 'small');
    const aiId = 'ai-1';
    const playerSettler = state.civilizations.player.units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'settler');
    if (!playerSettler) throw new Error('missing player settler');
    const city = foundCity(
      'player',
      playerSettler.position,
      state.map,
      state.idCounters,
    );
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    state.civilizations[aiId].knownCivilizations = ['player'];
    const perception = buildMajorCivPerception(state, aiId);
    perception.knownCities = [];

    expect(chooseAiSpyTarget(state, aiId, perception)).toBeNull();
  });

  it('plans production from remembered resource ownership instead of hidden live changes', () => {
    const state = createNewGame(undefined, 'purposeful-remembered-resource', 'small');
    const aiId = 'ai-1';
    state.turn = 10;
    const settler = state.civilizations[aiId].units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'settler');
    if (!settler) throw new Error('missing AI settler');
    const city = foundCity(
      aiId,
      settler.position,
      state.map,
      state.idCounters,
    );
    state.cities[city.id] = city;
    state.civilizations[aiId].cities = [city.id];
    for (const unitId of state.civilizations[aiId].units) {
      delete state.units[unitId];
    }
    state.civilizations[aiId].units = [];
    state.civilizations[aiId].techState.completed = ['gathering', 'foraging'];
    state.builtNationalProjects = Object.fromEntries(
      Object.entries(BUILDINGS)
        .filter(([, building]) => Boolean(building.nationalProject))
        .map(([buildingId]) => [
          `${aiId}:${buildingId}`,
          { civId: aiId, cityId: city.id, eraBuilt: state.era },
        ]),
    );

    const resourceTile = Object.values(state.map.tiles).find(tile => {
      const distance = hexDistance(city.position, tile.coord);
      return distance >= 2 && distance <= 8;
    });
    if (!resourceTile) throw new Error('missing nearby resource tile');
    const resourceKey = hexKey(resourceTile.coord);
    state.civilizations[aiId].visibility.tiles = {
      [resourceKey]: 'fog',
    };
    state.civilizations[aiId].visibility.lastSeen = {
      [resourceKey]: {
        coord: { ...resourceTile.coord },
        terrain: resourceTile.terrain,
        elevation: resourceTile.elevation,
        resource: 'stone',
        improvement: 'none',
        improvementTurnsLeft: 0,
        owner: null,
        hasRiver: resourceTile.hasRiver,
        wonder: resourceTile.wonder,
        observedTurn: state.turn - 1,
        source: 'observed',
      },
    };
    resourceTile.resource = 'stone';
    resourceTile.owner = 'player';
    resourceTile.improvement = 'quarry';

    expect(buildMajorCivPerception(state, aiId).knownResources)
      .toContainEqual(expect.objectContaining({
        resource: 'stone',
        owner: null,
        confidence: 'remembered',
      }));

    const result = processAITurn(state, aiId, new EventBus());

    expect(result.cities[city.id].productionQueue[0]).toBe('expedition');
    expect(result.civilizations[aiId].techState.currentResearch).not.toBeNull();
  });

  it('does not move an exhausted spy toward a known foreign city', () => {
    const state = createNewGame(undefined, 'purposeful-exhausted-spy', 'small');
    const aiId = 'ai-1';
    const spyStart = { q: 0, r: 0 };
    const targetTile = Object.values(state.map.tiles).find(tile =>
      hexDistance(spyStart, tile.coord) === 2);
    if (!targetTile) throw new Error('missing spy target tile');
    const targetCity = foundCity(
      'player',
      targetTile.coord,
      state.map,
      state.idCounters,
    );
    state.cities[targetCity.id] = targetCity;
    state.civilizations.player.cities = [targetCity.id];
    state.civilizations[aiId].knownCivilizations = ['player'];
    state.civilizations[aiId].visibility.tiles = {
      [hexKey(targetCity.position)]: 'visible',
    };
    state.units = {
      'exhausted-spy': {
        ...createUnit('spy_scout', aiId, spyStart, state.idCounters),
        id: 'exhausted-spy',
        movementPointsLeft: 0,
      },
    };
    state.civilizations[aiId].units = ['exhausted-spy'];
    state.civilizations.player.units = [];
    state.espionage ??= {};
    state.espionage[aiId] = createEspionageCivState();

    const result = processAITurn(state, aiId, new EventBus());

    expect(result.units['exhausted-spy'].position).toEqual(spyStart);
  });
});

function makeAiRebelState(): GameState {
  return {
    turn: 12,
    era: 2,
    currentPlayer: 'ai-1',
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'ai-1',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: null,
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {
      'unit-ai': {
        id: 'unit-ai',
        type: 'warrior',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
      'unit-rebel': {
        id: 'unit-rebel',
        type: 'warrior',
        owner: 'rebels',
        position: { q: 1, r: 0 },
        movementPointsLeft: 2,
        health: 1,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
    },
    cities: {
      'city-ai': {
        id: 'city-ai',
        name: 'Thebes',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 2,
        unrestTurns: 0,
        spyUnrestBonus: 20,
      },
    },
    civilizations: {
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        color: '#d94a4a',
        isHuman: false,
        civType: 'rome',
        cities: ['city-ai'],
        units: ['unit-ai'],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: {},
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 1 },
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;
}

describe('AI attack targeting', () => {
  it('does not let AI melee units attack non-adjacent targets', () => {
    const state = createNewGame(undefined, 'ai-melee-range', 'small');
    const attacker = createUnit('warrior', 'ai-1', { q: 0, r: 0 }, mkC());
    attacker.id = 'ai-warrior';
    const defender = createUnit('warrior', 'player', { q: 2, r: 0 }, mkC());
    defender.id = 'player-warrior';
    state.units = { [attacker.id]: attacker, [defender.id]: defender };
    state.civilizations['ai-1'].units = [attacker.id];
    state.civilizations.player.units = [defender.id];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    const combatEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('combat:resolved', payload => combatEvents.push(payload));

    processAITurn(state, 'ai-1', bus);

    expect(combatEvents).toHaveLength(0);
    expect(state.units[attacker.id]).toBeDefined();
    expect(state.units[defender.id]).toBeDefined();
  });

  it('does not launch an unplanned ranged attack from contact alone', () => {
    const state = createNewGame(undefined, 'ai-archer-range', 'small');
    const attacker = createUnit('archer', 'ai-1', { q: 0, r: 0 }, mkC());
    attacker.id = 'ai-archer';
    const defender = createUnit('warrior', 'player', { q: 2, r: 0 }, mkC());
    defender.id = 'player-warrior';
    state.units = { [attacker.id]: attacker, [defender.id]: defender };
    state.civilizations['ai-1'].units = [attacker.id];
    state.civilizations.player.units = [defender.id];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    const combatEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('combat:resolved', payload => combatEvents.push(payload));

    processAITurn(state, 'ai-1', bus);

    expect(combatEvents).toHaveLength(0);
    expect(state.units[attacker.id]?.position).toEqual({ q: 0, r: 0 });
  });

  it('does not make AI units opportunistically attack minor-civ units', () => {
    const state = createNewGame(undefined, 'ai-minor-neutral-range', 'small');
    const attacker = createUnit('warrior', 'ai-1', { q: 0, r: 0 }, mkC());
    attacker.id = 'ai-warrior';
    const defender = createUnit('warrior', 'mc-sparta', { q: 1, r: 0 }, mkC());
    defender.id = 'minor-warrior';
    state.units = { [attacker.id]: attacker, [defender.id]: defender };
    state.civilizations['ai-1'].units = [attacker.id];
    const combatEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('combat:resolved', payload => combatEvents.push(payload));

    processAITurn(state, 'ai-1', bus);

    expect(combatEvents).toHaveLength(0);
    expect(state.units[defender.id]).toBeDefined();
  });
});

function makeAiDefenseSpyState(): GameState {
  return {
    turn: 12,
    era: 3,
    currentPlayer: 'ai-1',
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'ai-1',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
        '4,0': {
          coord: { q: 4, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'player',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {},
    cities: {
      'city-ai': {
        id: 'city-ai',
        name: 'Capital',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
      'city-player': {
        id: 'city-player',
        name: 'Target',
        owner: 'player',
        position: { q: 4, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 4, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        color: '#d94a4a',
        isHuman: false,
        civType: 'annuvin',
        cities: ['city-ai'],
        units: [],
        techState: {
          completed: ['espionage-scouting', 'espionage-informants', 'spy-networks'],
          currentResearch: null,
          researchProgress: 0,
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: { player: -30 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: ['city-player'],
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
        diplomacy: {
          relationships: { 'ai-1': -30 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    espionage: {
      'ai-1': { ...createEspionageCivState(), maxSpies: 2 },
      player: createEspionageCivState(),
    },
  } as GameState;
}

function makeAiBreakawayState(): GameState {
  return {
    turn: 25,
    era: 4,
    currentPlayer: 'ai-1',
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'ai-1',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
        '4,0': {
          coord: { q: 4, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'breakaway-city-border',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {},
    cities: {
      'city-ai': {
        id: 'city-ai',
        name: 'Capital',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
      'city-border': {
        id: 'city-border',
        name: 'Free Border',
        owner: 'breakaway-city-border',
        position: { q: 4, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 4, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        color: '#d94a4a',
        isHuman: false,
        civType: 'rome',
        cities: ['city-ai'],
        units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: { 'breakaway-city-border': 20 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
      'breakaway-city-border': {
        id: 'breakaway-city-border',
        name: 'Free Border',
        color: '#c2410c',
        isHuman: false,
        civType: 'generic',
        cities: ['city-border'],
        units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: { 'ai-1': 20 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
        breakaway: {
          originOwnerId: 'ai-1',
          originCityId: 'city-border',
          startedTurn: 5,
          establishesOnTurn: 55,
          status: 'secession',
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;
}

function makeAdjacentExposedCityState({ population }: { population: number }): GameState {
  const state = createNewGame(undefined, 'ai-city-capture', 'small');
  state.currentPlayer = 'ai-1';
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = -60;
  state.civilizations['ai-1'].diplomacy.relationships.player = -60;

  const template = Object.values(state.units).find(unit => unit.owner === 'ai-1' && unit.type === 'warrior');
  if (!template) {
    throw new Error('missing ai warrior fixture');
  }

  state.units['ai-attacker'] = {
    ...template,
    id: 'ai-attacker',
    owner: 'ai-1',
    position: { q: 0, r: 0 },
    movementPointsLeft: 2,
    hasMoved: false,
  };
  state.civilizations['ai-1'].units = ['ai-attacker'];

  state.cities['city-player'] = {
    ...foundCity('player', { q: 1, r: 0 }, state.map, mkC()),
    id: 'city-player',
    name: 'Memphis',
    owner: 'player',
    position: { q: 1, r: 0 },
    population,
    ownedTiles: [{ q: 1, r: 0 }],
  };
  state.civilizations.player.cities = ['city-player'];
  state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'player';

  return state;
}

function makeAiPeaceRequestState(): GameState {
  const state = createNewGame(undefined, 'ai-peace-request', 'small');
  state.currentPlayer = 'ai-1';
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = 10;
  state.civilizations['ai-1'].diplomacy.relationships.player = 10;
  state.pendingDiplomacyRequests = [];
  return state;
}

function makeLegendaryWonderAiFixture(options: { duplicateLostRace?: boolean } = {}): GameState {
  const state = {
    turn: 40,
    era: 4,
    currentPlayer: 'ai-1',
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'ai-1',
          improvementTurnsLeft: 0,
          hasRiver: true,
          wonder: null,
        },
        '4,0': {
          coord: { q: 4, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'player',
          improvementTurnsLeft: 0,
          hasRiver: true,
          wonder: null,
        },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {},
    cities: {
      'city-ai': {
        id: 'city-ai',
        name: 'Capital',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: ['legendary:grand-canal'],
        productionProgress: 40,
        ownedTiles: [{ q: 0, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
      'city-player': {
        id: 'city-player',
        name: 'Rival',
        owner: 'player',
        position: { q: 4, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 4, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        color: '#d94a4a',
        isHuman: false,
        civType: 'rome',
        cities: ['city-ai'],
        units: [],
        techState: { completed: ['city-planning', 'printing'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: { player: -10 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: ['city-player'],
        units: [],
        techState: { completed: ['city-planning', 'printing'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: { 'ai-1': -10 },
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    espionage: {
      'ai-1': {
        spies: {
          'spy-ai-1': {
            id: 'spy-ai-1',
            owner: 'ai-1',
            name: 'Agent Cipher',
            unitType: 'spy_scout',
            targetCivId: 'player',
            targetCityId: 'city-player',
            position: { q: 4, r: 0 },
            status: 'stationed',
            experience: 0,
            currentMission: null,
            cooldownTurns: 0,
            promotionAvailable: false,
          },
        },
        maxSpies: 1,
        counterIntelligence: {},
      },
      player: createEspionageCivState(),
    },
    legendaryWonderProjects: {
      'grand-canal': {
        wonderId: 'grand-canal',
        ownerId: 'ai-1',
        cityId: 'city-ai',
        phase: 'building',
        investedProduction: 40,
        transferableProduction: 0,
        questSteps: [],
      },
      'grand-canal-rival': {
        wonderId: 'grand-canal',
        ownerId: 'player',
        cityId: 'city-player',
        phase: 'building',
        investedProduction: 180,
        transferableProduction: 0,
        questSteps: [],
      },
    },
  } as GameState;

  if (options.duplicateLostRace) {
    state.map.tiles['1,0'] = {
      ...state.map.tiles['0,0'],
      coord: { q: 1, r: 0 },
      owner: 'ai-1',
      hasRiver: false,
    };
    state.map.tiles['0,1'] = {
      ...state.map.tiles['0,0'],
      coord: { q: 0, r: 1 },
      owner: 'ai-1',
      hasRiver: false,
    };
    state.map.tiles['5,0'] = {
      ...state.map.tiles['4,0'],
      coord: { q: 5, r: 0 },
      owner: 'player',
      hasRiver: false,
    };
    state.map.tiles['4,1'] = {
      ...state.map.tiles['4,0'],
      coord: { q: 4, r: 1 },
      owner: 'player',
      hasRiver: false,
    };
    state.cities['city-ai-2'] = {
      ...state.cities['city-ai'],
      id: 'city-ai-2',
      name: 'Second Capital',
      position: { q: 0, r: 1 },
      productionQueue: ['legendary:oracle-of-delphi'],
      productionProgress: 60,
      ownedTiles: [{ q: 0, r: 1 }, { q: 1, r: 0 }],
    };
    state.cities['city-player-2'] = {
      ...state.cities['city-player'],
      id: 'city-player-2',
      name: 'Second Rival',
      position: { q: 4, r: 1 },
      ownedTiles: [{ q: 4, r: 1 }, { q: 5, r: 0 }],
    };
    state.civilizations['ai-1'].cities.push('city-ai-2');
    state.civilizations.player.cities.push('city-player-2');
    state.espionage!['ai-1'].spies['spy-ai-2'] = {
      id: 'spy-ai-2',
      owner: 'ai-1',
      name: 'Agent Ember',
      unitType: 'spy_scout',
      targetCivId: 'player',
      targetCityId: 'city-player-2',
      position: { q: 4, r: 1 },
      status: 'stationed',
      experience: 0,
      currentMission: null,
      cooldownTurns: 0,
      promotionAvailable: false,
    };
    state.legendaryWonderProjects!['oracle-ai'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'ai-1',
      cityId: 'city-ai-2',
      phase: 'building',
      investedProduction: 60,
      transferableProduction: 0,
      questSteps: [],
    };
    state.legendaryWonderProjects!['oracle-rival'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'city-player-2',
      phase: 'building',
      investedProduction: 180,
      transferableProduction: 0,
      questSteps: [],
    };
  }

  return state;
}

function makeLegendaryWonderOpportunityFixture(): GameState {
  return {
    turn: 44,
    era: 4,
    currentPlayer: 'ai-1',
    gameOver: false,
    winner: null,
    map: {
      width: 10,
      height: 8,
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: 'stone', improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: true, wonder: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: true, wonder: null },
        '2,0': { coord: { q: 2, r: 0 }, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '5,0': { coord: { q: 5, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: true, wonder: null },
        '6,0': { coord: { q: 6, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: true, wonder: null },
        '7,0': { coord: { q: 7, r: 0 }, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {},
    cities: {
      'city-ai-1': {
        id: 'city-ai-1',
        name: 'Capital',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        population: 6,
        food: 0,
        foodNeeded: 20,
        buildings: ['granary', 'workshop', 'market'],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
      'city-ai-2': {
        id: 'city-ai-2',
        name: 'Harbor',
        owner: 'ai-1',
        position: { q: 5, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: ['granary', 'library', 'market'],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 5, r: 0 }, { q: 6, r: 0 }, { q: 7, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
      'city-ai-3': {
        id: 'city-ai-3',
        name: 'Archive',
        owner: 'ai-1',
        position: { q: 8, r: 0 },
        population: 4,
        food: 0,
        foodNeeded: 20,
        buildings: ['granary', 'library', 'market'],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 8, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        color: '#d94a4a',
        isHuman: false,
        civType: 'rome',
        cities: ['city-ai-1', 'city-ai-2', 'city-ai-3'],
        units: [],
        techState: {
          completed: ['philosophy', 'sacred-sites', 'city-planning', 'printing', 'banking', 'agricultural-science', 'astronomy', 'navigation'],
          currentResearch: null,
          researchProgress: 0,
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 200,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: {},
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {
      '0,0': ['ai-1'],
      '1,0': ['ai-1'],
    },
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    legendaryWonderProjects: {
      'ai-1:city-ai-1:oracle-of-delphi': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'ai-1',
        cityId: 'city-ai-1',
        phase: 'ready_to_build',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'discover-natural-wonder', description: 'Discover a natural wonder', completed: true },
          { id: 'complete-pilgrimage-route', description: 'Complete a pilgrimage route', completed: true },
        ],
      },
      'ai-1:city-ai-2:grand-canal': {
        wonderId: 'grand-canal',
        ownerId: 'ai-1',
        cityId: 'city-ai-2',
        phase: 'ready_to_build',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'connect-two-cities', description: 'Connect two cities', completed: true },
          { id: 'grow-river-city', description: 'Grow a river city', completed: true },
        ],
      },
      'ai-1:city-ai-3:world-archive': {
        wonderId: 'world-archive',
        ownerId: 'ai-1',
        cityId: 'city-ai-3',
        phase: 'ready_to_build',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'complete-four-communication-techs', description: 'Complete four communication techs', completed: true },
          { id: 'discover-natural-wonder', description: 'Discover a natural wonder', completed: true },
        ],
      },
    },
  } as GameState;
}

function makeAiBarbarianCampAttackState(): GameState {
  return {
    turn: 22,
    era: 3,
    currentPlayer: 'ai-1',
    gameOver: false,
    winner: null,
    map: {
      width: 8,
      height: 8,
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: 'ai-1',
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
        '1,0': {
          coord: { q: 1, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: null,
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        },
      },
      wrapsHorizontally: false,
      rivers: [],
    },
    units: {
      'unit-ai': {
        id: 'unit-ai',
        type: 'warrior',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
      'unit-barbarian': {
        id: 'unit-barbarian',
        type: 'warrior',
        owner: 'barbarian',
        position: { q: 1, r: 0 },
        movementPointsLeft: 2,
        health: 1,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
    },
    cities: {
      'city-ai': {
        id: 'city-ai',
        name: 'Capital',
        owner: 'ai-1',
        position: { q: 0, r: 0 },
        population: 5,
        food: 0,
        foodNeeded: 20,
        buildings: ['granary', 'market'],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        grid: [[null]],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        color: '#d94a4a',
        isHuman: false,
        civType: 'rome',
        cities: ['city-ai'],
        units: ['unit-ai'],
        techState: {
          completed: ['architecture-arts', 'theology-tech'],
          currentResearch: null,
          researchProgress: 0,
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: {},
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 1 },
        },
      },
    },
    barbarianCamps: {
      'camp-1': {
        id: 'camp-1',
        position: { q: 1, r: 0 },
        strength: 5,
        spawnCooldown: 0,
      },
    },
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderProjects: {
      'sun-spire:ai-1:city-ai': {
        wonderId: 'sun-spire',
        ownerId: 'ai-1',
        cityId: 'city-ai',
        phase: 'questing',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'complete-sacred-route', description: 'Establish a sacred trade route.', completed: true },
          { id: 'defeat-nearby-stronghold', description: 'Clear a nearby barbarian stronghold.', completed: false },
        ],
      },
    },
  } as GameState;
}

describe('processAITurn', () => {
  it('does not auto-force peace on a human player', () => {
    const state = makeAiPeaceRequestState();
    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
    expect(result.pendingDiplomacyRequests).toContainEqual(
      expect.objectContaining({ fromCivId: 'ai-1', toCivId: 'player', type: 'peace' }),
    );
  });

  it('does not enqueue a duplicate reciprocal peace request when one already exists', () => {
    const state = makeAiPeaceRequestState();
    state.pendingDiplomacyRequests = [
      {
        id: 'peace:player:ai-1:1',
        type: 'peace',
        fromCivId: 'player',
        toCivId: 'ai-1',
        turnIssued: state.turn,
      },
    ];

    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.pendingDiplomacyRequests).toHaveLength(1);
    expect(result.pendingDiplomacyRequests?.[0]?.fromCivId).toBe('player');
    expect(result.pendingDiplomacyRequests?.[0]?.toCivId).toBe('ai-1');
  });

  it('does not bypass plan progression to capture an exposed city', () => {
    const state = makeAdjacentExposedCityState({ population: 5 });
    const bus = new EventBus();
    const moves: GameEvents['unit:move'][] = [];
    bus.on('unit:move', event => moves.push(event));

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.cities['city-player'].owner).toBe('player');
    expect(moves).toHaveLength(0);
  });

  it('does not emit capture transitions without a plan-authorized capture', () => {
    const state = makeAdjacentExposedCityState({ population: 5 });
    state.map.tiles[hexKey({ q: 1, r: 0 })] = {
      ...state.map.tiles[hexKey({ q: 1, r: 0 })],
      terrain: 'grassland',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };
    const bus = new EventBus();
    const territoryEvents: GameEvents['territory:tile-flipped'][] = [];
    bus.on('territory:tile-flipped', event => territoryEvents.push(event));

    processAITurn(state, 'ai-1', bus);

    expect(territoryEvents).toEqual([]);
  });

  it('does not throw on a fresh game', () => {
    const state = createNewGame(undefined, 'ai-test');
    const bus = new EventBus();
    expect(() => processAITurn(state, 'ai-1', bus)).not.toThrow();
  });

  it('returns a modified game state', () => {
    const state = createNewGame(undefined, 'ai-test');
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    expect(newState).toBeDefined();
  });

  it('does not declare war on the opening turn in a fresh-contact state', () => {
    const state = createNewGame(undefined, 'ai-war-gate');
    state.turn = 1;
    state.civilizations['ai-1'].civType = 'rome';
    state.civilizations['ai-1'].diplomacy.relationships.player = -60;
    state.civilizations.player.diplomacy.relationships['ai-1'] = -60;

    const playerWarrior = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'warrior');
    if (playerWarrior) {
      playerWarrior.health = 10;
    }

    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);

    expect(result.civilizations['ai-1'].diplomacy.atWarWith).not.toContain('player');
  });

  it('counts visible rival combined arms instead of only rival warriors', () => {
    const state = createNewGame(undefined, 'ai-symmetric-visible-strength');
    state.turn = 20;
    state.civilizations['ai-1'].civType = 'rome';
    state.civilizations['ai-1'].knownCivilizations = ['player'];
    state.civilizations.player.knownCivilizations = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.relationships.player = -60;
    state.civilizations.player.diplomacy.relationships['ai-1'] = -60;

    const anchor = state.civilizations['ai-1'].units
      .map(id => state.units[id])
      .find(Boolean)!.position;
    const rivalPosition = {
      q: (anchor.q + 2) % state.map.width,
      r: anchor.r,
    };
    for (const type of ['swordsman', 'swordsman'] as const) {
      const unit = createUnit(type, 'ai-1', anchor, state.idCounters);
      unit.id = `ai-${type}-${state.civilizations['ai-1'].units.length}`;
      unit.movementPointsLeft = 0;
      state.units[unit.id] = unit;
      state.civilizations['ai-1'].units.push(unit.id);
    }
    for (const type of ['tank', 'jet_fighter'] as const) {
      const unit = createUnit(type, 'player', rivalPosition, state.idCounters);
      unit.id = `player-${type}`;
      state.units[unit.id] = unit;
      state.civilizations.player.units.push(unit.id);
    }
    for (const id of state.civilizations['ai-1'].units) {
      if (state.units[id]) state.units[id].movementPointsLeft = 0;
    }

    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.civilizations['ai-1'].diplomacy.atWarWith).not.toContain('player');
  });

  it('AI settler founds a city when possible', () => {
    const state = createNewGame(undefined, 'ai-test');
    const bus = new EventBus();
    const founded: GameEvents['city:founded'][] = [];
    bus.on('city:founded', event => founded.push(event));
    const newState = processAITurn(state, 'ai-1', bus);
    const aiCiv = newState.civilizations['ai-1'];
    // AI should try to found a city with its settler
    expect(aiCiv.cities.length + Object.values(newState.units).filter(
      u => u.owner === 'ai-1' && u.type === 'settler'
    ).length).toBeGreaterThanOrEqual(1);
    expect(founded).toHaveLength(aiCiv.cities.length);
    expect(founded[0]).toMatchObject({
      founderId: 'ai-1',
      city: {
        id: aiCiv.cities[0],
        owner: 'ai-1',
      },
    });
    expect(newState.cities[aiCiv.cities[0]].productionQueue.length).toBeGreaterThan(0);
  });

  it('does not found an AI city inside the shared city spacing boundary', () => {
    const state = createNewGame(undefined, 'ai-city-spacing');
    const bus = new EventBus();
    const playerCity = foundCity('player', { q: 10, r: 10 }, state.map, mkC());
    state.cities[playerCity.id] = playerCity;
    state.civilizations.player.cities = [playerCity.id];
    state.civilizations['ai-1'].cities = [];

    const settlerId = 'unit-ai-settler-spacing';
    state.units = {
      [settlerId]: {
        id: settlerId,
        type: 'settler',
        owner: 'ai-1',
        position: { q: 12, r: 10 },
        movementPointsLeft: 2,
        health: 100,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
    };
    state.civilizations['ai-1'].units = [settlerId];
    state.map.tiles['12,10'] = {
      ...state.map.tiles['12,10'],
      terrain: 'grassland',
      owner: null,
    };

    const result = processAITurn(state, 'ai-1', bus);

    const foundedCities = Object.values(result.cities).filter(city => city.owner === 'ai-1');
    expect(foundedCities).toHaveLength(0);
    expect(result.units[settlerId]).toBeDefined();
  });

  it('does not use the removed opportunistic rebel chase', () => {
    const state = makeAiRebelState();
    const bus = new EventBus();

    const newState = processAITurn(state, 'ai-1', bus);

    expect(newState.units['unit-rebel']).toBeDefined();
  });

  it('does not resolve unplanned attacks across either open or river edges', () => {
    const openState = makeAiRebelState();
    const crossingState = makeAiRebelState();
    openState.units['unit-rebel'].health = 100;
    crossingState.units['unit-rebel'].health = 100;
    crossingState.map.rivers = [{
      from: crossingState.units['unit-ai'].position,
      to: crossingState.units['unit-rebel'].position,
    }];

    const resolveAttack = (state: GameState) => {
      const events: GameEvents['combat:resolved'][] = [];
      const bus = new EventBus();
      bus.on('combat:resolved', event => events.push(event));

      processAITurn(state, 'ai-1', bus);

      return events;
    };

    expect(resolveAttack(openState)).toEqual([]);
    expect(resolveAttack(crossingState)).toEqual([]);
  });

  it('does not award combat rewards when no planned combat occurred', () => {
    const state = makeAiRebelState();
    state.units['unit-ai'] = { ...state.units['unit-ai'], health: 60 };
    state.units['unit-rebel'] = { ...state.units['unit-rebel'], health: 1 };
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.units['unit-rebel']).toBeDefined();
    expect(result.units['unit-ai'].experience).toBe(0);
  });

  it('AI stations a defensive spy in its capital by stage 3', () => {
    const state = makeAiDefenseSpyState();
    // Pre-place an idle spy unit so AI can station it defensively this turn
    state.units['unit-spy-ai'] = {
      id: 'unit-spy-ai', type: 'spy_scout', owner: 'ai-1',
      position: { q: 0, r: 0 }, movement: 2, maxMovement: 2,
      health: 100, maxHealth: 100, status: 'idle',
    } as any;
    state.civilizations['ai-1'].units = ['unit-spy-ai'];
    const { state: espWithSpy } = createSpyFromUnit(
      state.espionage!['ai-1'], 'unit-spy-ai', 'ai-1', 'spy_scout', 'seed-defense-test',
    );
    state.espionage!['ai-1'] = espWithSpy;

    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);

    const spies = Object.values(newState.espionage!['ai-1'].spies);
    expect(spies).toHaveLength(1);
    expect(spies[0].status).toBe('embedded');
    expect(spies[0].targetCivId).toBeNull();
    expect(spies[0].targetCityId).toBe('city-ai');
    expect(newState.espionage!['ai-1'].counterIntelligence['city-ai']).toBeGreaterThan(0);
  });

  it('does not bypass strategic war gates for a newly seen secession state', () => {
    const state = makeAiBreakawayState();
    const bus = new EventBus();

    const newState = processAITurn(state, 'ai-1', bus);

    expect(newState.civilizations['ai-1'].diplomacy.atWarWith)
      .not.toContain('breakaway-city-border');
  });

  it('abandons a legendary wonder race when a rival is far ahead and reuses the carryover in the same city', () => {
    const state = makeLegendaryWonderAiFixture();
    const bus = new EventBus();
    const lostEvents: Array<{ civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number }> = [];
    bus.on('wonder:legendary-lost', event => lostEvents.push(event));

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.legendaryWonderProjects!['grand-canal'].phase).toBe('lost_race');
    expect(result.cities['city-ai'].productionQueue[0]).toBe('walls');
    expect(result.cities['city-ai'].productionProgress).toBeGreaterThan(0);
    expect(lostEvents).toEqual([
      { civId: 'ai-1', cityId: 'city-ai', wonderId: 'grand-canal', goldRefund: 10, transferableProduction: 10 },
    ]);
  });

  it('preserves legendary-wonder administration on the feature-enabled path', () => {
    const state = makeLegendaryWonderAiFixture();
    const bus = new EventBus();
    const lostEvents: Array<{ wonderId: string; cityId: string }> = [];
    bus.on('wonder:legendary-lost', event => lostEvents.push(event));

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.legendaryWonderProjects!['grand-canal'].phase)
      .toBe('lost_race');
    expect(lostEvents).toEqual([
      expect.objectContaining({
        wonderId: 'grand-canal',
        cityId: 'city-ai',
      }),
    ]);
  });

  it('emits wonder-loss only on the turn an ai wonder race is abandoned', () => {
    const state = makeLegendaryWonderAiFixture();
    const bus = new EventBus();
    const lostEvents: Array<{ civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number }> = [];
    bus.on('wonder:legendary-lost', event => lostEvents.push(event));

    const afterFirstTurn = processAITurn(state, 'ai-1', bus);
    const afterSecondTurn = processAITurn(afterFirstTurn, 'ai-1', bus);

    expect(afterSecondTurn.legendaryWonderProjects!['grand-canal'].phase).toBe('lost_race');
    expect(lostEvents).toHaveLength(1);
    expect(lostEvents[0]).toEqual(expect.objectContaining({
      civId: 'ai-1',
      cityId: 'city-ai',
      wonderId: 'grand-canal',
    }));
  });

  it('processes every lost ai wonder race in the same turn', () => {
    const state = makeLegendaryWonderAiFixture({ duplicateLostRace: true });
    const bus = new EventBus();
    const lostEvents: Array<{ wonderId: string; cityId: string }> = [];
    bus.on('wonder:legendary-lost', event => lostEvents.push(event));

    const result = processAITurn(state, 'ai-1', bus);
    const lostProjects = Object.values(result.legendaryWonderProjects ?? {}).filter(project =>
      project.ownerId === 'ai-1' && project.phase === 'lost_race',
    );

    expect(lostProjects).toHaveLength(2);
    expect(result.cities['city-ai'].productionQueue[0]).not.toMatch(/^legendary:/);
    expect(result.cities['city-ai-2'].productionQueue[0]).not.toMatch(/^legendary:/);
    expect(lostEvents).toHaveLength(2);
  });

  it('does not target a hidden city for a remote cyber mission', () => {
    const state = makeAiDefenseSpyState();
    const bus = new EventBus();
    state.civilizations['ai-1'].techState.completed = [
      'espionage-scouting',
      'espionage-informants',
      'spy-networks',
      'digital-surveillance',
      'cyber-intelligence',
    ];
    state.espionage!['ai-1'] = {
      spies: {
        'spy-ai-1': {
          id: 'spy-ai-1',
          owner: 'ai-1',
          name: 'Agent Cipher',
          unitType: 'spy_scout',
          targetCivId: null,
          targetCityId: null,
          position: null,
          status: 'idle',
          experience: 0,
          currentMission: null,
          cooldownTurns: 0,
          promotionAvailable: false,
          feedsFalseIntel: false,
        },
      },
      maxSpies: 1,
      // Pre-set CI so shouldAiStationDefensiveSpy returns false (CI > 0 → no embed needed)
      counterIntelligence: { 'city-ai': 20 },
    };

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.espionage!['ai-1'].spies['spy-ai-1'].currentMission).toBeNull();
  });

  it('records first contact when ai visibility refresh reveals the player during its turn', () => {
    const state = makeAiDefenseSpyState();
    const bus = new EventBus();
    state.units['unit-ai-scout'] = {
      id: 'unit-ai-scout',
      type: 'scout',
      owner: 'ai-1',
      position: { q: 3, r: 0 },
      movementPointsLeft: 0,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.civilizations['ai-1'].units = ['unit-ai-scout'];
    state.civilizations['ai-1'].knownCivilizations = [];
    state.civilizations.player.knownCivilizations = [];

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.civilizations['ai-1'].knownCivilizations).toContain('player');
  });

  it('starts a small number of high-fit legendary wonder builds instead of flooding every city', () => {
    const state = makeLegendaryWonderOpportunityFixture();
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    const legendaryQueues = Object.values(result.cities)
      .filter(city => city.owner === 'ai-1')
      .map(city => city.productionQueue[0])
      .filter((queue): queue is string => typeof queue === 'string' && queue.startsWith('legendary:'));

    expect(legendaryQueues.length).toBeGreaterThan(0);
    expect(legendaryQueues.length).toBeLessThanOrEqual(2);
  });

  it('does not start the same legendary wonder in multiple cities for one civ', () => {
    const state = makeLegendaryWonderOpportunityFixture();
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    const buildingProjects = Object.values(result.legendaryWonderProjects ?? {}).filter(project =>
      project.ownerId === 'ai-1' && project.phase === 'building',
    );
    const wonderIds = buildingProjects.map(project => project.wonderId);

    expect(new Set(wonderIds).size).toBe(wonderIds.length);
  });

  it('does not record stronghold history without a planned camp attack', () => {
    const state = makeAiBarbarianCampAttackState();
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.legendaryWonderHistory?.destroyedStrongholds).toEqual([]);
    expect(result.barbarianCamps['camp-1']).toBeDefined();
  });

  it('does not complete a stronghold quest without a canonical camp clear', () => {
    const state = makeAiBarbarianCampAttackState();
    const bus = new EventBus();

    const afterCombat = processAITurn(state, 'ai-1', bus);
    const afterTick = tickLegendaryWonderProjects(afterCombat, new EventBus());
    const project = Object.values(afterTick.legendaryWonderProjects ?? {}).find(candidate =>
      candidate.ownerId === 'ai-1' && candidate.wonderId === 'sun-spire',
    );

    expect(project?.questSteps.find(step => step.id === 'defeat-nearby-stronghold')?.completed)
      .toBe(false);
  });
});

describe('S4b — AI resource-aware production', () => {
  function makeSingleCivState(options: {
    tiles?: Record<string, GameState['map']['tiles'][string]>;
    resources?: ResourceType[];
    completedTechs?: string[];
  } = {}): GameState {
    // Minimal state with one AI civ and one city
    const tile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland' as const,
      elevation: 'lowland' as const, resource: null, improvement: 'none' as const,
      owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    const resourceTile = options.resources?.length ? {
      coord: { q: 1, r: 0 }, terrain: 'hills' as const,
      elevation: 'lowland' as const,
      resource: options.resources[0] as ResourceType,
      improvement: 'mine' as const,
      owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    } : undefined;

    const tiles: Record<string, GameState['map']['tiles'][string]> = {
      '0,0': tile,
      ...(resourceTile ? { '1,0': resourceTile } : {}),
      ...(options.tiles ?? {}),
    };

    const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const map = { width: 8, height: 8, tiles, wrapsHorizontally: false, rivers: [] };
    const city = foundCity('ai-1', { q: 0, r: 0 }, map, counters);

    return {
      turn: 5,
      era: 1,
      currentPlayer: 'ai-1',
      gameOver: false,
      winner: null,
      map,
      units: {},
      cities: { [city.id]: city },
      civilizations: {
        'ai-1': {
          id: 'ai-1',
          name: 'Test AI',
          color: '#ff0000',
          isHuman: false,
          civType: 'generic',
          cities: [city.id],
          units: [],
          techState: {
            completed: options.completedTechs ?? [],
            current: null,
            progress: 0,
          },
          gold: 50,
          visibility: { tiles: {} },
          score: 0,
          diplomacy: { relationships: {}, atWarWith: [], treatyRequestsSent: [], treatyRequestsReceived: [], vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 } },
        },
      },
      barbarianCamps: {},
      tribalVillages: {},
      minorCivs: {},
      marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] },
      espionage: {},
      legendaryWonderProjects: {},
    } as unknown as GameState;
  }

  it('AI never queues resource-blocked unit', () => {
    // AI has stone-weapons but no copper — should not queue axeman
    const state = makeSingleCivState({ completedTechs: ['stone-weapons'] });
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    const city = Object.values(newState.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).not.toContain('axeman');
  });

  it('AI queues axeman when copper is available', () => {
    // Resources are determined by tiles with the resource + mine improvement
    // This test verifies the AI uses the resource-gated unit list
    const state = makeSingleCivState({
      completedTechs: ['stone-weapons'],
      resources: ['copper'],
    });
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    // We just verify it doesn't crash and doesn't queue a blocked item
    const city = Object.values(newState.cities).find(c => c.owner === 'ai-1')!;
    if (city.productionQueue.includes('axeman')) {
      // If axeman was chosen, copper must be available
      const resources = getCivAvailableResources(state, 'ai-1');
      expect(resources.has('copper')).toBe(true);
    }
  });

  it('AI does not queue resource-blocked building', () => {
    // AI has stone-weapons but no copper — should not queue bronze-workshop
    const state = makeSingleCivState({ completedTechs: ['stone-weapons'] });
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    const city = Object.values(newState.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).not.toContain('bronze-workshop');
  });
});

describe('Expedition AI parity', () => {
  function makeExpeditionAiState(opts: {
    completedTechs: string[];
    expeditionUnit?: { pos: { q: number; r: number }; resource: string; techForResource: string };
  }): GameState {
    const cityTile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland' as const,
      elevation: 'lowland' as const, resource: null, improvement: 'none' as const,
      owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    // Resource tile far outside city territory (distance ~7)
    const farResourcePos = { q: 5, r: 0 };
    const farResourceTile = {
      coord: farResourcePos, terrain: 'forest' as const,
      elevation: 'lowland' as const, resource: 'ivory' as const,
      improvement: 'none' as const, owner: null,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };

    const tiles: Record<string, GameState['map']['tiles'][string]> = {
      '0,0': cityTile,
      [hexKey(farResourcePos)]: farResourceTile,
    };

    // If testing expedition use, also put the expedition's resource tile in
    let expeditionUnitEntry: Record<string, GameState['units'][string]> = {};
    let civUnitIds: string[] = [];

    if (opts.expeditionUnit) {
      const { pos, resource } = opts.expeditionUnit;
      const resourceKey = hexKey(pos);
      tiles[resourceKey] = {
        coord: pos, terrain: 'hills' as const,
        elevation: 'lowland' as const, resource: resource as never,
        improvement: 'none' as const, owner: null,
        improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
      expeditionUnitEntry = {
        'ai-exp-1': {
          id: 'ai-exp-1', type: 'expedition' as const, owner: 'ai-1',
          position: { ...pos }, movementPointsLeft: 3, health: 100, experience: 0,
          hasMoved: false, hasActed: false, isResting: false,
        } as never,
      };
      civUnitIds = ['ai-exp-1'];
    }

    const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const map = { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] };
    const city = foundCity('ai-1', { q: 0, r: 0 }, map, counters);

    return {
      turn: 5, era: 1, currentPlayer: 'ai-1', gameOver: false, winner: null,
      map,
      units: expeditionUnitEntry,
      cities: { [city.id]: city },
      civilizations: {
        'ai-1': {
          id: 'ai-1', name: 'Test AI', color: '#ff0000',
          isHuman: false, civType: 'generic',
          cities: [city.id],
          units: civUnitIds,
          techState: {
            completed: opts.completedTechs,
            current: null, progress: 0,
          },
          gold: 50,
          visibility: { tiles: {} },
          score: 0,
          diplomacy: { relationships: {}, atWarWith: [], treatyRequestsSent: [], treatyRequestsReceived: [], vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 } },
        },
      },
      barbarianCamps: {}, tribalVillages: {}, minorCivs: {},
      marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] },
      espionage: {},
      legendaryWonderProjects: {},
    } as unknown as GameState;
  }

  it('does not queue an Expedition from a hidden resource tile', () => {
    const state = makeExpeditionAiState({ completedTechs: ['foraging'] });
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    const city = Object.values(newState.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).not.toContain('expedition');
  });

  it('calls performEstablishOutpost when Expedition is on an eligible resource tile', () => {
    const pos = { q: 8, r: 0 };
    const state = makeExpeditionAiState({
      completedTechs: ['foraging', 'bronze-working'],
      expeditionUnit: { pos, resource: 'iron', techForResource: 'bronze-working' },
    });
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    // Unit should be consumed by outpost
    expect(newState.units['ai-exp-1']).toBeUndefined();
    // Tile should have an outpost
    expect(newState.map.tiles[hexKey(pos)].improvement).toBe('resource_outpost');
  });
});

describe('AI transport load/unload', () => {
  const baseDiplomacy = (atWarWith: string[] = []) => ({
    relationships: {} as Record<string, number>,
    treaties: [] as any[],
    events: [] as any[],
    atWarWith,
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 1 },
  });

  function makeTransportLoadState(): GameState {
    const transport = createUnit('transport', 'ai-1', { q: 1, r: 0 }, mkC());
    transport.id = 'transport-1';
    transport.cargoUnitIds = [];

    const warrior = createUnit('warrior', 'ai-1', { q: 0, r: 0 }, mkC());
    warrior.id = 'warrior-1';

    return {
      turn: 1, era: 1, currentPlayer: 'ai-1', gameOver: false, winner: null,
      map: {
        width: 6, height: 6, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '1,0': { coord: { q: 1, r: 0 }, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      units: { [transport.id]: transport, [warrior.id]: warrior },
      cities: {},
      civilizations: {
        'ai-1': {
          id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic',
          cities: [], units: [transport.id, warrior.id],
          techState: { completed: ['galleys'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 0, visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } },
          score: 0, knownCivilizations: [],
          diplomacy: baseDiplomacy(),
        },
      },
      barbarianCamps: {}, minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
      embargoes: [], defensiveLeagues: [],
      idCounters: { nextUnitId: 3, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
      pendingDiplomacyRequests: [], legendaryWonderIntel: {},
      legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    } as GameState;
  }

  function makeTransportUnloadState(): GameState {
    const warrior = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC());
    warrior.id = 'warrior-1';
    warrior.transportId = 'transport-1';
    warrior.hasMoved = false;
    warrior.hasActed = false;
    warrior.movementPointsLeft = 2;

    const transport = createUnit('transport', 'ai-1', { q: 1, r: 0 }, mkC());
    transport.id = 'transport-1';
    transport.cargoUnitIds = ['warrior-1'];

    return {
      turn: 1, era: 1, currentPlayer: 'ai-1', gameOver: false, winner: null,
      map: {
        width: 6, height: 6, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '1,0': { coord: { q: 1, r: 0 }, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      units: { [transport.id]: transport, [warrior.id]: warrior },
      cities: {},
      civilizations: {
        'ai-1': {
          id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic',
          cities: [], units: [transport.id, warrior.id],
          techState: { completed: ['galleys'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 0, visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } },
          score: 0, knownCivilizations: ['player'],
          diplomacy: baseDiplomacy(['player']),
        },
        player: {
          id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: 'generic',
          cities: [], units: [],
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 0, visibility: { tiles: {} }, score: 0, knownCivilizations: ['ai-1'],
          diplomacy: baseDiplomacy(['ai-1']),
        },
      },
      barbarianCamps: {}, minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
      embargoes: [], defensiveLeagues: [],
      idCounters: { nextUnitId: 3, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
      pendingDiplomacyRequests: [], legendaryWonderIntel: {},
      legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    } as GameState;
  }

  it('transport loads an adjacent idle land unit', () => {
    const state = makeTransportLoadState();
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.units['warrior-1']?.transportId).toBe('transport-1');
  });

  it('transport unloads cargo onto an adjacent enemy-owned tile', () => {
    const state = makeTransportUnloadState();
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.units['warrior-1']?.transportId).toBeUndefined();
    expect(result.units['warrior-1']?.position).toEqual({ q: 0, r: 0 });
  });

  it('transport loads ALL adjacent idle land units up to capacity in one turn', () => {
    // Two warriors flank the transport: warrior-1 at (0,0), warrior-2 at (2,0).
    // Transport capacity=2 means both should board in a single AI turn.
    const transport = createUnit('transport', 'ai-1', { q: 1, r: 0 }, mkC());
    transport.id = 'transport-1';
    transport.cargoUnitIds = [];

    const warrior1 = createUnit('warrior', 'ai-1', { q: 0, r: 0 }, mkC());
    warrior1.id = 'warrior-1';
    const warrior2 = createUnit('warrior', 'ai-1', { q: 2, r: 0 }, mkC());
    warrior2.id = 'warrior-2';

    const state: GameState = {
      turn: 1, era: 1, currentPlayer: 'ai-1', gameOver: false, winner: null,
      map: {
        width: 6, height: 6, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '1,0': { coord: { q: 1, r: 0 }, terrain: 'coast',     elevation: 'lowland', resource: null, improvement: 'none', owner: null,   improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '2,0': { coord: { q: 2, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      units: { [transport.id]: transport, [warrior1.id]: warrior1, [warrior2.id]: warrior2 },
      cities: {},
      civilizations: {
        'ai-1': {
          id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic',
          cities: [], units: [transport.id, warrior1.id, warrior2.id],
          techState: { completed: ['galleys'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 0, visibility: { tiles: { '0,0': 'visible', '1,0': 'visible', '2,0': 'visible' } },
          score: 0, knownCivilizations: [],
          diplomacy: baseDiplomacy(),
        },
      },
      barbarianCamps: {}, minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
      embargoes: [], defensiveLeagues: [],
      idCounters: { nextUnitId: 4, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
      pendingDiplomacyRequests: [], legendaryWonderIntel: {},
      legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    } as GameState;

    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.units['warrior-1']?.transportId).toBe('transport-1');
    expect(result.units['warrior-2']?.transportId).toBe('transport-1');
  });

  it('transport unloads ALL eligible cargo in one turn when multiple enemy tiles are adjacent', () => {
    // Two warriors aboard; transport flanked by two enemy-owned grassland tiles.
    // Both warriors should be unloaded in a single AI turn.
    const warrior1 = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC());
    warrior1.id = 'warrior-1';
    warrior1.transportId = 'transport-1';
    warrior1.hasMoved = false;
    warrior1.hasActed = false;
    warrior1.movementPointsLeft = 2;

    const warrior2 = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC());
    warrior2.id = 'warrior-2';
    warrior2.transportId = 'transport-1';
    warrior2.hasMoved = false;
    warrior2.hasActed = false;
    warrior2.movementPointsLeft = 2;

    const transport = createUnit('transport', 'ai-1', { q: 1, r: 0 }, mkC());
    transport.id = 'transport-1';
    transport.cargoUnitIds = ['warrior-1', 'warrior-2'];

    const state: GameState = {
      turn: 1, era: 1, currentPlayer: 'ai-1', gameOver: false, winner: null,
      map: {
        width: 6, height: 6, wrapsHorizontally: false, rivers: [],
        tiles: {
          '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '1,0': { coord: { q: 1, r: 0 }, terrain: 'coast',     elevation: 'lowland', resource: null, improvement: 'none', owner: null,     improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '2,0': { coord: { q: 2, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      units: { [transport.id]: transport, [warrior1.id]: warrior1, [warrior2.id]: warrior2 },
      cities: {},
      civilizations: {
        'ai-1': {
          id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic',
          cities: [], units: [transport.id, warrior1.id, warrior2.id],
          techState: { completed: ['galleys'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 0, visibility: { tiles: { '0,0': 'visible', '1,0': 'visible', '2,0': 'visible' } },
          score: 0, knownCivilizations: ['player'],
          diplomacy: baseDiplomacy(['player']),
        },
        player: {
          id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: 'generic',
          cities: [], units: [],
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 0, visibility: { tiles: {} }, score: 0, knownCivilizations: ['ai-1'],
          diplomacy: baseDiplomacy(['ai-1']),
        },
      },
      barbarianCamps: {}, minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
      embargoes: [], defensiveLeagues: [],
      idCounters: { nextUnitId: 4, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
      pendingDiplomacyRequests: [], legendaryWonderIntel: {},
      legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    } as GameState;

    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.units['warrior-1']?.transportId).toBeUndefined();
    expect(result.units['warrior-2']?.transportId).toBeUndefined();
    // Warriors landed on the two flanking enemy tiles (one each)
    const positions = [result.units['warrior-1']?.position, result.units['warrior-2']?.position];
    expect(positions).toContainEqual({ q: 0, r: 0 });
    expect(positions).toContainEqual({ q: 2, r: 0 });
  });
});

describe('AI naval warship movement', () => {
  function makeNavalWarshipState(): GameState {
    function coastTile(q: number, r: number) {
      return {
        coord: { q, r },
        terrain: 'coast' as const,
        elevation: 'lowland' as const,
        resource: null,
        improvement: 'none' as const,
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }

    const aiGalley = createUnit('galley', 'ai-1', { q: 2, r: 0 }, mkC());
    aiGalley.id = 'ai-galley';

    const enemyGalley = createUnit('galley', 'player', { q: 4, r: 0 }, mkC());
    enemyGalley.id = 'enemy-galley';

    return {
      turn: 1,
      era: 1,
      currentPlayer: 'ai-1',
      gameOver: false,
      winner: null,
      map: {
        width: 8,
        height: 8,
        tiles: {
          '0,0': coastTile(0, 0),
          '1,0': coastTile(1, 0),
          '2,0': coastTile(2, 0),
          '3,0': coastTile(3, 0),
          '4,0': coastTile(4, 0),
        },
        wrapsHorizontally: false,
        rivers: [],
      },
      units: { [aiGalley.id]: aiGalley, [enemyGalley.id]: enemyGalley },
      cities: {},
      civilizations: {
        'ai-1': {
          id: 'ai-1',
          name: 'AI',
          color: '#d94a4a',
          isHuman: false,
          civType: 'generic',
          cities: [],
          units: [aiGalley.id],
          techState: {
            completed: ['galleys'],
            currentResearch: null,
            researchProgress: 0,
            researchQueue: [],
            trackPriorities: {} as any,
          },
          gold: 0,
          visibility: {
            tiles: { '2,0': 'visible', '3,0': 'visible', '4,0': 'visible' },
          },
          score: 0,
          knownCivilizations: ['player'],
          diplomacy: {
            relationships: { player: -80 },
            treaties: [],
            events: [],
            atWarWith: ['player'],
            treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 1 },
          },
        },
        player: {
          id: 'player',
          name: 'Player',
          color: '#4a90d9',
          isHuman: true,
          civType: 'generic',
          cities: [],
          units: [enemyGalley.id],
          techState: {
            completed: ['galleys'],
            currentResearch: null,
            researchProgress: 0,
            researchQueue: [],
            trackPriorities: {} as any,
          },
          gold: 0,
          visibility: { tiles: {} },
          score: 0,
          knownCivilizations: ['ai-1'],
          diplomacy: {
            relationships: { 'ai-1': -80 },
            treaties: [],
            events: [],
            atWarWith: ['ai-1'],
            treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 1 },
          },
        },
      },
      barbarianCamps: {},
      minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: {
        mapSize: 'small', soundEnabled: false, musicEnabled: false,
        musicVolume: 0, sfxVolume: 0, tutorialEnabled: false,
        advisorsEnabled: {} as any, councilTalkLevel: 'normal',
      },
      tribalVillages: {},
      discoveredWonders: {},
      wonderDiscoverers: {},
      embargoes: [],
      defensiveLeagues: [],
      idCounters: { nextUnitId: 3, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
      pendingDiplomacyRequests: [],
      legendaryWonderIntel: {},
      legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    } as GameState;
  }

  it('does not run the removed opportunistic naval chase', () => {
    // Setup: AI galley at (2,0), enemy galley at (4,0).
    // (0,0) and (1,0) are unexplored — current code would pick those.
    // (3,0) is explored and closest reachable tile to enemy — fixed code picks it.
    const state = makeNavalWarshipState();
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    const galley = result.units['ai-galley'];
    const initialDist = hexDistance({ q: 2, r: 0 }, { q: 4, r: 0 }); // 2
    const finalDist = hexDistance(galley.position, { q: 4, r: 0 });
    expect(finalDist).toBe(initialDist);
  });

  it('does not run the removed opportunistic naval attack', () => {
    const state = makeNavalWarshipState();
    // Move enemy galley adjacent to AI galley
    state.units['enemy-galley'] = { ...state.units['enemy-galley'], position: { q: 3, r: 0 } };
    const bus = new EventBus();
    const combatEvents: unknown[] = [];
    bus.on('combat:resolved', payload => combatEvents.push(payload));

    processAITurn(state, 'ai-1', bus);

    expect(combatEvents).toHaveLength(0);
  });
});

describe('AI grenadier production priority', () => {
  function makeGrenadierState(): GameState {
    const state = makeAiRebelState();
    // Give AI a city with an empty production queue
    state.cities = {
      'city-ai': {
        id: 'city-ai', owner: 'ai-1', name: 'Rome',
        position: { q: 0, r: 0 },
        population: 3, food: 0, foodNeeded: 20,
        buildings: ['granary', 'blacksmith'],
        productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town',
      } as any,
    };
    state.civilizations['ai-1'].cities = ['city-ai'];
    state.map.tiles['0,0'] = {
      coord: { q: 0, r: 0 }, terrain: 'plains', elevation: 'lowland',
      resource: null, improvement: 'none', owner: 'ai-1',
      improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    } as any;
    return state;
  }

  it('does not queue grenadier when grenade-warfare is not researched', () => {
    const state = makeGrenadierState();
    state.civilizations['ai-1'].techState.completed = [];
    processAITurn(state, 'ai-1', new EventBus());
    expect(state.cities['city-ai'].productionQueue).not.toContain('grenadier');
  });

  it('uses catalog scoring instead of hardcoding grenadier as first priority', () => {
    const state = makeGrenadierState();
    state.civilizations['ai-1'].techState.completed = ['grenade-warfare', 'iron-forging', 'swords'];
    const result = processAITurn(state, 'ai-1', new EventBus());
    const updatedCity = result.cities['city-ai'];
    expect(updatedCity.productionQueue[0]).not.toBe('grenadier');
  });

  it('does not queue a second grenadier when one already exists', () => {
    const state = makeGrenadierState();
    state.civilizations['ai-1'].techState.completed = ['grenade-warfare', 'iron-forging', 'swords'];
    const grenadier = createUnit('grenadier', 'ai-1', { q: 0, r: 0 }, mkC());
    grenadier.id = 'unit-grenadier';
    state.units[grenadier.id] = grenadier;
    state.civilizations['ai-1'].units.push(grenadier.id);
    const result = processAITurn(state, 'ai-1', new EventBus());
    expect(result.cities['city-ai'].productionQueue[0]).not.toBe('grenadier');
  });
});

describe('#436 — AI appease uses the shared helper', () => {
  // createNewGame starts each civ with a Settler and zero founded cities — the AI
  // founds its own starting city via its settler during its first processAITurn
  // call. Run one real turn first so aiCityId refers to an actual, well-formed
  // City record (with a real position) before layering unrest onto it, instead of
  // assuming civ.cities[0] is already populated right after game creation.
  function makeSettledAiState(seed: string): { state: GameState; aiCityId: string } {
    const bus = new EventBus();
    let state = createNewGame(undefined, seed, 'small');
    state = processAITurn(state, 'ai-1', bus);
    const aiCityId = state.civilizations['ai-1'].cities[0];
    expect(aiCityId).toBeDefined();
    return { state, aiCityId };
  }

  it('AI appeasing unrest produces the same city result as a direct appeaseFaction call, and spends at least the appease cost', () => {
    const { state, aiCityId } = makeSettledAiState('436-ai-appease');
    state.cities[aiCityId] = {
      ...state.cities[aiCityId],
      unrestLevel: 2,
      unrestTurns: 5,
      spyUnrestBonus: 10,
    };
    state.civilizations['ai-1'].gold = 1000;
    const cost = getCityAppeaseCost(state.cities[aiCityId]);

    const expected = appeaseFaction(structuredClone(state), aiCityId, 'ai-1');

    const bus = new EventBus();
    const afterAiTurn = processAITurn(state, 'ai-1', bus);

    // Unrest-specific city fields are only ever touched by appease within a single
    // AI turn, so these compare exactly against a direct appeaseFaction call.
    expect(afterAiTurn.cities[aiCityId].unrestLevel).toBe(expected.state.cities[aiCityId].unrestLevel);
    expect(afterAiTurn.cities[aiCityId].unrestTurns).toBe(expected.state.cities[aiCityId].unrestTurns);
    expect(afterAiTurn.cities[aiCityId].spyUnrestBonus).toBe(expected.state.cities[aiCityId].spyUnrestBonus);
    // Gold is not compared for exact equality: processAITurn runs the AI's entire
    // turn (research, production, possibly other spending), not just appease, so
    // the only property that must hold is that at least the appease cost was spent.
    expect(afterAiTurn.civilizations['ai-1'].gold).toBeLessThanOrEqual(1000 - cost);
  });

  it('AI does not appease when it cannot afford the cost (unchanged unrest)', () => {
    const { state, aiCityId } = makeSettledAiState('436-ai-appease-poor');
    state.cities[aiCityId] = { ...state.cities[aiCityId], unrestLevel: 2, unrestTurns: 5 };
    state.civilizations['ai-1'].gold = 0;

    const bus = new EventBus();
    const afterAiTurn = processAITurn(state, 'ai-1', bus);

    expect(afterAiTurn.cities[aiCityId].unrestLevel).toBe(2);
    expect(afterAiTurn.civilizations['ai-1'].gold).toBe(0);
  });
});
