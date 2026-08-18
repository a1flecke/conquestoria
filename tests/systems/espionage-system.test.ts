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
  missionRequiresPlacedSpy,
  MISSION_BASE_SUCCESS,
  } from '@/systems/espionage-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { transferCapturedCityOwnership } from '@/systems/city-capture-system';

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

  describe('flip_loyalty (#524 MR2a)', () => {
    it('never flips a capital city (city-egypt-1 is ai-egypt.cities[0])', () => {
      const gameState = makeTestGameState();
      const result = resolveMissionResult('flip_loyalty', 'ai-egypt', 'city-egypt-1', gameState, 'player', 'spy-1');
      expect(result.flippedCityId).toBeUndefined();
      expect(result.flippedFromCivId).toBeUndefined();
    });

    it('flips a non-capital foreign city', () => {
      const gameState = makeTestGameState();
      gameState.cities['city-egypt-2'] = {
        ...gameState.cities['city-egypt-1'],
        id: 'city-egypt-2', name: 'Memphis', position: { q: 8, r: 3 },
      };
      gameState.civilizations['ai-egypt'].cities = ['city-egypt-1', 'city-egypt-2'];
      const result = resolveMissionResult('flip_loyalty', 'ai-egypt', 'city-egypt-2', gameState, 'player', 'spy-1');
      expect(result.flippedCityId).toBe('city-egypt-2');
      expect(result.flippedFromCivId).toBe('ai-egypt');
    });

    it('does not fire against a city that already changed owner this turn', () => {
      const gameState = makeTestGameState();
      gameState.cities['city-egypt-2'] = {
        ...gameState.cities['city-egypt-1'],
        id: 'city-egypt-2', name: 'Memphis', position: { q: 8, r: 3 }, owner: 'player',
      };
      gameState.civilizations['ai-egypt'].cities = ['city-egypt-1', 'city-egypt-2'];
      const result = resolveMissionResult('flip_loyalty', 'ai-egypt', 'city-egypt-2', gameState, 'player', 'spy-1');
      expect(result.flippedCityId).toBeUndefined();
    });

    // Review fix: a minor civ's only city has no state.civilizations entry (minor civs
    // live in state.minorCivs with a single cityId), so getCapitalCityId silently
    // returns null for it and the capital guard alone never blocked this. Without the
    // explicit civilizations-membership check, this would let flip_loyalty permanently
    // annex a minor civ's sole city and leave its MinorCivState dangling.
    it('never fires against a city owned by a non-civilizations owner (e.g. a minor civ)', () => {
      const gameState = makeTestGameState();
      gameState.cities['city-minor-1'] = {
        ...gameState.cities['city-egypt-1'],
        id: 'city-minor-1', name: 'Petra', position: { q: 9, r: 3 }, owner: 'minor-nabatea',
      };
      const result = resolveMissionResult('flip_loyalty', 'minor-nabatea', 'city-minor-1', gameState, 'player', 'spy-1');
      expect(result.flippedCityId).toBeUndefined();
      expect(result.flippedFromCivId).toBeUndefined();
    });
  });
});

describe('flip_loyalty gating and end-to-end resolution (#524 MR2a)', () => {
  function makeFlipLoyaltyFixture() {
    let state = createNewGame(undefined, 'flip-loyalty-fixture', 'small');
    const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const capitalStartPos = state.units[state.civilizations[targetCivId].units[0]].position;
    const capital = foundCity(targetCivId, capitalStartPos, state.map, state.idCounters);
    const nonCapital = foundCity(
      targetCivId,
      { q: capitalStartPos.q + 6, r: capitalStartPos.r },
      state.map,
      state.idCounters,
    );
    state = {
      ...state,
      cities: { ...state.cities, [capital.id]: capital, [nonCapital.id]: nonCapital },
      civilizations: {
        ...state.civilizations,
        player: {
          ...state.civilizations.player,
          techState: { ...state.civilizations.player.techState, completed: ['propaganda'] },
        },
        [targetCivId]: {
          ...state.civilizations[targetCivId],
          cities: [capital.id, nonCapital.id],
        },
      },
      espionage: {
        player: {
          ...createEspionageCivState(),
          spies: {
            'spy-1': makeTestSpy('spy-1', 'player', {
              status: 'stationed', targetCivId, targetCityId: nonCapital.id,
              position: nonCapital.position,
            }),
          },
        },
        [targetCivId]: createEspionageCivState(),
      },
    };
    return { state, targetCivId, capitalId: capital.id, nonCapitalId: nonCapital.id };
  }

  it('propaganda gates flip_loyalty (unavailable without the tech, available with it)', () => {
    expect(getAvailableMissions([])).not.toContain('flip_loyalty');
    expect(getAvailableMissions(['propaganda'])).toContain('flip_loyalty');
  });

  it('flip_loyalty requires a placed (stationed) spy', () => {
    expect(missionRequiresPlacedSpy('flip_loyalty')).toBe(true);
  });

  it('a completed flip_loyalty mission transfers the non-capital city and records a bilateral grievance', () => {
    const { state: baseState, targetCivId, nonCapitalId } = makeFlipLoyaltyFixture();
    let succeeded = false;
    for (let turn = 1; turn <= 200 && !succeeded; turn++) {
      const state: GameState = {
        ...baseState,
        turn,
        espionage: {
          ...baseState.espionage!,
          player: {
            ...baseState.espionage!.player,
            spies: {
              'spy-1': startMission(baseState.espionage!.player, 'spy-1', 'flip_loyalty').spies['spy-1'],
            },
          },
        },
      };
      // force resolution this turn by setting turnsRemaining to 1
      state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;

      // Mirrors turn-manager.ts: espionage-system.ts cannot import
      // transferCapturedCityOwnership directly (import cycle through city-system.ts),
      // so the caller subscribes to 'espionage:city-flipped' and applies the transfer
      // immediately after processEspionageTurn returns.
      const bus = new EventBus();
      const pendingFlips: Array<{ civId: string; victimCivId: string; cityId: string }> = [];
      bus.on('espionage:city-flipped', evt => pendingFlips.push(evt));
      let result = processEspionageTurn(state, bus);
      for (const flip of pendingFlips) {
        if (result.cities[flip.cityId]?.owner === flip.victimCivId) {
          result = transferCapturedCityOwnership(result, flip.cityId, flip.civId, result.turn);
        }
      }

      if (result.cities[nonCapitalId].owner === 'player') {
        succeeded = true;
        expect(pendingFlips).toHaveLength(1);
        expect(result.civilizations.player.diplomacy.relationships[targetCivId]).toBeLessThanOrEqual(-30);
        expect(result.civilizations[targetCivId].diplomacy.relationships.player).toBeLessThanOrEqual(-30);
        expect(result.civilizations.player.cities).toContain(nonCapitalId);
        expect(result.civilizations[targetCivId].cities).not.toContain(nonCapitalId);
      }
    }
    expect(succeeded).toBe(true);
  });

  it('never flips the target civ\'s capital, even across many resolution attempts', () => {
    const { state: baseState, capitalId } = makeFlipLoyaltyFixture();
    for (let turn = 1; turn <= 200; turn++) {
      const state: GameState = {
        ...baseState,
        turn,
        espionage: {
          ...baseState.espionage!,
          player: {
            ...baseState.espionage!.player,
            spies: {
              'spy-1': startMission(baseState.espionage!.player, 'spy-1', 'flip_loyalty', undefined, undefined, capitalId).spies['spy-1'],
            },
          },
        },
      };
      state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;
      state.espionage!.player.spies['spy-1'].targetCityId = capitalId;

      const bus = new EventBus();
      const pendingFlips: Array<{ civId: string; victimCivId: string; cityId: string }> = [];
      bus.on('espionage:city-flipped', evt => pendingFlips.push(evt));
      const result = processEspionageTurn(state, bus);
      expect(pendingFlips).toHaveLength(0);
      expect(result.cities[capitalId].owner).not.toBe('player');
    }
  });
});

describe('era 5 missions — intercept_courier and bribe_official (#442 MR1)', () => {
  it('black-chambers gates intercept_courier (unavailable without the tech, available with it)', () => {
    expect(getAvailableMissions([])).not.toContain('intercept_courier');
    expect(getAvailableMissions(['black-chambers'])).toContain('intercept_courier');
  });

  it('diplomatic-networks gates bribe_official (unavailable without the tech, available with it)', () => {
    expect(getAvailableMissions([])).not.toContain('bribe_official');
    expect(getAvailableMissions(['diplomatic-networks'])).toContain('bribe_official');
  });

  it('intercept_courier and bribe_official each require a placed (stationed) spy', () => {
    expect(missionRequiresPlacedSpy('intercept_courier')).toBe(true);
    expect(missionRequiresPlacedSpy('bribe_official')).toBe(true);
  });

  describe('resolveMissionResult — intercept_courier', () => {
    function makeRouteState(): GameState {
      let state = createNewGame(undefined, 'intercept-courier-fixture', 'small');
      const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      const startPos = state.units[state.civilizations[targetCivId].units[0]].position;
      const city = foundCity(targetCivId, startPos, state.map, state.idCounters);
      const otherCity = foundCity(targetCivId, { q: startPos.q + 6, r: startPos.r }, state.map, state.idCounters);
      state = {
        ...state,
        cities: { ...state.cities, [city.id]: city, [otherCity.id]: otherCity },
        civilizations: {
          ...state.civilizations,
          [targetCivId]: { ...state.civilizations[targetCivId], cities: [city.id, otherCity.id] },
        },
        marketplace: {
          ...state.marketplace!,
          tradeRoutes: [
            { id: 'route-low', fromCityId: city.id, toCityId: otherCity.id, goldPerTrip: 20, turnsPerTrip: 4 },
            { id: 'route-high', fromCityId: otherCity.id, toCityId: city.id, goldPerTrip: 80, turnsPerTrip: 4 },
            { id: 'route-unrelated', fromCityId: otherCity.id, toCityId: otherCity.id, goldPerTrip: 999, turnsPerTrip: 4 },
          ],
        },
      };
      return { state, targetCivId, cityId: city.id, otherCityId: otherCity.id } as unknown as GameState & {
        targetCivId: string; cityId: string; otherCityId: string;
      };
    }

    it('picks the highest-value route touching the target city, ignoring unrelated routes', () => {
      const fixture = makeRouteState() as any;
      const result = resolveMissionResult(
        'intercept_courier', fixture.targetCivId, fixture.cityId, fixture.state, 'player', 'spy-1',
      );
      expect(result.interceptedRouteId).toBe('route-high');
      expect(result.interceptedFromCityId).toBe(fixture.otherCityId);
      expect(result.interceptedToCityId).toBe(fixture.cityId);
    });

    it('has no effect when the target city has no active trade route', () => {
      const fixture = makeRouteState() as any;
      fixture.state.marketplace.tradeRoutes = [];
      const result = resolveMissionResult(
        'intercept_courier', fixture.targetCivId, fixture.cityId, fixture.state, 'player', 'spy-1',
      );
      expect(result.interceptedRouteId).toBeUndefined();
    });

    it('has no effect when the target city no longer belongs to the named target civ', () => {
      const fixture = makeRouteState() as any;
      const result = resolveMissionResult(
        'intercept_courier', 'someone-else', fixture.cityId, fixture.state, 'player', 'spy-1',
      );
      expect(result.interceptedRouteId).toBeUndefined();
    });
  });

  describe('resolveMissionResult — bribe_official', () => {
    it('steals 15% of the target treasury, uncapped case', () => {
      const state = { civilizations: { rival: { gold: 100 } }, cities: {} } as unknown as GameState;
      const result = resolveMissionResult('bribe_official', 'rival', 'city-x', state, 'player', 'spy-1');
      expect(result.bribedGoldAmount).toBe(15);
    });

    it('caps the theft at 200 gold regardless of a larger treasury', () => {
      const state = { civilizations: { rival: { gold: 100000 } }, cities: {} } as unknown as GameState;
      const result = resolveMissionResult('bribe_official', 'rival', 'city-x', state, 'player', 'spy-1');
      expect(result.bribedGoldAmount).toBe(200);
    });

    it('has no effect against a civ with no gold', () => {
      const state = { civilizations: { rival: { gold: 0 } }, cities: {} } as unknown as GameState;
      const result = resolveMissionResult('bribe_official', 'rival', 'city-x', state, 'player', 'spy-1');
      expect(result.bribedGoldAmount).toBeUndefined();
    });
  });

  describe('intercept_courier end-to-end resolution', () => {
    function makeCourierFixture() {
      let state = createNewGame(undefined, 'intercept-courier-e2e', 'small');
      const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      const startPos = state.units[state.civilizations[targetCivId].units[0]].position;
      const city = foundCity(targetCivId, startPos, state.map, state.idCounters);
      const otherCity = foundCity(targetCivId, { q: startPos.q + 6, r: startPos.r }, state.map, state.idCounters);
      state = {
        ...state,
        cities: { ...state.cities, [city.id]: city, [otherCity.id]: otherCity },
        civilizations: {
          ...state.civilizations,
          [targetCivId]: { ...state.civilizations[targetCivId], cities: [city.id, otherCity.id] },
        },
        marketplace: {
          ...state.marketplace!,
          tradeRoutes: [
            { id: 'route-only', fromCityId: city.id, toCityId: otherCity.id, goldPerTrip: 40, turnsPerTrip: 4 },
          ],
        },
        espionage: {
          player: {
            ...createEspionageCivState(),
            spies: {
              'spy-1': makeTestSpy('spy-1', 'player', {
                status: 'stationed', targetCivId, targetCityId: city.id, position: city.position,
              }),
            },
          },
          [targetCivId]: createEspionageCivState(),
        },
      };
      return { state, targetCivId, cityId: city.id };
    }

    it('emits espionage:courier-intercepted with the severed route on success, mirroring the turn-manager removal glue', () => {
      const { state: baseState, targetCivId } = makeCourierFixture();
      let succeeded = false;
      for (let turn = 1; turn <= 200 && !succeeded; turn++) {
        const state: GameState = {
          ...baseState,
          turn,
          espionage: {
            ...baseState.espionage!,
            player: {
              ...baseState.espionage!.player,
              spies: {
                'spy-1': startMission(baseState.espionage!.player, 'spy-1', 'intercept_courier').spies['spy-1'],
              },
            },
          },
        };
        state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;

        const bus = new EventBus();
        const pendingIntercepts: Array<{ civId: string; targetCivId: string; routeId: string }> = [];
        bus.on('espionage:courier-intercepted', evt => pendingIntercepts.push(evt));
        let result = processEspionageTurn(state, bus);
        // Mirrors turn-manager.ts's removeRouteById glue (same import-cycle reason as
        // flip_loyalty's transferCapturedCityOwnership above).
        for (const intercept of pendingIntercepts) {
          result = {
            ...result,
            marketplace: {
              ...result.marketplace!,
              tradeRoutes: result.marketplace!.tradeRoutes.filter(r => r.id !== intercept.routeId),
            },
          };
        }

        if (pendingIntercepts.length > 0) {
          succeeded = true;
          expect(pendingIntercepts).toHaveLength(1);
          expect(pendingIntercepts[0].targetCivId).toBe(targetCivId);
          expect(pendingIntercepts[0].civId).toBe('player');
          expect(result.marketplace!.tradeRoutes.find(r => r.id === 'route-only')).toBeUndefined();
        }
      }
      expect(succeeded).toBe(true);
    });
  });

  describe('bribe_official end-to-end resolution', () => {
    function makeBribeFixture() {
      let state = createNewGame(undefined, 'bribe-official-e2e', 'small');
      const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      const startPos = state.units[state.civilizations[targetCivId].units[0]].position;
      const city = foundCity(targetCivId, startPos, state.map, state.idCounters);
      state = {
        ...state,
        cities: { ...state.cities, [city.id]: city },
        civilizations: {
          ...state.civilizations,
          player: { ...state.civilizations.player, gold: 0 },
          [targetCivId]: { ...state.civilizations[targetCivId], cities: [city.id], gold: 100 },
        },
        espionage: {
          player: {
            ...createEspionageCivState(),
            spies: {
              'spy-1': makeTestSpy('spy-1', 'player', {
                status: 'stationed', targetCivId, targetCityId: city.id, position: city.position,
              }),
            },
          },
          [targetCivId]: createEspionageCivState(),
        },
      };
      return { state, targetCivId };
    }

    it('transfers 15% of the target treasury to the acting civ on success', () => {
      const { state: baseState, targetCivId } = makeBribeFixture();
      let succeeded = false;
      for (let turn = 1; turn <= 200 && !succeeded; turn++) {
        const state: GameState = {
          ...baseState,
          turn,
          espionage: {
            ...baseState.espionage!,
            player: {
              ...baseState.espionage!.player,
              spies: {
                'spy-1': startMission(baseState.espionage!.player, 'spy-1', 'bribe_official').spies['spy-1'],
              },
            },
          },
        };
        state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;

        const bus = new EventBus();
        const result = processEspionageTurn(state, bus);

        if (result.civilizations.player.gold > 0) {
          succeeded = true;
          expect(result.civilizations.player.gold).toBe(15);
          expect(result.civilizations[targetCivId].gold).toBe(85);
        }
      }
      expect(succeeded).toBe(true);
    });
  });
});

describe('era 8-9 missions — expose_scandal and signals_intercept (#442 MR2)', () => {
  it('disinformation-bureau gates expose_scandal (unavailable without the tech, available with it)', () => {
    expect(getAvailableMissions([])).not.toContain('expose_scandal');
    expect(getAvailableMissions(['disinformation-bureau'])).toContain('expose_scandal');
  });

  it('counterintelligence gates signals_intercept (unavailable without the tech, available with it)', () => {
    expect(getAvailableMissions([])).not.toContain('signals_intercept');
    expect(getAvailableMissions(['counterintelligence'])).toContain('signals_intercept');
  });

  it('expose_scandal requires a placed (stationed) spy; signals_intercept is remote-capable', () => {
    expect(missionRequiresPlacedSpy('expose_scandal')).toBe(true);
    expect(missionRequiresPlacedSpy('signals_intercept')).toBe(false);
  });

  describe('resolveMissionResult — expose_scandal', () => {
    function makeTreatyState(): GameState {
      return {
        civilizations: {
          rome: {
            gold: 0,
            diplomacy: {
              treaties: [
                { type: 'alliance', civA: 'rome', civB: 'carthage', turnsRemaining: -1 },
                { type: 'trade_agreement', civA: 'egypt', civB: 'rome', turnsRemaining: -1 },
                { type: 'non_aggression_pact', civA: 'rome', civB: 'player', turnsRemaining: -1 },
              ],
            },
          },
          carthage: {},
          egypt: {},
          player: {},
        },
        cities: {},
      } as unknown as GameState;
    }

    it('exposes every other civ with an active treaty against the target', () => {
      const state = makeTreatyState();
      const result = resolveMissionResult('expose_scandal', 'rome', 'city-x', state, 'player', 'spy-1');
      expect(result.exposedPartnerCivIds).toEqual(['carthage', 'egypt']);
    });

    it('excludes the spying civ itself from the exposed partner list', () => {
      const state = makeTreatyState();
      const result = resolveMissionResult('expose_scandal', 'rome', 'city-x', state, 'player', 'spy-1');
      expect(result.exposedPartnerCivIds).not.toContain('player');
    });

    it('has no effect against a civ with no treaties (other than with the spying civ)', () => {
      const state = makeTreatyState();
      state.civilizations.rome.diplomacy.treaties = [
        { type: 'non_aggression_pact', civA: 'rome', civB: 'player', turnsRemaining: -1 },
      ];
      const result = resolveMissionResult('expose_scandal', 'rome', 'city-x', state, 'player', 'spy-1');
      expect(result.exposedPartnerCivIds).toBeUndefined();
    });

    it('caps the exposed partner list at 4', () => {
      const state = makeTreatyState();
      state.civilizations.rome.diplomacy.treaties = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({
        type: 'non_aggression_pact' as const, civA: 'rome', civB: id, turnsRemaining: -1,
      }));
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
        (state.civilizations as any)[id] = {};
      }
      const result = resolveMissionResult('expose_scandal', 'rome', 'city-x', state, 'player', 'spy-1');
      expect(result.exposedPartnerCivIds).toHaveLength(4);
    });

    it('ignores treaty partners that are not real civilizations (e.g. minor civs)', () => {
      const state = makeTreatyState();
      state.civilizations.rome.diplomacy.treaties = [
        { type: 'non_aggression_pact', civA: 'rome', civB: 'minor-nabatea', turnsRemaining: -1 },
      ];
      const result = resolveMissionResult('expose_scandal', 'rome', 'city-x', state, 'player', 'spy-1');
      expect(result.exposedPartnerCivIds).toBeUndefined();
    });
  });

  describe('resolveMissionResult — signals_intercept', () => {
    it('reports every unit owned by the target civ, empire-wide, ignoring distance', () => {
      const state = {
        civilizations: { rome: {} },
        units: {
          'u1': { type: 'warrior', owner: 'rome', position: { q: 0, r: 0 }, health: 100 },
          'u2': { type: 'archer', owner: 'rome', position: { q: 40, r: 40 }, health: 60 },
          'u3': { type: 'warrior', owner: 'player', position: { q: 1, r: 1 }, health: 100 },
        },
        cities: {},
      } as unknown as GameState;
      const result = resolveMissionResult('signals_intercept', 'rome', 'city-x', state, 'player', 'spy-1');
      expect(result.nearbyUnits).toHaveLength(2);
      expect(result.nearbyUnits!.map(u => u.type).sort()).toEqual(['archer', 'warrior']);
    });

    it('has no effect against a civ that does not exist', () => {
      const state = { civilizations: {}, units: {}, cities: {} } as unknown as GameState;
      const result = resolveMissionResult('signals_intercept', 'nobody', 'city-x', state, 'player', 'spy-1');
      expect(result.nearbyUnits).toBeUndefined();
    });
  });

  describe('expose_scandal end-to-end resolution', () => {
    function makeScandalFixture() {
      let state = createNewGame(undefined, 'expose-scandal-e2e', 'small');
      const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      const startPos = state.units[state.civilizations[targetCivId].units[0]].position;
      const city = foundCity(targetCivId, startPos, state.map, state.idCounters);
      state = {
        ...state,
        cities: { ...state.cities, [city.id]: city },
        civilizations: {
          ...state.civilizations,
          [targetCivId]: {
            ...state.civilizations[targetCivId],
            cities: [city.id],
            diplomacy: {
              ...state.civilizations[targetCivId].diplomacy,
              treaties: [
                { type: 'trade_agreement' as const, civA: targetCivId, civB: 'third-civ', turnsRemaining: -1 },
              ],
            },
          },
          'third-civ': {
            ...state.civilizations.player,
            id: 'third-civ',
            name: 'Third Civ',
            diplomacy: { ...createDiplomacyState([targetCivId, 'third-civ', 'player'], 'third-civ') },
          },
        },
        espionage: {
          player: {
            ...createEspionageCivState(),
            spies: {
              'spy-1': makeTestSpy('spy-1', 'player', {
                status: 'stationed', targetCivId, targetCityId: city.id, position: city.position,
              }),
            },
          },
          [targetCivId]: createEspionageCivState(),
          'third-civ': createEspionageCivState(),
        },
      };
      return { state, targetCivId };
    }

    it('applies the bilateral relationship penalty between the target and each exposed partner', () => {
      const { state: baseState, targetCivId } = makeScandalFixture();
      const beforeRelationship = baseState.civilizations[targetCivId].diplomacy.relationships['third-civ'] ?? 0;
      let succeeded = false;
      for (let turn = 1; turn <= 200 && !succeeded; turn++) {
        const state: GameState = {
          ...baseState,
          turn,
          espionage: {
            ...baseState.espionage!,
            player: {
              ...baseState.espionage!.player,
              spies: {
                'spy-1': startMission(baseState.espionage!.player, 'spy-1', 'expose_scandal').spies['spy-1'],
              },
            },
          },
        };
        state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;

        const bus = new EventBus();
        const pendingExposures: Array<{ civId: string; targetCivId: string; partnerCivIds: string[] }> = [];
        bus.on('espionage:scandal-exposed', evt => pendingExposures.push(evt));
        const result = processEspionageTurn(state, bus);

        if (pendingExposures.length > 0) {
          succeeded = true;
          expect(pendingExposures[0].partnerCivIds).toContain('third-civ');
          expect(result.civilizations[targetCivId].diplomacy.relationships['third-civ']).toBeLessThan(beforeRelationship);
          expect(result.civilizations['third-civ'].diplomacy.relationships[targetCivId]).toBeLessThan(0);
        }
      }
      expect(succeeded).toBe(true);
    });
  });

  describe('signals_intercept end-to-end resolution', () => {
    function makeSignalsFixture() {
      let state = createNewGame(undefined, 'signals-intercept-e2e', 'small');
      const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      const targetUnitId = state.civilizations[targetCivId].units[0];
      const startPos = state.units[targetUnitId].position;
      const city = foundCity(targetCivId, startPos, state.map, state.idCounters);
      state = {
        ...state,
        cities: { ...state.cities, [city.id]: city },
        civilizations: {
          ...state.civilizations,
          [targetCivId]: { ...state.civilizations[targetCivId], cities: [city.id] },
        },
      };
      return {
        state: {
          ...state,
          espionage: {
            player: {
              ...createEspionageCivState(),
              spies: {
                'spy-1': makeTestSpy('spy-1', 'player', {
                  status: 'idle', targetCivId, targetCityId: null,
                }),
              },
            },
            [targetCivId]: createEspionageCivState(),
          },
        },
        targetCivId,
        targetUnitId,
      };
    }

    it('persists the latest snapshot on the acting civ\'s own EspionageCivState (so it can be rendered)', () => {
      const { state: baseState, targetCivId } = makeSignalsFixture();
      // signals_intercept is remote-capable, so 'stationed' isn't required — but
      // startMission still needs an explicit target since spy.targetCivId/targetCityId
      // are both null on this idle spy.
      const capitalCityId = Object.keys(baseState.cities).find(id => baseState.cities[id].owner === targetCivId)!;
      let succeeded = false;
      for (let turn = 1; turn <= 200 && !succeeded; turn++) {
        const state: GameState = {
          ...baseState,
          turn,
          espionage: {
            ...baseState.espionage!,
            player: {
              ...baseState.espionage!.player,
              spies: {
                'spy-1': startMission(
                  baseState.espionage!.player, 'spy-1', 'signals_intercept', undefined, targetCivId, capitalCityId,
                ).spies['spy-1'],
              },
            },
          },
        };
        state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;

        const bus = new EventBus();
        const result = processEspionageTurn(state, bus);
        const snapshot = result.espionage!.player.signalsIntelligence?.[targetCivId];

        if (snapshot) {
          succeeded = true;
          expect(snapshot.turn).toBe(turn);
          expect(snapshot.units.length).toBeGreaterThan(0);
        }
      }
      expect(succeeded).toBe(true);
    });
  });
});

// Post-#442 audit fix: monitor_troops/gather_intel/identify_resources/monitor_diplomacy
// already computed a real MissionResult in resolveMissionResult (see the fixed-shape
// unit tests above), but the result was discarded after espionage:mission-succeeded
// fired — no handler anywhere ever read it. This block mirrors the "signals_intercept
// end-to-end resolution" pattern above (same 200-turn success-hunting loop, since
// success is a genuine probabilistic roll) for the four missions that were fixed to
// match.
describe('informational mission report persistence (post-#442 audit fix)', () => {
  function makeInformationalMissionFixture() {
    let state = createNewGame(undefined, 'informational-mission-e2e', 'small');
    const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const targetUnitId = state.civilizations[targetCivId].units[0];
    const startPos = state.units[targetUnitId].position;
    const city = foundCity(targetCivId, startPos, state.map, state.idCounters);
    const resourceTileKey = `${startPos.q},${startPos.r}`;
    const existingTile = state.map.tiles[resourceTileKey];
    state = {
      ...state,
      map: {
        ...state.map,
        tiles: {
          ...state.map.tiles,
          [resourceTileKey]: {
            ...(existingTile ?? {
              coord: startPos, terrain: 'plains', elevation: 'lowland', improvement: 'none',
              owner: targetCivId, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
            }),
            resource: 'iron',
          },
        },
      },
      cities: {
        ...state.cities,
        [city.id]: { ...city, ownedTiles: [startPos] },
      },
      civilizations: {
        ...state.civilizations,
        [targetCivId]: {
          ...state.civilizations[targetCivId],
          cities: [city.id],
          gold: 250,
          diplomacy: {
            ...state.civilizations[targetCivId].diplomacy,
            treaties: [
              { type: 'trade_agreement' as const, civA: targetCivId, civB: 'third-civ', turnsRemaining: -1 },
            ],
          },
        },
        'third-civ': {
          ...state.civilizations.player,
          id: 'third-civ',
          name: 'Third Civ',
          diplomacy: { ...createDiplomacyState([targetCivId, 'third-civ', 'player'], 'third-civ') },
        },
      },
      espionage: {
        player: {
          ...createEspionageCivState(),
          spies: {
            'spy-1': makeTestSpy('spy-1', 'player', {
              status: 'stationed', targetCivId, targetCityId: city.id, position: city.position,
            }),
          },
        },
        [targetCivId]: createEspionageCivState(),
        'third-civ': createEspionageCivState(),
      },
    };
    return { state, targetCivId, cityId: city.id };
  }

  type Acquired = { civId: string; spyId: string; missionType: SpyMissionType; targetCivId: string };

  function runUntil(
    baseState: GameState,
    missionType: SpyMissionType,
    wants: (acquired: Acquired[], failed: boolean) => boolean,
  ): { state: GameState; acquired: Acquired[]; failed: boolean } | null {
    for (let turn = 1; turn <= 200; turn++) {
      const state: GameState = {
        ...baseState,
        turn,
        espionage: {
          ...baseState.espionage!,
          player: {
            ...baseState.espionage!.player,
            spies: {
              'spy-1': startMission(baseState.espionage!.player, 'spy-1', missionType).spies['spy-1'],
            },
          },
        },
      };
      state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;

      const bus = new EventBus();
      const acquired: Acquired[] = [];
      let failed = false;
      bus.on('espionage:intel-report-acquired', evt => acquired.push(evt));
      // Failure resolves to spy_captured or spy_expelled, not a 'mission_failed' bus
      // event (that SpyTurnEvent variant exists in the type union but is never actually
      // pushed by processSpyTurn's failure branch — see the capture/expulsion roll).
      bus.on('espionage:spy-captured', () => { failed = true; });
      bus.on('espionage:spy-expelled', () => { failed = true; });
      const result = processEspionageTurn(state, bus);
      if (wants(acquired, failed)) return { state: result, acquired, failed };
    }
    return null;
  }

  it('monitor_troops persists a troop report on the attacker only and notifies the attacker', () => {
    const { state: baseState, targetCivId, cityId } = makeInformationalMissionFixture();
    const outcome = runUntil(baseState, 'monitor_troops', acquired => acquired.length > 0);
    expect(outcome).not.toBeNull();
    const report = outcome!.state.espionage!.player.troopObservations?.[cityId];
    expect(report).toBeDefined();
    expect(report!.targetCivId).toBe(targetCivId);
    expect(report!.units.length).toBeGreaterThan(0);
    expect(outcome!.acquired).toEqual([
      { civId: 'player', spyId: 'spy-1', missionType: 'monitor_troops', targetCivId },
    ]);
    // Privacy: the target civ's own EspionageCivState must never receive a copy of the
    // attacker's report -- it belongs exclusively to the spying civ.
    expect(outcome!.state.espionage![targetCivId].troopObservations ?? {}).toEqual({});
  });

  it('gather_intel persists a civ intelligence report on the attacker only', () => {
    const { state: baseState, targetCivId } = makeInformationalMissionFixture();
    const outcome = runUntil(baseState, 'gather_intel', acquired => acquired.length > 0);
    expect(outcome).not.toBeNull();
    const report = outcome!.state.espionage!.player.intelReports?.[targetCivId];
    expect(report).toBeDefined();
    expect(report!.treasury).toBe(250);
    expect(report!.treaties).toHaveLength(1);
    expect(report!.completedTechCount).toBe(
      outcome!.state.civilizations[targetCivId].techState.completed.length,
    );
    expect(outcome!.state.espionage![targetCivId].intelReports ?? {}).toEqual({});
  });

  it('identify_resources persists a resource report on the attacker only', () => {
    const { state: baseState, targetCivId, cityId } = makeInformationalMissionFixture();
    const outcome = runUntil(baseState, 'identify_resources', acquired => acquired.length > 0);
    expect(outcome).not.toBeNull();
    const report = outcome!.state.espionage!.player.resourceReports?.[cityId];
    expect(report).toBeDefined();
    expect(report!.targetCivId).toBe(targetCivId);
    expect(report!.resources).toContain('iron');
    expect(outcome!.state.espionage![targetCivId].resourceReports ?? {}).toEqual({});
  });

  it('monitor_diplomacy persists a diplomacy report on the attacker only', () => {
    const { state: baseState, targetCivId } = makeInformationalMissionFixture();
    const outcome = runUntil(baseState, 'monitor_diplomacy', acquired => acquired.length > 0);
    expect(outcome).not.toBeNull();
    const report = outcome!.state.espionage!.player.diplomacyReports?.[targetCivId];
    expect(report).toBeDefined();
    expect(report!.tradePartners).toContain('third-civ');
    expect(outcome!.state.espionage![targetCivId].diplomacyReports ?? {}).toEqual({});
  });

  it('a failed mission never creates a report or fires the intel-acquired notification', () => {
    const { state: baseState, cityId } = makeInformationalMissionFixture();
    const outcome = runUntil(baseState, 'monitor_troops', (acquired, failed) => failed && acquired.length === 0);
    expect(outcome).not.toBeNull();
    expect(outcome!.state.espionage!.player.troopObservations?.[cityId]).toBeUndefined();
    expect(outcome!.acquired).toHaveLength(0);
  });

  // Regression guard (see end-to-end-wiring.md "Espionage informational missions"): this
  // is the exact bug class this MR fixed — resolveMissionResult computing a real payload
  // that only ever reached the unlistened espionage:mission-succeeded event and was then
  // discarded. Every currently-known informational mission must observably persist a
  // report on the acting civ's own EspionageCivState. If a future mission is added to
  // this list without wiring persistence, this test fails loudly instead of shipping a
  // silent dead end.
  const INFORMATIONAL_MISSION_REPORT_FIELD = {
    monitor_troops: 'troopObservations',
    gather_intel: 'intelReports',
    identify_resources: 'resourceReports',
    monitor_diplomacy: 'diplomacyReports',
    signals_intercept: 'signalsIntelligence',
  } as const satisfies Partial<Record<SpyMissionType, keyof EspionageCivState>>;

  it.each(Object.entries(INFORMATIONAL_MISSION_REPORT_FIELD))(
    '%s: a successful resolution is observably persisted on the acting civ\'s EspionageCivState (not silently discarded)',
    (missionType, reportField) => {
      const { state: baseState } = makeInformationalMissionFixture();
      let found: Record<string, unknown> | undefined;
      for (let turn = 1; turn <= 200 && !found; turn++) {
        const state: GameState = {
          ...baseState,
          turn,
          espionage: {
            ...baseState.espionage!,
            player: {
              ...baseState.espionage!.player,
              spies: {
                'spy-1': startMission(baseState.espionage!.player, 'spy-1', missionType as SpyMissionType).spies['spy-1'],
              },
            },
          },
        };
        state.espionage!.player.spies['spy-1'].currentMission!.turnsRemaining = 1;
        const result = processEspionageTurn(state, new EventBus());
        const report = result.espionage!.player[reportField as keyof EspionageCivState] as Record<string, unknown> | undefined;
        if (report && Object.keys(report).length > 0) found = report;
      }
      expect(found).toBeDefined();
    },
  );

  // Stronger completeness guard, added after being pressed on "does this actually
  // prevent a *future* mission from repeating this bug": the it.each above only proves
  // the 5 currently-known informational missions stay wired — it says nothing about a
  // brand-new 6th one, because it only iterates a manually-maintained list. This test
  // closes that gap using a genuinely zero-maintenance enumeration: MISSION_BASE_SUCCESS
  // is a real `: Record<OffensiveMissionType, number> =` type annotation (not an `as`
  // cast, which does NOT force exhaustiveness -- converting these tables surfaced a real
  // pre-existing gap, see that export's comment), so TypeScript itself refuses to compile
  // if a new SpyMissionType is added without an entry there. Object.keys(...) is
  // therefore guaranteed to include every mission that will ever exist, automatically,
  // forever -- no one has to remember to update this test's inputs, only its
  // classification. A new mission lands in neither list below until a human explicitly
  // decides which one it belongs in.
  const HANDLED_WITHOUT_A_REPORT: SpyMissionType[] = [
    'scout_area', 'steal_tech', 'sabotage_production', 'incite_unrest',
    'assassinate_advisor', 'forge_documents', 'fund_rebels', 'arms_smuggling',
    'flip_loyalty', 'cyber_attack', 'misinformation_campaign', 'election_interference',
    'satellite_surveillance', 'sabotage_relief', 'intercept_courier', 'bribe_official',
    'expose_scandal',
  ];

  it('every mission that flows through the offensive resolution pipeline is explicitly classified', () => {
    const allOffensiveMissions = Object.keys(MISSION_BASE_SUCCESS) as SpyMissionType[];
    const persistsReport = Object.keys(INFORMATIONAL_MISSION_REPORT_FIELD) as SpyMissionType[];

    const overlap = persistsReport.filter(m => HANDLED_WITHOUT_A_REPORT.includes(m));
    expect(overlap).toEqual([]);

    const classified = new Set([...persistsReport, ...HANDLED_WITHOUT_A_REPORT]);
    const unclassified = allOffensiveMissions.filter(m => !classified.has(m));
    expect(unclassified).toEqual([]);

    // And the reverse: nothing in either list should be a name that no longer exists
    // (e.g. after a mission is renamed or removed), which would silently hide a real gap.
    const stale = [...classified].filter(m => !allOffensiveMissions.includes(m));
    expect(stale).toEqual([]);
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
  const SPY_TYPES = ['spy_scout','spy_informant','spy_agent','spy_operative','spy_intelligence_officer','spy_station_chief','spy_hacker'] as const;

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
