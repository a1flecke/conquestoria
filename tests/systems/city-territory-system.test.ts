import { describe, expect, it } from 'vitest';
import type { City, GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import {
  buildCityWorkClaimIndex,
  buildTerritoryTileFlippedEvents,
  canonicalizeCityCoord,
  cityDistance,
  cleanupTerritoryFrontiers,
  formatCityFoundingBlockerMessage,
  getCityFoundingBlockers,
  getCulturalTerritoryRadius,
  MIN_CITY_CENTER_DISTANCE,
  normalizeCityWorkClaims,
  processTerritoryFrontiers,
  recalculateTerritory,
  TERRITORY_PRESSURE_BALANCE,
  type TerritoryResolution,
} from '@/systems/city-territory-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function addCity(state: GameState, owner: string, q: number, r: number): City {
  const city = foundCity(owner, { q, r }, state.map, state.idCounters);
  state.cities[city.id] = city;
  state.civilizations[owner]?.cities.push(city.id);
  return city;
}

describe('city founding territory rules', () => {
  it('uses a four-hex minimum city-center distance', () => {
    expect(MIN_CITY_CENTER_DISTANCE).toBe(4);
  });

  it('blocks founding within three hexes of an owned city', () => {
    const state = createNewGame(undefined, 'city-spacing-owned');
    addCity(state, 'player', 10, 10);
    const blockers = getCityFoundingBlockers(state, { q: 13, r: 10 });
    expect(blockers).toContainEqual(expect.objectContaining({ reason: 'too-close', distance: 3 }));
  });

  it('blocks founding within three hexes of a foreign city', () => {
    const state = createNewGame(undefined, 'city-spacing-foreign');
    addCity(state, 'ai-1', 10, 10);
    const blockers = getCityFoundingBlockers(state, { q: 13, r: 10 });
    expect(blockers).toContainEqual(expect.objectContaining({ reason: 'too-close', distance: 3 }));
  });

  it('allows founding at distance four', () => {
    const state = createNewGame(undefined, 'city-spacing-four');
    addCity(state, 'player', 10, 10);
    const blockers = getCityFoundingBlockers(state, { q: 14, r: 10 });
    expect(blockers.find(blocker => blocker.reason === 'too-close')).toBeUndefined();
  });

  it('uses wrapped distance across the map edge', () => {
    const state = createNewGame(undefined, 'city-spacing-wrap');
    addCity(state, 'player', 0, 5);
    const blockers = getCityFoundingBlockers(state, { q: state.map.width - 2, r: 5 });
    expect(blockers).toContainEqual(expect.objectContaining({ reason: 'too-close', distance: 2 }));
  });

  it('does not block founding when a friendly warrior shares the tile', () => {
    const state = createNewGame(undefined, 'city-found-with-warrior');
    state.units['unit-warrior-test'] = {
      id: 'unit-warrior-test',
      type: 'warrior',
      owner: 'player',
      position: { q: 12, r: 12 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.map.tiles['12,12'] = { ...state.map.tiles['12,12'], terrain: 'grassland' };

    const blockers = getCityFoundingBlockers(state, { q: 12, r: 12 });

    // Only distance blockers (from pre-existing AI start cities) are acceptable — no terrain or unit blockers.
    expect(blockers.filter(b => b.reason !== 'too-close')).toHaveLength(0);
  });

  it('does not block founding when settler and warrior share the same tile (turn-1 scenario)', () => {
    const state = createNewGame(undefined, 'city-found-any-unit');
    state.units['unit-a'] = {
      id: 'unit-a', type: 'settler', owner: 'player',
      position: { q: 5, r: 5 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    state.units['unit-b'] = {
      id: 'unit-b', type: 'warrior', owner: 'player',
      position: { q: 5, r: 5 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    state.map.tiles['5,5'] = { ...state.map.tiles['5,5'], terrain: 'grassland' };

    const blockers = getCityFoundingBlockers(state, { q: 5, r: 5 });

    // Only distance blockers acceptable — units must never block founding.
    expect(blockers.filter(b => b.reason !== 'too-close')).toHaveLength(0);
  });

  it('formats player-facing founding blocker messages', () => {
    expect(formatCityFoundingBlockerMessage([
      { reason: 'too-close', cityName: 'Ephyra', distance: 2 },
    ])).toBe('Too close to Ephyra.');
    expect(formatCityFoundingBlockerMessage([{ reason: 'invalid-terrain' }])).toBe('Cities must be founded on land.');
  });

  it('recalculates a founded city to radius 2 without claiming ocean or mountains', () => {
    const state = createNewGame(undefined, 'territory-radius-2');
    state.cities = {};
    state.civilizations.player.cities = [];
    const city = foundCity('player', { q: 10, r: 10 }, state.map, mkC());
    city.id = 'city-player';
    state.cities[city.id] = { ...city, ownedTiles: [] };
    state.civilizations.player.cities = [city.id];
    state.map.tiles['10,10'] = { ...state.map.tiles['10,10'], terrain: 'grassland', owner: null };
    state.map.tiles['10,12'] = { ...state.map.tiles['10,12'], terrain: 'grassland', owner: null };
    state.map.tiles['11,10'] = { ...state.map.tiles['11,10'], terrain: 'mountain', owner: null };
    state.map.tiles['12,10'] = { ...state.map.tiles['12,10'], terrain: 'ocean', owner: null };

    const result = recalculateTerritory(state, { reason: 'founding', preserveForeignHolders: true });
    const ownedKeys = result.state.cities[city.id].ownedTiles.map(hexKey);

    expect(ownedKeys).toContain('10,10');
    expect(ownedKeys).toContain('10,12');
    expect(ownedKeys).not.toContain('11,10');
    expect(ownedKeys).not.toContain('12,10');
    for (const key of ownedKeys) {
      expect(result.state.map.tiles[key]?.owner).toBe('player');
    }
  });

  it('does not steal valid foreign-held tiles during MR1 founding recalculation', () => {
    const state = createNewGame(undefined, 'territory-foreign-holder');
    state.cities = {};
    state.civilizations.player.cities = [];
    const city = foundCity('player', { q: 10, r: 10 }, state.map, mkC());
    city.id = 'city-player';
    state.cities[city.id] = { ...city, ownedTiles: [] };
    state.civilizations.player.cities = [city.id];
    state.map.tiles['11,10'] = { ...state.map.tiles['11,10'], terrain: 'grassland', owner: 'ai-1' };

    const result = recalculateTerritory(state, { reason: 'founding', preserveForeignHolders: true });

    expect(result.state.map.tiles['11,10'].owner).toBe('ai-1');
    expect(result.state.cities[city.id].ownedTiles.map(hexKey)).not.toContain('11,10');
  });

  it('returns changed-tile metadata when ownership changes', () => {
    const state = createNewGame(undefined, 'territory-resolution-metadata');
    state.cities = {};
    state.civilizations.player.cities = [];
    const city = foundCity('player', { q: 10, r: 10 }, state.map, mkC());
    city.id = 'city-player';
    state.cities[city.id] = { ...city, ownedTiles: [] };
    state.civilizations.player.cities = [city.id];

    const result = recalculateTerritory(state, { reason: 'founding', preserveForeignHolders: true });
    const centerResolution = result.resolutions.find((resolution: TerritoryResolution) => hexKey(resolution.coord) === '10,10');

    expect(centerResolution).toMatchObject({
      previousOwner: null,
      winningCityId: city.id,
      winningCivId: 'player',
      reason: 'founding',
    });
  });

  it('normalizes city work claims after territory loss', () => {
    const state = createNewGame(undefined, 'territory-work-normalize');
    const city = addCity(state, 'player', 10, 10);
    const lost = { q: 11, r: 10 };
    state.map.tiles['11,10'] = { ...state.map.tiles['11,10'], owner: 'ai-1', terrain: 'grassland' };
    state.cities[city.id] = { ...city, ownedTiles: [city.position, lost], workedTiles: [lost] };

    const result = recalculateTerritory(state, { reason: 'load', preserveForeignHolders: true });

    expect(result.state.cities[city.id].workedTiles).toEqual([]);
    expect(result.state.map.tiles['11,10'].owner).toBe('ai-1');
  });

  it('keeps outpost population 3 without culture buildings at radius 2', () => {
    const state = createNewGame(undefined, 'territory-growth-no');
    const city = addCity(state, 'player', 10, 10);
    state.cities[city.id] = { ...city, population: 3, maturity: 'outpost', buildings: [] };

    expect(getCulturalTerritoryRadius(state.cities[city.id])).toBe(2);
  });

  it('grows to radius 3 from population, maturity, or culture buildings', () => {
    const state = createNewGame(undefined, 'territory-growth-yes');
    const city = addCity(state, 'player', 10, 10);

    expect(getCulturalTerritoryRadius({ ...city, population: 4 })).toBe(3);
    expect(getCulturalTerritoryRadius({ ...city, maturity: 'town' })).toBe(3);
    expect(getCulturalTerritoryRadius({ ...city, population: 3, buildings: ['shrine'] })).toBe(3);
    expect(getCulturalTerritoryRadius({ ...city, buildings: ['shrine', 'monument'] })).toBe(3);
  });

  it('does not flip an overlap when pressure margin is only one', () => {
    const state = createNewGame(undefined, 'territory-soft-trim-margin-one');
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 13, 10);
    const overlap = { q: 12, r: 10 };
    state.map.tiles[hexKey(overlap)] = { ...state.map.tiles[hexKey(overlap)], terrain: 'grassland', owner: 'player' };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
    state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };

    const result = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });

    expect(result.state.map.tiles[hexKey(overlap)].owner).toBe('player');
  });

  it('flips an overlap when rival pressure margin is at least two', () => {
    const state = createNewGame(undefined, 'territory-soft-trim-margin-two');
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 13, 10);
    const overlap = { q: 12, r: 10 };
    state.map.tiles[hexKey(overlap)] = { ...state.map.tiles[hexKey(overlap)], terrain: 'grassland', owner: 'player' };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
    state.cities[challenger.id] = { ...challenger, population: 6, maturity: 'town', buildings: ['shrine'], ownedTiles: [] };

    const result = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });

    expect(result.state.map.tiles[hexKey(overlap)].owner).toBe('ai-1');
  });

  it('builds tile-flipped events for completed improvements that transfer owners', () => {
    const state = createNewGame(undefined, 'territory-transfer-event');
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 13, 10);
    const overlap = { q: 12, r: 10 };
    state.map.tiles[hexKey(overlap)] = {
      ...state.map.tiles[hexKey(overlap)],
      terrain: 'grassland',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
    state.cities[challenger.id] = { ...challenger, population: 6, maturity: 'town', buildings: ['shrine'], ownedTiles: [] };

    const result = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });
    const events = buildTerritoryTileFlippedEvents(state, result.state, result.resolutions);

    expect(events).toEqual([
      expect.objectContaining({
        coord: overlap,
        previousOwner: 'player',
        newOwner: 'ai-1',
        improvement: 'farm',
        constructionCancelled: false,
      }),
    ]);
  });

  it('marks tile-flipped events when in-progress construction is cancelled by a border shift', () => {
    const state = createNewGame(undefined, 'territory-transfer-cancel-event');
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 13, 10);
    const overlap = { q: 12, r: 10 };
    state.map.tiles[hexKey(overlap)] = {
      ...state.map.tiles[hexKey(overlap)],
      terrain: 'grassland',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 2,
    };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
    state.cities[challenger.id] = { ...challenger, population: 6, maturity: 'town', buildings: ['shrine'], ownedTiles: [] };

    const result = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });
    const events = buildTerritoryTileFlippedEvents(state, result.state, result.resolutions);

    expect(events).toEqual([
      expect.objectContaining({
        coord: overlap,
        previousOwner: 'player',
        newOwner: 'ai-1',
        improvement: 'none',
        constructionCancelled: true,
      }),
    ]);
  });

  it('records frontier progress for contested held tiles before flipping', () => {
    const state = createNewGame(undefined, 'territory-frontier-progress');
    state.territoryFrontiers = {};
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 13, 10);
    const coord = { q: 12, r: 10 };
    state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', owner: 'player' };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [coord] };
    state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };

    const result = processTerritoryFrontiers(state);
    const frontier = result.territoryFrontiers?.[hexKey(coord)];

    expect(frontier).toMatchObject({
      holderCivId: 'player',
      challengerCivId: 'ai-1',
      holderCityId: holder.id,
      challengerCityId: challenger.id,
    });
    expect(frontier?.reason).toContain('cultural pressure');
  });

  it('keeps frontier progress below flip threshold after one marginal pressure turn', () => {
    const state = createNewGame(undefined, 'territory-balance-marginal-frontier');
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 13, 10);
    const coord = { q: 12, r: 10 };
    state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', owner: 'player' };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [coord] };
    state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };

    const result = processTerritoryFrontiers(state);
    const frontier = result.territoryFrontiers?.[hexKey(coord)];

    expect(frontier?.progress).toBeGreaterThan(0);
    expect(frontier?.progress).toBeLessThan(TERRITORY_PRESSURE_BALANCE.frontierFlipProgress);
    expect(result.map.tiles[hexKey(coord)].owner).toBe('player');
  });

  it('uses named balance thresholds for likely-to-flip and final frontier flips', () => {
    expect(TERRITORY_PRESSURE_BALANCE.softTrimMargin).toBe(2);
    expect(TERRITORY_PRESSURE_BALANCE.likelyToFlipProgress).toBe(8);
    expect(TERRITORY_PRESSURE_BALANCE.frontierFlipProgress).toBe(10);
  });

  it('flips a contested frontier tile when accumulated progress reaches the threshold', () => {
    const state = createNewGame(undefined, 'territory-frontier-threshold-flip');
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 13, 10);
    const coord = { q: 12, r: 10 };
    state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', owner: 'player' };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [coord], workedTiles: [coord] };
    state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };
    state.territoryFrontiers = {
      [hexKey(coord)]: {
        coord,
        holderCivId: 'player',
        challengerCivId: 'ai-1',
        holderCityId: holder.id,
        challengerCityId: challenger.id,
        progress: 9,
        trend: 'likely-to-flip',
        reason: 'ai-1 cultural pressure is challenging player.',
      },
    };

    const result = processTerritoryFrontiers(state);

    expect(result.map.tiles[hexKey(coord)].owner).toBe('ai-1');
    expect(result.cities[holder.id].ownedTiles.map(hexKey)).not.toContain(hexKey(coord));
    expect(result.cities[holder.id].workedTiles).toEqual([]);
    expect(result.cities[challenger.id].ownedTiles.map(hexKey)).toContain(hexKey(coord));
    expect(result.territoryFrontiers?.[hexKey(coord)]).toBeUndefined();
  });

  it('cleans frontier records when a source city is gone', () => {
    const state = createNewGame(undefined, 'territory-frontier-cleanup');
    state.territoryFrontiers = {
      '5,5': {
        coord: { q: 5, r: 5 },
        holderCivId: 'player',
        challengerCivId: 'ai-1',
        holderCityId: 'missing-city',
        challengerCityId: 'also-missing',
        progress: 3,
        trend: 'contested',
        reason: 'Stale frontier',
      },
    };

    const result = cleanupTerritoryFrontiers(state);

    expect(result.territoryFrontiers).toEqual({});
  });

  it('cleans frontier records when the challenger no longer has a stronger competing claim', () => {
    const state = createNewGame(undefined, 'territory-frontier-cleanup-no-competition');
    state.cities = {};
    const holder = addCity(state, 'player', 10, 10);
    const challenger = addCity(state, 'ai-1', 20, 20);
    const coord = { q: 12, r: 10 };
    state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', owner: 'player' };
    state.territoryFrontiers = {
      [hexKey(coord)]: {
        coord,
        holderCivId: 'player',
        challengerCivId: 'ai-1',
        holderCityId: holder.id,
        challengerCityId: challenger.id,
        progress: 4,
        trend: 'contested',
        reason: 'Stale frontier',
      },
    };

    const result = cleanupTerritoryFrontiers(state);

    expect(result.territoryFrontiers).toEqual({});
  });
});

describe('work claim indexing', () => {
  it('stores wrapped coordinates canonically', () => {
    const state = createNewGame(undefined, 'city-canonical-coord');
    expect(canonicalizeCityCoord({ q: -1, r: 2 }, state.map)).toEqual({ q: state.map.width - 1, r: 2 });
  });

  it('indexes at most one active city claim per tile', () => {
    const state = createNewGame(undefined, 'city-claim-index');
    const first = addCity(state, 'player', 10, 10);
    const second = addCity(state, 'player', 15, 10);
    const shared = { q: 11, r: 10 };
    state.map.tiles['11,10'].owner = 'player';
    first.workedTiles = [shared];
    second.workedTiles = [shared];

    const normalized = normalizeCityWorkClaims(state);
    const index = buildCityWorkClaimIndex(normalized.state);
    expect(Object.values(index).filter(claim => claim.coord.q === 11 && claim.coord.r === 10)).toHaveLength(1);
    expect(normalized.changedCityIds.length).toBeGreaterThan(0);
  });

  it('removes worked claims when the city no longer controls the tile', () => {
    const state = createNewGame(undefined, 'city-claim-foreign-owner');
    const city = addCity(state, 'player', 10, 10);
    const lostTile = { q: 11, r: 10 };
    state.map.tiles['11,10'].owner = 'ai-1';
    city.workedTiles = [lostTile];

    const normalized = normalizeCityWorkClaims(state);

    expect(normalized.state.cities[city.id].workedTiles).toEqual([]);
    expect(normalized.changedCityIds).toContain(city.id);
  });
});

describe('minor-civ placement and founding distance invariant', () => {
  it('no city-state city is within MIN_CITY_CENTER_DISTANCE wrapped hexes of a player start position', () => {
    const state = createNewGame(undefined, 'minor-civ-wrap-placement');
    const settlerPositions = Object.values(state.units)
      .filter(u => u.type === 'settler')
      .map(u => u.position);

    for (const city of Object.values(state.cities)) {
      if (!city.owner.startsWith('mc-')) continue;
      for (const settlerPos of settlerPositions) {
        const dist = cityDistance(city.position, settlerPos, state.map);
        expect(dist).toBeGreaterThanOrEqual(MIN_CITY_CENTER_DISTANCE);
      }
    }
  });
});
