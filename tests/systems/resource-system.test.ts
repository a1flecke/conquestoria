import { calculateCityYields } from '@/systems/resource-system';
import type { GameMap } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { foundCity } from '@/systems/city-system';

describe('calculateCityYields', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'resource-test');
  });

  it('calculates positive food yield', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const yields = calculateCityYields(city, map);
    expect(yields.food).toBeGreaterThan(0);
  });

  it('calculates yields from owned tiles', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const yields = calculateCityYields(city, map);
    expect(yields.food + yields.production + yields.gold + yields.science).toBeGreaterThan(0);
  });

  it('includes building yields', () => {
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const cityWithBuildings = { ...city, buildings: ['granary'] };
    const withoutBuilding = calculateCityYields(city, map);
    const withBuilding = calculateCityYields(cityWithBuildings, map);
    expect(withBuilding.food).toBeGreaterThan(withoutBuilding.food);
  });
});
