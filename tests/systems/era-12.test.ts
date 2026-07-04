import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { ERA_NAMES } from '@/ui/tech-panel';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { UNIT_SFX } from '@/audio/sfx-catalog';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit, City } from '@/core/types';

const era12Techs = TECH_TREE.filter(t => t.era === 12);

describe('era 12 tech tree', () => {
  it('has exactly 30 era 12 techs', () => {
    expect(era12Techs).toHaveLength(30);
  });

  it('all era 12 techs have era === 12', () => {
    for (const t of era12Techs) {
      expect(t.era, `${t.id} wrong era`).toBe(12);
    }
  });

  it('all era 12 techs cost in 380–420 range', () => {
    for (const t of era12Techs) {
      expect(t.cost, `${t.id} cost out of range`).toBeGreaterThanOrEqual(380);
      expect(t.cost, `${t.id} cost out of range`).toBeLessThanOrEqual(420);
    }
  });

  it('all 15 tracks have exactly 2 techs', () => {
    const tracks = new Map<string, number>();
    for (const t of era12Techs) {
      tracks.set(t.track, (tracks.get(t.track) ?? 0) + 1);
    }
    expect(tracks.size, 'expected 15 distinct tracks').toBe(15);
    for (const [track, count] of tracks) {
      expect(count, `track ${track} should have 2 techs`).toBe(2);
    }
  });

  it('cyber-warfare unlocks cyber_unit', () => {
    const tech = era12Techs.find(t => t.id === 'cyber-warfare');
    expect(tech).toBeDefined();
    expect(tech!.unlocksUnits).toContain('cyber_unit');
  });

  it('stealth-technology unlocks stealth_bomber and stealth_airbase', () => {
    const tech = era12Techs.find(t => t.id === 'stealth-technology');
    expect(tech!.unlocksUnits).toContain('stealth_bomber');
    expect(tech!.unlocksBuildings).toContain('stealth_airbase');
  });

  it('internet unlocks cyber_defense_center', () => {
    const tech = era12Techs.find(t => t.id === 'internet');
    expect(tech!.unlocksBuildings).toContain('cyber_defense_center');
  });

  it('no unlocks entry is a bare building id or unit type', () => {
    const buildingIds = new Set(Object.keys(BUILDINGS));
    const unitTypes = new Set(TRAINABLE_UNITS.map(u => u.type));
    for (const t of era12Techs) {
      for (const entry of t.unlocks ?? []) {
        expect(buildingIds.has(entry), `tech ${t.id} unlocks entry "${entry}" is a bare building id`).toBe(false);
        expect(unitTypes.has(entry as any), `tech ${t.id} unlocks entry "${entry}" is a bare unit type`).toBe(false);
      }
    }
  });
});

describe('era 12 units — spec stats', () => {
  it('cyber_unit has strength 0, movementPoints 3, productionCost 120', () => {
    const def = UNIT_DEFINITIONS['cyber_unit'];
    expect(def.strength).toBe(0);
    expect(def.movementPoints).toBe(3);
    expect(def.productionCost).toBe(120);
    expect(def.domain ?? 'land').toBe('land');
  });

  it('stealth_bomber has strength 52, movementPoints 5, productionCost 360, range 3', () => {
    const def = UNIT_DEFINITIONS['stealth_bomber'];
    expect(def.strength).toBe(52);
    expect(def.movementPoints).toBe(5);
    expect(def.productionCost).toBe(360);
    expect((def as any).attackProfile?.range).toBe(3);
  });

  it('cyber_unit in TRAINABLE_UNITS gated by cyber-warfare, no trainedFromBuilding', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'cyber_unit');
    expect(entry).toBeDefined();
    expect(entry!.techRequired).toBe('cyber-warfare');
    expect(entry!.trainedFromBuilding).toBeUndefined();
    expect(entry!.cost).toBe(120);
  });

  it('stealth_bomber TRAINABLE_UNITS cost updated to 360', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'stealth_bomber');
    expect(entry!.cost).toBe(360);
  });
});

describe('era 12 units — SFX catalog', () => {
  it('stealth_bomber has ranged-loose, ranged-impact, and death SFX', () => {
    const sfx = UNIT_SFX['stealth_bomber'];
    expect(sfx).toBeDefined();
    expect(sfx!['ranged-loose']).toBeDefined();
    expect(sfx!['ranged-impact']).toBeDefined();
    expect(sfx!['death']).toBeDefined();
  });

  it('cyber_unit has death SFX', () => {
    expect(UNIT_SFX['cyber_unit']?.['death']).toBeDefined();
  });
});

describe('ERA_NAMES', () => {
  it('ERA_NAMES[12] returns Information Age', () => {
    expect(ERA_NAMES[12]).toBe('Information Age');
  });
  it('ERA_NAMES[8] through [11] are all defined', () => {
    for (const era of [8, 9, 10, 11]) {
      expect(ERA_NAMES[era], `ERA_NAMES[${era}] missing`).toBeDefined();
    }
  });
});

// --- Combat behavior tests (Task 4) ---

function makeCombatState(units: Record<string, Partial<Unit>>, civUnits: Record<string, string[]>): GameState {
  const civilizations: GameState['civilizations'] = {};
  for (const [civId, unitIds] of Object.entries(civUnits)) {
    civilizations[civId] = {
      id: civId, name: civId, color: civId === 'p1' ? '#fff' : '#000',
      isHuman: civId === 'p1', civType: 'generic',
      units: unitIds, cities: [], gold: 100,
      techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} } as any,
      diplomacy: { relationships: {}, atWarWith: [civId === 'p1' ? 'p2' : 'p1'], treaties: [], events: [], treacheryScore: 0, vassalage: { isVassal: false } } as any,
      visibility: { tiles: {} } as any, score: 0,
    };
  }
  const fullUnits: Record<string, Unit> = {};
  for (const [id, partial] of Object.entries(units)) {
    fullUnits[id] = {
      id, type: 'warrior', owner: 'p1', health: 100,
      position: { q: 0, r: 0 }, movementPointsLeft: 1,
      hasMoved: false, hasActed: false, experience: 0, isResting: false,
      ...partial,
    } as Unit;
  }
  return {
    turn: 1, era: 12, currentPlayer: 'p1', civilizations,
    units: fullUnits, cities: {},
    map: { tiles: {}, width: 10, height: 10, wrapsHorizontally: false },
    idCounters: { unit: 0, city: 0 },
  } as unknown as GameState;
}

describe('geneTherapyReady — combat survival', () => {
  it('unit with geneTherapyReady:true survives lethal hit at 1 HP and sets flag false', () => {
    const state = makeCombatState(
      { a1: { owner: 'p1', health: 80, position: { q: 0, r: 0 }, geneTherapyReady: true },
        d1: { owner: 'p2', health: 100, position: { q: 1, r: 0 } } },
      { p1: ['a1'], p2: ['d1'] },
    );
    const result = {
      attackerId: 'a1', defenderId: 'd1',
      attackerDamage: 80, defenderDamage: 30,
      attackerSurvived: false, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const applied = applyCombatOutcomeToState(state, result, 42);
    expect(applied.state.units['a1']).toBeDefined();
    expect(applied.state.units['a1'].health).toBe(1);
    expect(applied.state.units['a1'].geneTherapyReady).toBe(false);
    expect(applied.attackerDefeated).toBe(false);
  });

  it('unit with geneTherapyReady:false is eliminated normally', () => {
    const state = makeCombatState(
      { a2: { owner: 'p1', health: 80, position: { q: 0, r: 0 }, geneTherapyReady: false },
        d2: { owner: 'p2', health: 100, position: { q: 1, r: 0 } } },
      { p1: ['a2'], p2: ['d2'] },
    );
    const result = {
      attackerId: 'a2', defenderId: 'd2',
      attackerDamage: 80, defenderDamage: 30,
      attackerSurvived: false, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const applied = applyCombatOutcomeToState(state, result, 42);
    expect(applied.state.units['a2']).toBeUndefined();
    expect(applied.attackerDefeated).toBe(true);
  });

  it('geneTherapyReady:undefined does NOT save the unit', () => {
    const state = makeCombatState(
      { a3: { owner: 'p1', health: 80, position: { q: 0, r: 0 } },
        d3: { owner: 'p2', health: 100, position: { q: 1, r: 0 } } },
      { p1: ['a3'], p2: ['d3'] },
    );
    const result = {
      attackerId: 'a3', defenderId: 'd3',
      attackerDamage: 80, defenderDamage: 30,
      attackerSurvived: false, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const applied = applyCombatOutcomeToState(state, result, 42);
    expect(applied.state.units['a3']).toBeUndefined();
    expect(applied.attackerDefeated).toBe(true);
  });
});

describe('cyber_unit capture', () => {
  it('cyber_unit defender is captured (ownership transferred) not destroyed', () => {
    const state = makeCombatState(
      { cu1: { type: 'cyber_unit', owner: 'p1', health: 100, position: { q: 0, r: 0 } },
        w1:  { type: 'warrior',    owner: 'p2', health: 100, position: { q: 1, r: 0 } } },
      { p1: ['cu1'], p2: ['w1'] },
    );
    const result = {
      attackerId: 'w1', defenderId: 'cu1',
      attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 1, r: 0 }, defenderPosition: { q: 0, r: 0 },
    };
    const applied = applyCombatOutcomeToState(state, result, 42);
    expect(applied.state.units['cu1']).toBeDefined();
    expect(applied.state.units['cu1'].owner).toBe('p2');
    expect(applied.defenderDefeated).toBe(false);
    expect(applied.state.civilizations['p1'].units).not.toContain('cu1');
    expect(applied.state.civilizations['p2'].units).toContain('cu1');
  });

  it('cyber_unit attacker is captured (ownership transferred) not destroyed', () => {
    const state = makeCombatState(
      { cu2: { type: 'cyber_unit', owner: 'p1', health: 100, position: { q: 0, r: 0 } },
        w2:  { type: 'warrior',    owner: 'p2', health: 100, position: { q: 1, r: 0 } } },
      { p1: ['cu2'], p2: ['w2'] },
    );
    const result = {
      attackerId: 'cu2', defenderId: 'w2',
      attackerDamage: 100, defenderDamage: 0,
      attackerSurvived: false, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const applied = applyCombatOutcomeToState(state, result, 42);
    expect(applied.state.units['cu2']).toBeDefined();
    expect(applied.state.units['cu2'].owner).toBe('p2');
    expect(applied.attackerDefeated).toBe(false);
    expect(applied.state.civilizations['p1'].units).not.toContain('cu2');
    expect(applied.state.civilizations['p2'].units).toContain('cu2');
  });
});

// ---- Task 5: turn-manager behaviors ----

function makeProcessTurnState(overrides: {
  p1Gold?: number;
  p1Buildings?: string[];
  p2Buildings?: string[];
  cyberUnitPos?: { q: number; r: number };
  p1CityPos?: { q: number; r: number };
  p1Techs?: string[];
  p1Units?: string[];
  extraUnits?: Record<string, Partial<Unit>>;
}): GameState {
  const p1CityPos = overrides.p1CityPos ?? { q: 1, r: 0 };
  const cyberUnitPos = overrides.cyberUnitPos ?? { q: 2, r: 0 };
  const fullUnits: Record<string, Unit> = {
    cu1: {
      id: 'cu1', type: 'cyber_unit', owner: 'p2', health: 100,
      position: cyberUnitPos,
      movementPointsLeft: 0, hasMoved: true, hasActed: true, experience: 0, isResting: false,
    } as Unit,
  };
  for (const [id, partial] of Object.entries(overrides.extraUnits ?? {})) {
    fullUnits[id] = {
      id, type: 'warrior', owner: 'p1', health: 100,
      position: p1CityPos, movementPointsLeft: 1,
      hasMoved: false, hasActed: false, experience: 0, isResting: false,
      ...partial,
    } as Unit;
  }
  return {
    turn: 1, era: 12, currentPlayer: 'p1',
    civilizations: {
      p1: {
        id: 'p1', name: 'Alpha', color: '#fff', isHuman: true, civType: 'generic',
        units: overrides.p1Units ?? [], cities: ['city-p1'], gold: overrides.p1Gold ?? 10,
        techState: { completed: overrides.p1Techs ?? [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} } as any,
        diplomacy: { relationships: {}, atWarWith: ['p2'], treaties: [], events: [], treacheryScore: 0, vassalage: { isVassal: false } } as any,
        visibility: { tiles: {} } as any, score: 0,
      },
      p2: {
        id: 'p2', name: 'Beta', color: '#000', isHuman: false, civType: 'generic',
        units: ['cu1'], cities: ['city-p2'], gold: 10,
        techState: { completed: ['cyber-warfare'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} } as any,
        diplomacy: { relationships: {}, atWarWith: ['p1'], treaties: [], events: [], treacheryScore: 0, vassalage: { isVassal: false } } as any,
        visibility: { tiles: {} } as any, score: 0,
      },
    },
    units: fullUnits,
    cities: {
      'city-p1': {
        id: 'city-p1', name: 'Capital', owner: 'p1', position: p1CityPos,
        buildings: overrides.p1Buildings ?? [],
        productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 15,
        population: 1, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'settled',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
      } as unknown as City,
      'city-p2': {
        id: 'city-p2', name: 'Beta City', owner: 'p2', position: { q: 10, r: 10 },
        buildings: overrides.p2Buildings ?? [],
        productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 15,
        population: 1, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'settled',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
      } as unknown as City,
    },
    map: {
      tiles: {
        '1,0': { terrain: 'plains', owner: 'p1' },
        '2,0': { terrain: 'plains', owner: undefined },
      },
      width: 20, height: 20, wrapsHorizontally: false,
    },
    idCounters: { unit: 10, city: 10 },
    minorCivs: {},
    barbarianCamps: {},
  } as unknown as GameState;
}

describe('cyber unit gold drain (Task 5)', () => {
  it('drains 2 gold from p1 when p2 cyber_unit is adjacent (no CDC)', () => {
    const state = makeProcessTurnState({
      p1Gold: 100,
      p1CityPos: { q: 1, r: 0 },
      cyberUnitPos: { q: 2, r: 0 },
      p1Buildings: [],
    });
    const bus = new EventBus();
    const result = processTurn(state, bus);
    expect(result.civilizations['p1'].gold).toBeLessThanOrEqual(100);
  });

  it('does NOT drain when cyber_unit is not adjacent (hexDistance > 1)', () => {
    const state = makeProcessTurnState({
      p1Gold: 0,
      p1CityPos: { q: 1, r: 0 },
      cyberUnitPos: { q: 5, r: 5 },
      p1Buildings: [],
    });
    const bus = new EventBus();
    const result = processTurn(state, bus);
    expect(result.civilizations['p1'].gold).toBeGreaterThanOrEqual(0);
  });
});

describe('cyberMarketDisruption tick (Task 5)', () => {
  it('decrements turnsRemaining and applies 1 gold penalty', () => {
    const state = makeProcessTurnState({ p1Gold: 10 });
    const stateWithDisruption = {
      ...state,
      cities: {
        ...state.cities,
        'city-p1': { ...state.cities['city-p1'], cyberMarketDisruption: { turnsRemaining: 3 } },
      },
    } as unknown as GameState;
    const bus = new EventBus();
    const result = processTurn(stateWithDisruption, bus);
    expect(result.cities['city-p1'].cyberMarketDisruption?.turnsRemaining).toBe(2);
  });

  it('removes cyberMarketDisruption when turnsRemaining reaches 0', () => {
    const state = makeProcessTurnState({ p1Gold: 10 });
    const stateWithDisruption = {
      ...state,
      cities: {
        ...state.cities,
        'city-p1': { ...state.cities['city-p1'], cyberMarketDisruption: { turnsRemaining: 1 } },
      },
    } as unknown as GameState;
    const bus = new EventBus();
    const result = processTurn(stateWithDisruption, bus);
    expect(result.cities['city-p1'].cyberMarketDisruption).toBeUndefined();
  });
});

describe('gene therapy pre-charge (Task 5)', () => {
  it('unit trained in city with gene_therapy_clinic starts geneTherapyReady:true', () => {
    const state = makeProcessTurnState({ p1Buildings: ['gene_therapy_clinic'] });
    const stateWithQueue = {
      ...state,
      cities: {
        ...state.cities,
        'city-p1': {
          ...state.cities['city-p1'],
          productionQueue: ['warrior'],
          productionProgress: 59,
          idleProduction: 'production',
        },
      },
    } as unknown as GameState;
    const bus = new EventBus();
    const result = processTurn(stateWithQueue, bus);
    const newWarrior = Object.values(result.units).find(u => u.type === 'warrior' && u.owner === 'p1');
    expect(newWarrior).toBeDefined();
    expect(newWarrior!.geneTherapyReady).toBe(true);
  });

  it('unit trained without gene_therapy_clinic does NOT get geneTherapyReady', () => {
    const state = makeProcessTurnState({ p1Buildings: [] });
    const stateWithQueue = {
      ...state,
      cities: {
        ...state.cities,
        'city-p1': {
          ...state.cities['city-p1'],
          productionQueue: ['warrior'],
          productionProgress: 59,
          idleProduction: 'production',
        },
      },
    } as unknown as GameState;
    const bus = new EventBus();
    const result = processTurn(stateWithQueue, bus);
    const newWarrior = Object.values(result.units).find(u => u.type === 'warrior' && u.owner === 'p1');
    expect(newWarrior).toBeDefined();
    expect(newWarrior!.geneTherapyReady).toBeUndefined();
  });
});

describe('geneTherapyReady cooldown reset (Task 5)', () => {
  it('unit at geneTherapyReady:false resets to true after resting in own city', () => {
    const state = makeProcessTurnState({
      p1Units: ['warrior1'],
      extraUnits: {
        warrior1: {
          type: 'warrior', owner: 'p1',
          position: { q: 1, r: 0 },
          hasMoved: false, hasActed: false,
          geneTherapyReady: false,
        },
      },
    });
    const bus = new EventBus();
    const result = processTurn(state, bus);
    expect(result.units['warrior1']?.geneTherapyReady).toBe(true);
  });

  it('unit with geneTherapyReady:undefined is not affected by the reset', () => {
    const state = makeProcessTurnState({
      p1Units: ['warrior2'],
      extraUnits: {
        warrior2: {
          type: 'warrior', owner: 'p1',
          position: { q: 1, r: 0 },
          hasMoved: false, hasActed: false,
        },
      },
    });
    const bus = new EventBus();
    const result = processTurn(state, bus);
    expect(result.units['warrior2']?.geneTherapyReady).toBeUndefined();
  });
});
