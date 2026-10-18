import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { EventBus } from '@/core/event-bus';
import {
  TRADE_ROUTE_DENIAL_MESSAGES,
  getTradeRouteEligibility,
  establishTradeRoute,
} from '@/systems/trade-route-contract';

/**
 * A flat corridor map: origin `alpha-city` at (0,0), domestic `alpha-port` at (2,0), a known
 * foreign `beta-city` at (4,0) (trade agreement by default), and `gamma-city` at (5,0) which the
 * player has never explored. Only the tiles listed in `explored` are known to the player, so a
 * probe at q=3 can be left unexplored to break the corridor without breaking the whole map.
 */
function makeState(overrides: {
  explored?: string[];
  agreement?: boolean;
  atWar?: boolean;
  relationship?: number;
  hasActed?: boolean;
  committed?: boolean;
  currentPlayer?: string;
  unitType?: string;
  unitOwner?: string;
  unitPosition?: { q: number; r: number };
  waterColumn?: number;
} = {}): GameState {
  const {
    explored = ['0,0', '1,0', '2,0', '3,0', '4,0', '0,1', '1,1', '2,1', '3,1', '4,1'],
    agreement = true,
    atWar = false,
    relationship = 10,
    hasActed = false,
    committed = false,
    currentPlayer = 'alpha',
    unitType = 'caravan',
    unitOwner = 'alpha',
    unitPosition = { q: 0, r: 0 },
    waterColumn,
  } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 3; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r },
        terrain: waterColumn === q ? 'ocean' : 'grassland',
        elevation: 'lowland',
        resource: null, improvement: 'none', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, owner: null,
      };
    }
  }

  const alphaTiles: Record<string, string> = {};
  for (const key of explored) alphaTiles[key] = 'fog';
  alphaTiles[hexKey(unitPosition)] = 'visible';

  const treaties = agreement
    ? [{ type: 'trade_agreement', civA: 'alpha', civB: 'beta', turnsRemaining: -1, goldPerTurn: 2 }]
    : [];

  const diplomacy = (_self: string, other: string) => ({
    relationships: { [other]: relationship },
    treaties,
    events: [],
    atWarWith: atWar ? [other] : [],
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
  });

  return {
    turn: 4,
    era: 1,
    currentPlayer,
    map: { tiles, width: 6, height: 3, wrapsHorizontally: false, rivers: [] },
    idCounters: { nextUnitId: 10, nextCityId: 10, nextCampId: 10, nextQuestId: 10, nextRouteId: 3 },
    marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [] },
    civilizations: {
      alpha: {
        id: 'alpha', name: 'Alpha', color: '#00f', civType: 'generic',
        gold: 100, cities: ['alpha-city', 'alpha-port'], units: ['trader-1'],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: diplomacy('alpha', 'beta'),
        knownCivilizations: ['beta'],
        visibility: { tiles: alphaTiles, fogMap: {} },
      },
      beta: {
        id: 'beta', name: 'Beta', color: '#f00', civType: 'generic',
        gold: 100, cities: ['beta-city'], units: [],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: diplomacy('beta', 'alpha'),
        knownCivilizations: ['alpha'],
        visibility: { tiles: {}, fogMap: {} },
      },
      gamma: {
        id: 'gamma', name: 'Gamma', color: '#0f0', civType: 'generic',
        gold: 100, cities: ['gamma-city'], units: [],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: diplomacy('gamma', 'alpha'),
        knownCivilizations: [],
        visibility: { tiles: {}, fogMap: {} },
      },
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 2, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'beta-city': { id: 'beta-city', name: 'Betatown', owner: 'beta', position: { q: 4, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'gamma-city': { id: 'gamma-city', name: 'Gammahaven', owner: 'gamma', position: { q: 5, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
    },
    units: {
      'trader-1': {
        id: 'trader-1', type: unitType, owner: unitOwner, position: unitPosition,
        health: 100, movementPointsLeft: 3, hasActed, hasMoved: false, skippedTurn: false, isResting: false,
        ...(committed ? { committedToRouteId: 'route-1' } : {}),
      },
      warrior: {
        id: 'warrior', type: 'warrior', owner: 'alpha', position: { q: 0, r: 0 },
        health: 100, movementPointsLeft: 2, hasActed: false, hasMoved: false, skippedTurn: false, isResting: false,
      },
    },
    barbarianCamps: {}, minorCivs: {}, espionage: {}, pendingEvents: {},
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {}, legendaryWonderProjects: {},
    settings: { mapSize: 'small', opponentCount: 2, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

const request = (overrides: Partial<Parameters<typeof getTradeRouteEligibility>[1]> = {}) => ({
  caravanUnitId: 'trader-1',
  toCityId: 'alpha-port',
  actingCivId: 'alpha',
  ...overrides,
});

describe('trade-route contract — a legal assignment', () => {
  it('accepts a domestic assignment from a free origin', () => {
    const decision = getTradeRouteEligibility(makeState(), request());

    expect(decision).toEqual({
      ok: true, originCityId: 'alpha-city', destinationCityId: 'alpha-port', domestic: true,
    });
  });

  it('accepts a foreign assignment with commercial permission', () => {
    const decision = getTradeRouteEligibility(makeState(), request({ toCityId: 'beta-city' }));

    expect(decision).toEqual({
      ok: true, originCityId: 'alpha-city', destinationCityId: 'beta-city', domestic: false,
    });
  });

  it('honours a chosen origin and rejects one with no free slot', () => {
    expect(getTradeRouteEligibility(makeState(), request({ toCityId: 'beta-city', originCityId: 'alpha-port' })))
      .toEqual({ ok: true, originCityId: 'alpha-port', destinationCityId: 'beta-city', domestic: false });

    const full = makeState();
    full.marketplace!.tradeRoutes = [
      { id: 'r1', fromCityId: 'alpha-port', toCityId: 'alpha-city', goldPerTrip: 5, turnsPerTrip: 1 },
    ];
    expect(getTradeRouteEligibility(full, request({ originCityId: 'alpha-port' })))
      .toEqual({ ok: false, reason: 'origin-unusable' });
  });
});

describe('trade-route contract — every gate fails on its own', () => {
  const cases: Array<[string, Parameters<typeof makeState>[0], Parameters<typeof request>[0], string]> = [
    ['a missing unit', {}, { caravanUnitId: 'nobody' }, 'unit-missing'],
    ['a unit that has no trade role', {}, { caravanUnitId: 'warrior' }, 'not-a-trader'],
    ['a unit the acting civ does not own', { unitOwner: 'beta' }, {}, 'not-your-unit'],
    ['an off-turn assignment', { currentPlayer: 'beta' }, {}, 'not-your-turn'],
    ['a unit that already acted', { hasActed: true }, {}, 'unit-unavailable'],
    ['a unit already committed to a route', { committed: true }, {}, 'already-committed'],
    ['an unknown destination', { explored: ['0,0', '1,0', '2,0'] }, { toCityId: 'beta-city' }, 'destination-unknown'],
    ['a destination with no explored corridor', { explored: ['0,0', '1,0', '2,0', '4,0'] }, { toCityId: 'beta-city' }, 'corridor-not-explored'],
    ['a destination with no route at all', { waterColumn: 3 }, { toCityId: 'beta-city' }, 'naval-trader-required'],
    ['a foreign destination without a commercial agreement', { agreement: false }, { toCityId: 'beta-city' }, 'no-commercial-agreement'],
    ['a foreign destination at war', { atWar: true }, { toCityId: 'beta-city' }, 'at-war'],
    ['a foreign destination with hostile relations', { relationship: -20 }, { toCityId: 'beta-city' }, 'relations-too-hostile'],
    ['a destination that is also the origin', {}, { toCityId: 'alpha-city', originCityId: 'alpha-city' }, 'origin-is-destination'],
  ];

  for (const [label, stateOptions, requestOptions, reason] of cases) {
    it(`refuses ${label} with '${reason}'`, () => {
      const decision = getTradeRouteEligibility(makeState(stateOptions), request(requestOptions));

      expect(decision.ok).toBe(false);
      expect(decision.ok === false && decision.reason).toBe(reason);
    });
  }

  it('an automated caller may act off-turn, and only that caller may', () => {
    const offTurn = makeState({ currentPlayer: 'beta' });
    expect(getTradeRouteEligibility(offTurn, request()).ok).toBe(false);
    expect(getTradeRouteEligibility(offTurn, request({ automated: true })).ok).toBe(true);
  });

  it('publishes copy for every denial reason', () => {
    expect(Object.keys(TRADE_ROUTE_DENIAL_MESSAGES).length).toBeGreaterThanOrEqual(14);
    for (const message of Object.values(TRADE_ROUTE_DENIAL_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe('trade-route contract — the executor re-runs the query before its first write', () => {
  it('creates exactly one route, consumes one slot, and marks the unit committed', () => {
    const state = makeState();
    const bus = new EventBus();
    const created: string[] = [];
    bus.on('trade:route-created', e => created.push(e.route.id));

    const result = establishTradeRoute(state, request(), bus, 3);

    expect(result.ok).toBe(true);
    expect(result.state.marketplace!.tradeRoutes).toHaveLength(1);
    expect(result.state.units['trader-1'].committedToRouteId).toBe(result.ok && result.route.id);
    expect(created).toHaveLength(1);
    // The input state is untouched.
    expect(state.marketplace!.tradeRoutes).toHaveLength(0);
  });

  it('a repeated Confirm after the first assignment is refused without mutation', () => {
    const first = establishTradeRoute(makeState(), request(), new EventBus(), 3);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = establishTradeRoute(first.state, request(), new EventBus(), 3);

    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('already-committed');
    expect(second.state).toBe(first.state);
    expect(second.state.marketplace!.tradeRoutes).toHaveLength(1);
  });

  it('a stale callback after a war declaration is refused without mutation', () => {
    // The panel opened while the destination was legal...
    const opened = makeState();
    expect(getTradeRouteEligibility(opened, request({ toCityId: 'beta-city' })).ok).toBe(true);

    // ...then war broke out before Confirm.
    const afterWar: GameState = {
      ...opened,
      civilizations: {
        ...opened.civilizations,
        alpha: { ...opened.civilizations.alpha, diplomacy: { ...opened.civilizations.alpha.diplomacy, atWarWith: ['beta'] } },
      },
    };

    const result = establishTradeRoute(afterWar, request({ toCityId: 'beta-city' }), new EventBus(), 0);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('at-war');
    expect(result.state).toBe(afterWar);
    expect(result.state.marketplace!.tradeRoutes).toHaveLength(0);
  });

  it('a stale callback after the chosen origin filled up is refused without mutation', () => {
    const state = makeState();
    state.marketplace!.tradeRoutes = [
      { id: 'r1', fromCityId: 'alpha-city', toCityId: 'alpha-port', goldPerTrip: 5, turnsPerTrip: 1 },
    ];

    const result = establishTradeRoute(state, request({ originCityId: 'alpha-city' }), new EventBus(), 0);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('origin-unusable');
    expect(result.state).toBe(state);
    expect(result.state.marketplace!.tradeRoutes).toHaveLength(1);
  });
});

describe('trade-route contract — domains and wrapping', () => {
  it('a land trader cannot cross water but a naval trader can', () => {
    const island = { explored: ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '3,1', '4,1', '5,1'], waterColumn: 3 };

    expect(getTradeRouteEligibility(makeState(island), request({ toCityId: 'beta-city' }))).toEqual({
      ok: false, reason: 'naval-trader-required',
    });
    // A naval trader must stand on water: (3,1) is ocean, and its origin's naval approach is adjacent.
    expect(getTradeRouteEligibility(
      makeState({ ...island, unitType: 'naval_trader', unitPosition: { q: 3, r: 1 } }),
      request({ toCityId: 'beta-city' }),
    ).ok).toBe(true);
  });

  it('follows a wrapped corridor when the map wraps', () => {
    const state = makeState({ explored: ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '0,1', '1,1', '2,1', '3,1', '4,1', '5,1'] });
    state.map.wrapsHorizontally = true;
    // Move the origin to q=1 so the wrapped route (1 → 0 → 5 → 4) is the short way round.
    state.units['trader-1'].position = { q: 1, r: 0 };

    expect(getTradeRouteEligibility(state, request({ toCityId: 'beta-city' })).ok).toBe(true);
  });
});
