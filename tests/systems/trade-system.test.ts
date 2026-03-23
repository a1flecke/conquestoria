import { describe, it, expect } from 'vitest';
import {
  RESOURCE_DEFINITIONS,
  BASE_PRICES,
  createMarketplaceState,
  calculatePrice,
  detectMonopoly,
  calculateTradeRouteGold,
  updatePrices,
  processFashionCycle,
  processTradeRouteIncome,
} from '@/systems/trade-system';

describe('trade-system', () => {
  describe('RESOURCE_DEFINITIONS', () => {
    it('defines 10 resources (6 luxury + 4 strategic)', () => {
      expect(RESOURCE_DEFINITIONS).toHaveLength(10);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury')).toHaveLength(6);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'strategic')).toHaveLength(4);
    });

    it('each resource has a positive base price', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(r.basePrice).toBeGreaterThan(0);
      }
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
