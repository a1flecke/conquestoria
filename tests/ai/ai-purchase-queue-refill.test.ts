import { describe, expect, it, vi } from 'vitest';
import { processAITurn } from '@/ai/basic-ai';
import { refillAIQueuesEmptiedByPurchase } from '@/ai/ai-production';
import { applyAIGoldSpending } from '@/ai/ai-treasury';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import * as rushBuy from '@/systems/rush-buy-system';

/**
 * #1688: the AI queues production, then spends gold. Its queues hold one item, so a successful purchase
 * completes that item and leaves the queue empty; without a refill `processCity` sees an empty queue with no
 * idle mode and discards the city's whole output for the round.
 */
function setupAICity(seed: string): GameState {
  const state = createNewGame({
    civType: 'generic',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'ai-purchase-refill',
    seed,
  });
  const civ = state.civilizations['ai-1']!;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
  city.id = 'city-a';
  city.population = 4;
  city.productionQueue = [];
  city.productionProgress = 0;
  state.cities[city.id] = city;
  civ.cities = [city.id];
  for (const coord of [city.position, ...hexNeighbors(city.position)]) {
    const tile = state.map.tiles[hexKey(coord)];
    if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) tile.terrain = 'plains';
  }
  civ.units = civ.units.filter(id => state.units[id]?.type !== 'settler');
  delete state.units[settler.id];
  return state;
}

function hasWorkForTheRound(state: GameState, cityId: string): boolean {
  const city = state.cities[cityId]!;
  return city.productionQueue.length > 0 || city.idleProduction != null;
}

describe('AI refills a queue its own purchase emptied (#1688)', () => {
  it('a purchase alone leaves the queue empty with no idle conversion (the defect)', () => {
    const state = setupAICity('ai-purchase-refill-defect');
    state.civilizations['ai-1']!.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];

    const spent = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(spent.cities['city-a']!.productionQueue).toEqual([]);
    expect(hasWorkForTheRound(spent, 'city-a')).toBe(false);
  });

  it('refills the emptied city through the canonical pass', () => {
    const state = setupAICity('ai-purchase-refill-unit');
    state.civilizations['ai-1']!.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];
    const spent = applyAIGoldSpending(state, 'ai-1', new EventBus());

    const refilled = refillAIQueuesEmptiedByPurchase(
      spent,
      'ai-1',
      [{ cityId: 'city-a', purchasedItemId: 'warrior' }],
      [],
      { traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5 },
    );

    expect(hasWorkForTheRound(refilled, 'city-a')).toBe(true);
    // Nothing else about the purchase is undone.
    expect(refilled.civilizations['ai-1']!.gold).toBe(spent.civilizations['ai-1']!.gold);
    expect(refilled.civilizations['ai-1']!.units).toEqual(spent.civilizations['ai-1']!.units);
  });

  it('leaves a city alone when its queue is not empty or it is not the civ\'s', () => {
    const state = setupAICity('ai-purchase-refill-guard');
    state.cities['city-a']!.productionQueue = ['warrior'];
    const personality = { traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5 };

    expect(refillAIQueuesEmptiedByPurchase(
      state, 'ai-1', [{ cityId: 'city-a', purchasedItemId: 'warrior' }], [], personality,
    )).toBe(state);
    expect(refillAIQueuesEmptiedByPurchase(
      state, 'player', [{ cityId: 'city-a', purchasedItemId: 'warrior' }], [], personality,
    )).toBe(state);
    expect(refillAIQueuesEmptiedByPurchase(state, 'ai-1', [], [], personality)).toBe(state);
  });

  it('a whole AI turn that buys its only queued item still leaves the city work before the world phase', () => {
    const state = setupAICity('ai-purchase-refill-turn');
    state.civilizations['ai-1']!.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];
    const purchases: string[] = [];
    const original = rushBuy.rushBuyActiveProduction;
    const spy = vi.spyOn(rushBuy, 'rushBuyActiveProduction').mockImplementation((...args) => {
      const result = original(...args);
      if (result.success) purchases.push(args[2]);
      return result;
    });
    let after: GameState;
    try {
      after = processAITurn(state, 'ai-1', new EventBus());
    } finally {
      spy.mockRestore();
    }

    // Earned control: the purchase really happened, so the queue really was emptied mid-turn.
    expect(purchases).toContain('city-a');
    expect(hasWorkForTheRound(after, 'city-a')).toBe(true);
  });
});
