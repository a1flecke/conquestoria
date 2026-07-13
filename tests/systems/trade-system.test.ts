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
  getTradeUnitTripBonus,
  canEstablishRoute,
  establishRoute,
  removeRouteForUnit,
  resolveFromCity,
  removeRouteById,
  scrubStaleForeignRoutes,
  scrubEmbargoedRoutes,
} from '@/systems/trade-system';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';
import { TRAINABLE_UNITS, PRODUCTION_ICONS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { advanceRouteRunners } from '@/systems/unit-movement-system';
import { establishQuestAwareRoute } from '@/systems/quest-aware-trade-system';
import { hasAITradeRole } from '@/ai/ai-unit-roles';

// Shared fixture — used by S5 and S6a describe blocks
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

describe('trade-system', () => {
  describe('RESOURCE_DEFINITIONS', () => {
    it('defines 22 resources (10 luxury + 12 strategic)', () => {
      expect(RESOURCE_DEFINITIONS).toHaveLength(22);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury')).toHaveLength(10);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'strategic')).toHaveLength(12);
    });

    it('defines the industrial-to-future resources with stable, distinct material metadata', () => {
      const expected = {
        coal: { price: 7, tech: 'steam-power', terrain: ['hills'], improvement: 'mine', effect: { type: 'production', amount: 1 } },
        oil: { price: 12, tech: 'petroleum-industry', terrain: ['plains', 'desert'], improvement: 'oil_well', effect: { type: 'production', amount: 1 } },
        aluminum: { price: 10, tech: 'aluminium-smelting', terrain: ['hills', 'desert'], improvement: 'mine', effect: null },
        uranium: { price: 16, tech: 'nuclear-physics', terrain: ['hills', 'tundra', 'desert'], improvement: 'mine', effect: { type: 'science', amount: 1 } },
        'rare-earth-elements': { price: 14, tech: 'nanomaterials', terrain: ['hills', 'desert'], improvement: 'mine', effect: { type: 'science', amount: 1 } },
        'battery-minerals': { price: 13, tech: 'smart-cities', terrain: ['hills', 'desert', 'plains'], improvement: 'mine', effect: { type: 'production', amount: 1 } },
      } as const;

      for (const [id, expectedDefinition] of Object.entries(expected)) {
        const definition = RESOURCE_DEFINITIONS.find(resource => resource.id === id);
        expect(definition, `missing resource ${id}`).toBeDefined();
        expect(definition?.basePrice).toBe(expectedDefinition.price);
        expect(definition?.tech).toBe(expectedDefinition.tech);
        expect([...(Array.isArray(definition?.terrain) ? definition.terrain : [definition?.terrain])].sort())
          .toEqual([...expectedDefinition.terrain].sort());
        expect(definition?.requiredImprovement).toBe(expectedDefinition.improvement);
        expect(definition?.effect).toEqual(expectedDefinition.effect);
        expect((definition as { materialFamily?: string } | undefined)?.materialFamily).toBeTruthy();
        expect((definition as { codex?: { summary?: string } } | undefined)?.codex?.summary).toBeTruthy();

        const revealTech = TECH_TREE.find(tech => tech.id === expectedDefinition.tech);
        expect(revealTech?.unlocks).toContain(`Reveal ${definition?.name} resource`);
      }

      const rareEarth = RESOURCE_DEFINITIONS.find(resource => resource.id === 'rare-earth-elements') as { materialFamily?: string } | undefined;
      const battery = RESOURCE_DEFINITIONS.find(resource => resource.id === 'battery-minerals') as { materialFamily?: string } | undefined;
      expect(rareEarth?.materialFamily).not.toBe(battery?.materialFamily);
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
      const valid = new Set(['farm', 'mine', 'lumber_camp', 'watermill', 'plantation', 'pasture', 'camp', 'quarry', 'oil_well']);
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

    it("getTradeUnitTripBonus: +2 from caravanserai at FROM; +2 from caravanserai at TO; Silk Road always 0", () => {
      const state = makeMinimalState();
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player')).toBe(0); // no buildings
      state.cities['city1'].buildings = ['caravanserai'];
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player')).toBe(2);
      state.cities['city2'].buildings = ['caravanserai'];
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player')).toBe(4);
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

    it('establishRoute advances the exact issuer route quest', () => {
      const state = makeMinimalState();
      state.cities.city3.owner = 'mc-carthage';
      state.minorCivs['mc-carthage'] = {
        id: 'mc-carthage', definitionId: 'carthage', cityId: 'city3', units: [],
        diplomacy: { ...state.civilizations.player.diplomacy, relationships: { player: 0 } },
        activeQuests: {
          player: {
            id: 'quest-route', type: 'trade_route', description: 'Open a route',
            target: { type: 'trade_route', minorCivId: 'mc-carthage' }, reward: { relationshipBonus: 10 },
            progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
          },
        },
        chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
        isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
      };

      const nextState = establishQuestAwareRoute(state, 'caravan1', 'city3', 0).state;

      expect(nextState.minorCivs['mc-carthage'].activeQuests.player).toBeUndefined();
    });

    it('uses canonical city-state diplomacy when validating a route', () => {
      const state = makeMinimalState();
      state.cities.city3.owner = 'mc-carthage';
      state.minorCivs['mc-carthage'] = {
        id: 'mc-carthage', definitionId: 'carthage', cityId: 'city3', units: [],
        diplomacy: { ...state.civilizations.player.diplomacy, relationships: { player: -1 } },
        activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
        isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
      };
      state.civilizations.player.diplomacy.relationships['mc-carthage'] = 100;

      expect(canEstablishRoute(state, state.units.caravan1, 'city3').ok).toBe(false);

      state.minorCivs['mc-carthage'].diplomacy.relationships.player = 0;
      state.civilizations.player.diplomacy.relationships['mc-carthage'] = -100;
      expect(canEstablishRoute(state, state.units.caravan1, 'city3').ok).toBe(true);
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

  describe('Trade Routes Overhaul (#553 MR1/4) — domain-generic pathfinding', () => {
    // city1 (0,0) and city2 (2,0) are ordinary land-terrain cities (unchanged grassland,
    // matching how real coastal cities work — see findPathToCity's docstring). The entire
    // q=1 column is ocean (5x5 test map, r=0..4) so there is genuinely no land bridge —
    // not just a single blocked hex a land unit could route around. This isolates "does
    // the trade unit's own movement domain get used" from any other pathing variable.
    function makeNavalState(unitType: 'caravan' | 'naval_trader' = 'naval_trader'): GameState {
      const state = makeMinimalState();
      for (let r = 0; r < 5; r++) {
        state.map.tiles[`1,${r}`] = { coord: { q: 1, r }, terrain: 'ocean', elevation: 'lowland', improvement: 'none', improvementTurnsLeft: 0, owner: null, resource: null, hasRiver: false, wonder: null };
      }
      state.units['caravan1'] = { ...state.units['caravan1'], type: unitType };
      return state;
    }

    it('naval-domain trade unit can establish a route across water when a valid sea path exists', () => {
      const state = makeNavalState('naval_trader');
      const result = canEstablishRoute(state, state.units['caravan1'], 'city2');
      expect(result.ok).toBe(true);
    });

    it('land-domain caravan still fails with the water-crossing reason when no land path exists', () => {
      const state = makeNavalState('caravan');
      const result = canEstablishRoute(state, state.units['caravan1'], 'city2');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Requires a Naval Trader to cross water');
    });

    it('resolveFromCity uses the naval trade unit\'s own domain, not hardcoded land', () => {
      const state = makeNavalState('naval_trader');
      const city = resolveFromCity(state, state.units['caravan1']);
      expect(city?.id).toBe('city1');
    });

    it('establishRoute succeeds end-to-end for a naval trade unit across water', () => {
      const state = makeNavalState('naval_trader');
      const bus = new EventBus();
      const newState = establishRoute(state, 'caravan1', 'city2', bus, 0);
      expect(newState.units['caravan1'].committedToRouteId).toBeTruthy();
      expect(newState.marketplace!.tradeRoutes).toHaveLength(1);
    });

    it('getTradeUnitTripBonus: naval tier bonuses match TRADE_UNIT_TIER_BONUS and cap at +3', () => {
      const state = makeMinimalState();
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'naval_trader')).toBe(0);
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'steamship_trader')).toBe(1);
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'cargo_freighter')).toBe(2);
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'container_ship')).toBe(3);
    });

    it('getTradeUnitTripBonus: caravan (no tier bonus) matches pre-rename getCaravanTripBonus values', () => {
      const state = makeMinimalState();
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'caravan')).toBe(0);
      state.cities['city1'].buildings = ['caravanserai'];
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'caravan')).toBe(2);
    });

    it('getTradeUnitTripBonus: tier bonus stacks with caravanserai/Silk Road but total still respects the +3 tier cap', () => {
      const state = makeMinimalState();
      state.cities['city1'].buildings = ['caravanserai'];
      state.cities['city2'].buildings = ['caravanserai'];
      // +2 (from) + +2 (to) + +3 (container_ship tier, already capped at 3) = 7
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'container_ship')).toBe(7);
    });

    it.each([
      ['naval_trader', 'steamship_trader', 'colonial-trade'],
      ['steamship_trader', 'cargo_freighter', 'steam-navigation'],
      ['cargo_freighter', 'container_ship', 'convoy-system'],
    ] as const)('%s upgrades into %s once %s completes', (fromType, toType, _techId) => {
      const entries = TRAINABLE_UNITS as any[];
      const fromEntry = entries.find((e: any) => e.type === fromType);
      const toEntry = entries.find((e: any) => e.type === toType);
      expect(fromEntry).toBeDefined();
      expect(toEntry).toBeDefined();
      expect(fromEntry.upgradesTo).toBe(toType);
      expect(fromEntry.obsoletedByTech).toBe(toEntry.techRequired);
    });

    it('container_ship is the top tier — no further obsoletedByTech/upgradesTo', () => {
      const entries = TRAINABLE_UNITS as any[];
      const entry = entries.find((e: any) => e.type === 'container_ship');
      expect(entry).toBeDefined();
      expect(entry.obsoletedByTech).toBeUndefined();
      expect(entry.upgradesTo).toBeUndefined();
    });

    it.each(['naval_trader', 'steamship_trader', 'cargo_freighter', 'container_ship'] as const)(
      '%s: end-to-end catalog wiring (UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, PRODUCTION_ICONS, TRAINABLE_UNITS coastalRequired)',
      (type) => {
        expect(UNIT_DEFINITIONS[type]).toBeDefined();
        expect(UNIT_DEFINITIONS[type].domain).toBe('naval');
        expect(UNIT_DEFINITIONS[type].strength).toBe(0);
        expect(UNIT_DESCRIPTIONS[type]).toBeTruthy();
        expect((PRODUCTION_ICONS as Record<string, string>)[type]).toBeTruthy();
        const entry = (TRAINABLE_UNITS as any[]).find((e: any) => e.type === type);
        expect(entry).toBeDefined();
        expect(entry.coastalRequired).toBe(true);
      },
    );

    it('each naval trade tech unlocksUnits its tier', () => {
      const byId = (id: string) => TECH_TREE.find(t => t.id === id);
      expect(byId('colonial-trade')?.unlocksUnits).toContain('naval_trader');
      expect(byId('steam-navigation')?.unlocksUnits).toContain('steamship_trader');
      expect(byId('convoy-system')?.unlocksUnits).toContain('cargo_freighter');
      expect(byId('container-shipping')?.unlocksUnits).toContain('container_ship');
    });
  });

  describe('Trade Routes Overhaul (#553 MR2/4) — land trade line extension', () => {
    it('getTradeUnitTripBonus: land tier bonuses match TRADE_UNIT_TIER_BONUS and cap at +3', () => {
      const state = makeMinimalState();
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'caravan')).toBe(0);
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'merchant_wagon')).toBe(1);
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'freight_convoy')).toBe(2);
    });

    it('getTradeUnitTripBonus: land tier bonus stacks with caravanserai but total still respects the +3 tier cap', () => {
      const state = makeMinimalState();
      state.cities['city1'].buildings = ['caravanserai'];
      state.cities['city2'].buildings = ['caravanserai'];
      // +2 (from) + +2 (to) + +2 (freight_convoy tier) = 6
      expect(getTradeUnitTripBonus(state, 'city1', 'city2', 'player', 'freight_convoy')).toBe(6);
    });

    it.each([
      ['caravan', 'merchant_wagon', 'mercantilism'],
      ['merchant_wagon', 'freight_convoy', 'highway-network'],
    ] as const)('%s upgrades into %s once %s completes', (fromType, toType, _techId) => {
      const entries = TRAINABLE_UNITS as any[];
      const fromEntry = entries.find((e: any) => e.type === fromType);
      const toEntry = entries.find((e: any) => e.type === toType);
      expect(fromEntry).toBeDefined();
      expect(toEntry).toBeDefined();
      expect(fromEntry.upgradesTo).toBe(toType);
      expect(fromEntry.obsoletedByTech).toBe(toEntry.techRequired);
    });

    it('freight_convoy is the top tier — no further obsoletedByTech/upgradesTo', () => {
      const entries = TRAINABLE_UNITS as any[];
      const entry = entries.find((e: any) => e.type === 'freight_convoy');
      expect(entry).toBeDefined();
      expect(entry.obsoletedByTech).toBeUndefined();
      expect(entry.upgradesTo).toBeUndefined();
    });

    it('caravan still functions correctly pre-upgrade (gains an upgrade path, not a regression)', () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      const newState = establishRoute(state, 'caravan1', 'city2', bus, 0);
      expect(newState.units['caravan1'].committedToRouteId).toBeTruthy();
      expect(newState.marketplace!.tradeRoutes).toHaveLength(1);
    });

    it.each(['merchant_wagon', 'freight_convoy'] as const)(
      '%s: end-to-end catalog wiring (UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, PRODUCTION_ICONS, TRAINABLE_UNITS)',
      (type) => {
        expect(UNIT_DEFINITIONS[type]).toBeDefined();
        expect(UNIT_DEFINITIONS[type].domain).toBe('land');
        expect(UNIT_DEFINITIONS[type].strength).toBe(0);
        expect(UNIT_DESCRIPTIONS[type]).toBeTruthy();
        expect((PRODUCTION_ICONS as Record<string, string>)[type]).toBeTruthy();
        const entry = (TRAINABLE_UNITS as any[]).find((e: any) => e.type === type);
        expect(entry).toBeDefined();
        expect(entry.coastalRequired).toBeUndefined();
      },
    );

    it('each land trade tech unlocksUnits its tier', () => {
      const byId = (id: string) => TECH_TREE.find(t => t.id === id);
      expect(byId('mercantilism')?.unlocksUnits).toContain('merchant_wagon');
      expect(byId('highway-network')?.unlocksUnits).toContain('freight_convoy');
    });

    it.each(['merchant_wagon', 'freight_convoy'] as const)(
      '%s has an AI trade role and is treated as a land trade unit',
      (type) => {
        expect(hasAITradeRole(type)).toBe(true);
      },
    );
  });

  describe('S6a — route lifecycle', () => {
    it('removeRouteById: removes route, clears caravan, emits event with given reason', () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0); // foreign route to 'enemy'
      const routeId = s.marketplace!.tradeRoutes[0].id;
      const events: Array<{ reason: string }> = [];
      bus.on('trade:route-ended', e => events.push({ reason: e.reason }));

      s = removeRouteById(s, routeId, bus, 'war-declared');

      expect(s.marketplace!.tradeRoutes).toHaveLength(0);
      expect(s.units['caravan1']?.committedToRouteId).toBeUndefined();
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('war-declared');
    });

    it('removeRouteById: no-op when route does not exist', () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      const events: string[] = [];
      bus.on('trade:route-ended', () => events.push('fired'));
      const result = removeRouteById(state, 'no-such-route', bus, 'embargo');
      expect(result).toBe(state); // same reference — nothing changed
      expect(events).toHaveLength(0);
    });

    it('scrubStaleForeignRoutes: war → foreign route terminated', () => {
      // Establish route while not at war, then simulate war before lifecycle pass
      const state = makeMinimalState({ atWarWith: [], relationship: 0 });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0); // foreign route to 'enemy'
      // Simulate war declared (both sides added to atWarWith — bilateral)
      s = {
        ...s,
        civilizations: {
          ...s.civilizations,
          player: { ...s.civilizations['player'], diplomacy: { ...s.civilizations['player'].diplomacy, atWarWith: ['enemy'] } },
        },
      };
      expect(s.marketplace!.tradeRoutes).toHaveLength(1);

      const events: Array<{ reason: string }> = [];
      bus.on('trade:route-ended', e => events.push({ reason: e.reason }));

      s = scrubStaleForeignRoutes(s, bus);

      expect(s.marketplace!.tradeRoutes).toHaveLength(0);
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('war-declared');
    });

    it('scrubStaleForeignRoutes: relations >= 0 + no war → keeps route', () => {
      const state = makeMinimalState({ relationship: 0, atWarWith: [] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0); // foreign route
      s = scrubStaleForeignRoutes(s, bus);
      expect(s.marketplace!.tradeRoutes).toHaveLength(1); // kept
    });

    it('scrubStaleForeignRoutes: relations drop to −26 → terminated', () => {
      // Establish at neutral (0), then drop to −26 before the lifecycle pass
      const state = makeMinimalState({ relationship: 0, atWarWith: [] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0);
      // Simulate relation drift (relationship system lowered it)
      s = {
        ...s,
        civilizations: {
          ...s.civilizations,
          player: {
            ...s.civilizations['player'],
            diplomacy: { ...s.civilizations['player'].diplomacy, relationships: { enemy: -26 } },
          },
        },
      };

      const events: Array<{ reason: string }> = [];
      bus.on('trade:route-ended', e => events.push({ reason: e.reason }));

      s = scrubStaleForeignRoutes(s, bus);

      expect(s.marketplace!.tradeRoutes).toHaveLength(0);
      expect(events[0].reason).toBe('hostile-relations');
    });

    it('scrubStaleForeignRoutes: relations at exactly −25 → keeps route', () => {
      // < -25 terminates; exactly -25 must NOT
      const state = makeMinimalState({ relationship: 0, atWarWith: [] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0);
      s = {
        ...s,
        civilizations: {
          ...s.civilizations,
          player: {
            ...s.civilizations['player'],
            diplomacy: { ...s.civilizations['player'].diplomacy, relationships: { enemy: -25 } },
          },
        },
      };
      s = scrubStaleForeignRoutes(s, bus);
      expect(s.marketplace!.tradeRoutes).toHaveLength(1); // -25 is not < -25 → survives
    });

    it('scrubStaleForeignRoutes: missing fromCity (razed) → route left untouched', () => {
      // Guard: if fromCity no longer exists, skip rather than crash or falsely terminate
      const state = makeMinimalState({ atWarWith: ['enemy'] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0);
      // Raze the from-city so it disappears from state.cities
      const { city1: _removed, ...remainingCities } = s.cities;
      s = { ...s, cities: remainingCities as typeof s.cities };
      const events: string[] = [];
      bus.on('trade:route-ended', () => events.push('fired'));
      s = scrubStaleForeignRoutes(s, bus);
      // Route stays (can't determine owner, so skip rather than terminate)
      expect(s.marketplace!.tradeRoutes).toHaveLength(1);
      expect(events).toHaveLength(0);
    });

    it('scrubStaleForeignRoutes: domestic route unaffected by war', () => {
      const state = makeMinimalState({ atWarWith: ['enemy'] });
      const bus = new EventBus();
      // city2 is owned by 'player' → domestic route (no foreignCivId)
      let s = establishRoute(state, 'caravan1', 'city2', bus, 0);
      s = scrubStaleForeignRoutes(s, bus);
      expect(s.marketplace!.tradeRoutes).toHaveLength(1); // domestic always survives
    });

    it('scrubStaleForeignRoutes: domestic route unaffected by hostile relations', () => {
      const state = makeMinimalState({ relationship: -80, atWarWith: [] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city2', bus, 0); // domestic
      s = scrubStaleForeignRoutes(s, bus);
      expect(s.marketplace!.tradeRoutes).toHaveLength(1);
    });

    it('scrubStaleForeignRoutes: termination event fires exactly once (idempotent)', () => {
      const state = makeMinimalState({ atWarWith: ['enemy'] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0);
      const events: string[] = [];
      bus.on('trade:route-ended', () => events.push('fired'));
      s = scrubStaleForeignRoutes(s, bus);  // removes route, fires event
      s = scrubStaleForeignRoutes(s, bus);  // route already gone — no second event
      expect(events).toHaveLength(1);
    });

    it('scrubEmbargoedRoutes: participant route to embargoed civ → terminated', () => {
      // player embargoes enemy; player has a route TO enemy → must die
      const state = makeMinimalState({ relationship: 0, atWarWith: [] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0); // player → enemy
      s = { ...s, embargoes: [{ id: 'emb-1', targetCivId: 'enemy', participants: ['player'], proposedTurn: 1 }] };

      const events: Array<{ reason: string }> = [];
      bus.on('trade:route-ended', e => events.push({ reason: e.reason }));

      s = scrubEmbargoedRoutes(s, bus);

      expect(s.marketplace!.tradeRoutes).toHaveLength(0);
      expect(events[0].reason).toBe('embargo');
    });

    it('scrubEmbargoedRoutes: embargoed civ route to participant → also terminated', () => {
      // Embargo targets 'enemy'; enemy has a route TO player → must also die
      const state = makeMinimalState({ relationship: 0, atWarWith: [] });
      const bus = new EventBus();
      // Manually inject a route owned by 'enemy' (fromCity=city3) to player's city (city1)
      const marketplace = { ...state.marketplace!, tradeRoutes: [
        { id: 'route-99', fromCityId: 'city3', toCityId: 'city1', goldPerTrip: 6, turnsPerTrip: 2, foreignCivId: 'player' },
      ]};
      let s: GameState = { ...state, marketplace };
      s = { ...s, embargoes: [{ id: 'emb-2', targetCivId: 'enemy', participants: ['player'], proposedTurn: 1 }] };

      const events: Array<{ reason: string }> = [];
      bus.on('trade:route-ended', e => events.push({ reason: e.reason }));

      s = scrubEmbargoedRoutes(s, bus);

      expect(s.marketplace!.tradeRoutes).toHaveLength(0);
      expect(events[0].reason).toBe('embargo');
    });

    it('scrubEmbargoedRoutes: domestic route unaffected by embargo', () => {
      const state = makeMinimalState({ relationship: 0, atWarWith: [] });
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city2', bus, 0); // domestic
      s = { ...s, embargoes: [{ id: 'emb-1', targetCivId: 'enemy', participants: ['player'], proposedTurn: 1 }] };
      s = scrubEmbargoedRoutes(s, bus);
      expect(s.marketplace!.tradeRoutes).toHaveLength(1);
    });

    it('actor-complete: AI-declared war terminates the human route owner\'s foreign route', () => {
      // Start: neutral, no war
      const state = makeMinimalState({ atWarWith: [], relationship: 5 });
      const bus = new EventBus();
      // Establish foreign route player→enemy while relations are good
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0);
      expect(s.marketplace!.tradeRoutes).toHaveLength(1);

      // Simulate AI war declaration: both sides get each other in atWarWith
      s = {
        ...s,
        civilizations: {
          ...s.civilizations,
          player: {
            ...s.civilizations['player'],
            diplomacy: { ...s.civilizations['player'].diplomacy, atWarWith: ['enemy'] },
          },
          enemy: {
            ...s.civilizations['enemy'],
            diplomacy: { ...s.civilizations['enemy'].diplomacy, atWarWith: ['player'] },
          },
        },
      };

      const events: Array<{ reason: string }> = [];
      bus.on('trade:route-ended', e => events.push({ reason: e.reason }));

      s = scrubStaleForeignRoutes(s, bus); // same function called each turn in processTurn

      expect(s.marketplace!.tradeRoutes).toHaveLength(0);
      expect(events[0].reason).toBe('war-declared');
    });

    it('unit-loss: removeRouteForUnit unit-died terminates route + caravan cleared', () => {
      const state = makeMinimalState();
      const bus = new EventBus();
      let s = establishRoute(state, 'caravan1', 'city3', bus, 0);
      const routeId = s.units['caravan1'].committedToRouteId!;
      const events: Array<{ reason: string }> = [];
      bus.on('trade:route-ended', e => events.push({ reason: e.reason }));

      s = removeRouteForUnit(s, 'caravan1', bus, 'unit-died', routeId);

      expect(s.marketplace!.tradeRoutes).toHaveLength(0);
      expect(s.units['caravan1']?.committedToRouteId).toBeUndefined();
      expect(events[0].reason).toBe('unit-died');
    });
  });

  describe('S6b — physical caravan movement', () => {
    function makeS6bState(overrides: {
      caravanPos?: { q: number; r: number };
      routeDirection?: 'outbound' | 'inbound';
      tripsRemaining?: number;
      atWarWith?: string[];
      extraUnits?: Record<string, any>;
      mountainAt?: { q: number; r: number };
      extraRoutes?: any[];
      extraCaravans?: Record<string, any>;
      caravanOwner?: string;
    } = {}): GameState {
      const base = makeMinimalState({
        caravanPos: overrides.caravanPos ?? { q: 0, r: 0 },
        atWarWith: overrides.atWarWith ?? [],
      });

      const route = {
        id: 'route1',
        fromCityId: 'city1',
        toCityId: 'city2',
        goldPerTrip: 10,
        turnsPerTrip: 3,
      };

      const caravan: any = {
        ...base.units['caravan1'],
        id: 'caravan1',
        owner: overrides.caravanOwner ?? 'player',
        committedToRouteId: 'route1',
        routeDirection: overrides.routeDirection,
        tripsRemaining: overrides.tripsRemaining ?? 3,
        movementPointsLeft: 0,
        hasActed: true,
      };

      const units: Record<string, any> = { caravan1: caravan, ...overrides.extraUnits };
      if (overrides.extraCaravans) {
        Object.assign(units, overrides.extraCaravans);
      }

      const tradeRoutes = [route, ...(overrides.extraRoutes ?? [])];

      let civilizations = base.civilizations;
      if (overrides.caravanOwner === 'enemy') {
        civilizations = {
          ...base.civilizations,
          enemy: { ...base.civilizations['enemy'], units: ['caravan1'] },
          player: { ...base.civilizations['player'], units: [] },
        };
      }

      let tiles = base.map.tiles;
      if (overrides.mountainAt) {
        const { q, r } = overrides.mountainAt;
        tiles = {
          ...tiles,
          [`${q},${r}`]: { q, r, terrain: 'mountain', resources: [], improvement: null, featureOverlay: null } as any,
        };
      }

      return {
        ...base,
        civilizations,
        units,
        map: { ...base.map, tiles },
        marketplace: { ...base.marketplace, tradeRoutes },
      } as any;
    }

    it('advances caravan one step per turn toward toCityId', () => {
      const state = makeS6bState({ caravanPos: { q: 0, r: 0 } });
      const result = advanceRouteRunners(state);
      const caravan = result.units['caravan1']!;
      expect(caravan.position.q).toBeGreaterThan(0);
    });

    it('flips routeDirection to inbound on arrival at toCityId', () => {
      const state = makeS6bState({
        caravanPos: { q: 2, r: 0 },
        routeDirection: 'outbound',
        tripsRemaining: 3,
      });
      const result = advanceRouteRunners(state);
      const caravan = result.units['caravan1']!;
      expect(caravan.routeDirection).toBe('inbound');
      expect(caravan.tripsRemaining).toBe(3);
    });

    it('flips routeDirection to outbound and decrements tripsRemaining on arrival at fromCityId', () => {
      const state = makeS6bState({
        caravanPos: { q: 0, r: 0 },
        routeDirection: 'inbound',
        tripsRemaining: 3,
      });
      const result = advanceRouteRunners(state);
      const caravan = result.units['caravan1']!;
      expect(caravan.routeDirection).toBe('outbound');
      expect(caravan.tripsRemaining).toBe(2);
    });

    it('removes caravan and route with trips-exhausted when tripsRemaining reaches 0', () => {
      const state = makeS6bState({
        caravanPos: { q: 0, r: 0 },
        routeDirection: 'inbound',
        tripsRemaining: 1,
      });
      const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as any;
      const result = advanceRouteRunners(state, bus);

      expect(result.units['caravan1']).toBeUndefined();
      expect(result.marketplace!.tradeRoutes).toHaveLength(0);
      expect(bus.emit).toHaveBeenCalledWith('trade:route-ended', expect.objectContaining({
        routeId: 'route1',
        reason: 'trips-exhausted',
      }));
    });

    it('blocks caravan movement and emits warning when at-war unit occupies path[1]', () => {
      const enemyUnit = {
        id: 'enemy-warrior',
        type: 'warrior',
        owner: 'enemy',
        position: { q: 1, r: 0 },
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
      };
      const state = makeS6bState({
        caravanPos: { q: 0, r: 0 },
        routeDirection: 'outbound',
        atWarWith: ['enemy'],
        extraUnits: { 'enemy-warrior': enemyUnit as any },
      });
      const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as any;
      const result = advanceRouteRunners(state, bus);

      expect(result.units['caravan1']!.position).toEqual({ q: 0, r: 0 });
      expect(bus.emit).toHaveBeenCalledWith('notification:show', expect.objectContaining({ type: 'warning' }));
    });

    it('does NOT block caravan when non-war unit occupies path[1]', () => {
      const neutralUnit = {
        id: 'neutral-warrior',
        type: 'warrior',
        owner: 'neutral',
        position: { q: 1, r: 0 },
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
      };
      const state = makeS6bState({
        caravanPos: { q: 0, r: 0 },
        routeDirection: 'outbound',
        atWarWith: [],
        extraUnits: { 'neutral-warrior': neutralUnit as any },
      });
      const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as any;
      const result = advanceRouteRunners(state, bus);

      expect(result.units['caravan1']!.position.q).toBeGreaterThan(0);
      expect(bus.emit).not.toHaveBeenCalledWith('notification:show', expect.anything());
    });

    it('navigates around an impassable mountain tile', () => {
      const state = makeS6bState({
        caravanPos: { q: 0, r: 0 },
        mountainAt: { q: 1, r: 0 },
      });
      const result = advanceRouteRunners(state);
      const caravan = result.units['caravan1']!;
      expect(caravan.position).not.toEqual({ q: 1, r: 0 });
      expect(caravan.position).not.toEqual({ q: 0, r: 0 });
    });

    it('advances two concurrent routes independently', () => {
      const route2 = { id: 'route2', fromCityId: 'city1', toCityId: 'city2', goldPerTrip: 10, turnsPerTrip: 3 };
      const caravan2: any = {
        id: 'caravan2', type: 'caravan', owner: 'player',
        position: { q: 0, r: 0 },
        committedToRouteId: 'route2',
        routeDirection: undefined,
        tripsRemaining: 3,
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
      };
      const state = makeS6bState({
        caravanPos: { q: 0, r: 0 },
        extraCaravans: { caravan2 },
        extraRoutes: [route2],
      });
      const result = advanceRouteRunners(state);

      expect(result.units['caravan1']!.position.q).toBeGreaterThan(0);
      expect(result.units['caravan2']!.position.q).toBeGreaterThan(0);
    });

    it('advances AI-owned caravan identically to player-owned caravan (actor-complete)', () => {
      const state = makeS6bState({
        caravanPos: { q: 0, r: 0 },
        caravanOwner: 'enemy',
      });
      const result = advanceRouteRunners(state);
      expect(result.units['caravan1']!.position.q).toBeGreaterThan(0);
    });

    it('Trade Routes Overhaul (#553 MR1/4): naval route runner crosses water toward toCityId (not stuck on land-only pathing)', () => {
      let state = makeS6bState({ caravanPos: { q: 0, r: 0 } });
      // Cut a water column between city1 (q=0) and city2 (q=2), same shape as the
      // domain-generic pathfinding describe block above.
      const tiles = { ...state.map.tiles };
      for (let r = 0; r < 5; r++) {
        tiles[`1,${r}`] = { coord: { q: 1, r }, terrain: 'ocean', rivers: [], improvement: null, owner: null, resource: null, wonder: null } as any;
      }
      state = {
        ...state,
        map: { ...state.map, tiles },
        units: { ...state.units, caravan1: { ...state.units['caravan1'], type: 'naval_trader' } },
      } as any;

      const result = advanceRouteRunners(state);
      const runner = result.units['caravan1']!;
      // A hardcoded-'land' runner would find no path across the water column and never
      // move (position stays q=0); the domain-aware fix must step it toward city2.
      expect(runner.position.q).toBeGreaterThan(0);
    });
  });
});
