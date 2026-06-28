import { describe, expect, it } from 'vitest';
import { drawNextCityName } from '@/systems/city-name-system';

describe('city-name-system', () => {
  it('assigns fantasy civ city names from civ-appropriate pools', () => {
    expect(drawNextCityName('lothlorien', new Set())).toMatch(/Caras|Lorien|Galadh/);
  });

  it('avoids duplicate global city names unless a deliberate lore exception exists', () => {
    const used = new Set(['Rome']);

    expect(drawNextCityName('rome', used, {
      namingPool: ['Rome', 'Ostia', 'Ravenna'],
      civName: 'Rome',
    })).not.toBe('Rome');
  });

  it('uses thematic prefix fallback instead of numbers when pool is exhausted', () => {
    // All 3 pool names used, expect "New Rome" not "Rome 2"
    const used = new Set(['Rome', 'Ostia', 'Ravenna']);
    const result = drawNextCityName('rome', used, {
      namingPool: ['Rome', 'Ostia', 'Ravenna'],
      civName: 'Rome',
    });
    expect(result).toBe('New Rome');
    expect(result).not.toMatch(/\d/);
  });

  it('falls back to numbered suffix only after all thematic prefixes are also exhausted', () => {
    const pool = ['Rome'];
    const prefixes = ['New', 'Old', 'Greater', 'North', 'South', 'East', 'West', 'Upper', 'Lower', 'Inner'];
    const used = new Set(['Rome', ...prefixes.map(p => `${p} Rome`)]);
    const result = drawNextCityName('rome', used, { namingPool: pool, civName: 'Rome' });
    expect(result).toBe('Rome 2');
  });
});
