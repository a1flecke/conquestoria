import { describe, it, expect } from 'vitest';
import {
  getCivAvailableResources,
  isResourceTileDeniedByHostileOccupation,
  canEstablishOutpost,
  performEstablishOutpost,
  canBuyResourceAccess,
  performBuyResourceAccess,
} from '@/systems/resource-acquisition-system';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';

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
  it('optionally denies an improved resource occupied by a hostile world unit', () => {
    const state = makeState({
      tileResource: 'silk',
      tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0,
      completed: ['irrigation'],
    });
    state.units = {
      raider: {
        id: 'raider',
        type: 'warrior',
        owner: 'barbarian',
        position: { q: 4, r: 3 },
      } as never,
    };

    expect(isResourceTileDeniedByHostileOccupation(state, 'player', { q: 4, r: 3 })).toBe(true);
    expect(getCivAvailableResources(state, 'player').has('silk')).toBe(true);
    expect(getCivAvailableResources(
      state,
      'player',
      { hostileOccupationEnabled: true },
    ).has('silk')).toBe(false);

    delete state.units.raider;
    expect(getCivAvailableResources(
      state,
      'player',
      { hostileOccupationEnabled: true },
    ).has('silk')).toBe(true);
  });

  it('does not deny resources for cargo, neutral, or friendly occupants', () => {
    const state = makeState({
      tileResource: 'silk',
      tileImprovement: 'plantation',
      tileImprovementTurnsLeft: 0,
      completed: ['irrigation'],
    });
    state.units = {
      friendly: {
        id: 'friendly',
        type: 'warrior',
        owner: 'player',
        position: { q: 4, r: 3 },
      } as never,
      neutral: {
        id: 'neutral',
        type: 'warrior',
        owner: 'ai-1',
        position: { q: 4, r: 3 },
      } as never,
      cargo: {
        id: 'cargo',
        type: 'warrior',
        owner: 'barbarian',
        position: { q: 4, r: 3 },
        transportId: 'transport',
      } as never,
    };

    expect(isResourceTileDeniedByHostileOccupation(state, 'player', { q: 4, r: 3 })).toBe(false);
  });

  it('does not deny an unimproved or city-center resource', () => {
    const unimproved = makeState({
      tileResource: 'silk',
      tileImprovement: 'none',
      completed: ['irrigation'],
    });
    unimproved.units = {
      raider: {
        id: 'raider',
        type: 'warrior',
        owner: 'barbarian',
        position: { q: 4, r: 3 },
      } as never,
    };
    expect(isResourceTileDeniedByHostileOccupation(
      unimproved,
      'player',
      { q: 4, r: 3 },
    )).toBe(false);

    const cityCenter = makeState({
      tileResource: 'horses',
      tileIsCity: true,
      completed: ['animal-husbandry'],
    });
    cityCenter.units = {
      raider: {
        id: 'raider',
        type: 'warrior',
        owner: 'barbarian',
        position: { q: 3, r: 3 },
      } as never,
    };
    expect(getCivAvailableResources(
      cityCenter,
      'player',
      { hostileOccupationEnabled: true },
    ).has('horses')).toBe(true);
  });

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
      elevation: 'lowland',
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

  it('does NOT grant the resource when the owning civ lacks the required tech', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 0,
      playerTech: [], // no bronze-working
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(false);
  });

});

// ── performEstablishOutpost tests ────────────────────────────────────────────

function makeStateWithExpedition(opts: {
  resource: string | null;
  improvement: string;
  tileInCityTerritory: boolean;
  civTechs: string[];
}): { state: GameState; unitId: string } {
  const civId = 'player';
  const pos = { q: 5, r: 5 };
  const tileKey = hexKey(pos);
  const cityPos = { q: 3, r: 3 };

  const resourceTile: Record<string, unknown> = {
    coord: pos,
    terrain: 'hills',
    elevation: 'flat',
    resource: opts.resource,
    improvement: opts.improvement,
    improvementTurnsLeft: 0,
    owner: opts.tileInCityTerritory ? civId : null,
    hasRiver: false,
    wonder: null,
  };

  const ownedTiles = opts.tileInCityTerritory
    ? [cityPos, pos]
    : [cityPos];

  const unitId = 'unit-test-expedition';

  const state = {
    map: {
      width: 20, height: 20, wrapsHorizontally: false, rivers: [],
      tiles: {
        '3,3': {
          coord: cityPos, terrain: 'grassland', elevation: 'lowland',
          resource: null, improvement: 'none', improvementTurnsLeft: 0,
          owner: null, hasRiver: false, wonder: null,
        },
        [tileKey]: resourceTile,
      },
    },
    cities: {
      'city-1': {
        id: 'city-1', name: 'TestCity', owner: civId, position: cityPos,
        ownedTiles,
        population: 1, food: 0, production: 0, gold: 0,
        buildings: [], productionQueue: [], workedTiles: [], specialistSlots: [],
        garrisonUnitId: null, hp: 100, maxHp: 100,
      },
    },
    civilizations: {
      [civId]: {
        id: civId, cities: ['city-1'],
        techState: {
          completed: opts.civTechs,
          currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {},
        },
        units: [unitId],
      },
    },
    units: {
      [unitId]: {
        id: unitId, type: 'expedition', owner: civId, position: { ...pos },
        movementPointsLeft: 3, health: 100, experience: 0,
        hasMoved: false, hasActed: false, isResting: false,
      },
    },
  } as unknown as GameState;

  return { state, unitId };
}

describe('performEstablishOutpost', () => {
  it('sets tile.improvement = resource_outpost, improvementTurnsLeft = 2, owner = civId; removes unit', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: ['bronze-working'],
    });
    const newState = performEstablishOutpost(state, unitId);
    const tile = newState.map.tiles[hexKey({ q: 5, r: 5 })];
    expect(tile.improvement).toBe('resource_outpost');
    expect(tile.improvementTurnsLeft).toBe(2);
    expect(tile.owner).toBe('player');
    expect(newState.units[unitId]).toBeUndefined();
    expect(newState.civilizations.player.units).not.toContain(unitId);
  });

  it('is unavailable when tile is already in civ city territory (canEstablishOutpost = false)', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: true,
      civTechs: ['bronze-working'],
    });
    expect(canEstablishOutpost(state, unitId)).toBe(false);
  });

  it('is unavailable when tile has no resource', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: null,
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: ['foraging'],
    });
    expect(canEstablishOutpost(state, unitId)).toBe(false);
  });

  it('is unavailable when civ lacks the enabling tech', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: [],
    });
    expect(canEstablishOutpost(state, unitId)).toBe(false);
  });

  it('is unavailable when tile already has an improvement (canEstablishOutpost = false)', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'mine',         // tile already improved — outpost blocked
      tileInCityTerritory: false,
      civTechs: ['bronze-working'],
    });
    expect(canEstablishOutpost(state, unitId)).toBe(false);
  });

  it('returns a new state object (immutability)', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: ['bronze-working'],
    });
    const newState = performEstablishOutpost(state, unitId);
    expect(newState).not.toBe(state);
  });

  it('sets improvementOwner so processImprovements can log completion to the civ', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: ['bronze-working'],
    });
    const newState = performEstablishOutpost(state, unitId);
    const tile = newState.map.tiles[hexKey({ q: 5, r: 5 })];
    expect(tile.improvementOwner).toBe('player');
  });
});

describe('getCivAvailableResources — pass 3: purchased resources', () => {
  function makeStateWithPurchase(overrides: {
    civId?: string;
    resource?: string;
    expiresOnTurn?: number;
    currentTurn?: number;
    completed?: string[];
    noMarketplace?: boolean;
  }): GameState {
    const {
      civId = 'player',
      resource = 'silk',
      expiresOnTurn = 15,
      currentTurn = 10,
      completed = ['irrigation'],  // silk requires 'irrigation'
      noMarketplace = false,
    } = overrides;

    return {
      turn: currentTurn,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      cities: {},
      civilizations: {
        'player': {
          id: 'player',
          cities: [],
          techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        } as unknown as never,
      },
      marketplace: noMarketplace ? undefined : {
        prices: {},
        priceHistory: {},
        fashionable: null,
        fashionTurnsLeft: 0,
        tradeRoutes: [],
        purchasedResources: [{ civId, resource: resource as never, expiresOnTurn }],
      },
    } as unknown as GameState;
  }

  it('grants resource when purchasedResources entry matches civId and has not expired', () => {
    const state = makeStateWithPurchase({ civId: 'player', expiresOnTurn: 15, currentTurn: 10 });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(true);
  });

  it('does NOT grant resource when purchasedResources entry belongs to a different civ (hot-seat isolation)', () => {
    const state = makeStateWithPurchase({ civId: 'enemy', expiresOnTurn: 15, currentTurn: 10 });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('does NOT grant resource when purchasedResources entry has expired (expiresOnTurn <= state.turn)', () => {
    const state = makeStateWithPurchase({ civId: 'player', expiresOnTurn: 10, currentTurn: 10 });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('does NOT crash and returns empty set when marketplace is absent (old save without purchasedResources)', () => {
    const state = makeStateWithPurchase({ civId: 'player', expiresOnTurn: 15, currentTurn: 10, noMarketplace: true });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });
});

describe('canBuyResourceAccess', () => {
  // iron: tech='bronze-working', basePrice=8, requiredImprovement='mine'
  function makeBuyState(overrides: {
    buyerGold?: number;
    sellerHasResource?: boolean;
    buyerAlreadyOwns?: boolean;
    atWar?: boolean;
    relationshipScore?: number;
    metSeller?: boolean;
  }): GameState {
    const {
      buyerGold = 100,
      sellerHasResource = true,
      buyerAlreadyOwns = false,
      atWar = false,
      relationshipScore = 10,
      metSeller = true,
    } = overrides;

    const tiles: Record<string, unknown> = {
      '0,0': {
        coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
        resource: null, improvement: 'none', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, owner: 'buyer',
      },
    };
    if (sellerHasResource) {
      tiles['5,5'] = {
        coord: { q: 5, r: 5 }, terrain: 'hills', elevation: 'lowland',
        resource: 'iron', improvement: 'mine', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, owner: 'seller',
      };
    }

    const buyerDiplomacy = {
      relationships: metSeller ? { seller: relationshipScore } : {} as Record<string, number>,
      treaties: [],
      events: [],
      atWarWith: atWar ? ['seller'] : [] as string[],
      treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
    };

    const prices: Record<string, number> = {};
    const priceHistory: Record<string, number[]> = {};
    for (const r of RESOURCE_DEFINITIONS) { prices[r.id] = r.basePrice; priceHistory[r.id] = [r.basePrice]; }

    return {
      turn: 5,
      map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
      cities: {
        'buyer-city': {
          id: 'buyer-city', owner: 'buyer', position: { q: 0, r: 0 },
          ownedTiles: buyerAlreadyOwns ? [{ q: 5, r: 5 }] : [{ q: 0, r: 0 }],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
        'seller-city': {
          id: 'seller-city', owner: 'seller', position: { q: 5, r: 5 },
          ownedTiles: sellerHasResource ? [{ q: 5, r: 5 }] : [],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
      },
      civilizations: {
        buyer: {
          id: 'buyer', cities: ['buyer-city'], units: [], gold: buyerGold,
          techState: { completed: ['bronze-working', 'trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: buyerDiplomacy,
        } as unknown as never,
        seller: {
          id: 'seller', cities: ['seller-city'], units: [], gold: 0,
          techState: { completed: ['bronze-working'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: atWar ? ['buyer'] : [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        } as unknown as never,
      },
      marketplace: {
        prices, priceHistory, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [],
      },
    } as unknown as GameState;
  }

  it('returns true when all conditions are met', () => {
    expect(canBuyResourceAccess(makeBuyState({}), 'buyer', 'seller', 'iron')).toBe(true);
  });

  it('returns false when at war', () => {
    expect(canBuyResourceAccess(makeBuyState({ atWar: true }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when relationship score is negative', () => {
    expect(canBuyResourceAccess(makeBuyState({ relationshipScore: -5 }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when seller is not in buyer relationships (never met)', () => {
    expect(canBuyResourceAccess(makeBuyState({ metSeller: false }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when seller does not have the resource', () => {
    expect(canBuyResourceAccess(makeBuyState({ sellerHasResource: false }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when buyer already owns the resource', () => {
    expect(canBuyResourceAccess(makeBuyState({ buyerAlreadyOwns: true }), 'buyer', 'seller', 'iron')).toBe(false);
  });
});

describe('performBuyResourceAccess', () => {
  function makeBuyStateForPerform(): GameState {
    const prices: Record<string, number> = {};
    const priceHistory: Record<string, number[]> = {};
    for (const r of RESOURCE_DEFINITIONS) { prices[r.id] = r.basePrice; priceHistory[r.id] = [r.basePrice]; }

    return {
      turn: 5,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      cities: {},
      civilizations: {
        buyer: {
          id: 'buyer', cities: [], units: [], gold: 100,
          techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        } as unknown as never,
      },
      marketplace: { prices, priceHistory, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [] },
    } as unknown as GameState;
  }

  it('deducts 3× basePrice gold from the buyer immediately (iron basePrice=8 → cost=24)', () => {
    const state = makeBuyStateForPerform();
    const newState = performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    expect(newState.civilizations['buyer'].gold).toBe(76); // 100 - 24
  });

  it('adds purchasedResources entry with correct civId, resource, and expiresOnTurn = turn + 10', () => {
    const state = makeBuyStateForPerform();
    const newState = performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    const entries = newState.marketplace!.purchasedResources ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ civId: 'buyer', resource: 'iron', expiresOnTurn: 15 }); // 5 + 10
  });

  it('does not mutate the original state (immutable spread-copy)', () => {
    const state = makeBuyStateForPerform();
    performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    expect(state.civilizations['buyer'].gold).toBe(100);
    expect(state.marketplace!.purchasedResources).toHaveLength(0);
  });

  it('returns state unchanged when marketplace is absent', () => {
    const state = makeBuyStateForPerform();
    (state as unknown as Record<string, unknown>).marketplace = undefined;
    const newState = performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    expect(newState.civilizations['buyer'].gold).toBe(100); // gold unchanged
  });
});
