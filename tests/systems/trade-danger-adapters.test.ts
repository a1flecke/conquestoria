import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { getBlockadedCityIds } from '@/systems/blockade-system';
import {
  getEntitledRouteDanger,
  getRouteDangerConsequences,
  getTradeDangerFacts,
  isRouteServiceSuspended,
} from '@/systems/trade-danger-adapters';
import { getRouteOperatingStatus, settleTradeRouteForCiv } from '@/systems/trade-route-economy';
import { getEntitledTradeDestinations } from '@/systems/commerce-projection';

/**
 * #1503 MR06: the trade danger adapters.
 *
 * The fixture is a six-by-three grassland strip with two coastal tiles, so a hostile major civ can
 * form a real blockade (`deriveMajorCivBlockades`): two combat warships within radius 2, at least one
 * adjacent, and no defender warship contesting the ring. Nothing here rolls a random loss — every
 * consequence comes from an authoritative fact.
 */
const COASTAL_TILES: Record<string, string> = { 'alpha-city': '0,1', 'beta-port': '5,2' };

function makeState(overrides: {
  /** Two warships of `blockaderId` (at war with the city owner) blockade `cityId`. */
  blockade?: { blockaderId: string; cityId: 'alpha-city' | 'beta-port' };
  /** The viewer has explored the destination city's tile. */
  exploredBetaPort?: boolean;
  routeToCityId?: string;
  lastProgressTurn?: number;
} = {}): GameState {
  const { blockade, exploredBetaPort = false, routeToCityId = 'alpha-port', lastProgressTurn } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 3; r++) {
      const coastal = Object.values(COASTAL_TILES).includes(`${q},${r}`);
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: coastal ? 'coast' : 'grassland', elevation: 'lowland',
        resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
      };
    }
  }
  const visibilityFor = (visibleKeys: string[]) => ({
    tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, visibleKeys.includes(key) ? 'visible' : 'fog'])),
    fogMap: {},
  });
  const diplomacy = (atWarWith: string[] = []) => ({
    relationships: {}, treaties: [], events: [], atWarWith, treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
  });
  const civ = (id: string, isHuman: boolean, cities: string[], unitIds: string[], atWarWith: string[], visibleKeys: string[]) => ({
    id, name: id, color: '#888', isHuman, civType: 'generic', gold: 0, cities, units: unitIds,
    techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
    diplomacy: diplomacy(atWarWith),
    knownCivilizations: [], visibility: visibilityFor(visibleKeys),
  });

  const units: Record<string, Unit> = {
    'trader-1': {
      id: 'trader-1', type: 'caravan', owner: 'alpha', position: { q: 0, r: 0 }, health: 100,
      experience: 0, movementPointsLeft: 3, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
      committedToRouteId: 'route-1', routeDirection: 'outbound',
    },
  };

  const blockaderUnitIds: string[] = [];
  const wars: Record<string, string[]> = {};
  if (blockade) {
    const [aq, ar] = COASTAL_TILES[blockade.cityId]!.split(',').map(Number) as [number, number];
    const positions = [{ q: aq, r: ar }, { q: Math.min(5, aq + 1), r: ar }];
    blockaderUnitIds.push('blockader-a', 'blockader-b');
    positions.forEach((position, index) => {
      const id = index === 0 ? 'blockader-a' : 'blockader-b';
      units[id] = {
        id, type: 'galley', owner: blockade.blockaderId, position, health: 100,
        experience: 0, movementPointsLeft: 3, hasActed: false, hasMoved: false, isResting: false,
      };
    });
    const cityOwner = blockade.cityId === 'alpha-city' ? 'alpha' : 'beta';
    wars[blockade.blockaderId] = [cityOwner];
    wars[cityOwner] = [blockade.blockaderId];
  }
  const atWar = (id: string) => wars[id] ?? [];

  return {
    turn: 7, era: 1, currentPlayer: 'alpha',
    map: { tiles, width: 6, height: 3, wrapsHorizontally: false, rivers: [] },
    idCounters: { nextUnitId: 50, nextCityId: 50, nextCampId: 50, nextQuestId: 50, nextRouteId: 2 },
    marketplace: {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, purchasedResources: [],
      tradeRoutes: [{
        id: 'route-1', fromCityId: 'alpha-city', toCityId: routeToCityId,
        goldPerTrip: 12, turnsPerTrip: 4, serviceRoundsRemaining: 8,
        ...(lastProgressTurn !== undefined ? { lastProgressTurn } : {}),
      }],
    },
    civilizations: {
      alpha: civ('alpha', true, ['alpha-city', 'alpha-port'], ['trader-1'], atWar('alpha'), exploredBetaPort ? ['5,1'] : []),
      beta: civ('beta', false, ['beta-port'], [], atWar('beta'), []),
      gamma: civ('gamma', false, [], [], atWar('gamma'), []),
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 5, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'beta-port': { id: 'beta-port', name: 'Betaport', owner: 'beta', position: { q: 5, r: 1 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
    },
    units,
    barbarianCamps: {}, minorCivs: {}, espionage: {}, pendingEvents: {}, tribalVillages: {},
    discoveredWonders: {}, wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {}, legendaryWonderProjects: {},
    settings: { mapSize: 'small', opponentCount: 2, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

describe('#1503 MR06 — a blockade suspends route service', () => {
  it('reads the canonical blockade fact and types it as service-suspended', () => {
    const state = makeState({ blockade: { blockaderId: 'gamma', cityId: 'alpha-city' } });
    expect(getBlockadedCityIds(state)).toContain('alpha-city');

    const route = state.marketplace!.tradeRoutes[0]!;
    const consequences = getRouteDangerConsequences(state, route);
    expect(consequences).toEqual([{ kind: 'service-suspended', source: 'blockade', cityId: 'alpha-city' }]);
    expect(isRouteServiceSuspended(state, route)).toBe(true);
  });

  it('stops paying a route whose endpoint is blockaded, and says why', () => {
    // A live, progressing route before the blockade: lastProgressTurn is this round.
    const state = makeState({ blockade: { blockaderId: 'gamma', cityId: 'alpha-city' }, lastProgressTurn: 7 });
    const status = getRouteOperatingStatus(state, 'route-1');
    expect(status.paying).toBe(false);
    expect(status.reason).toBe('blockaded');

    const settled = settleTradeRouteForCiv(state, 'alpha', new EventBus());
    expect(settled.paid).toBe(0);
    expect(settled.reasons).toContain('blockaded');
  });

  it('resumes service once the blockade lifts', () => {
    const live = makeState({ lastProgressTurn: 7 });
    expect(getRouteOperatingStatus(live, 'route-1').paying).toBe(true);
    expect(settleTradeRouteForCiv(live, 'alpha').paid).toBeGreaterThan(0);
  });

  it('announces the suspension once per uninterrupted stretch, through the settlement phase', () => {
    const bus = new EventBus();
    const notices: string[] = [];
    bus.on('trade:route-interrupted', payload => notices.push((payload as { reason: string }).reason));

    let state = makeState({ blockade: { blockaderId: 'gamma', cityId: 'alpha-city' }, lastProgressTurn: 7 });
    for (let round = 0; round < 3; round++) {
      state = { ...state, turn: state.turn + 1 };
      state = settleTradeRouteForCiv(state, 'alpha', bus).state;
      expect(state.marketplace!.tradeRoutes[0]!.notifiedInterruption).toBe('blockaded');
    }
    expect(notices).toEqual(['blockaded']);
  });

  it('composes same-round danger into exactly one consequence (no double report)', () => {
    // Blockaded *and* movement-blocked: the documented order reports service suspension only.
    const state = makeState({ blockade: { blockaderId: 'gamma', cityId: 'alpha-city' } });
    const route = state.marketplace!.tradeRoutes[0]!;
    const consequences = getRouteDangerConsequences(state, route, { movementBlocked: true });
    expect(consequences).toHaveLength(1);
    expect(consequences[0]!.kind).toBe('service-suspended');
  });

  it('reports a terminal carrier loss before any other danger', () => {
    const state = makeState({ lastProgressTurn: 7 });
    delete state.units['trader-1'];
    state.civilizations.alpha.units = [];
    const route = state.marketplace!.tradeRoutes[0]!;
    expect(getRouteDangerConsequences(state, route, { movementBlocked: true })).toEqual([
      { kind: 'carrier-lost', source: 'combat-loss' },
    ]);
  });
});

describe('#1503 MR06 — a hidden fleet never changes what the viewer is told', () => {
  it('names a blockade only when the viewer owns the blockaded city', () => {
    const ownCity = makeState({ blockade: { blockaderId: 'gamma', cityId: 'alpha-city' }, lastProgressTurn: 7 });
    const ownDanger = getEntitledRouteDanger(ownCity, 'alpha', ownCity.marketplace!.tradeRoutes[0]!);
    expect(ownDanger).toMatchObject({ kind: 'service-suspended', source: 'blockade', cityId: 'alpha-city' });

    // The same physical blockade, but of a *foreign* endpoint: the viewer is told nothing about it.
    const foreign = makeState({
      blockade: { blockaderId: 'gamma', cityId: 'beta-port' },
      exploredBetaPort: true,
      routeToCityId: 'beta-port',
      lastProgressTurn: 7,
    });
    expect(isRouteServiceSuspended(foreign, foreign.marketplace!.tradeRoutes[0]!)).toBe(true);
    expect(getEntitledRouteDanger(foreign, 'alpha', foreign.marketplace!.tradeRoutes[0]!)).toBeNull();
  });

  it('does not let an unseen fleet alter the route preview', () => {
    const withFleet = makeState({
      blockade: { blockaderId: 'gamma', cityId: 'beta-port' },
      exploredBetaPort: true,
      routeToCityId: 'alpha-port',
    });
    // The same world without the unseen fleet: unit-for-unit identical preview rows.
    const withoutFleet = makeState({ exploredBetaPort: true, routeToCityId: 'alpha-port' });

    const before = getEntitledTradeDestinations(withFleet, 'alpha', 'trader-1');
    const after = getEntitledTradeDestinations(withoutFleet, 'alpha', 'trader-1');

    expect(before.length).toBeGreaterThan(0);
    expect(before).toEqual(after);
  });

  it('reads the blockaded city set once per pass for reuse', () => {
    const state = makeState({ blockade: { blockaderId: 'gamma', cityId: 'alpha-city' } });
    const facts = getTradeDangerFacts(state);
    expect(facts.blockadedCityIds.has('alpha-city')).toBe(true);
    expect(getTradeDangerFacts(state)).not.toBe(facts);
  });
});
