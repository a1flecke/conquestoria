import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  TRAINABLE_UNITS,
  getCatalogProductionCost,
  getProductionCostForItem,
  getSettlerProductionCost,
} from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('production cost catalog', () => {
  it('keeps Herbalist in the Era 1 starter window for a new capital', () => {
    expect(BUILDINGS.herbalist.productionCost).toBe(16);
    expect(BUILDINGS.herbalist.pacing?.band).toBe('starter');
    expect(getCatalogProductionCost('herbalist', 1)).toBe(16);
  });

  it('scales Settler cost upward by era as cities get more complex', () => {
    expect(getSettlerProductionCost(1)).toBe(24);
    expect(getSettlerProductionCost(2)).toBe(32);
    expect(getSettlerProductionCost(3)).toBe(40);
    expect(getSettlerProductionCost(4)).toBe(48);
    expect(getSettlerProductionCost(5)).toBe(56);
    expect(getSettlerProductionCost(99)).toBe(56);
  });

  it('uses the current era for Settler catalog cost and raw cost for other units', () => {
    expect(getCatalogProductionCost('settler', 1)).toBe(24);
    expect(getCatalogProductionCost('settler', 4)).toBe(48);
    expect(getCatalogProductionCost('worker', 4)).toBe(12);
  });

  it('applies Safehouse discounts only to spy units after resolving the canonical base cost', () => {
    const cityWithSafehouse = { buildings: ['safehouse'] };
    const cityWithoutSafehouse = { buildings: [] };

    expect(getProductionCostForItem('spy_scout', { city: cityWithSafehouse, era: 1 })).toBe(23);
    expect(getProductionCostForItem('spy_scout', { city: cityWithoutSafehouse, era: 1 })).toBe(30);
    expect(getProductionCostForItem('settler', { city: cityWithSafehouse, era: 2 })).toBe(32);
  });

  it('keeps trainable unit costs aligned with unit definitions', () => {
    for (const unit of TRAINABLE_UNITS) {
      expect(UNIT_DEFINITIONS[unit.type].productionCost).toBe(unit.cost);
    }
  });
});
