// tests/integration/spy-lifecycle.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import {
  createEspionageCivState,
  createSpyFromUnit,
  cleanupDeadSpyUnit,
  _resetSpyIdCounter,
} from '@/systems/espionage-system';
import { processCity, getTrainableUnitsForCiv } from '@/systems/city-system';
import { processTurn } from '@/core/turn-manager';

function makeBaseState(): GameState {
  return {
    turn: 5,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: {
      width: 4,
      height: 4,
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 },
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
      'city-player': {
        id: 'city-player',
        name: 'Capital',
        owner: 'player',
        position: { q: 0, r: 0 },
        population: 3,
        food: 0,
        foodNeeded: 10,
        buildings: [],
        productionQueue: ['spy_scout'],
        productionProgress: 999,
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
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: ['city-player'],
        units: [],
        techState: {
          completed: ['espionage-scouting'],
          currentResearch: null,
          researchProgress: 0,
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: {},
          treaties: [],
          events: [],
          atWarWith: [],
          treacheryScore: 0,
          vassalage: {
            overlord: null,
            vassals: [],
            protectionScore: 100,
            protectionTimers: [],
            peakCities: 1,
            peakMilitary: 0,
          },
        },
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
    espionage: {
      player: { ...createEspionageCivState(), maxSpies: 2 },
    },
  } as unknown as GameState;
}

describe('spy lifecycle integration', () => {
  beforeEach(() => {
    _resetSpyIdCounter();
  });

  it('trains spy_scout and creates matching Spy record with same id', () => {
    const state = makeBaseState();
    const bus = new EventBus();
    const newState = processTurn(state, bus);

    const units = Object.values(newState.units).filter(u => u.type === 'spy_scout');
    expect(units).toHaveLength(1);

    const spies = Object.values(newState.espionage!['player'].spies);
    expect(spies).toHaveLength(1);
    expect(spies[0].id).toBe(units[0].id);
  });

  it('new Spy record has status idle and owner player', () => {
    const state = makeBaseState();
    const bus = new EventBus();
    const newState = processTurn(state, bus);

    const spy = Object.values(newState.espionage!['player'].spies)[0];
    expect(spy.status).toBe('idle');
    expect(spy.owner).toBe('player');
    expect(spy.unitType).toBe('spy_scout');
  });

  it('emits espionage:spy-recruited on spy unit completion', () => {
    const state = makeBaseState();
    const bus = new EventBus();
    const events: any[] = [];
    bus.on('espionage:spy-recruited', (data) => events.push(data));

    processTurn(state, bus);

    expect(events).toHaveLength(1);
    expect(events[0].civId).toBe('player');
    expect(events[0].spy).toBeDefined();
    expect(events[0].spy.unitType).toBe('spy_scout');
  });

  it('obsolete spy_scout silently dequeues without producing when espionage-informants researched', () => {
    const city = {
      id: 'c1',
      name: 'Test',
      owner: 'player',
      position: { q: 0, r: 0 },
      population: 3,
      food: 0,
      foodNeeded: 10,
      buildings: [],
      productionQueue: ['spy_scout'],
      productionProgress: 999,
      ownedTiles: [],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      grid: [[null]],
      gridSize: 3,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    } as any;

    const completedTechs = ['espionage-scouting', 'espionage-informants'];
    const result = processCity(city, { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] } as any, 2, 10, undefined, completedTechs);

    expect(result.completedUnit).toBeNull();
    expect(result.city.productionQueue).toHaveLength(0);
  });

  it('processCity for Rome retains war_hound in queue when lookouts researched', () => {
    const city = {
      id: 'c1',
      name: 'Rome',
      owner: 'player',
      position: { q: 0, r: 0 },
      population: 3,
      food: 0,
      foodNeeded: 10,
      buildings: [],
      productionQueue: ['war_hound'],
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
    } as any;

    const result = processCity(city, { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] } as any, 0, 0, undefined, ['lookouts'], 'rome');
    expect(result.city.productionQueue).toContain('war_hound');
  });

  it('processCity for non-Rome civ drops war_hound from queue (not trainable)', () => {
    const city = {
      id: 'c1',
      name: 'Athens',
      owner: 'player',
      position: { q: 0, r: 0 },
      population: 3,
      food: 0,
      foodNeeded: 10,
      buildings: [],
      productionQueue: ['war_hound'],
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
    } as any;

    const result = processCity(city, { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] } as any, 0, 0, undefined, ['lookouts'], 'greece');
    expect(result.city.productionQueue).not.toContain('war_hound');
  });

  it('cleanupDeadSpyUnit removes Spy record after unit death', () => {
    const espionage = {
      player: { ...createEspionageCivState(), maxSpies: 1 },
    };
    const { state: espWithSpy } = createSpyFromUnit(
      espionage['player'], 'unit-dead-spy', 'player', 'spy_scout', 'seed-cleanup-test',
    );
    espionage['player'] = espWithSpy;

    expect(espionage['player'].spies['unit-dead-spy']).toBeDefined();

    const cleaned = cleanupDeadSpyUnit(espionage, 'player', 'unit-dead-spy');

    expect(cleaned['player'].spies['unit-dead-spy']).toBeUndefined();
    expect(Object.keys(cleaned['player'].spies)).toHaveLength(0);
  });
});
