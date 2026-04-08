// tests/systems/espionage-system.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Spy, SpyMission, SpyMissionType, EspionageState,
  EspionageCivState, GameState,
} from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  createEspionageCivState,
  recruitSpy,
  assignSpy,
  assignSpyDefensive,
  recallSpy,
  canRecruitSpy,
  getSpySuccessChance,
  getMissionDuration,
  getAvailableMissions,
  startMission,
  processSpyTurn,
  resolveMissionResult,
  handleSpyExpelled,
  handleSpyCaptured,
  setCounterIntelligence,
  turnCapturedSpy,
  verifyAgent,
  _resetSpyIdCounter,
} from '@/systems/espionage-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';

describe('espionage types', () => {
  it('Spy has required fields', () => {
    const spy: Spy = {
      id: 'spy-1',
      owner: 'player',
      targetCivId: null,
      targetCityId: null,
      position: null,
      status: 'idle',
      experience: 0,
      currentMission: null,
      cooldownTurns: 0,
      name: 'Agent Shadow',
      promotion: undefined,
      promotionAvailable: false,
    };
    expect(spy.id).toBe('spy-1');
    expect(spy.status).toBe('idle');
    expect(spy.experience).toBe(0);
  });

  it('SpyMission has required fields', () => {
    const mission: SpyMission = {
      type: 'gather_intel',
      turnsRemaining: 3,
      turnsTotal: 3,
      targetCivId: 'ai-egypt',
      targetCityId: 'city-1',
    };
    expect(mission.type).toBe('gather_intel');
    expect(mission.turnsRemaining).toBe(3);
  });

  it('EspionageCivState has required fields', () => {
    const espState: EspionageCivState = {
      spies: {},
      maxSpies: 1,
      counterIntelligence: {},
    };
    expect(espState.maxSpies).toBe(1);
    expect(Object.keys(espState.spies)).toHaveLength(0);
  });

  it('all SpyMissionType values are valid', () => {
    const validTypes: SpyMissionType[] = [
      'scout_area',
      'monitor_troops',
      'gather_intel',
      'identify_resources',
      'monitor_diplomacy',
      'cyber_attack',
      'misinformation_campaign',
      'election_interference',
      'satellite_surveillance',
    ];
    expect(validTypes).toHaveLength(9);
    // Type system enforces these — runtime check for completeness
    validTypes.forEach(t => expect(typeof t).toBe('string'));
  });

  it('GameState includes espionage field', () => {
    // Type check — espionage is optional on GameState for backward compat
    const partial: Partial<GameState> = {
      espionage: {
        player: {
          spies: {},
          maxSpies: 1,
          counterIntelligence: {},
        },
      },
    };
    expect(partial.espionage).toBeDefined();
  });
});

describe('espionage tech definitions', () => {
  it('has espionage-scouting tech in espionage track', () => {
    const tech = TECH_TREE.find(t => t.id === 'espionage-scouting');
    expect(tech).toBeDefined();
    expect(tech!.track).toBe('espionage');
    expect(tech!.era).toBeLessThanOrEqual(2);
  });

  it('has espionage-informants tech requiring scouting', () => {
    const tech = TECH_TREE.find(t => t.id === 'espionage-informants');
    expect(tech).toBeDefined();
    expect(tech!.prerequisites).toContain('espionage-scouting');
    expect(tech!.track).toBe('espionage');
  });

  it('espionage-scouting unlocks spy recruitment and stage 1 missions', () => {
    const tech = TECH_TREE.find(t => t.id === 'espionage-scouting');
    expect(tech).toBeDefined();
    expect(tech!.unlocks.some(u => u.match(/recruit|spy/i))).toBe(true);
    expect(tech!.unlocks.some(u => u.match(/scout/i))).toBe(true);
    expect(tech!.unlocks.some(u => u.match(/monitor.*troops/i))).toBe(true);
  });

  it('espionage-informants unlocks stage 2 missions', () => {
    const tech = TECH_TREE.find(t => t.id === 'espionage-informants');
    expect(tech).toBeDefined();
    expect(tech!.unlocks.some(u => u.match(/intel|gather/i))).toBe(true);
    expect(tech!.unlocks.some(u => u.match(/resource/i))).toBe(true);
    expect(tech!.unlocks.some(u => u.match(/diplomacy/i))).toBe(true);
  });

  it('tech tree has no duplicate IDs', () => {
    const ids = TECH_TREE.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all espionage tech prerequisites reference valid tech IDs', () => {
    const allIds = new Set(TECH_TREE.map(t => t.id));
    const espTechs = TECH_TREE.filter(t => t.track === 'espionage');
    for (const tech of espTechs) {
      for (const prereq of tech.prerequisites) {
        expect(allIds.has(prereq), `${tech.id} has invalid prerequisite ${prereq}`).toBe(true);
      }
    }
  });
});

describe('espionage-system', () => {
  beforeEach(() => {
    _resetSpyIdCounter();
  });

  describe('createEspionageCivState', () => {
    it('creates empty state with 1 max spy', () => {
      const state = createEspionageCivState();
      expect(state.spies).toEqual({});
      expect(state.maxSpies).toBe(1);
      expect(state.counterIntelligence).toEqual({});
    });
  });

  describe('recruitSpy', () => {
    it('creates a spy with correct owner and idle status', () => {
      const state = createEspionageCivState();
      const result = recruitSpy(state, 'player', 'spy-seed-1');
      expect(result.spy.owner).toBe('player');
      expect(result.spy.status).toBe('idle');
      expect(result.spy.experience).toBe(0);
      expect(result.spy.targetCivId).toBeNull();
      expect(result.spy.name).toBeTruthy();
      expect(Object.keys(result.state.spies)).toHaveLength(1);
    });

    it('generates deterministic spy names from seed', () => {
      const state = createEspionageCivState();
      _resetSpyIdCounter();
      const r1 = recruitSpy(state, 'player', 'same-seed');
      _resetSpyIdCounter();
      const r2 = recruitSpy(state, 'player', 'same-seed');
      expect(r1.spy.name).toBe(r2.spy.name);
    });

    it('refuses recruitment when at max spies', () => {
      const state = createEspionageCivState();
      const { state: s1 } = recruitSpy(state, 'player', 'seed-1');
      // maxSpies is 1, so second recruit should fail
      expect(canRecruitSpy(s1)).toBe(false);
    });
  });

  describe('assignSpy', () => {
    it('assigns idle spy to a target city', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
      const assigned = s2.spies[spy.id];
      expect(assigned.status).toBe('traveling');
      expect(assigned.targetCivId).toBe('ai-egypt');
      expect(assigned.targetCityId).toBe('city-egypt-1');
      expect(assigned.position).toEqual({ q: 5, r: 3 });
    });

    it('refuses to assign a spy that is on cooldown', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'cooldown';
      s1.spies[spy.id].cooldownTurns = 3;
      expect(() => assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 0, r: 0 }))
        .toThrow('Spy is not available');
    });

    it('refuses to assign a spy that is already on mission', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'on_mission';
      expect(() => assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 0, r: 0 }))
        .toThrow('Spy is not available');
    });
  });

  describe('assignSpyDefensive', () => {
    it('assigns spy to own city for counter-intelligence', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpyDefensive(s1, spy.id, 'city-player-1', { q: 0, r: 0 });
      const assigned = s2.spies[spy.id];
      expect(assigned.status).toBe('stationed');
      expect(assigned.targetCivId).toBeNull();
      expect(assigned.targetCityId).toBe('city-player-1');
      expect(s2.counterIntelligence['city-player-1']).toBeGreaterThan(0);
    });

    it('increases counter-intelligence score based on spy experience', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].experience = 50;
      const s2 = assignSpyDefensive(s1, spy.id, 'city-player-1', { q: 0, r: 0 });
      const ciScore = s2.counterIntelligence['city-player-1'];
      expect(ciScore).toBeGreaterThan(20); // base 20 + experience bonus
    });
  });

  describe('recallSpy', () => {
    it('returns a stationed spy to idle', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed'; // simulate arrival
      const s3 = recallSpy(s2, spy.id);
      expect(s3.spies[spy.id].status).toBe('idle');
      expect(s3.spies[spy.id].targetCivId).toBeNull();
      expect(s3.spies[spy.id].targetCityId).toBeNull();
      expect(s3.spies[spy.id].position).toBeNull();
      expect(s3.spies[spy.id].currentMission).toBeNull();
    });
  });

  describe('canRecruitSpy', () => {
    it('returns true when under max spies', () => {
      const state = createEspionageCivState();
      expect(canRecruitSpy(state)).toBe(true);
    });

    it('does not count captured spies against limit', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'captured';
      expect(canRecruitSpy(s1)).toBe(true);
    });
  });

  describe('getSpySuccessChance', () => {
    it('returns base chance for 0 experience vs 0 counter-intel', () => {
      const chance = getSpySuccessChance(0, 0, 'gather_intel');
      expect(chance).toBeGreaterThan(0.5);
      expect(chance).toBeLessThanOrEqual(1);
    });

    it('higher experience increases success chance', () => {
      const low = getSpySuccessChance(10, 0, 'gather_intel');
      const high = getSpySuccessChance(80, 0, 'gather_intel');
      expect(high).toBeGreaterThan(low);
    });

    it('higher counter-intelligence decreases success chance', () => {
      const easy = getSpySuccessChance(50, 0, 'gather_intel');
      const hard = getSpySuccessChance(50, 80, 'gather_intel');
      expect(hard).toBeLessThan(easy);
    });

    it('scout_area has higher base chance than gather_intel', () => {
      const scout = getSpySuccessChance(0, 0, 'scout_area');
      const intel = getSpySuccessChance(0, 0, 'gather_intel');
      expect(scout).toBeGreaterThan(intel);
    });
  });
});

describe('missions', () => {
  beforeEach(() => {
    _resetSpyIdCounter();
  });

  describe('getAvailableMissions', () => {
    it('returns stage 1 missions when only espionage-scouting tech completed', () => {
      const completedTechs = ['espionage-scouting'];
      const missions = getAvailableMissions(completedTechs);
      expect(missions).toContain('scout_area');
      expect(missions).toContain('monitor_troops');
      expect(missions).not.toContain('gather_intel');
    });

    it('returns stage 1 + 2 missions when espionage-informants tech completed', () => {
      const completedTechs = ['espionage-scouting', 'espionage-informants'];
      const missions = getAvailableMissions(completedTechs);
      expect(missions).toContain('scout_area');
      expect(missions).toContain('gather_intel');
      expect(missions).toContain('identify_resources');
      expect(missions).toContain('monitor_diplomacy');
    });

    it('returns empty array with no espionage tech', () => {
      const missions = getAvailableMissions([]);
      expect(missions).toEqual([]);
    });

    it('unlocks Stage 5 missions from digital-surveillance and cyber-warfare', () => {
      const missions = getAvailableMissions([
        'espionage-scouting',
        'espionage-informants',
        'spy-networks',
        'cryptography',
        'digital-surveillance',
        'cyber-warfare',
      ]);

      expect(missions).toContain('cyber_attack');
      expect(missions).toContain('misinformation_campaign');
      expect(missions).toContain('election_interference');
      expect(missions).toContain('satellite_surveillance');
    });
  });

  describe('startMission', () => {
    it('starts a mission on a stationed spy', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'gather_intel');
      const missionSpy = s3.spies[spy.id];
      expect(missionSpy.status).toBe('on_mission');
      expect(missionSpy.currentMission).not.toBeNull();
      expect(missionSpy.currentMission!.type).toBe('gather_intel');
      expect(missionSpy.currentMission!.turnsRemaining).toBe(3);
      expect(missionSpy.currentMission!.turnsTotal).toBe(3);
    });

    it('refuses mission on idle spy', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      expect(() => startMission(s1, spy.id, 'gather_intel'))
        .toThrow('Spy must be stationed');
    });
  });

  describe('getMissionDuration', () => {
    it('scout_area takes 1 turn', () => {
      expect(getMissionDuration('scout_area')).toBe(1);
    });

    it('identify_resources takes 4 turns', () => {
      expect(getMissionDuration('identify_resources')).toBe(4);
    });
  });

  describe('processSpyTurn', () => {
    it('decrements traveling spy to stationed after 1 turn', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      const { state: s3 } = processSpyTurn(s2, 'turn-seed-1');
      expect(s3.spies[spy.id].status).toBe('stationed');
    });

    it('decrements mission turns remaining', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'gather_intel'); // 3 turns
      const { state: s4 } = processSpyTurn(s3, 'turn-seed-1');
      expect(s4.spies[spy.id].currentMission!.turnsRemaining).toBe(2);
      expect(s4.spies[spy.id].status).toBe('on_mission');
    });

    it('resolves mission when turns reach 0', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'scout_area'); // 1 turn
      const { state: s4, events } = processSpyTurn(s3, 'turn-seed-1');
      // After 1 turn, scout_area should resolve
      expect(s4.spies[spy.id].status).not.toBe('on_mission');
      expect(s4.spies[spy.id].currentMission).toBeNull();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'mission_succeeded' || e.type === 'mission_failed')).toBe(true);
    });

    it('grants experience on successful mission', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'scout_area');
      // Use a seed known to produce success (high base chance for scout_area = 0.90)
      const { state: s4, events } = processSpyTurn(s3, 'success-seed');
      if (events.some(e => e.type === 'mission_succeeded')) {
        expect(s4.spies[spy.id].experience).toBeGreaterThan(0);
      }
    });

    it('decrements cooldown on cooldown spies', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'cooldown';
      s1.spies[spy.id].cooldownTurns = 3;
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].cooldownTurns).toBe(2);
    });

    it('transitions cooldown to idle when cooldown reaches 0', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'cooldown';
      s1.spies[spy.id].cooldownTurns = 1;
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].status).toBe('idle');
      expect(s2.spies[spy.id].cooldownTurns).toBe(0);
    });

    it('does nothing for captured spies', () => {
      const state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'captured';
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].status).toBe('captured');
    });
  });
});

describe('resolveMissionResult', () => {
  function makeTestGameState(): GameState {
    return {
      turn: 10,
      era: 2,
      currentPlayer: 'player',
      gameOver: false,
      winner: null,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      units: {},
      cities: {
        'city-egypt-1': {
          id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
          position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
          buildings: ['granary'], productionQueue: ['warrior'],
          productionProgress: 10, ownedTiles: [{ q: 5, r: 3 }, { q: 5, r: 4 }, { q: 6, r: 3 }],
          grid: [[null]], gridSize: 3,
          unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
        },
      },
      civilizations: {
        'ai-egypt': {
          id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
          isHuman: false, civType: 'egypt',
          cities: ['city-egypt-1'], units: ['unit-1'],
          techState: {
            completed: ['agriculture-farming', 'science-writing'],
            currentResearch: 'military-bronze-working',
            researchProgress: 30,
            trackPriorities: {} as any,
          },
          gold: 150,
          visibility: { tiles: {} },
          score: 100,
          diplomacy: {
            relationships: { player: -10 },
            treaties: [{ type: 'trade_agreement', civA: 'ai-egypt', civB: 'ai-rome', turnsRemaining: 5 }],
            events: [],
            atWarWith: [],
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

  it('gather_intel reveals tech, gold, and treaties', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('gather_intel', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.techProgress).toBeDefined();
    expect(result.techProgress!.completed).toContain('agriculture-farming');
    expect(result.techProgress!.currentResearch).toBe('military-bronze-working');
    expect(result.treasury).toBe(150);
    expect(result.treaties).toHaveLength(1);
  });

  it('identify_resources reveals resources in city territory', () => {
    const gameState = makeTestGameState();
    gameState.map.tiles['5,4'] = {
      coord: { q: 5, r: 4 }, terrain: 'plains', elevation: 'lowland',
      resource: 'iron', improvement: 'none', owner: 'ai-egypt',
      improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    const result = resolveMissionResult('identify_resources', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.resources).toBeDefined();
    expect(result.resources).toContain('iron');
  });

  it('monitor_diplomacy reveals relationships and trade partners', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('monitor_diplomacy', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.relationships).toBeDefined();
    expect(result.relationships!['player']).toBe(-10);
    expect(result.tradePartners).toBeDefined();
    expect(result.tradePartners).toContain('ai-rome');
  });

  it('scout_area returns list of tiles to reveal', () => {
    const gameState = makeTestGameState();
    // Add some tiles near city
    gameState.map.tiles['5,3'] = { coord: { q: 5, r: 3 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-egypt', improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    gameState.map.tiles['5,4'] = { coord: { q: 5, r: 4 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-egypt', improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const result = resolveMissionResult('scout_area', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.tilesToReveal).toBeDefined();
    expect(result.tilesToReveal!.length).toBeGreaterThan(0);
  });

  it('monitor_troops returns units near the city', () => {
    const gameState = makeTestGameState();
    gameState.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'ai-egypt',
      position: { q: 5, r: 3 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const result = resolveMissionResult('monitor_troops', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.nearbyUnits).toBeDefined();
    expect(result.nearbyUnits!.length).toBeGreaterThan(0);
    expect(result.nearbyUnits![0].type).toBe('warrior');
  });

  it('cyber_attack returns a production shutdown timer', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('cyber_attack', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.productionDisabledTurns).toBe(3);
  });

  it('misinformation_campaign returns a bounded research penalty window', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('misinformation_campaign', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.researchPenaltyTurns).toBe(10);
    expect(result.researchPenaltyMultiplier).toBe(0.2);
  });

  it('election_interference uses the approved stability-penalty simplification', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('election_interference', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.stabilityPenaltyTurns).toBe(15);
    expect(result.unrestInjected).toBe(20);
  });

  it('satellite_surveillance grants territory vision instead of mutating target state directly', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('satellite_surveillance', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
    expect(result.grantTerritoryVision).toBe(true);
  });
});

describe('espionage diplomatic consequences', () => {
  describe('handleSpyExpelled', () => {
    it('reduces relationship between spy owner and detecting civ', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const updated = handleSpyExpelled(dipState, 'player', 10);
      expect(updated.relationships['player']).toBeLessThan(0);
    });

    it('adds a diplomatic event for expulsion', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const updated = handleSpyExpelled(dipState, 'player', 10);
      expect(updated.events.length).toBe(1);
      expect(updated.events[0].type).toBe('spy_expelled');
    });
  });

  describe('handleSpyCaptured', () => {
    it('reduces relationship more severely than expulsion', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const expelled = handleSpyExpelled(dipState, 'player', 10);
      const captured = handleSpyCaptured(
        createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt'),
        'player', 10,
      );
      expect(captured.relationships['player']).toBeLessThan(expelled.relationships['player']);
    });

    it('adds a diplomatic event for capture', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const updated = handleSpyCaptured(dipState, 'player', 10);
      expect(updated.events.some(e => e.type === 'spy_captured')).toBe(true);
    });
  });

  describe('counter-intelligence', () => {
    it('setCounterIntelligence updates city CI score', () => {
      let state = createEspionageCivState();
      state = setCounterIntelligence(state, 'city-1', 50);
      expect(state.counterIntelligence['city-1']).toBe(50);
    });

    it('CI score clamps to 0-100', () => {
      let state = createEspionageCivState();
      state = setCounterIntelligence(state, 'city-1', 150);
      expect(state.counterIntelligence['city-1']).toBe(100);
      state = setCounterIntelligence(state, 'city-1', -10);
      expect(state.counterIntelligence['city-1']).toBe(0);
    });
  });

  describe('double agents', () => {
    it('turns a captured spy into a false-intel asset for the captor', () => {
      const espionage = {
        player: createEspionageCivState(),
        'ai-egypt': createEspionageCivState(),
      };
      const { state: playerState, spy } = recruitSpy(espionage.player, 'player', 'seed-1');
      espionage.player = playerState;
      espionage.player.spies[spy.id].status = 'captured';

      const turned = turnCapturedSpy(espionage, 'ai-egypt', 'player', spy.id);

      expect(turned.player.spies[spy.id].turnedBy).toBe('ai-egypt');
      expect(turned.player.spies[spy.id].feedsFalseIntel).toBe(true);
      expect(turned.player.spies[spy.id].status).toBe('stationed');
    });

    it('verifyAgent clears false-intel state from a turned spy', () => {
      const state = createEspionageCivState();
      const { state: updated, spy } = recruitSpy(state, 'player', 'seed-1');
      updated.spies[spy.id].turnedBy = 'ai-egypt';
      updated.spies[spy.id].feedsFalseIntel = true;

      const verified = verifyAgent(updated, spy.id);

      expect(verified.spies[spy.id].turnedBy).toBeUndefined();
      expect(verified.spies[spy.id].feedsFalseIntel).toBe(false);
    });
  });
});
