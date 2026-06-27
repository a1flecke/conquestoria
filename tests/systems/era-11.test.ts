import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS, createUnit } from '@/systems/unit-system';
import { BUILDINGS, TRAINABLE_UNITS, foundCity } from '@/systems/city-system';
import { LEGENDARY_WONDER_DEFINITIONS } from '@/systems/legendary-wonder-definitions';
import { processAITurn } from '@/ai/basic-ai';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';

const era11Techs = TECH_TREE.filter(t => t.era === 11);

describe('era 11 tech tree', () => {
  it('has exactly 30 era 11 techs', () => {
    expect(era11Techs).toHaveLength(30);
  });

  it('all era 11 techs have era === 11', () => {
    for (const t of era11Techs) {
      expect(t.era, `${t.id} wrong era`).toBe(11);
    }
  });

  it('all era 11 techs have cost in 300–320 range', () => {
    for (const t of era11Techs) {
      expect(t.cost, `${t.id} cost out of range`).toBeGreaterThanOrEqual(300);
      expect(t.cost, `${t.id} cost out of range`).toBeLessThanOrEqual(320);
    }
  });

  it('all 15 tracks have exactly 2 techs', () => {
    const tracks = new Map<string, number>();
    for (const t of era11Techs) {
      tracks.set(t.track, (tracks.get(t.track) ?? 0) + 1);
    }
    expect(tracks.size, 'expected 15 distinct tracks').toBe(15);
    for (const [track, count] of tracks) {
      expect(count, `track ${track} should have 2 techs`).toBe(2);
    }
  });

  it('helicopter-warfare tech exists and unlocks attack_helicopter', () => {
    const tech = era11Techs.find(t => t.id === 'helicopter-warfare');
    expect(tech, 'helicopter-warfare not found').toBeDefined();
    expect(tech!.unlocksUnits).toContain('attack_helicopter');
  });

  it('nuclear-submarines tech exists and unlocks missile_submarine', () => {
    const tech = era11Techs.find(t => t.id === 'nuclear-submarines');
    expect(tech, 'nuclear-submarines not found').toBeDefined();
    expect(tech!.unlocksUnits).toContain('missile_submarine');
  });

  it('space-exploration tech unlocks space_center', () => {
    const tech = era11Techs.find(t => t.id === 'space-exploration');
    expect(tech).toBeDefined();
    expect(tech!.unlocksBuildings).toContain('space_center');
  });
});

describe('era 11 attack_helicopter unit', () => {
  it('attack_helicopter has domain air', () => {
    expect(UNIT_DEFINITIONS.attack_helicopter.domain).toBe('air');
  });

  it('attack_helicopter has visionRange 3', () => {
    expect(UNIT_DEFINITIONS.attack_helicopter.visionRange).toBe(3);
  });

  it('attack_helicopter has strength 40', () => {
    expect(UNIT_DEFINITIONS.attack_helicopter.strength).toBe(40);
  });

  it('attack_helicopter has movementPoints 5', () => {
    expect(UNIT_DEFINITIONS.attack_helicopter.movementPoints).toBe(5);
  });
});

describe('era 11 missile_submarine unit', () => {
  it('missile_submarine has domain naval', () => {
    expect(UNIT_DEFINITIONS.missile_submarine.domain).toBe('naval');
  });

  it('missile_submarine has strength 45', () => {
    expect(UNIT_DEFINITIONS.missile_submarine.strength).toBe(45);
  });

  it('missile_submarine has movementPoints 5', () => {
    expect(UNIT_DEFINITIONS.missile_submarine.movementPoints).toBe(5);
  });

  it('missile_submarine has visionRange 3', () => {
    expect(UNIT_DEFINITIONS.missile_submarine.visionRange).toBe(3);
  });

  it('missile_submarine has coastalRequired: true in TRAINABLE_UNITS', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'missile_submarine');
    expect(entry, 'missile_submarine entry not found in TRAINABLE_UNITS').toBeDefined();
    expect(entry!.coastalRequired).toBe(true);
  });
});

describe('era 11 national projects', () => {
  it('arms_control_treaty exists and has uniquePerEmpire', () => {
    const np = BUILDINGS.arms_control_treaty;
    expect(np, 'arms_control_treaty not found').toBeDefined();
    expect(np.uniquePerEmpire).toBe(true);
    expect(np.nationalProject?.homeEra).toBe(11);
  });

  it('arms_control_treaty total civYieldBonus <= 9', () => {
    const np = BUILDINGS.arms_control_treaty;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });

  it('green_revolution_program exists with homeEra 11', () => {
    const np = BUILDINGS.green_revolution_program;
    expect(np).toBeDefined();
    expect(np.nationalProject?.homeEra).toBe(11);
  });

  it('green_revolution_program total civYieldBonus <= 9', () => {
    const np = BUILDINGS.green_revolution_program;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });

  it('strategic_air_command exists with homeEra 11', () => {
    const np = BUILDINGS.strategic_air_command;
    expect(np).toBeDefined();
    expect(np.nationalProject?.homeEra).toBe(11);
  });

  it('strategic_air_command total civYieldBonus <= 9', () => {
    const np = BUILDINGS.strategic_air_command;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });
});

describe('era 11 apollo-program wonder', () => {
  it('apollo-program wonder exists', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'apollo-program');
    expect(w, 'apollo-program wonder not found').toBeDefined();
  });

  it('apollo-program has era 11', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'apollo-program');
    expect(w!.era).toBe(11);
  });

  it('apollo-program civYieldBonus no key exceeds 6', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'apollo-program');
    const bonus = w!.reward.civYieldBonus ?? {};
    for (const [k, v] of Object.entries(bonus)) {
      expect(v as number, `apollo-program.${k} > 6`).toBeLessThanOrEqual(6);
    }
  });
});

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeAi11State(opts: {
  completedTechs: string[];
  existingUnitTypes?: string[];
  coastal?: boolean;
}): GameState {
  const counters = mkC();
  const cityTile = {
    coord: { q: 0, r: 0 }, terrain: 'grassland' as const,
    elevation: 'lowland' as const, resource: null, improvement: 'none' as const,
    owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
  const tiles: Record<string, GameState['map']['tiles'][string]> = { '0,0': cityTile };
  if (opts.coastal) {
    tiles['1,0'] = {
      coord: { q: 1, r: 0 }, terrain: 'ocean' as const,
      elevation: 'lowland' as const, resource: null, improvement: 'none' as const,
      owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
  }
  const map = { width: 8, height: 8, tiles, wrapsHorizontally: false, rivers: [] };
  const city = foundCity('ai-1', { q: 0, r: 0 }, map, counters);

  const existingUnits: Record<string, GameState['units'][string]> = {};
  const unitIds: string[] = [];
  for (const type of opts.existingUnitTypes ?? []) {
    const u = createUnit(type as any, 'ai-1', { q: 0, r: 0 }, counters);
    existingUnits[u.id] = u;
    unitIds.push(u.id);
  }

  return {
    turn: 11, era: 11, currentPlayer: 'ai-1', gameOver: false, winner: null,
    map,
    units: existingUnits,
    cities: { [city.id]: city },
    civilizations: {
      'ai-1': {
        id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic',
        cities: [city.id], units: unitIds,
        techState: { completed: opts.completedTechs, currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100, visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } },
        score: 0, knownCivilizations: [],
        diplomacy: {
          relationships: {}, atWarWith: [], treatyRequestsSent: [], treatyRequestsReceived: [],
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
    idCounters: counters,
    pendingDiplomacyRequests: [], legendaryWonderIntel: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderProjects: {},
    builtNationalProjects: {},
    espionage: {},
  } as unknown as GameState;
}

describe('era 11 AI queuing', () => {
  it('AI queues attack_helicopter when helicopter-warfare is researched and none exists', () => {
    const state = makeAi11State({ completedTechs: ['helicopter-warfare'] });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).toContain('attack_helicopter');
  });

  it('AI does not queue a second attack_helicopter when one already exists', () => {
    const state = makeAi11State({ completedTechs: ['helicopter-warfare'], existingUnitTypes: ['attack_helicopter'] });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).not.toContain('attack_helicopter');
  });

  it('AI queues attack_helicopter in at most one city across multiple cities in the same turn', () => {
    // Two inland cities with empty queues and no helicopter yet.
    // Without the hasQueuedAttackHelicopterThisTurn guard both cities would queue it.
    const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const map = {
      width: 8, height: 8, wrapsHorizontally: false, rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland' as const, elevation: 'lowland' as const, resource: null, improvement: 'none' as const, owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '5,0': { coord: { q: 5, r: 0 }, terrain: 'grassland' as const, elevation: 'lowland' as const, resource: null, improvement: 'none' as const, owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
      },
    };
    const city1 = foundCity('ai-1', { q: 0, r: 0 }, map, counters);
    const city2 = foundCity('ai-1', { q: 5, r: 0 }, map, counters);
    const state = {
      turn: 11, era: 11, currentPlayer: 'ai-1', gameOver: false, winner: null,
      map, units: {},
      cities: { [city1.id]: city1, [city2.id]: city2 },
      civilizations: {
        'ai-1': {
          id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic',
          cities: [city1.id, city2.id], units: [],
          techState: { completed: ['helicopter-warfare'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
          gold: 100, visibility: { tiles: {} }, score: 0, knownCivilizations: [],
          diplomacy: { relationships: {}, atWarWith: [], treatyRequestsSent: [], treatyRequestsReceived: [], vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 2, peakMilitary: 0 } },
        },
      },
      barbarianCamps: {}, minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
      embargoes: [], defensiveLeagues: [],
      idCounters: counters,
      pendingDiplomacyRequests: [], legendaryWonderIntel: {},
      legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
      legendaryWonderProjects: {},
      builtNationalProjects: {},
      espionage: {},
    } as unknown as GameState;
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const helicopterCities = Object.values(result.cities).filter(
      c => c.owner === 'ai-1' && c.productionQueue.includes('attack_helicopter')
    );
    expect(helicopterCities.length).toBeLessThanOrEqual(1);
  });

  it('AI queues missile_submarine when nuclear-submarines is researched, city is coastal, none exists', () => {
    const state = makeAi11State({ completedTechs: ['nuclear-submarines'], coastal: true });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).toContain('missile_submarine');
  });

  it('AI does not queue a second missile_submarine when one already exists', () => {
    const state = makeAi11State({ completedTechs: ['nuclear-submarines'], existingUnitTypes: ['missile_submarine'], coastal: true });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).not.toContain('missile_submarine');
  });
});

describe('era 11 balance regressions', () => {
  it('stagflation-response tech has no movementBonus field', () => {
    const tech = TECH_TREE.find(t => t.id === 'stagflation-response');
    expect(tech, 'stagflation-response tech not found').toBeDefined();
    expect((tech as any).movementBonus).toBeUndefined();
  });
});
