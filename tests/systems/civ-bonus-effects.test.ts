import { describe, it, expect } from 'vitest';
import { calculateCityYields } from '@/systems/resource-system';
import { applyProductionBonus } from '@/systems/city-system';
import type { City, GameMap, CivBonusEffect } from '@/core/types';

function makeCity(overrides?: Partial<City>): City {
  return {
    id: 'city-1', name: 'Test City', owner: 'p1',
    position: { q: 0, r: 0 }, population: 3,
    ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    workedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    focus: 'balanced',
    maturity: 'outpost',
    buildings: [], productionQueue: [], productionProgress: 0,
    food: 0, foodNeeded: 15,
    grid: [[null]], gridSize: 3,
    ...overrides,
  } as City;
}

function makeMap(tiles: Record<string, { terrain: string; improvement?: string; improvementTurnsLeft?: number }>): GameMap {
  // Convert to the expected tile format
  const fullTiles: Record<string, any> = {};
  for (const [key, t] of Object.entries(tiles)) {
    const [q, r] = key.split(',').map(Number);
    fullTiles[key] = {
      terrain: t.terrain,
      improvement: t.improvement ?? 'none',
      improvementTurnsLeft: t.improvementTurnsLeft ?? 0,
      coord: { q, r },
      resource: null,
      wonder: null,
    };
  }
  return { tiles: fullTiles } as unknown as GameMap;
}

describe('civ bonus effects', () => {
  describe('Russia tundra_bonus', () => {
    it('adds food and production per tundra tile', () => {
      const bonus: CivBonusEffect = { type: 'tundra_bonus', foodBonus: 1, productionBonus: 1 };
      const city = makeCity({
        position: { q: 2, r: 0 },
        ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
        workedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      });
      const map = makeMap({
        '0,0': { terrain: 'tundra' },
        '1,0': { terrain: 'plains' },
      });
      const base = calculateCityYields(city, map);
      const boosted = calculateCityYields(city, map, bonus);
      expect(boosted.food).toBe(base.food + 1); // 1 tundra tile
      expect(boosted.production).toBe(base.production + 1);
    });
  });

  describe('Shire peaceful_growth', () => {
    it('adds flat food bonus', () => {
      const bonus: CivBonusEffect = { type: 'peaceful_growth', foodBonus: 2, militaryPenalty: 0.25 };
      const city = makeCity();
      const map = makeMap({ '0,0': { terrain: 'plains' }, '1,0': { terrain: 'plains' } });
      const base = calculateCityYields(city, map);
      const boosted = calculateCityYields(city, map, bonus);
      expect(boosted.food).toBe(base.food + 2);
    });

    it('penalizes military production cost', () => {
      const bonus: CivBonusEffect = { type: 'peaceful_growth', foodBonus: 2, militaryPenalty: 0.25 };
      const baseCost = applyProductionBonus('warrior', undefined);
      const penalizedCost = applyProductionBonus('warrior', bonus);
      expect(penalizedCost).toBeGreaterThan(baseCost);
    });
  });
});
