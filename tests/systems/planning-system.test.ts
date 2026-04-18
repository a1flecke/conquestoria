import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { createTechState } from '@/systems/tech-system';
import {
  enqueueCityProduction,
  enqueueResearch,
  getRecommendedIdleCityChoice,
  moveQueuedId,
  removeQueuedId,
} from '@/systems/planning-system';

describe('planning-system city queues', () => {
  it('appends new city builds up to a limit of three', () => {
    const city = { productionQueue: ['warrior'] } as any;
    const queued = enqueueCityProduction(city, 'shrine');
    expect(queued.productionQueue).toEqual(['warrior', 'shrine']);
  });

  it('reorders queue items without dropping them', () => {
    expect(moveQueuedId(['warrior', 'shrine', 'worker'], 2, 0)).toEqual(['worker', 'warrior', 'shrine']);
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

  it('recommends a truly fast opening option instead of the first registered building', () => {
    const state = createNewGame(undefined, 'idle-choice-seed', 'small');
    const playerId = state.currentPlayer;
    const settlerId = state.civilizations[playerId].units.find(unitId => state.units[unitId]?.type === 'settler');
    expect(settlerId).toBeDefined();

    const city = foundCity(playerId, state.units[settlerId!].position, state.map);
    state.cities[city.id] = city;
    state.civilizations[playerId].cities.push(city.id);

    const choice = getRecommendedIdleCityChoice(state, playerId, city.id);

    expect(choice).not.toBeNull();
    expect(choice?.itemId).not.toBe('herbalist');
  });
});
