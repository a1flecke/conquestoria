import { describe, expect, it } from 'vitest';
import type { City, GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import {
  buildCityWorkClaimIndex,
  canonicalizeCityCoord,
  cityDistance,
  formatCityFoundingBlockerMessage,
  getCityFoundingBlockers,
  MIN_CITY_CENTER_DISTANCE,
  normalizeCityWorkClaims,
  recalculateTerritory,
  type TerritoryResolution,
} from '@/systems/city-territory-system';

function addCity(state: GameState, owner: string, q: number, r: number): City {
  const city = foundCity(owner, { q, r }, state.map);
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
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
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
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
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
    const city = foundCity('player', { q: 10, r: 10 }, state.map);
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
