// tests/integration/m4a-espionage-integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import {
  createEspionageCivState,
  recruitSpy,
  assignSpy,
  startMission,
  processEspionageTurn,
  initializeEspionage,
  _resetSpyIdCounter,
} from '@/systems/espionage-system';
import type { GameState, EspionageState } from '@/core/types';

function makeTestGameState(): GameState {
  return {
    turn: 10,
    era: 2,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'unit-eg-1': {
        id: 'unit-eg-1', type: 'warrior', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, movementPointsLeft: 2,
        health: 100, experience: 0, hasMoved: false, hasActed: false,
      },
    },
    cities: {
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: ['granary'], productionQueue: ['warrior'],
        productionProgress: 10, ownedTiles: [{ q: 5, r: 3 }],
        grid: [[null]], gridSize: 3,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: [], units: [],
        techState: {
          completed: ['espionage-scouting', 'espionage-informants'],
          currentResearch: null, researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 100,
        visibility: { tiles: {} },
        score: 50,
        diplomacy: {
          relationships: { 'ai-egypt': 0 },
          treaties: [], events: [], atWarWith: [],
        },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: ['unit-eg-1'],
        techState: {
          completed: ['agriculture-farming'],
          currentResearch: 'science-writing', researchProgress: 30,
          trackPriorities: {} as any,
        },
        gold: 150,
        visibility: { tiles: {} },
        score: 100,
        diplomacy: {
          relationships: { player: 0 },
          treaties: [], events: [], atWarWith: [],
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
  } as GameState;
}

describe('espionage integration', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    _resetSpyIdCounter();
  });

  describe('initializeEspionage', () => {
    it('creates espionage state for all civs', () => {
      const state = makeTestGameState();
      const espionage = initializeEspionage(state);
      expect(espionage['player']).toBeDefined();
      expect(espionage['ai-egypt']).toBeDefined();
      expect(espionage['player'].maxSpies).toBeGreaterThanOrEqual(1);
    });

    it('increases maxSpies based on espionage tech progress', () => {
      const state = makeTestGameState();
      // Player has scouting + informants -> maxSpies should be 2
      const espionage = initializeEspionage(state);
      expect(espionage['player'].maxSpies).toBe(2);
    });
  });

  describe('processEspionageTurn', () => {
    it('processes all civs spy turns and transitions traveling to stationed', () => {
      const state = makeTestGameState();
      state.espionage = initializeEspionage(state);
      const { state: s1, spy } = recruitSpy(state.espionage['player'], 'player', 'seed-1');
      state.espionage['player'] = s1;
      state.espionage['player'] = assignSpy(
        state.espionage['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
      );

      const newState = processEspionageTurn(state, bus);
      const updatedSpy = newState.espionage!['player'].spies[spy.id];
      expect(updatedSpy.status).toBe('stationed');
    });

    it('applies diplomatic penalty on spy capture', () => {
      const state = makeTestGameState();
      state.espionage = initializeEspionage(state);
      const { state: s1, spy } = recruitSpy(state.espionage['player'], 'player', 'seed-1');
      state.espionage['player'] = s1;
      state.espionage['player'] = assignSpy(
        state.espionage['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
      );
      // Force spy to on_mission with 1 turn left
      state.espionage['player'].spies[spy.id].status = 'on_mission';
      state.espionage['player'].spies[spy.id].currentMission = {
        type: 'gather_intel', turnsRemaining: 1, turnsTotal: 3,
        targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1',
      };
      // Set high counter-intel to force failure
      state.espionage['ai-egypt'].counterIntelligence['city-egypt-1'] = 100;

      // Run many seeds until we get a capture
      let captureFound = false;
      for (let i = 0; i < 50; i++) {
        const testState = structuredClone(state);
        testState.turn = 10 + i; // Vary seed
        const newState = processEspionageTurn(testState, bus);
        const updatedSpy = newState.espionage!['player'].spies[spy.id];
        if (updatedSpy.status === 'captured') {
          // Check bilateral diplomatic penalty was applied
          expect(newState.civilizations['ai-egypt'].diplomacy.relationships['player']).toBeLessThan(0);
          expect(newState.civilizations['ai-egypt'].diplomacy.events.some(
            e => e.type === 'spy_captured',
          )).toBe(true);
          // Check spy owner side also penalized
          expect(newState.civilizations['player'].diplomacy.relationships['ai-egypt']).toBeLessThan(0);
          captureFound = true;
          break;
        }
      }
      expect(captureFound).toBe(true);
    });

    it('processes all civs spies each turn', () => {
      const state = makeTestGameState();
      state.espionage = initializeEspionage(state);
      // Both civs have spies
      const { state: ps, spy: pSpy } = recruitSpy(state.espionage['player'], 'player', 'p-seed');
      state.espionage['player'] = ps;
      const { state: es, spy: eSpy } = recruitSpy(state.espionage['ai-egypt'], 'ai-egypt', 'e-seed');
      state.espionage['ai-egypt'] = es;

      // Both traveling
      state.espionage['player'] = assignSpy(state.espionage['player'], pSpy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
      state.espionage['ai-egypt'].spies[eSpy.id].status = 'traveling';
      state.espionage['ai-egypt'].spies[eSpy.id].targetCivId = 'player';

      const newState = processEspionageTurn(state, bus);
      // All spies should transition
      expect(newState.espionage!['player'].spies[pSpy.id].status).toBe('stationed');
      expect(newState.espionage!['ai-egypt'].spies[eSpy.id].status).toBe('stationed');
    });

    it('returns state unchanged when espionage is undefined', () => {
      const state = makeTestGameState();
      delete (state as any).espionage;
      const newState = processEspionageTurn(state, bus);
      expect(newState).toBe(state);
    });
  });
});
