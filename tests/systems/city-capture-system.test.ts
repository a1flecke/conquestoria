import { describe, it, expect } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameEvents, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';
import { resolveMajorCityCapture, transferCapturedCityOwnership } from '@/systems/city-capture-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('city-capture-system', () => {
  function makeExposedCityCaptureState({
    population,
    buildings,
  }: {
    population: number;
    buildings: string[];
  }): GameState {
    const state = createNewGame(undefined, 'capture-empty-city', 'small');
    state.civilizations.player.cities = [];
    state.civilizations['ai-1'].cities = [];
    state.civilizations.player.diplomacy.relationships['ai-1'] = 0;
    state.civilizations['ai-1'].diplomacy.relationships.player = 0;
    state.cities = {};

    state.cities.athens = {
      ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()),
      id: 'athens',
      name: 'Athens',
      owner: 'ai-1',
      position: { q: 1, r: 0 },
      population,
      buildings,
      ownedTiles: [{ q: 1, r: 0 }, { q: 1, r: 1 }],
    };
    state.civilizations['ai-1'].cities = ['athens'];
    state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'ai-1';
    state.map.tiles[hexKey({ q: 1, r: 1 })].owner = 'ai-1';

    return state;
  }

  function addLegendaryProject(state: GameState, ownerId: string, cityId: string, wonderId = 'oracle-of-delphi'): void {
    state.legendaryWonderProjects = {
      ...(state.legendaryWonderProjects ?? {}),
      [`${wonderId}:${ownerId}:${cityId}`]: {
        wonderId,
        ownerId,
        cityId,
        phase: 'questing',
        investedProduction: 12,
        transferableProduction: 0,
        questSteps: [],
      },
    };
  }

  it('keeps instability pressure when the former owner reconquers its own breakaway city', () => {
    const { state, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12 });

    const result = transferCapturedCityOwnership(state, cityId, 'player', state.turn);

    expect(result.cities[cityId].owner).toBe('player');
    expect(result.cities[cityId].unrestLevel).toBe(1);
    expect(result.cities[cityId].conquestTurn).toBeUndefined();
  });

  it('preserves breakaway reconquest behavior in the shared occupy resolver', () => {
    const { state, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12 });

    const result = resolveMajorCityCapture(state, cityId, 'player', 'occupy', state.turn);

    expect(result.outcome).toBe('occupied');
    expect(result.state.cities[cityId].owner).toBe('player');
    expect(result.state.cities[cityId].unrestLevel).toBe(1);
    expect(result.state.cities[cityId].conquestTurn).toBeUndefined();
    expect(result.state.cities[cityId].occupation).toBeUndefined();
  });

  it('occupies a captured city by halving population and transferring all owned tiles', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary', 'library'] });

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.state.cities.athens.owner).toBe('player');
    expect(result.state.cities.athens.population).toBe(3);
    expect(result.state.cities.athens.occupation).toEqual(
      expect.objectContaining({ originalOwnerId: 'ai-1', turnsRemaining: 10 }),
    );
    for (const coord of result.state.cities.athens.ownedTiles) {
      expect(result.state.map.tiles[hexKey(coord)].owner).toBe('player');
    }
  });

  it('recalculates captured city territory when legacy owned tiles are missing', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: [] });
    state.cities.athens = { ...state.cities.athens, ownedTiles: [] };
    state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'ai-1';

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.outcome).toBe('occupied');
    expect(result.state.cities.athens.ownedTiles.map(hexKey)).toContain('1,0');
    expect(result.state.map.tiles[hexKey({ q: 1, r: 0 })].owner).toBe('player');
  });

  it('returns territory tile-flipped events when occupation transfers improved territory', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
    const farmCoord = { q: 1, r: 1 };
    state.map.tiles[hexKey(farmCoord)] = {
      ...state.map.tiles[hexKey(farmCoord)],
      terrain: 'grassland',
      owner: 'ai-1',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.territoryEvents).toContainEqual<GameEvents['territory:tile-flipped']>({
      coord: farmCoord,
      previousOwner: 'ai-1',
      newOwner: 'player',
      improvement: 'farm',
      constructionCancelled: false,
    });
  });

  it('returns no territory flip event for razed tiles that become neutral', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary'] });
    const ownedCoord = { q: 1, r: 1 };
    state.cities.athens = {
      ...state.cities.athens,
      ownedTiles: [state.cities.athens.position, ownedCoord],
    };
    state.map.tiles[hexKey(ownedCoord)] = {
      ...state.map.tiles[hexKey(ownedCoord)],
      terrain: 'grassland',
      owner: 'ai-1',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.outcome).toBe('razed');
    expect(result.territoryEvents).toEqual([]);
  });

  it('reassigns legendary wonder projects to the new owner when a city is occupied', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
    addLegendaryProject(state, 'ai-1', 'athens');

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(Object.keys(result.state.legendaryWonderProjects ?? {})).toEqual(['oracle-of-delphi:player:athens']);
    expect(result.state.legendaryWonderProjects?.['oracle-of-delphi:player:athens']).toEqual(
      expect.objectContaining({ ownerId: 'player', cityId: 'athens' }),
    );
  });

  it('razes a population-1 major city when the conqueror chooses raze', () => {
    const state = makeExposedCityCaptureState({ population: 1, buildings: ['granary'] });

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.outcome).toBe('razed');
    expect(result.state.cities.athens).toBeUndefined();
    expect(result.goldAwarded).toBe(30);
  });

  it('occupies a population-1 major city when the conqueror chooses occupy', () => {
    const state = makeExposedCityCaptureState({ population: 1, buildings: ['granary'] });

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.outcome).toBe('occupied');
    expect(result.state.cities.athens).toEqual(
      expect.objectContaining({
        owner: 'player',
        population: 1,
        occupation: expect.objectContaining({ originalOwnerId: 'ai-1', turnsRemaining: 10 }),
      }),
    );
    expect(result.goldAwarded).toBe(0);
  });

  it('awards salvage gold and applies a raze relationship penalty', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary', 'library', 'monument'] });
    const before = state.civilizations['ai-1'].diplomacy.relationships.player;

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.goldAwarded).toBe(10 + Math.floor((40 + 16 + 30) / 2));
    expect(result.state.cities.athens).toBeUndefined();
    expect(result.state.civilizations['ai-1'].diplomacy.relationships.player).toBe(before - 40);
  });

  it('removes legendary wonder projects for a razed city', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary'] });
    addLegendaryProject(state, 'ai-1', 'athens');

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.state.cities.athens).toBeUndefined();
    expect(result.state.legendaryWonderProjects).toEqual({});
  });

  it('preserves another current holder when razing a city with stale owned tiles', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });
    const shared = { q: 1, r: 1 };
    state.cities.rome = {
      ...foundCity('player', { q: 3, r: 1 }, state.map, mkC()),
      id: 'rome',
      name: 'Rome',
      owner: 'player',
      position: { q: 3, r: 1 },
      ownedTiles: [shared],
      workedTiles: [shared],
    };
    state.civilizations.player.cities = ['rome'];
    state.map.tiles[hexKey(shared)] = {
      ...state.map.tiles[hexKey(shared)],
      terrain: 'grassland',
      owner: 'player',
    };
    state.cities.athens = {
      ...state.cities.athens,
      ownedTiles: [state.cities.athens.position, shared],
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.outcome).toBe('razed');
    expect(result.state.map.tiles[hexKey(shared)].owner).toBe('player');
    expect(result.state.cities.rome.workedTiles).toEqual([shared]);
  });

  it('assigns worked tiles to conquered city residents after occupation', () => {
    // foundCity starts with workedTiles: [] — the bug was that nothing assigned
    // workers after capture, so residents had no tiles to work.
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });

    // Confirm the city starts with no workers (foundCity default)
    expect(state.cities.athens.workedTiles).toEqual([]);

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', 1);
    const captured = result.state.cities.athens;

    expect(captured).toBeDefined();
    // Population halves (4 → 2), workers must be assigned to valid tiles
    expect(captured!.workedTiles.length).toBeGreaterThan(0);
    // Every worked tile must be in the city's ownedTiles
    const ownedKeys = new Set((captured!.ownedTiles ?? []).map(c => `${c.q},${c.r}`));
    for (const worked of captured!.workedTiles) {
      expect(ownedKeys.has(`${worked.q},${worked.r}`)).toBe(true);
    }
    // Workers must not exceed halved population
    expect(captured!.workedTiles.length).toBeLessThanOrEqual(captured!.population);
  });

  it('sets isEliminated on the previous owner when their last city is occupied', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });
    // ai-1 starts with only 'athens'
    expect(state.civilizations['ai-1'].cities).toEqual(['athens']);

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.state.civilizations['ai-1'].isEliminated).toBe(true);
  });

  it('sets isEliminated on the previous owner when their last city is razed', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.state.civilizations['ai-1'].isEliminated).toBe(true);
  });

  it('does not set isEliminated when the previous owner still has other cities', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });
    // Give ai-1 a second city so they survive this capture
    state.civilizations['ai-1'].cities = ['athens', 'sparta'];
    state.cities.sparta = {
      ...foundCity('ai-1', { q: 3, r: 0 }, state.map, mkC()),
      id: 'sparta',
      name: 'Sparta',
      owner: 'ai-1',
      position: { q: 3, r: 0 },
      population: 3,
      buildings: [],
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.state.civilizations['ai-1'].isEliminated).toBeFalsy();
  });
});
