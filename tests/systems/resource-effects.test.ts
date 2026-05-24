import { describe, it, expect } from 'vitest';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import {
  getCivAvailableResources,
  getCivResourceYieldBonus,
  getCivHappinessFromResources,
} from '@/systems/resource-acquisition-system';
import type { GameState } from '@/core/types';

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeTechState(completed: string[] = []) {
  return {
    completed,
    currentResearch: null,
    researchQueue: [],
    researchProgress: 0,
    trackPriorities: {} as never,
  };
}

/**
 * Builds a minimal GameState where 'player' owns a single city at (3,3) and
 * one additional resource tile at (4,3) (unless tileIsCity=true).
 */
function makeState(overrides: {
  tileResource?: string | null;
  tileImprovement?: string;
  tileImprovementTurnsLeft?: number;
  tileTerrain?: string;
  tileIsCity?: boolean;
  completed?: string[];
}): GameState {
  const {
    tileResource = null,
    tileImprovement = 'none',
    tileImprovementTurnsLeft = 0,
    tileTerrain = 'grassland',
    tileIsCity = false,
    completed = [],
  } = overrides;

  const cityPos = { q: 3, r: 3 };
  const tileCoord = tileIsCity ? cityPos : { q: 4, r: 3 };

  const tiles: Record<string, unknown> = {
    '3,3': {
      coord: cityPos, terrain: 'grassland', elevation: 'lowland',
      resource: tileIsCity ? tileResource : null,
      improvement: tileIsCity ? tileImprovement : 'none',
      improvementTurnsLeft: tileIsCity ? tileImprovementTurnsLeft : 0,
      hasRiver: false, wonder: null, owner: null,
    },
  };

  if (!tileIsCity) {
    tiles['4,3'] = {
      coord: tileCoord, terrain: tileTerrain, elevation: 'lowland',
      resource: tileResource, improvement: tileImprovement,
      improvementTurnsLeft: tileImprovementTurnsLeft,
      hasRiver: false, wonder: null, owner: null,
    };
  }

  const ownedTiles = tileIsCity ? [cityPos] : [cityPos, tileCoord];

  return {
    map: { width: 10, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: {
      'city-1': {
        id: 'city-1', name: 'TestCity', owner: 'player',
        position: cityPos, ownedTiles,
        population: 1, food: 0, production: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [],
        specialistSlots: [], garrisonUnitId: null, hp: 100, maxHp: 100,
      } as unknown as never,
    },
    civilizations: {
      'player': {
        id: 'player',
        cities: ['city-1'],
        techState: makeTechState(completed),
      } as unknown as never,
    },
  } as unknown as GameState;
}

/** State with two off-center tiles having different resources */
function makeMultiResourceState(resources: Array<{
  resource: string;
  improvement: string;
  tech: string;
  terrain: string;
}>): GameState {
  const cityPos = { q: 3, r: 3 };
  const tiles: Record<string, unknown> = {
    '3,3': {
      coord: cityPos, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'none', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: null,
    },
  };
  const ownedTiles = [cityPos];
  const completed: string[] = [];

  resources.forEach((r, i) => {
    const coord = { q: 4 + i, r: 3 };
    tiles[`${coord.q},${coord.r}`] = {
      coord, terrain: r.terrain, elevation: 'lowland',
      resource: r.resource, improvement: r.improvement,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
    };
    ownedTiles.push(coord);
    if (!completed.includes(r.tech)) completed.push(r.tech);
  });

  return {
    map: { width: 10, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: {
      'city-1': {
        id: 'city-1', name: 'TestCity', owner: 'player',
        position: cityPos, ownedTiles,
        population: 1, food: 0, production: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [],
        specialistSlots: [], garrisonUnitId: null, hp: 100, maxHp: 100,
      } as unknown as never,
    },
    civilizations: {
      'player': {
        id: 'player',
        cities: ['city-1'],
        techState: makeTechState(completed),
      } as unknown as never,
    },
  } as unknown as GameState;
}

// ── Catalog test ─────────────────────────────────────────────────────────────

describe('RESOURCE_DEFINITIONS catalog', () => {
  it('test 1: every entry has effect defined (not undefined — may be null)', () => {
    for (const def of RESOURCE_DEFINITIONS) {
      expect(def.effect, `${def.id} is missing effect field`).not.toBeUndefined();
    }
  });
});

// ── getCivHappinessFromResources ──────────────────────────────────────────────

describe('getCivHappinessFromResources', () => {
  it('test 2: returns 1 for a civ owning silk (plantation complete, irrigation known)', () => {
    const state = makeState({
      tileResource: 'silk', tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0, completed: ['irrigation'],
    });
    expect(getCivHappinessFromResources(state, 'player')).toBe(1);
  });

  it('test 7: three silk tiles → returns 1 (same-resource non-stacking)', () => {
    const cityPos = { q: 3, r: 3 };
    const silkTile = (q: number) => ({
      coord: { q, r: 3 }, terrain: 'grassland', elevation: 'lowland',
      resource: 'silk', improvement: 'plantation', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: null,
    });
    const state: GameState = {
      map: {
        width: 10, height: 10, wrapsHorizontally: false, rivers: [],
        tiles: {
          '3,3': { coord: cityPos, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null },
          '4,3': silkTile(4),
          '5,3': silkTile(5),
          '6,3': silkTile(6),
        },
      } as unknown as never,
      cities: {
        'city-1': {
          id: 'city-1', name: 'TestCity', owner: 'player',
          position: cityPos,
          ownedTiles: [cityPos, { q: 4, r: 3 }, { q: 5, r: 3 }, { q: 6, r: 3 }],
          population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], workedTiles: [],
          specialistSlots: [], garrisonUnitId: null, hp: 100, maxHp: 100,
        } as unknown as never,
      },
      civilizations: {
        'player': {
          id: 'player', cities: ['city-1'],
          techState: makeTechState(['irrigation']),
        } as unknown as never,
      },
    } as unknown as GameState;

    expect(getCivHappinessFromResources(state, 'player')).toBe(1);
  });

  it('test 8: silk AND wine → returns 2 (different resources accumulate)', () => {
    const state = makeMultiResourceState([
      { resource: 'silk',  improvement: 'plantation', tech: 'irrigation', terrain: 'grassland' },
      { resource: 'wine',  improvement: 'plantation', tech: 'pottery',    terrain: 'plains'    },
    ]);
    expect(getCivHappinessFromResources(state, 'player')).toBe(2);
  });

  it('test 10a: civ with no owned resources → returns 0', () => {
    const state = makeState({ tileResource: null });
    expect(getCivHappinessFromResources(state, 'player')).toBe(0);
  });

  it('test 11a: copper/iron/horses/stone (null effect) → returns 0', () => {
    for (const resourceId of ['copper', 'iron', 'horses', 'stone'] as const) {
      const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId)!;
      const terrain = Array.isArray(def.terrain) ? def.terrain[0] : def.terrain;
      const state = makeState({
        tileResource: resourceId,
        tileImprovement: def.requiredImprovement,
        tileImprovementTurnsLeft: 0,
        tileTerrain: terrain,
        completed: [def.tech],
      });
      expect(getCivHappinessFromResources(state, 'player'), `${resourceId} should give 0 happiness`).toBe(0);
    }
  });

  it('test 13: improvement destroyed (improvementTurnsLeft > 0) → returns 0', () => {
    const state = makeState({
      tileResource: 'silk', tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 2, completed: ['irrigation'],
    });
    expect(getCivHappinessFromResources(state, 'player')).toBe(0);
  });
});

// ── getCivResourceYieldBonus ──────────────────────────────────────────────────

describe('getCivResourceYieldBonus', () => {
  it('test 3: gems → { gold: 1, food: 0, production: 0, science: 0 }', () => {
    const state = makeState({
      tileResource: 'gems', tileImprovement: 'mine',
      tileImprovementTurnsLeft: 0, tileTerrain: 'hills',
      completed: ['mining-tech'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(1);
    expect(bonus.food).toBe(0);
    expect(bonus.production).toBe(0);
    expect(bonus.science).toBe(0);
  });

  it('test 4: sheep → { production: 1, food: 0, gold: 0 }', () => {
    const state = makeState({
      tileResource: 'sheep', tileImprovement: 'pasture',
      tileImprovementTurnsLeft: 0, tileTerrain: 'plains',
      completed: ['animal-husbandry'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.production).toBe(1);
    expect(bonus.food).toBe(0);
    expect(bonus.gold).toBe(0);
  });

  it('test 5: cattle → { food: 1, gold: 0, production: 0 }', () => {
    const state = makeState({
      tileResource: 'cattle', tileImprovement: 'pasture',
      tileImprovementTurnsLeft: 0, tileTerrain: 'plains',
      completed: ['domestication'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.food).toBe(1);
    expect(bonus.gold).toBe(0);
  });

  it('test 6: salt → { gold: 1 }', () => {
    const state = makeState({
      tileResource: 'salt', tileImprovement: 'mine',
      tileImprovementTurnsLeft: 0, tileTerrain: 'hills',
      completed: ['pottery'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(1);
  });

  it('test 9: gems AND silver → { gold: 2 } (different resources accumulate)', () => {
    const state = makeMultiResourceState([
      { resource: 'gems',   improvement: 'mine', tech: 'mining-tech', terrain: 'hills' },
      { resource: 'silver', improvement: 'mine', tech: 'mining-tech', terrain: 'hills' },
    ]);
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(2);
  });

  it('test 10b: civ with no resources → all zeros', () => {
    const state = makeState({ tileResource: null });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.food).toBe(0);
    expect(bonus.production).toBe(0);
    expect(bonus.gold).toBe(0);
    expect(bonus.science).toBe(0);
  });

  it('test 11b: copper/iron/horses/stone (null effect) → all zeros', () => {
    for (const resourceId of ['copper', 'iron', 'horses', 'stone'] as const) {
      const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId)!;
      const terrain = Array.isArray(def.terrain) ? def.terrain[0] : def.terrain;
      const state = makeState({
        tileResource: resourceId,
        tileImprovement: def.requiredImprovement,
        tileImprovementTurnsLeft: 0,
        tileTerrain: terrain,
        completed: [def.tech],
      });
      const bonus = getCivResourceYieldBonus(state, 'player');
      expect(bonus.gold, `${resourceId} should give 0 gold`).toBe(0);
      expect(bonus.production, `${resourceId} should give 0 production`).toBe(0);
      expect(bonus.food, `${resourceId} should give 0 food`).toBe(0);
    }
  });

  it('test 12: happiness resources excluded from yield bonus (silk gives 0 gold/prod/food)', () => {
    const state = makeState({
      tileResource: 'silk', tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0, completed: ['irrigation'],
    });
    const bonus = getCivResourceYieldBonus(state, 'player');
    expect(bonus.gold).toBe(0);
    expect(bonus.production).toBe(0);
    expect(bonus.food).toBe(0);
    expect(bonus.science).toBe(0);
  });
});

// ── Save compatibility ────────────────────────────────────────────────────────

describe('save compatibility', () => {
  it('test 30: effect is static data on RESOURCE_DEFINITIONS, not stored in GameState', () => {
    const state = makeState({ tileResource: null });
    expect(() => getCivHappinessFromResources(state, 'player')).not.toThrow();
    expect(() => getCivResourceYieldBonus(state, 'player')).not.toThrow();
  });
});
