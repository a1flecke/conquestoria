import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { advanceRouteRunners } from '@/systems/unit-movement-system';
import { getTradeRouteQuote, getRouteOperatingStatus, settleTradeRouteForCiv } from '@/systems/trade-route-economy';
import { getTradeRouteEligibility } from '@/systems/trade-route-contract';
import { applyRouteControl, getRouteControlOptions } from '@/systems/trade-route-lifecycle';

/**
 * #1502 MR05: ordinary routes run indefinitely and can be changed honestly.
 *
 * The fixture is a five-hex flat corridor between two cities of one civilization, with a trader
 * whose per-round allowance the test supplies exactly as the per-owner-turn reset would.
 */
function makeState(overrides: {
  movement?: number;
  caravanPosition?: { q: number; r: number };
  direction?: 'positioning' | 'outbound' | 'inbound';
  route?: Record<string, unknown>;
  secondTrader?: boolean;
  currentPlayer?: string;
} = {}): GameState {
  const {
    movement = 3,
    caravanPosition = { q: 0, r: 0 },
    direction = 'outbound',
    route = {},
    secondTrader = false,
    currentPlayer = 'alpha',
  } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 5; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'alpha',
    };
  }
  const visibility = { tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, 'fog'])), fogMap: {} };

  const traders: Record<string, unknown> = {
    'trader-1': {
      id: 'trader-1', type: 'caravan', owner: 'alpha', position: caravanPosition,
      health: 100, movementPointsLeft: movement, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
      committedToRouteId: 'route-1', routeDirection: direction,
    },
  };
  if (secondTrader) {
    traders['trader-2'] = {
      id: 'trader-2', type: 'caravan', owner: 'alpha', position: { q: 0, r: 0 },
      health: 100, movementPointsLeft: movement, hasActed: false, hasMoved: false, skippedTurn: false, isResting: false,
    };
  }

  return {
    turn: 7, era: 1, currentPlayer,
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
        cities: ['alpha-city', 'alpha-port'], units: secondTrader ? ['trader-1', 'trader-2'] : ['trader-1'],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility,
      },
      beta: {
        id: 'beta', name: 'Beta', color: '#f00', civType: 'generic', gold: 0,
        cities: [], units: [],
        techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility,
      },
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 4, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
    },
    units: traders,
    barbarianCamps: {}, minorCivs: {}, espionage: {}, pendingEvents: {}, tribalVillages: {},
    discoveredWonders: {}, wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {}, legendaryWonderProjects: {},
    settings: { mapSize: 'small', opponentCount: 1, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

/** The per-owner-turn movement reset the turn loop performs before the runner runs. */
function withResetAllowance(state: GameState, movement = 3): GameState {
  return {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [
      id,
      unit.committedToRouteId ? { ...unit, movementPointsLeft: movement, hasActed: true } : unit,
    ])),
  };
}

/** Runs rounds until the trader reaches `targetCityId`, returning the state and the round count. */
function walkUntilArrival(state: GameState, targetCityId: string, maxRounds = 20): { state: GameState; rounds: number } {
  let current = state;
  for (let rounds = 1; rounds <= maxRounds; rounds++) {
    current = advanceRouteRunners(withResetAllowance({ ...current, turn: current.turn + 1 }), new EventBus());
    const caravan = current.units['trader-1']!;
    const target = current.cities[targetCityId]!;
    if (caravan.position.q === target.position.q && caravan.position.r === target.position.r) {
      return { state: current, rounds };
    }
  }
  throw new Error(`trader never reached ${targetCityId}`);
}

describe('#1502 MR05 — travel matches the quote, and the trader repeats', () => {
  it('walks its whole leg in the quoted number of rounds', () => {
    const state = makeState();
    const quote = getTradeRouteQuote(state, {
      caravanUnitId: 'trader-1',
      originCityId: 'alpha-city',
      toCityId: 'alpha-port',
    })!;
    // Four flat hexes, three movement: three hexes in the first round, the last one in the second.
    expect(quote.legRounds).toBe(2);

    const { rounds } = walkUntilArrival(state, 'alpha-port');

    expect(rounds).toBe(quote.legRounds);
  });

  it('takes more rounds over rough ground, exactly as the quote prices it', () => {
    const rough = makeState();
    rough.map.tiles['1,0'] = { ...rough.map.tiles['1,0'], terrain: 'hills' } as never;
    rough.map.tiles['2,0'] = { ...rough.map.tiles['2,0'], terrain: 'hills' } as never;
    const quote = getTradeRouteQuote(rough, {
      caravanUnitId: 'trader-1',
      originCityId: 'alpha-city',
      toCityId: 'alpha-port',
    })!;

    const { rounds } = walkUntilArrival(rough, 'alpha-port');

    expect(quote.legRounds).toBe(3);
    expect(rounds).toBe(quote.legRounds);
  });

  it('keeps the same trader and route across many complete round trips', () => {
    let state = makeState({ movement: 2 });
    let paidRounds = 0;

    for (let trip = 0; trip < 3; trip++) {
      const outbound = walkUntilArrival(state, 'alpha-port');
      state = outbound.state;
      const inbound = walkUntilArrival(state, 'alpha-city');
      state = inbound.state;

      expect(state.units['trader-1']).toBeDefined();
      expect(state.marketplace!.tradeRoutes).toHaveLength(1);
      paidRounds += outbound.rounds + inbound.rounds;
    }

    // Every round of travel was a payable round: the route never expired and never needed retraining.
    expect(paidRounds).toBeGreaterThan(0);
    expect(state.units['trader-1']!.committedToRouteId).toBe('route-1');
  });

  it('preserves the same next step across a save/reload of the running route', () => {
    const state = makeState({ movement: 2 });
    const reloaded = JSON.parse(JSON.stringify(state)) as GameState;

    const fromLive = advanceRouteRunners(withResetAllowance(state), new EventBus());
    const fromSave = advanceRouteRunners(withResetAllowance(reloaded), new EventBus());

    expect(fromSave.units['trader-1']!.position).toEqual(fromLive.units['trader-1']!.position);
    expect(fromSave.marketplace!.tradeRoutes[0]!.lastProgressTurn).toBe(fromLive.marketplace!.tradeRoutes[0]!.lastProgressTurn);
  });
});

describe('#1502 MR05 — pause, resume and cancel-and-return', () => {
  it('holds the trader and earns nothing while paused, and resumes where it stopped', () => {
    const paused = applyRouteControl(makeState(), 'route-1', 'pause', 'alpha');
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;

    const held = advanceRouteRunners(withResetAllowance(paused.state), new EventBus());
    expect(held.units['trader-1']!.position).toEqual({ q: 0, r: 0 });
    expect(held.marketplace!.tradeRoutes[0]!.lastProgressTurn).toBeUndefined();
    expect(getRouteOperatingStatus(held, 'route-1').reason).toBe('paused');
    expect(settleTradeRouteForCiv(held, 'alpha').paid).toBe(0);

    const resumed = applyRouteControl(held, 'route-1', 'resume', 'alpha');
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    const moved = advanceRouteRunners(withResetAllowance(resumed.state), new EventBus());
    expect(moved.units['trader-1']!.position.q).toBeGreaterThan(0);
  });

  it('refuses a repeated pause and a resume that is not paused', () => {
    const paused = applyRouteControl(makeState(), 'route-1', 'pause', 'alpha');
    if (!paused.ok) throw new Error('pause refused');

    const again = applyRouteControl(paused.state, 'route-1', 'pause', 'alpha');
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe('already-paused');

    const resume = applyRouteControl(makeState(), 'route-1', 'resume', 'alpha');
    expect(resume.ok).toBe(false);
    if (resume.ok) return;
    expect(resume.reason).toBe('not-paused');
  });

  it('keeps the origin slot occupied until the cancelled trader is actually home', () => {
    const cancelled = applyRouteControl(makeState({ secondTrader: true }), 'route-1', 'cancel-and-return', 'alpha');
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;

    // Commerce stops at once and the trader turns for home, but the route (and its slot) stays.
    expect(cancelled.state.units['trader-1']!.routeDirection).toBe('inbound');
    expect(cancelled.state.marketplace!.tradeRoutes).toHaveLength(1);
    expect(getRouteOperatingStatus(cancelled.state, 'route-1').paying).toBe(false);
    const blockedAssignment = getTradeRouteEligibility(cancelled.state, {
      caravanUnitId: 'trader-2', toCityId: 'alpha-port', actingCivId: 'alpha',
    });
    expect(blockedAssignment.ok).toBe(false);

    const home = walkUntilArrival(cancelled.state, 'alpha-city').state;

    // Home at last: the route ends, the slot frees and the trader can be reassigned.
    expect(home.marketplace!.tradeRoutes).toHaveLength(0);
    expect(home.units['trader-1']!.committedToRouteId).toBeUndefined();
    expect(home.units['trader-1']!.routeDirection).toBeUndefined();
    const freedAssignment = getTradeRouteEligibility(home, {
      caravanUnitId: 'trader-2', toCityId: 'alpha-port', actingCivId: 'alpha',
    });
    expect(freedAssignment.ok).toBe(true);
  });

  it('refuses every control off-turn and for a route another civilization owns', () => {
    const offTurn = getRouteControlOptions(makeState({ currentPlayer: 'beta' }), 'route-1', 'alpha');
    expect(offTurn.every(option => !option.enabled && option.reason === 'not-your-turn')).toBe(true);

    const foreign = getRouteControlOptions(makeState(), 'route-1', 'beta');
    expect(foreign.every(option => !option.enabled && option.reason === 'not-owner')).toBe(true);

    const missing = applyRouteControl(makeState(), 'route-9', 'pause', 'alpha');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toBe('route-missing');
  });
});
