import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { applyTradeRouteDeliveries } from '@/systems/trade-route-delivery';

/**
 * #1504 MR07: a delivery is credited once, to its one named recipient, through the same city/research
 * fields the normal turn uses — never an empire-wide yield.
 */
function makeState(): GameState {
  const city = (id: string, owner: string, extra: Record<string, unknown> = {}) => ({
    id, name: id, owner, position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [],
    productionQueue: [], productionProgress: 0, food: 0, ...extra,
  });
  return {
    turn: 10,
    cities: {
      'dest-city': city('dest-city', 'alpha', { productionQueue: ['granary'], productionProgress: 5, food: 20 }),
      'idle-city': city('idle-city', 'alpha', { productionQueue: [], productionProgress: 3, food: 1 }),
    },
    civilizations: {
      alpha: { id: 'alpha', techState: { completed: [], currentResearch: 'trade-routes', researchQueue: [], researchProgress: 40 } },
      beta: { id: 'beta', techState: { completed: [], currentResearch: 'trade-routes', researchQueue: [], researchProgress: 7 } },
    },
    units: {}, minorCivs: {}, barbarianCamps: {}, map: { tiles: {}, width: 5, height: 5, wrapsHorizontally: false, rivers: [] },
  } as unknown as GameState;
}

describe('#1504 MR07 — recipient-specific delivery', () => {
  it('credits food to the named destination city and nowhere else', () => {
    const state = makeState();
    const next = applyTradeRouteDeliveries(state, [
      { routeId: 'route-1', recipient: 'destination-city-food', cityId: 'dest-city', amount: 2 },
    ]);

    expect(next.cities['dest-city'].food).toBe(22);
    expect(next.cities['idle-city'].food).toBe(1);           // no free food to every city
    expect(next.civilizations.alpha.techState.researchProgress).toBe(40);
    expect(next.marketplace).toBeUndefined();
  });

  it('credits production only to a city with an active build', () => {
    const state = makeState();
    const next = applyTradeRouteDeliveries(state, [
      { routeId: 'route-1', recipient: 'destination-city-production', cityId: 'dest-city', amount: 2 },
      { routeId: 'route-2', recipient: 'destination-city-production', cityId: 'idle-city', amount: 2 },
    ]);

    expect(next.cities['dest-city'].productionProgress).toBe(7);
    expect(next.cities['idle-city'].productionProgress).toBe(3); // nothing being built, nothing credited
  });

  it('credits research to the named civilization only', () => {
    const state = makeState();
    const next = applyTradeRouteDeliveries(state, [
      { routeId: 'route-1', recipient: 'owner-research', civId: 'alpha', amount: 2 },
    ]);

    expect(next.civilizations.alpha.techState.researchProgress).toBe(42);
    expect(next.civilizations.beta.techState.researchProgress).toBe(7);
  });

  it('credits no research when nothing is being researched', () => {
    const state = makeState();
    const idle: GameState = {
      ...state,
      civilizations: {
        ...state.civilizations,
        alpha: { ...state.civilizations.alpha, techState: { ...state.civilizations.alpha.techState, currentResearch: null } },
      },
    };

    const next = applyTradeRouteDeliveries(idle, [
      { routeId: 'route-1', recipient: 'owner-research', civId: 'alpha', amount: 2 },
    ]);

    expect(next.civilizations.alpha.techState.researchProgress).toBe(40);
  });

  it('never mutates the input state and ignores a missing recipient or a non-positive amount', () => {
    const state = makeState();
    const before = JSON.parse(JSON.stringify(state));

    const next = applyTradeRouteDeliveries(state, [
      { routeId: 'a', recipient: 'destination-city-food', cityId: 'missing', amount: 5 },
      { routeId: 'b', recipient: 'owner-research', civId: 'missing', amount: 5 },
      { routeId: 'c', recipient: 'destination-city-food', cityId: 'dest-city', amount: 0 },
    ]);

    expect(next).toBe(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(before);
    // An empty delivery list allocates nothing at all.
    expect(applyTradeRouteDeliveries(state, [])).toBe(state);
  });
});
