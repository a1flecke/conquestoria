import { describe, expect, it } from 'vitest';
import type { City, GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  buildCityWorkClaimIndex,
  canonicalizeCityCoord,
  formatCityFoundingBlockerMessage,
  getCityFoundingBlockers,
  MIN_CITY_CENTER_DISTANCE,
  normalizeCityWorkClaims,
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

  it('does not treat the founding settler as an occupied-tile blocker', () => {
    const state = createNewGame(undefined, 'city-spacing-ignore-settler');
    state.units['unit-settler-test'] = {
      id: 'unit-settler-test',
      type: 'settler',
      owner: 'player',
      position: { q: 12, r: 12 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.map.tiles['12,12'] = {
      ...state.map.tiles['12,12'],
      terrain: 'grassland',
    };

    const blockers = getCityFoundingBlockers(state, { q: 12, r: 12 }, { ignoreUnitId: 'unit-settler-test' });

    expect(blockers.find(blocker => blocker.reason === 'occupied')).toBeUndefined();
  });

  it('formats player-facing founding blocker messages', () => {
    expect(formatCityFoundingBlockerMessage([
      { reason: 'too-close', cityName: 'Ephyra', distance: 2 },
    ])).toBe('Too close to Ephyra.');
    expect(formatCityFoundingBlockerMessage([{ reason: 'invalid-terrain' }])).toBe('Cities must be founded on land.');
    expect(formatCityFoundingBlockerMessage([{ reason: 'occupied' }])).toBe('Another unit is blocking this city site.');
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
