import { describe, expect, it } from 'vitest';
import type { GameState, HexCoord } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  assignCityFocus,
  calculateWorkedTileYield,
  calculateProjectedCityYields,
  getWorkableTilesForCity,
  isWorkableTerrain,
  normalizeCityWorkAfterTerritoryChange,
  normalizeWorkedTilesForCity,
  setCityWorkedTile,
} from '@/systems/city-work-system';
import { hexKey } from '@/systems/hex-utils';
import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function addCity(state: GameState, owner: string, position: HexCoord) {
  const city = foundCity(owner, position, state.map, state.idCounters);
  state.cities[city.id] = city;
  state.civilizations[owner]?.cities.push(city.id);
  for (const coord of city.ownedTiles) {
    state.map.tiles[hexKey(coord)].owner = owner;
  }
  return city;
}

describe('city worked tile eligibility', () => {
  it('excludes the city center from workable citizen tiles', () => {
    const state = createNewGame(undefined, 'city-work-center');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const workable = getWorkableTilesForCity(state, city.id);
    expect(workable.map(entry => entry.coord)).not.toContainEqual(city.position);
  });

  it('includes controlled coast tiles as workable water', () => {
    const state = createNewGame(undefined, 'city-work-water');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const coast = Object.values(state.map.tiles).find(tile => tile.terrain === 'coast')!;
    state.map.tiles[hexKey(coast.coord)].owner = 'player';
    state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, coast.coord] };
    const workable = getWorkableTilesForCity(state, city.id);
    expect(workable).toContainEqual(expect.objectContaining({ coord: coast.coord, isWater: true }));
  });

  it('does not treat ocean as workable before later ocean-work eligibility exists', () => {
    const state = createNewGame(undefined, 'city-work-ocean');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const ocean = Object.values(state.map.tiles).find(tile => tile.terrain === 'ocean')!;
    state.map.tiles[hexKey(ocean.coord)].owner = 'player';
    state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, ocean.coord] };
    const workable = getWorkableTilesForCity(state, city.id);
    expect(workable.map(entry => entry.coord)).not.toContainEqual(ocean.coord);
  });

  // MR10: eternal_storm (an ocean-terrain natural wonder) could never be worked at all
  // under the blanket ocean exclusion — its +3 science was unearnable. A tile bearing a
  // natural wonder must be workable regardless of terrain.
  it('treats an ocean tile bearing a natural wonder as workable (eternal_storm fix)', () => {
    const state = createNewGame(undefined, 'city-work-ocean-wonder');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const ocean = Object.values(state.map.tiles).find(tile => tile.terrain === 'ocean')!;
    state.map.tiles[hexKey(ocean.coord)] = {
      ...state.map.tiles[hexKey(ocean.coord)],
      owner: 'player',
      wonder: 'eternal_storm',
    };
    state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, ocean.coord] };

    const workable = getWorkableTilesForCity(state, city.id);
    const wonderTile = workable.find(entry =>
      entry.coord.q === ocean.coord.q && entry.coord.r === ocean.coord.r,
    );

    expect(wonderTile).toBeDefined();
    expect(wonderTile?.yield.science).toBeGreaterThanOrEqual(3);
  });

  // MR10 guardrail: every natural wonder's terrain must be workable once claimed, not
  // just the one (eternal_storm) that happened to get caught. Only terrain the wonder
  // sits on needs checking here — every WONDER_DEFINITIONS.validTerrain is real terrain
  // a wonder can actually spawn on.
  it('every natural wonder terrain is workable when a wonder occupies the tile', () => {
    for (const wonder of WONDER_DEFINITIONS) {
      for (const terrain of wonder.validTerrain) {
        expect(
          isWorkableTerrain(terrain, true),
          `${wonder.id} on ${terrain} must be workable once claimed`,
        ).toBe(true);
      }
    }
  });

  it('marks tiles claimed by another city as unavailable', () => {
    const state = createNewGame(undefined, 'city-work-claims');
    const first = addCity(state, 'player', { q: 10, r: 10 });
    const second = addCity(state, 'player', { q: 15, r: 10 });
    const shared = first.ownedTiles.find(coord => !(coord.q === first.position.q && coord.r === first.position.r))!;
    state.map.tiles[hexKey(shared)].owner = 'player';
    state.cities[first.id] = { ...first, workedTiles: [shared] };
    state.cities[second.id] = { ...second, ownedTiles: [...second.ownedTiles, shared] };

    const workable = getWorkableTilesForCity(state, second.id);
    expect(workable).toContainEqual(expect.objectContaining({
      coord: shared,
      claim: expect.objectContaining({ cityId: first.id }),
      available: false,
    }));
  });
});

describe('city focus assignment', () => {
  it('projects focused yields for an empty non-custom worked tile list without mutating state', () => {
    const state = createNewGame(undefined, 'city-work-projected-yields');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const hills = { q: 16, r: 15 };
    state.map.tiles[hexKey(hills)] = {
      ...state.map.tiles[hexKey(hills)],
      coord: hills,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'production',
      workedTiles: [],
      ownedTiles: [city.position, hills],
    };

    const yields = calculateProjectedCityYields(state, city.id);

    expect(yields.production).toBe(3);
    expect(state.cities[city.id].workedTiles).toEqual([]);
  });

  it('calculates lumber camp worked-tile yield', () => {
    const state = createNewGame(undefined, 'city-work-lumber-camp-yield');
    addCity(state, 'player', { q: 15, r: 15 });
    state.map.tiles['1,1'] = {
      coord: { q: 1, r: 1 },
      terrain: 'forest',
      elevation: 'lowland',
      resource: null,
      improvement: 'lumber_camp',
      owner: 'player',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };

    const yields = calculateWorkedTileYield(state, { q: 1, r: 1 });

    expect(yields.production).toBeGreaterThanOrEqual(3);
  });

  it('calculates watermill worked-tile yield', () => {
    const state = createNewGame(undefined, 'city-work-watermill-yield');
    addCity(state, 'player', { q: 15, r: 15 });
    state.map.tiles['1,1'] = {
      coord: { q: 1, r: 1 },
      terrain: 'plains',
      elevation: 'lowland',
      resource: null,
      improvement: 'watermill',
      owner: 'player',
      improvementTurnsLeft: 0,
      hasRiver: true,
      wonder: null,
    };

    const yields = calculateWorkedTileYield(state, { q: 1, r: 1 });

    expect(yields.food).toBeGreaterThanOrEqual(2);
    expect(yields.production).toBeGreaterThanOrEqual(2);
  });

  it('assigns food focus to the highest-food unclaimed tiles up to population', () => {
    const state = createNewGame(undefined, 'city-work-food-focus');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    state.cities[city.id] = { ...city, population: 2 };

    const result = assignCityFocus(state, city.id, 'food');
    const focused = result.state.cities[city.id];

    expect(focused.focus).toBe('food');
    expect(focused.workedTiles).toHaveLength(2);
    expect(focused.workedTiles).not.toContainEqual(city.position);
  });

  it('uses natural wonder yields when scoring focused tiles', () => {
    const state = createNewGame(undefined, 'city-work-wonder-focus');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const plains = { q: 16, r: 15 };
    const wonder = { q: 15, r: 16 };
    state.map.tiles[hexKey(plains)] = {
      ...state.map.tiles[hexKey(plains)],
      coord: plains,
      terrain: 'plains',
      elevation: 'lowland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(wonder)] = {
      ...state.map.tiles[hexKey(wonder)],
      coord: wonder,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: 'crystal_caverns',
      resource: null,
    };
    state.cities[city.id] = {
      ...city,
      population: 1,
      ownedTiles: [city.position, plains, wonder],
    };

    const result = assignCityFocus(state, city.id, 'gold');

    expect(result.state.cities[city.id].workedTiles).toEqual([wonder]);
  });

  it('leaves surplus population unassigned when no valid unclaimed tiles exist', () => {
    const state = createNewGame(undefined, 'city-work-surplus');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    state.cities[city.id] = { ...city, population: 9, ownedTiles: [city.position] };

    const result = assignCityFocus(state, city.id, 'balanced');
    expect(result.state.cities[city.id].workedTiles).toEqual([]);
    expect(result.unassignedCitizens).toBe(9);
  });
});

describe('manual worked tile assignment', () => {
  it('switches to custom when a tile is manually worked', () => {
    const state = createNewGame(undefined, 'city-work-manual');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const target = city.ownedTiles.find(coord => !(coord.q === city.position.q && coord.r === city.position.r))!;

    const result = setCityWorkedTile(state, city.id, target, true);
    expect(result.state.cities[city.id].focus).toBe('custom');
    expect(result.state.cities[city.id].workedTiles).toContainEqual(target);
  });

  it('refuses a tile claimed by another city', () => {
    const state = createNewGame(undefined, 'city-work-refuse-claim');
    const first = addCity(state, 'player', { q: 10, r: 10 });
    const second = addCity(state, 'player', { q: 15, r: 10 });
    const shared = first.ownedTiles.find(coord => !(coord.q === first.position.q && coord.r === first.position.r))!;
    state.map.tiles[hexKey(shared)].owner = 'player';
    state.cities[first.id] = { ...first, workedTiles: [shared] };
    state.cities[second.id] = { ...second, ownedTiles: [...second.ownedTiles, shared] };

    const result = setCityWorkedTile(state, second.id, shared, true);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('claimed');
    expect(result.state.cities[second.id].workedTiles).not.toContainEqual(shared);
  });
});

describe('worked tile normalization', () => {
  it('lets a focused city claim a tile that only has a stale foreign work claim', () => {
    const state = createNewGame(undefined, 'city-work-stale-foreign-claim');
    const foreign = addCity(state, 'ai-1', { q: 10, r: 10 });
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const target = { q: 16, r: 15 };
    state.map.tiles[hexKey(target)] = {
      ...state.map.tiles[hexKey(target)],
      coord: target,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.cities[foreign.id] = { ...foreign, workedTiles: [target] };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'production',
      workedTiles: [],
      ownedTiles: [city.position, target],
    };

    const result = assignCityFocus(state, city.id, 'production');

    expect(result.state.cities[city.id].workedTiles).toEqual([target]);
    expect(result.state.cities[foreign.id].workedTiles).toEqual([]);
  });

  it('removes city center and foreign-owned tiles', () => {
    const state = createNewGame(undefined, 'city-work-normalize');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const tile = city.ownedTiles.find(coord => !(coord.q === city.position.q && coord.r === city.position.r))!;
    state.map.tiles[hexKey(tile)].owner = 'ai-1';
    state.cities[city.id] = { ...city, workedTiles: [city.position, tile] };

    const result = normalizeWorkedTilesForCity(state, city.id);
    expect(result.state.cities[city.id].workedTiles).toEqual([]);
  });

  it('reassigns a focused city when a worked tile changes ownership', () => {
    const state = createNewGame(undefined, 'city-work-territory-change');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const lostTile = { q: 16, r: 15 };
    const replacement = { q: 15, r: 16 };
    state.map.tiles[hexKey(lostTile)] = {
      ...state.map.tiles[hexKey(lostTile)],
      coord: lostTile,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: 'ai-1',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(replacement)] = {
      ...state.map.tiles[hexKey(replacement)],
      coord: replacement,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'food',
      workedTiles: [lostTile],
      ownedTiles: [city.position, lostTile, replacement],
    };

    const result = normalizeCityWorkAfterTerritoryChange(state, city.id);
    const updated = result.state.cities[city.id];
    expect(updated.focus).toBe('food');
    expect(updated.workedTiles).toContainEqual(replacement);
    expect(updated.workedTiles).not.toContainEqual(lostTile);
  });

  it('removes invalid custom worked tiles without auto-refilling them', () => {
    const state = createNewGame(undefined, 'city-work-custom-territory-change');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const lostTile = { q: 16, r: 15 };
    const replacement = { q: 15, r: 16 };
    state.map.tiles[hexKey(lostTile)] = { ...state.map.tiles[hexKey(lostTile)], coord: lostTile, terrain: 'grassland', owner: 'ai-1' };
    state.map.tiles[hexKey(replacement)] = { ...state.map.tiles[hexKey(replacement)], coord: replacement, terrain: 'grassland', owner: 'player' };
    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'custom',
      workedTiles: [lostTile],
      ownedTiles: [city.position, lostTile, replacement],
    };

    const result = normalizeCityWorkAfterTerritoryChange(state, city.id);
    expect(result.state.cities[city.id].workedTiles).toEqual([]);
    expect(result.unassignedCitizens).toBe(1);
  });

  it('calculates completed farm yield for a worked tile', () => {
    const state = createNewGame(undefined, 'city-work-farm-yield');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const tile = city.ownedTiles.find(coord => !(coord.q === city.position.q && coord.r === city.position.r))!;
    state.map.tiles[hexKey(tile)] = {
      ...state.map.tiles[hexKey(tile)],
      terrain: 'grassland',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };
    const yieldValue = calculateWorkedTileYield(state, tile);
    expect(yieldValue.food).toBeGreaterThan(2);
  });

  it('calculates natural and adjacent wonder yields for a worked tile', () => {
    const state = createNewGame(undefined, 'city-work-wonder-yield');
    const city = addCity(state, 'player', { q: 15, r: 15 });
    const tile = { q: 16, r: 15 };
    const adjacentWonder = { q: 17, r: 15 };
    state.map.tiles[hexKey(tile)] = {
      ...state.map.tiles[hexKey(tile)],
      coord: tile,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: 'crystal_caverns',
      resource: null,
    };
    state.map.tiles[hexKey(adjacentWonder)] = {
      ...state.map.tiles[hexKey(adjacentWonder)],
      coord: adjacentWonder,
      terrain: 'mountain',
      elevation: 'highland',
      owner: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: 'sacred_mountain',
      resource: null,
    };
    state.cities[city.id] = { ...city, ownedTiles: [city.position, tile] };

    const yieldValue = calculateWorkedTileYield(state, tile);

    expect(yieldValue.gold).toBeGreaterThanOrEqual(3);
    expect(yieldValue.science).toBeGreaterThanOrEqual(1);
  });
});

describe('calculateProjectedCityYields — idle production projection', () => {
  it('shifts production into gold when city is idle with idleProduction=gold', () => {
    const state = createNewGame(undefined, 'idle-proj-gold');
    const city = addCity(state, 'player', { q: 14, r: 14 });

    // Baseline: no idle setting
    state.cities[city.id] = { ...city, productionQueue: [], idleProduction: null };
    const baseYields = calculateProjectedCityYields(state, city.id);

    // With idle gold
    state.cities[city.id] = { ...city, productionQueue: [], idleProduction: 'gold' };
    const idleYields = calculateProjectedCityYields(state, city.id);

    expect(idleYields.production).toBe(0);
    expect(idleYields.gold).toBe(baseYields.gold + baseYields.production);
    expect(idleYields.science).toBe(baseYields.science);
  });

  it('shifts production into science when city is idle with idleProduction=science', () => {
    const state = createNewGame(undefined, 'idle-proj-sci');
    const city = addCity(state, 'player', { q: 14, r: 14 });

    // Baseline: no idle setting
    state.cities[city.id] = { ...city, productionQueue: [], idleProduction: null };
    const baseYields = calculateProjectedCityYields(state, city.id);

    // With idle science
    state.cities[city.id] = { ...city, productionQueue: [], idleProduction: 'science' };
    const idleYields = calculateProjectedCityYields(state, city.id);

    expect(idleYields.production).toBe(0);
    expect(idleYields.science).toBe(baseYields.science + baseYields.production);
    expect(idleYields.gold).toBe(baseYields.gold);
  });

  it('does NOT shift when productionQueue is non-empty even with idleProduction set', () => {
    const state = createNewGame(undefined, 'idle-proj-queued');
    const city = addCity(state, 'player', { q: 14, r: 14 });

    // Baseline: no idle setting
    state.cities[city.id] = { ...city, productionQueue: [], idleProduction: null };
    const baseYields = calculateProjectedCityYields(state, city.id);

    // Queue non-empty with idle set — should not shift
    state.cities[city.id] = { ...city, productionQueue: ['warrior'], idleProduction: 'gold' };
    const queuedYields = calculateProjectedCityYields(state, city.id);

    expect(queuedYields.production).toBe(baseYields.production);
    expect(queuedYields.gold).toBe(baseYields.gold);
  });

  it('does NOT shift when idleProduction is null', () => {
    const state = createNewGame(undefined, 'idle-proj-null');
    const city = addCity(state, 'player', { q: 14, r: 14 });
    state.cities[city.id] = { ...city, productionQueue: [], idleProduction: null };

    const yields = calculateProjectedCityYields(state, city.id);

    // Production must NOT be zeroed out when idleProduction is null
    expect(yields.production).toBeGreaterThan(0);
  });
});

describe('mountain tile workability (issue #280)', () => {
  it('mountain tile owned by a city is workable', () => {
    const state = createNewGame(undefined, 'city-work-mountain');
    const city = addCity(state, 'player', { q: 15, r: 15 });

    state.map.tiles['16,15'] = {
      coord: { q: 16, r: 15 }, terrain: 'mountain', elevation: 'mountain' as any,
      resource: null, improvement: 'none' as any, owner: 'player',
      improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, { q: 16, r: 15 }] };

    const workable = getWorkableTilesForCity(state, city.id);
    const keys = workable.map(entry => hexKey(entry.coord));
    expect(keys).toContain('16,15');
  });
});

describe('river production bonus', () => {
  function riverFarmState(completedTechs: string[]): { state: GameState; coord: HexCoord } {
    const state = createNewGame(undefined, 'river-prod');
    const coord: HexCoord = { q: 5, r: 5 };
    state.map.tiles[hexKey(coord)] = {
      coord,
      terrain: 'grassland',
      elevation: 'lowland',
      resource: null,
      improvement: 'farm',
      improvementTurnsLeft: 0,
      owner: 'player',
      hasRiver: true,
      wonder: null,
    };
    state.civilizations['player'].techState.completed = completedTechs;
    return { state, coord };
  }

  it('preserves the base river gold and completed farm food bonuses without tech', () => {
    const { state, coord } = riverFarmState([]);
    const riverYield = calculateWorkedTileYield(state, coord);
    state.map.tiles[hexKey(coord)]!.hasRiver = false;
    const inlandYield = calculateWorkedTileYield(state, coord);

    expect(riverYield.gold).toBe(inlandYield.gold + 1);
    expect(riverYield.food).toBe(inlandYield.food + 1);
    expect(riverYield.production).toBe(inlandYield.production);
  });

  it('gives no production bonus without irrigation tech', () => {
    const { state, coord } = riverFarmState([]);
    expect(calculateWorkedTileYield(state, coord).production).toBe(0);
  });

  it('gives +1 production on a river farm with irrigation tech', () => {
    const { state, coord } = riverFarmState(['irrigation']);
    expect(calculateWorkedTileYield(state, coord).production).toBe(1);
  });

  it('gives no river production bonus on a non-farm river tile even with irrigation', () => {
    const { state, coord } = riverFarmState(['irrigation']);
    state.map.tiles[hexKey(coord)]!.improvement = 'none';
    expect(calculateWorkedTileYield(state, coord).production).toBe(0);
  });

  it('gives no production bonus when farm is not yet complete (improvementTurnsLeft > 0)', () => {
    const { state, coord } = riverFarmState(['irrigation']);
    state.map.tiles[hexKey(coord)]!.improvementTurnsLeft = 2;
    expect(calculateWorkedTileYield(state, coord).production).toBe(0);
  });
});
