// tests/ui/espionage-panel.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEspionagePanelData,
  getSpyActions,
} from '@/ui/espionage-panel';
import { createEspionageCivState, recruitSpy, assignSpy, _resetSpyIdCounter } from '@/systems/espionage-system';
import type { GameState } from '@/core/types';

function makeEspUiState(): GameState {
  return {
    turn: 10, era: 2, currentPlayer: 'player', gameOver: false, winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
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
        techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: { relationships: { 'ai-egypt': -10 }, treaties: [], events: [], atWarWith: [] },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: { relationships: { player: -10 }, treaties: [], events: [], atWarWith: [] },
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    espionage: { player: createEspionageCivState(), 'ai-egypt': createEspionageCivState() },
  } as unknown as GameState;
}

describe('espionage-panel', () => {
  beforeEach(() => {
    _resetSpyIdCounter();
  });

  describe('getEspionagePanelData', () => {
    it('returns spy list for current player only', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      const data = getEspionagePanelData(state);
      expect(data.spies).toHaveLength(1);
      expect(data.spies[0].id).toBe(spy.id);
    });

    it('includes canRecruit flag', () => {
      const state = makeEspUiState();
      const data = getEspionagePanelData(state);
      expect(data.canRecruit).toBe(true);
    });

    it('includes maxSpies and current count', () => {
      const state = makeEspUiState();
      const data = getEspionagePanelData(state);
      expect(data.maxSpies).toBe(1);
      expect(data.activeSpyCount).toBe(0);
    });

    it('never exposes other players spy data', () => {
      const state = makeEspUiState();
      const { state: esp } = recruitSpy(state.espionage!['ai-egypt'], 'ai-egypt', 'ai-seed');
      state.espionage!['ai-egypt'] = esp;
      const data = getEspionagePanelData(state);
      // Should only show current player's spies
      expect(data.spies.every(s => s.owner === state.currentPlayer)).toBe(true);
    });
  });

  describe('getSpyActions', () => {
    it('returns assign action for idle spy', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      const actions = getSpyActions(state, spy.id);
      expect(actions).toContain('assign');
      expect(actions).toContain('assign_defensive');
    });

    it('returns mission and recall actions for stationed spy', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = assignSpy(esp, spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
      state.espionage!['player'].spies[spy.id].status = 'stationed';
      const actions = getSpyActions(state, spy.id);
      expect(actions).toContain('start_mission');
      expect(actions).toContain('recall');
    });

    it('returns no actions for captured spy', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      state.espionage!['player'].spies[spy.id].status = 'captured';
      const actions = getSpyActions(state, spy.id);
      expect(actions).toHaveLength(0);
    });
  });
});
