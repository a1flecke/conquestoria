import { describe, expect, it } from 'vitest';
import { applyAIGoldSpending } from '@/ai/ai-treasury';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';

function setupState(cityIds = ['city-a']): GameState {
  const state = createNewGame(undefined, `ai-treasury-${cityIds.join('-')}`, 'small');
  const civ = state.civilizations['ai-1']!;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  civ.cities = [];
  for (const [index, cityId] of cityIds.entries()) {
    const city = foundCity(
      civ.id,
      index === 0
        ? settler.position
        : { q: settler.position.q + index * 3, r: settler.position.r },
      state.map,
      state.idCounters,
    );
    city.id = cityId;
    city.population = 4;
    city.productionQueue = [];
    city.productionProgress = 0;
    state.cities[cityId] = city;
    civ.cities.push(cityId);
    for (const coord of [city.position, ...hexNeighbors(city.position)]) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) {
        tile.terrain = 'plains';
      }
    }
  }
  civ.units = civ.units.filter(id => state.units[id]?.type !== 'settler');
  delete state.units[settler.id];
  return state;
}

describe('applyAIGoldSpending (#1094)', () => {
  it('rush-buys active production when gold comfortably exceeds the maintenance reserve', () => {
    const state = setupState();
    const civ = state.civilizations['ai-1']!;
    civ.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.cities['city-a']!.productionQueue).toEqual([]);
    expect(result.civilizations['ai-1']!.gold).toBeLessThan(5000);
  });

  it('does nothing when the city has no active production', () => {
    const state = setupState();
    state.civilizations['ai-1']!.gold = 5000;
    state.cities['city-a']!.productionQueue = [];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.civilizations['ai-1']!.gold).toBe(5000);
  });

  it('does not spend below the maintenance reserve, but does once gold clears it', () => {
    // warrior costs 8 production; rushBuyMultiplier is 2.5, so rushing from 0
    // progress costs ceil(8 * 2.5) = 20. With population 1 (zero free building
    // slots) and one non-core building, building upkeep is a flat 1/turn, so
    // the 2-round reserve this module requires is 2. 21 gold covers the rush
    // cost but leaves only 1 in reserve (< 2) -- must not spend. 22 leaves
    // exactly 2 -- must spend.
    const belowReserve = setupState();
    belowReserve.cities['city-a']!.population = 1;
    belowReserve.cities['city-a']!.buildings.push('walls');
    belowReserve.cities['city-a']!.productionQueue = ['warrior'];
    belowReserve.civilizations['ai-1']!.gold = 21;
    const belowResult = applyAIGoldSpending(belowReserve, 'ai-1', new EventBus());
    expect(belowResult.civilizations['ai-1']!.gold).toBe(21);
    expect(belowResult.cities['city-a']!.productionQueue).toEqual(['warrior']);

    const atReserve = setupState();
    atReserve.cities['city-a']!.population = 1;
    atReserve.cities['city-a']!.buildings.push('walls');
    atReserve.cities['city-a']!.productionQueue = ['warrior'];
    atReserve.civilizations['ai-1']!.gold = 22;
    const atResult = applyAIGoldSpending(atReserve, 'ai-1', new EventBus());
    expect(atResult.civilizations['ai-1']!.gold).toBe(2);
    expect(atResult.cities['city-a']!.productionQueue).toEqual([]);
  });

  it('does not rush-buy when gold is short of the rush cost (delegated to getRushBuyQuote)', () => {
    const state = setupState();
    state.civilizations['ai-1']!.gold = 1;
    state.cities['city-a']!.productionQueue = ['warrior'];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.civilizations['ai-1']!.gold).toBe(1);
    expect(result.cities['city-a']!.productionQueue).toEqual(['warrior']);
  });

  it('rush-buys across multiple cities in one round while gold allows it', () => {
    const state = setupState(['city-a', 'city-b']);
    const civ = state.civilizations['ai-1']!;
    civ.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];
    state.cities['city-b']!.productionQueue = ['worker'];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.cities['city-a']!.productionQueue).toEqual([]);
    expect(result.cities['city-b']!.productionQueue).toEqual([]);
  });

  it('never touches an unrelated civ or a human-owned city', () => {
    const state = setupState();
    state.civilizations['ai-1']!.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];
    state.cities['city-a']!.owner = 'player';

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.cities['city-a']!.productionQueue).toEqual(['warrior']);
    expect(result.civilizations['ai-1']!.gold).toBe(5000);
  });

  it('is a no-op for an unknown civ id', () => {
    const state = setupState();
    const result = applyAIGoldSpending(state, 'unknown-civ', new EventBus());
    expect(result).toBe(state);
  });
});
