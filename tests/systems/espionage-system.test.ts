// tests/systems/espionage-system.test.ts
import { describe, it, expect } from 'vitest';
import type {
  Spy, SpyMission, SpyMissionType, EspionageState,
  EspionageCivState, GameState,
} from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';

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
