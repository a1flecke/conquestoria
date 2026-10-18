import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import {
  getTradeRouteQuote,
  getRouteOperatingStatus,
  settleTradeRouteForCiv,
} from '@/systems/trade-route-economy';

/** Flat corridor: origin at (0,0), destination at (3,0) — three steps for a land trader. */
function makeState(overrides: {
  caravanPosition?: { q: number; r: number };
  direction?: 'positioning' | 'outbound' | 'inbound';
  route?: Partial<Record<string, unknown>>;
  explored?: string[];
  techs?: string[];
  noRunner?: boolean;
  /** #1502 MR05: per-tile terrain overrides, to price a rough leg against a flat one. */
  terrain?: Record<string, string>;
} = {}): GameState {
  const {
    caravanPosition = { q: 0, r: 0 },
    direction = 'outbound',
    route = {},
    explored = ['0,0', '1,0', '2,0', '3,0'],
    techs = ['trade-routes'],
    noRunner = false,
    terrain = {},
  } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 4; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
    };
  }
  for (const [key, value] of Object.entries(terrain)) {
    if (tiles[key]) tiles[key] = { ...(tiles[key] as Record<string, unknown>), terrain: value };
  }
  const alphaTiles: Record<string, string> = { '0,0': 'visible' };
  for (const key of explored) alphaTiles[key] = 'fog';

  const tradeRoute = {
    id: 'route-1', fromCityId: 'alpha-city', toCityId: 'alpha-port',
    goldPerTrip: 9, turnsPerTrip: 3, ...route,
  };

  return {
    turn: 10, era: 1, currentPlayer: 'alpha',
    map: { tiles, width: 4, height: 2, wrapsHorizontally: false, rivers: [] },
    idCounters: { nextUnitId: 10, nextCityId: 10, nextCampId: 10, nextQuestId: 10, nextRouteId: 2 },
    marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, purchasedResources: [], tradeRoutes: [tradeRoute as never] },
    civilizations: {
      alpha: {
        id: 'alpha', name: 'Alpha', color: '#00f', civType: 'generic', gold: 100,
        cities: ['alpha-city', 'alpha-port'], units: noRunner ? [] : ['trader-1'],
        techState: { completed: techs, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility: { tiles: alphaTiles, fogMap: {} },
      },
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 3, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
    },
    units: noRunner ? {} : {
      'trader-1': {
        id: 'trader-1', type: 'caravan', owner: 'alpha', position: caravanPosition,
        health: 100, movementPointsLeft: 3, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
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

describe('getTradeRouteQuote — one quote for preview and execution', () => {
  it('derives timing from the trader’s own path and its real movement allowance', () => {
    const quote = getTradeRouteQuote(makeState(), { caravanUnitId: 'trader-1', originCityId: 'alpha-city', toCityId: 'alpha-port' })!;

    expect(quote).not.toBeNull();
    // Three flat hexes and a 3-movement caravan (#1502 MR05): the whole leg is walked in one round.
    expect(quote.legRounds).toBe(1);
    expect(quote.roundTripRounds).toBe(2);
    expect(quote.turnsPerTrip).toBe(1);
  });

  it('prices a rough leg in more rounds than the same leg over flat ground', () => {
    const request = { caravanUnitId: 'trader-1', originCityId: 'alpha-city', toCityId: 'alpha-port' };
    const flat = getTradeRouteQuote(makeState(), request)!;
    const rough = getTradeRouteQuote(makeState({ terrain: { '1,0': 'hills' } }), request)!;

    expect(flat.legRounds).toBe(1);
    expect(rough.legRounds).toBeGreaterThan(flat.legRounds);
  });

  it('names the recipient and the modifiers that produced the reward', () => {
    const quote = getTradeRouteQuote(makeState(), { caravanUnitId: 'trader-1', originCityId: 'alpha-city', toCityId: 'alpha-port' })!;

    expect(quote.recipientCivId).toBe('alpha');
    expect(quote.goldPerTurn).toBeGreaterThan(0);
    expect(quote.modifiers.map(modifier => modifier.id)).toContain('base');
    expect(quote.modifiers.reduce((total, modifier) => total + modifier.goldPerTurn, 0)).toBe(quote.goldPerTurn);
  });

  it('is identical whether or not a route already exists for the pair', () => {
    const preview = getTradeRouteQuote(makeState({ route: { goldPerTrip: 1 } }), { caravanUnitId: 'trader-1', originCityId: 'alpha-city', toCityId: 'alpha-port' })!;
    const fresh = getTradeRouteQuote(makeState({ noRunner: true, route: {} }), { caravanUnitId: 'trader-1', originCityId: 'alpha-city', toCityId: 'alpha-port' })!;

    expect(fresh.goldPerTurn).toBe(preview.goldPerTurn);
    expect(fresh.roundTripRounds).toBe(preview.roundTripRounds);
  });
});

describe('getRouteOperatingStatus — promised rate vs current actual', () => {
  it('reports operating when the trader is outbound and paying its promised rate', () => {
    const status = getRouteOperatingStatus(makeState(), 'route-1');

    expect(status.paying).toBe(true);
    expect(status.reason).toBeNull();
    expect(status.goldPerTurn).toBeGreaterThan(0);
  });

  it('reports zero with a reason while positioning', () => {
    const status = getRouteOperatingStatus(makeState({ direction: 'positioning', caravanPosition: { q: 0, r: 0 } }), 'route-1');

    expect(status.paying).toBe(false);
    expect(status.reason).toBe('positioning');
    expect(status.goldPerTurn).toBe(0);
  });

  it('reports zero with a reason when the trader is gone and the route has no runner', () => {
    const status = getRouteOperatingStatus(makeState({ noRunner: true, route: { lastSettledTurn: 10 } }), 'route-1');

    expect(status.paying).toBe(false);
    expect(status.reason).toBe('no-trader');
    expect(status.goldPerTurn).toBe(0);
  });
});

describe('settleTradeRouteForCiv — paid once, only for live service', () => {
  it('pays the promised rate exactly once for a round of progress', () => {
    const state = makeState({ route: { lastProgressTurn: 10 } });

    const first = settleTradeRouteForCiv(state, 'alpha');
    expect(first.paid).toBeGreaterThan(0);

    // A replay of the same round pays nothing more (stable settlement identity).
    const replay = settleTradeRouteForCiv(first.state, 'alpha');
    expect(replay.paid).toBe(0);
    expect(replay.state.marketplace!.tradeRoutes[0]!.lastSettledTurn).toBe(10);
  });

  it('pays nothing for a round in which the trader made no progress', () => {
    const state = makeState({ route: { lastProgressTurn: 9 } });

    const result = settleTradeRouteForCiv(state, 'alpha');

    expect(result.paid).toBe(0);
    expect(result.reasons).toContain('blocked');
  });

  it('pays nothing while positioning, and nothing for a route with no trader left', () => {
    expect(settleTradeRouteForCiv(makeState({ direction: 'positioning', route: { lastProgressTurn: 10 } }), 'alpha').paid).toBe(0);
    expect(settleTradeRouteForCiv(makeState({ noRunner: true, route: { lastProgressTurn: 10 } }), 'alpha').paid).toBe(0);
  });

  it('cannot be paid beyond the leg’s payable-round budget', () => {
    // Budget already consumed: a detour of any length cannot mint another payment.
    const state = makeState({ route: { lastProgressTurn: 10, serviceRoundsRemaining: 0 } });

    const result = settleTradeRouteForCiv(state, 'alpha');

    expect(result.paid).toBe(0);
    expect(result.reasons).toContain('service-complete');
  });

  it('decrements the budget as it pays, and refreshes it at home', () => {
    // Away from home: a served round consumes one round of the leg's budget.
    const state = makeState({ caravanPosition: { q: 2, r: 0 }, route: { lastProgressTurn: 10, serviceRoundsRemaining: 6 } });

    const first = settleTradeRouteForCiv(state, 'alpha');
    expect(first.state.marketplace!.tradeRoutes[0]!.serviceRoundsRemaining).toBe(5);

    // Home arrival (inbound leg complete, next round) refreshes the terms for the next departure.
    const home = settleTradeRouteForCiv(
      {
        ...first.state,
        turn: 11,
        units: { ...first.state.units, 'trader-1': { ...first.state.units['trader-1']!, routeDirection: 'inbound', position: { q: 0, r: 0 } } },
      },
      'alpha',
    );
    expect(home.state.marketplace!.tradeRoutes[0]!.serviceRoundsRemaining).toBe(6);
  });

  it('ignores routes whose origin belongs to another civilization', () => {
    const state = makeState({ route: { lastProgressTurn: 10 } });

    expect(settleTradeRouteForCiv(state, 'beta').paid).toBe(0);
  });
});
