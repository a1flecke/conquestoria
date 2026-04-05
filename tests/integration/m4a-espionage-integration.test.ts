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
import { getCivDefinition } from '@/systems/civ-definitions';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';

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
        health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
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
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
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
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
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

describe('hot seat espionage safety', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    _resetSpyIdCounter();
  });

  it('never exposes one players spy data to another', () => {
    const state = makeTestGameState();
    // Add player-2
    state.civilizations['player-2'] = {
      id: 'player-2', name: 'Rome', color: '#dc2626',
      isHuman: true, civType: 'rome',
      cities: ['city-rome-1'], units: [],
      techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
      gold: 100, visibility: { tiles: {} }, score: 50,
      diplomacy: { relationships: { player: 0 }, treaties: [], events: [], atWarWith: [] },
    } as any;
    state.cities['city-rome-1'] = {
      id: 'city-rome-1', name: 'Rome', owner: 'player-2',
      position: { q: 8, r: 1 }, population: 3, food: 0, foodNeeded: 15,
      buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [], grid: [[null]], gridSize: 3,
    } as any;
    state.espionage = {
      player: createEspionageCivState(),
      'player-2': createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    // Player 1 recruits and assigns spy to player 2
    const { state: pEsp, spy: pSpy } = recruitSpy(state.espionage['player'], 'player', 'p-seed');
    state.espionage['player'] = assignSpy(pEsp, pSpy.id, 'player-2', 'city-rome-1', { q: 8, r: 1 });

    // When it's player 2's turn, player 1's spy data should not be accessible
    state.currentPlayer = 'player-2';
    const p2Espionage = state.espionage['player-2'];
    // Player 2's espionage state should NOT contain player 1's spies
    expect(Object.values(p2Espionage.spies).some(s => s.owner === 'player')).toBe(false);
  });

  it('espionage events use currentPlayer for context', () => {
    const state = makeTestGameState();
    state.currentPlayer = 'player';
    state.espionage = initializeEspionage(state);

    // Only the current player's espionage data should be shown in UI
    const currentEsp = state.espionage![state.currentPlayer];
    expect(currentEsp).toBeDefined();
    expect(currentEsp.spies).toBeDefined();
  });

  it('processes all civ espionage during turn processing regardless of currentPlayer', () => {
    const state = makeTestGameState();
    state.currentPlayer = 'player';
    state.espionage = initializeEspionage(state);

    // Both player and AI have traveling spies
    const { state: pEsp, spy: pSpy } = recruitSpy(state.espionage!['player'], 'player', 'p-seed');
    state.espionage!['player'] = assignSpy(pEsp, pSpy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });

    const { state: aEsp, spy: aSpy } = recruitSpy(state.espionage!['ai-egypt'], 'ai-egypt', 'a-seed');
    state.espionage!['ai-egypt'] = aEsp;
    state.espionage!['ai-egypt'].spies[aSpy.id].status = 'traveling';
    state.espionage!['ai-egypt'].spies[aSpy.id].targetCivId = 'player';

    const newState = processEspionageTurn(state, bus);

    expect(newState.espionage!['player'].spies[pSpy.id].status).toBe('stationed');
    expect(newState.espionage!['ai-egypt'].spies[aSpy.id].status).toBe('stationed');
  });
});

describe('M4a full integration', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    _resetSpyIdCounter();
  });

  it('complete espionage lifecycle: recruit → assign → travel → station → mission → success', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const events: any[] = [];
    bus.on('espionage:spy-arrived', (d) => events.push({ type: 'arrived', ...d }));
    bus.on('espionage:mission-succeeded', (d) => events.push({ type: 'succeeded', ...d }));
    bus.on('espionage:mission-failed', (d) => events.push({ type: 'failed', ...d }));

    // 1. Recruit
    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'lifecycle-seed');
    state.espionage!['player'] = esp1;

    // 2. Assign
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    expect(state.espionage!['player'].spies[spy.id].status).toBe('traveling');

    // 3. Process turn → spy arrives
    let newState = processEspionageTurn(state, bus);
    expect(newState.espionage!['player'].spies[spy.id].status).toBe('stationed');
    expect(events.some(e => e.type === 'arrived')).toBe(true);

    // 4. Start mission
    newState.espionage!['player'] = startMission(
      newState.espionage!['player'], spy.id, 'scout_area',
    );
    expect(newState.espionage!['player'].spies[spy.id].status).toBe('on_mission');

    // 5. Process turn → mission resolves (scout_area = 1 turn)
    const finalState = processEspionageTurn(newState, bus);
    const finalSpy = finalState.espionage!['player'].spies[spy.id];
    // Mission resolved — spy is either stationed (success) or cooldown/captured (failure)
    expect(['stationed', 'cooldown', 'captured']).toContain(finalSpy.status);
    expect(finalSpy.currentMission).toBeNull();
  });

  it('multi-turn mission completes after correct number of turns', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);

    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'multi-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );

    // Turn 1: traveling → stationed
    let s = processEspionageTurn(state, bus);
    expect(s.espionage!['player'].spies[spy.id].status).toBe('stationed');

    // Start gather_intel (3 turns)
    s.espionage!['player'] = startMission(s.espionage!['player'], spy.id, 'gather_intel');

    // Turn 2: mission progress (2 remaining)
    s.turn = 11;
    s = processEspionageTurn(s, bus);
    expect(s.espionage!['player'].spies[spy.id].currentMission!.turnsRemaining).toBe(2);

    // Turn 3: mission progress (1 remaining)
    s.turn = 12;
    s = processEspionageTurn(s, bus);
    expect(s.espionage!['player'].spies[spy.id].currentMission!.turnsRemaining).toBe(1);

    // Turn 4: mission resolves
    s.turn = 13;
    s = processEspionageTurn(s, bus);
    expect(s.espionage!['player'].spies[spy.id].currentMission).toBeNull();
  });

  it('stationed spy passively reveals fog around target city each turn', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    // Add map tiles around Egypt's city
    for (let q = 3; q <= 7; q++) {
      for (let r = 1; r <= 5; r++) {
        state.map.tiles[`${q},${r}`] = {
          coord: { q, r }, terrain: 'plains', elevation: 'lowland',
          resource: null, improvement: 'none', owner: null,
          improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        } as any;
      }
    }
    // Player has no visibility
    state.civilizations['player'].visibility.tiles = {};

    // Recruit and station spy
    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'passive-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    // Arrive
    let s = processEspionageTurn(state, bus);
    expect(s.espionage!['player'].spies[spy.id].status).toBe('stationed');

    // Next turn: passive reveal should happen
    s.turn = 11;
    s = processEspionageTurn(s, bus);
    // Tiles around city (q:5, r:3) within radius 3 should be visible
    expect(s.civilizations['player'].visibility.tiles['5,3']).toBe('visible');
    expect(s.civilizations['player'].visibility.tiles['4,3']).toBe('visible');
  });

  it('stationed spy passively reports troop movements each turn', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const troopReports: any[] = [];
    bus.on('espionage:mission-succeeded', (d) => {
      if (d.result && (d.result as any).passive) troopReports.push(d);
    });

    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'troop-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    state.espionage!['player'].spies[spy.id].status = 'stationed';

    // Egypt has a unit near the city (already in makeTestGameState)
    processEspionageTurn(state, bus);
    expect(troopReports.length).toBeGreaterThan(0);
    expect((troopReports[0].result as any).nearbyUnits.length).toBeGreaterThan(0);
  });

  it('handles spy in destroyed/captured city gracefully', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);

    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'destroyed-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    state.espionage!['player'].spies[spy.id].status = 'stationed';

    // Remove the target city (simulating capture/destruction)
    delete state.cities['city-egypt-1'];

    // Should recall spy to idle when target city is destroyed
    const recallEvents: any[] = [];
    bus.on('espionage:spy-recalled', (d) => recallEvents.push(d));
    const newState = processEspionageTurn(state, bus);
    expect(newState).toBeDefined();
    const updatedSpy = newState.espionage!['player'].spies[spy.id];
    expect(updatedSpy.status).toBe('idle');
    expect(updatedSpy.targetCivId).toBeNull();
    expect(updatedSpy.targetCityId).toBeNull();
    expect(recallEvents.length).toBeGreaterThan(0);
    expect(recallEvents[0].reason).toBe('city_destroyed');
  });

  it('recalls traveling spy when target city is destroyed mid-transit', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);

    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'transit-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    expect(state.espionage!['player'].spies[spy.id].status).toBe('traveling');

    // Destroy city while spy is traveling
    delete state.cities['city-egypt-1'];

    const newState = processEspionageTurn(state, bus);
    const updatedSpy = newState.espionage!['player'].spies[spy.id];
    expect(updatedSpy.status).toBe('idle');
    expect(updatedSpy.targetCivId).toBeNull();
  });

  it('new civ definitions are selectable and functional', () => {
    const newCivIds = ['france', 'germany', 'gondor', 'rohan'];
    for (const civId of newCivIds) {
      const def = getCivDefinition(civId);
      expect(def).toBeDefined();
      expect(def!.id).toBe(civId);
      expect(def!.bonusEffect).toBeDefined();
      expect(def!.personality.traits.length).toBeGreaterThan(0);
      expect(def!.color).toBeTruthy();
    }
  });

  it('espionage state survives serialization (structuredClone)', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'serial-seed');
    state.espionage!['player'] = esp1;

    const cloned = structuredClone(state);
    expect(cloned.espionage!['player'].spies[spy.id].id).toBe(spy.id);
    expect(cloned.espionage!['player'].spies[spy.id].name).toBe(spy.name);
    expect(cloned.espionage!['player'].spies[spy.id].status).toBe('idle');
  });

  it('espionage works with seeded RNG — same seed produces same outcomes', () => {
    const makeScenario = () => {
      _resetSpyIdCounter();
      const state = makeTestGameState();
      state.espionage = initializeEspionage(state);
      const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'determ-seed');
      state.espionage!['player'] = esp1;
      state.espionage!['player'] = assignSpy(
        state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
      );
      state.espionage!['player'].spies[spy.id].status = 'on_mission';
      state.espionage!['player'].spies[spy.id].currentMission = {
        type: 'scout_area', turnsRemaining: 1, turnsTotal: 1,
        targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1',
      };
      return state;
    };

    const bus1 = new EventBus();
    const bus2 = new EventBus();
    const results1: string[] = [];
    const results2: string[] = [];
    bus1.on('espionage:mission-succeeded', () => results1.push('success'));
    bus1.on('espionage:mission-failed', () => results1.push('failed'));
    bus1.on('espionage:spy-expelled', () => results1.push('expelled'));
    bus1.on('espionage:spy-captured', () => results1.push('captured'));
    bus2.on('espionage:mission-succeeded', () => results2.push('success'));
    bus2.on('espionage:mission-failed', () => results2.push('failed'));
    bus2.on('espionage:spy-expelled', () => results2.push('expelled'));
    bus2.on('espionage:spy-captured', () => results2.push('captured'));

    // Both should produce identical results with identical state
    processEspionageTurn(makeScenario(), bus1);
    processEspionageTurn(makeScenario(), bus2);

    expect(results1).toEqual(results2);
  });
});

describe('game creation espionage initialization', () => {
  it('createNewGame initializes espionage state for all civs', () => {
    const state = createNewGame('egypt', 'test-seed', 'small');
    expect(state.espionage).toBeDefined();
    expect(state.espionage!['player']).toBeDefined();
    expect(state.espionage!['ai-1']).toBeDefined();
    expect(state.espionage!['player'].spies).toBeDefined();
    expect(state.espionage!['player'].maxSpies).toBeGreaterThanOrEqual(1);
  });

  it('createHotSeatGame initializes espionage state for all players', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'hotseat-seed');
    expect(state.espionage).toBeDefined();
    expect(state.espionage!['player-1']).toBeDefined();
    expect(state.espionage!['player-2']).toBeDefined();
  });
});

describe('turn manager espionage integration', () => {
  it('processTurn calls processEspionageTurn and updates spy state', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'tm-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    expect(state.espionage!['player'].spies[spy.id].status).toBe('traveling');

    const bus = new EventBus();
    const newState = processTurn(state, bus);

    // Spy should have transitioned from traveling to stationed
    expect(newState.espionage!['player'].spies[spy.id].status).toBe('stationed');
  });
});
