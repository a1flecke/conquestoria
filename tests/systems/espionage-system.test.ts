// tests/systems/espionage-system.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type {
  Spy, SpyMission, SpyMissionType, EspionageState,
  EspionageCivState, GameState,
} from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  applyBuildingCI,
  createEspionageCivState,
  createSpyFromUnit,
  embedSpy,
  recallSpy,
  getSpySuccessChance,
  getEspionageModifierBreakdown,
  getMissionDuration,
  getAvailableMissions,
  startMission,
  processSpyTurn,
  processEspionageTurn,
  resolveMissionResult,
  handleSpyExpelled,
  handleSpyCaptured,
  setCounterIntelligence,
  turnCapturedSpy,
  verifyAgent,
  } from '@/systems/espionage-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';

// MR1: legacy fixture helper for tests that need a spy in state without going through city production
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

function addSpy(esp: EspionageCivState, spy: Spy): EspionageCivState {
  return { ...esp, spies: { ...esp.spies, [spy.id]: spy } };
}

describe('espionage types', () => {
  it('Spy has required fields', () => {
    const spy: Spy = {
      id: 'spy-1',
      owner: 'player',
      unitType: 'spy_scout',
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

describe('maxSpies progression via per-turn update', () => {
  const progression: Array<[string, number]> = [
    ['espionage-scouting', 1],
    ['espionage-informants', 2],
    ['spy-networks', 3],
    ['cryptography', 4],
    ['counter-intelligence', 5],
    ['black-chambers', 6],
    ['covert-operations', 8],
    ['political-intelligence', 11],
  ];

  it('maxSpies climbs 1→2→3→4→5→6→8→11 as techs complete', () => {
    let state = createNewGame(undefined, 'max-spies-progression', 'small');
    const bus = new EventBus();
    const completed: string[] = [];
    for (const [techId, expectedMax] of progression) {
      completed.push(techId);
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: {
            ...state.civilizations.player,
            techState: { ...state.civilizations.player.techState, completed: [...completed] },
          },
        },
      };
      state = processEspionageTurn(state, bus);
      expect(state.espionage!.player.maxSpies).toBe(expectedMax);
    }
  });
});

describe('espionage-system', () => {
  beforeEach(() => {
  });

  describe('createEspionageCivState', () => {
    it('creates empty state with 0 max spies (grows when espionage techs are researched)', () => {
      const state = createEspionageCivState();
      expect(state.spies).toEqual({});
      expect(state.maxSpies).toBe(0);
      expect(state.counterIntelligence).toEqual({});
    });
  });

  describe('embedSpy', () => {
    it('embeds spy in own city for counter-intelligence', () => {
      const spy = makeTestSpy('spy-1', 'player');
      const s1 = addSpy(createEspionageCivState(), spy);
      const s2 = embedSpy(s1, spy.id, 'city-player-1', { q: 0, r: 0 });
      const assigned = s2.spies[spy.id];
      expect(assigned.status).toBe('embedded');
      expect(assigned.targetCivId).toBeNull();
      expect(assigned.targetCityId).toBe('city-player-1');
      expect(s2.counterIntelligence['city-player-1']).toBeGreaterThan(0);
    });

    it('increases counter-intelligence score based on spy experience', () => {
      const spy = makeTestSpy('spy-1', 'player', { experience: 50 });
      const s1 = addSpy(createEspionageCivState(), spy);
      const s2 = embedSpy(s1, spy.id, 'city-player-1', { q: 0, r: 0 });
      const ciScore = s2.counterIntelligence['city-player-1'];
      expect(ciScore).toBeGreaterThan(15); // base 15 + experience bonus
    });
  });

  describe('recallSpy', () => {
    it('returns a stationed spy to idle', () => {
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-1', position: { q: 5, r: 3 },
      });
      const s2 = addSpy(createEspionageCivState(), spy);
      const s3 = recallSpy(s2, spy.id);
      expect(s3.spies[spy.id].status).toBe('idle');
      expect(s3.spies[spy.id].targetCivId).toBeNull();
      expect(s3.spies[spy.id].targetCityId).toBeNull();
      expect(s3.spies[spy.id].position).toBeNull();
      expect(s3.spies[spy.id].currentMission).toBeNull();
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

    it('applies a modifierDelta and clamps the final chance to [0.05, 0.95]', () => {
      const boosted = getSpySuccessChance(0, 0, 'assassinate_advisor', undefined, 0.9);
      expect(boosted).toBe(0.95);
      const crushed = getSpySuccessChance(0, 0, 'assassinate_advisor', undefined, -0.9);
      expect(crushed).toBe(0.05);
    });
  });

  describe('getEspionageModifierBreakdown', () => {
    function makeModifierFixture() {
      let state = createNewGame(undefined, 'espionage-modifier-fixture', 'small');
      const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      const targetStartPos = state.units[state.civilizations[targetCivId].units[0]].position;
      const targetCity = foundCity(targetCivId, targetStartPos, state.map, state.idCounters);
      state = {
        ...state,
        cities: { ...state.cities, [targetCity.id]: targetCity },
        civilizations: {
          ...state.civilizations,
          [targetCivId]: {
            ...state.civilizations[targetCivId],
            cities: [...state.civilizations[targetCivId].cities, targetCity.id],
          },
        },
      };
      return { state, targetCivId, targetCityId: targetCity.id };
    }

    it('offense: acting civ with diplomatic-networks gets +20% only against the target capital', () => {
      const { state, targetCivId, targetCityId } = makeModifierFixture();
      const withTech = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: {
            ...state.civilizations.player,
            techState: { ...state.civilizations.player.techState, completed: ['diplomatic-networks'] },
          },
        },
      };
      const atCapital = getEspionageModifierBreakdown(withTech, 'player', targetCivId, targetCityId);
      expect(atCapital.missionSuccessDelta).toBeCloseTo(0.20);

      const nonCapitalCity = { ...state.cities[targetCityId], id: 'non-capital-city' };
      const withExtraCity: GameState = {
        ...withTech,
        cities: { ...withTech.cities, 'non-capital-city': nonCapitalCity },
      };
      const elsewhere = getEspionageModifierBreakdown(withExtraCity, 'player', targetCivId, 'non-capital-city');
      expect(elsewhere.missionSuccessDelta).toBe(0);
    });

    it('defense: target civ with counter-espionage reduces the acting civ\'s success chance', () => {
      const { state, targetCivId, targetCityId } = makeModifierFixture();
      const withDefense = {
        ...state,
        civilizations: {
          ...state.civilizations,
          [targetCivId]: {
            ...state.civilizations[targetCivId],
            techState: { ...state.civilizations[targetCivId].techState, completed: ['counter-espionage'] },
          },
        },
      };
      const breakdown = getEspionageModifierBreakdown(withDefense, 'player', targetCivId, targetCityId);
      expect(breakdown.missionSuccessDelta).toBeCloseTo(-0.25);
    });

    it('a tech only affects its own side: acting civ having counter-espionage does not help its own offense', () => {
      const { state, targetCivId, targetCityId } = makeModifierFixture();
      const actingHasDefenseTech = {
        ...state,
        civilizations: {
          ...state.civilizations,
          player: {
            ...state.civilizations.player,
            techState: { ...state.civilizations.player.techState, completed: ['counter-espionage'] },
          },
        },
      };
      const breakdown = getEspionageModifierBreakdown(actingHasDefenseTech, 'player', targetCivId, targetCityId);
      expect(breakdown.missionSuccessDelta).toBe(0);
    });

    it('secret-police on the target contributes both a defense and a detection delta', () => {
      const { state, targetCivId, targetCityId } = makeModifierFixture();
      const withSecretPolice = {
        ...state,
        civilizations: {
          ...state.civilizations,
          [targetCivId]: {
            ...state.civilizations[targetCivId],
            techState: { ...state.civilizations[targetCivId].techState, completed: ['secret-police'] },
          },
        },
      };
      const breakdown = getEspionageModifierBreakdown(withSecretPolice, 'player', targetCivId, targetCityId);
      expect(breakdown.missionSuccessDelta).toBeCloseTo(-0.30);
      expect(breakdown.detectionDelta).toBeCloseTo(0.10);
    });

    it('cyber_defense_center building on the target city applies a defense delta', () => {
      const { state, targetCivId, targetCityId } = makeModifierFixture();
      const withCdc = {
        ...state,
        cities: {
          ...state.cities,
          [targetCityId]: {
            ...state.cities[targetCityId],
            buildings: [...state.cities[targetCityId].buildings, 'cyber_defense_center'],
          },
        },
      };
      const breakdown = getEspionageModifierBreakdown(withCdc, 'player', targetCivId, targetCityId);
      expect(breakdown.missionSuccessDelta).toBeCloseTo(-0.15);
    });
  });
});

describe('missions', () => {
  beforeEach(() => {
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

    it('digital-surveillance alone does not unlock any former Stage-5 missions', () => {
      const missions = getAvailableMissions(['digital-surveillance']);
      expect(missions).not.toContain('cyber_attack');
      expect(missions).not.toContain('misinformation_campaign');
      expect(missions).not.toContain('election_interference');
      expect(missions).not.toContain('satellite_surveillance');
    });

    it('cold-war-networks unlocks misinformation and election_interference only', () => {
      const missions = getAvailableMissions(['cold-war-networks']);
      expect(missions).toContain('misinformation_campaign');
      expect(missions).toContain('election_interference');
      expect(missions).not.toContain('satellite_surveillance');
      expect(missions).not.toContain('cyber_attack');
    });

    it('satellite-surveillance tech unlocks satellite_surveillance mission only', () => {
      const missions = getAvailableMissions(['satellite-surveillance']);
      expect(missions).toContain('satellite_surveillance');
      expect(missions).not.toContain('cyber_attack');
      expect(missions).not.toContain('misinformation_campaign');
    });

    it('cyber-intelligence unlocks cyber_attack only', () => {
      const missions = getAvailableMissions(['cyber-intelligence']);
      expect(missions).toContain('cyber_attack');
      expect(missions).not.toContain('misinformation_campaign');
      expect(missions).not.toContain('satellite_surveillance');
    });

    it('full era-10+ tech ladder unlocks all missions', () => {
      const missions = getAvailableMissions([
        'espionage-scouting', 'espionage-informants', 'spy-networks',
        'cryptography', 'cold-war-networks', 'satellite-surveillance', 'cyber-intelligence',
      ]);
      expect(missions).toContain('cyber_attack');
      expect(missions).toContain('misinformation_campaign');
      expect(missions).toContain('election_interference');
      expect(missions).toContain('satellite_surveillance');
    });
  });

  describe('startMission', () => {
    it('starts a mission on a stationed spy', () => {
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-1', position: { q: 5, r: 3 },
      });
      const s2 = addSpy(createEspionageCivState(), spy);
      const s3 = startMission(s2, spy.id, 'gather_intel');
      const missionSpy = s3.spies[spy.id];
      expect(missionSpy.status).toBe('on_mission');
      expect(missionSpy.currentMission).not.toBeNull();
      expect(missionSpy.currentMission!.type).toBe('gather_intel');
      expect(missionSpy.currentMission!.turnsRemaining).toBe(3);
      expect(missionSpy.currentMission!.turnsTotal).toBe(3);
    });

    it('refuses mission on idle spy', () => {
      const spy = makeTestSpy('spy-1', 'player');
      const s1 = addSpy(createEspionageCivState(), spy);
      expect(() => startMission(s1, spy.id, 'gather_intel'))
        .toThrow('Spy must be stationed');
    });

    it('allows remote cyber missions (cyber_attack) from an idle spy when a target is supplied', () => {
      const spy = makeTestSpy('spy-1', 'player');
      const s1 = addSpy(createEspionageCivState(), spy);

      const s2 = startMission(s1, spy.id, 'cyber_attack', undefined, 'ai-egypt', 'city-egypt-1');

      expect(s2.spies[spy.id].status).toBe('on_mission');
      expect(s2.spies[spy.id].currentMission?.type).toBe('cyber_attack');
      expect(s2.spies[spy.id].currentMission?.targetCivId).toBe('ai-egypt');
      expect(s2.spies[spy.id].currentMission?.targetCityId).toBe('city-egypt-1');
    });

    it('requires a target when starting a remote mission from an idle spy', () => {
      const spy = makeTestSpy('spy-1', 'player');
      const s1 = addSpy(createEspionageCivState(), spy);
      expect(() => startMission(s1, spy.id, 'cyber_attack'))
        .toThrow('Spy must have a valid target to start a mission');
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
    it('decrements mission turns remaining', () => {
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-1', position: { q: 5, r: 3 },
      });
      const s2 = addSpy(createEspionageCivState(), spy);
      const s3 = startMission(s2, spy.id, 'gather_intel'); // 3 turns
      const { state: s4 } = processSpyTurn(s3, 'turn-seed-1');
      expect(s4.spies[spy.id].currentMission!.turnsRemaining).toBe(2);
      expect(s4.spies[spy.id].status).toBe('on_mission');
    });

    it('resolves mission when turns reach 0', () => {
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-1', position: { q: 5, r: 3 },
      });
      const s2 = addSpy(createEspionageCivState(), spy);
      const s3 = startMission(s2, spy.id, 'scout_area'); // 1 turn
      const { state: s4, events } = processSpyTurn(s3, 'turn-seed-1');
      expect(s4.spies[spy.id].status).not.toBe('on_mission');
      expect(s4.spies[spy.id].currentMission).toBeNull();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'mission_succeeded' || e.type === 'mission_failed')).toBe(true);
    });

    it('grants experience on successful mission', () => {
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'stationed', targetCivId: 'ai-egypt', targetCityId: 'city-1', position: { q: 5, r: 3 },
      });
      const s2 = addSpy(createEspionageCivState(), spy);
      const s3 = startMission(s2, spy.id, 'scout_area');
      const { state: s4, events } = processSpyTurn(s3, 'success-seed');
      if (events.some(e => e.type === 'mission_succeeded')) {
        expect(s4.spies[spy.id].experience).toBeGreaterThan(0);
      }
    });

    it('decrements cooldown on cooldown spies', () => {
      const spy = makeTestSpy('spy-1', 'player', { status: 'cooldown', cooldownTurns: 3 });
      const s1 = addSpy(createEspionageCivState(), spy);
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].cooldownTurns).toBe(2);
    });

    it('transitions cooldown to idle when cooldown reaches 0', () => {
      const spy = makeTestSpy('spy-1', 'player', { status: 'cooldown', cooldownTurns: 1 });
      const s1 = addSpy(createEspionageCivState(), spy);
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].status).toBe('idle');
      expect(s2.spies[spy.id].cooldownTurns).toBe(0);
    });

    it('does nothing for captured spies', () => {
      const spy = makeTestSpy('spy-1', 'player', { status: 'captured' });
      const s1 = addSpy(createEspionageCivState(), spy);
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
          workedTiles: [], focus: 'balanced', maturity: 'outpost',
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
            researchQueue: [],
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
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {},
      discoveredWonders: {},
      wonderDiscoverers: {},
      embargoes: [],
      defensiveLeagues: [],
      idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
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

    it('security-bureau CI fade triggers on signals-intelligence, not cyber-warfare', () => {
      const base = createEspionageCivState();
      const city = { buildings: ['security-bureau'] };

      // Currently: cyber-warfare triggers the fade → gives 15. After fix: should give 30.
      const withCyberWarfare = applyBuildingCI('city-1', city, base, ['cyber-warfare']);
      // Currently: signals-intelligence does NOT trigger fade → gives 30. After fix: should give 15.
      const withSignalsIntel = applyBuildingCI('city-1', city, base, ['signals-intelligence']);
      // Neither tech: always full bonus (unchanged).
      const withNeither = applyBuildingCI('city-1', city, base, []);

      expect(withCyberWarfare.counterIntelligence['city-1']).toBe(30);   // fails until Task 4
      expect(withSignalsIntel.counterIntelligence['city-1']).toBe(15);   // fails until Task 4
      expect(withNeither.counterIntelligence['city-1']).toBe(30);
    });
  });

  describe('double agents', () => {
    it('turns a captured spy into a false-intel asset for the captor', () => {
      const spy = makeTestSpy('spy-1', 'player', { status: 'captured' });
      const espionage = {
        player: addSpy(createEspionageCivState(), spy),
        'ai-egypt': createEspionageCivState(),
      };

      const turned = turnCapturedSpy(espionage, 'ai-egypt', 'player', spy.id);

      expect(turned.player.spies[spy.id].turnedBy).toBe('ai-egypt');
      expect(turned.player.spies[spy.id].feedsFalseIntel).toBe(true);
      expect(turned.player.spies[spy.id].status).toBe('stationed');
    });

    it('verifyAgent clears false-intel state from a turned spy', () => {
      const spy = makeTestSpy('spy-1', 'player', { turnedBy: 'ai-egypt', feedsFalseIntel: true });
      const updated = addSpy(createEspionageCivState(), spy);

      const verified = verifyAgent(updated, spy.id);

      expect(verified.spies[spy.id].turnedBy).toBeUndefined();
      expect(verified.spies[spy.id].feedsFalseIntel).toBe(false);
    });

    it('records detected threat intel for the captor when a spy is turned', () => {
      const spy = makeTestSpy('spy-1', 'player', {
        status: 'captured', targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1',
      });
      const espionage = {
        player: addSpy(createEspionageCivState(), spy),
        'ai-egypt': createEspionageCivState(),
      };

      const turned = turnCapturedSpy(espionage, 'ai-egypt', 'player', spy.id, 12);

      expect(turned['ai-egypt'].detectedThreats?.[spy.id]).toEqual({
        cityId: 'city-egypt-1',
        foreignCivId: 'player',
        detectedTurn: 12,
        expiresOnTurn: 17,
      });
    });
  });

  it('wakanda gains faster spy growth from successful operations compared to a non-wakanda civ', () => {
    function makeEspionageFixture(playerCivType: string): GameState {
      return {
        turn: 12,
        era: 2,
        currentPlayer: 'player',
        gameOver: false,
        winner: null,
        map: { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] },
        units: {},
        cities: {
          'city-player-1': {
            id: 'city-player-1', name: 'Capital', owner: 'player', position: { q: 0, r: 0 }, population: 4,
            food: 0, foodNeeded: 20, buildings: [], productionQueue: [], productionProgress: 0,
            ownedTiles: [{ q: 0, r: 0 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', grid: [[null]], gridSize: 3, unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
          },
          'city-rival-1': {
            id: 'city-rival-1', name: 'Rival City', owner: 'rival', position: { q: 1, r: 1 }, population: 4,
            food: 0, foodNeeded: 20, buildings: [], productionQueue: [], productionProgress: 0,
            ownedTiles: [{ q: 1, r: 1 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', grid: [[null]], gridSize: 3, unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
          },
        },
        civilizations: {
          player: {
            id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: playerCivType,
            cities: ['city-player-1'], units: [],
            techState: { completed: ['spy-networks'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
            gold: 0, visibility: { tiles: {} }, knownCivilizations: ['rival'], score: 0,
            diplomacy: createDiplomacyState(['player', 'rival'], 'player'),
          },
          rival: {
            id: 'rival', name: 'Rival', color: '#d94a4a', isHuman: false, civType: 'rome',
            cities: ['city-rival-1'], units: [],
            techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
            gold: 0, visibility: { tiles: {} }, knownCivilizations: ['player'], score: 0,
            diplomacy: createDiplomacyState(['player', 'rival'], 'rival'),
          },
        },
        barbarianCamps: {},
        minorCivs: {},
        tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
        settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal', customCivilizations: [] },
        tribalVillages: {},
        discoveredWonders: {},
        wonderDiscoverers: {},
        embargoes: [],
        defensiveLeagues: [],
        idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
        espionage: {
          player: {
            spies: {
              'spy-1': {
                id: 'spy-1',
                owner: 'player',
                name: 'Agent Echo',
                unitType: 'spy_scout',
                targetCivId: 'rival',
                targetCityId: 'city-rival-1',
                position: { q: 1, r: 1 },
                status: 'on_mission',
                experience: 50,
                currentMission: {
                  type: 'monitor_diplomacy',
                  turnsRemaining: 1,
                  turnsTotal: 1,
                  targetCivId: 'rival',
                  targetCityId: 'city-rival-1',
                },
                cooldownTurns: 0,
                promotion: 'handler',
                promotionAvailable: false,
                feedsFalseIntel: false,
              },
            },
            maxSpies: 1,
            counterIntelligence: {},
          },
          rival: createEspionageCivState(),
        },
      } as GameState;
    }

    let baselineResult: GameState | null = null;
    let wakandaResult: GameState | null = null;

    for (let turn = 12; turn < 40; turn++) {
      const baselineState = makeEspionageFixture('rome');
      const wakandaState = makeEspionageFixture('wakanda');
      baselineState.turn = turn;
      wakandaState.turn = turn;
      const baselineAttempt = processEspionageTurn(baselineState, new EventBus());
      const wakandaAttempt = processEspionageTurn(wakandaState, new EventBus());
      const baselineSpy = baselineAttempt.espionage?.player.spies['spy-1'];
      const wakandaSpy = wakandaAttempt.espionage?.player.spies['spy-1'];
      if (baselineSpy?.status === 'stationed' && wakandaSpy?.status === 'stationed') {
        baselineResult = baselineAttempt;
        wakandaResult = wakandaAttempt;
        break;
      }
    }

    expect(baselineResult).toBeTruthy();
    expect(wakandaResult).toBeTruthy();

    const baselineGain = baselineResult!.espionage!.player.spies['spy-1'].experience - 50;
    const wakandaGain = wakandaResult!.espionage!.player.spies['spy-1'].experience - 50;

    expect(wakandaGain).toBeGreaterThan(baselineGain);
    expect(wakandaGain - baselineGain).toBe(10);
  });
});

describe('core type additions MR1', () => {
  it('spy_scout is a valid UnitType', () => {
    const t: import('@/core/types').UnitType = 'spy_scout';
    expect(t).toBe('spy_scout');
  });

  it('SpyStatus does not include traveling (movement is now physical)', () => {
    const validStatuses: import('@/core/types').SpyStatus[] = ['idle','stationed','embedded','on_mission','cooldown','captured','interrogated'];
    expect(validStatuses).not.toContain('traveling');
  });

  it('DisguiseType union is defined', () => {
    const d: import('@/core/types').DisguiseType = 'barbarian';
    expect(d).toBe('barbarian');
  });
});

describe('spy unit definitions', () => {
  const SPY_TYPES = ['spy_scout','spy_informant','spy_agent','spy_operative','spy_hacker'] as const;

  for (const t of SPY_TYPES) {
    it(`UNIT_DEFINITIONS has entry for ${t}`, async () => {
      const { UNIT_DEFINITIONS } = await import('@/systems/unit-system');
      expect(UNIT_DEFINITIONS[t]).toBeDefined();
    });
    it(`UNIT_DESCRIPTIONS has entry for ${t}`, async () => {
      const { UNIT_DESCRIPTIONS } = await import('@/systems/unit-system');
      expect(UNIT_DESCRIPTIONS[t]).toBeTruthy();
    });
  }

  it('spy_scout is in TRAINABLE_UNITS with espionage-scouting', async () => {
    const { TRAINABLE_UNITS } = await import('@/systems/city-system');
    const e = TRAINABLE_UNITS.find(u => u.type === 'spy_scout')!;
    expect(e.techRequired).toBe('espionage-scouting');
    expect(e.obsoletedByTech).toBe('espionage-informants');
  });

  it('spy_informant is obsoleted by spy-networks', async () => {
    const { TRAINABLE_UNITS } = await import('@/systems/city-system');
    const e = TRAINABLE_UNITS.find(u => u.type === 'spy_informant')!;
    expect(e.obsoletedByTech).toBe('spy-networks');
  });

  it('getTrainableUnitsForCiv hides spy_scout when espionage-informants researched', async () => {
    const { getTrainableUnitsForCiv } = await import('@/systems/city-system');
    const visible = getTrainableUnitsForCiv(['espionage-scouting','espionage-informants']);
    const types = visible.map(u => u.type);
    expect(types).not.toContain('spy_scout');
    expect(types).toContain('spy_informant');
  });
});
