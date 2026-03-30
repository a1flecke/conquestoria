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
  _resetSpyIdCounter,
} from '@/systems/espionage-system';

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
    const validTypes: SpyMissionType[] = ['scout_area', 'monitor_troops', 'gather_intel', 'identify_resources', 'monitor_diplomacy'];
    expect(validTypes).toHaveLength(5);
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
