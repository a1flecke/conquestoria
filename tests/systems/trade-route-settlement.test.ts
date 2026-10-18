import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { advanceRouteRunners } from '@/systems/unit-movement-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { settleTradeRouteForCiv } from '@/systems/trade-route-economy';
import { getEntitledTradeDestinations } from '@/systems/commerce-projection';

/**
 * The #1501 golden fixture, driven through the real round functions: a route is created, the runner
 * advances it, the income phase settles it, and a pirate kill removes it — with the payable round
 * budget bounding what a detour can earn.
 */
function makeRouteState(overrides: {
  route?: Record<string, unknown>;
  caravanPosition?: { q: number; r: number };
  direction?: 'positioning' | 'outbound' | 'inbound';
  /** #1502 MR05: the trader's per-round movement allowance (default 3, the caravan's). */
  movement?: number;
} = {}): GameState {
  const { route = {}, caravanPosition = { q: 1, r: 0 }, direction = 'outbound', movement = 3 } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 5; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
    };
  }
  const visibility = { tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, 'fog'])), fogMap: {} };

  return {
    turn: 7, era: 1, currentPlayer: 'alpha',
    map: { tiles, width: 5, height: 2, wrapsHorizontally: false, rivers: [] },
    idCounters: { nextUnitId: 10, nextCityId: 10, nextCampId: 10, nextQuestId: 10, nextRouteId: 2 },
    marketplace: {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, purchasedResources: [],
      tradeRoutes: [{
        id: 'route-1', fromCityId: 'alpha-city', toCityId: 'alpha-port',
        goldPerTrip: 12, turnsPerTrip: 4, serviceRoundsRemaining: 8, ...route,
      } as never],
    },
    civilizations: {
      alpha: {
        id: 'alpha', name: 'Alpha', color: '#00f', civType: 'generic', gold: 0,
        cities: ['alpha-city', 'alpha-port'], units: ['trader-1'],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility,
      },
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 4, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
    },
    units: {
      'trader-1': {
        id: 'trader-1', type: 'caravan', owner: 'alpha', position: caravanPosition,
        health: 100, movementPointsLeft: movement, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
        committedToRouteId: 'route-1', routeDirection: direction,
      },
    },
    barbarianCamps: {}, minorCivs: {}, espionage: {}, pendingEvents: {}, tribalVillages: {},
    discoveredWonders: {}, wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {}, legendaryWonderProjects: {},
    settings: { mapSize: 'small', opponentCount: 1, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

describe('#1501 golden fixture — the route advances and is paid once', () => {
  it('pays the promised rate exactly once for a round in which the trader advanced', () => {
    const bus = new EventBus();
    const advanced = advanceRouteRunners(makeRouteState(), bus);

    // The trader walked its whole leg this round and recorded validated progress.
    expect(advanced.units['trader-1'].position).toEqual({ q: 4, r: 0 });
    expect(advanced.marketplace!.tradeRoutes[0]!.lastProgressTurn).toBe(advanced.turn);

    const settled = settleTradeRouteForCiv(advanced, 'alpha');
    const promised = settled.state.marketplace!.tradeRoutes[0]!;
    expect(settled.paid).toBeGreaterThan(0);

    // Same state replay: no additional payment.
    const replay = settleTradeRouteForCiv(settled.state, 'alpha');
    expect(replay.paid).toBe(0);
    expect(replay.state.marketplace!.tradeRoutes[0]!.lastSettledTurn).toBe(promised.lastSettledTurn);
  });

  it('pays nothing in the next round when the trader cannot advance', () => {
    const advancedOnce = advanceRouteRunners(makeRouteState(), new EventBus());
    const settled = settleTradeRouteForCiv(advancedOnce, 'alpha');
    expect(settled.paid).toBeGreaterThan(0);

    // Next round: no runner advance happens (the route was not visited), so no progress is recorded.
    const nextRound: GameState = { ...settled.state, turn: settled.state.turn + 1 };
    const blocked = settleTradeRouteForCiv(nextRound, 'alpha');

    expect(blocked.paid).toBe(0);
    expect(blocked.reasons).toContain('blocked');
  });

  it('pays nothing for a trader destroyed before settlement, and closes its route', () => {
    const advanced = advanceRouteRunners(makeRouteState(), new EventBus());

    // Pirates destroy the trader before the income phase settles.
    const afterKill = removeUnits(advanced, ['trader-1'], { reason: 'destroyed' }).state;

    expect(afterKill.marketplace!.tradeRoutes).toHaveLength(0);
    expect(settleTradeRouteForCiv(afterKill, 'alpha').paid).toBe(0);
  });

  it('cannot exceed the leg’s payable-round budget, and renews it only at home', () => {
    // One movement point per round over a four-hex leg, with a two-round payable budget: the trader
    // needs more rounds than the budget allows, so the extra rounds of a long detour earn nothing.
    // The per-owner-turn reset is what grants the allowance, so the test applies it between rounds.
    const withResetAllowance = (s: GameState): GameState => ({
      ...s,
      units: { ...s.units, 'trader-1': { ...s.units['trader-1']!, movementPointsLeft: 1 } },
    });
    let state = withResetAllowance(makeRouteState({
      route: { serviceRoundsRemaining: 2, turnsPerTrip: 1 },
      caravanPosition: { q: 0, r: 0 },
      movement: 1,
    }));

    const first = settleTradeRouteForCiv(advanceRouteRunners(state, new EventBus()), 'alpha');
    expect(first.paid).toBeGreaterThan(0);
    state = withResetAllowance({ ...first.state, turn: first.state.turn + 1 });
    const second = settleTradeRouteForCiv(advanceRouteRunners(state, new EventBus()), 'alpha');
    expect(second.paid).toBeGreaterThan(0);
    state = withResetAllowance({ ...second.state, turn: second.state.turn + 1 });

    // Third round: the budget is spent, so a long detour earns nothing more.
    const third = settleTradeRouteForCiv(advanceRouteRunners(state, new EventBus()), 'alpha');
    expect(third.paid).toBe(0);
    expect(third.reasons).toContain('service-complete');
  });

  it('renews the payable budget when the trader is home, without paying for the spent round', () => {
    // A spent budget is refreshed at home for the next departure rather than carrying the deficit
    // into the next round trip — but the spent round itself is still not payable.
    const state = makeRouteState({ route: { serviceRoundsRemaining: 0 }, caravanPosition: { q: 0, r: 0 } });
    const settled = settleTradeRouteForCiv(state, 'alpha');

    expect(settled.paid).toBe(0);
    expect(settled.state.marketplace!.tradeRoutes[0]!.serviceRoundsRemaining).toBe(8);
  });

  it('pays no commerce income while the trader is still positioning', () => {
    const positioning = makeRouteState({ direction: 'positioning', caravanPosition: { q: 3, r: 0 } });

    const settled = settleTradeRouteForCiv(positioning, 'alpha');

    expect(settled.paid).toBe(0);
  });
});

describe('#1501 — preview and realized payment use identical modifiers', () => {
  it('quotes the same per-turn reward the first settlement pays', () => {
    // The existing route departs from the port, so the port stays a *destination* row for the quote.
    const committed = makeRouteState({ route: { fromCityId: 'alpha-port' } });
    // The chooser previews with an uncommitted trader; the settlement runs the committed one. Both
    // must price the same (origin, destination) pair identically.
    const previewState: GameState = {
      ...committed,
      units: {
        ...committed.units,
        'trader-1': { ...committed.units['trader-1']!, committedToRouteId: undefined, hasActed: false },
      },
    };
    const preview = getEntitledTradeDestinations(previewState, 'alpha', 'trader-1')
      .find(row => row.cityId === 'alpha-port')!;
    expect(preview.eligible).toBe(true);

    const settled = settleTradeRouteForCiv(advanceRouteRunners(committed, new EventBus()), 'alpha');

    expect(settled.paid).toBe(preview.goldPerTurn);
  });
});
