import { describe, it, expect } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { getCivDefinition } from '@/systems/civ-definitions';

const hotSeatConfig = (civType1: string, civType2: string) => ({
  playerCount: 2,
  mapSize: 'small' as const,
  players: [
    { slotId: 'p1', name: 'Alice', civType: civType1, isHuman: true },
    { slotId: 'p2', name: 'Bob', civType: civType2, isHuman: true },
  ],
});

describe('hot-seat first player city names (#83)', () => {
  it('France founds Paris first, not Alexandria', () => {
    const state = createHotSeatGame(hotSeatConfig('france', 'zulu'), 'test-83');
    const settler = Object.values(state.units).find(u => u.owner === 'p1' && u.type === 'settler')!;
    const def = getCivDefinition('france');
    const city = foundCity('p1', settler.position, state.map, {
      civType: 'france',
      namingPool: def?.cityNames,
      civName: def?.name,
      usedNames: collectUsedCityNames(state),
    });
    expect(city.name).toBe('Paris');
    expect(city.name).not.toBe('Alexandria');
  });

  it('Zulu founds Ulundi first, not Egyptian/Greek names', () => {
    const state = createHotSeatGame(hotSeatConfig('zulu', 'egypt'), 'test-84');
    const settler = Object.values(state.units).find(u => u.owner === 'p1' && u.type === 'settler')!;
    const def = getCivDefinition('zulu');
    const city = foundCity('p1', settler.position, state.map, {
      civType: 'zulu',
      namingPool: def?.cityNames,
      civName: def?.name,
      usedNames: collectUsedCityNames(state),
    });
    expect(city.name).toBe('Ulundi');
  });
});
