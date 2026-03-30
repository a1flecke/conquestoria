// tests/ai/ai-espionage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldAiRecruitSpy,
  chooseAiSpyTarget,
  chooseAiMission,
} from '@/ai/basic-ai';
import type { GameState } from '@/core/types';
import { createEspionageCivState, recruitSpy, _resetSpyIdCounter } from '@/systems/espionage-system';

function makeAiTestState(): GameState {
  return {
    turn: 15,
    era: 2,
    currentPlayer: 'ai-egypt',
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player',
        position: { q: 0, r: 0 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
      },
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: ['city-player-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: { relationships: { 'ai-egypt': -10 }, treaties: [], events: [], atWarWith: [] },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: {
          completed: ['espionage-scouting', 'espionage-informants'],
          currentResearch: null, researchProgress: 0, trackPriorities: {} as any,
        },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: { relationships: { player: -40 }, treaties: [], events: [], atWarWith: [] },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    gameOver: false,
    winner: null,
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    espionage: {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    },
  } as unknown as GameState;
}

describe('AI espionage decisions', () => {
  beforeEach(() => {
    _resetSpyIdCounter();
  });

  describe('shouldAiRecruitSpy', () => {
    it('returns true when AI has espionage tech and no spies', () => {
      const state = makeAiTestState();
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(true);
    });

    it('returns false when AI has no espionage tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = [];
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(false);
    });

    it('returns false when at max spies', () => {
      const state = makeAiTestState();
      const { state: espState } = recruitSpy(state.espionage!['ai-egypt'], 'ai-egypt', 'seed-1');
      state.espionage!['ai-egypt'] = espState;
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(false);
    });
  });

  describe('chooseAiSpyTarget', () => {
    it('targets the civ with lowest relationship', () => {
      const state = makeAiTestState();
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target).toBeDefined();
      expect(target!.civId).toBe('player');
    });

    it('returns null if no valid targets', () => {
      const state = makeAiTestState();
      delete state.civilizations['player'];
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target).toBeNull();
    });

    it('prefers civs at war over civs with low relationship', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].diplomacy.atWarWith = ['player'];
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target!.civId).toBe('player');
    });
  });

  describe('chooseAiMission', () => {
    it('chooses stage 1 mission with only scouting tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(['scout_area', 'monitor_troops']).toContain(mission);
    });

    it('prefers gather_intel with stage 2 tech', () => {
      const state = makeAiTestState();
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('gather_intel');
    });

    it('returns null with no espionage tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = [];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBeNull();
    });
  });
});
