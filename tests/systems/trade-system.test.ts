import { describe, it, expect } from 'vitest';
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
} from '@/systems/trade-system';
import { TECH_TREE } from '@/systems/tech-definitions';

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
    it('sums gold from all routes', () => {
      const routes = [
        { fromCityId: 'c1', toCityId: 'c2', goldPerTurn: 3 },
        { fromCityId: 'c1', toCityId: 'c3', goldPerTurn: 5 },
      ];
      expect(processTradeRouteIncome(routes)).toBe(8);
    });

    it('returns 0 for empty routes', () => {
      expect(processTradeRouteIncome([])).toBe(0);
    });
  });
});
