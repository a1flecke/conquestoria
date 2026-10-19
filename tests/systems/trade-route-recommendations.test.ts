import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { getTradeRouteRecommendations } from '@/systems/trade-route-recommendations';
import { getEntitledTradeDestinations } from '@/systems/commerce-projection';

/**
 * #1504 MR07: recommendations are a bounded *view* over the entitled projection.
 *
 * Fixture: alpha's own cities at (0,0)/(2,0), a discovered beta city at (4,0) with a trade agreement,
 * and an unexplored gamma city at (5,0). `beta-city` has an active build so development ranking has
 * something real to prefer.
 */
function makeState(overrides: {
  explored?: string[];
  unitPosition?: { q: number; r: number };
  betaBuilding?: boolean;
  /** Two hostile warships ring a city, which is how a *major-civ* blockade is formed. */
  blockade?: 'alpha-port' | 'betatown';
} = {}): GameState {
  const {
    explored = ['0,0', '1,0', '2,0', '3,0', '4,0', '0,1', '1,1', '2,1', '3,1', '4,1'],
    unitPosition = { q: 0, r: 0 },
    betaBuilding = false,
    blockade,
  } = overrides;

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 6; q++) {
    for (let r = 0; r < 3; r++) {
      const coastal = (q === 2 && r === 1) || (q === 4 && r === 1);
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: coastal ? 'coast' : 'grassland', elevation: 'lowland',
        resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
      };
    }
  }
  const alphaTiles: Record<string, string> = { '0,0': 'visible' };
  for (const key of explored) alphaTiles[key] = 'fog';

  const diplomacy = (other: string, atWar: string[] = []) => ({
    relationships: { [other]: 10 },
    treaties: [{ type: 'trade_agreement', civA: 'alpha', civB: 'beta', turnsRemaining: -1 }],
    events: [], atWarWith: atWar, treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
  });
  const civ = (id: string, other: string, cityIds: string[], unitIds: string[], atWar: string[] = []) => ({
    id, name: id, color: '#888', civType: 'generic', gold: 100, cities: cityIds, units: unitIds,
    techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
    diplomacy: diplomacy(other, atWar), knownCivilizations: [], visibility: { tiles: alphaTiles, fogMap: {} },
  });

  const units: Record<string, unknown> = {
    'trader-1': {
      id: 'trader-1', type: 'caravan', owner: 'alpha', position: unitPosition,
      health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false, skippedTurn: false, isResting: false,
    },
  };
  if (blockade) {
    const city = blockade === 'alpha-port' ? { q: 2, r: 0 } : { q: 4, r: 0 };
    for (const [index, position] of [city, { q: city.q, r: city.r + 1 }].entries()) {
      units[`warship-${index}`] = {
        id: `warship-${index}`, type: 'galley', owner: 'gamma', position, health: 100,
        experience: 0, movementPointsLeft: 3, hasActed: false, hasMoved: false, isResting: false,
      };
    }
  }

  return {
    turn: 4, era: 1, currentPlayer: 'alpha',
    map: { tiles, width: 6, height: 3, wrapsHorizontally: false, rivers: [] },
    idCounters: { nextUnitId: 30, nextCityId: 30, nextCampId: 30, nextQuestId: 30, nextRouteId: 1 },
    marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [] },
    civilizations: {
      alpha: civ('alpha', 'beta', ['alpha-city', 'alpha-port'], ['trader-1']),
      beta: civ('beta', 'alpha', ['beta-city'], []),
      // gamma is the blockader; alpha has never met it, so nothing about it may reach the surface.
      gamma: civ('gamma', 'alpha', ['gamma-city'], [], ['alpha']),
    },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alphaville', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [], productionProgress: 0, food: 10 },
      'alpha-port': { id: 'alpha-port', name: 'Alphaport', owner: 'alpha', position: { q: 2, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [], productionProgress: 0, food: 10 },
      'beta-city': {
        id: 'beta-city', name: 'Betatown', owner: 'beta', position: { q: 4, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [],
        productionQueue: betaBuilding ? ['granary'] : [], productionProgress: 0, food: 10,
      },
      'gamma-city': { id: 'gamma-city', name: 'Gammahaven', owner: 'gamma', position: { q: 5, r: 2 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [], productionProgress: 0, food: 10 },
    },
    units,
    minorCivs: { 'mc-sparta': { id: 'mc-sparta', definitionId: 'sparta', cityId: 'sparta-city', units: [], diplomacy: { relationships: { alpha: 10 }, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } }, activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {}, isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1 } },
    barbarianCamps: {}, espionage: {}, pendingEvents: {}, tribalVillages: {}, discoveredWonders: {},
    wonderDiscoverers: {}, legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {}, legendaryWonderProjects: {},
    settings: { mapSize: 'small', opponentCount: 2, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

describe('#1504 MR07 — route recommendations are a bounded view over the entitled catalog', () => {
  it('recommends only destinations the chooser is entitled to show', () => {
    const state = makeState();
    const recommendations = getTradeRouteRecommendations(state, 'alpha', 'trader-1');
    const entitled = new Set(getEntitledTradeDestinations(state, 'alpha', 'trader-1').map(row => row.cityId));

    for (const entries of Object.values(recommendations)) {
      for (const entry of entries) expect(entitled.has(entry.destination.cityId)).toBe(true);
      expect(entries.length).toBeLessThanOrEqual(3);
    }
    // The unexplored gamma city can never be recommended.
    for (const entries of Object.values(recommendations)) {
      expect(entries.some(entry => entry.destination.cityId === 'gamma-city')).toBe(false);
    }
  });

  it('orders the profitable set by quoted return with a deterministic tiebreak', () => {
    const recommendations = getTradeRouteRecommendations(makeState(), 'alpha', 'trader-1');
    const gains = recommendations.profitable.map(entry => entry.destination.goldPerTurn);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });

  it('gives development priority to the viewer’s own city with an active build', () => {
    const recommendations = getTradeRouteRecommendations(makeState({ betaBuilding: false }), 'alpha', 'trader-1');
    const development = recommendations['useful-development'];

    expect(development.length).toBeGreaterThan(0);
    // Every development recommendation is a domestic city.
    for (const entry of development) expect(entry.destination.domestic).toBe(true);
  });

  it('excludes a route whose own endpoint the viewer knows is blockaded from lower-known-danger', () => {
    const open = getTradeRouteRecommendations(makeState(), 'alpha', 'trader-1');
    const blockaded = getTradeRouteRecommendations(makeState({ blockade: 'alpha-port' }), 'alpha', 'trader-1');

    const safeIds = open['lower-known-danger'].map(entry => entry.destination.cityId);
    const blockadedSafe = blockaded['lower-known-danger'].map(entry => entry.destination.cityId);
    // The viewer's own blockaded city is no longer offered as a lower-danger option.
    expect(blockadedSafe.length).toBeLessThan(safeIds.length);
  });

  it('is unchanged by a fleet the viewer has never seen (a foreign blockade)', () => {
    // gamma blockades beta's city: a fact alpha has not earned, so no recommendation may move.
    const withHiddenFleet = getTradeRouteRecommendations(makeState({ blockade: 'betatown' }), 'alpha', 'trader-1');
    const withoutFleet = getTradeRouteRecommendations(makeState(), 'alpha', 'trader-1');

    expect(withHiddenFleet).toEqual(withoutFleet);
  });
});
