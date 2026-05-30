import { describe, it, expect } from 'vitest';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import type { GameState } from '@/core/types';

// Minimal GameState builder — only the fields getCivAvailableResources reads.
function makeTechState(completed: string[] = []) {
  return {
    completed,
    currentResearch: null,
    researchQueue: [],
    researchProgress: 0,
    trackPriorities: {} as never,
  };
}

function makeState(overrides: {
  tileResource?: string | null;
  tileImprovement?: string;
  tileImprovementTurnsLeft?: number;
  tileTerrain?: string;
  tileIsCity?: boolean;
  completed?: string[];
  civMissing?: boolean;
  cityMissing?: boolean;
}): GameState {
  const {
    tileResource = null,
    tileImprovement = 'none',
    tileImprovementTurnsLeft = 0,
    tileTerrain = 'grassland',
    tileIsCity = false,
    completed = [],
    civMissing = false,
    cityMissing = false,
  } = overrides;

  const cityPos = { q: 3, r: 3 };
  const tileCoord = tileIsCity ? cityPos : { q: 4, r: 3 };

  const tiles: Record<string, unknown> = {
    '3,3': {
      coord: cityPos,
      terrain: 'grassland',
      elevation: 'lowland',
      resource: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      owner: null,
    },
  };

  if (!tileIsCity) {
    tiles['4,3'] = {
      coord: tileCoord,
      terrain: tileTerrain,
      elevation: 'lowland',
      resource: tileResource,
      improvement: tileImprovement,
      improvementTurnsLeft: tileImprovementTurnsLeft,
      hasRiver: false,
      wonder: null,
      owner: null,
    };
  } else {
    // Overwrite city tile with resource data
    tiles['3,3'] = {
      coord: cityPos,
      terrain: tileTerrain,
      elevation: 'lowland',
      resource: tileResource,
      improvement: tileImprovement,
      improvementTurnsLeft: tileImprovementTurnsLeft,
      hasRiver: false,
      wonder: null,
      owner: null,
    };
  }

  const ownedTiles = tileIsCity ? [cityPos] : [cityPos, tileCoord];

  return {
    map: { width: 10, height: 10, tiles, wrapsHorizontally: false, rivers: [] },
    cities: cityMissing ? {} : {
      'city-1': {
        id: 'city-1',
        name: 'TestCity',
        owner: 'player',
        position: cityPos,
        ownedTiles,
        population: 1,
        food: 0,
        production: 0,
        gold: 0,
        buildings: [],
        productionQueue: [],
        workedTiles: [],
        specialistSlots: [],
        garrisonUnitId: null,
        hp: 100,
        maxHp: 100,
      } as unknown as never,
    },
    civilizations: civMissing ? {} : {
      'player': {
        id: 'player',
        cities: ['city-1'],
        techState: makeTechState(completed),
      } as unknown as never,
    },
  } as unknown as GameState;
}

describe('getCivAvailableResources', () => {
  it('returns empty set for unknown civId', () => {
    const state = makeState({});
    const result = getCivAvailableResources(state, 'ghost-civ');
    expect(result.size).toBe(0);
  });

  it('returns empty set when tile has no resource', () => {
    const state = makeState({ tileResource: null, completed: ['irrigation'] });
    const result = getCivAvailableResources(state, 'player');
    expect(result.size).toBe(0);
  });

  it('returns empty set when civ lacks the required tech', () => {
    // silk requires 'irrigation' — without it, not available
    const state = makeState({
      tileResource: 'silk',
      tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0,
      completed: [],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('returns empty set when tech is known but improvement is wrong type', () => {
    // silk requires plantation, but tile has mine
    const state = makeState({
      tileResource: 'silk',
      tileImprovement: 'mine',
      tileImprovementTurnsLeft: 0,
      completed: ['irrigation'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('returns empty set when tech is known and correct improvement but still under construction', () => {
    const state = makeState({
      tileResource: 'silk',
      tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 2,
      completed: ['irrigation'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('returns empty set when tech is known but no improvement at all on off-center tile', () => {
    const state = makeState({
      tileResource: 'silk',
      tileImprovement: 'none',
      tileImprovementTurnsLeft: 0,
      completed: ['irrigation'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('returns resource when tech is known and completed improvement exists on off-center tile', () => {
    const state = makeState({
      tileResource: 'silk',
      tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0,
      completed: ['irrigation'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(true);
  });

  it('grants resource on city-center tile with tech alone (no improvement needed)', () => {
    // tile IS the city center — improvement gate does not apply
    const state = makeState({
      tileResource: 'horses',
      tileImprovement: 'none',
      tileImprovementTurnsLeft: 0,
      tileTerrain: 'plains',
      tileIsCity: true,
      completed: ['animal-husbandry'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('horses')).toBe(true);
  });

  it('does NOT grant city-center resource without the required tech', () => {
    const state = makeState({
      tileResource: 'horses',
      tileImprovement: 'none',
      tileImprovementTurnsLeft: 0,
      tileTerrain: 'plains',
      tileIsCity: true,
      completed: [],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('horses')).toBe(false);
  });

  it('handles stone (mountain/quarry combination)', () => {
    const state = makeState({
      tileResource: 'stone',
      tileImprovement: 'quarry',
      tileImprovementTurnsLeft: 0,
      tileTerrain: 'mountain',
      completed: ['gathering'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('stone')).toBe(true);
  });

  it('handles furs (camp on forest)', () => {
    const state = makeState({
      tileResource: 'furs',
      tileImprovement: 'camp',
      tileImprovementTurnsLeft: 0,
      tileTerrain: 'forest',
      completed: ['foraging'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('furs')).toBe(true);
  });

  it('handles multiple resources across multiple tiles', () => {
    // Build a state manually with two off-center resource tiles
    const state: GameState = {
      map: {
        width: 10,
        height: 10,
        wrapsHorizontally: false,
        rivers: [],
        tiles: {
          '3,3': { coord: { q: 3, r: 3 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null },
          '4,3': { coord: { q: 4, r: 3 }, terrain: 'grassland', elevation: 'lowland', resource: 'silk', improvement: 'plantation', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null },
          '5,3': { coord: { q: 5, r: 3 }, terrain: 'plains',    elevation: 'lowland', resource: 'horses', improvement: 'pasture', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null },
        },
      } as unknown as never,
      cities: {
        'city-1': {
          id: 'city-1',
          name: 'TestCity',
          owner: 'player',
          position: { q: 3, r: 3 },
          ownedTiles: [{ q: 3, r: 3 }, { q: 4, r: 3 }, { q: 5, r: 3 }],
          population: 1,
          food: 0,
          production: 0,
          gold: 0,
          buildings: [],
          productionQueue: [],
          workedTiles: [],
          specialistSlots: [],
          garrisonUnitId: null,
          hp: 100,
          maxHp: 100,
        } as unknown as never,
      },
      civilizations: {
        'player': {
          id: 'player',
          cities: ['city-1'],
          techState: makeTechState(['irrigation', 'animal-husbandry']),
        } as unknown as never,
      },
    } as unknown as GameState;

    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(true);
    expect(result.has('horses')).toBe(true);
    expect(result.size).toBe(2);
  });
});

describe('stone on mountain resource accessibility (issue #280)', () => {
  it('stone on a mountain tile is accessible when tile is owned, has a completed quarry, and tech is researched', () => {
    const state = makeState({
      tileResource: 'stone',
      tileTerrain: 'mountain',
      tileImprovement: 'quarry',
      tileImprovementTurnsLeft: 0,
      completed: ['gathering'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('stone')).toBe(true);
  });

  it('stone on a mountain tile is NOT accessible without a completed quarry', () => {
    const state = makeState({
      tileResource: 'stone',
      tileTerrain: 'mountain',
      tileImprovement: 'none',
      tileImprovementTurnsLeft: 0,
      completed: ['gathering'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('stone')).toBe(false);
  });

  it('stone on a hills tile is accessible when tile is owned, has a completed quarry, and tech is researched', () => {
    const state = makeState({
      tileResource: 'stone',
      tileTerrain: 'hills',
      tileImprovement: 'quarry',
      tileImprovementTurnsLeft: 0,
      completed: ['gathering'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('stone')).toBe(true);
  });
});

describe('outpost pass (Pillar 2)', () => {
  function makeStateWithOutpost(opts: {
    outpostOwner: string;
    resourceId: string;
    improvementTurnsLeft: number;
    playerTech: string[];
    outpostImprovement?: string;
  }): GameState {
    const outpostTile = {
      coord: { q: 10, r: 10 },
      terrain: 'hills',
      elevation: 'flat',
      resource: opts.resourceId,
      improvement: opts.outpostImprovement ?? 'resource_outpost',
      improvementTurnsLeft: opts.improvementTurnsLeft,
      owner: opts.outpostOwner,
      hasRiver: false,
      wonder: null,
    };

    return {
      map: {
        width: 20, height: 20,
        wrapsHorizontally: false,
        rivers: [],
        tiles: {
          '3,3': { coord: { q: 3, r: 3 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, owner: null, hasRiver: false, wonder: null },
          '10,10': outpostTile,
        },
      },
      cities: {
        'city-player': {
          id: 'city-player', name: 'PlayerCity', owner: 'player',
          position: { q: 3, r: 3 },
          ownedTiles: [{ q: 3, r: 3 }],
          population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], workedTiles: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
        'city-ai1': {
          id: 'city-ai1', name: 'AI1City', owner: 'ai-1',
          position: { q: 5, r: 5 },
          ownedTiles: [{ q: 5, r: 5 }],
          population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], workedTiles: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
      },
      civilizations: {
        'player': {
          id: 'player',
          cities: ['city-player'],
          techState: { completed: opts.playerTech, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        },
        'ai-1': {
          id: 'ai-1',
          cities: ['city-ai1'],
          techState: { completed: opts.playerTech, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        },
      },
    } as unknown as GameState;
  }

  it('grants the resource when outpost is complete (improvementTurnsLeft === 0)', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 0,
      playerTech: ['bronze-working'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(true);
  });

  it('does NOT grant the resource when outpost is still in progress (improvementTurnsLeft > 0)', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 1,
      playerTech: ['bronze-working'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(false);
  });

  it('does NOT grant the resource when outpost is pillaged (improvement = none)', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 0,
      playerTech: ['bronze-working'],
      outpostImprovement: 'none',
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(false);
  });

  it('does NOT grant the resource to a different civ', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 0,
      playerTech: ['bronze-working'],
    });
    const result = getCivAvailableResources(state, 'ai-1');
    expect(result.has('iron')).toBe(false);
  });
});
