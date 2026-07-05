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
    expect(getSettlerProductionCost(1)).toBe(16);
    expect(getSettlerProductionCost(2)).toBe(24);
    expect(getSettlerProductionCost(3)).toBe(40);
    expect(getSettlerProductionCost(4)).toBe(48);
    expect(getSettlerProductionCost(5)).toBe(56);
    expect(getSettlerProductionCost(99)).toBe(56);
  });

  it('treats invalid Settler era input as Era 1 instead of returning undefined', () => {
    expect(getSettlerProductionCost(Number.NaN)).toBe(16);
  });

  it('uses the current era for Settler catalog cost and raw cost for other units', () => {
    expect(getCatalogProductionCost('settler', 1)).toBe(16);
    expect(getCatalogProductionCost('settler', 4)).toBe(48);
    expect(getCatalogProductionCost('worker', 4)).toBe(12);
  });

  it('applies Safehouse discounts only to spy units after resolving the canonical base cost', () => {
    const cityWithSafehouse = { buildings: ['safehouse'] };
    const cityWithoutSafehouse = { buildings: [] };

    expect(getProductionCostForItem('spy_scout', { city: cityWithSafehouse, era: 1 })).toBe(23);
    expect(getProductionCostForItem('spy_scout', { city: cityWithoutSafehouse, era: 1 })).toBe(30);
    expect(getProductionCostForItem('settler', { city: cityWithSafehouse, era: 2 })).toBe(24);
  });

  it('keeps trainable unit costs aligned with unit definitions', () => {
    for (const unit of TRAINABLE_UNITS) {
      expect(UNIT_DEFINITIONS[unit.type].productionCost).toBe(unit.cost);
    }
  });

  it('applies vaulted-ceilings -10% to a 100-cost building', () => {
    expect(BUILDINGS.observatory.productionCost).toBe(100);
    expect(getProductionCostForItem('observatory', { completedTechs: ['vaulted-ceilings'] })).toBe(90);
    expect(getProductionCostForItem('observatory', { completedTechs: [] })).toBe(100);
  });

  it('does not apply the buildings-only vaulted-ceilings discount to units', () => {
    const baseline = getProductionCostForItem('settler', { era: 1 });
    expect(getProductionCostForItem('settler', { era: 1, completedTechs: ['vaulted-ceilings'] })).toBe(baseline);
  });

  it('stacks vaulted-ceilings multiplicatively with the masonry-works walls discount', () => {
    expect(BUILDINGS.walls.productionCost).toBe(60);
    const cost = getProductionCostForItem('walls', {
      city: { buildings: ['masonry-works'] },
      completedTechs: ['vaulted-ceilings'],
    });
    expect(cost).toBe(Math.ceil(60 * 0.8 * 0.9));
  });

  it('applies cannon-casting -15% only to cannon', () => {
    const withoutTech = getProductionCostForItem('cannon', {});
    const withTech = getProductionCostForItem('cannon', { completedTechs: ['cannon-casting'] });
    expect(withTech).toBe(Math.ceil(withoutTech * 0.85));
    expect(getProductionCostForItem('catapult', { completedTechs: ['cannon-casting'] })).toBe(getProductionCostForItem('catapult', {}));
  });

  it('applies manifest-destiny -20% only to settlers', () => {
    const baseline = getProductionCostForItem('settler', { era: 3 });
    expect(getProductionCostForItem('settler', { era: 3, completedTechs: ['manifest-destiny'] })).toBe(Math.ceil(baseline * 0.8));
    expect(getProductionCostForItem('worker', { era: 3, completedTechs: ['manifest-destiny'] })).toBe(getProductionCostForItem('worker', { era: 3 }));
  });
});
