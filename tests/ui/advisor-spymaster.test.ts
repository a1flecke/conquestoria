// tests/ui/advisor-spymaster.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AdvisorSystem } from '@/ui/advisor-system';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { createEspionageCivState, recruitSpy, assignSpy, _resetSpyIdCounter } from '@/systems/espionage-system';

function makeSpymasterTestState(): GameState {
  const state = {
    turn: 10,
    era: 2,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player',
        position: { q: 0, r: 0 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: ['city-player-1'], units: [],
        techState: {
          completed: ['espionage-scouting'],
          currentResearch: null, researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: {
          relationships: { 'ai-egypt': -30 }, treaties: [],
          events: [], atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: {
          relationships: { player: -30 }, treaties: [], events: [], atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false,
      musicVolume: 0, sfxVolume: 0, tutorialEnabled: false,
      advisorsEnabled: {
        builder: false, explorer: false, chancellor: false,
        warchief: false, treasurer: false, scholar: false, spymaster: true,
      },
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    espionage: {},
  } as unknown as GameState;
  return state;
}

describe('spymaster advisor', () => {
  let bus: EventBus;
  let advisor: AdvisorSystem;

  beforeEach(() => {
    bus = new EventBus();
    advisor = new AdvisorSystem(bus);
    _resetSpyIdCounter();
  });

  it('suggests recruiting when espionage tech unlocked and no spies active', () => {
    const state = makeSpymasterTestState();
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeDefined();
    expect(spyMsg!.message).toMatch(/spy|recruit|intelligence/i);
  });

  it('warns about hostile civ without spy coverage', () => {
    const state = makeSpymasterTestState();
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeDefined();
  });

  it('does not trigger if spymaster is disabled', () => {
    const state = makeSpymasterTestState();
    state.settings.advisorsEnabled.spymaster = false;
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeUndefined();
  });

  it('does not trigger before espionage tech is researched', () => {
    const state = makeSpymasterTestState();
    state.civilizations['player'].techState.completed = []; // No espionage tech
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeUndefined();
  });

  it('suppresses a disabled advisor until the assassination timer expires', () => {
    const state = makeSpymasterTestState();
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };
    state.civilizations.player.advisorDisabledUntil = { spymaster: 12 };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    expect(messages.find(m => m.advisor === 'spymaster')).toBeUndefined();

    state.turn = 13;
    advisor.resetMessage('spymaster_recruit_first_spy');
    advisor.check(state);
    expect(messages.find(m => m.advisor === 'spymaster')).toBeDefined();
  });

  it('warns about unrest when the chancellor advisor is enabled', () => {
    const state = makeSpymasterTestState();
    state.settings.advisorsEnabled = {
      builder: false,
      explorer: false,
      chancellor: true,
      warchief: false,
      treasurer: false,
      scholar: false,
      spymaster: false,
    };
    state.cities['city-player-1'].unrestLevel = 1;

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const chancellorMsg = messages.find(m => m.advisor === 'chancellor');
    expect(chancellorMsg).toBeDefined();
    expect(chancellorMsg!.message).toMatch(/unrest/i);
  });

  it('warns about revolt when the chancellor advisor is enabled', () => {
    const state = makeSpymasterTestState();
    state.settings.advisorsEnabled = {
      builder: false,
      explorer: false,
      chancellor: true,
      warchief: false,
      treasurer: false,
      scholar: false,
      spymaster: false,
    };
    state.cities['city-player-1'].unrestLevel = 2;

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const chancellorMsg = messages.find(m => m.advisor === 'chancellor');
    expect(chancellorMsg).toBeDefined();
    expect(chancellorMsg!.message).toMatch(/revolt/i);
  });
});
