import { describe, it, expect } from 'vitest';
import { UNIT_DEFINITIONS, getMovementCost, moveUnit, createUnit } from '@/systems/unit-system';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';

describe('playtest bugfixes', () => {
  it('archer unit exists and is gated by archery tech (#34)', () => {
    expect(UNIT_DEFINITIONS.archer).toBeDefined();
    expect(UNIT_DEFINITIONS.archer.strength).toBeGreaterThan(0);
    const trainable = TRAINABLE_UNITS.find(u => u.type === 'archer');
    expect(trainable).toBeDefined();
    expect(trainable!.techRequired).toBe('archery');
  });

  it('movement deducts correct terrain cost (#27)', () => {
    const unit = createUnit('warrior', 'player', { q: 0, r: 0 });
    const moved = moveUnit(unit, { q: 1, r: 0 }, 2); // forest cost
    expect(moved.movementPointsLeft).toBe(0); // 2 - 2 = 0
  });

  it('getMovementCost returns correct values for terrain types (#27)', () => {
    expect(getMovementCost('grassland')).toBe(1);
    expect(getMovementCost('plains')).toBe(1);
    expect(getMovementCost('forest')).toBe(2);
    expect(getMovementCost('hills')).toBe(2);
    expect(getMovementCost('mountain')).toBe(Infinity);
  });

  it('granary requires granary-design tech (#19)', () => {
    expect(BUILDINGS.granary.techRequired).toBe('granary-design');
  });
});
