import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS, createUnit } from '@/systems/unit-system';
import { BUILDINGS, TRAINABLE_UNITS, foundCity } from '@/systems/city-system';
import { LEGENDARY_WONDER_DEFINITIONS } from '@/systems/legendary-wonder-definitions';
import { processAITurn } from '@/ai/basic-ai';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';

const era10Techs = TECH_TREE.filter(t => t.era === 10);

describe('era 10 tech tree', () => {
  // MR10 re-homed nuclear-theory (science) and digital-surveillance (espionage) from
  // mis-pointed era-5 stubs to era 10, where their names actually belong.
  it('has exactly 32 era 10 techs', () => {
    expect(era10Techs).toHaveLength(32);
  });

  it('all era 10 techs have era === 10', () => {
    for (const t of era10Techs) {
      expect(t.era, `${t.id} wrong era`).toBe(10);
    }
  });

  it('all era 10 techs have cost in 280–300 range', () => {
    for (const t of era10Techs) {
      expect(t.cost, `${t.id} cost out of range`).toBeGreaterThanOrEqual(280);
      expect(t.cost, `${t.id} cost out of range`).toBeLessThanOrEqual(300);
    }
  });

  // science and espionage have 3 each (2 native + 1 re-homed stub); every other track has 2.
  it('all 15 tracks have 2 techs, except science and espionage which have 3 (re-homed stubs)', () => {
    const tracks = new Map<string, number>();
    for (const t of era10Techs) {
      tracks.set(t.track, (tracks.get(t.track) ?? 0) + 1);
    }
    expect(tracks.size, 'expected 15 distinct tracks').toBe(15);
    for (const [track, count] of tracks) {
      const expected = track === 'science' || track === 'espionage' ? 3 : 2;
      expect(count, `track ${track} should have ${expected} techs`).toBe(expected);
    }
  });

  it('jet-aviation tech exists and unlocks jet_fighter', () => {
    const tech = era10Techs.find(t => t.id === 'jet-aviation');
    expect(tech, 'jet-aviation not found').toBeDefined();
    expect(tech!.unlocksUnits).toContain('jet_fighter');
  });

  it('carrier-warfare tech exists and unlocks carrier', () => {
    const tech = era10Techs.find(t => t.id === 'carrier-warfare');
    expect(tech, 'carrier-warfare not found').toBeDefined();
    expect(tech!.unlocksUnits).toContain('carrier');
  });

  it('nuclear-weapons tech unlocks nuclear_arsenal', () => {
    const tech = era10Techs.find(t => t.id === 'nuclear-weapons');
    expect(tech).toBeDefined();
    expect(tech!.unlocksBuildings).toContain('nuclear_arsenal');
  });
});

describe('era 10 jet_fighter unit', () => {
  it('jet_fighter has domain air', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.domain).toBe('air');
  });

  it('jet_fighter has visionRange 3', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.visionRange).toBe(3);
  });

  it('jet_fighter has strength 50', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.strength).toBe(50);
  });

  it('jet_fighter has movementPoints 6', () => {
    expect(UNIT_DEFINITIONS.jet_fighter.movementPoints).toBe(6);
  });
});

describe('era 10 carrier unit', () => {
  it('carrier has domain naval', () => {
    expect(UNIT_DEFINITIONS.carrier.domain).toBe('naval');
  });

  // MR8: carrier re-spec'd honestly (30 -> 45) — no air-basing capability yet, so it
  // needed to justify its cost as a mobile combat platform rather than a hollow escort.
  it('carrier has strength 45', () => {
    expect(UNIT_DEFINITIONS.carrier.strength).toBe(45);
  });

  it('carrier has movementPoints 4', () => {
    expect(UNIT_DEFINITIONS.carrier.movementPoints).toBe(4);
  });

  it('carrier has visionRange 3', () => {
    expect(UNIT_DEFINITIONS.carrier.visionRange).toBe(3);
  });

  it('carrier has coastalRequired: true in TRAINABLE_UNITS', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'carrier');
    expect(entry, 'carrier entry not found in TRAINABLE_UNITS').toBeDefined();
    expect(entry!.coastalRequired).toBe(true);
  });
});

describe('era 10 national projects', () => {
  it('manhattan_project exists and has uniquePerEmpire', () => {
    const np = BUILDINGS.manhattan_project;
    expect(np, 'manhattan_project not found').toBeDefined();
    expect(np.uniquePerEmpire).toBe(true);
    expect(np.nationalProject?.homeEra).toBe(10);
  });

  it('manhattan_project total civYieldBonus <= 9', () => {
    const np = BUILDINGS.manhattan_project;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });

  it('postwar_reconstruction exists with homeEra 10', () => {
    const np = BUILDINGS.postwar_reconstruction;
    expect(np).toBeDefined();
    expect(np.nationalProject?.homeEra).toBe(10);
  });

  it('postwar_reconstruction each key <= 3', () => {
    const np = BUILDINGS.postwar_reconstruction;
    for (const [k, v] of Object.entries(np.civYieldBonus ?? {})) {
      expect(v as number, `postwar_reconstruction.${k} > 3`).toBeLessThanOrEqual(3);
    }
  });

  it('space_program_initiative exists with homeEra 10', () => {
    const np = BUILDINGS.space_program_initiative;
    expect(np).toBeDefined();
    expect(np.nationalProject?.homeEra).toBe(10);
  });

  it('space_program_initiative total civYieldBonus <= 9', () => {
    const np = BUILDINGS.space_program_initiative;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });
});

describe('era 10 united-nations wonder', () => {
  it('united-nations wonder exists', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'united-nations');
    expect(w, 'united-nations wonder not found').toBeDefined();
  });

  it('united-nations has era 10', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'united-nations');
    expect(w!.era).toBe(10);
  });

  it('united-nations civYieldBonus both keys <= 6', () => {
    const w = LEGENDARY_WONDER_DEFINITIONS.find(w => w.id === 'united-nations');
    const bonus = w!.reward.civYieldBonus ?? {};
    for (const [k, v] of Object.entries(bonus)) {
      expect(v as number, `united-nations.${k} > 6`).toBeLessThanOrEqual(6);
    }
  });
});

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeAiState(opts: {
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
    turn: 10, era: 10, currentPlayer: 'ai-1', gameOver: false, winner: null,
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

describe('era 10 AI queuing', () => {
  it('uses catalog scoring instead of a hardcoded jet-fighter priority', () => {
    const state = makeAiState({ completedTechs: ['jet-aviation'] });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue.length).toBeGreaterThan(0);
  });

  it('AI does not queue a second jet_fighter when one already exists', () => {
    const state = makeAiState({ completedTechs: ['jet-aviation'], existingUnitTypes: ['jet_fighter'] });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).not.toContain('jet_fighter');
  });

  it('uses catalog scoring instead of a hardcoded carrier priority', () => {
    const state = makeAiState({ completedTechs: ['carrier-warfare'], coastal: true });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue.length).toBeGreaterThan(0);
  });

  it('AI does not queue a second carrier when one already exists', () => {
    const state = makeAiState({ completedTechs: ['carrier-warfare'], existingUnitTypes: ['carrier'], coastal: true });
    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const city = Object.values(result.cities).find(c => c.owner === 'ai-1')!;
    expect(city.productionQueue).not.toContain('carrier');
  });

  it('AI queues carrier in at most one city across multiple coastal cities in the same turn', () => {
    // Two coastal cities with empty queues and no carrier yet.
    // The bug: hasCarrier re-declared inside the loop reads civ.units (unchanged this turn),
    // so both cities would queue carrier. After the fix, only one city queues it.
    const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const map = {
      width: 8, height: 8, wrapsHorizontally: false, rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland' as const, elevation: 'lowland' as const, resource: null, improvement: 'none' as const, owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'ocean' as const, elevation: 'lowland' as const, resource: null, improvement: 'none' as const, owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '5,0': { coord: { q: 5, r: 0 }, terrain: 'grassland' as const, elevation: 'lowland' as const, resource: null, improvement: 'none' as const, owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '6,0': { coord: { q: 6, r: 0 }, terrain: 'ocean' as const, elevation: 'lowland' as const, resource: null, improvement: 'none' as const, owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
      },
    };
    const city1 = foundCity('ai-1', { q: 0, r: 0 }, map, counters);
    const city2 = foundCity('ai-1', { q: 5, r: 0 }, map, counters);
    const state = {
      turn: 10, era: 10, currentPlayer: 'ai-1', gameOver: false, winner: null,
      map,
      units: {},
      cities: { [city1.id]: city1, [city2.id]: city2 },
      civilizations: {
        'ai-1': {
          id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic',
          cities: [city1.id, city2.id], units: [],
          techState: { completed: ['carrier-warfare'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
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
      legendaryWonderProjects: {}, builtNationalProjects: {}, espionage: {},
    } as unknown as GameState;

    const bus = new EventBus();
    const result = processAITurn(state, 'ai-1', bus);
    const carrierCities = Object.values(result.cities).filter(c => c.owner === 'ai-1' && c.productionQueue.includes('carrier'));
    expect(carrierCities.length).toBeLessThanOrEqual(1);
  });
});

describe('era 10 balance regressions', () => {
  it('highway-network tech has no movementBonus field', () => {
    const tech = TECH_TREE.find(t => t.id === 'highway-network');
    expect(tech, 'highway-network tech not found').toBeDefined();
    expect((tech as any).movementBonus).toBeUndefined();
  });
});
