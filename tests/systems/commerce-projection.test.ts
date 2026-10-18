import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { getEntitledTradeDestinations } from '@/systems/commerce-projection';
import { establishTradeRoute } from '@/systems/trade-route-contract';
import { processTradeRouteIncome } from '@/systems/trade-route-economy';

/**
 * Two majors, a city-state, and a hidden rival:
 * - alpha's own cities at (0,0) and (2,0);
 * - a discovered beta city at (4,0) (trade agreement);
 * - a discovered city-state at (5,1);
 * - `gamma-city` at (5,0) which alpha has never explored, so it must not exist for alpha at all.
 */
function makeState(overrides: { explored?: string[]; agreement?: boolean } = {}): GameState {
  const {
    explored = ['0,0', '1,0', '2,0', '3,0', '4,0', '0,1', '1,1', '2,1', '3,1', '4,1', '5,1'],
    agreement = true,
  } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 3; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
      };
    }
  }

  const alphaTiles: Record<string, string> = { '0,0': 'visible' };
  for (const key of explored) alphaTiles[key] = 'fog';

  return {
    turn: 4, era: 1, currentPlayer: 'alpha',
    map: { tiles, width: 6, height: 3, wrapsHorizontally: false, rivers: [] },
    idCounters: { nextUnitId: 10, nextCityId: 10, nextCampId: 10, nextQuestId: 10, nextRouteId: 1 },
    marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [] },
    civilizations: {
      alpha: {
        id: 'alpha', name: 'Alpha', color: '#00f', civType: 'generic', gold: 100,
        cities: ['alpha-city', 'alpha-port'], units: ['trader-1'],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: { beta: 10 }, treaties: agreement
          ? [{ type: 'trade_agreement', civA: 'alpha', civB: 'beta', turnsRemaining: -1, goldPerTurn: 2 }] : [],
          events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: ['beta'],
        visibility: { tiles: alphaTiles, fogMap: {} },
      },
      beta: {
        id: 'beta', name: 'Beta', color: '#f00', civType: 'generic', gold: 100,
        cities: ['beta-city'], units: [],
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: { alpha: 10 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: ['alpha'],
        visibility: { tiles: {}, fogMap: {} },
      },
      gamma: {
        id: 'gamma', name: 'Gamma', color: '#0f0', civType: 'generic', gold: 100,
        cities: ['gamma-city'], units: [],
        techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: { alpha: 0 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility: { tiles: {}, fogMap: {} },
      },
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 2, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'beta-city': { id: 'beta-city', name: 'Betatown', owner: 'beta', position: { q: 4, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'gamma-city': { id: 'gamma-city', name: 'Gammahaven', owner: 'gamma', position: { q: 5, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
      'sparta-city': { id: 'sparta-city', name: 'Sparta', owner: 'mc-sparta', position: { q: 5, r: 1 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [] },
    },
    units: {
      'trader-1': { id: 'trader-1', type: 'caravan', owner: 'alpha', position: { q: 0, r: 0 }, health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false, skippedTurn: false, isResting: false },
    },
    minorCivs: {
      'mc-sparta': {
        id: 'mc-sparta', definitionId: 'sparta', cityId: 'sparta-city', units: [],
        diplomacy: {
          relationships: { alpha: 10 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
        },
        activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
        isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
      },
    },
    barbarianCamps: {}, espionage: {}, pendingEvents: {}, tribalVillages: {}, discoveredWonders: {},
    wonderDiscoverers: {}, legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {}, legendaryWonderProjects: {},
    settings: { mapSize: 'small', opponentCount: 2, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

describe('getEntitledTradeDestinations — knowledge safety', () => {
  it('never lists a city the viewer has not discovered, by id, name, count, or order', () => {
    const rows = getEntitledTradeDestinations(makeState(), 'alpha', 'trader-1');
    const serialized = JSON.stringify(rows);

    expect(rows.some(row => row.cityId === 'gamma-city')).toBe(false);
    expect(serialized).not.toContain('gamma-city');
    expect(serialized).not.toContain('Gammahaven');
    expect(serialized).not.toContain('Gamma');
    // Exactly the entitled cities: two own, one known major, one known city-state.
    expect(rows.map(row => row.cityId)).toEqual(['alpha-port', 'beta-city', 'sparta-city']);
  });

  it('gives every row an entitled verdict and denies an unreachable known city with a reason', () => {
    // The corridor to beta-city is broken at q=3; the city itself is explored.
    const rows = getEntitledTradeDestinations(makeState({ explored: ['0,0', '1,0', '2,0', '4,0', '5,1'] }), 'alpha', 'trader-1');
    const beta = rows.find(row => row.cityId === 'beta-city');

    expect(beta?.eligible).toBe(false);
    expect(beta?.denialReason).toBe('corridor-not-explored');
    expect(beta?.denialReason ? `reason:${beta.denialReason}` : '').toBe('reason:corridor-not-explored');
  });

  it('marks a domestic destination eligible and a permitted foreign one eligible', () => {
    const rows = getEntitledTradeDestinations(makeState(), 'alpha', 'trader-1');

    expect(rows.find(row => row.cityId === 'alpha-port')).toMatchObject({ eligible: true, domestic: true, denialReason: null });
    expect(rows.find(row => row.cityId === 'beta-city')).toMatchObject({ eligible: true, domestic: false, denialReason: null });
    expect(rows.find(row => row.cityId === 'sparta-city')?.eligible).toBe(true);
  });

  it('denies a foreign destination when commercial permission is missing', () => {
    const rows = getEntitledTradeDestinations(makeState({ agreement: false }), 'alpha', 'trader-1');

    expect(rows.find(row => row.cityId === 'beta-city')).toMatchObject({
      eligible: false, denialReason: 'no-commercial-agreement',
    });
  });

  it('is viewer-scoped: another viewer sees its own entitled set, not alpha’s', () => {
    const rows = getEntitledTradeDestinations(makeState(), 'gamma', 'trader-1');

    // gamma has explored nothing and owns only its own city; alpha's cities are not entitled to it.
    expect(rows.map(row => row.cityId)).toEqual([]);
  });

  it('previews exactly the income the executor would create for an eligible row', () => {
    const state = makeState();
    // Away from any city, so the assignment starts with a positioning leg.
    state.units['trader-1'].position = { q: 2, r: 1 };
    const rows = getEntitledTradeDestinations(state, 'alpha', 'trader-1');
    const row = rows.find(candidate => candidate.cityId === 'beta-city')!;
    expect(row.eligible).toBe(true);

    // Assign that exact destination and compare the created route's income with the preview.
    const created = establishTradeRoute(state, {
      caravanUnitId: 'trader-1', toCityId: 'beta-city', actingCivId: 'alpha',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const earned = processTradeRouteIncome(created.state.marketplace!.tradeRoutes, created.state);
    // The runner has not reached its origin yet, so nothing is earned while positioning (#1500).
    expect(earned).toBe(0);
    expect(row.goldPerTurn).toBeGreaterThan(0);
    expect(row.positioningTurns).toBeGreaterThan(0);
  });

  it('reports the positioning leg when the trader must still travel to its origin', () => {
    const state = makeState();
    state.units['trader-1'].position = { q: 2, r: 1 };

    const row = getEntitledTradeDestinations(state, 'alpha', 'trader-1').find(candidate => candidate.cityId === 'beta-city')!;

    expect(row.positioningTurns).toBeGreaterThan(0);
  });
});
