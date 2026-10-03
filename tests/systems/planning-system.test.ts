import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { getQueueableProductionForCity } from '@/systems/city-production-eligibility';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';
import { BUILDINGS, foundCity, TRAINABLE_UNITS } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { createTechState } from '@/systems/tech-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  enqueueCityProduction,
  enqueueResearch,
  activateNextQueuedResearch,
  getIdleCityIds,
  getRecommendedIdleCityChoice,
  moveQueuedId,
  needsResearchChoice,
  removeQueuedId,
  reorderCityProduction,
  setIdleProduction,
} from '@/systems/planning-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

/** A real state with one city whose owner has every technology: enqueue validates against live eligibility. */
function fixture() {
  const state = makeLegendaryWonderFixture({ completedTechs: TECH_TREE.map(tech => tech.id) });
  const unit = getQueueableProductionForCity(state, 'city-river')!.units[0].type;
  return { state, unit };
}

function withQueue(state: GameState, queue: string[]): GameState {
  return { ...state, cities: { ...state.cities, 'city-river': { ...state.cities['city-river'], productionQueue: queue } } };
}

describe('planning-system city queues', () => {
  it('appends new city builds up to the active item plus three follow-ups', () => {
    const { state, unit } = fixture();
    const withActive = withQueue(state, [unit]);
    const queued = enqueueCityProduction(withActive, 'city-river', 'library');
    expect(queued.ok).toBe(true);
    expect(queued.ok && queued.state.cities['city-river'].productionQueue).toEqual([unit, 'library']);
  });

  it('allows three follow-up city queue items beyond the active build', () => {
    const { state, unit } = fixture();
    const queued = enqueueCityProduction(withQueue(state, [unit, 'library', unit]), 'city-river', 'shrine');
    expect(queued.ok && queued.state.cities['city-river'].productionQueue).toEqual([unit, 'library', unit, 'shrine']);
  });

  it('reorders queue items without dropping them', () => {
    expect(moveQueuedId(['warrior', 'shrine', 'worker'], 2, 0)).toEqual(['worker', 'warrior', 'shrine']);
  });

  it('resets progress when reordering changes the active production item', () => {
    const city = {
      productionQueue: ['warrior', 'shrine', 'worker'],
      productionProgress: 7,
    } as any;

    const reordered = reorderCityProduction(city, 1, 0);

    expect(reordered.productionQueue).toEqual(['shrine', 'warrior', 'worker']);
    expect(reordered.productionProgress).toBe(0);
  });

  it('removes queue items cleanly', () => {
    expect(removeQueuedId(['warrior', 'shrine', 'worker'], 1)).toEqual(['warrior', 'worker']);
  });

  it('starts research immediately and queues follow-up techs after that', () => {
    const techState = createTechState();

    const started = enqueueResearch(techState, 'fire');
    const queued = enqueueResearch(started, 'writing');

    expect(started.currentResearch).toBe('fire');
    expect(queued.researchQueue).toEqual(['writing']);
  });

  it('promotes a valid queued head when no research is active', () => {
    const state = {
      ...createTechState(),
      researchQueue: ['fire', 'writing'],
      researchProgress: 8,
    };

    expect(activateNextQueuedResearch(state)).toMatchObject({
      currentResearch: 'fire',
      researchQueue: ['writing'],
      researchProgress: 0,
    });
  });

  it('cleans only unknown, completed, duplicate, and dependency-invalid queue entries', () => {
    const state = {
      ...createTechState(),
      completed: ['gathering'],
      researchQueue: [
        'unknown',
        'gathering',
        'writing',
        'fire',
        'fire',
        'writing',
        'pottery',
      ],
    };

    expect(activateNextQueuedResearch(state)).toMatchObject({
      currentResearch: 'fire',
      researchQueue: ['writing', 'pottery'],
      researchProgress: 0,
    });
  });

  it('allows three queued follow-up techs beyond the active research', () => {
    const techState = createTechState();

    const started = enqueueResearch(techState, 'fire');
    const first = enqueueResearch(started, 'writing');
    const second = enqueueResearch(first, 'wheel');
    const third = enqueueResearch(second, 'gathering');

    expect(third.researchQueue).toEqual(['writing', 'wheel', 'gathering']);
  });

  it('does not queue research whose prerequisites are outside the planned chain', () => {
    const techState = {
      ...createTechState(),
      currentResearch: 'fire',
      researchQueue: [],
    };

    const result = enqueueResearch(techState, 'banking');

    expect(result.researchQueue).toEqual([]);
    expect(result.currentResearch).toBe('fire');
  });

  it('allows the same unit type to appear multiple times in the queue', () => {
    const { state, unit } = fixture();
    const queued = enqueueCityProduction(withQueue(state, [unit]), 'city-river', unit);
    expect(queued.ok && queued.state.cities['city-river'].productionQueue).toEqual([unit, unit]);
  });

  it('prevents queuing a building that is already in the queue (typed, state untouched)', () => {
    const { state, unit } = fixture();
    const queuedState = withQueue(state, [unit, 'shrine']);
    const result = enqueueCityProduction(queuedState, 'city-river', 'shrine');
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.reason).toBe('duplicate');
    expect(result.state).toBe(queuedState);
  });

  it('refuses a bare legendary wonder id: wonders are queued by startLegendaryWonderBuild with its own eligibility', () => {
    const { state } = fixture();
    const result = enqueueCityProduction(state, 'city-river', 'legendary:colosseum');
    expect(result.ok ? null : result.reason).toBe('legendary-wonder');
  });

  it('#545: a consumedOnCompletion building (warhead) is never refused as a duplicate, unlike a normal building', () => {
    const { state } = fixture();
    const result = enqueueCityProduction(withQueue(state, ['warhead']), 'city-river', 'warhead');
    // Without a Manhattan Project it is (correctly) unavailable; the point is that it is not a duplicate.
    expect(result.ok ? null : result.reason).not.toBe('duplicate');
  });

  it('recommends a truly fast opening option instead of the first registered building', () => {
    const state = createNewGame(undefined, 'idle-choice-seed', 'small');
    const playerId = state.currentPlayer;
    const settlerId = state.civilizations[playerId].units.find(unitId => state.units[unitId]?.type === 'settler');
    expect(settlerId).toBeDefined();

    const city = foundCity(playerId, state.units[settlerId!].position, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations[playerId].cities.push(city.id);

    const choice = getRecommendedIdleCityChoice(state, playerId, city.id);

    expect(choice).not.toBeNull();
    expect(choice?.itemId).not.toBe('herbalist');
  });

  it('prices recommended Settler production with the current era cost table', () => {
    const state = createNewGame(undefined, 'idle-settler-era-seed', 'small');
    const playerId = state.currentPlayer;
    state.era = 4;
    state.civilizations[playerId].techState.completed = TECH_TREE
      .filter(tech => tech.era <= 4 && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);
    const settlerId = state.civilizations[playerId].units.find(unitId => state.units[unitId]?.type === 'settler');
    expect(settlerId).toBeDefined();

    const city = {
      ...foundCity(playerId, state.units[settlerId!].position, state.map, state.idCounters),
      buildings: Object.keys(BUILDINGS),
    };
    state.cities[city.id] = city;
    state.civilizations[playerId].cities.push(city.id);

    const originalUnits = [...TRAINABLE_UNITS];
    const settlerEntry = TRAINABLE_UNITS.find(unit => unit.type === 'settler');
    expect(settlerEntry).toBeDefined();
    TRAINABLE_UNITS.splice(0, TRAINABLE_UNITS.length, settlerEntry!);

    try {
      const choice = getRecommendedIdleCityChoice(state, playerId, city.id);

      expect(choice).toMatchObject({
        itemId: 'settler',
        cost: 48,
      });
    } finally {
      TRAINABLE_UNITS.splice(0, TRAINABLE_UNITS.length, ...originalUnits);
    }
  });
});

describe('setIdleProduction', () => {
  it('sets idleProduction mode on the city', () => {
    const city = { productionQueue: [], idleProduction: null } as any;
    const updated = setIdleProduction(city, 'gold');
    expect(updated.idleProduction).toBe('gold');
    expect(updated.productionQueue).toEqual([]);
  });

  it('clears idleProduction when mode is null', () => {
    const city = { productionQueue: [], idleProduction: 'science' } as any;
    const cleared = setIdleProduction(city, null);
    expect(cleared.idleProduction).toBeNull();
  });
});

describe('getIdleCityIds idle-production exclusion', () => {
  it('excludes cities that have idleProduction set even if queue is empty', () => {
    const state = createNewGame(undefined, 'idle-exclude-seed', 'small');
    const playerId = state.currentPlayer;
    const map = generateMap(20, 20, 'idle-exclude');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = { ...foundCity(playerId, tile.coord, map, mkC()), productionQueue: [], idleProduction: 'gold' as const };
    state.cities = { [city.id]: city };
    state.civilizations[playerId].cities = [city.id];

    const ids = getIdleCityIds(state, playerId);
    expect(ids).not.toContain(city.id);
  });

  it('includes cities with empty queue and no idleProduction set', () => {
    const state = createNewGame(undefined, 'idle-include-seed', 'small');
    const playerId = state.currentPlayer;
    const map = generateMap(20, 20, 'idle-include');
    const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = { ...foundCity(playerId, tile.coord, map, mkC()), productionQueue: [], idleProduction: null };
    state.cities = { [city.id]: city };
    state.civilizations[playerId].cities = [city.id];

    const ids = getIdleCityIds(state, playerId);
    expect(ids).toContain(city.id);
  });
});
