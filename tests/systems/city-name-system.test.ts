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
});
