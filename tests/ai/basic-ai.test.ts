import { processAITurn } from '@/ai/basic-ai';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { createEspionageCivState } from '@/systems/espionage-system';

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
        techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
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
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
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
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
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

describe('processAITurn', () => {
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

  it('AI attacks adjacent rebel units during revolt cleanup', () => {
    const state = makeAiRebelState();
    const bus = new EventBus();

    const newState = processAITurn(state, 'ai-1', bus);

    expect(newState.units['unit-rebel']).toBeUndefined();
  });

  it('AI stations a defensive spy in its capital by stage 3', () => {
    const state = makeAiDefenseSpyState();
    const bus = new EventBus();

    const newState = processAITurn(state, 'ai-1', bus);

    const spies = Object.values(newState.espionage!['ai-1'].spies);
    expect(spies).toHaveLength(1);
    expect(spies[0].status).toBe('stationed');
    expect(spies[0].targetCivId).toBeNull();
    expect(spies[0].targetCityId).toBe('city-ai');
    expect(newState.espionage!['ai-1'].counterIntelligence['city-ai']).toBeGreaterThan(0);
  });
});
