import { processAITurn } from '@/ai/basic-ai';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { hexKey } from '@/systems/hex-utils';
import { tickLegendaryWonderProjects } from '@/systems/legendary-wonder-system';

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
  } as GameState;
}

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
    ...foundCity('player', { q: 1, r: 0 }, state.map),
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
          completed: ['philosophy', 'pilgrimages', 'city-planning', 'printing', 'banking', 'agricultural-science', 'astronomy', 'navigation'],
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

  it('assaults and occupies an exposed enemy city', () => {
    const state = makeAdjacentExposedCityState({ population: 5 });
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.cities['city-player'].owner).toBe('ai-1');
    expect(result.cities['city-player'].population).toBe(2);
    expect(result.cities['city-player'].occupation?.turnsRemaining).toBe(10);
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

  it('AI settler founds a city when possible', () => {
    const state = createNewGame(undefined, 'ai-test');
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    const aiCiv = newState.civilizations['ai-1'];
    // AI should try to found a city with its settler
    expect(aiCiv.cities.length + Object.values(newState.units).filter(
      u => u.owner === 'ai-1' && u.type === 'settler'
    ).length).toBeGreaterThanOrEqual(1);
  });

  it('does not found an AI city inside the shared city spacing boundary', () => {
    const state = createNewGame(undefined, 'ai-city-spacing');
    const bus = new EventBus();
    const playerCity = foundCity('player', { q: 10, r: 10 }, state.map);
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

  it('AI attacks adjacent rebel units during revolt cleanup', () => {
    const state = makeAiRebelState();
    const bus = new EventBus();

    const newState = processAITurn(state, 'ai-1', bus);

    expect(newState.units['unit-rebel']).toBeUndefined();
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

  it('AI declares war on its own secession state instead of treating it like normal diplomacy', () => {
    const state = makeAiBreakawayState();
    const bus = new EventBus();

    const newState = processAITurn(state, 'ai-1', bus);

    expect(newState.civilizations['ai-1'].diplomacy.atWarWith).toContain('breakaway-city-border');
    expect(newState.civilizations['breakaway-city-border'].diplomacy.atWarWith).toContain('ai-1');
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

  it('uses Stage 5 espionage remotely when an idle spy has cyber-warfare tech', () => {
    const state = makeAiDefenseSpyState();
    const bus = new EventBus();
    state.civilizations['ai-1'].techState.completed = [
      'espionage-scouting',
      'espionage-informants',
      'spy-networks',
      'digital-surveillance',
      'cyber-warfare',
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

    expect(result.espionage!['ai-1'].spies['spy-ai-1'].currentMission?.type).toBe('cyber_attack');
    expect(result.espionage!['ai-1'].spies['spy-ai-1'].currentMission?.targetCivId).toBe('player');
    expect(result.espionage!['ai-1'].spies['spy-ai-1'].currentMission?.targetCityId).toBe('city-player');
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

  it('records stronghold history when an ai civ clears a barbarian camp', () => {
    const state = makeAiBarbarianCampAttackState();
    const bus = new EventBus();

    const result = processAITurn(state, 'ai-1', bus);

    expect(result.legendaryWonderHistory?.destroyedStrongholds).toContainEqual(
      expect.objectContaining({ civId: 'ai-1', campId: 'camp-1' }),
    );
    expect(result.barbarianCamps['camp-1']).toBeUndefined();
  });

  it('lets an ai civ satisfy stronghold-backed wonder quests after clearing a camp', () => {
    const state = makeAiBarbarianCampAttackState();
    const bus = new EventBus();

    const afterCombat = processAITurn(state, 'ai-1', bus);
    const afterTick = tickLegendaryWonderProjects(afterCombat, new EventBus());
    const project = Object.values(afterTick.legendaryWonderProjects ?? {}).find(candidate =>
      candidate.ownerId === 'ai-1' && candidate.wonderId === 'sun-spire',
    );

    expect(project?.questSteps.find(step => step.id === 'defeat-nearby-stronghold')?.completed).toBe(true);
  });
});
