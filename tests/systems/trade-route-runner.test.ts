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
    // Two rows, so a detour around a blocked tile exists (MR05b).
    for (let r = 0; r < 2; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'alpha',
      };
    }
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
    // Rough ground the detour cannot beat: mountains on the direct row, and no cheaper way round.
    rough.map.tiles['1,0'] = { ...rough.map.tiles['1,0'], terrain: 'mountain' } as never;
    rough.map.tiles['2,0'] = { ...rough.map.tiles['2,0'], terrain: 'mountain' } as never;
    rough.map.tiles['3,0'] = { ...rough.map.tiles['3,0'], terrain: 'mountain' } as never;
    rough.map.tiles['0,1'] = { ...rough.map.tiles['0,1'], terrain: 'mountain' } as never;
    rough.map.tiles['1,1'] = { ...rough.map.tiles['1,1'], terrain: 'mountain' } as never;
    rough.map.tiles['2,1'] = { ...rough.map.tiles['2,1'], terrain: 'mountain' } as never;
    rough.map.tiles['3,1'] = { ...rough.map.tiles['3,1'], terrain: 'mountain' } as never;
    const flatQuote = getTradeRouteQuote(makeState(), {
      caravanUnitId: 'trader-1',
      originCityId: 'alpha-city',
      toCityId: 'alpha-port',
    })!;
    const quote = getTradeRouteQuote(rough, {
      caravanUnitId: 'trader-1',
      originCityId: 'alpha-city',
      toCityId: 'alpha-port',
    })!;

    const { rounds } = walkUntilArrival(rough, 'alpha-port');

    expect(quote.legRounds).toBeGreaterThan(flatQuote.legRounds);
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

/** A foreign unit parked on a tile — the obstruction a detour has to work around. */
function parkForeignUnit(state: GameState, id: string, at: { q: number; r: number }): GameState {
  return {
    ...state,
    units: {
      ...state.units,
      [id]: {
        id, type: 'warrior', owner: 'beta', position: { ...at },
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
      } as never,
    },
  };
}

function caravanPosition(state: GameState): { q: number; r: number } {
  return { ...state.units['trader-1']!.position };
}

describe('#1502 MR05b — a lost endpoint ends the route honestly', () => {
  it('returns home and ends the route when the destination is razed', () => {
    const base = makeState({ caravanPosition: { q: 1, r: 0 }, movement: 1 });
    // The destination city is gone before the trader gets there.
    const state = { ...base, cities: { ...base.cities } };
    delete (state.cities as Record<string, unknown>)['alpha-port'];

    const planned = advanceRouteRunners(withResetAllowance(state, 1), new EventBus());
    expect(planned.marketplace!.tradeRoutes[0]!.endpointLost).toBe(true);
    expect(getRouteOperatingStatus(planned, 'route-1').reason).toBe('endpoint-lost');

    const home = walkUntilArrival(planned, 'alpha-city').state;

    expect(home.marketplace!.tradeRoutes).toHaveLength(0);
    expect(home.units['trader-1']!.committedToRouteId).toBeUndefined();
    expect(home.units['trader-1']!.position).toEqual(home.cities['alpha-city']!.position);
  });

  it('ends the route when the destination changes hands, even though the city still stands', () => {
    const base = makeState({ caravanPosition: { q: 1, r: 0 }, movement: 1 });
    // A domestic route's destination captured by somebody else is no longer this route's endpoint.
    const state = {
      ...base,
      cities: { ...base.cities, 'alpha-port': { ...base.cities['alpha-port']!, owner: 'beta' } },
    } as GameState;

    const planned = advanceRouteRunners(withResetAllowance(state, 1), new EventBus());

    expect(planned.marketplace!.tradeRoutes[0]!.endpointLost).toBe(true);
    expect(getRouteOperatingStatus(planned, 'route-1').paying).toBe(false);
  });

  it('recovers a stranded trader to its nearest known home, physically, when the origin is lost', () => {
    const base = makeState({ caravanPosition: { q: 2, r: 0 }, direction: 'inbound', movement: 1 });
    // The origin is razed; the civilization's other city is two steps away over land.
    const state = {
      ...base,
      cities: {
        ...base.cities,
        'alpha-fort': {
          id: 'alpha-fort', name: 'Fort', owner: 'alpha', position: { q: 0, r: 1 },
          ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [],
        } as never,
      },
      civilizations: {
        ...base.civilizations,
        alpha: { ...base.civilizations['alpha']!, cities: ['alpha-port', 'alpha-fort'] },
      },
    } as GameState;
    delete (state.cities as Record<string, unknown>)['alpha-city'];

    const walking = advanceRouteRunners(withResetAllowance(state, 1), new EventBus());
    const route = walking.marketplace!.tradeRoutes[0]!;
    expect(route.returnHomeCityId).toBe('alpha-fort');
    expect(caravanPosition(walking)).toEqual({ q: 1, r: 0 });

    const arrived = advanceRouteRunners(withResetAllowance({ ...walking, turn: walking.turn + 1 }, 1), new EventBus());

    // Recovered: the trader walked to the alternative home and the route ended there — no teleport.
    expect(caravanPosition(arrived)).toEqual({ q: 0, r: 1 });
    expect(arrived.marketplace!.tradeRoutes).toHaveLength(0);
    expect(arrived.units['trader-1']!.committedToRouteId).toBeUndefined();
  });

  it('holds a trader whose origin is lost and has no reachable alternative home', () => {
    const base = makeState({ caravanPosition: { q: 1, r: 0 }, direction: 'inbound' });
    // A foreign route whose partner city is its only destination: with the origin razed there is no
    // home of the trader's own civilization left to return to.
    const state = {
      ...base,
      marketplace: {
        ...base.marketplace!,
        tradeRoutes: [{ ...base.marketplace!.tradeRoutes[0]!, foreignCivId: 'beta' }],
      },
      cities: {
        ...base.cities,
        'alpha-port': { ...base.cities['alpha-port']!, owner: 'beta' },
      },
      civilizations: { ...base.civilizations, alpha: { ...base.civilizations['alpha']!, cities: [] } },
    } as GameState;
    delete (state.cities as Record<string, unknown>)['alpha-city'];

    const held = advanceRouteRunners(withResetAllowance(state), new EventBus());

    expect(caravanPosition(held)).toEqual({ q: 1, r: 0 });
    expect(held.marketplace!.tradeRoutes).toHaveLength(1);
    expect(settleTradeRouteForCiv(held, 'alpha').paid).toBe(0);
  });
});

describe('#1502 MR05b — a bounded detour allowance', () => {
  it('routes around a foreign unit on the committed path and charges a detour round', () => {
    const state = parkForeignUnit(makeState({ movement: 3 }), 'beta-guard', { q: 1, r: 0 });

    const moved = advanceRouteRunners(withResetAllowance(state), new EventBus());

    expect(caravanPosition(moved)).not.toEqual({ q: 0, r: 0 });
    expect(caravanPosition(moved)).not.toEqual({ q: 1, r: 0 });
    expect(moved.marketplace!.tradeRoutes[0]!.detourRoundsUsed).toBe(1);
  });

  it('waits once the leg has spent its whole detour allowance, and pays nothing', () => {
    const base = parkForeignUnit(makeState({ movement: 3 }), 'beta-guard', { q: 1, r: 0 });
    // The leg has already spent the whole allowance: the obstruction may no longer be routed around.
    // The route's last progress was a previous round, so this round earns nothing either.
    const state = {
      ...base,
      marketplace: {
        ...base.marketplace!,
        tradeRoutes: [{ ...base.marketplace!.tradeRoutes[0]!, detourRoundsUsed: 3, lastProgressTurn: base.turn - 1 }],
      },
    } as GameState;

    const held = advanceRouteRunners(withResetAllowance(state), new EventBus());

    expect(caravanPosition(held)).toEqual({ q: 0, r: 0 });
    expect(held.marketplace!.tradeRoutes[0]!.detourRoundsUsed).toBe(3);
    expect(settleTradeRouteForCiv(held, 'alpha').paid).toBe(0);
  });

  it('keeps the spent detour allowance across a save/reload instead of refreshing it', () => {
    const base = parkForeignUnit(makeState({ movement: 3 }), 'beta-guard', { q: 1, r: 0 });
    const state = {
      ...base,
      marketplace: {
        ...base.marketplace!,
        tradeRoutes: [{ ...base.marketplace!.tradeRoutes[0]!, detourRoundsUsed: 3 }],
      },
    } as GameState;
    const reloaded = JSON.parse(JSON.stringify(state)) as GameState;
    expect(reloaded.marketplace!.tradeRoutes[0]!.detourRoundsUsed).toBe(3);

    const fromLive = advanceRouteRunners(withResetAllowance(state), new EventBus());
    const fromSave = advanceRouteRunners(withResetAllowance(reloaded), new EventBus());

    expect(caravanPosition(fromSave)).toEqual(caravanPosition(fromLive));
    expect(caravanPosition(fromSave)).toEqual({ q: 0, r: 0 });
  });

  it('holds, with the blocked reason, when there is no way around at all', () => {
    // A wall across the corridor: the next step and every detour tile are held by foreign units.
    // `lastProgressTurn` from the previous round is what lets the settlement recognise the missed
    // service as `blocked` (a route with no progress record yet is treated as operating).
    let state = parkForeignUnit(makeState({ movement: 3, route: { lastProgressTurn: 6 } }), 'beta-guard', { q: 1, r: 0 });
    state = parkForeignUnit(state, 'beta-guard-2', { q: 0, r: 1 });
    state = parkForeignUnit(state, 'beta-guard-3', { q: 1, r: 1 });

    const bus = new EventBus();
    const interruptions: string[] = [];
    bus.on('trade:route-interrupted', payload => interruptions.push((payload as { reason: string }).reason));
    const held = advanceRouteRunners(withResetAllowance(state), bus);

    expect(caravanPosition(held)).toEqual({ q: 0, r: 0 });
    expect(held.marketplace!.tradeRoutes[0]!.detourRoundsUsed).toBeUndefined();

    // The settlement phase (after the pirate phase) is where the interruption is judged and announced.
    const settled = settleTradeRouteForCiv(held, 'alpha', bus);
    expect(settled.paid).toBe(0);
    expect(interruptions).toEqual(['blocked']);
    expect(settled.state.marketplace!.tradeRoutes[0]!.notifiedInterruption).toBe('blocked');
  });

  it('announces a stationary obstruction once, then again only after it clears (#1503)', () => {
    // A wall the trader cannot get around: the same blocked state now persists across rounds.
    let state = parkForeignUnit(makeState({ movement: 3, route: { lastProgressTurn: 6 } }), 'beta-guard', { q: 1, r: 0 });
    state = parkForeignUnit(state, 'beta-guard-2', { q: 0, r: 1 });
    state = parkForeignUnit(state, 'beta-guard-3', { q: 1, r: 1 });

    const bus = new EventBus();
    const interruptions: string[] = [];
    bus.on('trade:route-interrupted', payload => interruptions.push((payload as { reason: string }).reason));

    // One real world round: the runner walks (or holds), then the settlement judges and announces.
    const round = (s: GameState): GameState => settleTradeRouteForCiv(
      advanceRouteRunners(withResetAllowance({ ...s, turn: s.turn + 1 }), bus),
      'alpha',
      bus,
    ).state;

    // Round after round with the wall still there: exactly one notice for the whole stretch, and the
    // route still carries the interrupted flag (so the persistent status row keeps showing it).
    for (let step = 0; step < 4; step++) {
      state = round(state);
      expect(state.marketplace!.tradeRoutes[0]!.notifiedInterruption).toBe('blocked');
    }
    expect(interruptions).toEqual(['blocked']);

    // Clear the actual threat: the trader moves again and the notice is forgotten.
    for (const guard of ['beta-guard', 'beta-guard-2', 'beta-guard-3']) delete state.units[guard];
    state = round(state);
    expect(caravanPosition(state)).not.toEqual({ q: 0, r: 0 });
    expect(state.marketplace!.tradeRoutes[0]!.notifiedInterruption).toBeUndefined();

    // Blocked again later (the trader back at its origin, outward bound): a fresh interruption
    // announces once more.
    state = {
      ...state,
      units: {
        ...state.units,
        'trader-1': { ...state.units['trader-1']!, position: { q: 0, r: 0 }, routeDirection: 'outbound' },
      },
    };
    state = parkForeignUnit(state, 'beta-guard-4', { q: 1, r: 0 });
    state = parkForeignUnit(state, 'beta-guard-5', { q: 0, r: 1 });
    state = parkForeignUnit(state, 'beta-guard-6', { q: 1, r: 1 });
    state = round(state);
    expect(interruptions).toEqual(['blocked', 'blocked']);
  });
});
