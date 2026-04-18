// tests/ui/espionage-panel.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEspionagePanel,
  getEspionagePanelData,
  getEspionagePanelViewModel,
  getSpyActions,
} from '@/ui/espionage-panel';
import { createEspionageCivState, recruitSpy, assignSpy, _resetSpyIdCounter } from '@/systems/espionage-system';
import type { GameState } from '@/core/types';

class MockElement {
  tagName: string;
  children: MockElement[] = [];
  style = { cssText: '' };
  dataset: Record<string, string> = {};
  id = '';
  textContent = '';
  listeners: Record<string, Array<() => void>> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, listener: () => void): void {
    this.listeners[event] ??= [];
    this.listeners[event].push(listener);
  }

  click(): void {
    for (const listener of this.listeners.click ?? []) {
      listener();
    }
  }
}

class MockDocument {
  createElement(tag: string): MockElement {
    return new MockElement(tag);
  }
}

function installMockDocument(): void {
  (globalThis as typeof globalThis & { document?: Document }).document = new MockDocument() as unknown as Document;
}

function restoreMockDocument(): void {
  (globalThis as any).document = undefined;
}

function collectText(node: unknown): string {
  const current = node as { textContent?: string; children?: unknown[] };
  const childText = (current.children ?? []).map(collectText);
  return [current.textContent, ...childText].filter(Boolean).join(' ');
}

function findAll(
  node: unknown,
  predicate: (el: { dataset?: Record<string, string> }) => boolean,
  results: unknown[] = [],
): unknown[] {
  const current = node as { dataset?: Record<string, string>; children?: unknown[] };
  if (predicate(current)) results.push(current);
  for (const child of current.children ?? []) {
    findAll(child, predicate, results);
  }
  return results;
}

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
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player',
        position: { q: 0, r: 0 }, population: 5, food: 0, foodNeeded: 20,
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
        techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: {
          relationships: { 'ai-egypt': -10 }, treaties: [], events: [], atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: {
          relationships: { player: -10 }, treaties: [], events: [], atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    espionage: { player: createEspionageCivState(), 'ai-egypt': createEspionageCivState() },
  } as unknown as GameState;
}

describe('espionage-panel', () => {
  beforeEach(() => {
    _resetSpyIdCounter();
    installMockDocument();
  });

  afterEach(() => {
    restoreMockDocument();
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

    it('surfaces stage metadata for available missions', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = [
        'espionage-scouting',
        'espionage-informants',
        'spy-networks',
        'cryptography',
      ];
      const data = getEspionagePanelData(state);
      expect(data.missionCatalog.some(m => m.id === 'steal_tech' && m.stage === 3)).toBe(true);
      expect(data.missionCatalog.some(m => m.id === 'assassinate_advisor' && m.stage === 4)).toBe(true);
    });

    it('marks promotion-ready spies and defensive coverage', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      state.espionage!['player'].spies[spy.id].status = 'stationed';
      state.espionage!['player'].spies[spy.id].targetCityId = 'city-player-1';
      state.espionage!['player'].spies[spy.id].targetCivId = null;
      state.espionage!['player'].spies[spy.id].experience = 60;
      state.espionage!['player'].spies[spy.id].promotionAvailable = true;

      const data = getEspionagePanelData(state);
      expect(data.defendingCityIds).toContain('city-player-1');
      expect(data.spySummaries[0].promotionReady).toBe(true);
    });

    it('reports currently disabled advisors', () => {
      const state = makeEspUiState();
      state.civilizations.player.advisorDisabledUntil = { chancellor: 15, spymaster: 9 };
      const data = getEspionagePanelData(state);
      expect(data.disabledAdvisors).toContain('chancellor');
      expect(data.disabledAdvisors).not.toContain('spymaster');
    });

    it('includes a threat board only for detected foreign spy activity in the current players cities', () => {
      const state = makeEspUiState();
      state.currentPlayer = 'player';
      state.civilizations.player.techState.completed = ['digital-surveillance', 'cyber-warfare'];
      state.espionage!['player'].detectedThreats = {
        'enemy-spy': {
          cityId: 'city-player-1',
          foreignCivId: 'ai-egypt',
          detectedTurn: 10,
          expiresOnTurn: 15,
        },
      };

      const data = getEspionagePanelViewModel(state);
      expect((data as any).threatBoard).toEqual([
        { cityId: 'city-player-1', foreignCivId: 'ai-egypt', confidence: 'detected' },
      ]);
    });

    it('creates a view model with grouped missions', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = [
        'espionage-scouting',
        'espionage-informants',
        'spy-networks',
        'cryptography',
      ];
      const view = getEspionagePanelViewModel(state);
      expect(view.missionStages).toHaveLength(5);
      expect(view.missionStages[2].missions.some(m => m.id === 'steal_tech')).toBe(true);
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

    it('offers remote mission starts from idle spies once Stage 5 is unlocked', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['digital-surveillance', 'cyber-warfare'];
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;

      const actions = getSpyActions(state, spy.id);

      expect(actions).toContain('start_mission');
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

    it('offers verify-agent for turned spies', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = assignSpy(esp, spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
      state.espionage!['player'].spies[spy.id].status = 'stationed';
      state.espionage!['player'].spies[spy.id].turnedBy = 'ai-egypt';
      state.espionage!['player'].spies[spy.id].feedsFalseIntel = true;

      const actions = getSpyActions(state, spy.id);

      expect(actions).toContain('verify_agent');
    });
  });

  describe('createEspionagePanel', () => {
    it('renders stage-grouped missions, spy summaries, and coverage sections', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = [
        'espionage-scouting',
        'espionage-informants',
        'spy-networks',
        'cryptography',
      ];
      state.civilizations.player.advisorDisabledUntil = { chancellor: 12 };

      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      state.espionage!['player'].spies[spy.id].status = 'stationed';
      state.espionage!['player'].spies[spy.id].targetCityId = 'city-player-1';
      state.espionage!['player'].spies[spy.id].targetCivId = null;
      state.espionage!['player'].spies[spy.id].experience = 61;
      state.espionage!['player'].spies[spy.id].promotionAvailable = true;

      const panel = createEspionagePanel(state) as unknown;
      expect((panel as { id?: string }).id).toBe('espionage-panel');

      const stages = findAll(panel, el => el.dataset?.stage !== undefined);
      expect(stages.map(stage => (stage as { dataset: Record<string, string> }).dataset.stage)).toEqual(['1', '2', '3', '4', '5']);
      expect(collectText(stages[2])).toContain('Steal Tech');
      expect(collectText(stages[3])).toContain('Assassinate Advisor');

      const spyCards = findAll(panel, el => el.dataset?.spyId !== undefined);
      expect(spyCards).toHaveLength(1);
      expect(collectText(spyCards[0])).toContain('promotion ready');

      const defense = findAll(panel, el => el.dataset?.section === 'defense')[0];
      expect(collectText(defense)).toContain('city-player-1');

      const disabled = findAll(panel, el => el.dataset?.section === 'disabled-advisors')[0];
      expect(collectText(disabled)).toContain('chancellor');
    });

    it('labels Stage 5 remote-capable missions clearly and does not leak other players data in hot seat', () => {
      const state = makeEspUiState();
      state.currentPlayer = 'player-2';
      state.civilizations['player-2'] = {
        ...state.civilizations.player,
        id: 'player-2',
        name: 'Second Player',
        isHuman: true,
        cities: ['city-player-1'],
      };
      state.civilizations['player-2'].techState.completed = ['digital-surveillance', 'cyber-warfare'];
      state.espionage!['player-2'] = createEspionageCivState();

      const panel = createEspionagePanel(state) as unknown;
      const rendered = collectText(panel);

      expect(rendered).toContain('Remote-capable');
      expect(rendered).toContain('Digital Warfare');
      expect(rendered).not.toContain('Target: player / city-player-1');
    });

    it('renders a threat board section for detected foreign spy activity', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['digital-surveillance', 'cyber-warfare'];
      state.espionage!['player'].detectedThreats = {
        'enemy-spy': {
          cityId: 'city-player-1',
          foreignCivId: 'ai-egypt',
          detectedTurn: 10,
          expiresOnTurn: 15,
        },
      };

      const panel = createEspionagePanel(state) as unknown;
      const threat = findAll(panel, el => el.dataset?.section === 'threat-board')[0];
      expect(collectText(threat)).toContain('Threat Board');
      expect(collectText(threat)).toContain('ai-egypt');
      expect(collectText(threat)).toContain('city-player-1');
    });

    it('does not render a threat board entry from raw foreign spy state without detection intel', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['digital-surveillance', 'cyber-warfare'];
      state.espionage!['ai-egypt'].spies['enemy-spy'] = {
        id: 'enemy-spy',
        owner: 'ai-egypt',
        name: 'Agent Raven',
        targetCivId: 'player',
        targetCityId: 'city-player-1',
        position: { q: 0, r: 0 },
        status: 'stationed',
        experience: 40,
        currentMission: null,
        cooldownTurns: 0,
        feedsFalseIntel: false,
        promotionAvailable: false,
      } as any;

      const panel = createEspionagePanel(state) as unknown;
      const threat = findAll(panel, el => el.dataset?.section === 'threat-board')[0];
      expect(collectText(threat)).toContain('No foreign spy activity detected.');
    });

    it('renders a close button for the panel shell', () => {
      const state = makeEspUiState();
      const panel = createEspionagePanel(state) as unknown;
      const close = findAll(panel, el => el.dataset?.action === 'close-panel')[0];
      expect(close).toBeDefined();
      expect(collectText(close)).toContain('Close');
    });
  });
});
