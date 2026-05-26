import { describe, it, expect, vi } from 'vitest';
import {
  RESOURCE_DEFINITIONS,
  RESOURCE_ICONS,
  RESOURCE_TECH,
  BASE_PRICES,
  createMarketplaceState,
  calculatePrice,
  detectMonopoly,
  calculateTradeRouteGold,
  updatePrices,
  processFashionCycle,
  processTradeRouteIncome,
  getEffectiveGoldPerTurn,
  getRouteCapacity,
  getCaravanTripBonus,
  canEstablishRoute,
  establishRoute,
  removeRouteForUnit,
  resolveFromCity,
} from '@/systems/trade-system';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';
import { TRAINABLE_UNITS, PRODUCTION_ICONS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';

describe('trade-system', () => {
  describe('RESOURCE_DEFINITIONS', () => {
    it('defines 16 resources (10 luxury + 6 strategic)', () => {
      expect(RESOURCE_DEFINITIONS).toHaveLength(16);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury')).toHaveLength(10);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'strategic')).toHaveLength(6);
    });

    it('each resource has a positive base price', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(r.basePrice).toBeGreaterThan(0);
      }
    });
  });

  describe('catalog integrity — tech and icon fields', () => {
    it('every ResourceDefinition entry has a non-empty tech field', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(r.tech, `${r.id} missing tech`).toBeTruthy();
      }
    });

    it('every tech field references a real tech id in TECH_TREE', () => {
      const techIds = new Set(TECH_TREE.map(t => t.id));
      for (const r of RESOURCE_DEFINITIONS) {
        expect(techIds.has(r.tech), `${r.id}.tech "${r.tech}" not found in TECH_TREE`).toBe(true);
      }
    });

    it('every ResourceDefinition entry has a non-empty icon field', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(r.icon, `${r.id} missing icon`).toBeTruthy();
      }
    });

    it('RESOURCE_ICONS has a non-empty entry for every resource id', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_ICONS[r.id], `RESOURCE_ICONS missing "${r.id}"`).toBeTruthy();
      }
    });

    it('RESOURCE_TECH has a non-empty entry for every resource id', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_TECH[r.id], `RESOURCE_TECH missing "${r.id}"`).toBeTruthy();
      }
    });

    it('RESOURCE_ICONS values match icon fields on RESOURCE_DEFINITIONS', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_ICONS[r.id]).toBe(r.icon);
      }
    });

    it('RESOURCE_TECH values match tech fields on RESOURCE_DEFINITIONS', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_TECH[r.id]).toBe(r.tech);
      }
    });
  });

  describe('S2a catalog — requiredImprovement and new resources', () => {
    it('all 6 new resources appear in RESOURCE_DEFINITIONS', () => {
      const ids = RESOURCE_DEFINITIONS.map(r => r.id);
      for (const id of ['gold', 'silver', 'furs', 'cattle', 'sheep', 'salt']) {
        expect(ids, `missing resource "${id}"`).toContain(id);
      }
    });

    it('every resource has a non-empty requiredImprovement field', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(
          (r as unknown as Record<string, unknown>).requiredImprovement,
          `${r.id} missing requiredImprovement`,
        ).toBeTruthy();
      }
    });

    it('requiredImprovement values are valid BuildableImprovementTypes', () => {
      const valid = new Set(['farm', 'mine', 'lumber_camp', 'watermill', 'plantation', 'pasture', 'camp', 'quarry']);
      for (const r of RESOURCE_DEFINITIONS) {
        const imp = (r as unknown as Record<string, unknown>).requiredImprovement as string | undefined;
        expect(valid.has(imp ?? ''), `${r.id}.requiredImprovement "${imp}" is not a valid BuildableImprovementType`).toBe(true);
      }
    });

    it('stone has requiredImprovement of quarry', () => {
      const stone = RESOURCE_DEFINITIONS.find(r => r.id === 'stone');
      expect((stone as unknown as Record<string, unknown>).requiredImprovement).toBe('quarry');
    });

    it('horses has requiredImprovement of pasture', () => {
      const horses = RESOURCE_DEFINITIONS.find(r => r.id === 'horses');
      expect((horses as unknown as Record<string, unknown>).requiredImprovement).toBe('pasture');
    });

    it('silk has requiredImprovement of plantation', () => {
      const silk = RESOURCE_DEFINITIONS.find(r => r.id === 'silk');
      expect((silk as unknown as Record<string, unknown>).requiredImprovement).toBe('plantation');
    });

    it('ivory has requiredImprovement of camp', () => {
      const ivory = RESOURCE_DEFINITIONS.find(r => r.id === 'ivory');
      expect((ivory as unknown as Record<string, unknown>).requiredImprovement).toBe('camp');
    });

    it('stone has terrain of mountain (corrected from hills)', () => {
      const stone = RESOURCE_DEFINITIONS.find(r => r.id === 'stone');
      expect(stone?.terrain).toBe('mountain');
    });

    it('furs has multi-terrain entry covering forest and tundra', () => {
      const furs = RESOURCE_DEFINITIONS.find(r => r.id === 'furs');
      expect(Array.isArray(furs?.terrain)).toBe(true);
      expect(furs?.terrain).toContain('forest');
      expect(furs?.terrain).toContain('tundra');
    });

    it('cattle has multi-terrain entry covering grassland and plains', () => {
      const cattle = RESOURCE_DEFINITIONS.find(r => r.id === 'cattle');
      expect(Array.isArray(cattle?.terrain)).toBe(true);
      expect(cattle?.terrain).toContain('grassland');
      expect(cattle?.terrain).toContain('plains');
    });
  });

  describe('createMarketplaceState', () => {
    it('initializes all resource prices at base values', () => {
      const market = createMarketplaceState();
      for (const r of RESOURCE_DEFINITIONS) {
        expect(market.prices[r.id]).toBe(r.basePrice);
      }
    });

    it('starts with no fashion and no trade routes', () => {
      const market = createMarketplaceState();
      expect(market.fashionable).toBeNull();
      expect(market.tradeRoutes).toHaveLength(0);
    });
  });

  describe('calculatePrice', () => {
    it('returns base price when supply equals demand', () => {
      const price = calculatePrice(10, 5, 5, false, false);
      expect(price).toBe(10);
    });

    it('increases price when demand exceeds supply', () => {
      const price = calculatePrice(10, 2, 8, false, false);
      expect(price).toBeGreaterThan(10);
    });

    it('decreases price when supply exceeds demand', () => {
      const price = calculatePrice(10, 8, 2, false, false);
      expect(price).toBeLessThan(10);
    });

    it('doubles price for monopoly', () => {
      const normal = calculatePrice(10, 5, 5, false, false);
      const monopoly = calculatePrice(10, 5, 5, true, false);
      expect(monopoly).toBe(normal * 2);
    });

    it('doubles demand for fashionable resources', () => {
      const normal = calculatePrice(10, 5, 5, false, false);
      const fashionable = calculatePrice(10, 5, 5, false, true);
      expect(fashionable).toBeGreaterThan(normal);
    });

    it('never returns less than 1', () => {
      expect(calculatePrice(1, 100, 1, false, false)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('detectMonopoly', () => {
    it('returns true when controlling 60%+', () => {
      expect(detectMonopoly(6, 10)).toBe(true);
    });

    it('returns false below 60%', () => {
      expect(detectMonopoly(5, 10)).toBe(false);
    });

    it('returns false with zero total supply', () => {
      expect(detectMonopoly(0, 0)).toBe(false);
    });
  });

  describe('calculateTradeRouteGold', () => {
    it('returns at least base gold for short routes', () => {
      expect(calculateTradeRouteGold(1, 0)).toBeGreaterThanOrEqual(2);
    });

    it('increases with distance', () => {
      const short = calculateTradeRouteGold(1, 0);
      const long = calculateTradeRouteGold(9, 0);
      expect(long).toBeGreaterThan(short);
    });

    it('increases with resource diversity', () => {
      const low = calculateTradeRouteGold(5, 1);
      const high = calculateTradeRouteGold(5, 4);
      expect(high).toBeGreaterThan(low);
    });
  });

  describe('updatePrices', () => {
    it('updates prices and records history', () => {
      const market = createMarketplaceState();
      const updated = updatePrices(market, { silk: 2 }, { silk: 5 });
      expect(updated.priceHistory['silk'].length).toBe(2);
    });
  });

  describe('processFashionCycle', () => {
    it('decrements fashion turns', () => {
      const market = createMarketplaceState();
      market.fashionable = 'silk';
      market.fashionTurnsLeft = 5;
      const updated = processFashionCycle(market, () => 0.5);
      expect(updated.fashionTurnsLeft).toBe(4);
    });

    it('clears fashion when turns reach zero', () => {
      const market = createMarketplaceState();
      market.fashionable = 'silk';
      market.fashionTurnsLeft = 1;
      const updated = processFashionCycle(market, () => 0.5);
      expect(updated.fashionable).toBeNull();
      expect(updated.fashionTurnsLeft).toBe(0);
    });
  });

  describe('processTradeRouteIncome', () => {
    it('sums effective gold/turn from all routes', () => {
      const routes = [
        { id: 'r1', fromCityId: 'c1', toCityId: 'c2', goldPerTrip: 9, turnsPerTrip: 3 },  // 3/turn
        { id: 'r2', fromCityId: 'c1', toCityId: 'c3', goldPerTrip: 15, turnsPerTrip: 3 }, // 5/turn
      ];
      expect(processTradeRouteIncome(routes)).toBe(8);
    });

    it('returns 0 for empty routes', () => {
      expect(processTradeRouteIncome([])).toBe(0);
    });
  });

  describe('getEffectiveGoldPerTurn', () => {
    it('floors goldPerTrip / turnsPerTrip', () => {
      expect(getEffectiveGoldPerTurn({ id: 'r1', fromCityId: 'c1', toCityId: 'c2', goldPerTrip: 10, turnsPerTrip: 3 })).toBe(3);
    });
    it('returns minimum 1 even for tiny routes', () => {
      expect(getEffectiveGoldPerTurn({ id: 'r1', fromCityId: 'c1', toCityId: 'c2', goldPerTrip: 1, turnsPerTrip: 5 })).toBe(1);
    });
  });

  describe('S5 — caravan trade routes', () => {
    function makeTile(q: number, r: number) {
      return { coord: { q, r }, terrain: 'grassland' as const, rivers: [], improvement: null, owner: null, resource: null, wonder: null };
    }

    function makeMinimalState(overrides: Partial<{
      caravanPos: { q: number; r: number };
      city1Buildings: string[];
      city2Buildings: string[];
      atWarWith: string[];
      relationship: number;
      tradeRoutes: any[];
    }> = {}): GameState {
      const tiles: Record<string, any> = {};
      for (let q = 0; q < 5; q++) {
        for (let r = 0; r < 5; r++) {
          tiles[`${q},${r}`] = makeTile(q, r);
        }
      }
      const caravanPos = overrides.caravanPos ?? { q: 0, r: 0 };
      const marketplace = createMarketplaceState();
      if (overrides.tradeRoutes) {
        marketplace.tradeRoutes = overrides.tradeRoutes;
      }
      return {
        turn: 1,
        era: 1,
        currentPlayer: 'player',
        map: { tiles, width: 5, height: 5, wrapsHorizontally: false },
        marketplace,
        idCounters: { nextUnitId: 10, nextCityId: 10, nextCampId: 10, nextQuestId: 10, nextRouteId: 1 },
        civilizations: {
          player: {
            id: 'player', name: 'Player', color: '#00f', civType: 'generic',
            gold: 100, cities: ['city1', 'city2'], units: ['caravan1'],
            techState: { completed: ['trade-routes', 'wheel'], currentResearch: null, progress: {}, trackPriorities: {} as any },
            diplomacy: { relationships: { enemy: overrides.relationship ?? 0 }, treaties: [], events: [], atWarWith: overrides.atWarWith ?? [] },
            knownCivilizations: ['enemy'],
            visibility: { tiles: {}, fogMap: {} },
          },
          enemy: {
            id: 'enemy', name: 'Enemy', color: '#f00', civType: 'generic',
            gold: 100, cities: ['city3'], units: [],
            techState: { completed: [], currentResearch: null, progress: {}, trackPriorities: {} as any },
            diplomacy: { relationships: { player: overrides.relationship ?? 0 }, treaties: [], events: [], atWarWith: overrides.atWarWith?.includes('player') ? ['player'] : [] },
            knownCivilizations: [],
            visibility: { tiles: {}, fogMap: {} },
          },
        },
        cities: {
          city1: { id: 'city1', name: 'Alpha', owner: 'player', position: { q: 0, r: 0 }, buildings: overrides.city1Buildings ?? [], productionQueue: [], food: 0, production: 0, population: 1, workedTiles: [], unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 } as any,
          city2: { id: 'city2', name: 'Beta', owner: 'player', position: { q: 2, r: 0 }, buildings: overrides.city2Buildings ?? [], productionQueue: [], food: 0, production: 0, population: 1, workedTiles: [], unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 } as any,
          city3: { id: 'city3', name: 'Gamma', owner: 'enemy', position: { q: 4, r: 0 }, buildings: [], productionQueue: [], food: 0, production: 0, population: 1, workedTiles: [], unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 } as any,
        },
        units: {
          caravan1: { id: 'caravan1', type: 'caravan', owner: 'player', position: caravanPos, health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false, skippedTurn: false, isResting: false } as any,
        },
        barbarianCamps: {}, minorCivs: {}, espionage: {}, pendingEvents: {},
        tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {}, legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
        legendaryWonderIntel: {}, legendaryWonderProjects: {},
        settings: { mapSize: 'small', opponentCount: 1, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      } as any;
    }

    it("'caravan' is in UNIT_DEFINITIONS", () => {
      expect(UNIT_DEFINITIONS['caravan']).toBeDefined();
      expect(UNIT_DEFINITIONS['caravan'].strength).toBe(0);
    });

    it("UNIT_DESCRIPTIONS['caravan'] is present", () => {
      expect(UNIT_DESCRIPTIONS['caravan']).toBeTruthy();
    });

    it("PRODUCTION_ICONS['caravan'] is present", () => {
      expect((PRODUCTION_ICONS as Record<string, string>)['caravan']).toBeTruthy();
    });

    it("caravan is in TRAINABLE_UNITS gated by trade-routes tech", () => {
      const entries = TRAINABLE_UNITS as any[];
      const entry = entries.find((e: any) => e.type === 'caravan');
      expect(entry).toBeDefined();
      expect(entry.techRequired).toBe('trade-routes');
    });

    it("getRouteCapacity: base=1 (marketplace building); +1 per caravanserai", () => {
      const state = makeMinimalState();
      expect(getRouteCapacity(state, 'city1')).toBe(1); // has marketplace implicit
      // Add caravanserai building
      state.cities['city1'].buildings = ['caravanserai'];
      expect(getRouteCapacity(state, 'city1')).toBe(2);
    });

    it("getCaravanTripBonus: +2 from caravanserai at FROM; +2 from caravanserai at TO; Silk Road always 0", () => {
      const state = makeMinimalState();
      expect(getCaravanTripBonus(state, 'city1', 'city2', 'player')).toBe(0); // no buildings
      state.cities['city1'].buildings = ['caravanserai'];
      expect(getCaravanTripBonus(state, 'city1', 'city2', 'player')).toBe(2);
      state.cities['city2'].buildings = ['caravanserai'];
      expect(getCaravanTripBonus(state, 'city1', 'city2', 'player')).toBe(4);
    });

    it("canEstablishRoute domestic: ok when capacity available", () => {
      const state = makeMinimalState();
      const caravan = state.units['caravan1'];
      const result = canEstablishRoute(state, caravan, 'city2');
      expect(result.ok).toBe(true);
    });

    it("canEstablishRoute domestic: blocked when FROM city at capacity", () => {
      const state = makeMinimalState({ tradeRoutes: [{ id: 'r1', fromCityId: 'city1', toCityId: 'city2', goldPerTrip: 9, turnsPerTrip: 3 }] });
      const caravan = state.units['caravan1'];
      const result = canEstablishRoute(state, caravan, 'city2');
      expect(result.ok).toBe(false);
    });

    it("canEstablishRoute foreign: ok at relationship >= 0, not at war", () => {
      const state = makeMinimalState({ relationship: 0, atWarWith: [] });
      const caravan = state.units['caravan1'];
      const result = canEstablishRoute(state, caravan, 'city3');
      expect(result.ok).toBe(true);
    });

    it("canEstablishRoute foreign: blocked at war", () => {
      const state = makeMinimalState({ atWarWith: ['enemy'] });
      const caravan = state.units['caravan1'];
      const result = canEstablishRoute(state, caravan, 'city3');
      expect(result.ok).toBe(false);
    });

    it("canEstablishRoute foreign: blocked at relationship < 0", () => {
      const state = makeMinimalState({ relationship: -20 });
      const caravan = state.units['caravan1'];
      const result = canEstablishRoute(state, caravan, 'city3');
      expect(result.ok).toBe(false);
    });

    it("canEstablishRoute: blocked when caravan already has committedToRouteId", () => {
      const state = makeMinimalState();
      state.units['caravan1'] = { ...state.units['caravan1'], committedToRouteId: 'route-existing' } as any;
      const result = canEstablishRoute(state, state.units['caravan1'], 'city2');
      expect(result.ok).toBe(false);
    });

    it("canEstablishRoute: blocked when FROM city === TO city (self-route)", () => {
      const state = makeMinimalState();
      const result = canEstablishRoute(state, state.units['caravan1'], 'city1');
      expect(result.ok).toBe(false);
    });

    it("establishRoute: sets committedToRouteId + tripsRemaining on unit", () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      const newState = establishRoute(state, 'caravan1', 'city2', bus, 0);
      const unit = newState.units['caravan1'];
      expect(unit.committedToRouteId).toBeTruthy();
      expect(unit.tripsRemaining).toBeGreaterThan(0);
    });

    it("establishRoute: pushes route to marketplace.tradeRoutes", () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      const newState = establishRoute(state, 'caravan1', 'city2', bus, 0);
      expect(newState.marketplace!.tradeRoutes).toHaveLength(1);
      expect(newState.marketplace!.tradeRoutes[0].fromCityId).toBe('city1');
      expect(newState.marketplace!.tradeRoutes[0].toCityId).toBe('city2');
    });

    it("establishRoute: emits trade:route-created exactly once", () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      const emitted: string[] = [];
      bus.on('trade:route-created', () => emitted.push('route-created'));
      establishRoute(state, 'caravan1', 'city2', bus, 0);
      expect(emitted).toHaveLength(1);
    });

    it("establishRoute: sets foreignCivId when TO city is foreign", () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      const newState = establishRoute(state, 'caravan1', 'city3', bus, 0);
      const route = newState.marketplace!.tradeRoutes[0];
      expect(route.foreignCivId).toBe('enemy');
    });

    it("establishRoute: does NOT set foreignCivId for domestic route", () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      const newState = establishRoute(state, 'caravan1', 'city2', bus, 0);
      const route = newState.marketplace!.tradeRoutes[0];
      expect(route.foreignCivId).toBeUndefined();
    });

    it("resolveFromCity: returns city1 for caravan at q=0,r=0", () => {
      const state = makeMinimalState();
      const city = resolveFromCity(state, state.units['caravan1']);
      expect(city?.id).toBe('city1');
    });

    it("resolveFromCity: returns null when all cities at capacity", () => {
      // Fill city1 and city2 to capacity
      const state = makeMinimalState({
        tradeRoutes: [
          { id: 'r1', fromCityId: 'city1', toCityId: 'city2', goldPerTrip: 9, turnsPerTrip: 3 },
          { id: 'r2', fromCityId: 'city2', toCityId: 'city1', goldPerTrip: 9, turnsPerTrip: 3 },
        ],
      });
      const city = resolveFromCity(state, state.units['caravan1']);
      expect(city).toBeNull();
    });

    it("removeRouteForUnit: removes route and clears committedToRouteId on unit", () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      let newState = establishRoute(state, 'caravan1', 'city2', bus, 0);
      const routeId = newState.units['caravan1'].committedToRouteId!;
      newState = removeRouteForUnit(newState, 'caravan1', bus, 'unit-disbanded');
      expect(newState.marketplace!.tradeRoutes).toHaveLength(0);
      expect(newState.units['caravan1']?.committedToRouteId).toBeUndefined();
    });

    it("removeRouteForUnit: emits trade:route-ended with given reason", () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      let newState = establishRoute(state, 'caravan1', 'city2', bus, 0);
      const events: string[] = [];
      bus.on('trade:route-ended', (e) => events.push(e.reason));
      newState = removeRouteForUnit(newState, 'caravan1', bus, 'unit-died');
      expect(events).toEqual(['unit-died']);
    });
  });
});
