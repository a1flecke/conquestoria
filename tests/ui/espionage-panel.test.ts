// tests/ui/espionage-panel.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEspionagePanel,
  getEspionagePanelData,
  getEspionagePanelViewModel,
  getSpyActions,
} from '@/ui/espionage-panel';
import { createEspionageCivState } from '@/systems/espionage-system';
import type { EspionageCivState, GameState, Spy } from '@/core/types';

// MR1: legacy fixture helper — spies are now created via city production, not recruitSpy
function makeTestSpy(id: string, owner: string, overrides: Partial<Spy> = {}): Spy {
  return {
    id, owner, name: `Agent ${id}`, unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
    ...overrides,
  };
}

function addSpy(esp: ReturnType<typeof createEspionageCivState>, spy: Spy): ReturnType<typeof createEspionageCivState> {
  return { ...esp, spies: { ...esp.spies, [spy.id]: spy } };
}

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
    espionage: { player: { ...createEspionageCivState(), maxSpies: 1 }, 'ai-egypt': createEspionageCivState() },
  } as unknown as GameState;
}

describe('espionage-panel', () => {
  beforeEach(() => {
    installMockDocument();
  });

  afterEach(() => {
    restoreMockDocument();
  });

  describe('getEspionagePanelData', () => {
    it('returns spy list for current player only', () => {
      const state = makeEspUiState();
      const spy = makeTestSpy('spy-1', 'player');
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);
      const data = getEspionagePanelData(state);
      expect(data.spies).toHaveLength(1);
      expect(data.spies[0].id).toBe(spy.id);
    });

    it('includes maxSpies and current count', () => {
      const state = makeEspUiState();
      const data = getEspionagePanelData(state);
      expect(data.maxSpies).toBe(1);
      expect(data.activeSpyCount).toBe(0);
    });

    it('reflects 8 spy slots after covert-operations', () => {
      const state = makeEspUiState();
      state.espionage!.player.maxSpies = 8;
      const data = getEspionagePanelData(state);
      expect(data.maxSpies).toBe(8);
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
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCityId: 'city-player-1', targetCivId: null,
        experience: 60, promotionAvailable: true,
      });
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);

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

    // #524 MR2a
    it('shows flip_loyalty in the Stage 4 (Shadow Operations) group once propaganda is researched', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['propaganda'];
      const view = getEspionagePanelViewModel(state);
      const stage4 = view.missionStages.find(s => s.stage === 4)!;
      expect(stage4.missions.some(m => m.id === 'flip_loyalty')).toBe(true);
      expect(stage4.missions.find(m => m.id === 'flip_loyalty')!.label).toBe('Flip Loyalty');
    });

    it('does not show flip_loyalty without propaganda', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = [];
      const view = getEspionagePanelViewModel(state);
      const allMissionIds = view.missionStages.flatMap(s => s.missions.map(m => m.id));
      expect(allMissionIds).not.toContain('flip_loyalty');
    });

    // #442 MR1
    it('shows intercept_courier in the Stage 4 group once black-chambers is researched', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['black-chambers'];
      const view = getEspionagePanelViewModel(state);
      const stage4 = view.missionStages.find(s => s.stage === 4)!;
      expect(stage4.missions.some(m => m.id === 'intercept_courier')).toBe(true);
      expect(stage4.missions.find(m => m.id === 'intercept_courier')!.label).toBe('Intercept Courier');
    });

    it('shows bribe_official in the Stage 4 group once diplomatic-networks is researched', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['diplomatic-networks'];
      const view = getEspionagePanelViewModel(state);
      const stage4 = view.missionStages.find(s => s.stage === 4)!;
      expect(stage4.missions.some(m => m.id === 'bribe_official')).toBe(true);
      expect(stage4.missions.find(m => m.id === 'bribe_official')!.label).toBe('Bribe Official');
    });

    // #442 MR1 review: the mission catalog must be self-explanatory (CLAUDE.md "all UI
    // elements must be self-explanatory") — every entry needs a plain-language effect
    // description and its duration, not just a label.
    it('every mission in the catalog has a non-empty description and a positive duration', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cryptography',
        'black-chambers', 'diplomatic-networks', 'propaganda', 'covert-operations',
      ];
      const view = getEspionagePanelViewModel(state);
      const allMissions = view.missionStages.flatMap(s => s.missions);
      expect(allMissions.length).toBeGreaterThan(0);
      for (const mission of allMissions) {
        expect(mission.description.length).toBeGreaterThan(0);
        expect(mission.durationTurns).toBeGreaterThan(0);
      }
    });

    it('intercept_courier and bribe_official describe their actual effect', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['black-chambers', 'diplomatic-networks'];
      const view = getEspionagePanelViewModel(state);
      const allMissions = view.missionStages.flatMap(s => s.missions);
      const courier = allMissions.find(m => m.id === 'intercept_courier')!;
      const bribe = allMissions.find(m => m.id === 'bribe_official')!;
      expect(courier.description.toLowerCase()).toContain('trade route');
      expect(courier.durationTurns).toBe(4);
      expect(bribe.description.toLowerCase()).toContain('treasury');
      expect(bribe.durationTurns).toBe(5);
    });

    // #442 MR2
    it('shows expose_scandal in the Stage 5 group once disinformation-bureau is researched', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['disinformation-bureau'];
      const view = getEspionagePanelViewModel(state);
      const stage5 = view.missionStages.find(s => s.stage === 5)!;
      expect(stage5.missions.some(m => m.id === 'expose_scandal')).toBe(true);
      expect(stage5.missions.find(m => m.id === 'expose_scandal')!.label).toBe('Expose Scandal');
    });

    it('shows signals_intercept in the Stage 5 group once counterintelligence is researched, as remote-capable', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['counterintelligence'];
      const view = getEspionagePanelViewModel(state);
      const stage5 = view.missionStages.find(s => s.stage === 5)!;
      const signalsMission = stage5.missions.find(m => m.id === 'signals_intercept')!;
      expect(signalsMission.label).toBe('Signals Intercept');
      expect(signalsMission.accessLabel).toBe('Remote-capable');
    });

    it('does not show expose_scandal or signals_intercept before their gating techs', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = [];
      const view = getEspionagePanelViewModel(state);
      const allMissionIds = view.missionStages.flatMap(s => s.missions.map(m => m.id));
      expect(allMissionIds).not.toContain('expose_scandal');
      expect(allMissionIds).not.toContain('signals_intercept');
    });

    it('does not show intercept_courier or bribe_official before their gating techs', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = [];
      const view = getEspionagePanelViewModel(state);
      const allMissionIds = view.missionStages.flatMap(s => s.missions.map(m => m.id));
      expect(allMissionIds).not.toContain('intercept_courier');
      expect(allMissionIds).not.toContain('bribe_official');
    });

    // #442 MR1: a same-shape hot-seat check for the two new missions — an in-progress
    // intercept_courier/bribe_official mission belonging to another civ (e.g. an AI, or
    // another human in the same hot-seat game) must not surface in this civ's panel data.
    it('does not expose another civ\'s in-progress intercept_courier or bribe_official mission', () => {
      const state = makeEspUiState();
      const aiSpy = makeTestSpy('spy-ai-2', 'ai-egypt', {
        status: 'on_mission',
        currentMission: { type: 'bribe_official', turnsRemaining: 2, turnsTotal: 5, targetCivId: 'player', targetCityId: 'city-player-1' },
      });
      state.espionage!['ai-egypt'] = addSpy(state.espionage!['ai-egypt'], aiSpy);
      const data = getEspionagePanelData(state);
      expect(data.spySummaries.some(s => s.id === 'spy-ai-2')).toBe(false);
      expect(data.spies.every(s => s.id !== 'spy-ai-2')).toBe(true);
    });

    // #442 MR2 signals_intercept
    it('surfaces the current player\'s own signals_intercept snapshot with a resolved target civ name', () => {
      const state = makeEspUiState();
      state.espionage!.player.signalsIntelligence = {
        'ai-egypt': { turn: 8, units: [{ type: 'warrior', position: { q: 1, r: 1 }, health: 100 }] },
      };
      state.turn = 10;
      const data = getEspionagePanelData(state);
      expect(data.signalsIntelligence).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', turn: 8, unitCount: 1 },
      ]);
    });

    it('does not expose another civ\'s signals_intercept snapshot in the current player\'s panel data', () => {
      const state = makeEspUiState();
      state.espionage!['ai-egypt'] = {
        ...state.espionage!['ai-egypt'],
        signalsIntelligence: { player: { turn: 5, units: [{ type: 'warrior', position: { q: 0, r: 0 }, health: 100 }] } },
      };
      const data = getEspionagePanelData(state);
      expect(data.signalsIntelligence).toEqual([]);
    });

    // Post-#442 audit fix: monitor_troops/gather_intel/identify_resources/
    // monitor_diplomacy get the same persist-and-render treatment as signals_intercept
    // above. Same hot-seat shape: current player's own report surfaces with a resolved
    // name; another civ's report (e.g. an AI, or another human in the same hot-seat
    // game) must never appear in this civ's panel data.
    it('surfaces the current player\'s own monitor_troops report with resolved names', () => {
      const state = makeEspUiState();
      state.espionage!.player.troopObservations = {
        'city-egypt-1': { turn: 7, targetCivId: 'ai-egypt', units: [{ type: 'warrior', position: { q: 5, r: 3 }, health: 80 }] },
      };
      const data = getEspionagePanelData(state);
      expect(data.troopReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', cityId: 'city-egypt-1', cityName: 'Thebes', turn: 7, unitCount: 1 },
      ]);
    });

    it('does not expose another civ\'s monitor_troops report', () => {
      const state = makeEspUiState();
      state.espionage!['ai-egypt'] = {
        ...state.espionage!['ai-egypt'],
        troopObservations: { 'city-player-1': { turn: 5, targetCivId: 'player', units: [{ type: 'warrior', position: { q: 0, r: 0 }, health: 100 }] } },
      };
      const data = getEspionagePanelData(state);
      expect(data.troopReports).toEqual([]);
    });

    it('surfaces the current player\'s own gather_intel report with resolved names', () => {
      const state = makeEspUiState();
      state.espionage!.player.intelReports = {
        'ai-egypt': {
          turn: 6, completedTechCount: 3, currentResearch: 'pottery', researchProgress: 0.5,
          treasury: 200, treaties: [{ type: 'trade_agreement', civA: 'ai-egypt', civB: 'player', turnsRemaining: 5 }],
        },
      };
      const data = getEspionagePanelData(state);
      expect(data.intelReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', turn: 6, completedTechCount: 3, currentResearch: 'pottery', treasury: 200, treatyCount: 1 },
      ]);
    });

    it('does not expose another civ\'s gather_intel report', () => {
      const state = makeEspUiState();
      state.espionage!['ai-egypt'] = {
        ...state.espionage!['ai-egypt'],
        intelReports: { player: { turn: 5, completedTechCount: 1, currentResearch: null, researchProgress: 0, treasury: 10, treaties: [] } },
      };
      const data = getEspionagePanelData(state);
      expect(data.intelReports).toEqual([]);
    });

    it('surfaces the current player\'s own identify_resources report with resolved names', () => {
      const state = makeEspUiState();
      state.espionage!.player.resourceReports = {
        'city-egypt-1': { turn: 4, targetCivId: 'ai-egypt', resources: ['iron', 'horses'] },
      };
      const data = getEspionagePanelData(state);
      expect(data.resourceReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', cityId: 'city-egypt-1', cityName: 'Thebes', turn: 4, resources: ['iron', 'horses'] },
      ]);
    });

    it('does not expose another civ\'s identify_resources report', () => {
      const state = makeEspUiState();
      state.espionage!['ai-egypt'] = {
        ...state.espionage!['ai-egypt'],
        resourceReports: { 'city-player-1': { turn: 5, targetCivId: 'player', resources: ['iron'] } },
      };
      const data = getEspionagePanelData(state);
      expect(data.resourceReports).toEqual([]);
    });

    it('surfaces the current player\'s own monitor_diplomacy report with resolved names', () => {
      const state = makeEspUiState();
      state.espionage!.player.diplomacyReports = {
        'ai-egypt': { turn: 3, relationships: { player: -10 }, tradePartners: [] },
      };
      const data = getEspionagePanelData(state);
      expect(data.diplomacyReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', turn: 3, relationships: [{ civId: 'player', civName: 'Player', value: -10 }], tradePartnerNames: [] },
      ]);
    });

    it('does not expose another civ\'s monitor_diplomacy report', () => {
      const state = makeEspUiState();
      state.espionage!['ai-egypt'] = {
        ...state.espionage!['ai-egypt'],
        diplomacyReports: { player: { turn: 5, relationships: {}, tradePartners: [] } },
      };
      const data = getEspionagePanelData(state);
      expect(data.diplomacyReports).toEqual([]);
    });

    // Freshness (#442 audit fix requirement): a persisted report is a snapshot taken at
    // acquisition time -- it must not silently track the target's live state afterward.
    it('renders the frozen troop-report snapshot, not the target unit\'s current live position/count', () => {
      const state = makeEspUiState();
      state.espionage!.player.troopObservations = {
        'city-egypt-1': { turn: 7, targetCivId: 'ai-egypt', units: [{ type: 'warrior', position: { q: 5, r: 3 }, health: 80 }] },
      };
      // The target civ's unit roster changes after the report was captured -- three more
      // units appear near the city. The stored snapshot must not reflect this.
      state.units = {
        'u1': { id: 'u1', type: 'warrior', owner: 'ai-egypt', position: { q: 5, r: 3 }, health: 80, experience: 0, hasMoved: false, hasActed: false, isResting: false } as any,
        'u2': { id: 'u2', type: 'archer', owner: 'ai-egypt', position: { q: 5, r: 3 }, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as any,
        'u3': { id: 'u3', type: 'archer', owner: 'ai-egypt', position: { q: 5, r: 3 }, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as any,
      };
      const data = getEspionagePanelData(state);
      expect(data.troopReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', cityId: 'city-egypt-1', cityName: 'Thebes', turn: 7, unitCount: 1 },
      ]);
    });

    it('renders the frozen gather_intel snapshot, not the target civ\'s current live treasury/tech', () => {
      const state = makeEspUiState();
      state.espionage!.player.intelReports = {
        'ai-egypt': { turn: 6, completedTechCount: 3, currentResearch: 'pottery', researchProgress: 0.5, treasury: 200, treaties: [] },
      };
      // The target civ's treasury and tech change after the report was captured.
      state.civilizations['ai-egypt'].gold = 9999;
      state.civilizations['ai-egypt'].techState.completed = ['a', 'b', 'c', 'd', 'e', 'f'];
      const data = getEspionagePanelData(state);
      expect(data.intelReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', turn: 6, completedTechCount: 3, currentResearch: 'pottery', treasury: 200, treatyCount: 0 },
      ]);
    });

    it('renders the frozen monitor_diplomacy snapshot, not the target civ\'s current live relationships', () => {
      const state = makeEspUiState();
      state.espionage!.player.diplomacyReports = {
        'ai-egypt': { turn: 3, relationships: { player: -10 }, tradePartners: [] },
      };
      // The relationship changes after the report was captured (e.g. a later mission,
      // treaty, or war). The stored snapshot must not reflect this.
      state.civilizations['ai-egypt'].diplomacy.relationships = { player: 40 };
      const data = getEspionagePanelData(state);
      expect(data.diplomacyReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', turn: 3, relationships: [{ civId: 'player', civName: 'Player', value: -10 }], tradePartnerNames: [] },
      ]);
    });

    it('renders the frozen identify_resources snapshot, not the target city\'s current live tiles', () => {
      const state = makeEspUiState();
      state.espionage!.player.resourceReports = {
        'city-egypt-1': { turn: 4, targetCivId: 'ai-egypt', resources: ['iron'] },
      };
      // A new resource is discovered in the city's territory after the report was
      // captured -- the stored snapshot must not silently pick it up.
      state.map.tiles['9,9'] = {
        coord: { q: 9, r: 9 }, terrain: 'plains', elevation: 'lowland', resource: 'gold',
        improvement: 'none', owner: 'ai-egypt', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
      state.cities['city-egypt-1'].ownedTiles = [{ q: 9, r: 9 }];
      const data = getEspionagePanelData(state);
      expect(data.resourceReports).toEqual([
        { targetCivId: 'ai-egypt', targetCivName: 'Egypt', cityId: 'city-egypt-1', cityName: 'Thebes', turn: 4, resources: ['iron'] },
      ]);
    });

    // Save-compatibility: an old save (or a state object normalized before this MR)
    // predates these fields entirely. Reading it must never throw.
    it('handles a legacy EspionageCivState missing the new report fields without throwing', () => {
      const state = makeEspUiState();
      const { troopObservations, intelReports, resourceReports, diplomacyReports, ...legacyEsp } = state.espionage!.player;
      state.espionage!.player = legacyEsp as EspionageCivState;
      expect(() => getEspionagePanelData(state)).not.toThrow();
      const data = getEspionagePanelData(state);
      expect(data.troopReports).toEqual([]);
      expect(data.intelReports).toEqual([]);
      expect(data.resourceReports).toEqual([]);
      expect(data.diplomacyReports).toEqual([]);
    });

    it('never exposes other players spy data', () => {
      const state = makeEspUiState();
      const aiSpy = makeTestSpy('spy-ai-1', 'ai-egypt');
      state.espionage!['ai-egypt'] = addSpy(state.espionage!['ai-egypt'], aiSpy);
      const data = getEspionagePanelData(state);
      expect(data.spies.every(s => s.owner === state.currentPlayer)).toBe(true);
    });

    describe('MR6: cyber-intelligence production-queue reveal', () => {
      it('reveals the infiltrated city production queue with the tech and a stationed spy', () => {
        const state = makeEspUiState();
        state.civilizations.player.techState.completed = ['espionage-scouting', 'cyber-intelligence'];
        state.cities['city-egypt-1'].productionQueue = ['granary'];
        const spy = makeTestSpy('spy-1', 'player', { status: 'stationed', infiltrationCityId: 'city-egypt-1', targetCivId: 'ai-egypt' });
        state.espionage!['player'] = addSpy(state.espionage!['player'], spy);

        const data = getEspionagePanelData(state);
        expect(data.spySummaries[0].revealedProductionQueue).toEqual(['Granary']);
      });

      it('does not reveal the queue without cyber-intelligence', () => {
        const state = makeEspUiState();
        state.cities['city-egypt-1'].productionQueue = ['granary'];
        const spy = makeTestSpy('spy-1', 'player', { status: 'stationed', infiltrationCityId: 'city-egypt-1', targetCivId: 'ai-egypt' });
        state.espionage!['player'] = addSpy(state.espionage!['player'], spy);

        const data = getEspionagePanelData(state);
        expect(data.spySummaries[0].revealedProductionQueue).toBeUndefined();
      });

      it('does not reveal the queue for a spy that is not stationed/embedded', () => {
        const state = makeEspUiState();
        state.civilizations.player.techState.completed = ['espionage-scouting', 'cyber-intelligence'];
        state.cities['city-egypt-1'].productionQueue = ['granary'];
        const spy = makeTestSpy('spy-1', 'player', { status: 'idle' });
        state.espionage!['player'] = addSpy(state.espionage!['player'], spy);

        const data = getEspionagePanelData(state);
        expect(data.spySummaries[0].revealedProductionQueue).toBeUndefined();
      });
    });
  });

  describe('getSpyActions', () => {
    it('returns assign action for idle spy', () => {
      const state = makeEspUiState();
      const spy = makeTestSpy('spy-1', 'player');
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);
      const actions = getSpyActions(state, spy.id);
      expect(actions).toContain('assign');
      expect(actions).toContain('assign_defensive');
    });

    it('offers remote mission starts from idle spies once cyber-intelligence (Stage 7) is unlocked', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['cyber-intelligence'];
      const spy = makeTestSpy('spy-1', 'player');
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);
      const actions = getSpyActions(state, spy.id);
      expect(actions).toContain('start_mission');
    });

    it('returns mission and recall actions for stationed spy', () => {
      const state = makeEspUiState();
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1', position: { q: 5, r: 3 },
      });
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);
      const actions = getSpyActions(state, spy.id);
      expect(actions).toContain('start_mission');
      expect(actions).toContain('recall');
    });

    it('returns no actions for captured spy', () => {
      const state = makeEspUiState();
      const spy = makeTestSpy('spy-1', 'player', { status: 'captured' });
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);
      const actions = getSpyActions(state, spy.id);
      expect(actions).toHaveLength(0);
    });

    it('offers verify-agent for turned spies', () => {
      const state = makeEspUiState();
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1', position: { q: 5, r: 3 },
        turnedBy: 'ai-egypt', feedsFalseIntel: true,
      });
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);
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

      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCityId: 'city-player-1', targetCivId: null,
        experience: 61, promotionAvailable: true,
      });
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);

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

    it('labels remote-capable missions clearly and does not leak other players data in hot seat', () => {
      const state = makeEspUiState();
      state.currentPlayer = 'player-2';
      state.civilizations['player-2'] = {
        ...state.civilizations.player,
        id: 'player-2',
        name: 'Second Player',
        isHuman: true,
        cities: ['city-player-1'],
      };
      state.civilizations['player-2'].techState.completed = ['cyber-intelligence'];
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

    // #442 MR2 signals_intercept — DOM-level proof the persisted snapshot actually
    // renders (end-to-end-wiring.md), mirroring the threat-board test pair above.
    it('renders a signals intelligence section with the intercepted snapshot', () => {
      const state = makeEspUiState();
      state.espionage!.player.signalsIntelligence = {
        'ai-egypt': { turn: 8, units: [{ type: 'warrior', position: { q: 1, r: 1 }, health: 100 }] },
      };

      const panel = createEspionagePanel(state) as unknown;
      const section = findAll(panel, el => el.dataset?.section === 'signals-intelligence')[0];
      expect(collectText(section)).toContain('Egypt');
      expect(collectText(section)).toContain('1 unit');
      expect(collectText(section)).toContain('turn 8');
    });

    it('shows an empty state and never renders another civ\'s signals intelligence snapshot', () => {
      const state = makeEspUiState();
      state.espionage!['ai-egypt'] = {
        ...state.espionage!['ai-egypt'],
        signalsIntelligence: { player: { turn: 5, units: [{ type: 'warrior', position: { q: 0, r: 0 }, health: 100 }] } },
      };

      const panel = createEspionagePanel(state) as unknown;
      const section = findAll(panel, el => el.dataset?.section === 'signals-intelligence')[0];
      expect(collectText(section)).toContain('No signals intelligence gathered yet.');
      expect(collectText(panel)).not.toContain('turn 5');
    });

    // Post-#442 audit fix — DOM-level proof each persisted report actually renders
    // (end-to-end-wiring.md), mirroring the signals-intelligence test pair above.
    it('renders a troop reports section with the observed snapshot and never another civ\'s', () => {
      const state = makeEspUiState();
      state.espionage!.player.troopObservations = {
        'city-egypt-1': { turn: 7, targetCivId: 'ai-egypt', units: [{ type: 'warrior', position: { q: 5, r: 3 }, health: 80 }] },
      };
      state.espionage!['ai-egypt'] = {
        ...state.espionage!['ai-egypt'],
        troopObservations: { 'city-player-1': { turn: 9, targetCivId: 'player', units: [] } },
      };

      const panel = createEspionagePanel(state) as unknown;
      const section = findAll(panel, el => el.dataset?.section === 'troop-reports')[0];
      expect(collectText(section)).toContain('Thebes');
      expect(collectText(section)).toContain('Egypt');
      expect(collectText(section)).toContain('1 unit');
      expect(collectText(section)).toContain('turn 7');
      expect(collectText(panel)).not.toContain('turn 9');
    });

    it('renders a civ intelligence section with the gathered snapshot', () => {
      const state = makeEspUiState();
      state.espionage!.player.intelReports = {
        'ai-egypt': { turn: 6, completedTechCount: 3, currentResearch: 'pottery', researchProgress: 0.5, treasury: 200, treaties: [] },
      };

      const panel = createEspionagePanel(state) as unknown;
      const section = findAll(panel, el => el.dataset?.section === 'intel-reports')[0];
      expect(collectText(section)).toContain('Egypt');
      expect(collectText(section)).toContain('3 techs completed');
      expect(collectText(section)).toContain('pottery');
      expect(collectText(section)).toContain('200');
      expect(collectText(section)).toContain('turn 6');
    });

    it('renders a resource intelligence section with the identified resources', () => {
      const state = makeEspUiState();
      state.espionage!.player.resourceReports = {
        'city-egypt-1': { turn: 4, targetCivId: 'ai-egypt', resources: ['iron', 'horses'] },
      };

      const panel = createEspionagePanel(state) as unknown;
      const section = findAll(panel, el => el.dataset?.section === 'resource-reports')[0];
      expect(collectText(section)).toContain('Thebes');
      expect(collectText(section)).toContain('iron');
      expect(collectText(section)).toContain('horses');
      expect(collectText(section)).toContain('turn 4');
    });

    it('renders a diplomatic intelligence section with relationships and trade partners', () => {
      const state = makeEspUiState();
      state.espionage!.player.diplomacyReports = {
        'ai-egypt': { turn: 3, relationships: { player: -10 }, tradePartners: [] },
      };

      const panel = createEspionagePanel(state) as unknown;
      const section = findAll(panel, el => el.dataset?.section === 'diplomacy-reports')[0];
      expect(collectText(section)).toContain('Egypt');
      expect(collectText(section)).toContain('Player -10');
      expect(collectText(section)).toContain('turn 3');
    });

    it('renders empty-state text for all four new intelligence report sections by default', () => {
      const state = makeEspUiState();
      const panel = createEspionagePanel(state) as unknown;
      expect(collectText(findAll(panel, el => el.dataset?.section === 'troop-reports')[0])).toContain('No troop reports gathered yet.');
      expect(collectText(findAll(panel, el => el.dataset?.section === 'intel-reports')[0])).toContain('No civ intelligence gathered yet.');
      expect(collectText(findAll(panel, el => el.dataset?.section === 'resource-reports')[0])).toContain('No resource intelligence gathered yet.');
      expect(collectText(findAll(panel, el => el.dataset?.section === 'diplomacy-reports')[0])).toContain('No diplomatic intelligence gathered yet.');
    });

    // UX review finding: 5 independent top-level intel sections (signals + 4 new ones)
    // would mean 12 stacked sections on an already-long panel, most showing an empty
    // placeholder in the common early-game case. Locks in that all five nest under one
    // "Intelligence Reports" parent instead of appearing as siblings of it.
    it('nests all five intelligence-snapshot sections under one Intelligence Reports group', () => {
      const state = makeEspUiState();
      const panel = createEspionagePanel(state) as unknown;
      const group = findAll(panel, el => el.dataset?.section === 'intelligence-reports')[0];
      expect(group).toBeDefined();
      expect(collectText(group)).toContain('Intelligence Reports');
      for (const child of ['signals-intelligence', 'troop-reports', 'intel-reports', 'resource-reports', 'diplomacy-reports']) {
        expect(findAll(group, el => el.dataset?.section === child)).toHaveLength(1);
      }
      // These five must NOT also appear as direct top-level siblings of the group.
      const topLevelSections = (panel as { children: Array<{ dataset?: Record<string, string> }> }).children
        .map(child => child.dataset?.section)
        .filter(Boolean);
      expect(topLevelSections).not.toContain('signals-intelligence');
      expect(topLevelSections).not.toContain('troop-reports');
    });

    it('renders a close button for the panel shell', () => {
      const state = makeEspUiState();
      const panel = createEspionagePanel(state) as unknown;
      const close = findAll(panel, el => el.dataset?.action === 'close-panel')[0];
      expect(close).toBeDefined();
      expect(collectText(close)).toContain('Close');
    });

    it('renders a success % chip next to each mission when a spy is stationed inside a city', () => {
      const state = makeEspUiState();
      state.civilizations.player.techState.completed = ['espionage-scouting', 'espionage-informants'];
      const spy = makeTestSpy('spy-inf', 'player', {
        status: 'stationed', infiltrationCityId: 'city-egypt-1', targetCivId: 'ai-egypt',
        targetCityId: null, experience: 30,
      });
      state.espionage!['player'] = addSpy(state.espionage!['player'], spy);
      const data = getEspionagePanelData(state);
      expect(data.missionSuccessChances).toBeDefined();
      const panel = createEspionagePanel(state) as unknown;
      const missionItems = findAll(panel, el => el.dataset?.missionId !== undefined);
      expect(missionItems.length).toBeGreaterThan(0);
      // Each mission item should contain a % text in at least one child
      let foundPct = false;
      for (const item of missionItems) {
        const text = collectText(item);
        if (/\d+%/.test(text)) { foundPct = true; break; }
      }
      expect(foundPct).toBe(true);
    });
  });
});
