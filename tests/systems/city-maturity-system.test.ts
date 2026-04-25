import { describe, expect, it } from 'vitest';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import {
  applyCityMaturity,
  CITY_MATURITY_DEFINITIONS,
  countCityMaturityTechs,
  resolveCityMaturity,
} from '@/systems/city-maturity-system';

describe('city maturity definitions', () => {
  it('matches the five tech eras and uses odd grid sizes only', () => {
    expect(CITY_MATURITY_DEFINITIONS.map(def => def.id)).toEqual([
      'outpost',
      'village',
      'town',
      'city',
      'metropolis',
    ]);
    expect(CITY_MATURITY_DEFINITIONS.map(def => def.era)).toEqual([1, 2, 3, 4, 5]);
    expect(CITY_MATURITY_DEFINITIONS.map(def => def.gridSize)).toEqual([3, 3, 5, 5, 7]);
  });

  it('requires population and qualifying maturity techs', () => {
    expect(resolveCityMaturity(5, ['early-empire'])).toBe('village');
    expect(resolveCityMaturity(2, ['early-empire', 'engineering'])).toBe('outpost');
    expect(resolveCityMaturity(5, ['early-empire', 'engineering'])).toBe('town');
  });

  it('does not allow early-era tech volume to unlock late maturity', () => {
    const earlyTechs = ['early-empire', 'state-workforce', 'crop-rotation', 'granary-design'];
    expect(countCityMaturityTechs(earlyTechs)).toBeGreaterThanOrEqual(4);
    expect(resolveCityMaturity(12, earlyTechs)).toBe('village');
  });

  it('allows explicit era-five city maturity metadata to unlock metropolis', () => {
    expect(resolveCityMaturity(12, ['early-empire', 'engineering', 'medicine', 'global-logistics'])).toBe('metropolis');
  });

  it('applies maturity grid size from population plus qualifying techs', () => {
    const map = generateMap(30, 30, 'city-maturity-apply');
    const city = foundCity('player', { q: 15, r: 15 }, map);
    const result = applyCityMaturity({ ...city, population: 5 }, ['early-empire', 'engineering']);
    expect(result.changed).toBe(true);
    expect(result.previous).toBe('outpost');
    expect(result.current).toBe('town');
    expect(result.city.gridSize).toBe(5);
  });
});
